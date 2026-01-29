// lib/api.js
"use strict";

const BASE_URL = "https://mail.haltman.io";

export function isLikelyApiKey(k) {
  return typeof k === "string" && /^[a-z0-9]{64}$/.test(k.trim());
}

function buildHeaders(apiKey, contentType) {
  const h = new Headers();
  h.set("X-API-Key", apiKey);
  if (contentType) h.set("Content-Type", contentType);
  return h;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message || data.code)) ||
      text ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function getDomains() {
  const res = await fetch(`${BASE_URL}/domains`, { method: "GET" });
  const data = await parseJsonOrThrow(res);
  if (!Array.isArray(data)) return [];
  return data.map(s => String(s).trim().toLowerCase()).filter(Boolean);
}

export async function listAliases(apiKey) {
  const res = await fetch(`${BASE_URL}/api/alias/list`, {
    method: "GET",
    headers: buildHeaders(apiKey)
  });
  return parseJsonOrThrow(res);
}

export async function createAlias(apiKey, aliasHandle, aliasDomain) {
  const body = new URLSearchParams();
  body.set("alias_handle", aliasHandle);
  body.set("alias_domain", aliasDomain);

  const res = await fetch(`${BASE_URL}/api/alias/create`, {
    method: "POST",
    headers: buildHeaders(apiKey, "application/x-www-form-urlencoded"),
    body
  });

  return parseJsonOrThrow(res);
}

export async function deleteAlias(apiKey, aliasEmail) {
  const body = new URLSearchParams();
  body.set("alias", aliasEmail);

  const res = await fetch(`${BASE_URL}/api/alias/delete`, {
    method: "POST",
    headers: buildHeaders(apiKey, "application/x-www-form-urlencoded"),
    body
  });

  return parseJsonOrThrow(res);
}
