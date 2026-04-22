/**
 * auth.js — Groenhove Latijn authenticatie
 * Google Identity Services (GSI) + Apps Script tokenverificatie
 * Alleen @groenhoveschool.be accounts krijgen toegang
 */

const AUTH_CONFIG = {
  clientId: '247782565692-60him09rermeq8u832vpuc3hsihm48ei.apps.googleusercontent.com',
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbwhh5IJNej_vQ7s-iCAFJXikwBPMBUWdUciKdMgTzDUKoBbkhXfH8NPrG_S_EH8iMGO/exec',
  allowedDomain: 'groenhoveschool.be',
  userKey: 'groenhove_auth_user',
  tokenExpiry: 'groenhove_auth_expiry',
  sessionHours: 8,
};

const GroenhoveAuth = {
  init({ onSuccess, onFail } = {}) {
    const failHandler = onFail || _defaultFail;

    if (_isSessionValid()) {
      const user = _getStoredUser();
      if (user) {
        _showWelcome(user);
        if (onSuccess) onSuccess(user);
        return;
      }
    }

    _renderLoginOverlay({
      onSuccess: (user) => {
        _showWelcome(user);
        if (onSuccess) onSuccess(user);
      },
      onFail: failHandler,
    });
  },

  getUser() {
    if (!_isSessionValid()) return null;
    return _getStoredUser();
  },

  logout() {
    localStorage.removeItem(AUTH_CONFIG.userKey);
    localStorage.removeItem(AUTH_CONFIG.tokenExpiry);
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    location.reload();
  },
};

function _isSessionValid() {
  const expiry = localStorage.getItem(AUTH_CONFIG.tokenExpiry);
  const user = localStorage.getItem(AUTH_CONFIG.userKey);
  if (!expiry || !user) return false;
  return Date.now() < parseInt(expiry, 10);
}

function _getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_CONFIG.userKey));
  } catch (_) {
    return null;
  }
}

function _storeSession(user) {
  const expiry = Date.now() + AUTH_CONFIG.sessionHours * 60 * 60 * 1000;
  localStorage.setItem(AUTH_CONFIG.userKey, JSON.stringify(user));
  localStorage.setItem(AUTH_CONFIG.tokenExpiry, String(expiry));
}

function _showWelcome(user) {
  let bar = document.getElementById('auth-welcome-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'auth-welcome-bar';
    bar.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      background: #006633;
      color: #f3f1ef;
      font-family: 'Noto Sans', sans-serif;
      font-size: 13px;
      padding: 6px 14px;
      border-radius: 0 0 0 8px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    document.body.appendChild(bar);
  }

  const naam = user.naam || user.email.split('@')[0];
  bar.innerHTML = `
    <span>👤 ${naam}</span>
    <button onclick="GroenhoveAuth.logout()" style="
      background: none;
      border: 1px solid #f3f1ef;
      color: #f3f1ef;
      border-radius: 4px;
      padding: 2px 8px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
    ">Uitloggen</button>
  `;
}

function _defaultFail(reason) {
  console.error('Auth mislukt:', reason);
}

function _renderLoginOverlay({ onSuccess, onFail }) {
  const bestaandOverlay = document.getElementById('auth-overlay');
  if (bestaandOverlay) bestaandOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: #f3f1ef;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    flex-direction: column;
    font-family: 'Noto Sans', sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.12);
      padding: 40px 48px;
      max-width: 400px;
      width: 90%;
      text-align: center;
    ">
      <div style="font-size: 40px; margin-bottom: 12px;">🏛️</div>
      <h2 style="
        font-family: 'Flanders Art Sans', 'Noto Sans', sans-serif;
        color: #006633;
        margin: 0 0 8px;
        font-size: 22px;
        font-weight: 700;
      ">Groenhove Latijn</h2>
      <p style="color: #555; font-size: 14px; margin: 0 0 28px; line-height: 1.5;">
        Log in met je <strong>@groenhoveschool.be</strong> account om verder te gaan.
      </p>
      <div id="auth-google-btn"></div>
      <p id="auth-error" style="
        color: #FF3B1D;
        font-size: 13px;
        margin: 16px 0 0;
        display: none;
        line-height: 1.4;
      "></p>
    </div>
    <p style="color: #999; font-size: 12px; margin-top: 20px;">
      Alleen toegankelijk voor leerlingen en leerkrachten van Groenhove
    </p>
  `;

  document.body.appendChild(overlay);

  const bestaandScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
  if (bestaandScript) {
    _initGSI({ onSuccess, onFail, overlay });
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.onload = () => _initGSI({ onSuccess, onFail, overlay });
  document.head.appendChild(script);
}

function _initGSI({ onSuccess, onFail, overlay }) {
  google.accounts.id.initialize({
    client_id: AUTH_CONFIG.clientId,
    callback: (response) => _handleCredential(response, { onSuccess, onFail, overlay }),
    auto_select: false,
    cancel_on_tap_outside: false,
    hosted_domain: AUTH_CONFIG.allowedDomain,
  });

  const knop = document.getElementById('auth-google-btn');
  if (!knop) return;

  knop.innerHTML = '';

  google.accounts.id.renderButton(knop, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: 280,
  });
}

async function _handleCredential(response, { onSuccess, onFail, overlay }) {
  const errorEl = document.getElementById('auth-error');
  if (errorEl) errorEl.style.display = 'none';

  try {
    const body = new URLSearchParams({
      action: 'verifyToken',
      token: response.credential,
    });

    const result = await fetch(AUTH_CONFIG.appsScriptUrl, {
      method: 'POST',
      body,
    });

    const data = await result.json();

    if (data.ok && data.email && data.email.endsWith('@' + AUTH_CONFIG.allowedDomain)) {
      const user = {
        email: data.email,
        naam: data.naam || '',
      };
      _storeSession(user);
      overlay.remove();
      onSuccess(user);
      return;
    }

    const reden = data.error || data.fout || 'Geen toegang met dit account.';
    if (errorEl) {
      errorEl.textContent = `⚠️ ${reden}`;
      errorEl.style.display = 'block';
    }
    onFail(reden);

  } catch (err) {
    if (errorEl) {
      errorEl.textContent = '⚠️ Verbindingsfout. Probeer opnieuw.';
      errorEl.style.display = 'block';
    }
    onFail(err);
  }
}
