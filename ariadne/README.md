# Ariadne v1

Ariadne is een losse curriculumlaag voor je educatieve sites.

## Wat zit in v1.1?

- Dashboard in goud `#D4AF37` en oranje `#FF8C00`
- Aparte LPD-set per site/richting/graad
- Gedeelde Surma-bouwstenen
- Lesmetadata in JSON
- LPD-dekking
- Bouwstenenoverzicht
- Leerstofoverzicht
- Hiatencheck
- Export naar JSON, CSV en planner-CSV
- `bronType: "html"` en `bronType: "pdf"` zijn beide voorzien
- PDF-scanmodule met uploadknop
- Tekstextractie uit digitale PDF’s via PDF.js
- Suggesties voor LPD’s en Surma-bouwstenen per pagina
- Resultaten blijven bewust suggesties tot jij ze bevestigt

## Installatie

Zet de map `ariadne/` in de root van je GitHub-repo.

Voorbeeld:

```text
repo/
  index.html
  latijn-3de-jaar/
  grieks/
  ariadne/
    index.html
    ariadne.css
    ariadne.js
    data/
```

Publiceer via GitHub Pages en open:

```text
https://jouwdomein/ariadne/
```

## Belangrijk

Open je `index.html` niet rechtstreeks via `file://`.
Browsers blokkeren dan vaak het laden van JSON-bestanden.

Lokaal testen kan met:

```bash
cd ariadne
python3 -m http.server 8000
```

Daarna open je:

```text
http://localhost:8000
```

## Data vervangen

Vervang eerst deze bestanden:

```text
data/lpd/latijn-3de-jaar.json
data/lpd/latijn-4de-jaar.json
data/lpd/grieks.json
data/lessons/latijn-3de-thema3.json
```

Laat de structuur voorlopig gelijk. Voeg later nieuwe lesson-bestanden toe in:

```text
data/lessons-index.json
```

## Minimale lesmetadata

```json
{
  "id": "unieke-les-id",
  "site": "latijn-3de-jaar",
  "bronType": "html",
  "bronUrl": "../latijn-3de-jaar/thema3/tekst1.html",
  "status": "bevestigd",
  "thema": "Thema 3",
  "titel": "Tekst 1",
  "datum": "2026-05-06",
  "duur": 50,
  "leerinhoud": ["Seneca", "furor"],
  "werkvormen": ["klassikale lectuur"],
  "lpds": [
    {
      "code": "LAT3-LPD01",
      "context": "Leerlingen lezen de tekst woordgroep per woordgroep.",
      "locatie": "#tekst"
    }
  ],
  "bouwstenen": [
    {
      "code": "voorkennis-activeren",
      "context": "Instapvraag over wraakverhalen.",
      "locatie": "#instap"
    }
  ],
  "planner": {
    "titel": "Latijn — Seneca",
    "beschrijving": "We lezen Seneca en onderzoeken de logica van wraak.",
    "materiaal": ["HTML-les", "werkboek"]
  }
}
```

## Volgende logische stap

Ariadne v1 werkt met handmatig bevestigde metadata.
Ariadne v2 kan PDF's scannen en LPD-/bouwsteensuggesties voorstellen, maar die moeten eerst bevestigd worden.


## PDF-scan in v1.1

Open het tabblad **PDF-scan**.

De scan werkt zo:

```text
PDF uploaden
→ tekst per pagina uitlezen
→ vergelijken met de gekozen LPD-set
→ vergelijken met Surma-bouwstenen
→ suggesties per pagina tonen
```

### Beperkingen

- Werkt vooral met digitale tekst-PDF’s.
- Scans/foto-PDF’s hebben later OCR nodig.
- De huidige scan gebruikt trefwoordmatching, nog geen AI.
- Suggesties zijn niet automatisch definitief. Jij bevestigt of corrigeert ze later.

### Belangrijk bij testen

De PDF-scan gebruikt PDF.js via CDN:

```text
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
```

Daarom heb je internet nodig, tenzij je PDF.js later lokaal in de repo zet.
