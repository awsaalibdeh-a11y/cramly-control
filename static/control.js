/* Cramly Control: the owner's panel. Overview (kill switch, broadcast), Accounts (see, ban, time out, message, premium, delete) and
   Links (personal premium links). Everything goes through this site's own server, which talks to Cramly with the secret key. */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const toast = (m, bad) => { const t = Object.assign(document.createElement("div"), { className: `toast${bad ? " bad" : ""}`, textContent: m }); $("#toasts").append(t); setTimeout(() => t.remove(), bad ? 5000 : 2800); };
const ago = (ts) => {
  if (!ts) return "never";
  const s = Math.max(0, Date.now() / 1000 - ts);
  return s < 90 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};
const until = (ts) => { const s = Math.max(0, ts - Date.now() / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.ceil(s / 60)} min`; };

async function call(path, method = "GET", body) {
  const r = await fetch(path, { method, headers: { "Content-Type": "application/json", "X-Requested-With": "cramly-control" }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { show(false); throw new Error("Signed out."); }
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}
function ask({ title, text = "", ok = "Yes", danger = false, field = null }) {
  return new Promise((resolve) => {
    const m = $("#modal");
    $("#modal-body").innerHTML = `<h3>${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ""}${field ? `<label>${esc(field.label)}${field.area ? `<textarea id="m-in" maxlength="${field.max || 1200}" placeholder="${esc(field.hint || "")}"></textarea>` : `<input id="m-in" type="${field.type || "text"}" value="${esc(field.value ?? "")}" placeholder="${esc(field.hint || "")}">`}</label>` : ""}
      <div class="row end"><button class="btn" id="m-no" type="button">Cancel</button><button class="btn ${danger ? "bad" : "primary"}" id="m-ok" type="button">${esc(ok)}</button></div>`;
    let done = false;
    const fin = (v) => { if (done) return; done = true; m.close(); resolve(v); };
    $("#m-ok").addEventListener("click", () => fin(field ? $("#m-in").value : true));
    $("#m-no").addEventListener("click", () => fin(null));
    m.addEventListener("close", () => fin(null), { once: true });
    m.showModal(); $("#m-in")?.focus();
  });
}
function show(on) { $("#login").hidden = on; $("#shell").hidden = !on; }

/* ---------- sign in, tabs, health ---------- */
let tab = "overview", timer = 0;
async function health() {
  try {
    const h = await call("/health");
    $("#health").innerHTML = h.up ? `<span class="dot ${h.maintenance ? "amber" : "green"}"></span>Cramly is ${h.maintenance ? "switched OFF" : "live"} · ${h.ms} ms` : `<span class="dot red"></span>Cramly is not answering`;
  } catch { /* signed out */ }
}
async function render() {
  clearInterval(timer);
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  $("#page").innerHTML = `<p class="muted">Loading… (the first call can take up to a minute if Cramly is asleep)</p>`;
  try { await ({ overview: overviewTab, accounts: accountsTab, links: linksTab })[tab](); } catch (e) { if (e.message !== "Signed out.") $("#page").innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><button class="btn" onclick="render()">Try again</button></div>`; }
  health();
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) { tab = b.dataset.tab; render(); } });
$("#logout").addEventListener("click", async () => { await fetch("/logout", { method: "POST" }); show(false); });
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-err"); err.hidden = true;
  const r = await fetch("/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#pw").value }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { err.hidden = false; err.textContent = d.error || "Could not sign in."; return; }
  $("#pw").value = ""; show(true); render();
});
(async () => {
  const s = await fetch("/session").then((r) => r.json()).catch(() => ({ ok: false }));
  show(!!s.ok);
  if (s.ok) render();
})();

