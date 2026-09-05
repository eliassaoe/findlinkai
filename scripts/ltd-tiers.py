# Elias's tiers: ~2,500/mo and ~5,000/mo, monthly non-rollover.
NET_SHARE = 0.30
TIERS = [("T1", 59, 2500, 0.50), ("T2", 119, 5000, 0.35), ("T3", 199, 10000, 0.15)]
CODES = 1000
SURVIVAL_MONTHS = 2.43   # from the churn model
BANDS = [(0.55,0),(0.25,30),(0.13,360),(0.05,2000),(0.02,None)]

print("REVENUE")
gross = net = 0
for n,p,c,share in TIERS:
    g = CODES*share*p; gross += g; net += g*NET_SHARE
    print(f"  {n} ${p:>4} x {int(CODES*share):>4} codes = ${g:>8,.0f} gross  ${g*NET_SHARE:>7,.0f} net   ({c:,}/mo)")
print(f"  {'TOTAL':<32}${gross:>8,.0f} gross  ${net:>7,.0f} net\n")

print("DATA COST OVER THE FULL LIFETIME OF EVERY CODE")
print(f"  {'COGS/credit':<14}{'cost':>10}{'kept':>12}{'% kept':>9}")
for cogs in (0.0005,0.001,0.002,0.004,0.008):
    cost = 0
    for n,p,cap,share in TIERS:
        n_codes = CODES*share
        per_month = sum(n_codes*s*(cap if u is None else min(u,cap)) for s,u in BANDS)
        cost += per_month*cogs*SURVIVAL_MONTHS
    print(f"  ${cogs:<13.4f}{'$'+format(cost,',.0f'):>10}{'$'+format(net-cost,',.0f'):>12}{100*(net-cost)/net:>8.0f}%")

print("\nWORST CASE - a single code that maxes its cap every month for 2 years")
for n,p,cap,_ in TIERS:
    for cogs in (0.002,0.008):
        print(f"  {n} ({cap:,}/mo) at ${cogs:.4f}: ${cap*cogs:>6.2f}/mo -> ${cap*cogs*24:>7,.0f} over 24mo "
              f"vs ${p*NET_SHARE:.0f} net received  {'LOSS' if cap*cogs*24 > p*NET_SHARE else ''}")

print("\nCANNIBALISATION - LTD allowance vs the subscriptions you sell")
print("  Starter      $49/mo   5,000 credits/mo")
print("  Professional $89/mo  20,000 credits/mo")
for n,p,cap,_ in TIERS:
    print(f"  {n} {cap:>6,}/mo = {cap/5000:.0%} of Starter, {cap/20000:.0%} of Professional")
