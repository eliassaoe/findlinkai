# Working capital: COGS lands immediately, AppSumo pays after the 60-day
# refund window. How much cash must Elias float in between?
CRED_PER_CODE_LIFETIME = 600
SURV = {1:1.00, 2:0.40, 3:0.15}          # share of activators still consuming
TOTAL_EFFECTIVE = 2.43                    # from the churn model
M1 = SURV[1]/TOTAL_EFFECTIVE
M2 = SURV[2]/TOTAL_EFFECTIVE
print(f"Consumption is front-loaded: month 1 = {M1:.0%} of a code's lifetime "
      f"credits, month 2 = {M2:.0%}.")
print(f"So {M1+M2:.0%} of all data cost lands in the first two months - exactly "
      f"the window AppSumo holds payment.\n")

print(f"{'codes':>7} | " + " | ".join(f"COGS ${c}".center(13) for c in (0.001,0.002,0.004,0.008)))
print("-"*72)
for codes in (475, 790, 1219, 2000):
    cells=[]
    for cogs in (0.001,0.002,0.004,0.008):
        out = codes*CRED_PER_CODE_LIFETIME*(M1+M2)*cogs
        cells.append(f"${out:>11,.0f}")
    print(f"{codes:>7,} | " + " | ".join(cells))
print("\n^ cash out on data before AppSumo pays a cent")

print("\n\nWHAT COMES IN DURING THAT SAME WINDOW (not held by AppSumo):")
AOV_TOPUP, AOV_SUB = 25.0, 49.0
for codes in (475, 790, 1219):
    for topup_rate, sub_rate in ((0.03,0.01),(0.05,0.02)):
        cash = codes*topup_rate*AOV_TOPUP + codes*sub_rate*AOV_SUB*2  # 2 months of sub
        print(f"  {codes:>5,} codes | top-up {topup_rate:.0%}, sub {sub_rate:.0%} "
              f"-> ${cash:>8,.0f} direct (Dodo, paid immediately)")
    print()