/* ============================================================ overview: numbers, kill switch, broadcast */
async function overviewTab() {
  const [o, st] = await Promise.all([call("/api/admin/overview"), call("/api/admin/settings")]);
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  $("#page").innerHTML = `<div class="stats">${stat(o.accounts, "Accounts")}${stat(o.premium, "Premium")}${stat(o.free, "Free")}${stat(o.locked, "Used their free minute")}${stat(o.new_today, "New today")}${stat(o.active_today, "Active today")}${stat(o.banned || 0, "Banned")}</div>
    <div class="card kill ${st.maintenance ? "off" : ""}"><div class="kill-head"><div class="kill-ico">${st.maintenance ? "🔴" : "🟢"}</div>
        <div><h2>${st.maintenance ? "Cramly is switched OFF" : "Cramly is live"}</h2>
        <p class="muted">${st.maintenance ? "Everyone sees the message below and nothing works for them. You can still use this panel." : "Switch it off and every user instantly sees a pause screen. No new accounts, no AI, nothing."}</p></div></div>
      <label>Message people see when it is off<input id="k-msg" maxlength="300" value="${esc(st.message || "")}" placeholder="e.g. Cramly is being upgraded. Back at 6 pm."></label>
      <div class="row"><button class="btn ${st.maintenance ? "good" : "bad"} big" id="k-toggle" type="button">${st.maintenance ? "Switch Cramly back ON" : "Switch ALL of Cramly OFF"}</button>
        <button class="btn" id="k-save" type="button">Save message only</button></div>
      <p class="muted small">This is a software switch: the Render server keeps running so you can turn it back on from here.</p></div>
    <div class="card"><h2>Message everyone 📣</h2><label>Your message<textarea id="b-body" placeholder="Shows as a popup the next time each person opens Cramly (within seconds if they are in it now)."></textarea></label>
      <div class="row"><label style="min-width:11rem">Who gets it<select id="b-who"><option value="0">Everyone</option><option value="7">Active in the last 7 days</option><option value="1">Active in the last 24 hours</option></select></label>
        <button class="btn primary" id="b-send" type="button">Send to everyone</button></div></div>`;
  $("#k-toggle").addEventListener("click", async () => {
    const turnOff = !st.maintenance;
    if (!(await ask({ title: turnOff ? "Switch ALL of Cramly off?" : "Switch Cramly back on?", text: turnOff ? "Every user will be stopped right now and see your message." : "Everyone can use it again.", ok: turnOff ? "Yes, switch it off" : "Switch it on", danger: turnOff }))) return;
    try { await call("/api/admin/settings", "POST", { maintenance: turnOff, message: $("#k-msg").value }); toast(turnOff ? "Cramly is OFF" : "Cramly is ON"); render(); } catch (e) { toast(e.message, true); }
  });
  $("#k-save").addEventListener("click", async () => { try { await call("/api/admin/settings", "POST", { message: $("#k-msg").value }); toast("Saved"); } catch (e) { toast(e.message, true); } });
  $("#b-send").addEventListener("click", async () => {
    const body = $("#b-body").value.trim();
    if (!body) return toast("Write a message first.", true);
    if (!(await ask({ title: "Send to everyone?", text: "It cannot be taken back once sent.", ok: "Send" }))) return;
    try { const d = await call("/api/admin/broadcast", "POST", { body, active_days: +$("#b-who").value }); toast(`Sent to ${d.sent} people`); $("#b-body").value = ""; } catch (e) { toast(e.message, true); }
  });
}

