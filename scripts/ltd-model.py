# LTD lifetime exposure, with Elias's churn assumption applied.
# "LTD users very likely won't come back after 2-3 months, for the vast majority."
# That matches docs/data-provider-angle.md: of 1,401 ever-enrichers, 31 reached
# 4+ active days (2.2%), and Shape A bulk resolvers die in 4-6 days.

NET_PER_CODE, CODES = 18.0, 1000
REVENUE = NET_PER_CODE * CODES

# Share of the ACTIVATING cohort still consuming in month N.
SURVIVAL = {1: 1.00, 2: 0.40, 3: 0.15, 4: 0.07, 5: 0.05, 6: 0.04}
RESIDUAL_TAIL_MONTHS = 24   # the ~3% who genuinely stick, carried 2 more years
RESIDUAL_SHARE = 0.03

BANDS = [   # (share of codes, credits/active month, label)
    (0.55, 0,    "never activate"),
    (0.25, 30,   "tried it"),
    (0.13, 360,  "light regular"),
    (0.05, 2000, "heavy"),
    (0.02, None, "bulk resolver - takes the whole cap"),
]

def lifetime_cost(cap, cogs):
    per_month = sum(CODES*s*(cap if u is None else min(u, cap)) for s,u,_ in BANDS)
    active = sum(SURVIVAL.values())                     # ~1.71 "full months"
    residual = RESIDUAL_SHARE/(1-RESIDUAL_SHARE) if False else RESIDUAL_SHARE*RESIDUAL_TAIL_MONTHS
    return per_month*cogs*(active+residual)

def stockpile_cost(stock, cogs):
    # Stockpile is drained by the tail in month 1-2 regardless of churn -
    # that is the whole problem, and it lands inside the refund window.
    burn = CODES*0.07*stock + CODES*0.13*360*1.7 + CODES*0.25*30
    return burn*cogs

print(f"{CODES:,} codes x ${NET_PER_CODE:.0f} net = ${REVENUE:,.0f} received")
print(f"Churn: {SURVIVAL} then a {RESIDUAL_SHARE:.0%} residual for {RESIDUAL_TAIL_MONTHS} months")
print(f"=> {sum(SURVIVAL.values())+RESIDUAL_SHARE*RESIDUAL_TAIL_MONTHS:.2f} effective full-consumption months per code\n")

print(f"{'':22}{'MONTHLY CAP (recommended)':^34}|{'ONE-TIME STOCKPILE':^34}")
print(f"{'COGS/credit':<14}{'2,000/mo':>10}{'5,000/mo':>12}{'  ':>12}|{'25,000':>14}{'50,000':>16}")
print("-"*94)
for cogs in (0.0005, 0.001, 0.002, 0.004, 0.008):
    a, b = lifetime_cost(2000,cogs), lifetime_cost(5000,cogs)
    c, d = stockpile_cost(25000,cogs), stockpile_cost(50000,cogs)
    mark = lambda v: f"${v:,.0f}" + ("!" if v > REVENUE*0.5 else "")
    print(f"${cogs:<13.4f}{mark(a):>10}{mark(b):>12}{'':>12}|{mark(c):>14}{mark(d):>16}")
print("\n!  = eats more than half the gross proceeds")
print(f"\nKept after data cost, monthly 5,000 cap:")
for cogs in (0.001, 0.002, 0.004, 0.008):
    print(f"  COGS ${cogs:<7.4f} -> ${REVENUE-lifetime_cost(5000,cogs):>9,.0f} kept of ${REVENUE:,.0f}"
          f"  ({100*(REVENUE-lifetime_cost(5000,cogs))/REVENUE:.0f}%)")
