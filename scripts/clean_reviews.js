import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const rawPath = path.join(dataDir, 'reviews_raw.csv');
const cleanPath = path.join(dataDir, 'reviews_clean.csv');
const samplePath = path.join(dataDir, 'reviews_sample.csv');

const MIN_WORDS = 5;
const WEEKS = 8;
const TRIM_TARGET = 700;
const CHARGE_CAP = 150;
const MIN_ROWS = 200;
const SAMPLE_ROWS = 20;
const CHARGE_WORDS = /\b(?:charge|billing|subscription|refund|price|renew|plus|paid)[a-z]*\b/i;

const HEADER_ALIASES = {
  review_id: ['reviewid', 'id', 'review'],
  date: ['date', 'createdat', 'reviewdate'],
  rating: ['rating', 'score', 'stars'],
  text: ['text', 'content', 'reviewtext', 'body', 'reviewcontent'],
};
const NAME_HEADERS = ['username', 'user', 'author', 'name', 'reviewer', 'reviewername'];

const normalizeHeader = (header) => String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

function maskEmails(text) {
  let count = 0;
  const out = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, () => {
    count += 1;
    return '[EMAIL]';
  });
  return { text: out, count };
}

function maskPhones(text) {
  let count = 0;
  const out = text.replace(/\+?\d[\d\s().-]{5,}\d/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return match;
    const hasSeparator = /[\s().-]/.test(match);
    const startsPlus = /^\+/.test(match.trim());
    if (hasSeparator || startsPlus || digits.length >= 10) {
      count += 1;
      return '[PHONE]';
    }
    return match;
  });
  return { text: out, count };
}

function looksEnglish(text) {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) return false;
  const asciiLetters = letters.filter((ch) => ch.charCodeAt(0) < 128).length;
  return asciiLetters / letters.length >= 0.9;
}

function toIsoDate(raw) {
  const time = Date.parse(raw);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}

