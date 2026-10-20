# n8n Node Cheat-Sheet — Review-to-Insight Workflow

This file tells you, click by click, how to build the workflow **by hand in n8n Cloud (browser)**. Nothing here imports automatically; you create each node yourself. The five code blocks are also saved as files under `n8n/code/`, so you can copy from either place.

The goal of the workflow: upload a reviews CSV form → clean and analyze it with an LLM → run safety checks → send one approval email → **only after you click Approve** → append one entry to a Google Doc and create one Gmail **draft** (never a send).

## Words used in this guide (each explained once)

- **Workflow** — one automation diagram inside n8n, made of connected nodes.
- **Node** — one box in the diagram that does one job (read a file, call an AI, send an approval email).
- **Trigger** — the node that starts the workflow (here: a web form).
- **Credential** — a saved sign-in (Google, an AI provider) that you create once inside n8n and reuse. API keys are pasted only into credentials, never into files.
- **Expression** — a field mode in n8n where `{{ ... }}` is evaluated as code and replaced with real data.
- **Execute step** — a button on a node that runs just that node, so you can test it alone.
- **Pin** — a pushpin icon that freezes a node's output as sample data, so later nodes reuse it instead of calling the AI again (saves money).
- **Branch** — two paths leaving one node, for example Approve vs Disapprove.

## Before you start (checklist)

1. An n8n Cloud account and an empty workflow (Add workflow).
2. Your cleaned CSV: `data/reviews_clean.csv` (build it in Step 1; keep `data/reviews_sample.csv` for cheap testing).
3. A Google account. You will connect **Gmail** and **Google Docs** credentials; each opens a Google sign-in window — that is normal OAuth (you grant n8n permission, n8n never sees your password).
4. One LLM provider account (OpenAI, Anthropic or Gemini) with an API key. Create the matching chat model credential **inside n8n only**.
5. One empty Google Doc for the team notes, for example titled `Weekly Product Pulse Notes`.
6. Your own email address (for the approval email and the test draft).

**Rules this workflow must keep:** the approval node comes before every writing action; a 24-hour timeout counts as Disapprove; there is **no Gmail Send node anywhere** — email exists only as a draft.

## The 16 nodes at a glance

| # | Name (exact) | Type (exact) |
|---|---|---|
| 1 | Upload Reviews | On form submission (Form Trigger) |
| 2 | Read CSV | Extract From File |
| 3 | Format Reviews | Code |
| 4 | Insights LLM | Basic LLM Chain + chat model |
| 5 | Check Insights | Code |
| 6 | Pulse LLM | Basic LLM Chain + chat model |
| 7 | Check Pulse | Code |
| 8 | Source Facts | Set (Edit Fields) |
| 9 | Fee LLM | Basic LLM Chain + chat model |
| 10 | Check Fee | Code |
| 11 | Merge Payload | Code |
| 12 | Approval Gate | Gmail: Send message and wait for response |
| 13 | Approved? | If |
| 14 | Append to Doc | Google Docs: Update, Action Insert |
| 15 | Create Draft | Gmail: Create a draft |
| 16 | Rejected | No Operation |

Connections: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13; the **true** branch of 13 goes to 14 then 15; the **false** branch of 13 goes to 16.

**How to rename a node:** add it, then press **F2** and type the exact name from the table. The code files refer to nodes by these names, so do not change them.

**How to switch a field to Expression mode:** click the small expression toggle `= ` or gear icon next to the field, choose Expression, then paste. Any value containing `{{ ... }}` in this guide must be in Expression mode; everything else stays on Fixed values.

**Tip:** after each node works, press **Execute step**, then **pin** the output before moving on. This is required for the LLM nodes (4, 6, 9) so you do not pay for the same AI call twice.

---

## Node 1 — Upload Reviews

- **Type:** search "On form submission" (Form Trigger) and add it.
- **Rename** to `Upload Reviews` (F2).
- Add **one field**: type **File**, label exactly `Reviews CSV`.
- Under the field settings, allow the `.csv` file type (or leave "All" if no file-type list is shown).
- Everything else: defaults. n8n Cloud gives you a public form URL after the first save — open it in a browser to use the form.
- n8n Cloud cannot read your computer's folders, so this form is how the CSV gets into the workflow.

## Node 2 — Read CSV

- **Type:** search "Extract From File" and add it. **Rename** to `Read CSV`.
- **Operation:** Extract From CSV.
- **Input Binary Field:** the binary field name that node 1 shows in its output (it usually matches the field label, for example `Reviews CSV`). To see it: run the form once with `data/reviews_sample.csv`, open node 1's output, and copy the name shown under "binary".
- All other settings: defaults. Output: one item per CSV row, with `review_id`, `date`, `rating`, `text`.

