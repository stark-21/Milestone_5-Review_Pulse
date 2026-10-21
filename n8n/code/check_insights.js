const formatNode = $('Format Reviews').first().json;
const raw = String($json.text ?? $json.output ?? $json.response ?? '').trim();
if (!raw) {
  throw new Error('Insights LLM returned no text. Check the LLM node output and try again.');
}

const cleaned = raw
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/, '')
  .trim();

let insights;
try {
  insights = JSON.parse(cleaned);
} catch (err) {
  throw new Error('Insights output is not valid JSON: ' + err.message);
}

if (!insights || typeof insights !== 'object') {
  throw new Error('Insights output is not a JSON object.');
}
if (!Array.isArray(insights.themes)) {
  throw new Error('"themes" must be an array.');
}
if (insights.themes.length > 5) {
  throw new Error('themes has ' + insights.themes.length + ' entries; the limit is 5.');
}
if (!Array.isArray(insights.top_themes) || insights.top_themes.length !== 3) {
  throw new Error('top_themes must have exactly 3 entries.');
}
if (!Array.isArray(insights.quotes)) {
  throw new Error('"quotes" must be an array.');
}
if (insights.quotes.length !== 3) {
  throw new Error('quotes has ' + insights.quotes.length + ' entries; exactly 3 are required.');
}

const allText = String(formatNode.all_text ?? '');
const validIds = new Set(
  Array.isArray(formatNode.valid_ids) ? formatNode.valid_ids.map((id) => String(id)) : [],
);

insights.quotes.forEach((quote, i) => {
  const label = 'quote ' + (i + 1);
  if (!quote || typeof quote.text !== 'string' || quote.text.trim() === '') {
    throw new Error(label + ' has no text.');
  }
  if (!allText.includes(quote.text)) {
    const where = quote.review_id ? ' (review_id ' + quote.review_id + ')' : '';
    throw new Error(label + where + ' is not found word for word in the reviews. Previous output failed: copy quotes character for character.');
  }
});

const fee = insights.fee_issue;
if (!fee || typeof fee !== 'object') {
  throw new Error('"fee_issue" is missing.');
}
if (fee.found === true) {
  const ids = Array.isArray(fee.supporting_review_ids) ? fee.supporting_review_ids.map((id) => String(id)) : [];
  const matched = ids.filter((id) => validIds.has(id));
  fee.supporting_review_ids = matched;
  fee.count = matched.length;
  if (matched.length < 3) {
    throw new Error('fee_issue has ' + matched.length + ' supporting review_ids found in the reviews (of ' + ids.length + ' provided); at least 3 are required.');
  }
} else if (fee.found !== false) {
  throw new Error('fee_issue.found must be true or false.');
}

return [{ json: insights }];
