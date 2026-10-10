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
/** One dialog, reused: show some HTML, wire it up, and resolve when `finish(value)` is called or the dialog is dismissed (Esc). */
function openDialog(html, setup) {
  return new Promise((resolve) => {
    const m = $("#modal");
    $("#modal-body").innerHTML = html;
    let done = false;
    const onClose = () => finish(null);
    const finish = (v) => { if (done) return; done = true; m.removeEventListener("close", onClose); if (m.open) m.close(); resolve(v); };
    m.addEventListener("close", onClose);
    if (!m.open) m.showModal();
    setup(finish, m);
  });
}
function ask({ title, text = "", ok = "Yes", danger = false, field = null }) {
  const input = field ? `<label>${esc(field.label)}${field.area ? `<textarea id="m-in" maxlength="${field.max || 1200}" placeholder="${esc(field.hint || "")}"></textarea>` : `<input id="m-in" type="${field.type || "text"}" value="${esc(field.value ?? "")}" placeholder="${esc(field.hint || "")}">`}</label>` : "";
  return openDialog(`<h3>${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ""}${input}
    <div class="row end"><button class="btn" id="m-no" type="button">Cancel</button><button class="btn ${danger ? "bad" : "primary"}" id="m-ok" type="button">${esc(ok)}</button></div>`, (finish) => {
    $("#m-ok").addEventListener("click", () => finish(field ? $("#m-in").value : true));
    $("#m-no").addEventListener("click", () => finish(null));
    $("#m-in")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !field.area) finish($("#m-in").value); });
    $("#m-in")?.focus();
  });
}
const DURATIONS = [["10 min", 10], ["30 min", 30], ["1 hour", 60], ["6 hours", 360], ["1 day", 1440], ["3 days", 4320], ["7 days", 10080], ["30 days", 43200]];
const UNITS = { minutes: 1, hours: 60, days: 1440 };
const spanText = (min) => (min >= 1440 && min % 1440 === 0 ? `${min / 1440} day${min === 1440 ? "" : "s"}` : min >= 60 && min % 60 === 0 ? `${min / 60} hour${min === 60 ? "" : "s"}` : `${min} minute${min === 1 ? "" : "s"}`);
/** A time-out picker: quick presets or any exact amount in minutes, hours or days, plus the reason they will see. */
function timeoutDialog(who) {
  return openDialog(`<h3>Time out ${esc(who)}</h3><p class="muted">They are locked out for exactly this long, then it ends by itself.</p>
    <div class="chips" id="t-presets">${DURATIONS.map(([l, m]) => `<button type="button" data-m="${m}">${l}</button>`).join("")}</div>
    <div class="grid2"><label>Or an exact amount<input id="t-n" type="number" min="1" step="1" placeholder="e.g. 45"></label>
      <label>Unit<select id="t-u"><option>minutes</option><option>hours</option><option>days</option></select></label></div>
    <label>Reason they will see (optional)<input id="t-r" maxlength="300" placeholder="e.g. Please slow down for a moment"></label>
    <p class="note" id="t-sum">Pick how long.</p>
    <div class="row end"><button class="btn" id="t-no" type="button">Cancel</button><button class="btn primary" id="t-ok" type="button" disabled>Time out</button></div>`, (finish) => {
    let minutes = 0;
    const set = (m, fromChip) => {
      minutes = Math.max(0, Math.round(m));
      $$("#t-presets button").forEach((b) => b.classList.toggle("on", fromChip && +b.dataset.m === minutes));
      $("#t-ok").disabled = !minutes;
      $("#t-ok").textContent = minutes ? `Time out for ${spanText(minutes)}` : "Time out";
      $("#t-sum").textContent = minutes ? `Locked until ${new Date(Date.now() + minutes * 60000).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : "Pick how long.";
    };
    $("#t-presets").addEventListener("click", (e) => { const b = e.target.closest("button[data-m]"); if (b) { $("#t-n").value = ""; set(+b.dataset.m, true); } });
    const custom = () => set((+$("#t-n").value || 0) * UNITS[$("#t-u").value], false);
    $("#t-n").addEventListener("input", custom); $("#t-u").addEventListener("change", custom);
    $("#t-ok").addEventListener("click", () => finish({ minutes, reason: $("#t-r").value }));
    $("#t-no").addEventListener("click", () => finish(null));
  });
}
function show(on) { $("#login").hidden = on; $("#shell").hidden = !on; }

/* ---------- sign in, tabs, health ---------- */
let tab = "apps", timer = 0;
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
  try { await ({ apps: appsTab, overview: overviewTab, requests: requestsTab, accounts: accountsTab, links: linksTab })[tab](); } catch (e) { if (e.message !== "Signed out.") $("#page").innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><button class="btn" onclick="render()">Try again</button></div>`; }
  health(); badge();
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
  const [o, st, lg] = await Promise.all([call("/api/admin/overview"), call("/api/admin/settings"), call("/api/admin/log")]);
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  $("#page").innerHTML = `<div class="stats">${stat(o.accounts, "Accounts")}${stat(o.pending_requests || 0, "Waiting requests")}${stat(o.premium - (o.plus || 0), "Premium")}${stat(o.plus || 0, "Premium Plus")}${stat(o.free, "Free")}${stat(o.locked, "Used their free minute")}${stat(o.new_today, "New today")}${stat(o.active_today, "Active today")}${stat(o.banned || 0, "Banned")}</div>
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
  $("#page").insertAdjacentHTML("beforeend", `<div class="card"><h2>Recent actions <small class="muted">${lg.entries.length}</small></h2>${lg.entries.map((e) => `<div class="logrow"><span>${esc(e.text)}</span><small>${ago(e.t)}</small></div>`).join("") || '<p class="muted">Nothing yet. Everything you do here shows up in this list.</p>'}</div>`);
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
const badges = (u) => [u.banned ? '<span class="tag bad">banned</span>' : "", u.timeout_until ? '<span class="tag amber">on a break</span>' : "", u.premium ? (u.plan === "plus" ? '<span class="tag plus">premium plus</span>' : '<span class="tag good">premium</span>') : '<span class="tag">free</span>'].join("");
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
      <button class="btn" data-a="premium">⭐ ${u.premium ? "Change plan" : "Give a plan"}</button>${u.premium ? '<button class="btn" data-a="unpremium">Remove premium</button>' : ""}
      <button class="btn" data-a="reset">Reset free minute</button><button class="btn danger" data-a="delete">Delete account</button></div>`;
  $("#a-x").addEventListener("click", () => m.close());
  $$("[data-a]", m).forEach((b) => b.addEventListener("click", () => doAction(b.dataset.a, u)));
  if (!m.open) m.showModal();
}
function planDialog(who, current) {
  return openDialog(`<h3>Give ${esc(who)} a plan</h3><p class="muted">A free gift. They get it right away${current !== "free" ? ` (now: ${esc(current)})` : ""}.</p>
    <div class="plans"><button type="button" class="plan-pick" data-p="premium"><b>⭐ Premium</b><small>Unlimited AI, all study tools, 30 sets, files to 200 MB</small></button>
      <button type="button" class="plan-pick plus" data-p="plus"><b>✨ Premium Plus</b><small>Everything, plus exam predictor, grader, mix-ups, sharing, smarter AI, 100 sets, files to 1 GB</small></button></div>
    <label>How many days? (0 = forever)<input id="p-days" type="number" min="0" max="3650" value="0"></label>
    <div class="row end"><button class="btn" id="p-no" type="button">Cancel</button></div>`, (finish) => {
    $$(".plan-pick").forEach((b) => b.addEventListener("click", () => finish({ plan: b.dataset.p, days: +$("#p-days").value || 0 })));
    $("#p-no").addEventListener("click", () => finish(null));
  });
}
async function doAction(a, u) {
  const base = `/api/admin/users/${u.id}`, who = u.name || `#${u.id}`;
  const run = async (fn, okMsg) => {
    try { await fn(); } catch (e) { toast(`Did not work: ${e.message}`, true); return; }
    toast(okMsg);
    try { users = (await call("/api/admin/users")).users; drawUsers(); } catch { /* the list refreshes on its own */ }
    const fresh = users.find((x) => x.id === u.id);
    if (fresh) accountModal(fresh);
  };
  if (a === "message") {
    const body = await ask({ title: `Message ${who}`, text: "They see it as a popup the next time they open Cramly, or within seconds if they are in it now.", ok: "Send", field: { label: "Your message", area: true, hint: "Write it just for them" } });
    if (body?.trim()) return run(() => call(`${base}/message`, "POST", { body }), `Message sent to ${who}`);
  } else if (a === "timeout") {
    const t = await timeoutDialog(who);
    if (t) return run(() => call(`${base}/timeout`, "POST", t), `${who} is timed out for ${spanText(t.minutes)}`);
  } else if (a === "untimeout") return run(() => call(`${base}/timeout`, "POST", { minutes: 0 }), `Break lifted for ${who}`);
  else if (a === "ban") {
    const reason = await ask({ title: `Ban ${who}?`, text: "They are blocked from everything straight away.", ok: "Ban them", danger: true, field: { label: "Reason they will see (optional)", hint: "e.g. Sharing premium links" } });
    if (reason !== null) return run(() => call(`${base}/ban`, "POST", { banned: true, reason }), `${who} is banned`);
  } else if (a === "unban") return run(() => call(`${base}/ban`, "POST", { banned: false }), `${who} is unbanned`);
  else if (a === "premium") {
    const p = await planDialog(who, u.plan || "free");
    if (p) return run(() => call(`${base}/premium`, "POST", { on: true, days: p.days, plan: p.plan }), `${who} now has ${p.plan === "plus" ? "Premium Plus" : "Premium"}`);
  } else if (a === "unpremium") {
    if (await ask({ title: `Remove premium from ${who}?`, text: "They go back to the free plan.", ok: "Remove", danger: true })) return run(() => call(`${base}/premium`, "POST", { on: false }), `${who} is on the free plan`);
  } else if (a === "reset") return run(() => call(`${base}/reset-trial`, "POST", {}), `Free minute reset for ${who}`);
  else if (a === "delete") {
    if (await ask({ title: `Delete ${who} for good?`, text: "Their account and every study set are removed. This cannot be undone.", ok: "Delete forever", danger: true })) {
      try { await call(base, "DELETE"); } catch (e) { toast(`Did not work: ${e.message}`, true); return; }
      toast(`${who} was deleted`);
      try { users = (await call("/api/admin/users")).users; drawUsers(); } catch { /* ignore */ }
    }
  }
  const back = users.find((x) => x.id === u.id);                      // cancelled: bring the account panel back
  if (back) accountModal(back);
}

/* ============================================================ links: a personal premium link for one person */
const TEMPLATES = {
  gift: (n) => `Hey ${n || "you"}! I made Cramly, a study app, and I want you to have premium for free. Have fun and tell me what you think!`,
  group: (n) => `Hey ${n || "you"}! Here is premium Cramly for our study group. Use it for the exam and share what works.`,
  thanks: (n) => `Hi ${n || "there"}, thank you for testing Cramly with me. This premium link is my thank you. It is yours.`,
};
const giftText = (i) => `${i.message ? `${i.message}\n\n` : ""}🎁 Cramly ${i.plan === "plus" ? "Premium Plus is the top plan" : "Premium normally costs $2.99"}, but this one is a free gift from me. Open this link on your phone or laptop and everything unlocks:\n${i.link}`;
const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { prompt("Copy this:", t); } };
async function linksTab() {
  const o = await call("/api/admin/overview");
  const row = (i) => `<div class="lrow"><div><b>${esc(i.label)}</b> <span class="tag ${i.plan === "plus" ? "plus" : ""}">${i.plan === "plus" ? "premium plus" : "premium"}</span> <span class="tag ${i.revoked ? "bad" : "good"}">${i.revoked ? "switched off" : "active"}</span>
      <div class="muted small">${i.uses} of ${i.uses_max} devices · ${i.days ? `${i.days} days` : "forever"} · made ${new Date(i.created * 1000).toLocaleDateString()}</div>
      ${i.message ? `<div class="lnote">${esc(i.message)}</div>` : ""}</div>
      <div class="acts"><button class="btn small primary" data-copy="${i.id}">Copy message + link</button><button class="btn small" data-toggle="${i.id}" data-r="${i.revoked ? 0 : 1}">${i.revoked ? "Switch on" : "Switch off"}</button><button class="btn small danger" data-del="${i.id}">Delete</button></div></div>`;
  $("#page").innerHTML = `<div class="card"><h2>New personal link ✨</h2><p class="muted">Make a link for one person. When they open it, premium unlocks and your personal note appears for them, along with the message that it normally costs $2.99 and is a free gift.</p>
    <div class="grid2"><label>Who is it for?<input id="l-name" maxlength="60" placeholder="e.g. Sara"></label><div class="grid2"><label>Plan<select id="l-plan"><option value="premium">Premium</option><option value="plus">Premium Plus</option></select></label><label>Devices<input id="l-uses" type="number" min="1" max="50" value="2"></label><label>Days (0 = forever)<input id="l-days" type="number" min="0" max="3650" value="0"></label></div></div>
    <label>Your personal message to them<textarea id="l-msg" maxlength="1200" placeholder="Write it just for them"></textarea></label>
    <div class="chips" id="l-tpl"><span class="muted small">Start from:</span><button data-t="gift">Friendly gift</button><button data-t="group">Study group</button><button data-t="thanks">Thank you</button></div>
    <div class="row"><button class="btn primary big" id="l-make" type="button">Make the link</button></div><div id="l-result"></div></div>
    <div class="card"><h2>Your links <small class="muted">${o.invites.length}</small></h2>${o.invites.map(row).join("") || '<p class="muted">Nothing yet.</p>'}</div>`;
  $("#l-tpl").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (b) $("#l-msg").value = TEMPLATES[b.dataset.t]($("#l-name").value.trim()); });
  $("#l-make").addEventListener("click", async () => {
    try {
      const d = await call("/api/admin/invites", "POST", { label: $("#l-name").value || "Friend", uses_max: +$("#l-uses").value, days: +$("#l-days").value, message: $("#l-msg").value, plan: $("#l-plan").value });
      $("#l-result").innerHTML = `<div class="made"><b>Ready to send 🎉</b><pre>${esc(giftText(d.invite))}</pre><button class="btn primary" id="l-copy" type="button">Copy to send</button></div>`;
      $("#l-copy").addEventListener("click", () => copy(giftText(d.invite), "Copied. Paste it in a chat."));
      copy(giftText(d.invite), "Made and copied. Paste it in a chat.");
    } catch (e) { toast(e.message, true); }
  });
  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => copy(giftText(o.invites.find((i) => i.id === +b.dataset.copy)), "Copied. Paste it in a chat.")));
  $$("[data-toggle]").forEach((b) => b.addEventListener("click", async () => { await call(`/api/admin/invites/${b.dataset.toggle}/revoke`, "POST", { revoked: b.dataset.r === "1" }); render(); }));
  $$("[data-del]").forEach((b) => b.addEventListener("click", async () => { if (await ask({ title: "Delete this link?", text: "People who joined through it go back to the free minute.", ok: "Delete", danger: true })) { await call(`/api/admin/invites/${b.dataset.del}`, "DELETE"); render(); } }));
}

