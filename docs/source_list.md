# Source list (placeholders until you verify them)

No real URLs are invented in this project. Each entry below starts as a placeholder and is replaced only after it has been verified with all three checks:

1. The URL is on the **official domain** (the company's own website, not a blog, forum, or aggregator).
2. The page **opens** in a browser and is not an error page.
3. The page **actually answers the fee issue** identified in `outputs/insights.json`.

Then copy 3–6 short facts from each verified page into the `source_facts` field of node 8 (`Source Facts`) in n8n, and put the two chosen URLs into `source_url_1` and `source_url_2`. Keep this file up to date.

| # | Placeholder | What it should be | Verified? (date + initials) |
|---|---|---|---|
| 1 | `<VERIFIED_URL_1>` | Official Help Center article that explains the fee issue found in the reviews | Verified 2026-10-20 (owner): https://help.openai.com/en/articles/7232895-how-do-i-request-a-refund-for-my-chatgpt-subscription |
| 2 | `<VERIFIED_URL_2>` | Official pricing or subscription page for the product | Verified 2026-10-20 (owner): https://help.openai.com/en/articles/20001043-how-do-i-avoid-being-charged-twice-if-i-subscribe-to-chatgpt-on-ios-android-and-the-web |
| 3 | `<VERIFIED_URL_3>` | Official Google Play subscription / billing help page (only if app-store billing is involved) | Not verified |
| 4 | `<VERIFIED_URL_4>` | Optional: official Apple App Store subscription help page (only if iOS billing is involved) | Not verified |

Reference pages that are not fee-issue sources (they document where the data came from and how the approval node works):

| # | URL | What it is | Verified? (date + initials) |
|---|---|---|---|
| R1 | https://play.google.com/store/apps/details?id=com.openai.chatgpt | The Google Play listing the reviews were collected from | Page opens (2026-10-21) |
| R2 | https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/ | n8n Gmail node docs: Message → Send is the approval request, Draft → Create is the only other mail operation | Page opens (2026-10-21) |

Rule reminder: if you cannot verify a page, do not use it. Leave the placeholder and tell your AI agent — never invent a URL or a fact.
