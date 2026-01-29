/* global browser */
"use strict";

import { encryptString, decryptString } from "../lib/crypto.js";
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  getDomainsCache,
  setDomainsCache,
  getUiMode,
  setUiMode,
  getDefaultDomain,
  setDefaultDomain,
  clearDefaultDomain,
  isLocked,
  setLocked,
  getApiKeyEncPayload,
  setApiKeyEncPayload,
  clearApiKeyEncPayload
} from "../lib/storage.js";

import { getDomains, isLikelyApiKey } from "../lib/api.js";

/* ---------------- DOM ---------------- */

const uiModeEl = document.getElementById("uiMode");
const elKey = document.getElementById("apiKey");
const elSave = document.getElementById("save");
const elClear = document.getElementById("clear");
const elMsg = document.getElementById("msg");
const elDefaultDomain = document.getElementById("defaultDomain");
const elDomainMsg = document.getElementById("domainMsg");
const elDomainErr = document.getElementById("domainErr");

const els = {
  lockPassword: document.getElementById("lockPassword"),
  lockPassword2: document.getElementById("lockPassword2"),
  btnEnableLock: document.getElementById("btnEnableLock"),
  btnLockNow: document.getElementById("btnLockNow"),
  disablePassword: document.getElementById("disablePassword"),
  btnDisableLock: document.getElementById("btnDisableLock"),
  secMsg: document.getElementById("secMsg"),
  secErr: document.getElementById("secErr")
};

function show(el){ el?.classList.remove("hidden"); }
function hide(el){ el?.classList.add("hidden"); }

function toast(el, msg, ms = 2000){
  if (!el) return;
  if (!msg) { el.textContent = ""; hide(el); return; }
  el.textContent = String(msg);
  show(el);
  setTimeout(() => toast(el, ""), ms);
}

function setErr(el, msg){
  if (!el) return;
  if (!msg) { el.textContent = ""; hide(el); return; }
  el.textContent = String(msg);
  show(el);
}

function normalizeDomain(v) {
  return String(v || "").trim().toLowerCase();
}

async function setSessionKeyInBg(apiKey){
  await browser.runtime.sendMessage({ type: "MAM_SET_SESSION_KEY", apiKey });
}
async function clearSessionKeyInBg(){
  await browser.runtime.sendMessage({ type: "MAM_CLEAR_SESSION_KEY" });
}

/* ---------------- UI Mode ---------------- */

async function initUiMode() {
  if (!uiModeEl) return;
  uiModeEl.value = await getUiMode();
  uiModeEl.addEventListener("change", async () => {
    await setUiMode(uiModeEl.value);
    toast(elMsg, "UI mode updated.");
  });
}

/* ---------------- Default Domain ---------------- */

function fillDefaultDomainSelect(domains) {
  if (!elDefaultDomain) return;
  elDefaultDomain.innerHTML = "";

  const optNone = document.createElement("option");
  optNone.value = "";
  optNone.textContent = "Use last selection";
  elDefaultDomain.appendChild(optNone);

  const unique = Array.from(new Set(domains));
  for (const d of unique) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    elDefaultDomain.appendChild(opt);
  }
}

async function loadDomainsForDefault() {
  try {
    const domains = await getDomains();
    if (Array.isArray(domains) && domains.length) {
      await setDomainsCache(domains);
      return domains;
    }
  } catch (e) {
    const cache = await getDomainsCache();
    if (cache && Array.isArray(cache.items) && cache.items.length) {
      return cache.items;
    }
    throw e;
  }

  const cache = await getDomainsCache();
  return (cache && Array.isArray(cache.items)) ? cache.items : [];
}

async function initDefaultDomain() {
  if (!elDefaultDomain) return;

  try {
    setErr(elDomainErr, "");
    const domains = await loadDomainsForDefault();
    fillDefaultDomainSelect(domains);

    const saved = normalizeDomain(await getDefaultDomain());
    if (saved && domains.includes(saved)) {
      elDefaultDomain.value = saved;
    } else {
      elDefaultDomain.value = "";
    }
  } catch (e) {
    setErr(elDomainErr, e.message || "Failed to load domains.");
  }

  elDefaultDomain.addEventListener("change", async () => {
    try {
      setErr(elDomainErr, "");
      const v = normalizeDomain(elDefaultDomain.value);
      if (!v) {
        await clearDefaultDomain();
        toast(elDomainMsg, "Default domain cleared.");
        return;
      }

      await setDefaultDomain(v);
      toast(elDomainMsg, "Default domain saved.");
    } catch (e) {
      setErr(elDomainErr, e.message || "Failed to save default domain.");
    }
  });
}

