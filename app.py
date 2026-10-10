"""Cramly Control: the owner's private admin site. It is a separate website with its own password; it never touches Cramly's
database. Every action goes to Cramly's owner API over HTTPS, signed with the shared ADMIN_KEY that lives only on the servers.

  CONTROL_PASSWORD   what you type to open this site (6+ characters; longer is safer)
  CRAMLY_URL         where Cramly lives, e.g. https://cramly-twz5.onrender.com
  ADMIN_KEY          the same ADMIN_KEY you set on Cramly
  SECRET_KEY         signs the login cookie (any long random text)
"""

import hmac
import os
import re
import secrets
import threading
import time

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session

BASE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE, ".env"))

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Strict", SESSION_COOKIE_SECURE=bool(os.environ.get("RENDER")),
                  PERMANENT_SESSION_LIFETIME=60 * 60 * 12, MAX_CONTENT_LENGTH=64 * 1024)

# only these Cramly owner routes can be reached through this site
ALLOWED = [
    ("GET", r"/api/admin/overview"), ("GET", r"/api/admin/log"), ("GET", r"/api/admin/requests"), ("POST", r"/api/admin/requests/\d+/decide"), ("GET", r"/api/admin/users"), ("GET", r"/api/admin/settings"), ("POST", r"/api/admin/settings"),
    ("POST", r"/api/admin/broadcast"), ("POST", r"/api/admin/invites"), ("POST", r"/api/admin/invites/\d+/revoke"), ("DELETE", r"/api/admin/invites/\d+"),
    ("POST", r"/api/admin/users/\d+/(ban|timeout|message|premium|reset-trial)"), ("DELETE", r"/api/admin/users/\d+"),
    ("GET", r"/api/admin/uni"), ("POST", r"/api/admin/uni/(app|note|device)"), ("DELETE", r"/api/admin/uni/note/\d+"),     # every app, through Cramly
]
APP_URLS = {                                                       # what "is it up?" checks, one per app
    "cramly": "https://cramly-twz5.onrender.com/healthz", "homebase": "https://homebase-family.onrender.com/health", "alibi": "https://alibi-d9tn.onrender.com/",
    "scout": "https://scout-15t6.onrender.com/", "unwritten": "https://unwritten-dulm.onrender.com/", "cookify": "https://cookify-6auu.onrender.com/",
    "crosswind": "https://crosswind-w8g9.onrender.com/", "platter": "https://platter-87b0.onrender.com/", "tripmate": "https://tripmate-yecg.onrender.com/",
    "showcase": "https://showcase-hub-pu62.onrender.com/",
}
_probe = {"at": 0, "data": {}}
_tries = {}


def cramly_url():
    return (os.environ.get("CRAMLY_URL") or "").rstrip("/")


def configured():
    return len(os.environ.get("CONTROL_PASSWORD", "")) >= 6 and bool(cramly_url()) and len(os.environ.get("ADMIN_KEY", "")) >= 12


def too_many(bucket, limit, window=600):
    now = time.time()
    hits = [t for t in _tries.get(bucket, []) if now - t < window]
    hits.append(now)
    _tries[bucket] = hits
    return len(hits) > limit


@app.after_request
def headers(resp):
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Content-Security-Policy"] = ("default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
                                               "font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'")
    return resp


@app.get("/")
def index():
    return render_template("index.html", configured=configured(), v=int(os.path.getmtime(os.path.join(BASE, "static", "control.js"))))


@app.post("/login")
def login():
    if not configured():
        return jsonify(error="Not set up yet. Add CONTROL_PASSWORD, CRAMLY_URL and ADMIN_KEY on the server."), 503
    if len([t for t in _tries.get("fails", []) if time.time() - t < 3600]) >= 20:
        return jsonify(error="Too many wrong passwords from everywhere. Locked for an hour."), 429
    if too_many(request.remote_addr or "?", 6):
        return jsonify(error="Too many tries. Wait ten minutes."), 429
    given = str((request.get_json(silent=True) or {}).get("password") or "")
    if not hmac.compare_digest(given.encode(), os.environ["CONTROL_PASSWORD"].encode()):
        _tries.setdefault("fails", []).append(time.time())
        return jsonify(error="Wrong password."), 403
    session.clear()
    session.permanent = True
    session["ok"] = True
    return jsonify(ok=True)


