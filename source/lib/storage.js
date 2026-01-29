// lib/storage.js
/* global browser */
"use strict";

const KEY_API_KEY = "apiKey";
const KEY_DOMAINS_CACHE = "domainsCache";
const KEY_LAST_DOMAIN = "lastDomain";
const KEY_DEFAULT_DOMAIN = "defaultDomain";
const KEY_UI_MODE = "uiMode"; // "buttons" | "icon"
const KEY_LOCKED = "locked";
const KEY_API_KEY_ENC = "apiKeyEncPayload";


export async function getApiKey() {
  const res = await browser.storage.local.get(KEY_API_KEY);
  return res[KEY_API_KEY] || "";
}

export async function setApiKey(apiKey) {
  await browser.storage.local.set({ [KEY_API_KEY]: apiKey });
}

export async function clearApiKey() {
  await browser.storage.local.remove([KEY_API_KEY, KEY_API_KEY_ENC, KEY_LOCKED]);
}

export async function getDomainsCache() {
  const res = await browser.storage.local.get(KEY_DOMAINS_CACHE);
  return res[KEY_DOMAINS_CACHE] || null; // { ts:number, items:string[] }
}

export async function setDomainsCache(items) {
  await browser.storage.local.set({
    [KEY_DOMAINS_CACHE]: { ts: Date.now(), items }
  });
}

export async function clearDomainsCache() {
  await browser.storage.local.remove(KEY_DOMAINS_CACHE);
}

export async function getLastDomain() {
  const res = await browser.storage.local.get(KEY_LAST_DOMAIN);
  return res[KEY_LAST_DOMAIN] || "";
}

export async function setLastDomain(domain) {
  await browser.storage.local.set({ [KEY_LAST_DOMAIN]: domain });
}

export async function clearLastDomain() {
  await browser.storage.local.remove(KEY_LAST_DOMAIN);
}

export async function getDefaultDomain() {
  const res = await browser.storage.local.get(KEY_DEFAULT_DOMAIN);
  return res[KEY_DEFAULT_DOMAIN] || "";
}

export async function setDefaultDomain(domain) {
  await browser.storage.local.set({ [KEY_DEFAULT_DOMAIN]: domain });
}

export async function clearDefaultDomain() {
  await browser.storage.local.remove(KEY_DEFAULT_DOMAIN);
}

export async function getUiMode() {
  const res = await browser.storage.local.get(KEY_UI_MODE);
  return res[KEY_UI_MODE] || "icon"; // default: method 2
}

export async function setUiMode(mode) {
  await browser.storage.local.set({ [KEY_UI_MODE]: mode });
}

export async function isLocked() {
  const res = await browser.storage.local.get(KEY_LOCKED);
  return Boolean(res[KEY_LOCKED]);
}

export async function setLocked(v) {
  await browser.storage.local.set({ [KEY_LOCKED]: Boolean(v) });
}

export async function getApiKeyEncPayload() {
  const res = await browser.storage.local.get(KEY_API_KEY_ENC);
  return res[KEY_API_KEY_ENC] || null;
}

export async function setApiKeyEncPayload(payload) {
  await browser.storage.local.set({ [KEY_API_KEY_ENC]: payload });
}

export async function clearApiKeyEncPayload() {
  await browser.storage.local.remove(KEY_API_KEY_ENC);
}
