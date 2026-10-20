# Test report

Fill this in after a real run. Record the date, who ran it, the CSV used, and the actual result for each row. Use the exact commands or n8n node names shown.

Run info:
- Date: `<DATE>`
- Operator: `<NAME>`
- CSV used: `data/reviews_sample.csv` / `data/reviews_clean.csv`
- Insights LLM model: `<MODEL>`

| # | Check | How to test | Expected | Result | Notes |
|---|---|---|---|---|---|
| 1 | Theme count | Look at `themes` in `outputs/insights.json` (node 5 `Check Insights` output) | 5 themes or fewer; `top_themes` has exactly 3 | `<PASS/FAIL>` | |
| 2 | Quote authenticity | Run `node scripts/verify_insights.js` (or rely on node 5) | Exactly 3 quotes; each found word for word in the reviews; no invented text | `<PASS/FAIL>` | |
| 3 | Fee-to-review linkage | Check `fee_issue.supporting_review_ids` in `outputs/insights.json` | Exactly 1 fee issue, backed by at least 3 real review IDs that exist in the CSV | `<PASS/FAIL>` | |
| 4 | Pulse word limit | Run `node scripts/check_pulse.js` (or node 7 `Check Pulse`) | 250 words or fewer; 4 sections; exactly 3 numbered action ideas; all 3 quotes verbatim | `<PASS/FAIL>` | |
| 5 | Explainer bullets and links | Check node 10 `Check Fee` output | 6 bullets or fewer; exactly 2 source links; `last_checked` equals today; no banned wording (sorry, unfortunately, guarantee, always, never) | `<PASS/FAIL>` | |
| 6 | Approval before action | Inspect the workflow connections in n8n | Node 12 `Approval Gate` sits before node 14 `Append to Doc` and node 15 `Create Draft`; both are reachable only through the true branch of node 13 `Approved?` | `<PASS/FAIL>` | |
| 7 | Reject path | Run the workflow and click Disapprove (or let the 24 h wait expire) | Node 16 `Rejected` is reached; Google Doc unchanged; no new draft; nothing written | `<PASS/FAIL>` | |
| 8 | No auto-send | Search all nodes for a Gmail Send operation; open Gmail Sent folder after an approval run | No Send node exists anywhere; the approval email is the only outgoing message; the pulse message stays in Drafts; Sent folder unchanged | `<PASS/FAIL>` | |
| 9 | No personal data | Inspect `data/reviews_clean.csv` and `data/reviews_sample.csv` | No reviewer names; emails masked as `[EMAIL]`; phone numbers masked as `[PHONE]` | `<PASS/FAIL>` | |
| 10 | No invented sources | Compare `docs/source_list.md` and node 8 `Source Facts` with a browser | Every URL verified by the owner (official domain, page opens, answers the fee issue); no leftover `<VERIFIED_URL_...>` placeholders in node 8 | `<PASS/FAIL>` | |
| 11 | No keys in files | Search the project files for API keys or tokens | No API keys or tokens in any file; keys live only in n8n credentials (or `.env`, which is listed in `.gitignore`) | `<PASS/FAIL>` | |

Overall result: `<PASS/FAIL>`
Blocking issues: `<LIST OR NONE>`
