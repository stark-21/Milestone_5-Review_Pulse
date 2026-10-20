# Milestone 5 — Review-to-Insight Workflow (ChatGPT mobile app)

This project turns recent Google Play reviews of the ChatGPT mobile app into product insights, a Weekly Product Pulse and a customer Fee Explainer. After a human approves, it appends one entry to a Google Doc and creates one Gmail draft. Product goal: increase usage of voice input. The n8n workflow is built by hand (see `n8n/node_cheatsheet.md`), and nothing is ever sent automatically.

## Prototype

- **Prototype link (n8n form):** [PASTE PRODUCTION URL HERE]
- **GitHub repository:** [PASTE REPO LINK HERE]
- **Input file:** `data/reviews_clean.csv` (700 rows). Download it from the repository: [PASTE GITHUB FILE LINK HERE] (open the file and click the download icon, "Download raw file").
- **Hosting:** n8n Cloud free trial, active until [PASTE TRIAL END DATE].

To try it: open the link, upload `data/reviews_clean.csv` and submit. The form confirms straight away and the workflow keeps running in the background for about 1 to 3 minutes, then pauses at the approval step. The approval email goes to the project owner's Gmail, so only the owner can approve a run; the steps and expected results are documented below. Please use the 700-row file. The 20-row sample may not contain enough charge-related reviews to pass the fee-issue check.

## How to run

**A. Get the review data**

1. Install dependencies: `npm install` (Node.js only, no Python).
2. Open `scripts/collect_config.json` and check the settings: app id `com.openai.chatgpt`, country `us`, 8 weeks.
3. Run `npm run collect`. It reads reviews newest first and pages back until the 8-week cutoff. The app gets many reviews a day, so this takes a while. Progress is saved as it goes; if it stops, run the same command again and it resumes. Output: `data/reviews_raw.csv`.
4. Run `npm run clean`. It removes duplicates, reviews under 5 words and non-English reviews, masks emails as `[EMAIL]` and phone numbers as `[PHONE]`, and never changes any other wording. It then trims the data to 700 reviews: up to 150 charge-related reviews are kept and the rest are spread evenly across the weeks. Output: `data/reviews_clean.csv` and a 20-row `data/reviews_sample.csv`. The script prints how many rows were kept per week and how many emails and phone numbers were masked.
5. Check the file: 700 rows, columns `review_id,date,rating,text`. **Date range:** covers 2026-08-24 to 2026-10-18 (about 8 weeks).

If scraping is blocked by the store, get a public reviews CSV another way, save it as `data/reviews_raw.csv` with the same four columns, and run only step 4.

**B. Set up n8n (one time)**

6. In n8n, create a workflow and import `n8n/workflow.json` (menu, Import from file). To build it by hand instead, follow `n8n/node_cheatsheet.md` (16 nodes).
7. Add three credentials. Nodes with a red warning show where.
   - OpenAI, used by Insights LLM, Pulse LLM and Fee LLM. Do not add a Sampling Temperature option; the model rejects it.
   - Gmail (sign in with Google), used by Approval Gate and Create Draft.
   - Google Docs (sign in with Google), used by Append to Doc.
8. Open **Approval Gate** and put your own email address in **To**.
9. Open **Append to Doc** and paste the web address of your Google Doc into **Doc ID or URL**. The Doc is named "Weekly Product Pulse Log".
10. Open **Source Facts** and check the two official links and the facts text. They are already filled in from the two pages listed under Sources. If you re-run this later, read the pages again, update the facts and the "Last checked" date.
11. Make sure no node has a purple pin (pinned nodes reuse old saved data). **Approval Gate** must never be pinned.

**C. Run it**

12. Click Execute workflow (or use the published form link). Open the form, upload `data/reviews_clean.csv` and submit.
13. The chain runs: read CSV → format → Insights LLM → check → Pulse LLM → check → Source Facts → Fee LLM → check → merge payload → approval email. Each check node stops the run with a clear message if an output breaks a rule (see Checks below).
14. Open the email "Approve Weekly Product Pulse" (look in Spam if needed), read it, and click **Approve** or **Decline**.
15. If you approved: one entry is appended to the Google Doc (it starts with `=== <date> ===`) and one Gmail **draft** is created (check Drafts; Sent stays empty). If you declined: the run ends at the Rejected node and nothing is written anywhere.

**Optional local checks** after saving the AI outputs as files: `node scripts/verify_insights.js` (expects `outputs/insights.json`) and `node scripts/check_pulse.js` (expects `outputs/weekly_pulse.md`). The same rules already run inside n8n, so these are only a second look.

