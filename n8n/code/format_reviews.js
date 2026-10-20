const MAX_ROWS = 300;
const CHARGE_WORD = /\b(charge|billing|subscription|refund|price|renew|plus|paid)\b/i;

const rows = $input.all().map((item) => item.json);

const seenIds = new Set();
const seenTexts = new Set();
const valid = [];

for (const row of rows) {
  const reviewId = String(row.review_id ?? '').trim();
  const text = String(row.text ?? '').replace(/\s+/g, ' ').trim();
  const rating = Number(row.rating);
  const date = String(row.date ?? '').trim().slice(0, 10);
  if (!reviewId || !text || !date || !Number.isFinite(rating)) continue;
  if (seenIds.has(reviewId) || seenTexts.has(text)) continue;
  seenIds.add(reviewId);
  seenTexts.add(text);
  valid.push({ review_id: reviewId, rating, date, text });
}

const chargeRows = valid.filter((row) => CHARGE_WORD.test(row.text));
const otherRows = valid.filter((row) => !CHARGE_WORD.test(row.text));
const selected = chargeRows.concat(otherRows).slice(0, MAX_ROWS);

const reviews_block = selected
  .map((row) => '[' + row.review_id + '] (' + row.rating + ', ' + row.date + ') ' + row.text)
  .join('\n');
const all_text = selected.map((row) => row.text).join('\n');
const valid_ids = selected.map((row) => row.review_id);
const review_count = selected.length;

return [{ json: { reviews_block, all_text, valid_ids, review_count } }];
