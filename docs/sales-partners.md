# Sales partners: commission-only sellers (19 Nov 2026)

Owner's call: recruit commission-only sellers (CommissionCrowd, Agentco, MyCloser…) to sell **annual, prepaid** plans
only: Scale annual ($1,793) or Enterprise (quoted, from $999/mo billed yearly). Monthly plans earn nothing: they are
self-serve and churn ~22%/month (`docs/revenue-baseline-2026-11.md`). Owner: "mets une commission bien généreuse".

## Terms (as published on `/sales-partners`, noindex)
- 30% of the first-year contract, **35%** on contracts of $10,000+/year, **10%** on the year-2 renewal.
- Paid once, 30 days after the customer's payment clears (refund window). Only on cash collected.
- No base, no quota, **no retainer or upfront fee** (some CommissionCrowd agents ask for one: refuse).
- Lead belongs to the partner for 90 days after it books with their code.
- Partners must not promise unapproved discounts or find rates; annual already = 40% off monthly.

## Tracking
- Each partner gets a code (e.g. `MC-JDUPONT`). They send prospects to `https://linkfinderai.com/talk-to-sales?ref=CODE`.
- `talk-to-sales.html` keeps the code 90 days in the browser (`lf_partner_ref`) and writes it into `sales_leads.utm->>'ref'`.
- Read: `select created_at, email, offer, utm->>'ref' as partner from sales_leads where utm->>'ref' is not null order by 1 desc;`
- Enterprise has no checkout: close by invoice (Dodo invoice or bank transfer). Log the partner on the deal by hand.

## Listing text: English (CommissionCrowd, Agentco)
**Title:** Sell B2B contact data (LinkedIn → email & phone): 30–35% of annual contracts, $540–$4,200+ per deal

**Body:**
LinkFinder AI turns LinkedIn profiles, names and companies into verified work emails, phone numbers and company data — one at a time, by CSV, in Google Sheets, HubSpot or via API. For paying customers a LinkedIn profile returns an email 87–89% of the time.

You sell **annual, prepaid** plans only:
- Scale annual: $1,793/year → you earn ~$538
- Enterprise: quoted from ~$12,000/year (250k+ credits/month, SLA, invoice/PO) → you earn 35%, $4,200+

Commission: 30% of the first year (35% from $10k), +10% on the year-2 renewal. Paid 30 days after the customer pays. No quota, no retainer.
Ideal buyers: lead-gen & outbound agencies, recruitment firms, sales teams of 5+, RevOps/data teams needing an API.
We provide: partner code, pitch page, demo account, and we run or join the closing call.
Details: https://linkfinderai.com/sales-partners

## Texte d'annonce : français (MyCloser)
**Titre :** Vendez de la donnée de contact B2B (LinkedIn → email et téléphone) : 30 à 35 % des contrats annuels, de 500 € à 4 000 €+ par vente

**Texte :**
LinkFinder AI trouve l'email pro, le téléphone et les infos entreprise à partir d'un profil LinkedIn, d'un nom ou d'une société : à l'unité, par fichier CSV, dans Google Sheets, HubSpot ou par API. Pour nos clients payants, un profil LinkedIn donne un email dans 87 à 89 % des cas.

Vous vendez uniquement des **abonnements annuels payés d'avance** :
- Scale annuel : 1 793 $ par an → environ 538 $ pour vous
- Enterprise : sur devis, à partir d'environ 12 000 $ par an → 35 % pour vous, soit 4 200 $ et plus

Commission : 30 % de la première année (35 % au-delà de 10 000 $), puis 10 % au renouvellement. Versée 30 jours après l'encaissement. Pas de quota, pas de frais.
Cibles : agences de prospection et de génération de leads, cabinets de recrutement, équipes commerciales de 5 personnes et plus, équipes data/RevOps qui ont besoin d'une API.
On vous fournit : un code partenaire, une page de présentation, un compte de démo, et on mène ou on rejoint l'appel de closing.
Détails : https://linkfinderai.com/sales-partners
