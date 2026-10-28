#!/usr/bin/env python3
"""Pre-publication checks for the configured Supabase project.

Run manually: python3 tests/preflight.py
This contacts the project configured in js/config.js. It never prints API keys.
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = (ROOT / "js" / "config.js").read_text(encoding="utf-8")


def config_value(name):
    match = re.search(rf"\b{name}\s*=\s*(['\"])(.*?)\1", CONFIG)
    return match.group(2) if match else ""


url = config_value("SUPABASE_URL").rstrip("/")
key = config_value("SUPABASE_ANON_KEY")
turnstile = config_value("TURNSTILE_SITE_KEY")
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("OK   " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))


def call(path, method="GET", body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url + path,
        data=data,
        method=method,
        headers={
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError) as error:
        return 0, str(error)


is_url = url.startswith("https://") and ".supabase.co" in url and "YOUR-" not in url
is_key = bool(key) and "YOUR-" not in key and key not in ("anon-key", "placeholder")
check("SUPABASE_URL izgleda kao stvarni HTTPS projekat", is_url)
check("SUPABASE_ANON_KEY je podešen (vrijednost se ne ispisuje)", is_key)
check("TURNSTILE_SITE_KEY je podešen", bool(turnstile) and turnstile not in ("YOUR-SITE-KEY", "placeholder"))

if is_url and is_key:
    status, body = call("/rest/v1/teams?select=id&limit=1")
    check("anonimno čitanje ekipa radi", status == 200, f"HTTP {status or 'mrežna greška'}")

    status, body = call("/rest/v1/newsletter_subscribers?select=email&limit=1")
    try:
        rows = json.loads(body) if status == 200 else None
    except json.JSONDecodeError:
        rows = None
    private_blocked = status in (401, 403) or (status == 200 and rows == [])
    check("anonimni korisnik ne dobija e-mail adrese", private_blocked, f"HTTP {status or 'mrežna greška'}")

    status, body = call("/rest/v1/client_errors?select=id&limit=1")
    try:
        rows = json.loads(body) if status == 200 else None
    except json.JSONDecodeError:
        rows = None
    errors_blocked = status in (401, 403) or (status == 200 and rows == [])
    check("anonimni korisnik ne dobija izvještaje grešaka", errors_blocked, f"HTTP {status or 'mrežna greška'}")

    status, body = call("/functions/v1/subscribe-newsletter", "POST", {})
    # An invalid/empty request should be rejected by the deployed function, not return success.
    function_present = status not in (0, 404, 502, 503)
    check("Edge funkcija subscribe-newsletter je dostupna", function_present, f"HTTP {status or 'mrežna greška'}")
else:
    check("Supabase provjere preskočene dok config nije ispravan", False)

print(f"\n{sum(results)}/{len(results)} provjera prošlo.")
sys.exit(0 if all(results) else 1)
