AOV, REFUND, COGS_C, CRED, TAX = 118.0, 0.05, 0.002, 600, 0.25
def pocket(codes, share):
    gross=codes*AOV
    return gross, gross*share*(1-REFUND) - codes*CRED*COGS_C
def net(codes,share):
    g,pre=pocket(codes,share); return g, pre*(1-TAX)

# Own day-1/week-1 push, from owned assets
print("OWN PUSH - the only part fully under Elias's control")
print("  1,955 accounts confirmed in auth.users (the only trustworthy signal)")
print("  minus 31 subscribers                        = ~1,924 mailable")
for r in (0.02,0.03,0.04):
    print(f"    at {r:.0%} -> {1924*r:>4.0f} codes")
print("  7,922 visitors/mo -> ~3,700 over a 2-week launch, site-wide banner")
for r in (0.01,0.015):
    print(f"    at {r:.1%} -> {3700*r:>4.0f} codes")
print("  => own push realistically 75-115 codes\n")

SC = [("No featuring (own push only, AppSumo adds ~40%)", 140),
      ("Featured, own push is 20% of total (SendPilot ratio)", 475),
      ("Strong launch, own push is 12% of total",             790),
      ("SendPilot-equivalent units",                         1219)]
print(f"{'scenario':<52}{'codes':>7}{'gross':>10} | " + "".join(f"{int(s*100)}%".rjust(11) for s in (0.30,0.50,0.70)))
print("-"*104)
for name,c in SC:
    g,_=pocket(c,0.3)
    cells="".join(f"${net(c,s)[1]:>10,.0f}" for s in (0.30,0.50,0.70))
    print(f"{name:<52}{c:>7,}{'$'+format(g,',.0f'):>10} | {cells}")
print("\n(cells = CASH IN POCKET after AppSumo share, 5% refunds, data COGS, 25% tax)")
print("Target band: $20,000 - $50,000")
