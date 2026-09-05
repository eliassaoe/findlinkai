AOV, REFUND, COGS_C, CRED, TAX = 118.0, 0.05, 0.002, 600, 0.25
def net(codes, share):
    g = codes*AOV
    return g, (g*share*(1-REFUND) - codes*CRED*COGS_C)*(1-TAX)
def codes_for(target, share):
    lo,hi=0,50000
    for _ in range(80):
        mid=(lo+hi)/2
        if net(mid,share)[1] < target: lo=mid
        else: hi=mid
    return hi

print("UNITS NEEDED, by target and share (SendPilot did 1,219 in 13 days)")
print(f"{'target':>10} | " + " | ".join(f"{int(s*100)}% share".center(20) for s in (0.30,0.50,0.70)))
print("-"*74)
for t in (10_000, 20_000, 50_000):
    cells=[]
    for s in (0.30,0.50,0.70):
        c=codes_for(t,s)
        cells.append(f"{c:>6,.0f} codes (${c*AOV:>7,.0f})".rjust(20))
    print(f"{'$'+format(t,','):>10} | " + " | ".join(cells))

print("\n\nDOES $10k SURVIVE THE SCENARIOS? (cash in pocket)")
SC=[("No featuring", 140),("Featured (SendPilot ratio)",475),
    ("Strong launch",790),("SendPilot units",1219)]
print(f"{'scenario':<28}{'codes':>7} | " + " | ".join(f"{int(s*100)}%".rjust(9) for s in (0.30,0.50,0.70)))
print("-"*66)
for name,c in SC:
    cells=[]
    for s in (0.30,0.50,0.70):
        n=net(c,s)[1]
        cells.append((("$%s"%format(n,',.0f'))+(" OK" if n>=10000 else "   ")).rjust(9))
    print(f"{name:<28}{c:>7,} | " + " | ".join(cells))

print("\n\nWHAT THE SAME LAUNCH IS WORTH IN MRR (the part that compounds)")
for c in (300, 475, 790):
    for r1,r2 in ((0.03,0.02),(0.05,0.03)):
        mrr = c*0.6*r1*49 + c*0.4*r2*89
        print(f"  {c:>4,} codes | T1 {r1:.0%}->Starter, T2 {r2:.0%}->Professional "
              f"= ${mrr:>6,.0f} MRR = ${mrr*12:>7,.0f}/yr  ({mrr/1939:.0%} of today's MRR)")
    print()
