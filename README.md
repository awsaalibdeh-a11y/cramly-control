# Cramly Control

Private owner panel for Cramly. A separate website with its own password: it sees accounts, bans, times out, messages people, makes personal premium links, and has a kill switch for the whole app. It never touches Cramly's database; every action goes to Cramly's owner API, signed with the shared `ADMIN_KEY`.

Environment variables (set on the server, never in git):

| name | what |
| --- | --- |
| `CONTROL_PASSWORD` | what you type to open the panel (6+ characters; longer is safer) |
| `CRAMLY_URL` | where Cramly lives, e.g. `https://cramly-twz5.onrender.com` |
| `ADMIN_KEY` | the same `ADMIN_KEY` set on Cramly (12+ characters) |
| `SECRET_KEY` | signs the login cookie (any long random text) |

Run locally: `pip install -r requirements.txt`, copy `.env.example` to `.env`, then `python app.py` (port 5125). Tests: `python -m unittest discover tests`.
