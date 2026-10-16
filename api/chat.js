/**
 * Superagent Public Chat — serverless proxy (Vercel Node function).
 * Secure proxy: the agent API key stays server-side; never exposed to the browser.
 */
const AGENT_ID = process.env.AGENT_ID || "6a44682f26c1b0463da07f65";
const BASE = process.env.AGENT_API_URL
  ? `${process.env.AGENT_API_URL}/api/agents/${AGENT_ID}`
  : ["https://base44", ".app/api/agents/", AGENT_ID].join("");

/* ---------- simple per-IP rate limiting (sliding window) ---------- */
const WINDOW_MS = 10 * 60 * 1000;   // 10 minutes
const MAX_PER_WINDOW = 15;          // messages per IP per window
const buckets = new Map();

function rateLimited(ip) {
  const now = Date.now();
  let arr = (buckets.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    buckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  buckets.set(ip, arr);
  // opportunistic cleanup
  if (buckets.size > 5000) buckets.clear();
  return false;
}

/* ---------- helpers ---------- */
function getApiKey() {
  return process.env.AGENT_API_KEY || "";
}

async function agentFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": "Bearer " + getApiKey(),
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function extractConversationId(data) {
  if (!data) return null;
  return (
    data.conversation?.id ||
    data.id ||
    data.data?.id ||
    data.data?.conversation?.id ||
    null
  );
}

function extractReply(data) {
  if (!data) return null;
  const candidates = [
    data.content,
    data.message?.content,
    data.message?.text,
    data.reply,
    data.response,
    data.assistant_message?.content,
    data.data?.message?.content,
    Array.isArray(data.messages) && data.messages.length
      ? data.messages[data.messages.length - 1].content
      : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

/* ---------- robust body reader ---------- */
function readRawBody(req) {
  if (req.body) return Promise.resolve(typeof req.body === "string" ? req.body : JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/* ---------- handler ---------- */
module.exports = async function handler(req, res) {
  const ip =
    (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) ||
    "unknown";
  const ipKey = String(ip).split(",")[0].trim();

  /* health check */
  if (req.method === "GET") {
    if (!getApiKey()) return res.status(200).json({ ok: false, reason: "no_key" });
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  /* config check */
  if (!getApiKey()) {
    return res.status(503).json({
      error: "Agent API key is not configured yet. The owner will activate this shortly.",
    });
  }

  /* rate limit */
  if (rateLimited(ipKey)) {
    return res.status(429).json({
      error: "You're sending messages too fast. Please wait a few minutes.",
    });
  }

  /* input validation */
  let body;
  try { body = JSON.parse((await readRawBody(req)) || "{}"); } catch {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const message = String(body.message || "").trim();
  let conversationId = String(body.conversationId || "").trim() || null;

  if (!message) return res.status(400).json({ error: "Message is empty" });
  if (message.length > 2000) {
    return res.status(400).json({ error: "Message too long (max 2000 characters)" });
  }

  try {
    /* create conversation if none */
    if (!conversationId) {
      const created = await agentFetch("/conversations", {
        method: "POST",
        body: JSON.stringify({ title: "Public website chat" }),
      });
      if (created.status >= 400) {
        return res.status(502).json({
          error: "Could not start a conversation with the agent. Please try again.",
        });
      }
      conversationId = extractConversationId(created.data);
    }

    /* send message */
    const sent = await agentFetch(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: message }),
    });

    if (sent.status >= 400) {
      /* stale/invalid stored conversation — retry once with a fresh one */
      if (conversationId) {
        const fresh = await agentFetch("/conversations", {
          method: "POST",
          body: JSON.stringify({ title: "Public website chat" }),
        });
        const freshId = fresh.status < 400 ? extractConversationId(fresh.data) : null;
        if (freshId) {
          const retry = await agentFetch(`/conversations/${freshId}/messages`, {
            method: "POST",
            body: JSON.stringify({ content: message }),
          });
          if (retry.status < 400) {
            const reply = extractReply(retry.data);
            if (reply) return res.status(200).json({ reply, conversationId: freshId });
          }
        }
      }
      return res.status(502).json({ error: "The agent could not be reached. Please try again." });
    }

    const reply = extractReply(sent.data);
    if (!reply) {
      return res.status(502).json({ error: "The agent replied in an unexpected format. Please try again." });
    }
    return res.status(200).json({ reply, conversationId });
  } catch (err) {
    return res.status(502).json({ error: "Connection to the agent failed. Please try again." });
  }
}
