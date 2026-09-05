# What gross AppSumo revenue is needed to put 20k-50k CASH in Elias's pocket.
AOV        = 118.0    # 3-tier structure, docs/appsumo-launch-spec.md 5.5
REFUND     = 0.05     # SendPilot ran 3.5%; 5% is prudent
COGS_CRED  = 0.002    # UNMEASURED - the gate-1 unknown
CRED_PER_CODE_LIFETIME = 600   # ~2.43 effective months x ~250 avg/mo across all bands
TAX        = 0.25     # France, corporate. Elias must confirm his own rate.

def pocket(gross, share):
    codes    = gross/AOV
    kept     = gross*share*(1-REFUND)
    cogs     = codes*CRED_PER_CODE_LIFETIME*COGS_CRED
    pretax   = kept - cogs
    return codes, kept, cogs, pretax, pretax*(1-TAX)

print("The seller share is the single biggest unknown. Model all three.\n")
print(f"{'gross':>9} {'codes':>7} | " + " | ".join(f"{int(s*100)}% share".center(17) for s in (0.30,0.50,0.70)))
print("-"*72)
for gross in (50_000, 100_000, 160_000, 250_000, 400_000):
    row=f"${gross:>8,} {gross/AOV:>7.0f} | "
    cells=[]
    for share in (0.30,0.50,0.70):
        _,_,_,_,net = pocket(gross,share)
        cells.append(f"${net:>10,.0f} net".rjust(17))
    print(row + " | ".join(cells))

print("\n\nGROSS REQUIRED to hit a target, by share:")
print(f"{'target in pocket':>18} | {'30%':>12} | {'50%':>12} | {'70%':>12}")
print("-"*62)
for target in (20_000, 35_000, 50_000):
    cells=[]
    for share in (0.30,0.50,0.70):
        lo,hi=0,3_000_000
        for _ in range(80):
            mid=(lo+hi)/2
            if pocket(mid,share)[4] < target: lo=mid
            else: hi=mid
        cells.append(f"${hi:>11,.0f}")
    print(f"{'$'+format(target,','):>18} | " + " | ".join(cells))

print("\n\nUNITS required (at $118 AOV) - SendPilot did 1,219 in 13 days:")
for target in (20_000,35_000,50_000):
    cells=[]
    for share in (0.30,0.50,0.70):
        lo,hi=0,3_000_000
        for _ in range(80):
            mid=(lo+hi)/2
            if pocket(mid,share)[4] < target: lo=mid
            else: hi=mid
        c=hi/AOV
        cells.append(f"{c:>6,.0f} ({c/1219:.1f}x SP)")
    print(f"  ${target:>6,} -> " + " | ".join(cells))
