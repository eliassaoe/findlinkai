# SendPilot: $160,000 / 1,219 customers = $131.25 AOV.
# What our tier structures produce, and what T3 has to look like to close the gap.
SP_AOV = 160000/1219
NET, CODES, MONTHS = 0.30, 1000, 2.43
BANDS=[(0.55,0),(0.25,30),(0.13,360),(0.05,2000),(0.02,None)]

def econ(tiers):
    aov = sum(p*s for _,p,_,s in tiers)
    gross = CODES*aov; net = gross*NET
    cost = {}
    for cogs in (0.001,0.002,0.004,0.008):
        c=0
        for _,_,cap,s in tiers:
            n=CODES*s
            c += sum(n*b*(cap if u is None else min(u,cap)) for b,u in BANDS)*cogs*MONTHS
        cost[cogs]=c
    return aov, gross, net, cost

A = [("T1",59,2500,0.60),("T2",119,5000,0.40)]
B = [("T1",59,2500,0.45),("T2",119,5000,0.35),("T3",249,8000,0.20)]

print(f"SendPilot AOV (actual): ${SP_AOV:.2f}\n")
for name,t in (("A - two tiers",A),("B - three tiers, T3 loaded with non-COGS extras",B)):
    aov,gross,net,cost = econ(t)
    print(f"{name}")
    print(f"  AOV ${aov:.2f}   gross ${gross:,.0f}   net ${net:,.0f}   ({aov/SP_AOV:.0%} of SendPilot's AOV)")
    for cogs,c in cost.items():
        print(f"    COGS ${cogs:.4f} -> data cost ${c:>7,.0f}   kept ${net-c:>8,.0f}  ({100*(net-c)/net:.0f}%)")
    print()
print("Cannibalisation check (Starter 5,000/mo $49 · Professional 20,000/mo $89):")
for n,p,cap,_ in B:
    up = "Starter $49" if cap < 5000 else "Professional $89"
    print(f"  {n} {cap:>5,}/mo -> upgrade {up}")
