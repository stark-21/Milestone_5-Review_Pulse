---
title: "Milestone 5: LLM Build Specification"
subtitle: "Save as docs/BUILD_SPEC.md in your project and tell OpenCode (running in Cursor) to follow it"
---

# Part A. How to Use This Document (for you, the human)

1. This file is meant to be read by **OpenCode** (an AI coding agent) running in the terminal inside **Cursor**. Follow **Part A of the Complete Execution Guide** to check that Cursor, Node.js and OpenCode work (they are already installed), make sure a model is connected, and create `AGENTS.md`.
2. Copy this file into your project as `docs/BUILD_SPEC.md`.
3. Start OpenCode in the project folder (`opencode`), switch to Plan mode with Tab, and use the prompts from the guide, starting with: "Read AGENTS.md and @docs/BUILD_SPEC.md and tell me your plan. Do not create files yet."
4. After each phase, run or check what OpenCode produced using the acceptance tests in the phase table. Reply "approved" or paste any error.
5. **You build the n8n workflow by hand.** OpenCode does not make an importable workflow file. It supplies the code files and node cheat-sheet, and you follow Part B of the execution guide to click it together in n8n.
6. Things only you can do: sign in to Google and n8n, paste API keys, build the nodes in n8n, open the official web pages and confirm links, click Approve in the approval email, and record the demo.

# Part B. Build Brief (for the LLM)

## B1. Role

You are a senior AI product engineer and n8n automation expert. You are running inside OpenCode in the terminal of Cursor, on the project folder `milestone5`, on Windows. Create and edit files directly in the project folder. Build the project below for a beginner: give exact commands and click-by-click instructions, and explain every technical term in one short sentence the first time you use it.

## B2. Objective

Build an AI-powered workflow that turns raw customer reviews of the **ChatGPT mobile app** into actionable product insights and ready-to-use support communication. The product goal is to **increase usage of voice input** on the ChatGPT mobile app. The workflow must:

1. Cluster recent reviews into at most 5 themes and identify the top 3 themes.
2. Extract exactly 3 real, word-for-word user quotes.
3. Identify exactly 1 recurring confusion or pain point about a fee or charge.
4. Write a Weekly Product Pulse (internal, 250 words or fewer).
5. Write a Fee Explainer (6 bullets or fewer, neutral and facts-only, 2 official source links, "Last checked: DATE"), derived from the identified fee issue.
6. In **n8n**, after a human **approval step**, (a) append an entry to a Google Doc and (b) create a Gmail draft. **Never auto-send email.** Nothing may be written anywhere before approval.
7. **The human builds the n8n workflow manually.** You supply everything needed to do that: an n8n node cheat-sheet with exact settings and copy-paste code and prompts. Do NOT output an n8n workflow JSON file.

## B3. Assumptions (use these; do not ask questions)

- Data: public Google Play reviews for the last 12 weeks, exported to one CSV. If the user uploads a CSV, use it as is and skip scraping.
- Language: English. Tools: n8n (Cloud or Docker), Google Docs, Gmail, and one LLM API (Claude, GPT or Gemini).
- The fee issue is whatever the reviews show most clearly (likely subscription, billing or paid-limit confusion). **Choose it from the data, never in advance.**
- The user is on Windows in the Cursor terminal (PowerShell by default). Node.js is installed. The user's Python installation is broken, so **use Node.js for all scripts and do not use Python** (see B8).

## B4. Hard Rules

1. **Never invent user quotes.** Quotes must be copied character for character from the CSV and verified by code.
2. **Never invent URLs or facts.** Use placeholders such as `<VERIFIED_URL_1>` and tell the user how to verify each one (official domain, page opens, page answers the fee issue). Source facts must come from text the user pastes in.
3. Do not edit review wording during cleaning. The only allowed change is masking personal data as `[EMAIL]` and `[PHONE]`. Drop reviewer names.
4. The workflow must contain **no Gmail Send operation**. Use Gmail **Draft: Create** only.
5. The approval node must come before every action node. A timeout counts as Reject.
6. Pulse: 250 words or fewer. Fee Explainer: 6 bullets or fewer, neutral tone, no words like "sorry", "unfortunately", "guarantee", "always", "never".
7. Never place API keys or tokens in any file the user will submit.
8. Work in phases. After each phase, list the files created, how to test them, and stop for confirmation.
9. Ask before installing any global package, deleting any file, or running the review scraper. Keep API keys in a `.env` file that is listed in `.gitignore`, never in code or documents.

## B5. Deliverables (exact file names)

