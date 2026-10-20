# Demo script — 3 minutes or less

Prep before recording (not counted in the 3 minutes):
- n8n workflow built and tested; `Source Facts` (node 8) filled with verified facts and two verified URLs.
- `data/reviews_sample.csv` ready; Google Doc open in one tab; Gmail (Drafts + Inbox) open in another.
- A clean fresh dry run so the doc starts without today's entry.

## 0:00–0:20 — CSV sample (20 s)

Show `data/reviews_sample.csv`. Say: "20 sample rows, columns `review_id, date, rating, text`. Emails and phone numbers were replaced with `[EMAIL]` and `[PHONE]` during cleaning — the review wording itself is never changed."

## 0:20–1:00 — Run the workflow (40 s)

Open the n8n form URL from node 1 (`Upload Reviews`), upload `data/reviews_sample.csv`, submit. Point at the running nodes: "Reading the CSV, formatting rows, then three AI nodes — themes and quotes, the Weekly Pulse, and the Fee Explainer — each followed by a code check that throws a clear error if a rule is broken."

## 1:00–1:40 — Pulse and explainer (40 s)

Show the `Merge Payload` node output. Say: "The payload has date, the top 3 themes, the 250-words-or-fewer pulse, one identified fee issue — chosen from the data, not in advance — up to 6 neutral explanation bullets, two source links, and the last-checked date."

## 1:40–2:10 — Approval click (30 s)

Open the approval email. Scroll the payload shown in it. Say: "Nothing is written anywhere yet. The approval gate sits before every action." Click **Approve**.

## 2:10–2:40 — Doc entry and draft, not sent (30 s)

Show the Google Doc: exactly one new `=== date ===` entry. Open Gmail Drafts: exactly one new draft titled `Weekly Product Pulse + Customer Clarification — <date>`. Open the Sent folder: unchanged. Say: "Draft only — this workflow has no Send operation anywhere."

## 2:40–3:00 — Reject path (20 s)

Run the workflow again, click **Disapprove** in the email (a 24-hour timeout works the same way). Show the doc unchanged and no new draft. Say: "Reject writes nothing. That is the whole workflow."