@app.post("/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/session")
def whoami():
    return jsonify(ok=bool(session.get("ok")), configured=configured())


@app.route("/api/<path:rest>", methods=["GET", "POST", "DELETE"])
def proxy(rest):
    if not session.get("ok"):
        return jsonify(error="Sign in first."), 401
    if request.method != "GET" and request.headers.get("X-Requested-With") != "cramly-control":
        return jsonify(error="Blocked."), 403
    path = f"/api/{rest}"
    if not any(request.method == m and re.fullmatch(p, path) for m, p in ALLOWED):
        return jsonify(error="Not allowed."), 404
    try:
        r = requests.request(request.method, cramly_url() + path, params=request.args if request.method == "GET" else None,
                             json=request.get_json(silent=True) if request.method != "GET" else None,
                             headers={"X-Admin-Key": os.environ["ADMIN_KEY"]}, timeout=70)
        return (r.content, r.status_code, {"Content-Type": r.headers.get("Content-Type", "application/json")})
    except requests.RequestException:
        return jsonify(error="Cramly did not answer. It may be waking up (free servers sleep). Try again in a minute."), 502


HOMEBASE_URL = "https://homebase-family.onrender.com"


@app.route("/hb/<path:rest>", methods=["GET", "POST"])
def homebase_proxy(rest):
    """The owner's override for Homebase: see every parent lock and lift any of them. Homebase asks Cramly whether the owner key is right, so there is nothing new to set up."""
    if not session.get("ok"):
        return jsonify(error="Sign in first."), 401
    if request.method != "GET" and request.headers.get("X-Requested-With") != "cramly-control":
        return jsonify(error="Blocked."), 403
    path = f"/{rest}"
    if not any(request.method == m and re.fullmatch(p, path) for m, p in [("GET", r"/api/admin/locks"), ("POST", r"/api/admin/locks/\d+/lift")]):
        return jsonify(error="Not allowed."), 404
    key = os.environ.get("HB_ADMIN_KEY") or os.environ.get("ADMIN_KEY", "")                     # the same owner key Cramly already trusts
    if len(key) < 12:
        return jsonify(error="Not set up yet: ADMIN_KEY is missing."), 503
    try:
        r = requests.request(request.method, (os.environ.get("HOMEBASE_URL") or HOMEBASE_URL).rstrip("/") + path, headers={"X-Admin-Key": key}, timeout=60)
        return (r.content, r.status_code, {"Content-Type": r.headers.get("Content-Type", "application/json")})
    except requests.RequestException:
        return jsonify(error="Homebase did not answer. It may be waking up. Try again in a minute."), 502


@app.get("/apps")
def apps_health():
    """Up or not, and how fast, for every app at once. Cached for 25 seconds; a sleeping free server can take a minute to wake."""
    if not session.get("ok"):
        return jsonify(error="Sign in first."), 401
    if time.time() - _probe["at"] > 25:
        out = {}

        def one(k, u):
            t0 = time.time()
            try:
                r = requests.get(u, timeout=45, headers={"User-Agent": "control-probe"})
                out[k] = {"up": r.status_code < 500 or r.status_code == 503, "code": r.status_code, "ms": int((time.time() - t0) * 1000)}
            except requests.RequestException:
                out[k] = {"up": False, "code": 0, "ms": int((time.time() - t0) * 1000)}
        ts = [threading.Thread(target=one, args=kv) for kv in APP_URLS.items()]
        [t.start() for t in ts]
        [t.join(50) for t in ts]
        _probe.update(at=time.time(), data=out)
    return jsonify(apps=_probe["data"], urls=APP_URLS)


@app.get("/health")
def health():
    """Is Cramly up, and how fast does it answer?"""
    if not session.get("ok"):
        return jsonify(error="Sign in first."), 401
    t0 = time.time()
    try:
        r = requests.get(cramly_url() + "/api/status", timeout=60)
        return jsonify(up=r.ok, ms=int((time.time() - t0) * 1000), maintenance=bool(r.json().get("maintenance")))
    except (requests.RequestException, ValueError):
        return jsonify(up=False, ms=int((time.time() - t0) * 1000), maintenance=False)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5125)), debug=False)
