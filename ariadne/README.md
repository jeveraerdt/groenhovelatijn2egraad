# Ariadne v1.8

## Mapstructuur na uitpakken

```
ariadne/
  index.html          ← landingspagina (NIEUW)
  dashboard.html      ← het volledige Ariadne-dashboard (was index.html)
  ariadne.css         ← jouw bestaande CSS-bestand
  ariadne.js          ← jouw bestaande JS-bestand
  assets/             ← ZET HIER JE SVG-BESTANDEN
    Ariadnelogo.svg
    Ariadnewordmark.svg
    labyrinth.svg
  data/
    lessons-index.json
    lpd/
      latijn-3de-jaar.json
      latijn-4de-jaar.json
      grieks.json
    lessons/
      latijn-3de-thema3.json
```

## Wat je zelf moet toevoegen

1. **`ariadne.css`** — jouw bestaande CSS-bestand
2. **`ariadne.js`** — jouw bestaande JS-bestand
3. **`assets/Ariadnelogo.svg`** — het wolkluwen-logo
4. **`assets/Ariadnewordmark.svg`** — het woordmerk ARIADNE
5. **`assets/labyrinth.svg`** — het labyrint (achtergrond hero)
6. **`data/`** — jouw JSON-databestanden

## Lokaal testen

```bash
cd ariadne
python3 -m http.server 8000
```

Open: http://localhost:8000
