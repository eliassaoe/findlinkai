/**
 * LinkFinder AI — AI Support Chat Widget
 *
 * Self-contained, no external CDN dependency. Talks to the support-agent edge
 * function (supabase/functions/support-agent/), which works on the visitor's
 * own account when they are logged in: credits and plan, History, CSV files,
 * downloads, and starting a bulk enrichment from a CSV dropped in here.
 *
 * The agent answers with text plus "cards" this file renders: a booking card
 * (Calendly), a human-handoff card, a download button, and the confirmation
 * card for an enrichment. That last one is the only way a run starts from the
 * chat — the model can propose one, but only the user's click on Start spends
 * credits.
 */
(function () {
  "use strict";

  var API_BASE = "https://snxhsboboatjywgwdeds.supabase.co/functions/v1/support-agent";

  var STORAGE_KEY = "lfai_support_chat_v2";

  // Same lookup the app pages use (?token= in the URL, else localStorage).
  // It is what lets the agent read this account and nobody else's.
  function getUserToken() {
    try {
      var fromUrl = new URLSearchParams(window.location.search).get("token");
      if (fromUrl) return fromUrl;
      return localStorage.getItem("linkFinderToken") || null;
    } catch (e) {
      return null;
    }
  }

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

  function api(route, payload) {
    return fetch(API_BASE + "/" + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.error) throw new Error(data.error || "Request failed");
        return data;
      });
    });
  }

  // ---- Minimal markdown-ish rendering: bold, links, line breaks. Escapes
  // everything else so the bot's output can never inject HTML. ----
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderText(raw) {
    var text = escapeHtml(raw);
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    text = text.replace(/\n/g, "<br>");
    return text;
  }

  // ---- Styles ----
  var css = ""
    + "#lfai-chat-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;"
    + "background:#4ADE80;color:#0B0F1A;border:none;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);"
    + "display:flex;align-items:center;justify-content:center;z-index:2147483000;font-size:26px;}"
    + "#lfai-chat-bubble:hover{transform:scale(1.06);}"
    + "#lfai-chat-panel{position:fixed;bottom:92px;right:24px;width:380px;max-width:92vw;height:560px;max-height:78vh;"
    + "background:#0B0F1A;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.4);display:none;flex-direction:column;"
    + "overflow:hidden;z-index:2147483000;font-family:Inter,system-ui,-apple-system,sans-serif;}"
    + "#lfai-chat-panel.open{display:flex;}"
    + "#lfai-chat-header{background:#141B2E;color:#fff;padding:16px;font-weight:700;font-size:15px;"
    + "display:flex;align-items:center;justify-content:space-between;}"
    + "#lfai-chat-header span.sub{display:block;font-weight:400;font-size:12px;color:#94A3B8;margin-top:2px;}"
    + "#lfai-chat-close{background:none;border:none;color:#94A3B8;font-size:20px;cursor:pointer;line-height:1;padding:4px;}"
    + "#lfai-chat-messages{flex:1;overflow-y:auto;padding:14px;background:#0B0F1A;}"
    + ".lfai-msg{margin-bottom:12px;max-width:88%;padding:10px 13px;border-radius:12px;font-size:13.5px;line-height:1.45;word-wrap:break-word;}"
    + ".lfai-msg a{color:inherit;text-decoration:underline;}"
    + ".lfai-msg.user{margin-left:auto;background:#4ADE80;color:#0B0F1A;border-bottom-right-radius:3px;}"
    + ".lfai-msg.assistant{margin-right:auto;background:#141B2E;color:#fff;border-bottom-left-radius:3px;}"
    + ".lfai-msg.note{margin:0 auto 12px;background:transparent;color:#94A3B8;font-size:12px;text-align:center;max-width:100%;}"
    + ".lfai-msg.typing{display:flex;gap:4px;align-items:center;}"
    + ".lfai-dot{width:6px;height:6px;border-radius:50%;background:#94A3B8;animation:lfaiPulse 1.2s infinite ease-in-out;}"
    + ".lfai-dot:nth-child(2){animation-delay:.2s;}.lfai-dot:nth-child(3){animation-delay:.4s;}"
    + "@keyframes lfaiPulse{0%,60%,100%{opacity:.3}30%{opacity:1}}"
    + ".lfai-card{background:#141B2E;border:1px solid #4ADE80;border-radius:12px;padding:14px;margin-right:auto;max-width:92%;margin-bottom:12px;}"
    + ".lfai-card h4{color:#4ADE80;margin:0 0 6px;font-size:13.5px;}"
    + ".lfai-card p{color:#fff;margin:0 0 10px;font-size:13px;line-height:1.4;}"
    + ".lfai-card ul{color:#CBD5E1;margin:0 0 10px;padding-left:18px;font-size:12.5px;line-height:1.5;}"
    + ".lfai-card a,.lfai-card button{display:inline-block;background:#4ADE80;color:#0B0F1A;text-decoration:none;font-size:12.5px;border:none;cursor:pointer;"
    + "font-weight:600;padding:8px 12px;border-radius:8px;margin-right:8px;margin-top:4px;font-family:inherit;}"
    + ".lfai-card .secondary{background:transparent;border:1px solid #4ADE80;color:#4ADE80;}"
    + ".lfai-card button:disabled{opacity:.6;cursor:default;}"
    + ".lfai-card .status{color:#94A3B8;font-size:12px;margin-top:8px;}"
    + "#lfai-chat-inputrow{display:flex;border-top:1px solid #232B40;padding:10px;background:#0B0F1A;gap:8px;align-items:flex-end;}"
    + "#lfai-chat-attach{background:#141B2E;border:1px solid #232B40;border-radius:8px;color:#94A3B8;cursor:pointer;font-size:16px;padding:8px 10px;}"
    + "#lfai-chat-attach:hover{color:#4ADE80;border-color:#4ADE80;}"
    + "#lfai-chat-input{flex:1;background:#141B2E;border:1px solid #232B40;border-radius:8px;color:#fff;"
    + "padding:10px 12px;font-size:13.5px;resize:none;font-family:inherit;}"
    + "#lfai-chat-input:focus{outline:none;border-color:#4ADE80;}"
    + "#lfai-chat-send{background:#4ADE80;border:none;border-radius:8px;color:#0B0F1A;font-weight:700;padding:10px 16px;cursor:pointer;font-size:13px;}"
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
    '<div id="lfai-chat-header"><div>LinkFinder AI Assistant<span class="sub">Your account, your files, your enrichments</span></div>' +
    '<button id="lfai-chat-close" aria-label="Close">×</button></div>' +
    '<div id="lfai-chat-messages"></div>' +
    '<div id="lfai-chat-inputrow">' +
    '<button id="lfai-chat-attach" title="Attach a CSV to enrich" aria-label="Attach a CSV">📎</button>' +
    '<input id="lfai-chat-file" type="file" accept=".csv,.tsv,.txt,text/csv" style="display:none">' +
    '<textarea id="lfai-chat-input" rows="1" placeholder="Ask anything, or attach a CSV…"></textarea>' +
    '<button id="lfai-chat-send">Send</button>' +
    "</div>";

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector("#lfai-chat-messages");
  var inputEl = panel.querySelector("#lfai-chat-input");
  var sendBtn = panel.querySelector("#lfai-chat-send");
  var closeBtn = panel.querySelector("#lfai-chat-close");
  var attachBtn = panel.querySelector("#lfai-chat-attach");
  var fileEl = panel.querySelector("#lfai-chat-file");

  var history = loadHistory();
  var opened = false;
  var sending = false;

  function scrollDown() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMessageEl(role, html) {
    var div = document.createElement("div");
    div.className = "lfai-msg " + role;
    div.innerHTML = html;
    messagesEl.appendChild(div);
    scrollDown();
    return div;
  }

  function cardEl(heading, bodyText) {
    var div = document.createElement("div");
    div.className = "lfai-card";
    div.innerHTML = "<h4>" + escapeHtml(heading) + "</h4>" + (bodyText ? "<p>" + renderText(bodyText) + "</p>" : "");
    messagesEl.appendChild(div);
    return div;
  }

  function linkButton(href, label, secondary) {
    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = label;
    if (secondary) a.className = "secondary";
    return a;
  }

  function actionButton(label, secondary) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (secondary) b.className = "secondary";
    return b;
  }

  function statusLine(card, text) {
    var s = card.querySelector(".status");
    if (!s) {
      s = document.createElement("div");
      s.className = "status";
      card.appendChild(s);
    }
    s.innerHTML = renderText(text);
    scrollDown();
  }

  // An outcome the agent should know about on the next turn (a run started, a
  // file downloaded) goes into the history as an assistant line.
  function remember(text) {
    history.push({ role: "assistant", content: text });
    saveHistory(history);
  }

  function saveFile(filename, csv) {
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function renderCard(card) {
    var el;
    if (card.type === "escalate") {
      el = cardEl(card.heading, card.body);
      el.appendChild(linkButton(card.mailto, "Email support"));
      el.appendChild(linkButton(card.calendly, "Book a call", true));
      track("chat_escalated_to_human", {});
    } else if (card.type === "booking") {
      el = cardEl(card.heading, card.body);
      el.appendChild(linkButton(card.calendly, "Pick a time"));
      track("chat_booking_link_shown", {});
    } else if (card.type === "download") {
      el = cardEl(card.heading, card.body);
      var dl = actionButton("Download CSV");
      dl.addEventListener("click", function () {
        dl.disabled = true;
        dl.textContent = "Preparing…";
        api("download", Object.assign({ userToken: getUserToken() }, card.request))
          .then(function (data) {
            saveFile(data.filename, data.csv);
            dl.textContent = "Downloaded";
            if (data.preview) {
              statusLine(el, "This is a preview of the first rows (" + data.total_rows + " in total). [Upgrade](https://linkfinderai.com/pricing) to download the full file.");
            }
            track("chat_csv_downloaded", { preview: !!data.preview, rows: data.total_rows });
          })
          .catch(function (e) {
            dl.disabled = false;
            dl.textContent = "Download CSV";
            statusLine(el, e.message);
          });
      });
      el.appendChild(dl);
    } else if (card.type === "enrich_confirm") {
      el = cardEl(card.heading, card.body);
      if (card.details && card.details.length) {
        var ul = document.createElement("ul");
        card.details.forEach(function (d) {
          var li = document.createElement("li");
          li.textContent = d;
          ul.appendChild(li);
        });
        el.appendChild(ul);
      }
      var start = actionButton("Start enrichment");
      var cancel = actionButton("Not now", true);
      cancel.addEventListener("click", function () {
        start.disabled = true;
        cancel.disabled = true;
        statusLine(el, "Cancelled — nothing was run.");
      });
      start.addEventListener("click", function () {
        start.disabled = true;
        cancel.disabled = true;
        start.textContent = "Starting…";
        api("start", Object.assign({ userToken: getUserToken() }, card.request))
          .then(function (data) {
            start.textContent = "Started";
            statusLine(el, "Running in the background — you can close this tab. The file will be in [History](https://linkfinderai.com/history) when it's done.");
            remember("Enrichment started (batch_id=" + data.batch_id + "). It is running in the background; the result will appear in History → CSV enrichments.");
            track("chat_enrichment_started", { batch_id: data.batch_id, rows: data.total_rows });
          })
          .catch(function (e) {
            start.disabled = false;
            cancel.disabled = false;
            start.textContent = "Start enrichment";
            statusLine(el, e.message);
          });
      });
      el.appendChild(start);
      el.appendChild(cancel);
      track("chat_enrichment_proposed", {});
    }
    scrollDown();
  }

  function renderAll() {
    messagesEl.innerHTML = "";
    if (history.length === 0) {
      var greeting = getUserToken()
        ? "Hi! I can check your credits and plan, find past lookups, hand you back an enriched file, or enrich a new CSV — attach one with 📎. What do you need?"
        : "Hi! I'm the LinkFinder AI assistant. Ask about pricing, the API, or how any lookup works. Log in and I can also work on your account and enrich your CSVs.";
      appendMessageEl("assistant", renderText(greeting));
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
      scrollDown();
    } else if (!on && existing) {
      existing.remove();
    }
  }

  function setBusy(on) {
    sending = on;
    sendBtn.disabled = on;
    attachBtn.disabled = on;
    setTyping(on);
  }

  function openPanel() {
    panel.classList.add("open");
    if (!opened) {
      opened = true;
      renderAll();
      track("chat_widget_opened", { logged_in: !!getUserToken() });
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
  sendBtn.addEventListener("click", function () { send(); });

  // ---- Attaching a CSV: parsed and stored server-side, then handed to the
  // agent as a message carrying its upload_id. ----
  attachBtn.addEventListener("click", function () {
    if (sending) return;
    if (!getUserToken()) {
      appendMessageEl("assistant", renderText("Log in first and I can enrich your file: [log in](https://linkfinderai.com/log-in), then open this chat from the app."));
      return;
    }
    fileEl.click();
  });

  fileEl.addEventListener("change", function () {
    var file = fileEl.files && fileEl.files[0];
    fileEl.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      appendMessageEl("assistant", renderText("That file is over 8 MB — upload it in the [app](https://linkfinderai.com/app) instead."));
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      setBusy(true);
      appendMessageEl("note", escapeHtml("Uploading " + file.name + "…"));
      api("upload", { userToken: getUserToken(), fileName: file.name, csvText: String(reader.result || "") })
        .then(function (data) {
          setBusy(false);
          track("chat_csv_attached", { rows: data.file_rows, columns: data.columns.length });
          var typed = inputEl.value.trim();
          inputEl.value = "";
          autoGrow();
          var shown = (typed ? typed + "\n" : "") + "📎 " + data.file_name + " (" + data.file_rows + " rows)";
          var full = (typed || "I've attached a file — what can you enrich with it?") +
            "\n[Attached CSV: " + data.file_name + " · upload_id=" + data.upload_id + " · " + data.file_rows +
            " rows · columns: " + data.columns.slice(0, 30).join(", ") + "]";
          send(full, shown);
        })
        .catch(function (e) {
          setBusy(false);
          appendMessageEl("assistant", renderText(e.message));
        });
    };
    reader.readAsText(file);
  });

  // `text` goes to the agent; `shown` is what the bubble displays, when the two
  // differ (an attachment carries ids the user does not need to see).
  function send(text, shown) {
    text = typeof text === "string" ? text : inputEl.value.trim();
    if (!text || sending) return;

    history.push({ role: "user", content: text });
    saveHistory(history);
    appendMessageEl("user", renderText(shown || text));
    track("chat_message_sent", { length: text.length });

    if (!shown) {
      inputEl.value = "";
      autoGrow();
    }
    setBusy(true);

    api("chat", { messages: history, userToken: getUserToken() })
      .then(function (data) {
        setBusy(false);
        var reply = data.reply || "";
        if (reply) {
          history.push({ role: "assistant", content: reply });
          saveHistory(history);
          appendMessageEl("assistant", renderText(reply));
        }
        (data.cards || []).forEach(renderCard);
      })
      .catch(function () {
        setBusy(false);
        appendMessageEl("assistant", renderText("Sorry, something went wrong on my end. Try again in a moment, or email support@linkfinderai.com."));
      });
  }
})();
