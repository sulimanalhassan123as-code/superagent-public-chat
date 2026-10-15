/* Superagent Public Chat — frontend logic */
const messagesEl = document.getElementById("messages");
const typingEl = document.getElementById("typing");
const form = document.getElementById("chatForm");
const input = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const resetBtn = document.getElementById("resetBtn");

const LS_KEY = "superagent_conv_id";
let conversationId = localStorage.getItem(LS_KEY) || null;
let busy = false;

function setOnline(ok, label) {
  statusDot.className = "dot" + (ok ? " on" : "");
  statusText.textContent = label || (ok ? "online — ask me anything" : "offline");
}

function addMsg(role, html, isError) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;
  const av = document.createElement("div");
  av.className = "avatar";
  av.textContent = role === "ai" ? "⚡" : "🧑";
  const bubble = document.createElement("div");
  bubble.className = "bubble" + (isError ? " error-bubble" : "");
  bubble.innerHTML = html;
  wrap.appendChild(av); wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function ping() {
  try {
    const r = await fetch("/api/chat?ping=1");
    const d = await r.json();
    if (d.ok) setOnline(true);
    else setOnline(false, d.reason === "no_key" ? "agent key pending setup" : "limited");
  } catch { setOnline(false); }
}

async function send(e) {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  busy = true; sendBtn.disabled = true; input.value = "";
  addMsg("user", escapeHtml(text));
  typingEl.hidden = false;
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const maxWaitMs = 180000;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), maxWaitMs);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, conversationId }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const data = await res.json();
    if (data.conversationId && data.conversationId !== conversationId) {
      conversationId = data.conversationId;
      localStorage.setItem(LS_KEY, conversationId);
    }
    if (res.ok && data.reply) {
      addMsg("ai", escapeHtml(data.reply));
    } else {
      addMsg("ai", escapeHtml(data.error || "Something went wrong. Please try again."), true);
    }
  } catch (err) {
    const msg = err.name === "AbortError"
      ? "The agent is taking very long (over 3 minutes). Try a shorter message."
      : "Network problem — check your connection and try again.";
    addMsg("ai", escapeHtml(msg), true);
  } finally {
    typingEl.hidden = true;
    busy = false; sendBtn.disabled = false;
    input.focus();
  }
}

function resetChat() {
  conversationId = null;
  localStorage.removeItem(LS_KEY);
  messagesEl.innerHTML = "";
  addMsg("ai", "Fresh conversation started. Ask me anything 👋");
}

form.addEventListener("submit", send);
resetBtn.addEventListener("click", resetChat);
ping();
