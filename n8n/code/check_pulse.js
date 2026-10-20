const raw = String($json.text ?? $json.output ?? $json.response ?? '').trim();
if (!raw) {
  throw new Error('Pulse LLM returned no text. Check the LLM node output and try again.');
}

const pulse = raw
  .replace(/^```(?:markdown|md)?\s*/i, '')
  .replace(/\s*```$/, '')
  .trim();

const lines = pulse.split('\n');
const words = pulse
  .split(/\s+/)
  .filter((token) => token.replace(/[#*_`>-]/g, '').length > 0).length;

if (words > 250) {
  throw new Error('The pulse is ' + words + ' words; the limit is 250. Your output was ' + words + ' words. Rewrite in 220 words or fewer.');
}

const sections = ['Top Themes', 'What Users Are Saying', 'Key Observation', 'Action Ideas'];
for (const title of sections) {
  const found = lines.some((line) => {
    const match = line.match(/^#{1,6}\s+(.*)$/);
    return match && match[1].trim().toLowerCase().startsWith(title.toLowerCase());
  });
  if (!found) {
    throw new Error('The pulse is missing the section "## ' + title + '".');
  }
}

const actionStart = lines.findIndex((line) => {
  const match = line.match(/^#{1,6}\s+(.*)$/);
  return match && match[1].trim().toLowerCase().startsWith('action ideas');
});
const actionLines = [];
for (let i = actionStart + 1; i < lines.length; i += 1) {
  if (/^#{1,6}\s+/.test(lines[i])) break;
  actionLines.push(lines[i]);
}
const numbered = actionLines.filter((line) => /^\s*\d+[.)]\s+/.test(line));
if (numbered.length !== 3) {
  throw new Error('Action Ideas has ' + numbered.length + ' numbered items; exactly 3 are required.');
}

const insights = $('Check Insights').first().json;
const quotes = Array.isArray(insights.quotes) ? insights.quotes : [];
if (quotes.length !== 3) {
  throw new Error('Check Insights did not return 3 quotes, so the pulse cannot be verified.');
}
quotes.forEach((quote, i) => {
  if (!pulse.includes(String(quote.text))) {
    throw new Error('Quote ' + (i + 1) + ' (review_id ' + quote.review_id + ') from insights is missing or altered in the pulse.');
  }
});

return [{ json: { pulse, word_count: words } }];