**Assumptions:** public Google Play reviews (US, English) for the last 8 weeks in one CSV; n8n Cloud with Google Docs, Gmail and OpenAI (gpt-5-mini); the fee issue is chosen from the reviews, never in advance; all scripts are Node.js; API keys are entered only into n8n credentials, never into project files. The 700-review file over-represents charge-related reviews on purpose, so theme counts describe this sample and not all ChatGPT reviews.

## Where MCP approval happens

The approval step is n8n node **12, Approval Gate** (Gmail: Send message and wait for response, Response Type Approval, Approve and Decline buttons). It is the only Gmail send in the workflow, and it sends just the approval request to the owner. It sits **before every writing action**: node 14 (Google Docs append) and node 15 (Gmail draft) are reachable only through node 13 (`Approved?`), and the false branch ends at node 16 (`Rejected`), where nothing is written. The wait is limited to 24 hours; the Doc and draft actions run only on an explicit Approve.

**MCP approach used:** the simple option. Native Google Docs and Gmail nodes act as the tool layer behind the approval gate. The MCP Client Tool node is not used. There is no Gmail Send operation anywhere in the workflow, so the email only ever exists as a draft.

## Fee issue identified

- **Title:** Unexpected or duplicate charges and lack of access after payment.
- **Description:** Several users report being charged twice, or paying for the paid plan and still seeing the free service, which points to billing failures and an unclear refund and support flow.
- **Supporting reviews:** 4 real review IDs (minimum 3). The check node confirms every ID exists in the data, and the reviews were read by hand.

The Fee Explainer answers this issue using only facts from two official OpenAI Help Center articles (below), last checked 2026-10-20.

## Results of the run (2026-10-20)

Top 3 themes: Subscription & Paywall Pressure (18 reviews), Accuracy, reliability & performance issues (7), Image/photo limits & lack of transparency (7). Other themes: Billing errors & account access problems (6) and Voice features & capture quality (5, voice relevance high).

Three quotes, each found word for word in the data:

- "because it has limited access in free but has full access in plus(subscription)"
- "I have been charged 2 time for the chatgpt plus, and my account still shows the free service"
- "amazing AI ,voice interactive AI is too good"

The pulse came to 209 words with 3 action ideas. Full outputs: `outputs/weekly_pulse.md`, `outputs/notes_doc_snippet.md`, `outputs/email_draft.txt`.

## Checks

- Insights: 5 or fewer themes, exactly 3 top themes, exactly 3 quotes that appear word for word in the reviews, a fee issue backed by 3 or more real review IDs.
- Pulse: 250 words or fewer, exactly 3 numbered actions, quotes unchanged.
- Fee Explainer: 6 bullets or fewer, exactly 2 links, a date, no words like "sorry" or "guarantee".
- Approval: nothing after Approval Gate runs without an Approve. Both the Approve and Decline paths were tested (screenshots in `screenshots/`). Gmail Sent was empty after the runs.

## Sources

1. https://help.openai.com/en/articles/7232895-how-do-i-request-a-refund-for-my-chatgpt-subscription
2. https://help.openai.com/en/articles/20001043-how-do-i-avoid-being-charged-twice-if-i-subscribe-to-chatgpt-on-ios-android-and-the-web
3. [ADD VERIFIED URL: the Google Play listing where the reviews were collected]
4. [ADD VERIFIED URL: n8n documentation for the approval node]

Both Help Center pages were updated shortly before they were read, so re-check them before reusing the facts.

## Notes and known issues

- A temperature error means the OpenAI node still has a Sampling Temperature option; remove it.
- In Code nodes use `$now.toFormat(...)`, not `$now.format(...)`.
- If a check node fails with "quotes not found" or a word-count message, run the AI node before it again. The model varies slightly between runs.
- If the run skips the approval pause, Approval Gate is pinned. Unpin it.
- If the request is too long, lower the review limit in Format Reviews (for example to 500).
- The fee issue rests on 4 reviews, so treat it as a signal to look into and not as a measured rate.

## Files

`scripts/` (collect, clean and check scripts) · `prompts/` (three prompts) · `n8n/` (workflow, node cheat-sheet, code for the Code nodes) · `data/` (700-row `reviews_clean.csv`, 20-row sample) · `outputs/` (pulse, Doc entry, email draft) · `docs/` (build spec, source list, test report) · `screenshots/` (approval email, Doc entry, draft, reject path)
