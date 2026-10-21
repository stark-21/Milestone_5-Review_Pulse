import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');

const workflowPath = path.join(projectRoot, 'n8n', 'workflow.json');
if (!fs.existsSync(workflowPath)) {
  console.error(`SETUP ERROR: ${workflowPath} not found.`);
  process.exit(1);
}

const workflow = JSON.parse(read('n8n/workflow.json'));
const nodeByName = (name) => workflow.nodes.find((node) => node.name === name);

const CODE_MAP = {
  'Format Reviews': 'n8n/code/format_reviews.js',
  'Check Insights': 'n8n/code/check_insights.js',
  'Check Pulse': 'n8n/code/check_pulse.js',
  'Check Fee': 'n8n/code/check_fee.js',
  'Merge Payload': 'n8n/code/merge_payload.js',
};

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

check('every Code node in workflow.json matches its file in n8n/code/', () => {
  const problems = [];
  const embedded = new Set();
  for (const node of workflow.nodes) {
    if (node.type !== 'n8n-nodes-base.code') continue;
    const file = CODE_MAP[node.name];
    if (!file) {
      problems.push(`code node "${node.name}" has no file in n8n/code/`);
      continue;
    }
    embedded.add(node.name);
    if (String(node.parameters.jsCode).trim() !== read(file).trim()) {
      problems.push(`"${node.name}" differs from ${file}`);
    }
  }
  for (const name of Object.keys(CODE_MAP)) {
    if (!embedded.has(name)) problems.push(`code node "${name}" is missing from workflow.json`);
  }
  return problems;
});

check('the Insights LLM prompt matches prompts/insights_prompt.txt', () => {
  const node = nodeByName('Insights LLM');
  if (!node) return ['node "Insights LLM" is missing'];
  const expected = '=' + read('prompts/insights_prompt.txt').replace(/\{\{reviews_block\}\}/g, '{{ $json.reviews_block }}');
  if (String(node.parameters.text).trim() !== expected.trim()) {
    return ['the embedded Insights LLM prompt differs from prompts/insights_prompt.txt'];
  }
  return [];
});

check('the Insights LLM prompt states the fee-evidence rules', () => {
  const prompt = read('prompts/insights_prompt.txt').replace(/\s+/g, ' ');
  const required = [
    'at least 3 DISTINCT reviews',
    'Copy each supporting review_id exactly as printed',
    'Never invent, shorten, re-case, or modify an ID',
    'Use only IDs present in the supplied reviews',
    'set found to false, supporting_review_ids to [], and count to 0',
  ];
  return required.filter((phrase) => !prompt.includes(phrase)).map((phrase) => `prompt is missing: "${phrase}"`);
});

check('no Gmail node sends mail on its own', () => {
  const problems = [];
  for (const node of workflow.nodes) {
    if (!String(node.type).includes('gmail')) continue;
    const operation = String(node.parameters.operation ?? '');
    const resource = String(node.parameters.resource ?? '');
    if (operation === 'send') {
      problems.push(`"${node.name}" uses the Gmail send operation`);
    }
    if (operation === 'sendAndWait' && node.name !== 'Approval Gate') {
      problems.push(`"${node.name}" sends mail and waits; only the Approval Gate may do that`);
    }
    if (resource === 'draft' && operation !== '') {
      problems.push(`"${node.name}" is a draft node but also sets operation "${operation}"`);
    }
  }
  const createDraft = nodeByName('Create Draft');
  if (createDraft && String(createDraft.parameters.resource) !== 'draft') {
    problems.push('"Create Draft" is not a Gmail draft node');
  }
  return problems;
});

check('nothing is written before the approval is granted', () => {
  const problems = [];
  const connections = workflow.connections ?? {};
  const targets = (name, branch = 0) => (connections[name]?.main?.[branch] ?? []).map((c) => c.node);

  const reachable = (start) => {
    const seen = new Set();
    const queue = [...start];
    while (queue.length > 0) {
      const name = queue.shift();
      if (seen.has(name)) continue;
      seen.add(name);
      for (const branch of connections[name]?.main ?? []) {
        for (const link of branch) queue.push(link.node);
      }
    }
    return seen;
  };

  const approvedTargets = targets('Approved?', 0);
  const rejectedTargets = targets('Approved?', 1);
  const approvedChain = reachable(approvedTargets);
  const rejectedChain = reachable(rejectedTargets);

  if (!approvedTargets.includes('Append to Doc')) problems.push('the true branch of "Approved?" does not reach "Append to Doc"');
  if (!approvedChain.has('Create Draft')) problems.push('the true branch of "Approved?" does not reach "Create Draft"');
  if (!rejectedTargets.includes('Rejected')) problems.push('the false branch of "Approved?" does not reach "Rejected"');
  if (approvedChain.has('Rejected')) problems.push('the rejected path is reachable from the approved branch');
  if (rejectedChain.has('Append to Doc') || rejectedChain.has('Create Draft')) {
    problems.push('a write node is reachable from the rejected branch');
  }

  const writeNodes = ['Append to Doc', 'Create Draft'];
  const allowedSources = new Set(['Approved?', ...approvedChain]);
  for (const node of workflow.nodes) {
    if (!writeNodes.includes(node.name)) continue;
    for (const [source, outputs] of Object.entries(connections)) {
      for (const branches of outputs.main ?? []) {
        for (const link of branches) {
          if (link.node === node.name && !allowedSources.has(source)) {
            problems.push(`"${node.name}" is reachable without an approval (from "${source}")`);
          }
        }
      }
    }
  }
  return problems;
});

check('the export contains no credentials or API keys', () => {
  const raw = read('n8n/workflow.json');
  const problems = [];
  const secretPatterns = [/sk-[A-Za-z0-9]{20,}/, /Bearer\s+[A-Za-z0-9._-]{20,}/, /"apiKey"\s*:\s*"[^"]+"/i, /"password"\s*:\s*"[^"]+"/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  for (const pattern of secretPatterns) {
    if (pattern.test(raw)) problems.push(`the export matches the secret pattern ${pattern}`);
  }
  for (const node of workflow.nodes) {
    if (node.credentials && Object.values(node.credentials).some((c) => c && typeof c === 'object' && Object.values(c).some((v) => typeof v === 'string' && v.length > 20))) {
      problems.push(`"${node.name}" looks like it embeds a credential value`);
    }
  }
  return problems;
});

let failures = 0;
for (const { name, fn } of checks) {
  let problems = [];
  try {
    problems = fn() ?? [];
  } catch (err) {
    problems = [`the check threw: ${err.message}`];
  }
  if (problems.length > 0) {
    failures += 1;
    console.error(`FAIL: ${name}`);
    for (const problem of problems) console.error(`      - ${problem}`);
  } else {
    console.log(`PASS: ${name}`);
  }
}

const placeholders = [];
for (const node of workflow.nodes) {
  for (const [key, value] of Object.entries(node.parameters ?? {})) {
    if (typeof value === 'string' && /^(your-|YOUR_|REPLACE_|<)/.test(value)) {
      placeholders.push(`${node.name}.${key} = ${value}`);
    }
  }
}
if (placeholders.length > 0) {
  console.log('\nNOTE: placeholders the owner must fill in n8n before a live run:');
  for (const placeholder of placeholders) console.log(`      - ${placeholder}`);
}

console.log(`\n${checks.length - failures} of ${checks.length} checks passed.`);

if (failures > 0) {
  process.exit(1);
}

console.log('workflow.json is in sync with the project files.');
