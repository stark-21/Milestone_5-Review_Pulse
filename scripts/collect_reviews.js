import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gplay from 'google-play-scraper';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const rawCsvPath = path.join(dataDir, 'reviews_raw.csv');
const configPath = path.join(__dirname, 'collect_config.json');

const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const PROGRESS_EVERY = 10;
const CHECKPOINT_EVERY = 50;
const EMPTY_PAGE_LIMIT = 3;
const COLUMNS = ['review_id', 'date', 'rating', 'text'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeHeader = (header) => String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const state = {
  rows: [],
  seenIds: new Set(),
  oldestReached: null,
};

function noteOldest(isoDate) {
  if (!state.oldestReached || isoDate < state.oldestReached) state.oldestReached = isoDate;
}

function writeCsv() {
  const sorted = [...state.rows].sort((a, b) => b.date.localeCompare(a.date));
  const csv = stringify(sorted, { header: true, columns: COLUMNS });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(rawCsvPath, csv, 'utf8');
}

function checkpoint(reason) {
  if (state.rows.length === 0) return;
  writeCsv();
  console.log(
    `Checkpoint (${reason}): saved ${state.rows.length} rows to data/reviews_raw.csv. ` +
      `Oldest date reached so far: ${state.oldestReached ?? 'unknown'}.`,
  );
}

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    console.error(`ERROR: config file not found: ${configPath}`);
    console.error('Create it with fields: appId, country, lang, weeks.');
    process.exit(1);
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`ERROR: ${configPath} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  const appId = typeof cfg.appId === 'string' ? cfg.appId.trim() : '';
  if (!appId || /<[^>]+>/.test(appId)) {
    console.error('STOPPED: appId in scripts/collect_config.json is still a placeholder.');
    console.error('Open scripts/collect_config.json and replace "<YOUR_GOOGLE_PLAY_APP_ID>"');
    console.error('with the Google Play package name of the app (example format: com.example.app).');
    console.error('Ask your AI agent or check the app page in a browser to find the package name.');
    process.exit(1);
  }
  return {
    appId,
    country: typeof cfg.country === 'string' && cfg.country.trim() ? cfg.country.trim() : 'us',
    lang: typeof cfg.lang === 'string' && cfg.lang.trim() ? cfg.lang.trim() : 'en',
    weeks: Number.isFinite(Number(cfg.weeks)) && Number(cfg.weeks) > 0 ? Number(cfg.weeks) : 8,
  };
}

function loadExistingRows() {
  if (!fs.existsSync(rawCsvPath)) return false;

  let table;
  try {
    table = parse(fs.readFileSync(rawCsvPath, 'utf8'), {
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    });
  } catch (err) {
    console.error(`ERROR: could not read ${rawCsvPath}: ${err.message}`);
    process.exit(1);
  }
  if (table.length < 2) {
    console.log(`Found ${rawCsvPath} but it has no data rows. Starting from page 1.`);
    return false;
  }

  const headers = table[0].map(normalizeHeader);
  const index = {};
  for (const field of COLUMNS) {
    const found = headers.indexOf(normalizeHeader(field));
    if (found === -1) {
      console.error(`ERROR: ${rawCsvPath} is missing the "${field}" column, so it cannot be used to resume.`);
      console.error(`Columns found: ${table[0].join(', ')}`);
      console.error('Fix or rename that file, then run "npm run collect" again.');
      process.exit(1);
    }
    index[field] = found;
  }

  let loaded = 0;
  let skipped = 0;
  for (const row of table.slice(1)) {
    const review_id = String(row[index.review_id] ?? '').trim();
    const rawDate = String(row[index.date] ?? '').trim();
    const time = Date.parse(rawDate);
    if (!review_id || Number.isNaN(time)) {
      skipped += 1;
      continue;
    }
    const date = new Date(time).toISOString().slice(0, 10);
    if (state.seenIds.has(review_id)) {
      skipped += 1;
      continue;
    }
    state.seenIds.add(review_id);
    state.rows.push({ review_id, date, rating: row[index.rating], text: String(row[index.text] ?? '') });
    noteOldest(date);
    loaded += 1;
  }

  if (loaded === 0) {
    console.log(`Found ${rawCsvPath} but no usable rows in it. Starting from page 1.`);
    return false;
  }
  console.log(
    `Resume: loaded ${loaded} rows from data/reviews_raw.csv` +
      (skipped ? ` (skipped ${skipped} unreadable or repeated)` : '') +
      `. Oldest date so far: ${state.oldestReached ?? 'unknown'}.`,
  );
  return true;
}

async function fetchReviews(cfg, cutoffMs) {
  let token = null;
  let page = 0;
  let emptyStreak = 0;

  for (;;) {
    page += 1;
    let result = null;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(RETRY_DELAY_MS * attempt);
        console.log(`Retry ${attempt} of ${MAX_RETRIES} for page ${page} after error: ${lastError}`);
      }
      try {
        result = await gplay.reviews({
          appId: cfg.appId,
          lang: cfg.lang,
          country: cfg.country,
          sort: gplay.sort.NEWEST,
          num: PAGE_SIZE,
          paginate: true,
          nextPaginationToken: token,
        });
        break;
      } catch (err) {
        result = null;
        lastError = err.message;
      }
    }

    if (!result) {
      return { kind: 'blocked', reason: lastError || 'unknown request error', page };
    }

    const items = Array.isArray(result.data) ? result.data : [];
    let added = 0;
    let duplicates = 0;
    let noDate = 0;
    let older = 0;

    for (const item of items) {
      const time = Date.parse(item.date);
      if (Number.isNaN(time)) {
        noDate += 1;
        continue;
      }
      const date = new Date(time).toISOString().slice(0, 10);
      noteOldest(date);
      if (time < cutoffMs) {
        older += 1;
        continue;
      }
      const id = String(item.id ?? '').trim();
      if (!id) continue;
      if (state.seenIds.has(id)) {
        duplicates += 1;
        continue;
      }
      state.seenIds.add(id);
      state.rows.push({
        review_id: id,
        date,
        rating: item.score,
        text: typeof item.text === 'string' ? item.text : '',
      });
      added += 1;
    }

    emptyStreak = items.length === 0 ? emptyStreak + 1 : 0;

    if (page % PROGRESS_EVERY === 0 || older > 0) {
      console.log(
        `Page ${page}: added ${added} new, skipped ${duplicates} duplicates` +
          (noDate ? `, ${noDate} without a date` : '') +
          `, rows total ${state.rows.length}, oldest date reached ${state.oldestReached ?? 'unknown'}.`,
      );
    }
    if (page % CHECKPOINT_EVERY === 0) checkpoint(`page ${page}`);

    token = result.nextPaginationToken || null;
    if (!token) return { kind: 'no_more', page };
    if (older > 0) return { kind: 'cutoff', page };
    if (emptyStreak >= EMPTY_PAGE_LIMIT) {
      return { kind: 'blocked', reason: 'Google Play kept returning empty pages', page };
    }
    await sleep(PAGE_DELAY_MS);
  }
}

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(1);
  stopping = true;
  console.log('\nStop requested (Ctrl+C). Saving progress...');
  if (state.rows.length === 0) {
    console.log('Nothing collected yet, so nothing was saved.');
    process.exit(0);
  }
  writeCsv();
  console.log(`Saved ${state.rows.length} rows to data/reviews_raw.csv. Oldest date reached: ${state.oldestReached ?? 'unknown'}.`);
  console.log('Run "npm run collect" again to resume from this point.');
  process.exit(0);
});

async function main() {
  const cfg = loadConfig();

  const cutoffMs = Date.now() - cfg.weeks * 7 * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);

  console.log(
    `Fetching English Google Play reviews newest first for appId=${cfg.appId} (country=${cfg.country}, lang=${cfg.lang}).`,
  );
  console.log(
    `Stop condition: reviews older than ${cfg.weeks} weeks (before ${cutoffDate}). ` +
      `No page limit, ${PAGE_DELAY_MS} ms between pages, up to ${MAX_RETRIES} retries per page.`,
  );

  loadExistingRows();
  if (state.oldestReached && state.oldestReached < cutoffDate) {
    console.log(
      `Existing data already reaches ${state.oldestReached}, which is older than the ${cfg.weeks}-week cutoff (${cutoffDate}). Nothing new to fetch.`,
    );
    console.log('Delete data/reviews_raw.csv first if you want a fresh full scrape.');
    return;
  }

  const outcome = await fetchReviews(cfg, cutoffMs);

  if (outcome.kind === 'blocked') {
    if (state.rows.length === 0) {
      console.error(`ERROR: Google Play request failed on page ${outcome.page}: ${outcome.reason}`);
      console.error('No reviews were collected. If this keeps happening, obtain a public reviews CSV another way,');
      console.error('save it as data/reviews_raw.csv, then run "npm run clean".');
      process.exit(1);
    }
    writeCsv();
    console.log(`Stopped early on page ${outcome.page}: ${outcome.reason}`);
    console.log(`Saved what was collected: ${state.rows.length} rows in data/reviews_raw.csv.`);
    console.log(`Oldest date reached: ${state.oldestReached ?? 'unknown'} (target was before ${cutoffDate}).`);
    console.log('Run "npm run collect" again to resume from this point.');
    process.exit(0);
  }

  if (outcome.kind === 'cutoff') {
    console.log(`Reached reviews older than ${cfg.weeks} weeks on page ${outcome.page}. Stopping.`);
  } else {
    console.log(`Google Play returned no more pages on page ${outcome.page}. Stopping.`);
    if (!state.oldestReached || state.oldestReached >= cutoffDate) {
      console.log(`Note: Google Play ran out of pages before reaching ${cutoffDate}. The date range may be shorter than ${cfg.weeks} weeks.`);
    }
  }

  if (state.rows.length === 0) {
    console.error('ERROR: no reviews were collected. Check the appId in scripts/collect_config.json.');
    process.exit(1);
  }

  writeCsv();
  console.log(`Wrote ${state.rows.length} rows to data/reviews_raw.csv (oldest ${state.oldestReached ?? 'unknown'}).`);
  console.log('Next step: run "npm run clean".');
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
