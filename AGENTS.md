# Project rules: Milestone 5 (Review-to-Insight Workflow)
Product: ChatGPT mobile app. Goal: increase voice input usage.
## Hard rules
1. Use Node.js (JavaScript) for every script. Do NOT use Python.
2. Never invent user quotes, URLs or facts. Use placeholders like <VERIFIED_URL_1>.
3. Never change review wording when cleaning. Only mask emails and phone numbers.
4. Never put API keys or tokens in any file. If a key is needed, use a .env file and make sure .env is listed in .gitignore.
5. The n8n workflow is built BY HAND by the human. Do NOT create an n8n workflow JSON file.
6. Never use or suggest a Gmail Send operation. Email is Draft: Create only.
7. Pulse: 250 words or fewer. Fee Explainer: 6 bullets or fewer, neutral tone.
8. Ask before installing any global package or deleting any file.
9. Work one phase at a time, tell me what you created and how to test it, and wait for my "approved" before the next phase.
## Source of truth
Follow docs/BUILD_SPEC.md exactly. 
If it is unclear, ask me instead of guessing.