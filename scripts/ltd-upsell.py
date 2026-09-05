# Two tiers, Elias's allowances. Why the ladder must stop at 5,000.
CODES, NET = 1000, 0.30
T = [("Tier 1", 59, 2500, 0.60, "Starter", 49, 5000),
     ("Tier 2", 119, 5000, 0.40, "Professional", 89, 20000)]
g=n=0
for name,p,cap,share,up,upp,upc in T:
    c=CODES*share; g+=c*p; n+=c*p*NET
    print(f"{name}: {int(c)} codes x ${p} = ${c*p:,.0f} gross / ${c*p*NET:,.0f} net")
    print(f"   {cap:,}/mo -> upsell {up} ${upp}/mo ({upc:,}/mo) = {upc/cap:.0f}x the credits + phone + CRM")
print(f"TOTAL ${g:,.0f} gross / ${n:,.0f} net\n")
print("MRR if the upsell works, by conversion rate:")
for r1,r2 in ((0.02,0.01),(0.03,0.02),(0.05,0.03)):
    s1=CODES*0.60*r1; s2=CODES*0.40*r2
    mrr=s1*49+s2*89
    print(f"  T1 {r1:.0%} -> {s1:.0f} Starter, T2 {r2:.0%} -> {s2:.0f} Professional"
          f"  = ${mrr:,.0f} MRR  (vs $1,939 today = {mrr/1939:.0%} of the business)")
