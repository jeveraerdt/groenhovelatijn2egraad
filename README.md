# Latijn 2e Graad – Groenhove

Basis-site voor Latijn (2e graad) op S.O. Groenhove Waregem, campus Atheneum.

## Structuur

- `css/base.css` – HTML reset + typography
- `css/_theme.css` – Fonts, kleuren, CSS-variabelen (CENTRAAL)
- `css/_patterns.css` – Hero, grid, card, header, footer
- `fonts/flanders-art-sans/FlandersArtSans-Bold.otf`
- `fonts/noto-sans/NotoSans-Regular.woff2` + `NotoSans-Bold.woff2`
- `images/` – heroes, cards, icons, nav
- `js/app.js` – Minimale interactie
- `index.html` – Homepage

## Kleurenschema (Groenhove Huisstijl)

- **Deep Forest** `#006633` — 3de jaar
- **Vital Green** `#65b32e` — 4de jaar
- **Waregem Pulse Red** `#FF3B1D` — Links/buttons
- **Balanced Yellow** `#ffea3d` — Highlights

## Fonts

- **Flanders Art Sans** — Titels (Groenhove huisstijl)
- **Noto Sans** — Body (Google Fonts)

## Kopiëren naar 4de jaar

`_theme.css` definieert beide kleuren naast elkaar (`--color-primary-3d` en `--color-primary-4d`) — niets vervangen. Voor 4de-jaar pagina:
- Gebruik `var(--color-primary-4d)` in plaats van `--color-primary-3d` in je page-HTML
- Gebruik de class `hero-curve--4d` op het curve-SVG
- Gebruik `.btn-primary-4d` voor knoppen

---

J. Everaerdt — Groenhove © 2025-2026