/* ---------------- API Key ---------------- */

async function initApiKeyBox() {
  const locked = await isLocked();
  elKey.value = locked ? "" : (String(await getApiKey() || ""));

  // if locked, make it clear: field is only for legacy mode
  elKey.placeholder = locked
    ? "Lock enabled - API-Key not stored in plaintext"
    : "64 characters (a-z0-9)";

  elSave.addEventListener("click", async () => {
    try {
      const lockedNow = await isLocked();
      if (lockedNow) {
        toast(elMsg, "Lock enabled: disable the lock before changing the key.");
        return;
      }

      const k = String(elKey.value || "").trim().toLowerCase();
      if (!k) return toast(elMsg, "API-Key is empty.");
      if (!isLikelyApiKey(k)) return toast(elMsg, "Invalid API-Key (expected 64 chars a-z0-9).");

      await setApiKey(k);
      await setSessionKeyInBg(k);
      toast(elMsg, "API-Key saved.");
    } catch (e) {
      toast(elMsg, e.message || "Failed to save.");
    }
  });

  elClear.addEventListener("click", async () => {
    await clearSessionKeyInBg();
    await clearApiKey();
    elKey.value = "";
    toast(elMsg, "Data removed.");
  });
}

/* ---------------- Security (Lock) ---------------- */

async function enableLockFlow() {
  try {
    setErr(els.secErr, "");

    const p1 = els.lockPassword.value || "";
    const p2 = els.lockPassword2.value || "";

    if (p1.length < 8) return setErr(els.secErr, "Password must be at least 8 characters.");
    if (p1 !== p2) return setErr(els.secErr, "Passwords do not match.");

    const apiKeyPlain = String(await getApiKey() || "").trim().toLowerCase();
    if (!apiKeyPlain) return setErr(els.secErr, "Set the API-Key before enabling the lock.");
    if (!isLikelyApiKey(apiKeyPlain)) return setErr(els.secErr, "Invalid API-Key in storage (legacy mode).");

    const payload = await encryptString(apiKeyPlain, p1);
    await setApiKeyEncPayload(payload);
    await setLocked(true);

    // remove plaintext
    await browser.storage.local.remove("apiKey");

    // keep session unlocked now (RAM)
    await setSessionKeyInBg(apiKeyPlain);

    els.lockPassword.value = "";
    els.lockPassword2.value = "";
    toast(els.secMsg, "Lock enabled. The key is no longer stored in plaintext.");
  } catch (e) {
    setErr(els.secErr, e.message || "Failed to enable lock.");
  }
}

async function lockNowFlow() {
  await clearSessionKeyInBg();
  toast(els.secMsg, "Session locked. Open the popup and unlock to proceed.");
}

async function disableLockFlow() {
  try {
    setErr(els.secErr, "");

    const pass = els.disablePassword.value || "";
    if (pass.length < 6) return setErr(els.secErr, "Password too short.");

    const payload = await getApiKeyEncPayload();
    if (!payload) return setErr(els.secErr, "No encrypted key found.");

    const apiKeyPlain = String(await decryptString(payload, pass)).trim().toLowerCase();
    if (!isLikelyApiKey(apiKeyPlain)) return setErr(els.secErr, "Incorrect password or invalid payload.");

    // revert to legacy mode (plaintext)
    await setApiKey(apiKeyPlain);
    await clearApiKeyEncPayload();
    await setLocked(false);

    await setSessionKeyInBg(apiKeyPlain);

    els.disablePassword.value = "";
    toast(els.secMsg, "Lock disabled. The API-Key is stored in plaintext in storage again.");
  } catch (e) {
    setErr(els.secErr, e.message || "Failed to disable lock.");
  }
}

async function initSecurity() {
  els.btnEnableLock.addEventListener("click", enableLockFlow);
  els.btnLockNow.addEventListener("click", lockNowFlow);
  els.btnDisableLock.addEventListener("click", disableLockFlow);
}

/* ---------------- boot ---------------- */

(async function init() {
  await initUiMode();
  await initApiKeyBox();
  await initDefaultDomain();
  await initSecurity();
})();
