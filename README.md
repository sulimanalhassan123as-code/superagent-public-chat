# Superagent Public Chat

A public-facing chat website where anyone can message the Superagent AI directly — no account, no login.

## Architecture

```
Visitor browser (index.html + app.js)
      |  HTTPS only — no secrets in the page
      v
/api/chat  (serverless function, api/chat.js)
      |  - holds AGENT_API_KEY as hidden env var
      |  - per-IP rate limiting (15 msgs / 10 min)
      |  - input validation (max 2000 chars)
      v
Agent messaging API (server-side only)
```

## Environment variables (project settings)

- `AGENT_API_KEY` — the agent messaging API key. REQUIRED.
- `AGENT_ID` — optional, defaults to the configured agent.

## Security design

- API key never reaches the browser (proxy pattern).
- Rate limiting per IP to stop spam/abuse.
- Message length capped at 2000 characters.
- Conversation ID stored client-side (localStorage) so each visitor has their own thread.
- "New chat" button lets a visitor start a fresh conversation.

## Deploy

Pushes to this repo auto-deploy on Vercel.
