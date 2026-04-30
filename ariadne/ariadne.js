const STORAGE_KEYS = {
  confirmedLinks: "ariadne:v2:confirmed-links",
  suggestionReviews: "ariadne:v2:suggestion-reviews"
};

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
      pages: [],
      targetLessonId: ""
    },
    v2: {
      confirmedLinks: [],
      suggestionReviews: {}
    }
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", initAriadne);

async function initAriadne() {
  try {
    loadV2Storage();
    await loadData();
    applyStoredConfirmedLinks();
    hydrateControls();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    const content = $("#content");
    if (content) {
      content.innerHTML = `
        <div class="empty">
          <h3>Ariadne kon de data niet laden</h3>
          <p>Controleer of je de map via een lokale server of GitHub Pages opent. Rechtstreeks openen via <code>file://</code> blokkeert vaak JSON-bestanden.</p>
          <pre class="code-box">${escapeHtml(error.message)}</pre>
        </div>
      `;
    }
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
  Ariadne.data.lessons = lessonBundles.flatMap(bundle => bundle.lessons || []).map(normalizeLesson);
}

function normalizeLesson(lesson) {
  return {
    ...lesson,
    leerinhoud: lesson.leerinhoud || [],
    werkvormen: lesson.werkvormen || [],
    lpds: normalizeLinks(lesson.lpds || [], "lpd", lesson),
    bouwstenen: normalizeLinks(lesson.bouwstenen || [], "bouwsteen", lesson),
    planner: lesson.planner || {}
  };
}

function normalizeLinks(links, type, lesson) {
  return links.map((link, index) => ({
    ...link,
    type,
    id: link.id || `${lesson.id || "lesson"}:${type}:${link.code || index}:${index}`,
    status: link.status || inferLegacyLinkStatus(lesson),
    source: link.source || {
      type: lesson.bronType || "manual",
      label: lesson.bronType === "pdf" ? "PDF-metadata" : "handmatig / lesbestand"
    }
  }));
}

function inferLegacyLinkStatus(lesson) {
  if (lesson.status === "bevestigd") return "bevestigd";
  if (lesson.status === "concept") return "te-controleren";
  if (lesson.status === "te-controleren") return "te-controleren";
  return "te-controleren";
}

function loadV2Storage() {
  Ariadne.state.v2.confirmedLinks = readStorageArray(STORAGE_KEYS.confirmedLinks);
  Ariadne.state.v2.suggestionReviews = readStorageObject(STORAGE_KEYS.suggestionReviews);
}

function readStorageArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readStorageObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function saveV2Storage() {
  localStorage.setItem(STORAGE_KEYS.confirmedLinks, JSON.stringify(Ariadne.state.v2.confirmedLinks));
  localStorage.setItem(STORAGE_KEYS.suggestionReviews, JSON.stringify(Ariadne.state.v2.suggestionReviews));
}

function applyStoredConfirmedLinks() {
  Ariadne.state.v2.confirmedLinks.forEach(link => {
    const lesson = Ariadne.data.lessons.find(item => item.id === link.lessonId);
    if (!lesson) return;
    addConfirmedLinkToLesson(lesson, link, { persist: false });
  });
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
  if (!select) return;
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
  const select = $("#themeSelect");
  if (select) select.value = Ariadne.state.theme;
}

function fillLpdSelect() {
  const lpds = getCurrentLpds();
  fillSelect("#lpdSelect", [
    { value: "all", label: "Alle LPD’s" },
    ...lpds.map(lpd => ({ value: lpd.code, label: `${lpd.code} — ${lpd.titel}` }))
  ]);
  if (!lpds.some(lpd => lpd.code === Ariadne.state.lpd)) Ariadne.state.lpd = "all";
  const select = $("#lpdSelect");
  if (select) select.value = Ariadne.state.lpd;
}

function fillBlockSelect() {
  fillSelect("#blockSelect", [
    { value: "all", label: "Alle bouwstenen" },
    ...Ariadne.data.bouwstenen.map(block => ({ value: block.code, label: block.label }))
  ]);
  const select = $("#blockSelect");
  if (select) select.value = Ariadne.state.block;
}

function bindEvents() {
  $("#siteSelect")?.addEventListener("change", event => {
    Ariadne.state.site = event.target.value;
    Ariadne.state.theme = "all";
    Ariadne.state.lpd = "all";
    Ariadne.state.pdfScan.targetLessonId = "";
    fillThemeSelect();
    fillLpdSelect();
    render();
  });

  $("#themeSelect")?.addEventListener("change", event => {
    Ariadne.state.theme = event.target.value;
    Ariadne.state.pdfScan.targetLessonId = "";
    render();
  });

  $("#lpdSelect")?.addEventListener("change", event => {
    Ariadne.state.lpd = event.target.value;
    render();
  });

  $("#blockSelect")?.addEventListener("change", event => {
    Ariadne.state.block = event.target.value;
    render();
  });

  $("#searchInput")?.addEventListener("input", event => {
    Ariadne.state.search = event.target.value.trim().toLowerCase();
    render();
  });

  $("#resetFilters")?.addEventListener("click", () => {
    Ariadne.state.site = "all";
    Ariadne.state.theme = "all";
    Ariadne.state.lpd = "all";
    Ariadne.state.block = "all";
    Ariadne.state.search = "";
    Ariadne.state.pdfScan.targetLessonId = "";
    if ($("#siteSelect")) $("#siteSelect").value = "all";
    if ($("#searchInput")) $("#searchInput").value = "";
    fillThemeSelect();
    fillLpdSelect();
    if ($("#blockSelect")) $("#blockSelect").value = "all";
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
  const lpdLinks = lessons.reduce((sum, lesson) => sum + getConfirmedLinks(lesson, "lpds").length, 0);
  const blockLinks = lessons.reduce((sum, lesson) => sum + getConfirmedLinks(lesson, "bouwstenen").length, 0);
  const gapCount = calculateGaps(lessons).length;

  setText("#statLessons", lessons.length);
  setText("#statLpdLinks", lpdLinks);
  setText("#statBlockLinks", blockLinks);
  setText("#statGaps", gapCount);
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
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

  const viewTitle = $("#viewTitle");
  if (!viewTitle) return;
  viewTitle.innerHTML = `
    <h2>${escapeHtml(titles[Ariadne.state.view])}</h2>
    <p>${lessons.length} les(sen) binnen ${escapeHtml(siteLabel)} · ${escapeHtml(themeLabel)}</p>
  `;
}

function renderLessons(lessons) {
  const content = $("#content");
  if (!lessons.length) return renderEmpty(content);

  content.innerHTML = lessons.map(lesson => {
    const lpdSplit = splitLinksByReviewState(lesson, "lpds");
    const blockSplit = splitLinksByReviewState(lesson, "bouwstenen");

    return `
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
              ${renderMetadataStateBadge(lesson)}
            </div>
          </div>
          <span class="source-badge ${lesson.bronType === "pdf" ? "source-badge--pdf" : ""}">
            ${escapeHtml(lesson.bronType || "html")}
          </span>
        </div>

        ${renderPills("Leerstof", lesson.leerinhoud, "content")}
        ${renderLessonLinks("LPD’s", lpdSplit, lesson)}
        ${renderLessonLinks("Bouwstenen", blockSplit, lesson)}
        ${renderPlannerSnippet(lesson)}
      </article>
    `;
  }).join("");
}

function renderMetadataStateBadge(lesson) {
  const stateClass = lesson.status === "bevestigd" ? "bevestigd" : "te-controleren";
  const stateLabel = lesson.status === "bevestigd" ? "bevestigd" : "te controleren";
  return `<span class="metadata-state metadata-state--${escapeAttr(stateClass)}">${escapeHtml(stateLabel)}</span>`;
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

function renderLessonLinks(label, split, lesson) {
  const confirmed = split.confirmed;
  const review = split.review;
  const field = label === "LPD’s" ? "lpds" : "bouwstenen";

  if (!confirmed.length && !review.length) {
    return `<p class="section-label">${escapeHtml(label)}</p><div class="warning"><strong>Geen ${escapeHtml(label)}-metadata</strong><span>Deze les moet nog gelabeld worden.</span></div>`;
  }

  return `
    <p class="section-label">${escapeHtml(label)}</p>
    ${confirmed.length ? `
      <div class="metadata-group metadata-group--confirmed">
        <div class="metadata-group__label">Bevestigd</div>
        <div class="pills">
          ${confirmed.map(item => `<span class="pill ${field === "lpds" ? "pill--lpd" : "pill--block"}">${escapeHtml(formatLinkPill(item, field))}</span>`).join("")}
        </div>
        <ul class="context-list">
          ${confirmed.map(item => renderLinkContext(item, lesson, field)).join("")}
        </ul>
      </div>
    ` : ""}
    ${review.length ? `
      <div class="metadata-group metadata-group--review">
        <div class="metadata-group__label">Te controleren</div>
        <div class="pills">
          ${review.map(item => `<span class="pill pill--review">${escapeHtml(formatLinkPill(item, field))}</span>`).join("")}
        </div>
        <ul class="context-list">
          ${review.map(item => renderLinkContext(item, lesson, field)).join("")}
        </ul>
      </div>
    ` : ""}
  `;
}

function renderLinkContext(item, lesson, field) {
  const label = field === "bouwstenen" ? getBlockLabel(item.code) : item.code;
  return `
    <li>
      <strong>${escapeHtml(label)}</strong> — ${escapeHtml(item.context || "geen context")}
      ${renderLocationLink(lesson, item.locatie || item.location)}
      ${renderSourceSmall(item)}
    </li>
  `;
}

function formatLinkPill(item, field) {
  if (field === "bouwstenen") return getBlockLabel(item.code);
  return item.code;
}

function renderSourceSmall(item) {
  const label = item.source?.label || item.source?.type || "bron onbekend";
  return ` <small class="source-small">${escapeHtml(label)}</small>`;
}

function renderPlannerSnippet(lesson) {
  if (!lesson.planner?.titel && !lesson.planner?.beschrijving) return "";
  return `
    <p class="section-label">Plannertekst</p>
    <div class="code-box">${escapeHtml(lesson.planner.titel || lesson.titel || "")}
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
    const reviewOccurrences = findReviewOccurrences(lessons, "lpds", lpd.code);
    const count = occurrences.length;
    const state = count >= 3 ? "sterk aanwezig" : count >= 1 ? "bevestigd aanwezig" : reviewOccurrences.length ? "suggestie / controle" : "nog niet aangeboden";
    const stateClass = count >= 3 ? "strong" : count >= 1 ? "some" : "gap";
    const value = Math.min(100, count * 34);

    return `
      <article class="coverage-card">
        <div class="coverage-head">
          <div>
            <h3>${escapeHtml(lpd.code)} — ${escapeHtml(lpd.titel)}</h3>
            <p>${escapeHtml(lpd.omschrijving || "")}</p>
          </div>
          <span class="coverage-state coverage-state--${stateClass}">${escapeHtml(state)}</span>
        </div>
        <div class="meter" aria-hidden="true"><span style="--value:${value}%"></span></div>
        ${occurrences.length ? `
          <ul class="context-list">
            ${occurrences.map(occ => `
              <li>
                <strong>${escapeHtml(occ.lesson.titel)}</strong> — ${escapeHtml(occ.link.context || "geen context")}
                ${renderLocationLink(occ.lesson, occ.link.locatie || occ.link.location)}
                ${renderSourceSmall(occ.link)}
              </li>
            `).join("")}
          </ul>
        ` : reviewOccurrences.length ? `
          <p class="warning"><strong>Nog niet bevestigd</strong><span>${reviewOccurrences.length} koppeling(en) wachten op controle.</span></p>
        ` : `<p class="warning"><strong>Hiaat</strong><span>Nog geen bevestigde koppeling in de huidige selectie.</span></p>`}
      </article>
    `;
  }).join("");
}

function renderBlockCoverage(lessons) {
  const content = $("#content");
  content.innerHTML = Ariadne.data.bouwstenen.map(block => {
    const occurrences = findBlockOccurrences(lessons, block.code);
    const reviewOccurrences = findReviewOccurrences(lessons, "bouwstenen", block.code);
    const count = occurrences.length;
    const state = count >= 3 ? "sterk aanwezig" : count >= 1 ? "bevestigd aanwezig" : reviewOccurrences.length ? "suggestie / controle" : "nog niet zichtbaar";
    const stateClass = count >= 3 ? "strong" : count >= 1 ? "some" : "gap";
    const value = Math.min(100, count * 34);

    return `
      <article class="coverage-card">
        <div class="coverage-head">
          <div>
            <h3>${escapeHtml(block.label)}</h3>
            <p>${escapeHtml(block.omschrijving || "")}</p>
          </div>
          <span class="coverage-state coverage-state--${stateClass}">${escapeHtml(state)}</span>
        </div>
        <div class="meter" aria-hidden="true"><span style="--value:${value}%"></span></div>
        ${occurrences.length ? `
          <ul class="context-list">
            ${occurrences.map(occ => `
              <li>
                <strong>${escapeHtml(occ.lesson.titel)}</strong> — ${escapeHtml(occ.link.context || "geen context")}
                ${renderLocationLink(occ.lesson, occ.link.locatie || occ.link.location)}
                ${renderSourceSmall(occ.link)}
              </li>
            `).join("")}
          </ul>
        ` : reviewOccurrences.length ? `
          <p class="warning"><strong>Nog niet bevestigd</strong><span>${reviewOccurrences.length} koppeling(en) wachten op controle.</span></p>
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
            <th>Status</th>
            <th>Thema</th>
            <th>Leerstof</th>
            <th>Werkvormen</th>
            <th>Bevestigde LPD’s</th>
            <th>Te controleren</th>
            <th>Bevestigde bouwstenen</th>
          </tr>
        </thead>
        <tbody>
          ${lessons.map(lesson => {
            const confirmedLpds = getConfirmedLinks(lesson, "lpds");
            const reviewLpds = getReviewLinks(lesson, "lpds");
            const confirmedBlocks = getConfirmedLinks(lesson, "bouwstenen");
            const reviewBlocks = getReviewLinks(lesson, "bouwstenen");
            return `
              <tr>
                <td><strong>${escapeHtml(lesson.titel)}</strong></td>
                <td>${renderMetadataStateBadge(lesson)}</td>
                <td>${escapeHtml(lesson.thema || "")}</td>
                <td>${escapeHtml((lesson.leerinhoud || []).join(", "))}</td>
                <td>${escapeHtml((lesson.werkvormen || []).join(", "))}</td>
                <td>${escapeHtml(confirmedLpds.map(item => item.code).join(", "))}</td>
                <td>${escapeHtml([...reviewLpds.map(item => item.code), ...reviewBlocks.map(item => item.code)].join(", "))}</td>
                <td>${escapeHtml(confirmedBlocks.map(item => getBlockLabel(item.code)).join(", "))}</td>
              </tr>
            `;
          }).join("")}
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
        <p>Alle lessen hebben minimaal bevestigde LPD- en bouwsteenmetadata.</p>
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
  const selectableLessons = lessons.length ? lessons : (Ariadne.state.site === "all" ? Ariadne.data.lessons : []);
  let currentTarget = Ariadne.state.pdfScan.targetLessonId || selectableLessons[0]?.id || "";
  if (!selectableLessons.some(lesson => lesson.id === currentTarget)) {
    currentTarget = selectableLessons[0]?.id || "";
  }
  Ariadne.state.pdfScan.targetLessonId = currentTarget;

  content.innerHTML = `
    <div class="pdf-scan-grid">
      <section class="scan-box">
        <h3>PDF scannen</h3>
        <p>
          Upload een digitale tekst-PDF. Ariadne leest lokaal in je browser
          en toont mogelijke LPD’s en bouwstenen als suggestie. Die suggesties blijven apart tot jij ze bevestigt.
        </p>

        ${siteWarning}

        <label class="file-drop" for="pdfInput">
          <div class="upload-visual">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" aria-hidden="true" style="color:#C8860A">
              <path d="M2 7V4a1 1 0 0 1 1-1h3M2 17v3a1 1 0 0 0 1 1h3M22 7V4a1 1 0 0 0-1-1h-3M22 17v3a1 1 0 0 1-1 1h-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <path d="M5 8v8M8 8v8M11 8v8M14 8v4M17 8v8M20 8v8M14 15v1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            <div>
              <strong>Sleep je PDF hierheen</strong>
              <span>of kies een bestand</span>
            </div>
            <input id="pdfInput" type="file" accept="application/pdf">
          </div>
        </label>

        <div class="scan-controls scan-controls--v2">
          <label for="pdfTargetLesson">Suggesties koppelen aan les</label>
          <select id="pdfTargetLesson">
            ${selectableLessons.length
              ? selectableLessons.map(lesson => `<option value="${escapeAttr(lesson.id)}" ${lesson.id === currentTarget ? "selected" : ""}>${escapeHtml(lesson.titel)}</option>`).join("")
              : `<option value="">Geen les in deze selectie</option>`}
          </select>

          <label for="pdfThemeInput">Thema / reeksnaam, optioneel</label>
          <input id="pdfThemeInput" type="text" placeholder="bv. Thema 3 — Nullus sine vitio">

          <button class="primary-btn" type="button" id="scanPdfBtn">Scan PDF</button>
        </div>

        <div class="scan-status" id="scanStatus">${escapeHtml(Ariadne.state.pdfScan.status)}</div>
      </section>

      <section class="scan-box">
        <h3>Suggesties</h3>
        <div class="v2-note"><strong>V2-regel:</strong> een PDF/AI-koppeling telt pas mee in dekking en export nadat jij ze bevestigt.</div>
        <div id="scanResults">
          ${renderPdfSuggestions()}
        </div>
      </section>
    </div>
  `;

  $("#scanPdfBtn")?.addEventListener("click", handlePdfScan);
  $("#pdfTargetLesson")?.addEventListener("change", event => {
    Ariadne.state.pdfScan.targetLessonId = event.target.value;
    Ariadne.state.pdfScan.suggestions = Ariadne.state.pdfScan.suggestions.map(suggestion => ({
      ...suggestion,
      targetLessonId: event.target.value
    }));
    const results = $("#scanResults");
    if (results) results.innerHTML = renderPdfSuggestions();
  });
  bindSuggestionEvents();
}

function renderPdfSuggestions() {
  const scan = Ariadne.state.pdfScan;

  if (!scan.suggestions.length) {
    return `
      <div class="suggestions-empty">
        <div>
          <div class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" aria-hidden="true" style="color:#C8860A">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/>
              <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </div>
          <h3>Nog geen suggesties</h3>
          <p>Scan een PDF. Mogelijke LPD’s en bouwstenen verschijnen hier overzichtelijk.</p>
        </div>
      </div>
    `;
  }

  return scan.suggestions.map(suggestion => renderSuggestionCard(suggestion)).join("");
}

function renderSuggestionCard(suggestion) {
  const status = suggestion.status || "suggestie";
  const options = suggestion.type === "lpd"
    ? getCurrentLpds().map(lpd => ({ value: lpd.code, label: `${lpd.code} — ${lpd.titel}` }))
    : Ariadne.data.bouwstenen.map(block => ({ value: block.code, label: block.label }));

  return `
    <article class="scan-result-card scan-result-card--${escapeAttr(status)}" data-suggestion-id="${escapeAttr(suggestion.id)}">
      <div class="coverage-head">
        <div>
          <h4>Pagina ${escapeHtml(suggestion.page)} — ${escapeHtml(suggestion.typeLabel)}</h4>
          <p><strong>${escapeHtml(suggestion.code)}</strong> · ${escapeHtml(suggestion.label)}</p>
        </div>
        <span class="confidence confidence--${escapeAttr(suggestion.confidence)}">${escapeHtml(suggestion.confidence)}</span>
      </div>
      <div class="suggestion-status suggestion-status--${escapeAttr(status)}">${escapeHtml(formatSuggestionStatus(status))}</div>
      <p>${escapeHtml(suggestion.reason)}</p>
      <div class="excerpt">${escapeHtml(suggestion.excerpt)}</div>

      <div class="suggestion-editor">
        <label>Code aanpassen</label>
        <select data-field="code">
          ${options.map(option => `<option value="${escapeAttr(option.value)}" ${option.value === suggestion.code ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>

        <label>Context / motivering</label>
        <textarea data-field="context" rows="3">${escapeHtml(suggestion.context || suggestion.reason || "")}</textarea>

        <label>Locatie</label>
        <input data-field="locatie" type="text" value="${escapeAttr(suggestion.locatie || `#page=${suggestion.page}`)}">
      </div>

      <div class="suggestion-actions">
        <button class="primary-btn" type="button" data-action="confirm" ${status === "bevestigd" ? "disabled" : ""}>Bevestig</button>
        <button class="secondary-btn" type="button" data-action="save-edit">Bewaar aanpassing</button>
        <button class="secondary-btn" type="button" data-action="reject" ${status === "verworpen" ? "disabled" : ""}>Verwerp</button>
      </div>
    </article>
  `;
}

function bindSuggestionEvents() {
  $$("[data-suggestion-id]").forEach(card => {
    card.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = card.dataset.suggestionId;
      const suggestion = Ariadne.state.pdfScan.suggestions.find(item => item.id === id);
      if (!suggestion) return;

      if (button.dataset.action === "save-edit") {
        saveSuggestionEdits(card, suggestion);
      }
      if (button.dataset.action === "reject") {
        rejectSuggestion(card, suggestion);
      }
      if (button.dataset.action === "confirm") {
        confirmSuggestion(card, suggestion);
      }
    });
  });
}

function saveSuggestionEdits(card, suggestion) {
  const edited = readSuggestionEditFields(card, suggestion);
  Object.assign(suggestion, edited, { status: ["bevestigd", "verworpen"].includes(suggestion.status) ? suggestion.status : "aangepast" });
  persistSuggestionReview(suggestion);
  const results = $("#scanResults");
  if (results) results.innerHTML = renderPdfSuggestions();
  bindSuggestionEvents();
}

function rejectSuggestion(card, suggestion) {
  const edited = readSuggestionEditFields(card, suggestion);
  Object.assign(suggestion, edited, { status: "verworpen" });
  persistSuggestionReview(suggestion);
  const results = $("#scanResults");
  if (results) results.innerHTML = renderPdfSuggestions();
  bindSuggestionEvents();
}

function confirmSuggestion(card, suggestion) {
  const edited = readSuggestionEditFields(card, suggestion);
  Object.assign(suggestion, edited, { status: "bevestigd" });
  const lesson = Ariadne.data.lessons.find(item => item.id === suggestion.targetLessonId);

  if (!lesson) {
    setPdfStatus("Kies eerst een les waaraan Ariadne de bevestigde suggestie mag koppelen.", true);
    return;
  }

  addConfirmedLinkToLesson(lesson, suggestion, { persist: true });
  persistSuggestionReview(suggestion);
  setPdfStatus(`Bevestigd: ${suggestion.code} is toegevoegd aan ${lesson.titel}.`);
  render();
}

function readSuggestionEditFields(card, suggestion) {
  const code = card.querySelector('[data-field="code"]')?.value || suggestion.code;
  const context = card.querySelector('[data-field="context"]')?.value.trim() || suggestion.context || suggestion.reason || "";
  const locatie = card.querySelector('[data-field="locatie"]')?.value.trim() || suggestion.locatie || `#page=${suggestion.page}`;
  const label = suggestion.type === "lpd"
    ? getCurrentLpds().find(lpd => lpd.code === code)?.titel || suggestion.label
    : getBlockLabel(code);

  return { code, label, context, locatie };
}

function persistSuggestionReview(suggestion) {
  Ariadne.state.v2.suggestionReviews[suggestion.id] = {
    status: suggestion.status,
    code: suggestion.code,
    label: suggestion.label,
    context: suggestion.context,
    locatie: suggestion.locatie,
    targetLessonId: suggestion.targetLessonId,
    updatedAt: new Date().toISOString()
  };
  saveV2Storage();
}

function addConfirmedLinkToLesson(lesson, suggestion, options = { persist: true }) {
  const field = suggestion.type === "lpd" ? "lpds" : "bouwstenen";
  const existing = lesson[field].find(link => link.sourceId === suggestion.id || (link.code === suggestion.code && link.locatie === suggestion.locatie));
  const link = {
    id: `${lesson.id}:${field}:${suggestion.code}:${hashString(`${suggestion.id}:${suggestion.locatie}`)}`,
    type: suggestion.type,
    code: suggestion.code,
    context: suggestion.context || suggestion.reason || "PDF/AI-suggestie bevestigd door gebruiker.",
    locatie: suggestion.locatie || `#page=${suggestion.page || ""}`,
    status: "bevestigd",
    sourceId: suggestion.id,
    source: {
      type: "pdf-ai",
      label: "PDF/AI, bevestigd",
      fileName: suggestion.fileName || Ariadne.state.pdfScan.fileName || "",
      page: suggestion.page || null,
      confidence: suggestion.confidence || ""
    },
    confirmedAt: suggestion.confirmedAt || new Date().toISOString()
  };

  if (existing) {
    Object.assign(existing, link);
  } else {
    lesson[field].push(link);
  }

  if (options.persist) {
    const stored = {
      ...link,
      lessonId: lesson.id
    };
    Ariadne.state.v2.confirmedLinks = Ariadne.state.v2.confirmedLinks.filter(item => item.id !== stored.id);
    Ariadne.state.v2.confirmedLinks.push(stored);
    saveV2Storage();
  }
}

async function handlePdfScan() {
  const input = $("#pdfInput");

  if (!input?.files || !input.files[0]) {
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

    const suggestions = suggestPdfLinks(pages, file.name).map(mergeStoredSuggestionReview);

    Ariadne.state.pdfScan = {
      fileName: file.name,
      status: `${file.name}: ${pages.length} pagina’s gelezen · ${suggestions.length} suggestie(s) gevonden.`,
      pages,
      suggestions,
      targetLessonId: $("#pdfTargetLesson")?.value || Ariadne.state.pdfScan.targetLessonId
    };

    setPdfStatus(Ariadne.state.pdfScan.status);
    const results = $("#scanResults");
    if (results) results.innerHTML = renderPdfSuggestions();
    bindSuggestionEvents();
  } catch (error) {
    console.error(error);
    setPdfStatus(`PDF-scan mislukt: ${error.message}`, true);
  }
}

function setPdfStatus(message, isError = false) {
  const status = $("#scanStatus");
  if (status) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }
  Ariadne.state.pdfScan.status = message;
}

function suggestPdfLinks(pages, fileName = "") {
  const lpdSuggestions = suggestLpdLinksFromPdf(pages, fileName);
  const blockSuggestions = suggestBlockLinksFromPdf(pages, fileName);

  return [...lpdSuggestions, ...blockSuggestions]
    .sort((a, b) => {
      const pageDiff = a.page - b.page;
      if (pageDiff !== 0) return pageDiff;
      return confidenceScore(b.confidence) - confidenceScore(a.confidence);
    })
    .slice(0, 80);
}

function suggestLpdLinksFromPdf(pages, fileName = "") {
  const lpds = getCurrentLpds();
  if (!lpds.length) return [];

  return pages.flatMap(page => {
    const pageText = normalizeText(page.text);
    return lpds.map(lpd => {
      const terms = buildLpdKeywords(lpd);
      const score = countKeywordHits(pageText, terms);
      if (score < 2) return null;

      const excerpt = makeExcerpt(page.text, terms);
      return makeSuggestion({
        fileName,
        page: page.page,
        type: "lpd",
        typeLabel: "mogelijke LPD-koppeling",
        code: lpd.code,
        label: lpd.titel,
        confidence: score >= 5 ? "hoog" : score >= 3 ? "middelmatig" : "laag",
        reason: `Ariadne vond ${score} inhoudelijke overeenkomst(en) met deze LPD-set.`,
        excerpt,
        terms
      });
    }).filter(Boolean);
  });
}

function suggestBlockLinksFromPdf(pages, fileName = "") {
  return pages.flatMap(page => {
    const pageText = normalizeText(page.text);
    return Ariadne.data.bouwstenen.map(block => {
      const terms = buildBlockKeywords(block);
      const score = countKeywordHits(pageText, terms);
      if (score < 2) return null;

      const excerpt = makeExcerpt(page.text, terms);
      return makeSuggestion({
        fileName,
        page: page.page,
        type: "bouwsteen",
        typeLabel: "mogelijke bouwsteenkoppeling",
        code: block.code,
        label: block.label,
        confidence: score >= 5 ? "hoog" : score >= 3 ? "middelmatig" : "laag",
        reason: `Ariadne vond ${score} aanwijzing(en) voor deze bouwsteen.`,
        excerpt,
        terms
      });
    }).filter(Boolean);
  });
}

function makeSuggestion(data) {
  const targetLessonId = Ariadne.state.pdfScan.targetLessonId || getFilteredLessons()[0]?.id || Ariadne.data.lessons[0]?.id || "";
  const base = `${data.fileName}:${data.page}:${data.type}:${data.code}:${data.excerpt}`;
  return {
    ...data,
    id: `pdfai:${hashString(base)}`,
    source: "pdf-ai",
    status: "suggestie",
    context: data.reason,
    locatie: `#page=${data.page}`,
    targetLessonId,
    createdAt: new Date().toISOString()
  };
}

function mergeStoredSuggestionReview(suggestion) {
  const stored = Ariadne.state.v2.suggestionReviews[suggestion.id];
  if (!stored) return suggestion;
  return {
    ...suggestion,
    ...stored,
    status: stored.status || suggestion.status
  };
}

function buildLpdKeywords(lpd) {
  return buildKeywordSet([
    lpd.code,
    lpd.titel,
    lpd.kern,
    lpd.omschrijving,
    lpd.categorie,
    lpd.domein,
    lpd.beheersingsniveau,
    lpd.officieleFormulering,
    lpd.vakken,
    lpd.zoektermen,
    lpd.afbakening,
    lpd.subdoelen,
    lpd.teltSterkMeeAls,
    lpd.teltOndersteunendMeeAls,
    lpd.teltNietMeeAls,
    lpd.opvolging
  ]);
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
    "latijnse", "griekse", "passende", "relevante", "waar", "over", "meer", "niet", "wel"
  ]);

  return [...new Set(flattenKeywordValues(values)
    .flatMap(value => normalizeText(value).split(/[^a-z0-9à-ÿ]+/i))
    .map(term => term.trim())
    .filter(term => term.length >= 4 && !stopwords.has(term))
  )];
}

function flattenKeywordValues(values) {
  const output = [];

  const visit = value => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      Object.values(value).forEach(visit);
      return;
    }
    output.push(String(value));
  };

  visit(values);
  return output;
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

function formatSuggestionStatus(status) {
  const labels = {
    suggestie: "PDF/AI-suggestie — nog niet bevestigd",
    aangepast: "Aangepast — nog niet bevestigd",
    bevestigd: "Bevestigd — telt mee als metadata",
    verworpen: "Verworpen — telt niet mee"
  };
  return labels[status] || status;
}

function renderExport(lessons) {
  const content = $("#content");
  const dossier = buildV2Dossier(lessons);
  content.innerHTML = `
    <article class="export-card">
      <h3>Export van huidige selectie</h3>
      <p>
        V2 houdt bevestigde metadata, controlepunten en PDF/AI-suggesties gescheiden.
        JSON blijft het veilige bronformaat; CSV blijft voorlopig een controle- en plannerbestand.
      </p>
      <div class="export-actions">
        <button class="primary-btn" type="button" id="exportV2Json">Download v2-dossier JSON</button>
        <button class="secondary-btn" type="button" id="exportJson">Download lessen JSON</button>
        <button class="secondary-btn" type="button" id="exportCsv">Download leerstofoverzicht CSV</button>
        <button class="secondary-btn" type="button" id="exportPlanner">Download planner-CSV</button>
        <button class="secondary-btn" type="button" id="exportLearningLine">Download leerlijn-JSON</button>
      </div>
    </article>

    <article class="export-card">
      <h3>Voorbeeldstructuur v2</h3>
      <pre class="code-box">${escapeHtml(JSON.stringify(dossier.lessons[0] || {}, null, 2))}</pre>
    </article>
  `;

  $("#exportV2Json")?.addEventListener("click", () => downloadJson("ariadne-v2-dossier.json", dossier));
  $("#exportJson")?.addEventListener("click", () => downloadJson("ariadne-lessen-bevestigd.json", lessons.map(toPortableLesson)));
  $("#exportCsv")?.addEventListener("click", () => downloadCsv("ariadne-leerstofoverzicht.csv", buildLessonCsvRows(lessons)));
  $("#exportPlanner")?.addEventListener("click", () => downloadCsv("ariadne-planner.csv", buildPlannerRows(lessons)));
  $("#exportLearningLine")?.addEventListener("click", () => downloadJson("ariadne-leerlijn.json", buildLearningLineModel(lessons)));
}

function buildV2Dossier(lessons) {
  return {
    schemaVersion: "ariadne-v2-dossier-2026-04",
    generatedAt: new Date().toISOString(),
    selection: {
      site: Ariadne.state.site,
      theme: Ariadne.state.theme,
      lpd: Ariadne.state.lpd,
      block: Ariadne.state.block,
      search: Ariadne.state.search
    },
    rules: {
      confirmedMetadataCountsInCoverage: true,
      pdfAiSuggestionsRequireHumanConfirmation: true,
      smscExport: "not-enabled-until-format-is-clear"
    },
    lpdSets: buildExportedLpdSets(lessons),
    lessons: lessons.map(toV2LessonRecord),
    suggestionReviews: Object.values(Ariadne.state.v2.suggestionReviews),
    learningLine: buildLearningLineModel(lessons)
  };
}

function buildExportedLpdSets(lessons) {
  const setIds = new Set();

  if (Ariadne.state.site !== "all") {
    const selectedSite = Ariadne.data.sites.find(site => site.id === Ariadne.state.site);
    if (selectedSite?.lpdSet) setIds.add(selectedSite.lpdSet);
  }

  lessons.forEach(lesson => {
    const site = Ariadne.data.sites.find(item => item.id === lesson.site);
    if (site?.lpdSet) setIds.add(site.lpdSet);
  });

  return [...setIds]
    .map(id => Ariadne.data.lpdSets.get(id))
    .filter(Boolean);
}

function toV2LessonRecord(lesson) {
  const confirmedLpds = getConfirmedLinks(lesson, "lpds");
  const reviewLpds = getReviewLinks(lesson, "lpds");
  const confirmedBlocks = getConfirmedLinks(lesson, "bouwstenen");
  const reviewBlocks = getReviewLinks(lesson, "bouwstenen");

  return {
    id: lesson.id,
    site: lesson.site,
    title: lesson.titel,
    theme: lesson.thema || "",
    date: lesson.datum || "",
    durationMinutes: lesson.duur || null,
    source: {
      type: lesson.bronType || "html",
      url: lesson.bronUrl || ""
    },
    metadata: {
      lessonStatus: lesson.status || "te-controleren",
      confirmed: {
        contentTags: lesson.leerinhoud || [],
        workForms: lesson.werkvormen || [],
        lpds: confirmedLpds.map(stripRuntimeFields),
        buildingBlocks: confirmedBlocks.map(stripRuntimeFields),
        planner: lesson.planner || {}
      },
      needsReview: {
        lpds: reviewLpds.map(stripRuntimeFields),
        buildingBlocks: reviewBlocks.map(stripRuntimeFields)
      }
    },
    learningLine: buildLearningLineNode(lesson)
  };
}

function toPortableLesson(lesson) {
  return {
    ...lesson,
    lpds: getConfirmedLinks(lesson, "lpds").map(stripRuntimeFields),
    bouwstenen: getConfirmedLinks(lesson, "bouwstenen").map(stripRuntimeFields)
  };
}

function stripRuntimeFields(link) {
  const { type, ...rest } = link;
  return rest;
}

function buildLearningLineModel(lessons) {
  return {
    schemaVersion: "ariadne-learning-line-2026-04",
    generatedAt: new Date().toISOString(),
    nodes: lessons
      .map(buildLearningLineNode)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
  };
}

function buildLearningLineNode(lesson) {
  return {
    id: lesson.id,
    date: lesson.datum || "",
    site: lesson.site,
    siteName: getSiteName(lesson.site),
    theme: lesson.thema || "",
    title: lesson.titel || "",
    contentTags: lesson.leerinhoud || [],
    confirmedLpdCodes: getConfirmedLinks(lesson, "lpds").map(item => item.code),
    confirmedBuildingBlockCodes: getConfirmedLinks(lesson, "bouwstenen").map(item => item.code),
    reviewCounts: {
      lpds: getReviewLinks(lesson, "lpds").length,
      buildingBlocks: getReviewLinks(lesson, "bouwstenen").length
    },
    planner: {
      title: lesson.planner?.titel || lesson.titel || "",
      description: lesson.planner?.beschrijving || "",
      material: lesson.planner?.materiaal || []
    }
  };
}

function lessonsForSite(siteId) {
  if (siteId === "all") return Ariadne.data.lessons;
  return Ariadne.data.lessons.filter(lesson => lesson.site === siteId);
}

function getFilteredLessons() {
  return Ariadne.data.lessons.filter(lesson => {
    if (Ariadne.state.site !== "all" && lesson.site !== Ariadne.state.site) return false;
    if (Ariadne.state.theme !== "all" && lesson.thema !== Ariadne.state.theme) return false;
    if (Ariadne.state.lpd !== "all" && !getConfirmedLinks(lesson, "lpds").some(item => item.code === Ariadne.state.lpd)) return false;
    if (Ariadne.state.block !== "all" && !getConfirmedLinks(lesson, "bouwstenen").some(item => item.code === Ariadne.state.block)) return false;

    if (Ariadne.state.search) {
      const haystack = [
        lesson.titel,
        lesson.thema,
        lesson.bronUrl,
        lesson.status,
        ...(lesson.leerinhoud || []),
        ...(lesson.werkvormen || []),
        ...(lesson.lpds || []).flatMap(item => [item.code, item.context, item.status, item.source?.label]),
        ...(lesson.bouwstenen || []).flatMap(item => [item.code, item.context, item.status, item.source?.label]),
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

  return [];
}

function splitLinksByReviewState(lesson, field) {
  return {
    confirmed: getConfirmedLinks(lesson, field),
    review: getReviewLinks(lesson, field)
  };
}

function getConfirmedLinks(lesson, field) {
  return (lesson[field] || []).filter(isConfirmedLink);
}

function getReviewLinks(lesson, field) {
  return (lesson[field] || []).filter(link => !isConfirmedLink(link));
}

function isConfirmedLink(link) {
  return link.status === "bevestigd" || link.confirmed === true || link.bevestigd === true;
}

function findLpdOccurrences(lessons, code) {
  return lessons.flatMap(lesson =>
    getConfirmedLinks(lesson, "lpds")
      .filter(link => link.code === code)
      .map(link => ({ lesson, link }))
  );
}

function findBlockOccurrences(lessons, code) {
  return lessons.flatMap(lesson =>
    getConfirmedLinks(lesson, "bouwstenen")
      .filter(link => link.code === code)
      .map(link => ({ lesson, link }))
  );
}

function findReviewOccurrences(lessons, field, code) {
  return lessons.flatMap(lesson =>
    getReviewLinks(lesson, field)
      .filter(link => link.code === code)
      .map(link => ({ lesson, link }))
  );
}

function calculateGaps(lessons) {
  const gaps = [];

  lessons.forEach(lesson => {
    const confirmedLpds = getConfirmedLinks(lesson, "lpds");
    const confirmedBlocks = getConfirmedLinks(lesson, "bouwstenen");
    const reviewLpds = getReviewLinks(lesson, "lpds");
    const reviewBlocks = getReviewLinks(lesson, "bouwstenen");

    if (!confirmedLpds.length) {
      gaps.push({
        titel: `${lesson.titel}: geen bevestigde LPD-metadata`,
        beschrijving: reviewLpds.length
          ? `${reviewLpds.length} LPD-koppeling(en) wachten nog op controle.`
          : "Deze les heeft nog geen bevestigde leerplandoelkoppelingen."
      });
    }

    if (!confirmedBlocks.length) {
      gaps.push({
        titel: `${lesson.titel}: geen bevestigde Surma-metadata`,
        beschrijving: reviewBlocks.length
          ? `${reviewBlocks.length} bouwsteenkoppeling(en) wachten nog op controle.`
          : "Deze les heeft nog geen bevestigde bouwsteenkoppelingen."
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
        titel: `${lesson.titel}: lesstatus ${lesson.status}`,
        beschrijving: "Controleer of de metadata van deze les volledig bevestigd mag worden."
      });
    }
  });

  const lpds = getCurrentLpds();
  lpds.forEach(lpd => {
    if (!findLpdOccurrences(lessons, lpd.code).length) {
      gaps.push({
        titel: `${lpd.code}: nog niet bevestigd aangeboden`,
        beschrijving: lpd.titel
      });
    }
  });

  return gaps;
}

function buildLessonCsvRows(lessons) {
  return [
    ["site", "thema", "les", "status", "duur", "leerinhoud", "werkvormen", "bevestigde_lpds", "lpds_te_controleren", "bevestigde_bouwstenen", "bouwstenen_te_controleren"],
    ...lessons.map(lesson => [
      getSiteName(lesson.site),
      lesson.thema || "",
      lesson.titel || "",
      lesson.status || "",
      lesson.duur || "",
      (lesson.leerinhoud || []).join(" | "),
      (lesson.werkvormen || []).join(" | "),
      getConfirmedLinks(lesson, "lpds").map(item => item.code).join(" | "),
      getReviewLinks(lesson, "lpds").map(item => item.code).join(" | "),
      getConfirmedLinks(lesson, "bouwstenen").map(item => getBlockLabel(item.code)).join(" | "),
      getReviewLinks(lesson, "bouwstenen").map(item => getBlockLabel(item.code)).join(" | ")
    ])
  ];
}

function buildPlannerRows(lessons) {
  return [
    ["datum", "vak", "titel", "beschrijving", "materiaal", "bron", "metadata_status", "bevestigde_lpds", "bevestigde_bouwstenen"],
    ...lessons.map(lesson => [
      lesson.datum || "",
      getSiteName(lesson.site),
      lesson.planner?.titel || lesson.titel || "",
      lesson.planner?.beschrijving || "",
      (lesson.planner?.materiaal || []).join(" | "),
      lesson.bronUrl || "",
      lesson.status || "",
      getConfirmedLinks(lesson, "lpds").map(item => item.code).join(" | "),
      getConfirmedLinks(lesson, "bouwstenen").map(item => item.code).join(" | ")
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
  if (container) container.innerHTML = $("#emptyState")?.innerHTML || "";
}

function hashString(value = "") {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
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