/* ============================================================ accounts */
let users = [], filter = "all", query = "";
const online = (u) => Date.now() / 1000 - u.last_seen < 120;
const badges = (u) => [u.banned ? '<span class="tag bad">banned</span>' : "", u.timeout_until ? '<span class="tag amber">on a break</span>' : "", u.premium ? '<span class="tag good">premium</span>' : '<span class="tag">free</span>'].join("");
const FILTERS = { all: () => true, online, premium: (u) => u.premium, free: (u) => !u.premium, banned: (u) => u.banned, break: (u) => u.timeout_until };
function drawUsers() {
  const q = query.trim().toLowerCase();
  const rows = users.filter((u) => FILTERS[filter](u) && (!q || `${u.name} ${u.id} ${u.invite}`.toLowerCase().includes(q)));
  $("#u-count").textContent = `${rows.length} of ${users.length}`;
  $("#u-list").innerHTML = rows.map((u) => `<button class="urow" data-id="${u.id}"><span class="dot ${online(u) ? "green" : "grey"}" title="${online(u) ? "online now" : "offline"}"></span>
    <span class="uname"><b>${esc(u.name || "No name yet")}</b><small>#${u.id} · ${u.sets} sets${u.invite ? ` · via ${esc(u.invite)}` : ""}</small></span>
    <span class="utags">${badges(u)}</span><span class="useen muted">${ago(u.last_seen)}</span></button>`).join("") || '<p class="muted pad">Nobody matches.</p>';
}
async function accountsTab() {
  users = (await call("/api/admin/users")).users;
  $("#page").innerHTML = `<div class="card"><div class="row between"><h2>Accounts <small class="muted" id="u-count"></small></h2><button class="btn small" id="u-refresh" type="button">Refresh</button></div>
    <input id="u-q" placeholder="Search by name, number or link name" value="${esc(query)}">
    <div class="chips" id="u-filters">${Object.keys(FILTERS).map((f) => `<button data-f="${f}" class="${f === filter ? "on" : ""}">${f === "break" ? "on a break" : f}</button>`).join("")}</div>
    <div class="ulist" id="u-list"></div></div>`;
  drawUsers();
  $("#u-q").addEventListener("input", (e) => { query = e.target.value; drawUsers(); });
  $("#u-filters").addEventListener("click", (e) => { const b = e.target.closest("button[data-f]"); if (!b) return; filter = b.dataset.f; $$("#u-filters button").forEach((x) => x.classList.toggle("on", x === b)); drawUsers(); });
  $("#u-refresh").addEventListener("click", render);
  $("#u-list").addEventListener("click", (e) => { const r = e.target.closest(".urow"); if (r) accountModal(users.find((u) => u.id === +r.dataset.id)); });
  timer = setInterval(async () => { if (tab === "accounts" && !$("#modal").open) { try { users = (await call("/api/admin/users")).users; drawUsers(); } catch { /* retry next time */ } } }, 15000);
}
function accountModal(u) {
  const m = $("#modal");
  $("#modal-body").innerHTML = `<div class="row between"><div><h3>${esc(u.name || "No name yet")} <small class="muted">#${u.id}</small></h3><div class="utags">${badges(u)}</div></div><button class="btn small" id="a-x" type="button">Close</button></div>
    <div class="facts"><div><b>${ago(u.last_seen)}</b><span>last seen</span></div><div><b>${new Date(u.created * 1000).toLocaleDateString()}</b><span>joined</span></div><div><b>${u.sets}</b><span>study sets</span></div><div><b>${u.premium ? "∞" : `${Math.max(0, 60 - u.trial_used)}s`}</b><span>${u.premium ? "premium" : "free time left"}</span></div></div>
    ${u.banned ? `<p class="note">Banned${u.ban_reason ? `: ${esc(u.ban_reason)}` : ""}</p>` : ""}${u.timeout_until ? `<p class="note">On a break for ${until(u.timeout_until)} more${u.ban_reason ? `: ${esc(u.ban_reason)}` : ""}</p>` : ""}
    <div class="acts"><button class="btn primary" data-a="message">💌 Send a message</button><button class="btn" data-a="timeout">⏸ Time out</button>${u.timeout_until ? '<button class="btn good" data-a="untimeout">Lift break</button>' : ""}
      ${u.banned ? '<button class="btn good" data-a="unban">Unban</button>' : '<button class="btn bad" data-a="ban">🚫 Ban</button>'}
      ${u.premium ? '<button class="btn" data-a="unpremium">Remove premium</button>' : '<button class="btn" data-a="premium">⭐ Give premium</button>'}
      <button class="btn" data-a="reset">Reset free minute</button><button class="btn danger" data-a="delete">Delete account</button></div>`;
  $("#a-x").addEventListener("click", () => m.close());
  $$("[data-a]", m).forEach((b) => b.addEventListener("click", () => doAction(b.dataset.a, u)));
  if (!m.open) m.showModal();
}
async function doAction(a, u) {
  $("#modal").close();
  const base = `/api/admin/users/${u.id}`, who = u.name || `#${u.id}`;
  const run = async (fn, okMsg) => { try { await fn(); toast(okMsg); await accountsTab(); } catch (e) { toast(e.message, true); } };
  if (a === "message") {
    const body = await ask({ title: `Message ${who}`, text: "They see it as a popup the next time they open Cramly, or within seconds if they are in it now.", ok: "Send", field: { label: "Your message", area: true, hint: "Write it just for them" } });
    if (body?.trim()) run(() => call(`${base}/message`, "POST", { body }), "Message sent");
  } else if (a === "timeout") {
    const mins = await ask({ title: `Time out ${who}`, text: "They are locked out for this long, then it ends by itself.", ok: "Next", field: { label: "Minutes (60 = 1 hour, 1440 = 1 day)", type: "number", value: 60 } });
    if (!mins || +mins < 1) return;
    const reason = await ask({ title: "Reason they will see", text: "Optional.", ok: "Time them out", field: { label: "Reason", hint: "e.g. Please slow down" } });
    if (reason !== null) run(() => call(`${base}/timeout`, "POST", { minutes: +mins, reason }), "Timed out");
  } else if (a === "untimeout") run(() => call(`${base}/timeout`, "POST", { minutes: 0 }), "Break lifted");
  else if (a === "ban") {
    const reason = await ask({ title: `Ban ${who}?`, text: "They are blocked from everything straight away.", ok: "Ban", danger: true, field: { label: "Reason they will see (optional)", hint: "e.g. Sharing premium links" } });
    if (reason !== null) run(() => call(`${base}/ban`, "POST", { banned: true, reason }), "Banned");
  } else if (a === "unban") run(() => call(`${base}/ban`, "POST", { banned: false }), "Unbanned");
  else if (a === "premium") {
    const days = await ask({ title: `Give ${who} premium`, text: "A free gift. Leave 0 for forever.", ok: "Give premium", field: { label: "Days (0 = forever)", type: "number", value: 0 } });
    if (days !== null) run(() => call(`${base}/premium`, "POST", { on: true, days: +days || 0 }), "Premium on");
  } else if (a === "unpremium") { if (await ask({ title: `Remove premium from ${who}?`, ok: "Remove", danger: true })) run(() => call(`${base}/premium`, "POST", { on: false }), "Premium removed"); }
  else if (a === "reset") run(() => call(`${base}/reset-trial`, "POST", {}), "Free minute reset");
  else if (a === "delete") { if (await ask({ title: `Delete ${who} for good?`, text: "Their account and every study set are removed. This cannot be undone.", ok: "Delete forever", danger: true })) run(() => call(base, "DELETE"), "Deleted"); }
}