```
milestone5/
  README.md
  data/reviews_clean.csv
  data/reviews_sample.csv            (20 rows, no personal data)
  prompts/insights_prompt.txt
  prompts/pulse_prompt.txt
  prompts/fee_explainer_prompt.txt
  outputs/insights.json
  outputs/weekly_pulse.md
  outputs/fee_explainer.json
  outputs/notes_doc_snippet.md       (the entry appended to the Google Doc)
  outputs/email_draft.txt
  docs/source_list.md                (4 to 6 URLs, placeholders until verified)
  package.json
  scripts/collect_reviews.js         (see B8)
  scripts/clean_reviews.js
  scripts/verify_insights.js
  scripts/check_pulse.js
  n8n/code/format_reviews.js         (code for the n8n Code nodes, copy-paste ready)
  n8n/code/check_insights.js
  n8n/code/check_pulse.js
  n8n/code/check_fee.js
  n8n/code/merge_payload.js
  n8n/node_cheatsheet.md             (every node: name, type, exact settings, code, prompt)
  AGENTS.md                          (project rules, created with /init and edited by the user)
  docs/BUILD_SPEC.md                 (this file)
  docs/test_report.md
  demo/demo_script.md                (3 minutes or less)
```

## B6. Phase Plan with Acceptance Tests

| Phase | Build | Acceptance test |
|---|---|---|
| 1 | Folders, Node.js data collection and cleaning scripts, the sample CSV | 200 to 1,000 rows; columns `review_id,date,rating,text`; dates within 12 weeks; no names, emails or phones |
| 2 | Insights prompt and `verify_insights.js` | At most 5 themes; 3 top themes; 3 quotes all found word for word; fee issue backed by at least 3 real review IDs |
| 3 | Pulse prompt and `check_pulse.js` | 250 words or fewer; four sections; exactly 3 action ideas; quotes identical to insights.json |
| 4 | Fee Explainer prompt and source-verification checklist | 6 bullets or fewer; neutral; 2 links; `last_checked` equals today; every bullet traceable to supplied source facts |
| 5 | `n8n/node_cheatsheet.md` part 1: nodes 1 to 11 (form upload, read CSV, format reviews, LLM nodes, check nodes, merged payload) | Following the cheat-sheet by hand, the human reaches a Merge Payload output with all six fields |
| 6 | `n8n/node_cheatsheet.md` part 2: approval gate, IF branch, Google Docs append, Gmail draft, reject path | Approve creates 1 Doc entry and 1 draft; Reject creates nothing; no Send operation exists |
| 7 | README, notes snippet, email draft text, source list, demo script, final checklist | Every item in B5 exists |

## B7. Specifications

### B7.1 CSV schema

| Column | Type | Notes |
|---|---|---|
| review_id | string | Unique |
| date | date | Within the last 12 weeks |
| rating | integer 1 to 5 | |
| text | string | Five or more words; personal data masked |

Cleaning: remove duplicate IDs and identical texts, collapse whitespace, drop reviews under 5 words, mask emails and phone numbers, keep English only. Keep every review that mentions charge-related words (charge, billing, subscription, refund, price, renew, plus, paid) if sampling is needed.

### B7.2 Insights prompt (save as prompts/insights_prompt.txt)

```
You are a product analyst for the ChatGPT mobile app (goal: increase voice input usage).
From the reviews below:
1. Group into AT MOST 5 themes (name, one-line description, review_ids, count, voice_relevance: high|medium|low|none).
2. Pick the TOP 3 themes by count (ties: lower average rating first).
3. Give EXACTLY 3 quotes copied WORD FOR WORD from single reviews, under 30 words each, with review_id and theme. Do not fix spelling or combine reviews.
4. Find EXACTLY 1 recurring confusion or pain point about a fee or charge, backed by at least 3 review_ids. If none exists, set found to false and explain.
5. Add a 1-2 sentence key observation about what is going wrong or trending.
Use ONLY the reviews. Never invent quotes or numbers. Return ONLY valid JSON:
{"themes":[{"name":"","description":"","review_ids":[],"count":0,"voice_relevance":""}],
 "top_themes":["","",""],
 "quotes":[{"text":"","review_id":"","theme":""}],
 "fee_issue":{"found":true,"title":"","description":"","supporting_review_ids":[],"count":0},
 "key_observation":""}
REVIEWS:
{{reviews_block}}
```

Reviews block format, one per line: `[review_id] (rating, YYYY-MM-DD) text`. If the block is too long, process batches of about 100 reviews, then merge candidate themes in a second call. Use temperature 0.

### B7.3 Verification rules for insights.json

- `len(themes) <= 5`, `len(top_themes) == 3`, `len(quotes) == 3`.
- Every `quotes[i].text` is a substring of the concatenated CSV text.
- Every ID in `fee_issue.supporting_review_ids` exists in the CSV and there are at least 3.
- On failure: re-run with "Previous output failed: REASON. Copy quotes character for character."

### B7.4 Pulse prompt (save as prompts/pulse_prompt.txt)

