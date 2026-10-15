# Superagent Public Chat

A public-facing website where anyone can message the Superagent (Base44 AI agent) directly — no Base44 account, no login.

## Architecture

```
Visitor browser (index.html + app.js)
      │  HTTPS only — no secrets in the page
      ▼
/api/chat  (Vercel serverless function, api/chat.js)
      │  - holds AGENT_API_KEY as hidden env var
      │  - per-IP rate limiting (15 msgs / 10 min)
      │  - input validation (max 2000 chars)
      ▼
Base44 Superagent API
https://base44.app/api/agents/<AGENT_ID>/conversations/<id>/messages
```

## Environment variables (Vercel project settings)

- `AGENT_API_KEY` — the Superagent API key (from agent editor → Settings → Developer). REQUIRED.
- `AGENT_ID` — optional, defaults to 6a44682f26c1b0463da07f65.

## Security design

- API key never reaches the browser (proxy pattern).
- Rate limiting per IP to stop spam/abuse.
- Message length capped at 2000 characters.
- Conversation ID stored client-side (localStorage) so each visitor has their own thread.
- "New chat" button lets a visitor start a fresh conversation.

## Deploy

Pushes to this repo auto-deploy on Vercel.