function weekKey(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function allocateEven(available, slots) {
  const n = available.length;
  const alloc = available.map(() => 0);
  let left = Math.min(slots, available.reduce((a, b) => a + b, 0));
  let ptr = 0;
  let noProgress = 0;
  while (left > 0 && noProgress < n) {
    const i = ptr % n;
    ptr += 1;
    if (alloc[i] < available[i]) {
      alloc[i] += 1;
      left -= 1;
      noProgress = 0;
    } else {
      noProgress += 1;
    }
  }
  return alloc;
}

function trimRows(rows, target) {
  const weeks = new Map();
  for (const row of rows) {
    const key = weekKey(row.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(row);
  }
  const keys = [...weeks.keys()].sort();

  const chargeByWeek = keys.map((k) => weeks.get(k).filter((row) => CHARGE_WORDS.test(row.text)));
  const nonChargeByWeek = keys.map((k) => weeks.get(k).filter((row) => !CHARGE_WORDS.test(row.text)));
  const chargeTotal = chargeByWeek.reduce((a, list) => a + list.length, 0);
  const chargeTarget = Math.min(CHARGE_CAP, target, chargeTotal);

  const quota = allocateEven(
    keys.map((k) => weeks.get(k).length),
    target,
  );
  const chargeAlloc = allocateEven(
    chargeByWeek.map((list) => list.length),
    chargeTarget,
  );

  const selected = new Set();
  const chargeTake = keys.map((k, i) => Math.min(chargeAlloc[i], quota[i]));
  keys.forEach((k, i) => {
    shuffle(chargeByWeek[i])
      .slice(0, chargeTake[i])
      .forEach((row) => selected.add(row));
  });

  const fillTake = keys.map((k, i) => Math.min(quota[i] - chargeTake[i], nonChargeByWeek[i].length));
  let shortfall =
    keys.reduce((sum, k, i) => sum + (quota[i] - chargeTake[i]), 0) - fillTake.reduce((a, b) => a + b, 0);
  let ptr = 0;
  let noProgress = 0;
  while (shortfall > 0 && noProgress < keys.length) {
    const i = ptr % keys.length;
    ptr += 1;
    if (fillTake[i] < nonChargeByWeek[i].length) {
      fillTake[i] += 1;
      shortfall -= 1;
      noProgress = 0;
    } else {
      noProgress += 1;
    }
  }
  keys.forEach((k, i) => {
    shuffle(nonChargeByWeek[i])
      .slice(0, fillTake[i])
      .forEach((row) => selected.add(row));
  });

  const trimmed = rows.filter((row) => selected.has(row));
  const keptCharge = chargeTake.reduce((a, b) => a + b, 0);
  console.log(
    `Trimming: ${rows.length} rows -> ${trimmed.length} rows (target ${target}). ` +
      `Charge-related kept: ${keptCharge} of ${chargeTotal} (cap ${CHARGE_CAP}), spread across weeks.`,
  );
  return trimmed;
}

function printRowsPerWeek(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = weekKey(row.date);
    const cur = counts.get(key) ?? { rows: 0, charge: 0 };
    cur.rows += 1;
    if (CHARGE_WORDS.test(row.text)) cur.charge += 1;
    counts.set(key, cur);
  }
  console.log(`Rows kept per week (${rows.length} total, newest week first):`);
  for (const key of [...counts.keys()].sort().reverse()) {
    const v = counts.get(key);
    console.log(`  ${key}: ${v.rows} rows (${v.charge} charge-related)`);
  }
}

function main() {
  if (!fs.existsSync(rawPath)) {
    console.error(`ERROR: ${rawPath} not found.`);
    console.error('Either run "npm run collect" first (after filling in the app id),');
    console.error('or save your own public reviews CSV as data/reviews_raw.csv with columns: review_id,date,rating,text');
    process.exit(1);
  }

  const table = parse(fs.readFileSync(rawPath, 'utf8'), {
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });
  if (table.length < 2) {
    console.error('ERROR: data/reviews_raw.csv has no data rows.');
    process.exit(1);
  }

  const headers = table[0].map(normalizeHeader);
  const index = {};
  const missing = [];
  for (const field of Object.keys(HEADER_ALIASES)) {
    const found = headers.findIndex((h) => HEADER_ALIASES[field].includes(h));
    if (found === -1) missing.push(field);
    else index[field] = found;
  }
  if (missing.length > 0) {
    console.error(`ERROR: data/reviews_raw.csv is missing required column(s): ${missing.join(', ')}`);
    console.error(`Columns found: ${table[0].join(', ')}`);
    console.error('Required columns: review_id, date, rating, text');
    process.exit(1);
  }

  const droppedNameColumns = table[0].filter((_, i) => NAME_HEADERS.includes(headers[i]));
  if (droppedNameColumns.length > 0) {
    console.log(`Dropped reviewer name column(s) (not copied to the clean file): ${droppedNameColumns.join(', ')}`);
  }

  const cutoffMs = Date.now() - WEEKS * 7 * 24 * 60 * 60 * 1000;
  const drops = {
    missing_id: 0,
    duplicate_id: 0,
    duplicate_text: 0,
    too_short: 0,
    non_english: 0,
    bad_rating: 0,
    bad_date: 0,
    older_than_12_weeks: 0,
  };
  let maskedEmails = 0;
  let maskedPhones = 0;

  const kept = [];
  const seenIds = new Set();
  const seenTexts = new Set();

  for (const row of table.slice(1)) {
    const review_id = String(row[index.review_id] ?? '').trim();
    if (!review_id) {
      drops.missing_id += 1;
      continue;
    }
    if (seenIds.has(review_id)) {
      drops.duplicate_id += 1;
      continue;
    }

    const originalText = String(row[index.text] ?? '').replace(/\s+/g, ' ').trim();
    if (seenTexts.has(originalText) && originalText.length > 0) {
      drops.duplicate_text += 1;
      continue;
    }

    const rating = Number(String(row[index.rating] ?? '').trim());
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      drops.bad_rating += 1;
      continue;
    }

    const dateRaw = String(row[index.date] ?? '').trim();
    const isoDate = toIsoDate(dateRaw);
    if (!isoDate) {
      drops.bad_date += 1;
      continue;
    }
    if (Date.parse(dateRaw) < cutoffMs) {
      drops.older_than_12_weeks += 1;
      continue;
    }

    const emailResult = maskEmails(originalText);
    const phoneResult = maskPhones(emailResult.text);
    const text = phoneResult.text.trim();
    maskedEmails += emailResult.count;
    maskedPhones += phoneResult.count;

    if (!looksEnglish(text)) {
      drops.non_english += 1;
      continue;
    }
    if (countWords(text) < MIN_WORDS) {
      drops.too_short += 1;
      continue;
    }

    seenIds.add(review_id);
    if (originalText.length > 0) seenTexts.add(originalText);
    kept.push({ review_id, date: isoDate, rating, text });
  }

  const chargeCount = kept.filter((row) => CHARGE_WORDS.test(row.text)).length;
  let finalRows = kept;
  if (kept.length > TRIM_TARGET) {
    finalRows = trimRows(kept, TRIM_TARGET);
  }
  finalRows.sort((a, b) => b.date.localeCompare(a.date));
  const finalCharge = finalRows.filter((row) => CHARGE_WORDS.test(row.text)).length;

  if (finalRows.length === 0) {
    console.error('ERROR: 0 rows survived cleaning. Check data/reviews_raw.csv.');
    process.exit(1);
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const csvOptions = { header: true, columns: ['review_id', 'date', 'rating', 'text'] };
  fs.writeFileSync(cleanPath, stringify(finalRows, csvOptions), 'utf8');
  fs.writeFileSync(samplePath, stringify(finalRows.slice(0, SAMPLE_ROWS), csvOptions), 'utf8');

  console.log(`Rows read: ${table.length - 1}`);
  for (const [reason, count] of Object.entries(drops)) {
    if (count > 0) console.log(`Dropped ${reason}: ${count}`);
  }
  console.log(`Masked: ${maskedEmails} email(s), ${maskedPhones} phone number(s)`);
  console.log(`Passed cleaning: ${kept.length} rows (charge-related: ${chargeCount})`);
  console.log(`Kept: ${finalRows.length} rows (charge-related: ${finalCharge}), sorted by date newest first.`);
  printRowsPerWeek(finalRows);
  if (finalRows.length < MIN_ROWS) {
    console.log(`WARNING: only ${finalRows.length} rows. The phase acceptance test expects 200 to 1,000 rows.`);
  }
  console.log(`Wrote ${cleanPath}`);
  console.log(`Wrote ${samplePath} (${Math.min(SAMPLE_ROWS, finalRows.length)} rows)`);
}

main();
