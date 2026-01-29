/* global chrome */
"use strict";

(function initBrowserPolyfill() {
  if (globalThis.browser) return;
  if (!globalThis.chrome) return;

  const wrapAsync = (fn, ctx) => (...args) => new Promise((resolve, reject) => {
    fn.call(ctx, ...args, (result) => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });

  const wrapAsyncVoid = (fn, ctx) => (...args) => new Promise((resolve, reject) => {
    fn.call(ctx, ...args, () => {
      const err = chrome.runtime && chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  const runtime = {
    getURL: chrome.runtime.getURL.bind(chrome.runtime),
    sendMessage: wrapAsync(chrome.runtime.sendMessage, chrome.runtime)
  };

  if (typeof chrome.runtime.openOptionsPage === "function") {
    runtime.openOptionsPage = wrapAsyncVoid(chrome.runtime.openOptionsPage, chrome.runtime);
  }
  if (chrome.runtime.onMessage) runtime.onMessage = chrome.runtime.onMessage;
  if (chrome.runtime.onInstalled) runtime.onInstalled = chrome.runtime.onInstalled;
  if (chrome.runtime.onStartup) runtime.onStartup = chrome.runtime.onStartup;

  const storage = {};
  if (chrome.storage?.local) {
    storage.local = {
      get: wrapAsync(chrome.storage.local.get, chrome.storage.local),
      set: wrapAsyncVoid(chrome.storage.local.set, chrome.storage.local),
      remove: wrapAsyncVoid(chrome.storage.local.remove, chrome.storage.local)
    };
  }
  if (chrome.storage?.onChanged) storage.onChanged = chrome.storage.onChanged;

  const browser = { runtime };
  if (Object.keys(storage).length) browser.storage = storage;

  if (chrome.notifications?.create) {
    browser.notifications = {
      create: wrapAsync(chrome.notifications.create, chrome.notifications)
    };
  }

  if (chrome.contextMenus?.create) {
    browser.contextMenus = {
      create: (...args) => chrome.contextMenus.create(...args),
      removeAll: wrapAsyncVoid(chrome.contextMenus.removeAll, chrome.contextMenus),
      onClicked: chrome.contextMenus.onClicked
    };
  }

  if (chrome.tabs?.sendMessage) {
    browser.tabs = {
      sendMessage: wrapAsync(chrome.tabs.sendMessage, chrome.tabs)
    };
  }

  globalThis.browser = browser;
})();
