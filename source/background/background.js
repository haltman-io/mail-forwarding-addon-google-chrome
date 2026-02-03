/* global browser */
"use strict";

importScripts("../lib/browser-polyfill.js");

let SESSION_API_KEY = "";

function setSessionKey(k) { SESSION_API_KEY = (k || "").trim().toLowerCase(); }
function clearSessionKey() { SESSION_API_KEY = ""; }

async function isLockedStorage() {
    const res = await browser.storage.local.get("locked");
    return Boolean(res.locked);
}

async function getApiKeyForOps() {
    const locked = await isLockedStorage();
    if (locked) {
        if (!SESSION_API_KEY) throw new Error("Locked. Open the extension and unlock first.");
        return SESSION_API_KEY;
    }

    // legacy mode (no password): read from storage
    const res = await browser.storage.local.get("apiKey");
    const k = (res.apiKey || "").trim().toLowerCase();
    if (!k) throw new Error("API-Key not set.");
    return k;
}

const BASE_URL = "https://mail.haltman.io";
const DICTIONARY_URL = browser.runtime.getURL("data/dictionary.json");
const KEY_API_KEY = "apiKey";


// ---------- utils ----------
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeWord(s) {
    // your API does NOT support "-", so keep only [a-z0-9]
    return String(s || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""); // <-- also removes "-"
}

async function getApiKey() {
    const res = await browser.storage.local.get(KEY_API_KEY);
    return (res[KEY_API_KEY] || "").trim().toLowerCase();
}

async function fetchJson(url, init) {
    const res = await fetch(url, init);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { }

    if (!res.ok) {
        const msg = (data && (data.error || data.message || data.code)) || text || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}

async function getDictionary() {
    const data = await fetchJson(DICTIONARY_URL);
    if (!Array.isArray(data)) throw new Error("dictionary.json must be an array of strings.");

    const words = data.map(normalizeWord).filter(Boolean);
    if (words.length < 2) throw new Error("dictionary.json needs at least 2 valid words.");

    return words;
}

async function getDomains() {
    const data = await fetchJson(`${BASE_URL}/domains`, { method: "GET" });
    if (!Array.isArray(data)) throw new Error("Invalid /domains response.");
    return data.map(d => String(d).trim().toLowerCase()).filter(Boolean);
}

async function copyToClipboardBackground(text) {
    try {
        if (!globalThis.navigator?.clipboard?.writeText) return false;
        await globalThis.navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}


async function createAlias(apiKey, aliasHandle, aliasDomain) {
    const body = new URLSearchParams();
    body.set("alias_handle", aliasHandle);
    body.set("alias_domain", aliasDomain);

    const res = await fetch(`${BASE_URL}/api/alias/create`, {
        method: "POST",
        headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { }

    if (!res.ok) {
        const msg = (data && (data.error || data.message || data.code)) || text || `HTTP ${res.status}`;
        throw new Error(msg);
    }

    return data;
}

async function deleteAlias(apiKey, aliasEmail) {
  const body = new URLSearchParams();
  body.set("alias", aliasEmail);

  const res = await fetch(`${BASE_URL}/api/alias/delete`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg = (data && (data.error || data.message || data.code)) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function notify(title, message) {
    try {
        await browser.notifications.create({
            type: "basic",
            iconUrl: browser.runtime.getURL("icons/icon-96.png"),
            title,
            message
        });
    } catch { }
}

// Context menus disabled for Chrome build.

async function listAliasesBg(apiKey) {
    const res = await fetch(`${BASE_URL}/api/alias/list`, {
        method: "GET",
        headers: { "X-API-Key": apiKey }
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { }

    if (!res.ok) {
        const msg = (data && (data.error || data.message || data.code)) || text || `HTTP ${res.status}`;
        throw new Error(msg);
    }

    return data; // array [{address,goto},...]
}

async function generateRandomAliasEmail(apiKey) {
    const [words, domains] = await Promise.all([getDictionary(), getDomains()]);
    if (!domains.length) throw new Error("No domains available from /domains.");

    const w1 = pickRandom(words);
    let w2 = pickRandom(words);
    if (words.length > 1) {
        let guard = 0;
        while (w2 === w1 && guard++ < 10) w2 = pickRandom(words);
    }

    const handle = `${w1}.${w2}`; // ONLY "."
    const domain = pickRandom(domains);

    const created = await createAlias(apiKey, handle, domain);
    return (created && (created.alias || created.address)) || `${handle}@${domain}`;
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        if (!msg || !msg.type) {
            return { ok: false, error: "Invalid message" };
        }

        // ---------- session control ----------
        if (msg.type === "MAM_SET_SESSION_KEY") {
            setSessionKey(msg.apiKey);
            return { ok: true };
        }

        if (msg.type === "MAM_CLEAR_SESSION_KEY") {
            clearSessionKey();
            return { ok: true };
        }

        // ---------- operations (need key) ----------
        const apiKey = await getApiKeyForOps();

        if (msg.type === "MAM_GENERATE_RANDOM_ALIAS") {
            const email = await generateRandomAliasEmail(apiKey);
            return { ok: true, email };
        }

        if (msg.type === "MAM_LIST_ALIASES") {
            const items = await listAliasesBg(apiKey);
            return { ok: true, items: Array.isArray(items) ? items : [] };
        }

        if (msg.type === "MAM_GET_DOMAINS") {
            const items = await getDomains(); // already exists in the background
            return { ok: true, items };
        }

        if (msg.type === "MAM_CREATE_ALIAS") {
            const apiKey = await getApiKeyForOps();
            const handle = String(msg.handle || "").trim().toLowerCase();
            const domain = String(msg.domain || "").trim().toLowerCase();
            await createAlias(apiKey, handle, domain); // already exists in the background
            return { ok: true };
        }

        if (msg.type === "MAM_DELETE_ALIAS") {
            const apiKey = await getApiKeyForOps();
            const address = String(msg.address || "").trim().toLowerCase();
            await deleteAlias(apiKey, address); // must exist (or implement like createAlias)
            return { ok: true };
        }


        return { ok: false, error: "Unknown message type" };
    })().then(sendResponse).catch((e) => {
        sendResponse({ ok: false, error: e.message || String(e) });
    });
    return true;
});




