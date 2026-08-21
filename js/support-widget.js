/**
 * LinkFinder AI — AI Support Chat Widget
 *
 * Self-contained, no external CDN dependency (the old @n8n/chat embed relied
 * on a jsdelivr bundle talking to a cold-sleeping Render.com webhook with no
 * logic behind it — this replaces both the frontend and the backend).
 *
 * Set WORKER_URL below once support-worker/ is deployed (see its README).
 */
(function () {
  "use strict";

  var WORKER_URL = "https://support-worker.hamoureliasse.workers.dev/chat";

  var STORAGE_KEY = "lfai_support_chat_v1";

  function track(event, props) {
    try {
      if (window.posthog && typeof window.posthog.capture === "function") {
        window.posthog.capture(event, props || {});
      }
    } catch (e) {
      /* analytics must never break the widget */
    }
  }

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      /* storage can fail in private mode — non-fatal */
    }
  }

  // ---- Minimal markdown-ish rendering: bold, links, line breaks. Escapes
  // everything else so the bot's output can never inject HTML. ----
  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderText(raw) {
    var text = escapeHtml(raw);
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    text = text.replace(/\n/g, "<br>");
    return text;
  }

  // ---- Styles ----
  var css = ""
    + "#lfai-chat-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;"
    + "background:#4ADE80;color:#0B0F1A;border:none;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);"
    + "display:flex;align-items:center;justify-content:center;z-index:2147483000;font-size:26px;}"
    + "#lfai-chat-bubble:hover{transform:scale(1.06);}"
    + "#lfai-chat-panel{position:fixed;bottom:92px;right:24px;width:360px;max-width:92vw;height:520px;max-height:75vh;"
    + "background:#0B0F1A;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.4);display:none;flex-direction:column;"
    + "overflow:hidden;z-index:2147483000;font-family:Inter,system-ui,-apple-system,sans-serif;}"
    + "#lfai-chat-panel.open{display:flex;}"
    + "#lfai-chat-header{background:#141B2E;color:#fff;padding:16px;font-weight:700;font-size:15px;"
    + "display:flex;align-items:center;justify-content:space-between;}"
    + "#lfai-chat-header span.sub{display:block;font-weight:400;font-size:12px;color:#94A3B8;margin-top:2px;}"
    + "#lfai-chat-close{background:none;border:none;color:#94A3B8;font-size:20px;cursor:pointer;line-height:1;padding:4px;}"
    + "#lfai-chat-messages{flex:1;overflow-y:auto;padding:14px;background:#0B0F1A;}"
    + ".lfai-msg{margin-bottom:12px;max-width:88%;padding:10px 13px;border-radius:12px;font-size:13.5px;line-height:1.45;}"
    + ".lfai-msg.user{margin-left:auto;background:#4ADE80;color:#0B0F1A;border-bottom-right-radius:3px;}"
    + ".lfai-msg.assistant{margin-right:auto;background:#141B2E;color:#fff;border-bottom-left-radius:3px;}"
    + ".lfai-msg.typing{display:flex;gap:4px;align-items:center;}"
    + ".lfai-dot{width:6px;height:6px;border-radius:50%;background:#94A3B8;animation:lfaiPulse 1.2s infinite ease-in-out;}"
    + ".lfai-dot:nth-child(2){animation-delay:.2s;}.lfai-dot:nth-child(3){animation-delay:.4s;}"
    + "@keyframes lfaiPulse{0%,60%,100%{opacity:.3}30%{opacity:1}}"
    + ".lfai-escalate{background:#141B2E;border:1px solid #4ADE80;border-radius:12px;padding:14px;margin-right:auto;max-width:88%;margin-bottom:12px;}"
    + ".lfai-escalate h4{color:#4ADE80;margin:0 0 6px;font-size:13.5px;}"
    + ".lfai-escalate p{color:#fff;margin:0 0 10px;font-size:13px;line-height:1.4;}"
    + ".lfai-escalate a{display:inline-block;background:#4ADE80;color:#0B0F1A;text-decoration:none;font-size:12.5px;"
    + "font-weight:600;padding:8px 12px;border-radius:8px;margin-right:8px;margin-top:4px;}"
    + ".lfai-escalate a.secondary{background:transparent;border:1px solid #4ADE80;color:#4ADE80;}"
    + "#lfai-chat-inputrow{display:flex;border-top:1px solid #232B40;padding:10px;background:#0B0F1A;gap:8px;}"
    + "#lfai-chat-input{flex:1;background:#141B2E;border:1px solid #232B40;border-radius:8px;color:#fff;"
    + "padding:10px 12px;font-size:13.5px;resize:none;font-family:inherit;}"
    + "#lfai-chat-input:focus{outline:none;border-color:#4ADE80;}"
    + "#lfai-chat-send{background:#4ADE80;border:none;border-radius:8px;color:#0B0F1A;font-weight:700;padding:0 16px;cursor:pointer;font-size:13px;}"
    + "#lfai-chat-send:disabled{opacity:.5;cursor:default;}"
    + "@media(max-width:480px){#lfai-chat-panel{right:12px;bottom:80px;width:calc(100vw - 24px);}#lfai-chat-bubble{right:16px;bottom:16px;}}";

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---- DOM ----
  var bubble = document.createElement("button");
  bubble.id = "lfai-chat-bubble";
  bubble.setAttribute("aria-label", "Open support chat");
  bubble.innerHTML = "💬";

  var panel = document.createElement("div");
  panel.id = "lfai-chat-panel";
  panel.innerHTML =
    '<div id="lfai-chat-header"><div>AI Support<span class="sub">Ask about pricing, the API, or how it works</span></div>' +
    '<button id="lfai-chat-close" aria-label="Close">×</button></div>' +
    '<div id="lfai-chat-messages"></div>' +
    '<div id="lfai-chat-inputrow">' +
    '<textarea id="lfai-chat-input" rows="1" placeholder="Ask a question..."></textarea>' +
    '<button id="lfai-chat-send">Send</button>' +
    "</div>";

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector("#lfai-chat-messages");
  var inputEl = panel.querySelector("#lfai-chat-input");
  var sendBtn = panel.querySelector("#lfai-chat-send");
  var closeBtn = panel.querySelector("#lfai-chat-close");

  var history = loadHistory();
  var opened = false;
  var sending = false;

  function appendMessageEl(role, html) {
    var div = document.createElement("div");
    div.className = "lfai-msg " + role;
    div.innerHTML = html;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function appendEscalateCard(card) {
    var div = document.createElement("div");
    div.className = "lfai-escalate";
    div.innerHTML =
      "<h4>" + escapeHtml(card.heading) + "</h4>" +
      "<p>" + renderText(card.body) + "</p>" +
      '<a href="' + card.mailto + '" target="_blank">Email support</a>' +
      '<a class="secondary" href="' + card.calendly + '" target="_blank" rel="noopener">Book a call</a>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderAll() {
    messagesEl.innerHTML = "";
    if (history.length === 0) {
      appendMessageEl("assistant", renderText("Hi! I'm the LinkFinder AI support assistant. Ask me about pricing, plans, the API, integrations, or how any lookup works."));
      return;
    }
    history.forEach(function (m) {
      if (m.role === "user" || m.role === "assistant") {
        appendMessageEl(m.role, renderText(typeof m.content === "string" ? m.content : ""));
      }
    });
  }

  function setTyping(on) {
    var existing = document.getElementById("lfai-typing");
    if (on && !existing) {
      var div = document.createElement("div");
      div.id = "lfai-typing";
      div.className = "lfai-msg assistant typing";
      div.innerHTML = '<span class="lfai-dot"></span><span class="lfai-dot"></span><span class="lfai-dot"></span>';
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (!on && existing) {
      existing.remove();
    }
  }

  function openPanel() {
    panel.classList.add("open");
    if (!opened) {
      opened = true;
      renderAll();
      track("chat_widget_opened", {});
    }
    inputEl.focus();
  }

  function closePanel() {
    panel.classList.remove("open");
  }

  bubble.addEventListener("click", function () {
    if (panel.classList.contains("open")) {
      closePanel();
    } else {
      openPanel();
    }
  });
  closeBtn.addEventListener("click", closePanel);

  function autoGrow() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + "px";
  }
  inputEl.addEventListener("input", autoGrow);
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener("click", send);

  function send() {
    var text = inputEl.value.trim();
    if (!text || sending) return;

    history.push({ role: "user", content: text });
    saveHistory(history);
    appendMessageEl("user", renderText(text));
    track("chat_message_sent", { length: text.length });

    inputEl.value = "";
    autoGrow();
    sending = true;
    sendBtn.disabled = true;
    setTyping(true);

    fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        setTyping(false);
        sending = false;
        sendBtn.disabled = false;

        if (data.error) {
          appendMessageEl("assistant", renderText("Sorry, something went wrong on my end. Try again in a moment, or email support@linkfinderai.com."));
          return;
        }

        var reply = data.reply || "";
        history.push({ role: "assistant", content: reply });
        saveHistory(history);
        if (reply) {
          appendMessageEl("assistant", renderText(reply));
        }
        if (data.escalate) {
          appendEscalateCard(data.escalate);
          track("chat_escalated_to_human", {});
        }
      })
      .catch(function () {
        setTyping(false);
        sending = false;
        sendBtn.disabled = false;
        appendMessageEl("assistant", renderText("I couldn't reach the server just now. Please try again, or email support@linkfinderai.com."));
      });
  }
})();
