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

print("\n" + (f"FAILURES: {fails}" if fails else "all cases as expected"))
sys.exit(1 if fails else 0)
