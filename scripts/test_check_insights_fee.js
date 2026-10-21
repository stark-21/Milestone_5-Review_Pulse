import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const validatorPath = path.join(projectRoot, 'n8n', 'code', 'check_insights.js');

const VALID_IDS = ['v1', 'v2', 'v3'];
const ALL_TEXT = 'q1 q2 q3';

if (!fs.existsSync(validatorPath)) {
  console.error(`SETUP ERROR: ${validatorPath} not found.`);
  process.exit(1);
}

const source = fs.readFileSync(validatorPath, 'utf8');

// The validator is an n8n Code node script. It uses two n8n globals:
//   $('Format Reviews').first().json  -> the Format Reviews node output
//   $json.text                          -> the current item (the LLM output)
// and it ends with a top-level return, so it is executed inside a function body.
const runValidator = new Function('$', '$json', `const $now = { toFormat: () => '2026-01-01' };\n${source}`);

function makeNodeStub(validIds) {
  return () => ({
    first: () => ({
      json: {
        all_text: ALL_TEXT,
        valid_ids: validIds,
      },
    }),
  });
}

const $ = makeNodeStub(VALID_IDS);

function buildInsights(supportingReviewIds) {
  return {
    themes: [{ name: 'Theme', description: 'A theme', review_ids: [], count: 1, voice_relevance: 'none' }],
    top_themes: ['Theme', 'Second', 'Third'],
    quotes: [
      { text: 'q1', review_id: 'v1', theme: 'Theme' },
      { text: 'q2', review_id: 'v2', theme: 'Theme' },
      { text: 'q3', review_id: 'v3', theme: 'Theme' },
    ],
    fee_issue: {
      found: true,
      title: 'Unexpected charges',
      description: 'Users report being charged twice',
      supporting_review_ids: supportingReviewIds,
      count: supportingReviewIds.length,
    },
    key_observation: 'A key observation.',
  };
}

function runCase(supportingReviewIds) {
  const $json = { text: JSON.stringify(buildInsights(supportingReviewIds)) };
  return runValidator($, $json);
}

function runInsights(insights, validIds = VALID_IDS) {
  const $json = { text: JSON.stringify(insights) };
  return runValidator(makeNodeStub(validIds), $json);
}

const cases = [
  {
    name: 'three distinct valid IDs',
    ids: ['v1', 'v2', 'v3'],
    expect: 'pass',
    count: 3,
    expectedIds: ['v1', 'v2', 'v3'],
  },
  {
    name: 'one valid ID repeated three times',
    ids: ['v1', 'v1', 'v1'],
    expect: 'fail',
    message: /has 1 distinct supporting review_ids/,
  },
  {
    name: 'two distinct valid IDs and one invalid ID',
    ids: ['v1', 'v2', 'vX'],
    expect: 'fail',
    message: /Unmatched IDs: \["vX"\]/,
  },
  {
    name: 'three distinct valid IDs plus a duplicate',
    ids: ['v1', 'v2', 'v3', 'v1'],
    expect: 'pass',
    count: 3,
    expectedIds: ['v1', 'v2', 'v3'],
  },
  {
    name: 'two distinct valid IDs repeated to make three entries',
    ids: ['v1', 'v2', 'v1'],
    expect: 'fail',
    message: /has 2 distinct supporting review_ids/,
  },
  {
    name: 'three distinct valid IDs in a different order',
    ids: ['v3', 'v1', 'v2'],
    expect: 'pass',
    count: 3,
    expectedIds: ['v3', 'v1', 'v2'],
  },
];