## Node 3 — Format Reviews

- **Type:** search "Code" and add it. **Rename** to `Format Reviews`.
- **Mode:** Run Once for All Items. Language: JavaScript.
- Delete any placeholder code and paste:

```javascript
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
```

- **Execute step** and pin the output. You should see four fields: `reviews_block`, `all_text`, `valid_ids`, `review_count` (at most 300 reviews, fee-related ones first).

## Node 4 — Insights LLM

- **Type:** search "Basic LLM Chain" and add it. **Rename** to `Insights LLM`.
- Add a chat model on the chain's **Model** input (for example "OpenAI Chat Model", "Anthropic Chat Model" or "Google Gemini Chat Model"). Open it, pick or create your credential (paste your API key there), save, and close it.
- On `Insights LLM`: **Temperature** = `0` (makes the AI's choices repeatable).
- Open `prompts/insights_prompt.txt`, copy everything, and paste it into the **Prompt (User Message)** field.
- Switch that field to **Expression** mode and find the last line, `{{reviews_block}}`. Replace only that placeholder with:

```
{{ $json.reviews_block }}
```

- **Execute step** once (this is one paid AI call), then **pin** the output. It should be a block of JSON text. If it is not JSON, run the step again.

## Node 5 — Check Insights

- **Type:** "Code". **Rename** to `Check Insights`. **Mode:** Run Once for All Items.
- Paste (this is also `n8n/code/check_insights.js`):

```javascript
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
  if (ids.length < 3) {
    throw new Error('fee_issue has ' + ids.length + ' supporting review_ids; at least 3 are required.');
  }
  const missing = ids.filter((id) => !validIds.has(id));
  if (missing.length > 0) {
    throw new Error('fee_issue supporting review_ids not found in the reviews: ' + missing.join(', ') + '.');
  }
} else if (fee.found !== false) {
  throw new Error('fee_issue.found must be true or false.');
}

return [{ json: insights }];
```

- A red error means the AI misbehaved; read the message, then un-pin node 4 and run it again. When it passes, **pin** node 5. Its output is the parsed insights object (themes, quotes, fee issue).

## Node 6 — Pulse LLM

- **Type:** "Basic LLM Chain" with a chat model attached (same setup as node 4). **Rename** to `Pulse LLM`. Temperature `0` is recommended for repeatable runs.
- Paste `prompts/pulse_prompt.txt` into **Prompt (User Message)**, switch to **Expression** mode, and replace the placeholder `{{insights_json}}` with:

```
{{ JSON.stringify($json) }}
```

- **Execute step** (one AI call), then **pin**. Output: the Weekly Pulse as Markdown text.

## Node 7 — Check Pulse

- **Type:** "Code". **Rename** to `Check Pulse`. **Mode:** Run Once for All Items.
- Paste (also `n8n/code/check_pulse.js`):

```javascript
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
```

- **Execute step** and **pin**. Output: `pulse` (the text used later) and `word_count`.

## Node 8 — Source Facts

- **Type:** search "Set" (Set (Edit Fields)) and add it. **Rename** to `Source Facts`.
- Add three fields of type **String**:
  - `source_facts` — leave empty for now.
  - `source_url_1` — leave empty for now.
  - `source_url_2` — leave empty for now.
- Keep "Include Other Input Fields" on (default), so the pulse data continues down the chain.
- **When to fill these in (you do this once the fee issue is known):**
  1. Open the official Help Center article for the fee issue, the official pricing page, and (if app-store billing is involved) the Apple or Google Play subscription help page.
  2. For each page check three things: the URL is on the **official domain**, the page **opens**, and the page **actually answers the fee issue**.
  3. Paste 3 to 6 short facts copied from those pages into `source_facts`, and put the two best URLs into `source_url_1` and `source_url_2`.
- Never leave placeholder text such as `<VERIFIED_URL_1>` in these fields.

## Node 9 — Fee LLM

- **Type:** "Basic LLM Chain" + chat model. **Rename** to `Fee LLM`.
- Paste `prompts/fee_explainer_prompt.txt` into **Prompt (User Message)**, switch to **Expression** mode, and replace the placeholders:

| In the prompt, replace | With |
|---|---|
| `{{fee_issue_title}}` | `{{ $('Check Insights').first().json.fee_issue.title }}` |
| `{{fee_issue_description}}` | `{{ $('Check Insights').first().json.fee_issue.description }}` |
| `{{source_facts}}` | `{{ $json.source_facts }}` |
| `{{source_url_1}}` | `{{ $json.source_url_1 }}` |
| `{{source_url_2}}` | `{{ $json.source_url_2 }}` |
| `YYYY-MM-DD` (in the last line of the prompt) | `{{ $now.format('yyyy-MM-dd') }}` |

- **Execute step** (one AI call), then **pin**. Output: a small JSON object with `bullets`, `source_links`, `last_checked`.

## Node 10 — Check Fee

- **Type:** "Code". **Rename** to `Check Fee`. **Mode:** Run Once for All Items.
- Paste (also `n8n/code/check_fee.js`):

```javascript
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

const today = $now.format('yyyy-MM-dd');
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
```

- **Execute step** and **pin**.

## Node 11 — Merge Payload

- **Type:** "Code". **Rename** to `Merge Payload`. **Mode:** Run Once for All Items.
- Paste (also `n8n/code/merge_payload.js`):

```javascript
const insights = $('Check Insights').first().json;
const pulseNode = $('Check Pulse').first().json;
const fee = $json;

const topThemes = Array.isArray(insights.top_themes) ? insights.top_themes : [];
if (topThemes.length !== 3) {
  throw new Error('top_themes must have exactly 3 entries; found ' + topThemes.length + '.');
}

const weeklyPulse = String(pulseNode.pulse ?? '').trim();
if (!weeklyPulse) {
  throw new Error('Check Pulse did not produce a pulse text.');
}

const issueTitle = String((insights.fee_issue && insights.fee_issue.title) || '').trim();
const issueDescription = String((insights.fee_issue && insights.fee_issue.description) || '').trim();
const identifiedFeeIssue =
  issueTitle && issueDescription ? issueTitle + ' - ' + issueDescription : issueTitle || issueDescription;
if (!identifiedFeeIssue) {
  throw new Error('The identified fee issue is empty; check the fee_issue fields in Check Insights.');
}

if (!Array.isArray(fee.bullets) || fee.bullets.length === 0) {
  throw new Error('Check Fee did not return explanation bullets.');
}
if (!Array.isArray(fee.source_links) || fee.source_links.length !== 2) {
  throw new Error('Check Fee did not return exactly 2 source links.');
}

const payload = {
  date: $now.format('yyyy-MM-dd'),
  top_themes: topThemes,
  weekly_pulse: weeklyPulse,
  identified_fee_issue: identifiedFeeIssue,
  explanation_bullets: fee.bullets.map((bullet) => String(bullet)),
  source_links: fee.source_links.map((link) => String(link)),
  last_checked: String(fee.last_checked ?? '').trim(),
};

return [{ json: payload }];
```

- **Execute step** and **pin**. You should see seven fields: `date`, `top_themes`, `weekly_pulse`, `identified_fee_issue`, `explanation_bullets`, `source_links`, `last_checked`. This is the payload the rest of the workflow acts on.

## Node 12 — Approval Gate

- **Type:** add the **Gmail** node. **Rename** to `Approval Gate`.
- **Credential:** create a Gmail credential (a Google sign-in window opens; approve it).
- **Operation:** Send message and wait for response (called *Send and Wait for Response* in some versions). This is the only Gmail operation in the whole workflow besides the draft — it sends **only** the approval request email to you.
- **To:** your own email address.
- **Subject:** `Weekly Product Pulse approval needed`
- **Message:** switch to **Expression** mode and paste:

```
A new Weekly Product Pulse is ready for review.

Date: {{ $('Merge Payload').first().json.date }}
Top themes: {{ $('Merge Payload').first().json.top_themes.join(', ') }}

Weekly Pulse:
{{ $('Merge Payload').first().json.weekly_pulse }}

Identified fee issue: {{ $('Merge Payload').first().json.identified_fee_issue }}

Explanation:
{{ $('Merge Payload').first().json.explanation_bullets.map(b => '- ' + b).join('\n') }}

Sources: {{ $('Merge Payload').first().json.source_links.join(' | ') }}
Last checked: {{ $('Merge Payload').first().json.last_checked }}

Click Approve to append to the team Google Doc and create an email draft. Click Disapprove to stop. If no answer arrives within 24 hours, this counts as Disapprove.
```

- **Response Type:** Approval.
- **Approval Type:** Approve and Disapprove.
- **Wait Limit:** 24 hours. A timeout is treated as Disapprove (the workflow continues down the false branch).

## Node 13 — Approved?

- **Type:** search "If" and add it. **Rename** to `Approved?`.
- Add one condition:
  - Left value (Expression mode): `{{ $json.data.approved }}`
  - Operator: **Boolean → is true** (or "Equals → true").
- If your Gmail node output names the field differently (some versions use `approved` instead of `data.approved`), open the Approval Gate output from a test approval and copy the real field path — confirm it from the node output, do not guess.
- Connect the **true** output to node 14, the **false** output to node 16.

## Node 14 — Append to Doc

- **Type:** add the **Google Docs** node. **Rename** to `Append to Doc`.
- **Credential:** create a Google Docs credential (Google sign-in window).
- **Operation:** Update. **Action:** Insert (this adds the text to the end of the document).
- **Document:** pick your `Weekly Product Pulse Notes` doc from the list (or paste its document ID).
- **Content:** switch to **Expression** mode and paste exactly:

```
=== {{ $('Merge Payload').first().json.date }} ===
Top themes: {{ $('Merge Payload').first().json.top_themes.join(', ') }}

Weekly Pulse:
{{ $('Merge Payload').first().json.weekly_pulse }}

Identified fee issue: {{ $('Merge Payload').first().json.identified_fee_issue }}

Explanation:
{{ $('Merge Payload').first().json.explanation_bullets.map(b => '- ' + b).join('\n') }}

Sources: {{ $('Merge Payload').first().json.source_links.join(' | ') }}
Last checked: {{ $('Merge Payload').first().json.last_checked }}
```

## Node 15 — Create Draft

- **Type:** add the **Gmail** node. **Rename** to `Create Draft`.
- **Credential:** the same Gmail credential as node 12.
- **Operation:** Create a draft (shown as *Draft: Create* in some versions). **Never** choose Send message.
- **To:** your own email address (or the support team alias you want to reuse the snippet).
- **Subject:** switch to **Expression** mode and paste:

```
Weekly Product Pulse + Customer Clarification — {{ $('Merge Payload').first().json.date }}
```

- **Message or Body:** switch to **Expression** mode and paste:

```
Hello team,

WEEKLY PRODUCT PULSE
{{ $('Merge Payload').first().json.weekly_pulse }}

CUSTOMER CLARIFICATION (reusable support snippet)
Issue: {{ $('Merge Payload').first().json.identified_fee_issue }}
{{ $('Merge Payload').first().json.explanation_bullets.map(b => '- ' + b).join('\n') }}

Sources:
{{ $('Merge Payload').first().json.source_links.map(u => '- ' + u).join('\n') }}
Last checked: {{ $('Merge Payload').first().json.date }}
```

- Check your Gmail **Drafts** folder after a test run — the message must sit there unsent.

## Node 16 — Rejected

- **Type:** search "No Operation" and add it. **Rename** to `Rejected`.
- No settings. This node only marks the stop point of the false branch: when you disapprove (or the 24-hour wait times out), nothing is written anywhere.

---

## Connect everything

Drag the connections in this order: `Upload Reviews` → `Read CSV` → `Format Reviews` → `Insights LLM` → `Check Insights` → `Pulse LLM` → `Check Pulse` → `Source Facts` → `Fee LLM` → `Check Fee` → `Merge Payload` → `Approval Gate` → `Approved?`. Then from `Approved?`: the **true** output → `Append to Doc` → `Create Draft`, and the **false** output → `Rejected`.

## First full test (approve path)

1. Fill node 8 (`Source Facts`) with your verified facts and the two verified URLs.
2. Click **Execute workflow**, open the form URL, upload `data/reviews_sample.csv` (cheap) or `data/reviews_clean.csv`, submit.
3. Watch the nodes run. Nodes 4, 6 and 9 each make one AI call — pin their outputs afterwards.
4. You receive the approval email. Click **Approve**.
5. Check that (a) the Google Doc has exactly one new `=== date ===` entry, and (b) Gmail has exactly one new draft with subject `Weekly Product Pulse + Customer Clarification — <date>` and it was **not** sent.

## Second test (reject path)

1. Run the workflow again with the same CSV.
2. Click **Disapprove** in the approval email (or just let the 24-hour limit expire).
3. Check that the Google Doc did not change and Gmail has no new draft and no sent message.

## Extra option (not required): MCP

This cheat-sheet uses the simple approach: native Google Docs and Gmail nodes behind the approval gate. An advanced alternative is an AI Agent node with an MCP Client Tool connected to Google Docs and Gmail MCP servers, also placed after the approval gate, with a system message limiting it to "append the given entry to the notes doc and create one email draft; never send email". The simple approach is recommended and is what this cheat-sheet builds. The README explains both.

## If something breaks

Paste the exact n8n error (or a screenshot) to your AI agent. In plain language: a red node means that node threw an error; open the node, read the "Error" line, fix the setting the message mentions, and run that node with **Execute step** again. The code nodes were written to explain what is wrong in their error messages.
