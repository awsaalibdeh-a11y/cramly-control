import os
import sys
import unittest
from unittest import mock

os.environ.update(CONTROL_PASSWORD="a-long-control-password", CRAMLY_URL="https://cramly.example", ADMIN_KEY="a-long-private-passphrase", SECRET_KEY="t" * 40)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as control  # noqa: E402

H = {"X-Requested-With": "cramly-control"}


class Resp:
    def __init__(self, body=b'{"ok": true}', status=200):
        self.content, self.status_code, self.headers, self.ok = body, status, {"Content-Type": "application/json"}, status < 400

    def json(self):
        return {"maintenance": False}


class Control(unittest.TestCase):
    def setUp(self):
        control._tries.clear()
        self.c = control.app.test_client()

    def login(self):
        return self.c.post("/login", json={"password": "a-long-control-password"})

    def test_nothing_works_before_login(self):
        self.assertEqual(self.c.get("/api/admin/users").status_code, 401)
        self.assertEqual(self.c.get("/health").status_code, 401)
        self.assertFalse(self.c.get("/session").get_json()["ok"])

    def test_wrong_password_and_lockout(self):
        self.assertEqual(self.c.post("/login", json={"password": "nope"}).status_code, 403)
        for _ in range(6):
            self.c.post("/login", json={"password": "nope"})
        self.assertEqual(self.login().status_code, 429)                          # even the right one waits

    def test_proxy_signs_the_request_and_only_allows_owner_routes(self):
        self.assertEqual(self.login().status_code, 200)
        with mock.patch.object(control.requests, "request", return_value=Resp()) as sent:
            self.assertEqual(self.c.get("/api/admin/users").status_code, 200)
            args = sent.call_args
            self.assertEqual((args.args[0], args.args[1]), ("GET", "https://cramly.example/api/admin/users"))
            self.assertEqual(args.kwargs["headers"], {"X-Admin-Key": "a-long-private-passphrase"})
            self.assertEqual(self.c.post("/api/admin/users/7/ban", json={"banned": True}, headers=H).status_code, 200)
            self.assertEqual(self.c.post("/api/admin/users/7/ban", json={"banned": True}).status_code, 403)     # no CSRF header
            self.assertEqual(self.c.get("/api/me").status_code, 404)                                           # not an owner route
            self.assertEqual(self.c.post("/api/admin/users/x/ban", json={}, headers=H).status_code, 404)
            self.assertEqual(self.c.delete("/api/admin/users/9", headers=H).status_code, 200)

    def test_cramly_down_is_a_clear_error(self):
        self.login()
        with mock.patch.object(control.requests, "request", side_effect=control.requests.ConnectionError()):
            r = self.c.get("/api/admin/overview")
        self.assertEqual(r.status_code, 502)
        self.assertIn("waking up", r.get_json()["error"])

    def test_not_configured_is_explained(self):
        with mock.patch.dict(os.environ, {"CONTROL_PASSWORD": "short"}):
            self.assertEqual(self.c.post("/login", json={"password": "short"}).status_code, 503)


if __name__ == "__main__":
    unittest.main()
