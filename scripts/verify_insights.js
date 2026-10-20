import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const csvPath = path.join(projectRoot, 'data', 'reviews_clean.csv');
const insightsPath = path.join(projectRoot, 'outputs', 'insights.json');

const MAX_THEMES = 5;
const TOP_THEMES = 3;
const QUOTE_COUNT = 3;
const MIN_FEE_IDS = 3;

function setupError(message) {
  console.error(`SETUP ERROR: ${message}`);
  process.exit(1);
}

function checkFailed(reason) {
  console.error(`FAIL: ${reason}`);
  console.error(`Previous output failed: ${reason}. Copy quotes character for character.`);
  process.exit(1);
}

function stripCodeFences(text) {
  return text
    .replace(/^\uFEFF?```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function loadCsvRows() {
  if (!fs.existsSync(csvPath)) {
    setupError(`${csvPath} not found. Run "npm run clean" first (or save your cleaned CSV there).`);
  }
  try {
    return parse(fs.readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, bom: true });
  } catch (err) {
    setupError(`data/reviews_clean.csv could not be parsed: ${err.message}`);
  }
}

function loadInsights() {
  if (!fs.existsSync(insightsPath)) {
    setupError(`${insightsPath} not found. Save the LLM's insights JSON response there.`);
  }
  const raw = fs.readFileSync(insightsPath, 'utf8');
  try {
    return JSON.parse(stripCodeFences(raw));
  } catch (err) {
    checkFailed(`the file is not valid JSON (${err.message})`);
  }
}

const rows = loadCsvRows();
const allText = rows.map((row) => row.text).join('\n');
const validIds = new Set(rows.map((row) => row.review_id));
const insights = loadInsights();

if (!insights || typeof insights !== 'object') checkFailed('the output is not a JSON object');
if (!Array.isArray(insights.themes)) checkFailed('"themes" must be an array');
if (insights.themes.length > MAX_THEMES) {
  checkFailed(`themes has ${insights.themes.length} entries; the limit is ${MAX_THEMES}`);
}
if (!Array.isArray(insights.top_themes) || insights.top_themes.length !== TOP_THEMES) {
  checkFailed(`top_themes must have exactly ${TOP_THEMES} entries`);
}
if (!Array.isArray(insights.quotes)) checkFailed('"quotes" must be an array');
if (insights.quotes.length !== QUOTE_COUNT) {
  checkFailed(`quotes has ${insights.quotes.length} entries; exactly ${QUOTE_COUNT} are required`);
}

insights.quotes.forEach((quote, i) => {
  const label = `quote ${i + 1}`;
  if (!quote || typeof quote.text !== 'string' || quote.text.trim() === '') {
    checkFailed(`${label} has no text`);
  }
  if (!allText.includes(quote.text)) {
    const where = quote.review_id ? ` (review_id ${quote.review_id})` : '';
    checkFailed(`${label}${where} is not found word for word in data/reviews_clean.csv`);
  }
});

const fee = insights.fee_issue;
if (!fee || typeof fee !== 'object') checkFailed('"fee_issue" is missing');
if (fee.found === true) {
  const ids = Array.isArray(fee.supporting_review_ids) ? fee.supporting_review_ids : [];
  if (ids.length < MIN_FEE_IDS) {
    checkFailed(`fee_issue has ${ids.length} supporting review_ids; at least ${MIN_FEE_IDS} are required`);
  }
  const missing = ids.filter((id) => !validIds.has(String(id)));
  if (missing.length > 0) {
    checkFailed(`fee_issue supporting review_ids not found in the CSV: ${missing.join(', ')}`);
  }
} else if (fee.found === false) {
  console.log('NOTE: fee_issue.found is false. The Phase 2 acceptance test expects 1 fee issue backed by at least 3 real review IDs if the reviews contain one.');
} else {
  checkFailed('fee_issue.found must be true or false');
}

console.log(`PASS: themes ${insights.themes.length} (limit ${MAX_THEMES})`);
console.log(`PASS: top_themes ${insights.top_themes.length}`);
console.log(`PASS: ${QUOTE_COUNT} quotes found word for word in data/reviews_clean.csv`);
if (fee.found === true) {
  console.log(`PASS: fee issue backed by ${fee.supporting_review_ids.length} review IDs, all exist in the CSV`);
}
console.log('All insights checks passed.');
