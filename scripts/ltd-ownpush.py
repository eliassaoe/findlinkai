# Own-push estimate, rebuilt from the repo's OWN conversion history instead of
# a guessed 2-4%. Elias pushed back on 100 codes; the data says he is right.

print("WHAT THE REPO ACTUALLY MEASURES")
print("  Google-verified accounts        1,902 -> 20 subscribers   1.05%  (LIFETIME)")
print("  email+password, unverified      4,616 ->  8 subscribers   0.17%  (LIFETIME)")
print("  whole base, ever paid anything  6,880 -> 120              1.7%   (LIFETIME)")
print("  low-conversion geo (55% of signups)    -> 0.10% signup->paid")
print("  emails sent across all campaigns: ONE payment attributed, ever\n")
print("My earlier 2-4% assumed ONE campaign would beat the best segment's")
print("LIFETIME conversion by 2-4x. That is not defensible.\n")

CONFIRMED = 1955
STD_SHARE = 0.45          # geo split: ~55% of signups are the 0.10% tier
addressable = CONFIRMED*STD_SHARE
print(f"ADDRESSABLE FOR AN LTD")
print(f"  confirmed in auth.users                        {CONFIRMED:,}")
print(f"  x ~45% outside the low-conversion geo          {addressable:,.0f}")
print(f"  (the $59 tier is MORE than the $25 pack that tier already refuses)\n")

print("EMAIL, at rates bracketing the 1.05% lifetime subscriber rate")
print("(an LTD is an easier decision than a subscription, so above it is fair)")
for r in (0.01, 0.02, 0.03):
    print(f"   {r:.0%} -> {addressable*r:>5.0f} codes")

print("\nSITE TRAFFIC over a 2-week launch (~3,700 visitors)")
print("  intent is 'do this myself, cheaply' - single-lookup tool seekers")
for r in (0.002, 0.005, 0.01):
    print(f"   {r:.1%} -> {3700*r:>5.0f} codes")

LO, MID, HI = 16, 30, 63
print(f"\n  => OWN PUSH: {LO}-{HI} codes, centre ~{MID}. Earlier claim was 75-115.")

AOV, REFUND, COGS_C, CRED, TAX = 118.0, 0.05, 0.002, 600, 0.25
def net(c,s): return (c*AOV*s*(1-REFUND) - c*CRED*COGS_C)*(1-TAX)
print("\n\nWHAT THAT DOES TO $10k")
for own in (LO, MID, HI):
    print(f"\n  own push {own} codes:")
    for s in (0.30,0.50,0.70):
        need = 10000
        lo,hi=0,50000
        for _ in range(60):
            mid=(lo+hi)/2
            if net(mid,s) < need: lo=mid
            else: hi=mid
        mult = (hi-own)/own
        print(f"    {int(s*100)}% share: own push = ${net(own,s):>6,.0f} "
              f"| need {hi:>5,.0f} total -> AppSumo must add {mult:>5.1f}x your push")
print("\n  SendPilot's channels delivered 4x their own push.")
