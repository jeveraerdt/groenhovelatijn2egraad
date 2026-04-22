/**
 * auth.js — Groenhove Latijn
 * Universele authenticatie + logging voor alle les-pagina's.
 * Voeg toe aan elke les-pagina: <script src="../../../js/auth.js"></script>
 * Pas het src-pad aan naargelang de diepte van de pagina.
 */

const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwhh5IJNej_vQ7s-iCAFJXikwBPMBUWdUciKdMgTzDUKoBbkhXfH8NPrG_S_EH8iMGO/exec';

// ── LEERLINGPROFIEL (opgeslagen in sessionStorage) ────────────
let GL_gebruiker = null;

function GL_laadGebruiker() {
  const opgeslagen = sessionStorage.getItem('gl_gebruiker');
  if (opgeslagen) {
    GL_gebruiker = JSON.parse(opgeslagen);
    GL_toonProfiel();
    return true;
  }
  return false;
}

function GL_slaGebruikerOp(data) {
  GL_gebruiker = data;
  sessionStorage.setItem('gl_gebruiker', JSON.stringify(data));
  GL_toonProfiel();
}

function GL_uitloggen() {
  sessionStorage.removeItem('gl_gebruiker');
  GL_gebruiker = null;
  GL_toonLoginKnop();
}

// ── TOOLBAR-INJECTIE ──────────────────────────────────────────
// Voegt het gebruikersblok toe aan de bestaande .toolbar-right
document.addEventListener('DOMContentLoaded', () => {
  // Wacht tot de toolbar bestaat
  const toolbarRight = document.querySelector('.toolbar-right');
  if (!toolbarRight) return;

  // Maak het gebruikersblok aan
  const blok = document.createElement('div');
  blok.id = 'gl-auth-blok';
  blok.style.cssText = 'display:flex;align-items:center;gap:.5rem;';
  toolbarRight.prepend(blok);

  // Controleer of er al een gebruiker is
  if (!GL_laadGebruiker()) {
    GL_toonLoginKnop();
  }
});

function GL_toonLoginKnop() {
  const blok = document.getElementById('gl-auth-blok');
  if (!blok) return;
  blok.innerHTML = `
    <button onclick="GL_login()" style="
      font-family:var(--fb,sans-serif);
      font-size:.82rem;font-weight:700;
      background:#006633;color:white;
      border:none;border-radius:20px;
      padding:.32rem .9rem;cursor:pointer;
      display:inline-flex;align-items:center;gap:.4rem;
    ">
      <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="9" cy="6" r="3"/><path d="M3 17c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
      </svg>
      Aanmelden
    </button>
  `;
}

function GL_toonProfiel() {
  const blok = document.getElementById('gl-auth-blok');
  if (!blok || !GL_gebruiker) return;
  const initialen = GL_gebruiker.naam
    .split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  blok.innerHTML = `
    <div style="display:flex;align-items:center;gap:.5rem;">
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:#006633;color:white;
        display:flex;align-items:center;justify-content:center;
        font-size:.7rem;font-weight:700;flex-shrink:0;
        font-family:var(--fb,sans-serif);
      ">${initialen}</div>
      <span style="font-family:var(--fb,sans-serif);font-size:.82rem;color:var(--zwart,#010100);">
        ${GL_gebruiker.naam}
      </span>
      <button onclick="GL_uitloggen()" title="Afmelden" style="
        background:none;border:1px solid var(--rand,#ccc);
        border-radius:20px;padding:.2rem .55rem;
        font-size:.72rem;color:#666;cursor:pointer;
        font-family:var(--fb,sans-serif);
      ">↩</button>
    </div>
  `;
}

// ── LOGIN FLOW ────────────────────────────────────────────────
async function GL_login() {
  // Open Google-loginvenster via Apps Script
  const loginUrl = WEBAPP_URL + '?actie=login';
  const popup = window.open(loginUrl, 'gl_login',
    'width=500,height=600,left=200,top=100');

  // Luister op bericht van de popup (als die terugkeert)
  // Fallback: poll de Apps Script URL direct
  GL_pollLogin(popup);
}

async function GL_pollLogin(popup) {
  // Apps Script stuurt de gebruikersdata terug als GET-response
  // We vragen het direct op via fetch (de gebruiker is al ingelogd op chromebook)
  const blok = document.getElementById('gl-auth-blok');
  if (blok) {
    blok.innerHTML = `<span style="font-size:.8rem;color:#666;font-family:var(--fb,sans-serif);">Aanmelden…</span>`;
  }

  try {
    const res  = await fetch(WEBAPP_URL + '?actie=login', { redirect: 'follow' });
    const data = await res.json();

    if (popup && !popup.closed) popup.close();

    if (data.ok) {
      GL_slaGebruikerOp({ naam: data.naam, email: data.email });
    } else {
      GL_toonFout(data.fout || 'Aanmelden mislukt. Gebruik je schoolaccount.');
    }
  } catch (e) {
    if (popup && !popup.closed) popup.close();
    GL_toonFout('Verbindingsfout. Probeer opnieuw.');
  }
}

function GL_toonFout(bericht) {
  const blok = document.getElementById('gl-auth-blok');
  if (!blok) return;
  blok.innerHTML = `
    <span style="font-size:.78rem;color:#c00;font-family:var(--fb,sans-serif);">
      ⚠ ${bericht}
    </span>
    <button onclick="GL_toonLoginKnop()" style="
      font-size:.75rem;background:none;border:none;
      color:#666;cursor:pointer;text-decoration:underline;
    ">Opnieuw</button>
  `;
}

// ── LOGGING ───────────────────────────────────────────────────
/**
 * Roep deze functie aan vanuit de les-pagina na elke AI-feedbackcall.
 *
 * GL_log({
 *   les:      'Thema 3 Les 1 — Wagenrennen',
 *   vraagId:  'o-v1',
 *   vraag:    'Wat stel jij je voor bij een Romeins circus?',
 *   antwoord: tekst,
 *   feedback: aiFeedback
 * });
 */
async function GL_log(data) {
  if (!GL_gebruiker) return; // niet ingelogd → niet loggen

  const payload = {
    actie:    'log',
    naam:     GL_gebruiker.naam,
    email:    GL_gebruiker.email,
    les:      data.les      || document.title || 'Onbekend',
    vraagId:  data.vraagId  || '?',
    vraag:    data.vraag    || '?',
    antwoord: data.antwoord || '',
    feedback: data.feedback || ''
  };

  try {
    await fetch(WEBAPP_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
  } catch (e) {
    // stil falen — logging is niet kritiek voor de leerling
    console.warn('GL_log: logging mislukt', e);
  }
}
