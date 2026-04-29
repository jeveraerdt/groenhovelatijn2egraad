const Ariadne = {
  data: {
    sites: [],
    bouwstenen: [],
    lpdSets: new Map(),
    lessons: []
  },
  state: {
    site: "all",
    theme: "all",
    lpd: "all",
    block: "all",
    search: "",
    view: "pdfscan",
    pdfScan: {
      fileName: "",
      status: "Nog geen PDF gescand.",
      suggestions: [],
      pages: []
    }
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", initAriadne);

async function initAriadne() {
  try {
    await loadData();
    hydrateControls();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    $("#content").innerHTML = `
      <div class="empty">
        <h3>Ariadne kon de data niet laden</h3>
        <p>Controleer of je de map via een lokale server of GitHub Pages opent. Rechtstreeks openen via <code>file://</code> blokkeert vaak JSON-bestanden.</p>
        <pre class="code-box">${escapeHtml(error.message)}</pre>
      </div>
    `;
  }
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Kon ${path} niet laden (${response.status})`);
  return response.json();
}

async function loadData() {
  const [sitesData, bouwstenenData, lessonsIndex] = await Promise.all([
    loadJson("data/sites.json"),
    loadJson("data/bouwstenen-surma.json"),
    loadJson("data/lessons-index.json")
  ]);

  Ariadne.data.sites = sitesData.sites || [];
  Ariadne.data.bouwstenen = bouwstenenData.bouwstenen || [];

  const lpdSetIds = [...new Set(Ariadne.data.sites.map(site => site.lpdSet).filter(Boolean))];
  const lpdSetFiles = await Promise.all(
    lpdSetIds.map(async id => [id, await loadJson(`data/lpd/${id}.json`)])
  );
  Ariadne.data.lpdSets = new Map(lpdSetFiles);

  const lessonFiles = lessonsIndex.files || [];
  const lessonBundles = await Promise.all(lessonFiles.map(file => loadJson(`data/${file}`)));
  Ariadne.data.lessons = lessonBundles.flatMap(bundle => bundle.lessons || []);
}

function hydrateControls() {
  fillSelect("#siteSelect", [
    { value: "all", label: "Alle sites" },
    ...Ariadne.data.sites.map(site => ({ value: site.id, label: site.naam }))
  ]);

  fillThemeSelect();
  fillLpdSelect();
  fillBlockSelect();
}

function fillSelect(selector, options) {
  const select = $(selector);
  select.innerHTML = options
    .map(option => `<option value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
}

function fillThemeSelect() {
  const lessons = lessonsForSite(Ariadne.state.site);
  const themes = [...new Set(lessons.map(lesson => lesson.thema).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "nl"));

  fillSelect("#themeSelect", [
    { value: "all", label: "Alle thema’s" },
    ...themes.map(theme => ({ value: theme, label: theme }))
  ]);

  if (!themes.includes(Ariadne.state.theme)) Ariadne.state.theme = "all";
  $("#themeSelect").value = Ariadne.state.theme;
}

function fillLpdSelect() {
  const lpds = getCurrentLpds();
  fillSelect("#lpdSelect", [
    { value: "all", label: "Alle LPD’s" },
    ...lpds.map(lpd => ({ value: lpd.code, label: `${lpd.code} — ${lpd.titel}` }))
  ]);
  if (!lpds.some(lpd => lpd.code === Ariadne.state.lpd)) Ariadne.state.lpd = "all";
  $("#lpdSelect").value = Ariadne.state.lpd;
}

function fillBlockSelect() {
  fillSelect("#blockSelect", [
    { value: "all", label: "Alle bouwstenen" },
    ...Ariadne.data.bouwstenen.map(block => ({ value: block.code, label: block.label }))
  ]);
  $("#blockSelect").value = Ariadne.state.block;
}

function bindEvents() {
  $("#siteSelect").addEventListener("change", event => {
    Ariadne.state.site = event.target.value;
    Ariadne.state.theme = "all";
    Ariadne.state.lpd = "all";
    fillThemeSelect();
    fillLpdSelect();
    render();
  });

  $("#themeSelect").addEventListener("change", event => {
    Ariadne.state.theme = event.target.value;
    render();
  });

  $("#lpdSelect").addEventListener("change", event => {
    Ariadne.state.lpd = event.target.value;
    render();
  });

  $("#blockSelect").addEventListener("change", event => {
    Ariadne.state.block = event.target.value;
    render();
  });

  $("#searchInput").addEventListener("input", event => {
    Ariadne.state.search = event.target.value.trim().toLowerCase();
    render();
  });

  $("#resetFilters").addEventListener("click", () => {
    Ariadne.state.site = "all";
    Ariadne.state.theme = "all";
    Ariadne.state.lpd = "all";
    Ariadne.state.block = "all";
    Ariadne.state.search = "";
    $("#siteSelect").value = "all";
    $("#searchInput").value = "";
    fillThemeSelect();
    fillLpdSelect();
    $("#blockSelect").value = "all";
    render();
  });

  $$(".tab").forEach(button => {
    button.addEventListener("click", () => {
      Ariadne.state.view = button.dataset.view;
      $$(".tab").forEach(tab => tab.classList.toggle("is-active", tab === button));
      render();
    });
  });
}

function render() {
  const lessons = getFilteredLessons();
  renderStats(lessons);
  renderViewTitle(lessons);

  const viewRenderers = {
    lessons: renderLessons,
    lpds: renderLpdCoverage,
    blocks: renderBlockCoverage,
    content: renderContentOverview,
    gaps: renderGaps,
    pdfscan: renderPdfScan,
    export: renderExport
  };

  viewRenderers[Ariadne.state.view]?.(lessons);
}

function renderStats(lessons) {
  const lpdLinks = lessons.reduce((sum, lesson) => sum + (lesson.lpds?.length || 0), 0);
  const blockLinks = lessons.reduce((sum, lesson) => sum + (lesson.bouwstenen?.length || 0), 0);
  const gapCount = calculateGaps(lessons).length;

  $("#statLessons").textContent = lessons.length;
  $("#statLpdLinks").textContent = lpdLinks;
  $("#statBlockLinks").textContent = blockLinks;
  $("#statGaps").textContent = gapCount;
}

function renderViewTitle(lessons) {
  const activeSite = Ariadne.data.sites.find(site => site.id === Ariadne.state.site);
  const siteLabel = activeSite ? activeSite.naam : "alle sites";
  const themeLabel = Ariadne.state.theme === "all" ? "alle thema’s" : Ariadne.state.theme;

  const titles = {
    lessons: "Lessen",
    lpds: "LPD-dekking",
    blocks: "Surma-bouwstenen",
    content: "Leerstofoverzicht",
    gaps: "Hiaten en aandachtspunten",
    pdfscan: "PDF-scan",
    export: "Export"
  };

  $("#viewTitle").innerHTML = `
    <h2>${titles[Ariadne.state.view]}</h2>
    <p>${lessons.length} les(sen) binnen ${escapeHtml(siteLabel)} · ${escapeHtml(themeLabel)}</p>
  `;
}

function renderLessons(lessons) {
  const content = $("#content");
  if (!lessons.length) return renderEmpty(content);

  content.innerHTML = lessons.map(lesson => `
    <article class="lesson-card">
      <div class="lesson-card__top">
        <div>
          <h3>${escapeHtml(lesson.titel)}</h3>
          <div class="meta">
            <span>${escapeHtml(getSiteName(lesson.site))}</span>
            <span>·</span>
            <span>${escapeHtml(lesson.thema || "zonder thema")}</span>
            <span>·</span>
            <span>${escapeHtml(String(lesson.duur || "?"))} min.</span>
            <span>·</span>
            <span>${escapeHtml(lesson.status || "metadata")}</span>
          </div>
        </div>
        <span class="source-badge ${lesson.bronType === "pdf" ? "source-badge--pdf" : ""}">
          ${escapeHtml(lesson.bronType || "html")}
        </span>
      </div>

      ${renderPills("Leerstof", lesson.leerinhoud, "content")}
      ${renderLessonLpds(lesson)}
      ${renderLessonBlocks(lesson)}
      ${renderPlannerSnippet(lesson)}
    </article>
  `).join("");
}

function renderPills(label, items = [], type = "") {
  if (!items.length) return "";
  return `
    <p class="section-label">${escapeHtml(label)}</p>
    <div class="pills">
      ${items.map(item => `<span class="pill pill--${escapeAttr(type)}">${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function renderLessonLpds(lesson) {
  const lpds = lesson.lpds || [];
  if (!lpds.length) {
    return `<p class="section-label">LPD’s</p><div class="warning"><strong>Geen LPD-metadata</strong><span>Deze les moet nog gelabeld worden.</span></div>`;
  }

  return `
    <p class="section-label">LPD’s</p>
    <div class="pills">
      ${lpds.map(item => `<span class="pill pill--lpd">${escapeHtml(item.code)}</span>`).join("")}
    </div>
    <ul class="context-list">
      ${lpds.map(item => `
        <li>
          <strong>${escapeHtml(item.code)}</strong> — ${escapeHtml(item.context || "geen context")}
          ${renderLocationLink(lesson, item.locatie)}
        </li>
      `).join("")}
    </ul>
  `;
}

function renderLessonBlocks(lesson) {
  const blocks = lesson.bouwstenen || [];
  if (!blocks.length) {
    return `<p class="section-label">Bouwstenen</p><div class="warning"><strong>Geen Surma-metadata</strong><span>Deze les moet nog gelabeld worden.</span></div>`;
  }

  return `
    <p class="section-label">Bouwstenen</p>
    <div class="pills">
      ${blocks.map(item => `<span class="pill pill--block">${escapeHtml(getBlockLabel(item.code))}</span>`).join("")}
    </div>
    <ul class="context-list">
      ${blocks.map(item => `
        <li>
          <strong>${escapeHtml(getBlockLabel(item.code))}</strong> — ${escapeHtml(item.context || "geen context")}
          ${renderLocationLink(lesson, item.locatie)}
        </li>
      `).join("")}
    </ul>
  `;
}

function renderPlannerSnippet(lesson) {
  if (!lesson.planner) return "";
  return `
    <p class="section-label">Plannertekst</p>
    <div class="code-box">${escapeHtml(lesson.planner.titel)}
${escapeHtml(lesson.planner.beschrijving || "")}</div>
  `;
}

function renderLocationLink(lesson, locatie) {
  if (!locatie) return "";
  const url = lesson.bronUrl ? `${lesson.bronUrl}${locatie.startsWith("#") ? locatie : `#${locatie}`}` : locatie;
  return ` <a href="${escapeAttr(url)}">locatie</a>`;
}

function renderLpdCoverage(lessons) {
  const content = $("#content");
  const lpds = getCurrentLpds();

  if (!lpds.length) {
    content.innerHTML = `
      <div class="empty">
        <h3>Kies één site</h3>
        <p>LPD-dekking werkt per LPD-set. Kies links één specifieke site/richting.</p>
      </div>
    `;
    return;
  }

  content.innerHTML = lpds.map(lpd => {
    const occurrences = findLpdOccurrences(lessons, lpd.code);
    const count = occurrences.length;
    const state = count >= 3 ? "sterk aanwezig" : count >= 1 ? "aanwezig" : "nog niet aangeboden";
    const stateClass = count >= 3 ? "strong" : count >= 1 ? "some" : "gap";
    const value = Math.min(100, count * 34);

    return `
      <article class="coverage-card">
        <div class="coverage-head">
          <div>
            <h3>${escapeHtml(lpd.code)} — ${escapeHtml(lpd.titel)}</h3>
            <p>${escapeHtml(lpd.omschrijving || "")}</p>
          </div>
          <span class="coverage-state coverage-state--${stateClass}">${state}</span>
        </div>
        <div class="meter" aria-hidden="true"><span style="--value:${value}%"></span></div>
        ${occurrences.length ? `
          <ul class="context-list">
            ${occurrences.map(occ => `
              <li>
                <strong>${escapeHtml(occ.lesson.titel)}</strong> — ${escapeHtml(occ.link.context || "geen context")}
                ${renderLocationLink(occ.lesson, occ.link.locatie)}
              </li>
            `).join("")}
          </ul>
        ` : `<p class="warning"><strong>Hiaat</strong><span>Nog geen bevestigde koppeling in de huidige selectie.</span></p>`}
      </article>
    `;
  }).join("");
}

function renderBlockCoverage(lessons) {
  const content = $("#content");
  content.innerHTML = Ariadne.data.bouwstenen.map(block => {
    const occurrences = findBlockOccurrences(lessons, block.code);
    const count = occurrences.length;
    const state = count >= 3 ? "sterk aanwezig" : count >= 1 ? "aanwezig" : "nog niet zichtbaar";
    const stateClass = count >= 3 ? "strong" : count >= 1 ? "some" : "gap";
    const value = Math.min(100, count * 34);

    return `
      <article class="coverage-card">
        <div class="coverage-head">
          <div>
            <h3>${escapeHtml(block.label)}</h3>
            <p>${escapeHtml(block.omschrijving || "")}</p>
          </div>
          <span class="coverage-state coverage-state--${stateClass}">${state}</span>
        </div>
        <div class="meter" aria-hidden="true"><span style="--value:${value}%"></span></div>
        ${occurrences.length ? `
          <ul class="context-list">
            ${occurrences.map(occ => `
              <li>
                <strong>${escapeHtml(occ.lesson.titel)}</strong> — ${escapeHtml(occ.link.context || "geen context")}
                ${renderLocationLink(occ.lesson, occ.link.locatie)}
              </li>
            `).join("")}
          </ul>
        ` : `<p class="warning"><strong>Nog niet zichtbaar</strong><span>Geen bevestigde koppeling in de huidige selectie.</span></p>`}
      </article>
    `;
  }).join("");
}

function renderContentOverview(lessons) {
  const content = $("#content");
  if (!lessons.length) return renderEmpty(content);

  content.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Les</th>
            <th>Thema</th>
            <th>Leerstof</th>
            <th>Werkvormen</th>
            <th>LPD’s</th>
            <th>Bouwstenen</th>
          </tr>
        </thead>
        <tbody>
          ${lessons.map(lesson => `
            <tr>
              <td><strong>${escapeHtml(lesson.titel)}</strong></td>
              <td>${escapeHtml(lesson.thema || "")}</td>
              <td>${escapeHtml((lesson.leerinhoud || []).join(", "))}</td>
              <td>${escapeHtml((lesson.werkvormen || []).join(", "))}</td>
              <td>${escapeHtml((lesson.lpds || []).map(item => item.code).join(", "))}</td>
              <td>${escapeHtml((lesson.bouwstenen || []).map(item => getBlockLabel(item.code)).join(", "))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderGaps(lessons) {
  const content = $("#content");
  const gaps = calculateGaps(lessons);

  if (!gaps.length) {
    content.innerHTML = `
      <div class="empty">
        <h3>Geen aandachtspunten in deze selectie</h3>
        <p>Alle lessen hebben minimaal LPD- en bouwsteenmetadata.</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="warning-list">
      ${gaps.map(gap => `
        <article class="warning">
          <strong>${escapeHtml(gap.titel)}</strong>
          <span>${escapeHtml(gap.beschrijving)}</span>
        </article>
      `).join("")}
    </div>
  `;
}


function renderPdfScan(lessons) {
  const content = $("#content");
  const siteWarning = Ariadne.state.site === "all"
    ? `<div class="pdf-note"><strong>Kies bij voorkeur één site.</strong><br>Zo gebruikt Ariadne de juiste LPD-set.</div>`
    : "";

  content.innerHTML = `
    <div class="pdf-scan-grid">
      <section class="scan-box">
        <h3>PDF scannen</h3>
        <p>
          Upload een digitale tekst-PDF. Ariadne leest lokaal in je browser
          en toont mogelijke LPD’s en bouwstenen als suggestie.
        </p>

        ${siteWarning}

        <label class="file-drop" for="pdfInput">
          <div class="upload-visual">
            <span class="mi" style="font-size:2.8rem;width:2.8rem;height:2.8rem;color:#C8860A;font-variation-settings:'FILL' 0,'wght' 200,'GRAD' 0,'opsz' 48" aria-hidden="true">barcode_scanner</span>
            <div>
              <strong>Sleep je PDF hierheen</strong>
              <span>of kies een bestand</span>
            </div>
            <input id="pdfInput" type="file" accept="application/pdf">
          </div>
        </label>

        <div class="scan-controls">
          <label for="pdfThemeInput">Thema / reeksnaam, optioneel</label>
          <input id="pdfThemeInput" type="text" placeholder="bv. Thema 3 — Nullus sine vitio">

          <button class="primary-btn" type="button" id="scanPdfBtn">Scan PDF</button>
        </div>

        <div class="scan-status" id="scanStatus">${escapeHtml(Ariadne.state.pdfScan.status)}</div>
      </section>

      <section class="scan-box">
        <h3>Suggesties</h3>
        <div id="scanResults">
          ${renderPdfSuggestions()}
        </div>
      </section>
    </div>
  `;

  $("#scanPdfBtn").addEventListener("click", handlePdfScan);
}

function renderPdfSuggestions() {
  const scan = Ariadne.state.pdfScan;

  if (!scan.suggestions.length) {
    return `
      <div class="suggestions-empty">
        <div>
          <div class="icon" aria-hidden="true">
            <span class="mi" style="font-size:2.4rem;width:2.4rem;height:2.4rem;color:#C8860A;font-variation-settings:'FILL' 0,'wght' 200,'GRAD' 0,'opsz' 48" aria-hidden="true">search</span>
          </div>
          <h3>Nog geen suggesties</h3>
          <p>Scan een PDF. Mogelijke LPD’s en bouwstenen verschijnen hier overzichtelijk.</p>
        </div>
      </div>
    `;
  }

  return scan.suggestions.map(suggestion => `
    <article class="scan-result-card">
      <div class="coverage-head">
        <div>
          <h4>Pagina ${escapeHtml(suggestion.page)} — ${escapeHtml(suggestion.typeLabel)}</h4>
          <p><strong>${escapeHtml(suggestion.code)}</strong> · ${escapeHtml(suggestion.label)}</p>
        </div>
        <span class="confidence confidence--${escapeAttr(suggestion.confidence)}">${escapeHtml(suggestion.confidence)}</span>
      </div>
      <p>${escapeHtml(suggestion.reason)}</p>
      <div class="excerpt">${escapeHtml(suggestion.excerpt)}</div>
    </article>
  `).join("");
}

async function handlePdfScan() {
  const input = $("#pdfInput");
  const status = $("#scanStatus");

  if (!input.files || !input.files[0]) {
    setPdfStatus("Kies eerst een PDF-bestand.", true);
    return;
  }

  if (typeof pdfjsLib === "undefined") {
    setPdfStatus("PDF.js kon niet geladen worden. Controleer je internetverbinding of host pdf.js lokaal.", true);
    return;
  }

  try {
    setPdfStatus("PDF wordt gelezen…");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const file = input.files[0];
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      setPdfStatus(`Pagina ${pageNumber} van ${pdf.numPages} wordt gelezen…`);
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map(item => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      pages.push({ page: pageNumber, text });
    }

    const suggestions = suggestPdfLinks(pages);

    Ariadne.state.pdfScan = {
      fileName: file.name,
      status: `${file.name}: ${pages.length} pagina’s gelezen · ${suggestions.length} suggestie(s) gevonden.`,
      pages,
      suggestions
    };

    setPdfStatus(Ariadne.state.pdfScan.status);
    $("#scanResults").innerHTML = renderPdfSuggestions();
  } catch (error) {
    console.error(error);
    setPdfStatus(`PDF-scan mislukt: ${error.message}`, true);
  }
}

function setPdfStatus(message, isError = false) {
  const status = $("#scanStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  Ariadne.state.pdfScan.status = message;
}

function suggestPdfLinks(pages) {
  const lpdSuggestions = suggestLpdLinksFromPdf(pages);
  const blockSuggestions = suggestBlockLinksFromPdf(pages);

  return [...lpdSuggestions, ...blockSuggestions]
    .sort((a, b) => {
      const pageDiff = a.page - b.page;
      if (pageDiff !== 0) return pageDiff;
      return confidenceScore(b.confidence) - confidenceScore(a.confidence);
    })
    .slice(0, 80);
}

function suggestLpdLinksFromPdf(pages) {
  const lpds = getCurrentLpds();
  if (!lpds.length) return [];

  return pages.flatMap(page => {
    const pageText = normalizeText(page.text);
    return lpds.map(lpd => {
      const terms = buildKeywordSet([lpd.code, lpd.titel, lpd.omschrijving, lpd.categorie]);
      const score = countKeywordHits(pageText, terms);
      if (score < 2) return null;

      return {
        page: page.page,
        type: "lpd",
        typeLabel: "mogelijke LPD-koppeling",
        code: lpd.code,
        label: lpd.titel,
        confidence: score >= 5 ? "hoog" : score >= 3 ? "middelmatig" : "laag",
        reason: `Ariadne vond ${score} inhoudelijke overeenkomst(en) met deze LPD-set.`,
        excerpt: makeExcerpt(page.text, terms)
      };
    }).filter(Boolean);
  });
}

function suggestBlockLinksFromPdf(pages) {
  return pages.flatMap(page => {
    const pageText = normalizeText(page.text);
    return Ariadne.data.bouwstenen.map(block => {
      const terms = buildBlockKeywords(block);
      const score = countKeywordHits(pageText, terms);
      if (score < 2) return null;

      return {
        page: page.page,
        type: "bouwsteen",
        typeLabel: "mogelijke bouwsteenkoppeling",
        code: block.code,
        label: block.label,
        confidence: score >= 5 ? "hoog" : score >= 3 ? "middelmatig" : "laag",
        reason: `Ariadne vond ${score} aanwijzing(en) voor deze bouwsteen.`,
        excerpt: makeExcerpt(page.text, terms)
      };
    }).filter(Boolean);
  });
}

function buildBlockKeywords(block) {
  const extra = {
    "voorkennis-activeren": ["voorkennis", "wat weet je", "herinner", "denk terug", "instap", "opfrissen"],
    "heldere-uitleg": ["uitleg", "schema", "stappen", "overzicht", "kern", "definitie"],
    "voorbeelden": ["voorbeeld", "model", "zoals", "vergelijk", "toon"],
    "controleren-begrip": ["begrijp", "controleer", "vraag", "antwoord", "leg uit", "verklaar"],
    "begeleide-inoefening": ["samen", "begeleid", "stap voor stap", "woordgroep", "klassikaal"],
    "zelfstandige-verwerking": ["zelfstandig", "alleen", "per twee", "in groep", "verwerk"],
    "gespreid-oefenen": ["herhaal", "opnieuw", "retrieval", "vroeger", "vorige les", "oude woorden"],
    "feedback": ["feedback", "verbeter", "controleer je antwoord", "bespreek", "fout", "juist"]
  };

  return buildKeywordSet([
    block.code,
    block.label,
    block.omschrijving,
    ...(extra[block.code] || [])
  ]);
}

function buildKeywordSet(values) {
  const stopwords = new Set([
    "de", "het", "een", "en", "of", "in", "op", "met", "van", "voor", "door", "naar",
    "leerlingen", "leerling", "tekst", "teksten", "wordt", "worden", "kunnen", "aan",
    "bij", "uit", "als", "dit", "dat", "die", "deze", "hun", "zijn", "haar", "jouw",
    "latijnse", "griekse", "passende", "relevante"
  ]);

  return [...new Set(values
    .filter(Boolean)
    .flatMap(value => normalizeText(value).split(/[^a-z0-9à-ÿ]+/i))
    .map(term => term.trim())
    .filter(term => term.length >= 4 && !stopwords.has(term))
  )];
}

function countKeywordHits(text, terms) {
  return terms.reduce((score, term) => {
    if (text.includes(term)) return score + 1;
    return score;
  }, 0);
}

function makeExcerpt(text, terms) {
  if (!text) return "Geen tekstfragment gevonden op deze pagina.";

  const normalized = normalizeText(text);
  const hit = terms.find(term => normalized.includes(term));
  if (!hit) return text.slice(0, 260) + (text.length > 260 ? "…" : "");

  const index = normalized.indexOf(hit);
  const start = Math.max(0, index - 120);
  const end = Math.min(text.length, index + 220);

  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function confidenceScore(confidence) {
  return confidence === "hoog" ? 3 : confidence === "middelmatig" ? 2 : 1;
}


function renderExport(lessons) {
  const content = $("#content");
  content.innerHTML = `
    <article class="export-card">
      <h3>Export van huidige selectie</h3>
      <p>
        Deze v1-export is bewust eenvoudig: JSON als bronformaat, CSV als controlebestand,
        en een planner-CSV als tussenstap richting Smartschool.
      </p>
      <div class="export-actions">
        <button class="primary-btn" type="button" id="exportJson">Download JSON</button>
        <button class="secondary-btn" type="button" id="exportCsv">Download leerstofoverzicht CSV</button>
        <button class="secondary-btn" type="button" id="exportPlanner">Download planner-CSV</button>
      </div>
    </article>

    <article class="export-card">
      <h3>Voorbeeldstructuur van één les</h3>
      <pre class="code-box">${escapeHtml(JSON.stringify(lessons[0] || {}, null, 2))}</pre>
    </article>
  `;

  $("#exportJson").addEventListener("click", () => downloadJson("ariadne-selectie.json", lessons));
  $("#exportCsv").addEventListener("click", () => downloadCsv("ariadne-leerstofoverzicht.csv", buildLessonCsvRows(lessons)));
  $("#exportPlanner").addEventListener("click", () => downloadCsv("ariadne-planner.csv", buildPlannerRows(lessons)));
}

function lessonsForSite(siteId) {
  if (siteId === "all") return Ariadne.data.lessons;
  return Ariadne.data.lessons.filter(lesson => lesson.site === siteId);
}

function getFilteredLessons() {
  return Ariadne.data.lessons.filter(lesson => {
    if (Ariadne.state.site !== "all" && lesson.site !== Ariadne.state.site) return false;
    if (Ariadne.state.theme !== "all" && lesson.thema !== Ariadne.state.theme) return false;
    if (Ariadne.state.lpd !== "all" && !(lesson.lpds || []).some(item => item.code === Ariadne.state.lpd)) return false;
    if (Ariadne.state.block !== "all" && !(lesson.bouwstenen || []).some(item => item.code === Ariadne.state.block)) return false;

    if (Ariadne.state.search) {
      const haystack = [
        lesson.titel,
        lesson.thema,
        lesson.bronUrl,
        ...(lesson.leerinhoud || []),
        ...(lesson.werkvormen || []),
        ...(lesson.lpds || []).flatMap(item => [item.code, item.context]),
        ...(lesson.bouwstenen || []).flatMap(item => [item.code, item.context]),
        lesson.planner?.titel,
        lesson.planner?.beschrijving
      ].filter(Boolean).join(" ").toLowerCase();

      if (!haystack.includes(Ariadne.state.search)) return false;
    }

    return true;
  });
}

function getCurrentLpds() {
  const site = Ariadne.data.sites.find(item => item.id === Ariadne.state.site);

  if (site?.lpdSet) {
    return Ariadne.data.lpdSets.get(site.lpdSet)?.lpds || [];
  }

  // Bij "alle sites": toon geen samengemengde LPD-lijst, want codes kunnen per set verschillen.
  return [];
}

function findLpdOccurrences(lessons, code) {
  return lessons.flatMap(lesson =>
    (lesson.lpds || [])
      .filter(link => link.code === code)
      .map(link => ({ lesson, link }))
  );
}

function findBlockOccurrences(lessons, code) {
  return lessons.flatMap(lesson =>
    (lesson.bouwstenen || [])
      .filter(link => link.code === code)
      .map(link => ({ lesson, link }))
  );
}

function calculateGaps(lessons) {
  const gaps = [];

  lessons.forEach(lesson => {
    if (!lesson.lpds?.length) {
      gaps.push({
        titel: `${lesson.titel}: geen LPD-metadata`,
        beschrijving: "Deze les heeft nog geen bevestigde leerplandoelkoppelingen."
      });
    }

    if (!lesson.bouwstenen?.length) {
      gaps.push({
        titel: `${lesson.titel}: geen Surma-metadata`,
        beschrijving: "Deze les heeft nog geen bevestigde bouwsteenkoppelingen."
      });
    }

    if (!lesson.planner?.titel || !lesson.planner?.beschrijving) {
      gaps.push({
        titel: `${lesson.titel}: plannertekst ontbreekt`,
        beschrijving: "Voeg een titel en korte beschrijving toe om later plannerexports te kunnen maken."
      });
    }

    if (lesson.status && lesson.status !== "bevestigd") {
      gaps.push({
        titel: `${lesson.titel}: status ${lesson.status}`,
        beschrijving: "Controleer deze metadata voor je ze gebruikt in rapporten."
      });
    }
  });

  const lpds = getCurrentLpds();
  lpds.forEach(lpd => {
    if (!findLpdOccurrences(lessons, lpd.code).length) {
      gaps.push({
        titel: `${lpd.code}: nog niet aangeboden`,
        beschrijving: lpd.titel
      });
    }
  });

  return gaps;
}

function buildLessonCsvRows(lessons) {
  return [
    ["site", "thema", "les", "duur", "leerinhoud", "werkvormen", "lpds", "bouwstenen"],
    ...lessons.map(lesson => [
      getSiteName(lesson.site),
      lesson.thema || "",
      lesson.titel || "",
      lesson.duur || "",
      (lesson.leerinhoud || []).join(" | "),
      (lesson.werkvormen || []).join(" | "),
      (lesson.lpds || []).map(item => item.code).join(" | "),
      (lesson.bouwstenen || []).map(item => getBlockLabel(item.code)).join(" | ")
    ])
  ];
}

function buildPlannerRows(lessons) {
  return [
    ["datum", "vak", "titel", "beschrijving", "materiaal", "bron"],
    ...lessons.map(lesson => [
      lesson.datum || "",
      getSiteName(lesson.site),
      lesson.planner?.titel || lesson.titel || "",
      lesson.planner?.beschrijving || "",
      (lesson.planner?.materiaal || []).join(" | "),
      lesson.bronUrl || ""
    ])
  ];
}

function downloadJson(filename, data) {
  downloadBlob(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  downloadBlob(filename, csv, "text/csv;charset=utf-8");
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getSiteName(siteId) {
  return Ariadne.data.sites.find(site => site.id === siteId)?.naam || siteId || "onbekende site";
}

function getBlockLabel(code) {
  return Ariadne.data.bouwstenen.find(block => block.code === code)?.label || code;
}

function renderEmpty(container) {
  container.innerHTML = $("#emptyState").innerHTML;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}