/* ============================================================ links: a personal premium link for one person */
const TEMPLATES = {
  gift: (n) => `Hey ${n || "you"}! I made Cramly, a study app, and I want you to have premium for free. Have fun and tell me what you think!`,
  group: (n) => `Hey ${n || "you"}! Here is premium Cramly for our study group. Use it for the exam and share what works.`,
  thanks: (n) => `Hi ${n || "there"}, thank you for testing Cramly with me. This premium link is my thank you. It is yours.`,
};
const giftText = (i) => `${i.message ? `${i.message}\n\n` : ""}🎁 Cramly Premium normally costs $2.99, but this one is a free gift from me. Open this link on your phone or laptop and everything unlocks:\n${i.link}`;
const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { prompt("Copy this:", t); } };
async function linksTab() {
  const o = await call("/api/admin/overview");
  const row = (i) => `<div class="lrow"><div><b>${esc(i.label)}</b> <span class="tag ${i.revoked ? "bad" : "good"}">${i.revoked ? "switched off" : "active"}</span>
      <div class="muted small">${i.uses} of ${i.uses_max} devices · ${i.days ? `${i.days} days` : "forever"} · made ${new Date(i.created * 1000).toLocaleDateString()}</div>
      ${i.message ? `<div class="lnote">${esc(i.message)}</div>` : ""}</div>
      <div class="acts"><button class="btn small primary" data-copy="${i.id}">Copy message + link</button><button class="btn small" data-toggle="${i.id}" data-r="${i.revoked ? 0 : 1}">${i.revoked ? "Switch on" : "Switch off"}</button><button class="btn small danger" data-del="${i.id}">Delete</button></div></div>`;
  $("#page").innerHTML = `<div class="card"><h2>New personal link ✨</h2><p class="muted">Make a link for one person. When they open it, premium unlocks and your personal note appears for them, along with the message that it normally costs $2.99 and is a free gift.</p>
    <div class="grid2"><label>Who is it for?<input id="l-name" maxlength="60" placeholder="e.g. Sara"></label><div class="grid2"><label>Devices<input id="l-uses" type="number" min="1" max="50" value="2"></label><label>Days (0 = forever)<input id="l-days" type="number" min="0" max="3650" value="0"></label></div></div>
    <label>Your personal message to them<textarea id="l-msg" maxlength="1200" placeholder="Write it just for them"></textarea></label>
    <div class="chips" id="l-tpl"><span class="muted small">Start from:</span><button data-t="gift">Friendly gift</button><button data-t="group">Study group</button><button data-t="thanks">Thank you</button></div>
    <div class="row"><button class="btn primary big" id="l-make" type="button">Make the link</button></div><div id="l-result"></div></div>
    <div class="card"><h2>Your links <small class="muted">${o.invites.length}</small></h2>${o.invites.map(row).join("") || '<p class="muted">Nothing yet.</p>'}</div>`;
  $("#l-tpl").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (b) $("#l-msg").value = TEMPLATES[b.dataset.t]($("#l-name").value.trim()); });
  $("#l-make").addEventListener("click", async () => {
    try {
      const d = await call("/api/admin/invites", "POST", { label: $("#l-name").value || "Friend", uses_max: +$("#l-uses").value, days: +$("#l-days").value, message: $("#l-msg").value });
      $("#l-result").innerHTML = `<div class="made"><b>Ready to send 🎉</b><pre>${esc(giftText(d.invite))}</pre><button class="btn primary" id="l-copy" type="button">Copy to send</button></div>`;
      $("#l-copy").addEventListener("click", () => copy(giftText(d.invite), "Copied. Paste it in a chat."));
      copy(giftText(d.invite), "Made and copied. Paste it in a chat.");
    } catch (e) { toast(e.message, true); }
  });
  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => copy(giftText(o.invites.find((i) => i.id === +b.dataset.copy)), "Copied. Paste it in a chat.")));
  $$("[data-toggle]").forEach((b) => b.addEventListener("click", async () => { await call(`/api/admin/invites/${b.dataset.toggle}/revoke`, "POST", { revoked: b.dataset.r === "1" }); render(); }));
  $$("[data-del]").forEach((b) => b.addEventListener("click", async () => { if (await ask({ title: "Delete this link?", text: "People who joined through it go back to the free minute.", ok: "Delete", danger: true })) { await call(`/api/admin/invites/${b.dataset.del}`, "DELETE"); render(); } }));
}
