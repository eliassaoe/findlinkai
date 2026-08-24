"""Covers the two functions that can silently put a WRONG name in a real email:
the model-output parser, and the is-this-the-prospect matcher."""
import sys, importlib.util
spec = importlib.util.spec_from_file_location("bc", "outbound/build_campaign.py")
bc = importlib.util.module_from_spec(spec); spec.loader.exec_module(bc)

fails = []
def check(label, got, want):
    ok = got == want
    if not ok: fails.append(label)
    print(f"{'PASS' if ok else 'FAIL':5} {label:<46} {got if ok else f'{got!r} want {want!r}'}")

print("--- parse_product_list ---")
check("clean json", bc.parse_product_list('["Stripe","Paddle"]'), ["Stripe","Paddle"])
check("fenced json", bc.parse_product_list('```json\n["Stripe","Paddle"]\n```'), ["Stripe","Paddle"])
check("prose then json", bc.parse_product_list('Sure!\n["Stripe","Paddle"]'), ["Stripe","Paddle"])
check("numbered list", bc.parse_product_list("1. Stripe\n2. Paddle\n3. Recurly"), ["Stripe","Paddle","Recurly"])
check("bulleted list", bc.parse_product_list("- Stripe\n- Paddle"), ["Stripe","Paddle"])
check("empty", bc.parse_product_list(""), [])
check("none", bc.parse_product_list(None), [])
check("refusal prose", len(bc.parse_product_list("I cannot help with that request.")) < 3, True)

print("\n--- same_company: must catch the prospect under any spelling ---")
for label, args, want in [
    ("exact",              ("Chargebee","Chargebee","chargebee.com"), True),
    ("case+space",         ("charge bee","Chargebee","chargebee.com"), True),
    ("suffixed product",   ("Chargebee Billing","Chargebee","chargebee.com"), True),
    ("domain-only match",  ("Chargebee","","chargebee.com"), True),
    ("dotted brand",       ("Chargebee.io","Chargebee","chargebee.com"), True),
    ("different company",  ("Stripe","Chargebee","chargebee.com"), False),
    ("substring trap",     ("Recurly","Rec","rec.com"), True),
    ("empty product",      ("","Chargebee","chargebee.com"), False),
    ("short brand guard",  ("Notion","Go","go.com"), False),
]:
    check(label, bc.same_company(*args), want)

print("\n--- is_named ---")
check("named", bc.is_named(["Stripe","Chargebee"],"Chargebee","chargebee.com"), True)
check("not named", bc.is_named(["Stripe","Paddle"],"Chargebee","chargebee.com"), False)

print("\n--- compose never leaks a placeholder ---")
s,b = bc.compose({"first_name":"Ada","company":"Chargebee"},
                 {"competitors":["Stripe Billing","Recurly"]}, "subscription billing")
check("no unrendered braces", "{" not in b and "}" not in b, True)
check("names competitor 1", "Stripe Billing" in b, True)
check("names the prospect", "Chargebee didn't" in b, True)
check("real traffic number", "11,474" in b, True)

print("\n--- G2 sourcing: category exclusion ---")
_s = importlib.util.spec_from_file_location("source_g2", "outbound/source_g2.py")
g2 = importlib.util.module_from_spec(_s); _s.loader.exec_module(g2)
for label, name, want in [
    ("plain saas category", "Demo Automation", False),
    ("consulting",          "IT Consulting", True),
    ("staffing",            "Staffing Agencies", True),
    ("case-insensitive",    "Marketing SERVICES", True),
    ("substring ok",        "Service Desk", False),
]:
    check(label, g2.category_excluded(name), want)

print("\n--- G2 sourcing: review-count band ---")
band = lambda n: g2.in_band({"review_count": n}, 10, 250)
for label, n, want in [
    ("stub listing",   3,    False),
    ("bottom of band", 10,   True),
    ("Saleo, real",    232,  True),
    ("top of band",    250,  True),
    ("Supademo, big",  637,  False),
    ("Consensus",      1845, False),
]:
    check(label, band(n), want)

print("\n--- G2 sourcing: a category we cannot reach into is skipped ---")
# Real Demo Automation top-5. Its smallest product is Saleo at 232, which is
# inside the band, so this category IS reachable and must not be skipped.
demo_automation = [1845, 1550, 1069, 637, 232]
check("demo automation kept", min(demo_automation) > 250, False)
# A category whose smallest visible product is a giant has no reachable tail.
check("giant-only skipped", min([9000, 4000, 1200]) > 250, True)

print("\n--- G2 sourcing: our own domain is never a prospect ---")
check("self excluded", "linkfinderai.com" in g2.EXCLUDE_DOMAIN, True)

print("\n" + (f"FAILURES: {fails}" if fails else "all cases as expected"))
sys.exit(1 if fails else 0)