/* ============================================================ requests: people asking for a plan; you choose free or pay */
const PLAN_LABEL = { premium: "Premium", plus: "Premium Plus" };
const KIND_LABEL = { premium: "Premium request", question: "❓ Question", bug: "🐞 Problem", idea: "💡 Idea" };
let reqs = [];
async function badge() {
  try {
    const d = await call("/api/admin/requests");
    reqs = d.requests;
    const b = $("#req-badge"); b.hidden = !d.pending; b.textContent = d.pending;
    document.title = d.pending ? `(${d.pending}) Cramly Control` : "Cramly Control";
  } catch { /* signed out */ }
}
setInterval(() => { if (!$("#shell").hidden && !document.hidden) badge(); }, 30000);

function decideDialog(kind, r) {
  const plan = r.plan;
  const planPick = `<label>Plan<select id="d-plan"><option value="premium" ${plan === "premium" ? "selected" : ""}>Premium</option><option value="plus" ${plan === "plus" ? "selected" : ""}>Premium Plus</option></select></label>`;
  const days = `<label>How many days? (0 = forever)<input id="d-days" type="number" min="0" max="3650" value="0"></label>`;
  const forms = {
    free: { title: `Give ${r.name} a free plan 🎁`, text: "It unlocks right away and they get a message that it is a gift.", body: `${planPick}${days}<label>A note for them (optional)<textarea id="d-note" maxlength="600" placeholder="e.g. Good luck on the exam!"></textarea></label>`, ok: "Give it free", cls: "good" },
    pay: { title: `Ask ${r.name} to pay 💳`, text: "They get a message with the price and how to pay. It unlocks when you press Mark paid.", body: `${planPick}<label>Price<input id="d-price" maxlength="40" value="$2.99" placeholder="e.g. $2.99"></label><label>How should they pay?<textarea id="d-note" maxlength="600" placeholder="e.g. Send it to my PayPal, then reply here."></textarea></label>`, ok: "Send payment message", cls: "primary" },
    paid: { title: `Mark ${r.name} as paid ✅`, text: "This unlocks their plan now and tells them thank you.", body: `${planPick}${days}`, ok: "Unlock their plan", cls: "good" },
    reply: { title: `Reply to ${r.name} 💬`, text: "They get your reply as a message in the app.", body: `<label>Your reply<textarea id="d-note" maxlength="600" placeholder="Write your answer"></textarea></label>`, ok: "Send reply", cls: "primary" },
    declined: { title: `Decline ${r.name}?`, text: "They get a polite message. The free tools stay open for them.", body: `<label>Your message (optional)<textarea id="d-note" maxlength="600" placeholder="Thanks for asking. Not right now."></textarea></label>`, ok: "Decline", cls: "bad" },
  }[kind];
  return openDialog(`<h3>${forms.title}</h3><p class="muted">${forms.text}</p>${forms.body}<div class="row end"><button class="btn" id="d-no" type="button">Cancel</button><button class="btn ${forms.cls}" id="d-ok" type="button">${forms.ok}</button></div>`, (finish) => {
    $("#d-ok").addEventListener("click", () => finish({ decision: kind, plan: $("#d-plan")?.value, days: +($("#d-days")?.value || 0), price: $("#d-price")?.value || "", note: $("#d-note")?.value || "" }));
    $("#d-no").addEventListener("click", () => finish(null));
  });
}
async function decide(kind, r) {
  const t = kind === "close" ? { decision: "close" } : await decideDialog(kind, r);
  if (!t) return;
  if (t.decision === "reply" && !t.note.trim()) return toast("Write your reply first.", true);
  try {
    await call(`/api/admin/requests/${r.id}/decide`, "POST", t);
    toast({ free: `${r.name} got a free plan 🎁`, pay: `Asked ${r.name} to pay`, paid: `${r.name} is unlocked`, declined: `Declined ${r.name}`, reply: `Replied to ${r.name}`, close: "Closed" }[kind]);
    requestsTab(); badge();
  } catch (e) { toast(`Did not work: ${e.message}`, true); }
}
async function requestsTab() {
  await badge();
  const open = reqs.filter((r) => r.status === "pending"), waiting = reqs.filter((r) => r.status === "pay"), done = reqs.filter((r) => !["pending", "pay"].includes(r.status));
  const when = (r) => ago(r.created);
  const card = (r) => `<article class="req ${r.status}" data-id="${r.id}"><div class="req-head"><span class="av">${esc((r.name || "?")[0].toUpperCase())}</span><b>${esc(r.name)}</b>
      ${r.kind === "premium" ? `<span class="tag ${r.plan === "plus" ? "plus" : ""}">${PLAN_LABEL[r.plan]}</span>` : `<span class="tag">${KIND_LABEL[r.kind]}</span>`}${r.status === "pay" ? `<span class="tag pay">waiting to pay ${esc(r.price)}</span>` : ""}<small>${when(r)}</small></div>
      <p class="req-msg ${r.message ? "" : "none"}">${esc(r.message || "No message, they just asked.")}</p>
      ${r.exists ? `<div class="acts">${r.status === "pending" && r.kind !== "premium"
        ? `<button class="btn primary" data-k="reply">💬 Reply</button><button class="btn good" data-k="free">🎁 Give premium free</button><button class="btn" data-k="close">Close</button>`
        : r.status === "pending"
        ? `<button class="btn good" data-k="free">🎁 Give free</button><button class="btn" data-k="pay">💳 Ask to pay</button><button class="btn danger" data-k="declined">Decline</button>`
        : `<button class="btn good" data-k="paid">✅ Mark paid and unlock</button><button class="btn" data-k="free">🎁 Give free instead</button><button class="btn danger" data-k="declined">Cancel</button>`}</div>` : '<p class="muted small">That account was deleted.</p>'}</article>`;
  const old = (r) => `<div class="logrow"><span><b>${esc(r.name)}</b> ${r.kind === "premium" ? `asked for ${PLAN_LABEL[r.plan]}` : esc(KIND_LABEL[r.kind])}: <span class="tag ${r.status === "declined" ? "bad" : "done"}">${{ free: "given free", paid: "paid", declined: "declined", answered: "answered", closed: "closed" }[r.status] || r.status}</span></span><small>${ago(r.decided || r.created)}</small></div>`;
  $("#page").innerHTML = `<div class="card"><h2>New messages <small class="muted">${open.length}</small></h2><p class="muted small">People write to you from inside Cramly: premium requests, questions, problems and ideas. Answer them here and they get your reply in the app. For premium you choose: give it free, or ask them to pay.</p>
      ${open.map(card).join("") || '<p class="muted">Nobody is waiting. New requests show up here and on the tab badge.</p>'}</div>
    ${waiting.length ? `<div class="card"><h2>Waiting to pay <small class="muted">${waiting.length}</small></h2>${waiting.map(card).join("")}</div>` : ""}
    <div class="card"><h2>Earlier <small class="muted">${done.length}</small></h2>${done.map(old).join("") || '<p class="muted">Nothing yet.</p>'}</div>`;
  $("#page").onclick = (e) => { const b = e.target.closest("button[data-k]"); if (!b) return; const r = reqs.find((x) => x.id === +b.closest(".req").dataset.id); if (r) decide(b.dataset.k, r); };
}


