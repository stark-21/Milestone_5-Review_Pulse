# Milestone 5 — Review-to-Insight Workflow (ChatGPT mobile app)

This project turns recent Google Play reviews of the ChatGPT mobile app into product insights, a Weekly Product Pulse and a customer Fee Explainer. After a human approves, it appends one entry to a Google Doc and creates one Gmail draft. Product goal: increase usage of voice input. The n8n workflow is built by hand (see `n8n/node_cheatsheet.md`), and nothing is ever sent automatically.

Everything here is Node.js and n8n: no Python, no API keys in project files, no invented quotes, URLs or facts.

## Contents

- [What the workflow does](#what-the-workflow-does)
- [Prototype](#prototype)
- [How to run](#how-to-run)
- [Where MCP approval happens](#where-mcp-approval-happens)
- [Fee issue identified](#fee-issue-identified)
- [The rules the workflow enforces](#the-rules-the-workflow-enforces)
- [Local checks and tests](#local-checks-and-tests)
- [Results of the run (2026-10-20)](#results-of-the-run-2026-10-20)
- [Sources](#sources)
- [Project files](#project-files)
- [Privacy, safety and secrets](#privacy-safety-and-secrets)
- [Notes and known issues](#notes-and-known-issues)
- [Assumptions](#assumptions)

## What the workflow does

One CSV of public reviews goes in. Three AI steps and three check steps follow, and a human approval gate sits in front of every write.

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | Upload Reviews | Form Trigger | One file field, `.csv` only. n8n Cloud cannot read local folders, so the file is uploaded here. |
| 2 | Read CSV | Extract From File | Parses the uploaded CSV with a header row. |
| 3 | Format Reviews | Code | Drops invalid rows, removes duplicate IDs and identical texts, and keeps up to 300 rows with charge-related reviews first. Outputs `reviews_block`, `all_text`, `valid_ids`, `review_count`. |
| 4 | Insights LLM | Basic LLM Chain + chat model | Themes, top 3 themes, 3 verbatim quotes, one fee issue, one key observation. |
| 5 | Check Insights | Code | Parses the JSON and throws a readable error if any insight rule is broken. |
| 6 | Pulse LLM | Basic LLM Chain + chat model | Weekly Product Pulse, 250 words or fewer. |
| 7 | Check Pulse | Code | Word count, section count, exactly 3 action ideas, quotes unchanged. |
| 8 | Source Facts | Set (Edit Fields) | The two verified source URLs and the verified facts the explainer may use. |
| 9 | Fee LLM | Basic LLM Chain + chat model | Fee Explainer: at most 6 neutral bullets, 2 links, `last_checked` date. |
| 10 | Check Fee | Code | Bullet count, link count, date present, banned wording. |
| 11 | Merge Payload | Code | One payload: date, top themes, pulse, fee issue, bullets, links, `last_checked`. |
| 12 | Approval Gate | Gmail: Send message and wait for response | Sends the approval request with Approve / Disapprove buttons, waits up to 24 h. |
| 13 | Approved? | If | True branch → 14, false branch → 16. A timeout counts as Reject. |
| 14 | Append to Doc | Google Docs: Update, Action Insert | Appends one `=== <date> ===` entry to the notes doc. |
| 15 | Create Draft | Gmail: Create a draft | Creates one draft. Never sends. |
| 16 | Rejected | No Operation | Ends the run. Nothing is written. |

The numbers are the ones used in `n8n/node_cheatsheet.md` and in `docs/test_report.md`. The exported `n8n/workflow.json` lists 19 nodes because each of the three LLM chains carries its own chat-model node.

## Prototype

- **Prototype link (n8n form):** https://tejas2103.app.n8n.cloud/form/a0920746-7371-4e5b-a0c1-2e5531c6c3a4
- **GitHub repository:** https://github.com/stark-21/Milestone_5-Review_Pulse
- **Input file:** `data/reviews_clean.csv` (700 rows). Download it from the repository: https://github.com/stark-21/Milestone_5-Review_Pulse/blob/main/data/reviews_clean.csv (open the file and click the download icon, "Download raw file").

To try it: open the link, upload `data/reviews_clean.csv` and submit. The form confirms straight away and the workflow keeps running in the background for about 1 to 3 minutes, then pauses at the approval step. The approval email goes to the project owner's Gmail, so only the owner can approve a run. Please use the 700-row file. The 20-row sample may not contain enough charge-related reviews to pass the fee-issue check.

## How to run

**A. Get the review data**

1. Install dependencies: `npm install` (Node.js only, no Python).
2. Open `scripts/collect_config.json` and check the settings: app id `com.openai.chatgpt`, country `us`, 8 weeks.
3. Run `npm run collect`. It reads reviews newest first and pages back until the 8-week cutoff. The app gets many reviews a day, so this takes a while. Progress is saved as it goes; if it stops, run the same command again and it resumes. Output: `data/reviews_raw.csv`.
4. Run `npm run clean`. It removes duplicates, reviews under 5 words and non-English reviews, masks emails as `[EMAIL]` and phone numbers as `[PHONE]`, and never changes any other wording. It then trims the data to 700 reviews: up to 150 charge-related reviews are kept and the rest are spread evenly across the weeks. Output: `data/reviews_clean.csv` and a 20-row `data/reviews_sample.csv`. The script prints how many rows were kept per week and how many emails and phone numbers were masked.
5. Check the file: 700 rows, columns `review_id,date,rating,text`. **Date range:** 2026-08-25 to 2026-10-18 (about 8 weeks).

If scraping is blocked by the store, get a public reviews CSV another way, save it as `data/reviews_raw.csv` with the same four columns, and run only step 4.

**B. Set up n8n (one time)**

6. In n8n, create a workflow and import `n8n/workflow.json` (menu, Import from file). To build it by hand instead, follow `n8n/node_cheatsheet.md` (16 nodes).
7. Add three credentials. Nodes with a red warning show where.
   - OpenAI, used by Insights LLM, Pulse LLM and Fee LLM. Do not add a Sampling Temperature option; the model rejects it.
   - Gmail (sign in with Google), used by Approval Gate and Create Draft.
   - Google Docs (sign in with Google), used by Append to Doc.
8. Open **Approval Gate** and put your own email address in **To** (the export ships the placeholder `your-email@example.com`).
9. Open **Append to Doc** and paste the web address of your Google Doc into **Doc ID or URL** (the export ships the placeholder `YOUR_GOOGLE_DOC_URL`). The Doc is named "Weekly Product Pulse Log".
10. Open **Source Facts** and check the two official links and the facts text. They are already filled in from the two pages listed under Sources. If you re-run this later, read the pages again, update the facts and the "Last checked" date.
11. Make sure no node has a purple pin (pinned nodes reuse old saved data). **Approval Gate** must never be pinned.

**C. Run it**

12. Click Execute workflow (or use the published form link). Open the form, upload `data/reviews_clean.csv` and submit.
13. The chain runs: read CSV → format → Insights LLM → check → Pulse LLM → check → Source Facts → Fee LLM → check → merge payload → approval email. Each check node stops the run with a clear message if an output breaks a rule (see the rules below).
14. Open the email "Approve Weekly Product Pulse" (look in Spam if needed), read it, and click **Approve** or **Decline**.
15. If you approved: one entry is appended to the Google Doc (it starts with `=== <date> ===`) and one Gmail **draft** is created (check Drafts; Sent stays empty). If you declined: the run ends at the Rejected node and nothing is written anywhere.

**D. Local checks**

`npm test` runs the offline checks in this repository (see [Local checks and tests](#local-checks-and-tests)). After a live run, save the AI outputs as files to run the same rules a second time outside n8n:

- `npm run verify` → `node scripts/verify_insights.js`, expects `outputs/insights.json`
- `npm run check:pulse` → `node scripts/check_pulse.js`, expects `outputs/weekly_pulse.md`

The same rules already run inside n8n, so these are only a second look.

## Where MCP approval happens

The approval step is n8n node **12, Approval Gate** (Gmail: Send message and wait for response, Response Type Approval, Approve and Decline buttons). It is the only Gmail send in the workflow, and it sends just the approval request to the owner. It sits **before every writing action**: node 14 (Google Docs append) and node 15 (Gmail draft) are reachable only through node 13 (`Approved?`), and the false branch ends at node 16 (`Rejected`), where nothing is written. The wait is limited to 24 hours; the Doc and draft actions run only on an explicit Approve.

**MCP approach used:** the simple option. Native Google Docs and Gmail nodes act as the tool layer behind the approval gate. The MCP Client Tool node is not used. The only outgoing message is the approval request; the customer-facing email exists only as a draft, so there is no Send operation for the pulse or the explainer anywhere in the workflow.

## Fee issue identified

- **Title:** Unexpected or duplicate charges and lack of access after payment.
- **Description:** Several users report being charged twice, or paying for the paid plan and still seeing the free service, which points to billing failures and an unclear refund and support flow.
- **Supporting reviews:** 4 real review IDs (minimum 3). The check node confirms every ID exists in the data, and the reviews were read by hand.

The Fee Explainer answers this issue using only facts from two official OpenAI Help Center articles (below), last checked 2026-10-20.

## The rules the workflow enforces

Each check node throws a readable error and stops the run when a rule is broken.

| Step | Rules |
|---|---|
| Check Insights | At most 5 themes, exactly 3 top themes, exactly 3 quotes found word for word in the reviews, exactly one fee issue |
| Check Insights (fee IDs) | The fee issue must be backed by **at least 3 distinct review IDs** that really exist in the reviews. IDs are compared as exact strings against `valid_ids` from Format Reviews, duplicates are collapsed, IDs that are not in the reviews are dropped, and the count is the number of **distinct** supporting reviews. Fewer than 3 distinct IDs stops the run and the error lists the IDs that did not match. If the model reports `found: false`, the IDs and the count are cleared to `[]` and `0`. |
| Check Pulse | 250 words or fewer, 4 sections, exactly 3 numbered action ideas, all 3 quotes verbatim |
| Check Fee | 6 bullets or fewer, exactly 2 source links, `last_checked` equals today, no banned wording (sorry, unfortunately, guarantee, always, never) |
| Approval | Nothing is written unless the approval email is answered with Approve. Reject and the 24 h timeout both write nothing. |

The prompts that feed the AI nodes live in `prompts/`. The insights prompt tells the model to copy each supporting review ID exactly as printed in square brackets before its review, never to invent, shorten, re-case or modify an ID, and to set `found` to `false` with an empty ID list when fewer than 3 distinct reviews support the same problem.

## Local checks and tests

Run the offline test suites. They need neither n8n nor network access:

```
npm test
```

- `scripts/test_check_insights_fee.js` (12 cases) compiles the real `n8n/code/check_insights.js` file and runs it, so the test can never drift from the code that n8n executes. It covers three distinct valid IDs, duplicate-only IDs, unknown IDs, ordering, `found: false`, a missing or non-boolean `found`, a non-list ID field, and numeric IDs.
- `scripts/test_workflow_sync.js` (6 checks) compares `n8n/workflow.json` with the project files: every Code node must equal its file in `n8n/code/`, the embedded Insights prompt must equal `prompts/insights_prompt.txt`, the prompt must still state the fee-evidence rules, no Gmail node may send mail on its own, the Doc and draft must be reachable only through the approval branch, and the export must not contain credentials or API keys. It also lists the placeholders you must fill in n8n before a live run.

Expected output: `12 of 12 cases passed.` and `6 of 6 checks passed.`, exit code 0.

## Results of the run (2026-10-20)

Top 3 themes: Subscription & Paywall Pressure (18 reviews), Accuracy, reliability & performance issues (7), Image/photo limits & lack of transparency (7). Other themes: Billing errors & account access problems (6) and Voice features & capture quality (5, voice relevance high).

Three quotes, each found word for word in the data:

- "because it has limited access in free but has full access in plus(subscription)"
- "I have been charged 2 time for the chatgpt plus, and my account still shows the free service"
- "amazing AI ,voice interactive AI is too good"

The pulse came to 209 words with 3 action ideas. Full outputs: `outputs/weekly_pulse.md`, `outputs/notes_doc_snippet.md`, `outputs/email_draft.txt`.

## Sources

1. https://help.openai.com/en/articles/7232895-how-do-i-request-a-refund-for-my-chatgpt-subscription
2. https://help.openai.com/en/articles/20001043-how-do-i-avoid-being-charged-twice-if-i-subscribe-to-chatgpt-on-ios-android-and-the-web
3. https://play.google.com/store/apps/details?id=com.openai.chatgpt (the listing the reviews were collected from)
4. https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/ (Gmail node: Message → Send is the approval request, Draft → Create is the only other mail operation)

Both Help Center pages were updated shortly before they were read, so re-check them before reusing the facts. `docs/source_list.md` keeps the placeholder list for anything that has not been verified.

## Project files

| Path | What it is |
|---|---|
| `n8n/workflow.json` | Exported workflow. The Code nodes and the Insights prompt inside it are kept in sync with the files below; `npm test` proves it. |
| `n8n/node_cheatsheet.md` | Click-by-click build guide for the 16 nodes. |
| `n8n/code/format_reviews.js` | Code for node 3. |
| `n8n/code/check_insights.js` | Code for node 5. |
| `n8n/code/check_pulse.js` | Code for node 7. |
| `n8n/code/check_fee.js` | Code for node 10. |
| `n8n/code/merge_payload.js` | Code for node 11. |
| `prompts/insights_prompt.txt` | Prompt for node 4. |
| `prompts/pulse_prompt.txt` | Prompt for node 6. |
| `prompts/fee_explainer_prompt.txt` | Prompt for node 9. |
| `scripts/collect_reviews.js`, `scripts/collect_config.json` | Google Play review collector and its settings. |
| `scripts/clean_reviews.js` | Cleaning and sampling. |
| `scripts/verify_insights.js` | Local mirror of the insights rules. |
| `scripts/check_pulse.js` | Local mirror of the pulse rules. |
| `scripts/test_check_insights_fee.js`, `scripts/test_workflow_sync.js` | Offline test suites. |
| `data/reviews_clean.csv` | 700 cleaned reviews, the input for a run. |
| `data/reviews_sample.csv` | 20-row sample for the demo. |
| `outputs/` | Saved results of the last run (pulse, doc entry, email draft). |
| `docs/BUILD_SPEC.md` | The build specification this project follows. |
| `docs/test_report.md` | Manual test checklist, to be filled in after a real run. |
| `docs/source_list.md` | Source URL placeholders and the rule for verifying a page. |
| `demo/demo_script.md` | 3-minute demo script. |
| `screenshots/` | Approval email, doc entry, draft, and the approve/reject paths. |

## Privacy, safety and secrets

- Reviews are public Google Play reviews. No reviewer names are kept, emails are masked as `[EMAIL]` and phone numbers as `[PHONE]`, and no other review wording is changed.
- API keys are entered only in n8n credentials. No project file contains a key or token, and `.env` is listed in `.gitignore` if you need one locally. The exported workflow references n8n credentials by id and name only; no key material is stored in the repository.
- The only outgoing message is the approval request to the owner. The pulse and the explainer are written to a Google Doc entry and to a Gmail draft, never sent.
- No quote, review ID, URL or fact is invented. The ID check rejects invented IDs, the quote check rejects reworded quotes, and the source list keeps placeholders until a page is verified by hand.

## Notes and known issues

- A temperature error means the OpenAI node still has a Sampling Temperature option; remove it.
- In Code nodes use `$now.toFormat(...)`, not `$now.format(...)`.
- If a check node fails with "quotes not found", run the AI node before it again. The model varies slightly between runs. The pulse is written to 200 words or fewer and the check stops the run above 250.
- If the run skips the approval pause, Approval Gate is pinned. Unpin it.
- If the request is too long, lower the review limit in `Format Reviews` (`MAX_ROWS`, currently 300) and re-import the workflow. The exported copy used 700 while `n8n/code/format_reviews.js` and the cheat sheet used 300; the export now matches the 300 used by the guide.
- The live n8n workflow is a copy. The changes in this repository (the distinct review ID rule and the `found: false` handling) are in the exported JSON; re-import `n8n/workflow.json` or re-paste the Check Insights code into the live workflow to pick them up. Nothing in this repository was imported, executed or published to the live n8n instance.
- The fee issue rests on 4 reviews, so treat it as a signal to look into and not as a measured rate.
- `outputs/insights.json` and `outputs/fee_explainer.json` are not kept in the repository. Save them from a run if you want to use `npm run verify`.

## Assumptions

Public Google Play reviews (US, English) for the last 8 weeks in one CSV; n8n Cloud with Google Docs, Gmail and OpenAI (gpt-5-mini); the fee issue is chosen from the reviews, never in advance; all scripts are Node.js; API keys are entered only into n8n credentials, never into project files. The 700-review file over-represents charge-related reviews on purpose, so theme counts describe this sample and not all ChatGPT reviews.