```
Write a Weekly Product Pulse for the ChatGPT mobile product team (goal: increase voice input usage).
Markdown, 250 words MAX including headings. Sections:
## Top Themes (3 bullets, include review counts)
## What Users Are Saying (the 3 quotes, verbatim, in quotation marks, with theme)
## Key Observation (2-3 sentences; mention the fee issue, and voice input if relevant)
## Action Ideas (exactly 3 numbered, specific and testable)
Use ONLY this JSON. No new facts or quotes.
{{insights_json}}
```

Validation: word count 250 or fewer; exactly 3 numbered items under Action Ideas; each quote appears in insights.json. On failure retry once: "Your output was N words. Rewrite in 220 words or fewer."

### B7.5 Fee Explainer prompt (save as prompts/fee_explainer_prompt.txt)

```
Write a customer Fee Explainer for support teams.
Issue found in reviews: {{fee_issue_title}} - {{fee_issue_description}}
Use ONLY these official source facts (do not add outside facts): {{source_facts}}
Links: 1) {{source_url_1}}  2) {{source_url_2}}
Rules: 6 bullets MAX; neutral, facts-only; no apology, promises, blame or marketing;
no exact prices or limits unless they appear in the source facts; no words
"sorry", "unfortunately", "guarantee", "always", "never".
Return ONLY JSON: {"bullets":[],"source_links":["url1","url2"],"last_checked":"YYYY-MM-DD"}
```

The LLM must also write a short **source-verification checklist** for the user: find the official Help Center article and official pricing page (and the Apple or Google Play subscription help page if app-store billing is involved), confirm each URL is on an official domain, loads, and answers the fee issue, then paste 3 to 6 facts per page into `SOURCE_FACTS` and the two chosen URLs into the placeholders.

### B7.6 n8n node cheat-sheet specification

The human builds the workflow by hand on **n8n Cloud** (browser). Write `n8n/node_cheatsheet.md` so a beginner can follow it with no other help. For each node give: exact node name (rename with F2), node type, every setting to change, and any code or prompt in a copy-paste block. Mention that fields containing `{{ ... }}` must be switched to **Expression** mode. Tell the human to use **Execute step** on each node and **pin** the output to avoid repeat AI costs.

Use exactly these nodes and names (the code refers to them):

| # | Name | Type | Configuration |
|---|---|---|---|
| 1 | Upload Reviews | On form submission (Form Trigger) | One File field "Reviews CSV", accept .csv. n8n Cloud cannot read local folders, so the CSV is uploaded through this form |
| 2 | Read CSV | Extract From File | Operation Extract From CSV; Input Binary Field = the binary field name shown on node 1 |
| 3 | Format Reviews | Code (Run Once for All Items) | Take the first 300 rows; output `reviews_block`, `all_text`, `valid_ids`, `review_count` |
| 4 | Insights LLM | Basic LLM Chain + chat model | Temperature 0; insights prompt with `{{ $json.reviews_block }}` |
| 5 | Check Insights | Code | Strip code fences, JSON.parse, enforce B7.3 using `$('Format Reviews').first().json`, throw an Error on any failure |
| 6 | Pulse LLM | Basic LLM Chain + chat model | Pulse prompt with `{{ JSON.stringify($json) }}` |
| 7 | Check Pulse | Code | Throw if over 250 words, not exactly 3 numbered actions, or a quote is missing |
| 8 | Source Facts | Set (Edit Fields) | Strings `source_facts`, `source_url_1`, `source_url_2` (the human fills these in) |
| 9 | Fee LLM | Basic LLM Chain + chat model | Fee Explainer prompt using Check Insights fee issue and Source Facts values; `last_checked` from `{{ $now.format('yyyy-MM-dd') }}` |
| 10 | Check Fee | Code | Throw if over 6 bullets, not exactly 2 links, missing date, or banned wording |
| 11 | Merge Payload | Code | Build the merged payload below |
| 12 | Approval Gate | Gmail: Send message and wait for response | Response Type Approval; Approve and Disapprove; message shows the full payload; wait limit 24 h (timeout counts as Reject) |
| 13 | Approved? | If | Boolean: approval field (such as `data.approved`) is true; the human confirms the field name from the node output |
| 14 | Append to Doc | Google Docs: Update, Action Insert | Entry template below, using `$('Merge Payload').first().json` |
| 15 | Create Draft | Gmail: Create a draft | **Never Send message.** Template below |
| 16 | Rejected | No Operation | On the false branch of node 13 |

Connection order: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13; true branch of 13 goes to 14 then 15; false branch of 13 goes to 16.

Merged payload (output of node 11):

```json
{
  "date": "YYYY-MM-DD",
  "top_themes": ["", "", ""],
  "weekly_pulse": "",
  "identified_fee_issue": "",
  "explanation_bullets": [""],
  "source_links": ["<VERIFIED_URL_1>", "<VERIFIED_URL_2>"],
  "last_checked": "YYYY-MM-DD"
}
```

