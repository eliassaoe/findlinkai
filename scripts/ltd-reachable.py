AOV, REFUND, COGS_C, CRED, TAX = 118.0, 0.05, 0.002, 600, 0.25
def net(codes, share):
    g=codes*AOV
    return (g*share*(1-REFUND) - codes*CRED*COGS_C)*(1-TAX)

OWN = 115   # top of the day-one push range (1,924 mailable + ~3,700 visitors)

print(f"YOUR OWN PUSH ALONE ({OWN} codes, no AppSumo traffic at all):")
for s in (0.30,0.50,0.70):
    n=net(OWN,s); print(f"   {int(s*100)}% share -> ${n:>7,.0f}   ({n/10000:.0%} of the $10k target)")

print(f"\nSO: HOW MUCH MUST APPSUMO ADD ON TOP, AS A MULTIPLE OF YOUR OWN PUSH?")
print("(SendPilot's channels delivered 4x their own push - 80% of their revenue)")
for s in (0.30,0.50,0.70):
    m=1
    while net(OWN*(1+m), s) < 10000 and m < 20: m+=0.05
    total=OWN*(1+m)
    print(f"   {int(s*100)}% share -> AppSumo needs to add {m:>4.1f}x your push "
          f"({total:>5,.0f} codes total, {total/1219:.0%} of SendPilot's units)")

print("\n\nSENSITIVITY - does the answer survive worse assumptions?")
for label, aov, cogs, refund in [
    ("base",                        118.0, 0.002, 0.05),
    ("no tier 3 (AOV $83)",          83.0, 0.002, 0.05),
    ("COGS 4x worse ($0.008)",      118.0, 0.008, 0.05),
    ("refunds 15% not 5%",          118.0, 0.002, 0.15),
    ("ALL THREE at once",            83.0, 0.008, 0.15),
]:
    globals().update(AOV=aov, COGS_C=cogs, REFUND=refund)
    cells=[]
    for s in (0.30,0.50,0.70):
        lo,hi=0,50000
        for _ in range(60):
            mid=(lo+hi)/2
            if net(mid,s) < 10000: lo=mid
            else: hi=mid
        cells.append(f"{hi:>5,.0f}")
    print(f"  {label:<26} codes needed for $10k: " + " | ".join(f"{int(s*100)}%: {c}" for s,c in zip((0.3,0.5,0.7),cells)))
