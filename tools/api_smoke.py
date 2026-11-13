"""End-to-end test of the public API (api.linkfinderai.com), one call per
operation, the way an API customer calls it. Run by .github/workflows/api-smoke.yml
with the LINKFINDER_API_KEY secret; prints a table and writes api_smoke.json.

    python3 tools/api_smoke.py [--only type,type] [--skip-expensive] [--auth-only]

What it checks:
  1. which account the key belongs to (sha256 prefix only, never the key);
  2. error handling: no key, a wrong key, an unknown type, an empty input,
     an unknown job id -> each must be a clear 4xx JSON, never a 500;
  3. every operation of integrations/catalog/operations.json on a known input:
     HTTP status, sync or async (202 + /status polling), time, and the shape of
     the result. Values about a person (email, phone, profile) are masked;
     company-level values are printed.
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("LINKFINDER_API_BASE", "https://api.linkfinderai.com")
UA = "LinkFinderAI-api-smoke/1.0 (+https://linkfinderai.com)"

# type -> (input_data, extra fields, person data?)
CASES = {
    "company_name_to_website": ("HubSpot", {}, False),
    "company_name_to_phone": ("HubSpot", {}, False),
    "company_name_to_email": ("HubSpot", {}, False),
    "company_name_to_linkedin_url": ("HubSpot", {}, False),
    "company_name_to_employee_count": ("HubSpot", {}, False),
    "linkedin_company_to_employee_count": ("https://www.linkedin.com/company/hubspot", {}, False),
    "linkedin_company_to_linkedin_info": ("https://www.linkedin.com/company/hubspot", {}, False),
    "lead_full_name_to_linkedin_url": ("Satya Nadella Microsoft", {}, True),
    "lead_full_name_to_email": ("Brian Halligan HubSpot", {}, True),
    "email_to_linkedin_url": ("press@hubspot.com", {}, True),
    "linkedin_profile_to_linkedin_info": ("https://www.linkedin.com/in/satyanadella", {}, True),
    "linkedin_profile_to_email": ("https://www.linkedin.com/in/satyanadella", {}, True),
    "linkedin_profile_to_phone": ("https://www.linkedin.com/in/satyanadella", {}, True),
    "company_domain_to_employees": ("hubspot.com", {"employee_count": 2}, True),
    "company_name_to_employees": ("HubSpot", {"employee_count": 2}, True),
    "linkedin_company_to_employees": ("https://www.linkedin.com/company/hubspot", {"employee_count": 2}, True),
    "linkedin_post_to_reactions": ("https://www.linkedin.com/posts/satyanadella_activity-7262497370218758144-0000", {}, True),
    "instagram_lookup": ("hubspot", {}, False),
    "b2b_data_lookup": ("hubspot.com", {}, False),
}
EXPENSIVE = {"linkedin_profile_to_phone"}  # 50 credits


def call(method, path, key, body=None, timeout=90):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header("User-Agent", UA)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if key is not None:
        req.add_header("Authorization", f"Bearer {key}")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw, status = r.read().decode(errors="replace"), r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read().decode(errors="replace"), e.code
    except Exception as e:  # network
        return 0, {"_network": str(e)[:200]}, time.time() - t0
    try:
        data = json.loads(raw) if raw.strip() else {}
    except ValueError:
        data = {"_raw": raw[:300]}
    return status, data, time.time() - t0


def mask(v):
    if isinstance(v, str):
        if "@" in v:
            u, _, d = v.partition("@")
            return (u[:1] + "***@" + d) if u else v
        if any(c.isdigit() for c in v) and sum(c.isdigit() for c in v) >= 7:
            return v[:3] + "***" + v[-2:]
        if "linkedin.com/in/" in v:
            return v.split("/in/")[0] + "/in/***"
        return v
    if isinstance(v, list):
        return [mask(x) for x in v[:3]]
    if isinstance(v, dict):
        return {k: mask(x) for k, x in list(v.items())[:12]}
    return v


def shape(result, person):
    probe = result[0] if isinstance(result, list) and result else result
    if probe in (None, "", [], {}):
        return "EMPTY", None
    if isinstance(probe, dict) and any(k.lower() in ("error", "detail") for k in probe):
        return "UPSTREAM_ERROR", mask(probe)
    sample = mask(result) if person else (result[:3] if isinstance(result, list) else result)
    return "VALUE", sample


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--skip-expensive", action="store_true")
    ap.add_argument("--auth-only", action="store_true")
    a = ap.parse_args()
    key = os.environ.get("LINKFINDER_API_KEY", "")
    out = {"base": BASE, "key_sha256_12": hashlib.sha256(key.encode()).hexdigest()[:12] if key else None, "checks": [], "ops": []}
    print("key sha256 prefix:", out["key_sha256_12"])

    checks = [
        ("no key", "POST", "/", None, {"type": "company_name_to_website", "input_data": "HubSpot"}, (401, 403)),
        ("wrong key", "POST", "/", "lf_smoke_test_not_a_real_key", {"type": "company_name_to_website", "input_data": "HubSpot"}, (401, 403)),
        ("unknown type", "POST", "/", key, {"type": "no_such_type", "input_data": "HubSpot"}, (400, 422)),
        ("empty input", "POST", "/", key, {"type": "company_name_to_website", "input_data": ""}, (400, 422)),
        ("unknown job", "GET", "/status/00000000-0000-0000-0000-000000000000", key, None, (404, 410)),
    ]
    for name, m, path, k, body, want in checks:
        st, data, dt = call(m, path, k, body)
        ok = st in want
        out["checks"].append({"check": name, "status": st, "ok": ok, "body": mask(data)})
        print(f"[{'OK ' if ok else 'BAD'}] {name:13s} -> {st} {json.dumps(mask(data))[:160]}")
    if a.auth_only:
        json.dump(out, open("api_smoke.json", "w"), indent=1)
        return

    only = set(filter(None, a.only.split(",")))
    for op, (inp, extra, person) in CASES.items():
        if only and op not in only:
            continue
        if a.skip_expensive and op in EXPENSIVE:
            continue
        body = {"type": op, "input_data": inp, **extra}
        st, data, dt = call("POST", "/", key, body)
        mode, polls = "sync", 0
        if st == 202 and data.get("job_id"):
            mode, jid = "async", data["job_id"]
            deadline = time.time() + 240
            time.sleep(20)
            while time.time() < deadline:
                polls += 1
                st2, d2, _ = call("GET", f"/status/{jid}", key)
                s = str(d2.get("status", "")).lower()
                if st2 != 200 or s not in ("processing", "pending", "queued", ""):
                    st, data = st2, d2
                    break
                time.sleep(10)
            else:
                st, data = 504, {"_timeout": "still processing after 240s"}
            dt = time.time() - (deadline - 240) + 20
        kind, sample = shape(data.get("result") if isinstance(data, dict) else None, person) if st == 200 else ("HTTP_" + str(st), mask(data))
        row = {"type": op, "status": st, "mode": mode, "polls": polls, "secs": round(dt, 1), "kind": kind,
               "credits": data.get("credits_used") if isinstance(data, dict) else None, "sample": sample}
        out["ops"].append(row)
        print(f"{op:36s} {st:3d} {mode:5s} {dt:6.1f}s {kind:15s} {json.dumps(sample, ensure_ascii=False)[:150]}")
        time.sleep(1.5)
    json.dump(out, open("api_smoke.json", "w"), indent=1, ensure_ascii=False)
    bad = [c for c in out["checks"] if not c["ok"]] + [o for o in out["ops"] if o["status"] != 200]
    print(f"\n{len(bad)} problem(s)")


if __name__ == "__main__":
    main()