/* ============================================================ all apps: switch off, message, troll, block, status */
const NAMES = { cramly: "Cramly", homebase: "Homebase", alibi: "Alibi", scout: "Scout", unwritten: "Unwritten", cookify: "Cookify", crosswind: "Crosswind", platter: "Platter", tripmate: "Tripmate", showcase: "Showcase" };
const EFFECT_LABEL = { confetti: "🎉 Confetti", flip: "🙃 Flip upside down", shake: "🫨 Shake", rainbow: "🌈 Rainbow colours", disco: "🪩 Disco flash", spin: "🌀 Spin once", emoji: "🤪 Emoji rain", fakecrash: "💥 Fake crash", blur: "😵 Blur", typewriter: "⌨️ Somebody is typing" };
async function appsTab() {
  const u = await call("/api/admin/uni");
  const liveHtml = (a) => !a ? '<span class="dot grey"></span>checking…' : a.up ? `<span class="dot green"></span>${a.ms} ms` : '<span class="dot red"></span>not answering';
  const live = (id) => `<span class="live" data-app="${id}">${liveHtml(null)}</span>`;
  const opts = (all) => `${all ? '<option value="*">Every app</option>' : ""}${u.apps.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}`;
  const row = (a) => `<div class="approw ${a.off ? "isoff" : ""}"><div class="appname"><b>${esc(a.name)}</b><small>${live(a.id)}${a.off ? ' · <span class="tag bad">switched off</span>' : ""}</small></div>
      <div class="row end"><button class="btn small" data-act="msg" data-app="${a.id}">Message</button><button class="btn small" data-act="troll" data-app="${a.id}">Troll</button>
      <button class="btn small ${a.off ? "good" : "bad"}" data-act="toggle" data-app="${a.id}" data-off="${a.off ? 0 : 1}">${a.off ? "Switch on" : "Switch off"}</button></div></div>`;
  $("#page").innerHTML = `<div class="card kill ${u.all.off ? "off" : ""}"><div class="kill-head"><div class="kill-ico">${u.all.off ? "🔴" : "🟢"}</div>
      <div><h2>${u.all.off ? "EVERYTHING is switched off" : "All apps are running"}</h2><p class="muted">One switch for every app. Each app stops within about 20 seconds and shows your message. This panel keeps working.</p></div></div>
      <label>Message people see<input id="a-msg" maxlength="300" value="${esc(u.all.msg || "")}" placeholder="e.g. Maintenance. Back at 6 pm."></label>
      <div class="row"><button class="btn ${u.all.off ? "good" : "bad"} big" id="a-all" type="button">${u.all.off ? "Switch everything back ON" : "Switch EVERYTHING off"}</button></div></div>
    <div class="card"><h2>Your apps <small class="muted">${u.apps.length}</small></h2>${u.apps.map(row).join("")}
      <p class="muted small">Status checks free servers, which sleep when nobody visits, so the first check of a sleeping app can say "not answering" for up to a minute.</p></div>
    <div class="card"><h2>Send a message or a troll 📣</h2>
      <div class="grid2"><label>Where<select id="n-app">${opts(true)}</select></label><label>How long it stays available<select id="n-min"><option value="10">10 minutes</option><option value="60" selected>1 hour</option><option value="1440">1 day</option></select></label></div>
      <label>Message (optional for trolls)<textarea id="n-body" maxlength="400" placeholder="Shows as a popup to everyone using that app, once each."></textarea></label>
      <div class="row"><button class="btn primary" id="n-send" type="button">Send message</button></div>
      <h3 style="margin:1rem 0 .5rem">Trolls <small class="muted">harmless, end by themselves</small></h3>
      <div class="chips" id="n-effects">${u.effects.map((e) => `<button type="button" data-e="${e}">${EFFECT_LABEL[e] || e}</button>`).join("")}</div></div>
    <div class="card" id="hb-locks"><h2>Homebase locks 🔒</h2><p class="muted">Parents can lock a child's devices (never more than 4 hours a day). You can lift any lock here, whenever you want.</p><div id="hb-lock-list" class="muted">Loading…</div></div>
    <div class="card"><h2>Live messages and trolls <small class="muted">${u.notes.length}</small></h2>${u.notes.map((n) => `<div class="logrow"><span>${n.kind === "troll" ? "🎭 " + esc(EFFECT_LABEL[n.effect] || n.effect) : "💬"} ${esc(n.body || "")} <small class="muted">→ ${n.app === "*" ? "everyone" : esc(NAMES[n.app] || n.app)} · until ${new Date(n.expires * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span><button class="btn small" data-act="del" data-id="${n.id}">Remove</button></div>`).join("") || '<p class="muted">Nothing active.</p>'}</div>
    <div class="card"><h2>One account everywhere 🔑</h2><p class="muted">People link their Cramly account in any app with a 6-digit code (Cramly, Settings, Use Cramly on another device). Then <b>every ban, time-out and message you make in the Accounts tab applies in every app</b> for that account, instantly.</p>
      <p class="muted">People who never linked an account are blocked by device. Their device id is shown in the ☁ panel of any app.</p>
      <div class="grid2"><label>Device id<input id="d-id" placeholder="paste a device id"></label><label>Minutes (empty for a permanent block)<input id="d-min" type="number" min="1" placeholder="e.g. 60"></label></div>
      <div class="row"><button class="btn bad" id="d-block" type="button">Block device</button><button class="btn" id="d-clear" type="button">Unblock</button></div>
      ${u.devs.length ? `<h3 style="margin:1rem 0 .5rem">Blocked devices</h3>${u.devs.map((d) => `<div class="logrow"><code>${esc(d.dev)}</code><small>${d.banned ? "blocked" : "until " + new Date(d.until * 1000).toLocaleString()}${d.reason ? " · " + esc(d.reason) : ""}</small></div>`).join("")}` : ""}</div>`;
  call("/apps").then((h) => $$(".live").forEach((el) => { el.innerHTML = liveHtml(h.apps[el.dataset.app]); })).catch(() => $$(".live").forEach((el) => { el.innerHTML = '<span class="dot grey"></span>unknown'; }));   // the slow part, filled in when it arrives
  const drawLocks = async () => {
    const box = $("#hb-lock-list"); if (!box) return;
    try {
      const d = await call("/hb/api/admin/locks");
      box.innerHTML = d.locks.map((l) => `<div class="logrow"><span><b>${esc(l.child)}</b> locked by ${esc(l.by)} <small class="muted">(${esc(l.family)}) · until ${new Date(l.until * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></span><button class="btn small bad" data-lift="${l.id}">Lift now</button></div>`).join("") || "No device is locked right now.";
      box.onclick = async (e) => { const b = e.target.closest("[data-lift]"); if (!b) return; try { await call(`/hb/api/admin/locks/${b.dataset.lift}/lift`, "POST"); toast("Lock lifted"); drawLocks(); } catch (x) { toast(x.message, true); } };
    } catch (e) { box.textContent = e.message; }
  };
  drawLocks();
  const send = async (path, body, okMsg) => { try { await call(path, "POST", body); toast(okMsg); render(); } catch (e) { toast(e.message, true); } };
  $("#a-all").addEventListener("click", async () => {
    const off = !u.all.off;
    if (!(await ask({ title: off ? "Switch EVERYTHING off?" : "Switch everything back on?", text: off ? "Every app stops for everyone and shows your message." : "Every app works again.", ok: off ? "Yes, all off" : "All on", danger: off }))) return;
    send("/api/admin/uni/app", { app: "*", off, msg: $("#a-msg").value }, off ? "Everything is OFF" : "Everything is ON");
  });
  $("#page").onclick = async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const app = b.dataset.app, name = NAMES[app] || app;
    if (b.dataset.act === "toggle") {
      const off = b.dataset.off === "1", msg = off ? await ask({ title: `Switch ${name} off`, text: "What should people see?", ok: "Switch off", danger: true, field: { label: "Message", hint: "Back soon." } }) : "";
      if (msg === null) return; send("/api/admin/uni/app", { app, off, msg: off ? msg : "" }, `${name} is ${off ? "OFF" : "ON"}`);
    } else if (b.dataset.act === "msg") { $("#n-app").value = app; $("#n-body").focus(); $("#n-body").scrollIntoView({ behavior: "smooth", block: "center" }); }
    else if (b.dataset.act === "troll") { $("#n-app").value = app; $("#n-effects").scrollIntoView({ behavior: "smooth", block: "center" }); toast(`Pick a troll for ${name}`); }
    else if (b.dataset.act === "del") { await call(`/api/admin/uni/note/${b.dataset.id}`, "DELETE").catch((x) => toast(x.message, true)); render(); }
  };
  $("#n-send").addEventListener("click", () => {
    const body = $("#n-body").value.trim(); if (!body) return toast("Write a message first.", true);
    send("/api/admin/uni/note", { app: $("#n-app").value, kind: "message", body, minutes: +$("#n-min").value }, "Message sent");
  });
  $("#n-effects").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-e]"); if (!b) return;
    send("/api/admin/uni/note", { app: $("#n-app").value, kind: "troll", effect: b.dataset.e, body: $("#n-body").value.trim(), minutes: +$("#n-min").value }, `Troll sent: ${EFFECT_LABEL[b.dataset.e]}`);
  });
  $("#d-block").addEventListener("click", () => { const dev = $("#d-id").value.trim(); if (!dev) return toast("Paste a device id.", true); send("/api/admin/uni/device", { dev, minutes: +$("#d-min").value || 0, reason: "" }, "Device blocked"); });
  $("#d-clear").addEventListener("click", () => { const dev = $("#d-id").value.trim(); if (!dev) return toast("Paste a device id.", true); send("/api/admin/uni/device", { dev, clear: true }, "Device unblocked"); });
}
