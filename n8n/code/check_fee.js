const raw = String($json.text ?? $json.output ?? $json.response ?? '').trim();
if (!raw) {
  throw new Error('Fee LLM returned no text. Check the LLM node output and try again.');
}

const cleaned = raw
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/, '')
  .trim();

let fee;
try {
  fee = JSON.parse(cleaned);
} catch (err) {
  throw new Error('Fee Explainer output is not valid JSON: ' + err.message);
}

if (!Array.isArray(fee.bullets) || fee.bullets.length === 0) {
  throw new Error('Fee Explainer must have a "bullets" array with at least 1 bullet.');
}
if (fee.bullets.length > 6) {
  throw new Error('Fee Explainer has ' + fee.bullets.length + ' bullets; the limit is 6.');
}
if (!Array.isArray(fee.source_links) || fee.source_links.length !== 2) {
  const found = Array.isArray(fee.source_links) ? fee.source_links.length : 0;
  throw new Error('Fee Explainer must have exactly 2 source_links; found ' + found + '.');
}

const today = $now.toFormat('yyyy-MM-dd');
if (!fee.last_checked || String(fee.last_checked).trim() === '') {
  throw new Error('Fee Explainer is missing the "last_checked" date.');
}
if (String(fee.last_checked).trim() !== today) {
  throw new Error('last_checked is ' + fee.last_checked + ' but today is ' + today + '.');
}

const banned = ['sorry', 'unfortunately', 'guarantee', 'always', 'never'];
fee.bullets.forEach((bullet, i) => {
  const text = String(bullet ?? '');
  if (!text.trim()) {
    throw new Error('Bullet ' + (i + 1) + ' is empty.');
  }
  for (const word of banned) {
    if (new RegExp('\\b' + word + '\\b', 'i').test(text)) {
      throw new Error('Bullet ' + (i + 1) + ' uses banned wording: "' + word + '". Neutral wording is required.');
    }
  }
});

return [{ json: fee }];