const insightsCases = [
  {
    name: 'found is false and no IDs are supplied',
    mutate: (insights) => {
      insights.fee_issue.found = false;
      insights.fee_issue.supporting_review_ids = [];
      insights.fee_issue.count = 0;
      return insights;
    },
    expect: 'pass',
    count: 0,
    expectedIds: [],
  },
  {
    name: 'found is false but IDs are supplied, so they are cleared',
    mutate: (insights) => {
      insights.fee_issue.found = false;
      insights.fee_issue.supporting_review_ids = ['v1', 'v2', 'v3'];
      insights.fee_issue.count = 3;
      return insights;
    },
    expect: 'pass',
    count: 0,
    expectedIds: [],
  },
  {
    name: 'found is missing',
    mutate: (insights) => {
      delete insights.fee_issue.found;
      return insights;
    },
    expect: 'fail',
    message: /fee_issue\.found must be true or false\./,
  },
  {
    name: 'found is a string instead of a boolean',
    mutate: (insights) => {
      insights.fee_issue.found = 'yes';
      return insights;
    },
    expect: 'fail',
    message: /fee_issue\.found must be true or false\./,
  },
  {
    name: 'supporting_review_ids is not a list',
    mutate: (insights) => {
      insights.fee_issue.supporting_review_ids = 'v1, v2, v3';
      return insights;
    },
    expect: 'fail',
    message: /has 0 distinct supporting review_ids/,
  },
  {
    name: 'numeric IDs are compared as strings',
    mutate: (insights) => {
      insights.fee_issue.supporting_review_ids = [1, 2, 3];
      return insights;
    },
    validIds: ['1', '2', '3'],
    expect: 'pass',
    count: 3,
    expectedIds: ['1', '2', '3'],
  },
];

let failures = 0;

function checkFeeCase(testCase, result) {
  const fee = result[0].json.fee_issue;
  if (fee.count !== testCase.count) {
    return `expected fee.count ${testCase.count}, got ${fee.count}`;
  }
  if (fee.supporting_review_ids.length !== testCase.expectedIds.length) {
    return `expected ${testCase.expectedIds.length} supporting IDs, got ${fee.supporting_review_ids.length}`;
  }
  if (JSON.stringify(fee.supporting_review_ids) !== JSON.stringify(testCase.expectedIds)) {
    return `expected supporting IDs ${JSON.stringify(testCase.expectedIds)}, got ${JSON.stringify(fee.supporting_review_ids)}`;
  }
  return null;
}

for (const testCase of cases) {
  let failure = null;

  try {
    const result = runCase(testCase.ids);
    if (testCase.expect === 'fail') {
      failure = 'expected the validator to throw, but it passed';
    } else {
      failure = checkFeeCase(testCase, result);
    }
  } catch (err) {
    if (testCase.expect === 'pass') {
      failure = `expected the validator to pass, but it threw: ${err.message}`;
    } else if (!testCase.message.test(err.message)) {
      failure = `error message did not match ${testCase.message}: ${err.message}`;
    }
  }

  if (failure) {
    failures += 1;
    console.error(`FAIL: ${testCase.name}: ${failure}`);
  } else {
    console.log(`PASS: ${testCase.name}`);
  }
}

for (const testCase of insightsCases) {
  let failure = null;

  try {
    const result = runInsights(testCase.mutate(buildInsights(['v1', 'v2', 'v3'])), testCase.validIds);
    if (testCase.expect === 'fail') {
      failure = 'expected the validator to throw, but it passed';
    } else {
      failure = checkFeeCase(testCase, result);
    }
  } catch (err) {
    if (testCase.expect === 'pass') {
      failure = `expected the validator to pass, but it threw: ${err.message}`;
    } else if (!testCase.message.test(err.message)) {
      failure = `error message did not match ${testCase.message}: ${err.message}`;
    }
  }

  if (failure) {
    failures += 1;
    console.error(`FAIL: ${testCase.name}: ${failure}`);
  } else {
    console.log(`PASS: ${testCase.name}`);
  }
}

const total = cases.length + insightsCases.length;
console.log(`${total - failures} of ${total} cases passed.`);

if (failures > 0) {
  process.exit(1);
}

console.log('All fee_issue validation checks passed.');