Google Doc entry template:

```
=== {{date}} ===
Top themes: {{top_themes joined by ", "}}

Weekly Pulse:
{{weekly_pulse}}

Identified fee issue: {{identified_fee_issue}}

Explanation:
- {{each explanation bullet}}

Sources: {{source_links joined by " | "}}
Last checked: {{last_checked}}
```

Email draft: Subject `Weekly Product Pulse + Customer Clarification — {{date}}`. Body: greeting, "WEEKLY PRODUCT PULSE" with the pulse, "CUSTOMER CLARIFICATION (reusable support snippet)" with the fee issue and bullets, then sources and "Last checked: {{date}}".

Code-node rules: use plain JavaScript that works in the n8n Code node, throw a clear `Error` with a readable reason when a check fails, and avoid the characters `{{` and `}}` inside prompts except where an n8n expression is intended.

MCP requirement: offer two options and recommend the simple one. (a) Native Google Docs and Gmail nodes behind the approval gate, with the README explaining they are the tool layer. (b) Advanced: an AI Agent node with the MCP Client Tool connected to Google Docs and Gmail MCP servers, placed after the approval gate, with a system message limiting it to "append the given entry to the notes doc and create one email draft; never send email".

If the human pastes an n8n error or a screenshot, explain it in plain language first, then give the exact fix.

## B8. Scripting Language: Node.js (required)

Write every script in **Node.js (JavaScript)**. Do not use Python. Use one module style consistently (ES modules with `"type": "module"` in `package.json`, or CommonJS) and make sure the scripts run with `node scripts/<name>.js`.

- `scripts/collect_reviews.js`: use the npm package `google-play-scraper`. Fetch English reviews newest first, paginate until reviews are older than 12 weeks, and stop. Put the app id and country in a small config file with a placeholder app id for the human to fill in. Save `data/reviews_raw.csv` with columns `review_id,date,rating,text`. If `data/reviews_raw.csv` already exists, tell the human and skip scraping. Never run this script yourself without the human's approval.
- `scripts/clean_reviews.js`: use a CSV library such as `csv-parse` and `csv-stringify` (or `papaparse`). Apply B7.1. Write `data/reviews_clean.csv` and a 20-row `data/reviews_sample.csv`.
- `scripts/verify_insights.js`: implements B7.3 against `data/reviews_clean.csv` and `outputs/insights.json`.
- `scripts/check_pulse.js`: implements the B7.4 validation against `outputs/weekly_pulse.md`.
- **If the scraper fails** (blocked or changed by the store), tell the human to obtain a public reviews CSV another way, save it as `data/reviews_raw.csv`, and run only the clean script. Do not scrape any other site, and do not suggest scraping against a site's terms of use.

## B9. Documentation to Produce

- **README.md** with exactly three required sections: **How to run**, **Where MCP approval happens**, **Fee issue identified** (title, 1 to 2 sentences, number of supporting reviews). Add assumptions, date range, and the MCP approach used.
- **demo/demo_script.md**: 3 minutes or less: CSV sample (20 s), run workflow (40 s), pulse and explainer (40 s), approval click (30 s), Doc entry and draft, not sent (30 s), reject path (20 s).
- **docs/source_list.md**: 4 to 6 URLs as placeholders with the "how to verify" rule.
- **Test report template** covering: theme count, quote authenticity, fee-to-review linkage, pulse word limit, explainer bullets and links, approval before action, reject path, no auto-send (no Send node; Sent folder unchanged), no personal data.

## B10. Output Format for Your Replies

1. Start each phase with one sentence on its goal.
2. Create and edit the files directly in the project folder. Do not paste whole files into the chat.
3. Then list the files you created or changed, and give the exact commands for the human to run in the Cursor terminal, with the expected result.
4. End the phase with "Reply **approved** to continue to Phase N+1, or paste any error."
5. Explain any error message the human pastes in plain language before giving the fix.

## B11. Final Self-Check (run before declaring the build complete)

- [ ] Themes 5 or fewer, top 3 identified, exactly 3 quotes verified word for word
- [ ] Exactly 1 fee issue, backed by at least 3 real reviews, used as the basis of the Fee Explainer
- [ ] Pulse 250 words or fewer with themes, quotes, observation and 3 actions
- [ ] Explainer 6 bullets or fewer, neutral, 2 official links (verified by the user), "Last checked" date
- [ ] Approval gate sits before the Doc append and the Gmail draft; Reject creates nothing
- [ ] No Send operation anywhere; email exists only as a draft
- [ ] No invented quotes, URLs or facts; no personal data; no keys in files
- [ ] All files in B5 exist; README has the three required sections
