import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const pulsePath = path.join(projectRoot, 'outputs', 'weekly_pulse.md');
const insightsPath = path.join(projectRoot, 'outputs', 'insights.json');

const MAX_WORDS = 250;
const REQUIRED_SECTIONS = ['Top Themes', 'What Users Are Saying', 'Key Observation', 'Action Ideas'];
const NUMBERED_ITEM = /^\s*\d+[.)]\s+/;

function setupError(message) {
  console.error(`SETUP ERROR: ${message}`);
  process.exit(1);
}

function checkFailed(reason) {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

function countWords(text) {
  return text
    .split(/\s+/)
    .filter((token) => token.replace(/[#*_`>-]/g, '').length > 0).length;
}

function stripCodeFences(text) {
  return text
    .replace(/^\uFEFF?```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function getSectionLines(lines, title) {
  const start = lines.findIndex((line) => {
    const match = line.match(/^#{1,6}\s+(.*)$/);
    return match && match[1].trim().toLowerCase().startsWith(title.toLowerCase());
  });
  if (start === -1) return null;
  const section = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,6}\s+/.test(lines[i])) break;
    section.push(lines[i]);
  }
  return section;
}

if (!fs.existsSync(pulsePath)) {
  setupError(`${pulsePath} not found. Save the pulse as a Markdown file there.`);
}
if (!fs.existsSync(insightsPath)) {
  setupError(`${insightsPath} not found. Run "node scripts/verify_insights.js" first, then save the pulse.`);
}

const pulseText = fs.readFileSync(pulsePath, 'utf8').replace(/\r\n/g, '\n');
const pulseLines = pulseText.split('\n');

let insights;
try {
  insights = JSON.parse(stripCodeFences(fs.readFileSync(insightsPath, 'utf8')));
} catch (err) {
  setupError(`outputs/insights.json could not be parsed: ${err.message}. Run "node scripts/verify_insights.js" first.`);
}

const words = countWords(pulseText);
if (words > MAX_WORDS) {
  console.error(`FAIL: the pulse is ${words} words; the limit is ${MAX_WORDS}.`);
  console.error(`Your output was ${words} words. Rewrite in 220 words or fewer.`);
  process.exit(1);
}

for (const title of REQUIRED_SECTIONS) {
  if (getSectionLines(pulseLines, title) === null) {
    checkFailed(`missing section "## ${title}"`);
  }
}

const actionLines = getSectionLines(pulseLines, 'Action Ideas') || [];
const numbered = actionLines.filter((line) => NUMBERED_ITEM.test(line));
if (numbered.length !== 3) {
  checkFailed(`Action Ideas has ${numbered.length} numbered items; exactly 3 are required`);
}

const quotes = Array.isArray(insights.quotes) ? insights.quotes : [];
if (quotes.length === 0) checkFailed('insights.json has no quotes to compare against');
quotes.forEach((quote, i) => {
  if (!quote || typeof quote.text !== 'string' || quote.text.trim() === '') {
    checkFailed(`insights.json quote ${i + 1} has no text`);
  }
  if (!pulseText.includes(quote.text)) {
    const where = quote.review_id ? ` (review_id ${quote.review_id})` : '';
    checkFailed(`quote ${i + 1}${where} from insights.json is missing or altered in the pulse`);
  }
});

console.log(`PASS: word count ${words} (limit ${MAX_WORDS})`);
console.log(`PASS: all ${REQUIRED_SECTIONS.length} sections present`);
console.log('PASS: exactly 3 numbered action items');
console.log(`PASS: all ${quotes.length} quotes appear word for word`);
console.log('All pulse checks passed.');
