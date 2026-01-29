"use strict";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function deriveAesKey(password, saltBuf, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuf, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptString(plainText, password, iterations = 310000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveAesKey(password, salt.buffer, iterations);

  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plainText)
  );

  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    kdfIter: iterations,
    kdfSaltB64: b64encode(salt.buffer),
    aes: "AES-256-GCM",
    aesIvB64: b64encode(iv.buffer),
    ctB64: b64encode(ct)
  };
}

export async function decryptString(payload, password) {
  const saltBuf = b64decode(payload.kdfSaltB64);
  const ivBuf = b64decode(payload.aesIvB64);
  const ctBuf = b64decode(payload.ctB64);

  const key = await deriveAesKey(password, saltBuf, payload.kdfIter);

  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBuf) },
    key,
    ctBuf
  );

  return dec.decode(pt);
}
