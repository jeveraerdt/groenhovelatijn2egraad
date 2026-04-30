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

## Ariadne v2 — functionele laag toegevoegd

Grafische afspraak: de huidige mapstructuur, paden, assets en styling blijven leidend. De v2-aanpassing zit functioneel in `ariadne.js`, met enkel minimale aanvullende CSS voor zichtbare statuslabels en reviewknoppen.

### Wat v2 nu doet

1. **Bevestigde metadata versus controlemetadata**
   - LPD- en bouwsteenkoppelingen tellen pas mee als ze `status: "bevestigd"` hebben.
   - Lessen met `status: "concept"` of `status: "te-controleren"` blijven zichtbaar, maar hun koppelingen verschijnen als “te controleren”.

2. **PDF/AI-suggesties reviewen**
   - PDF-suggesties blijven apart staan tot de gebruiker ze bevestigt.
   - Per suggestie kan je de code, context en locatie aanpassen.
   - Daarna kan je de suggestie bevestigen of verwerpen.
   - Bevestigde suggesties worden lokaal in de browser bewaard via `localStorage` en tellen mee in dekking/export.

3. **Leerlijnvoorbereiding**
   - Export bevat een `learningLine`-model met nodes per les: datum, site, thema, leerinhoud, bevestigde LPD’s, bevestigde bouwstenen en reviewcounts.

4. **Plannerexport voorbereid**
   - Planner-CSV blijft bewust generiek.
   - `.smsc` is nog niet ingebouwd zolang het exacte formaat niet duidelijk is.


## Ariadne v2.1 — eerste graad en officiële LPD-bron

Deze versie vertrekt opnieuw van de gepubliceerde `ariadne.zip` uit het begin van de chat en bevat alle functionele v2-aanpassingen samen.

### Nieuw in v2.1

1. **LPD's per graad**
   - Nieuwe officiële set: `data/lpd/klassieke-talen-1ste-graad.json`
   - Deze set is bedoeld als gedeelde graadset voor Latijn 1/2 en grotendeels Grieks in de eerste graad.

2. **Prioriteit controle 20 mei 2026**
   - Nieuwe site-entry: `latijn-1ste-graad`
   - Bestaande `grieks`-entry verwijst nu naar de officiële eerstegraadsset.

3. **Rijke LPD-interpretatie**
   - Per LPD zijn niet alleen code/titel/omschrijving opgenomen, maar ook:
     - afbakening;
     - wat sterk bewijs is;
     - wat ondersteunend bewijs is;
     - wat niet mag meetellen;
     - opvolging/evaluatie;
     - zoektermen voor PDF-suggesties.

4. **PDF/AI blijft suggestie**
   - PDF/AI-koppelingen tellen pas mee nadat ze bevestigd zijn.
   - De scanner gebruikt nu ook de rijke LPD-velden als zoekmateriaal.

5. **Export voorbereid**
   - V2-dossierexport bevat ook de gebruikte LPD-set(s), zodat een controlebestand niet losstaat van de doelendefinitie.
