# La landing page française — `/prospection-b2b`

**Fichier :** `prospection-b2b.html` · **Créée le :** 2026-09-03

La page de vente française de l'offre done-for-you. Elle ne remplace pas
`done-for-you-outbound.html` (anglais, angle listicles + backlinks, formulaire
d'échantillon) : les deux coexistent, sur deux marchés et deux langues.

## L'offre telle qu'elle est vendue ici

Des rendez-vous commerciaux qualifiés, posés directement dans l'agenda du
client, facturés à l'unité. Nous constituons la liste à partir de notre propre
base B2B, rédigeons et diffusons la campagne d'emailing à froid, gérons toutes
les réponses et calons le rendez-vous.

**100 à 150 € par rendez-vous réellement tenu. Sans abonnement, sans
engagement, sans outil à prendre en main.** Toute la prospection se fait en
français.

Le cadre de comparaison est explicite dans la page, parce que c'est l'arbitrage
que le prospect fait vraiment : un commercial salarié à 45 000 € par an, ou une
agence à 2 500 € par mois avec six mois d'engagement payés d'avance. Cible : une
société entre 500 k€ et 5 M€ de CA, où le dirigeant ou l'unique commercial
prospecte entre deux missions de production.

## ⚠️ Deux prix coexistent — c'est voulu, mais il faut le savoir

| Où | Prix | Minimum |
| --- | --- | --- |
| Le panneau *Done For You* dans `app.html` | **$150** par rendez-vous tenu | **5 par mois**, soit $750/mois |
| Cette page (`prospection-b2b.html`) | **100 à 150 €** par rendez-vous tenu | **aucun** |

Ce n'est pas une erreur de copie : la page française vend « sans engagement »,
donc elle n'annonce pas de plancher. Mais quiconque voit les deux surfaces verra
deux offres différentes. **Avant de pousser du trafic payant sur cette page,
décidez laquelle fait foi** et alignez `AI_SDR_PRICE_PER_CALL` /
`AI_SDR_MIN_CALLS` dans `app.html`, ou assumez explicitement deux offres par
marché.

`docs/dfy-activation-campaign.md` argumente pour dire le minimum à voix haute.
Cet argument reste valable ; il a simplement été écarté ici parce que l'absence
d'engagement est l'argument central de la page face à l'agence à six mois.

## Contraintes de construction

- **Un seul bouton.** Le CTA du hero pointe vers
  `https://calendly.com/hamoureliasse/offre-linkfinder-ai-outbound/`. Pas de
  formulaire, pas de second appel à l'action concurrent. La clôture reprend le
  même lien en lien texte, pas en bouton. *(Noter que c'est un événement
  Calendly différent de celui du panneau in-app,
  `offre-linkfinder-ai-clone` — voir `docs/ai-sdr-offer.md`.)*
- **Trustpilot est la preuve, sans aucun élément de marque.** Lien texte vers
  `https://www.trustpilot.com/review/linkfinderai.com`, rien d'autre : pas de
  logo, pas d'étoiles, pas de widget, pas de note recopiée. Trustpilot
  n'autorise pas cet usage de sa marque. Si quelqu'un ajoute un badge plus tard,
  c'est une régression, pas une amélioration.
- **Aucun logo client, aucun témoignage choisi.** La page le dit elle-même et
  renvoie aux avis publics. Même règle que la page anglaise.
- **Pas de chiffres internes.** Le « 67 acheteurs de packs qui n'ont jamais
  lancé une recherche » de `docs/dfy-activation-campaign.md` est une excellente
  accroche mais reste hors de toute page publique : il se lit aussi comme
  « leur produit ne sert à personne ».

## Ce qui reste à faire

- Décider du prix qui fait foi (voir plus haut).
- Rien ne pointe encore vers cette page depuis le site : elle est dans
  `sitemap.xml` mais aucun lien interne ne l'atteint.
