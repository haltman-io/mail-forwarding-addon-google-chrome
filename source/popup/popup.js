/* global browser */
"use strict";

import {
    getApiKey,
    setApiKey,
    clearApiKey,
    getDomainsCache,
    setDomainsCache,
    getLastDomain,
    setLastDomain,
    clearLastDomain,
    getDefaultDomain,
    isLocked,
    getApiKeyEncPayload
} from "../lib/storage.js";

import { decryptString } from "../lib/crypto.js";

import { isLikelyApiKey } from "../lib/api.js";

/* ------------------------- DOM ------------------------- */

const els = {
    // views
    setup: document.getElementById("setup"),
    main: document.getElementById("main"),
    unlock: document.getElementById("unlock"),

    // setup
    apiKeyInput: document.getElementById("apiKeyInput"),
    btnSaveKey: document.getElementById("btnSaveKey"),
    setupErr: document.getElementById("setupErr"),

    // unlock
    unlockPassword: document.getElementById("unlockPassword"),
    btnUnlock: document.getElementById("btnUnlock"),
    unlockErr: document.getElementById("unlockErr"),

    // top actions
    btnOptions: document.getElementById("btnOptions"),
    btnRefresh: document.getElementById("btnRefresh"),
    btnLock: document.getElementById("btnLock"),

    // tabs
    tabCreate: document.getElementById("tabCreate"),
    tabList: document.getElementById("tabList"),
    viewCreate: document.getElementById("viewCreate"),
    viewList: document.getElementById("viewList"),

    // create
    handleInput: document.getElementById("handleInput"),
    domainSelect: document.getElementById("domainSelect"),
    btnCreate: document.getElementById("btnCreate"),
    btnGenRandom: document.getElementById("btnGenRandom"),
    createMsg: document.getElementById("createMsg"),

    // list
    searchInput: document.getElementById("searchInput"),
    list: document.getElementById("list"),
    count: document.getElementById("count"),
    btnLogout: document.getElementById("btnLogout"),

    // generic error
    appErr: document.getElementById("appErr")
};

let DOMAINS = [];
let ALIASES = [];

/* ------------------------- UI helpers ------------------------- */

function show(el) { if (el) el.classList.remove("hidden"); }
function hide(el) { if (el) el.classList.add("hidden"); }

function setErr(target, msg) {
    if (!target) return;
    if (!msg) { target.textContent = ""; hide(target); return; }
    target.textContent = String(msg);
    show(target);
}

function toast(msg) {
    if (!els.createMsg) return;
    if (!msg) { els.createMsg.textContent = ""; hide(els.createMsg); return; }
    els.createMsg.textContent = String(msg);
    show(els.createMsg);
    setTimeout(() => toast(""), 1600);
}

function normalize(s) { return (s || "").trim().toLowerCase(); }

function setActiveTab(which) {
    const isCreate = which === "create";

    els.tabCreate?.classList.toggle("active", isCreate);
    els.tabList?.classList.toggle("active", !isCreate);

    els.tabCreate?.setAttribute("aria-selected", String(isCreate));
    els.tabList?.setAttribute("aria-selected", String(!isCreate));

    if (isCreate) {
        show(els.viewCreate);
        hide(els.viewList);
    } else {
        hide(els.viewCreate);
        show(els.viewList);
        els.searchInput?.focus();
    }
}

function renderRoute(route) {
    // route: "setup" | "main" | "unlock"
    hide(els.setup);
    hide(els.main);
    hide(els.unlock);

    if (route === "setup") show(els.setup);
    if (route === "main") show(els.main);
    if (route === "unlock") show(els.unlock);
}

/* ------------------------- Background bridge ------------------------- */

async function bg(msg) {
    const res = await browser.runtime.sendMessage(msg);
    if (!res || res.ok !== true) {
        throw new Error((res && res.error) ? res.error : "Background error");
    }
    return res;
}

async function setSessionKeyInBg(apiKey) {
    await bg({ type: "MAM_SET_SESSION_KEY", apiKey });
}

async function clearSessionKeyInBg() {
    await bg({ type: "MAM_CLEAR_SESSION_KEY" });
}

/* ------------------------- Domains ------------------------- */

async function loadDomains() {
    // cache 24h via storage.local (domainsCache)
    const TTL = 24 * 60 * 60 * 1000;
    const cached = await getDomainsCache();

    if (cached && Array.isArray(cached.items) && typeof cached.ts === "number") {
        if (Date.now() - cached.ts < TTL) {
            DOMAINS = cached.items;
            return;
        }
    }

    // fetch from background (avoids CORS/headers/lock etc)
    const res = await bg({ type: "MAM_GET_DOMAINS" });
    const items = Array.isArray(res.items) ? res.items : [];
    DOMAINS = items.map(d => normalize(d)).filter(Boolean);

    await setDomainsCache(DOMAINS);
}

async function fillDomainSelect() {
    els.domainSelect.innerHTML = `<option value="" selected disabled>Select a domain</option>`;

    for (const d of DOMAINS) {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        els.domainSelect.appendChild(opt);
    }

    const preferred = normalize(await getDefaultDomain());
    const last = normalize(await getLastDomain());
    if (preferred && DOMAINS.includes(preferred)) {
        els.domainSelect.value = preferred;
    } else if (last && DOMAINS.includes(last)) {
        els.domainSelect.value = last;
    }
}

function isAllowedDomain(d) {
    if (!Array.isArray(DOMAINS) || DOMAINS.length === 0) return false;
    return DOMAINS.includes(d);
}

/* ------------------------- Aliases list ------------------------- */

function renderList(items) {
    els.list.innerHTML = "";

    const arr = Array.isArray(items) ? items : [];
    els.count.textContent = `${arr.length} item(s)`;

    if (arr.length === 0) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.style.padding = "8px 2px";
        empty.textContent = "No aliases found.";
        els.list.appendChild(empty);
        return;
    }

    for (const it of arr) {
        const address = it.address || "";
        const goto = it.goto || "";

        const row = document.createElement("div");
        row.className = "item";

        // === LEFT SIDE (ADDRESS) ===
        const left = document.createElement("div");
        left.className = "itemLeft";
        left.style.flex = "1";

        const addr = document.createElement("div");
        addr.className = "addr";
        addr.textContent = address;

        const gt = document.createElement("div");
        gt.className = "goto";
        gt.textContent = goto;

        left.appendChild(addr);
        left.appendChild(gt);

        // === ACTIONS WRAPPER (Right side) ===
        // Not strictly necessary with flex, but keeps them grouped
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.marginLeft = "10px";

        // === COPY BUTTON ===
        const btnCopy = document.createElement("button");
        btnCopy.className = "iconBtn small copyBtn"; // class for green border
        btnCopy.title = "Copy address";
        btnCopy.textContent = "📑";
        btnCopy.addEventListener("click", () => {
            navigator.clipboard.writeText(address).then(() => {
                const original = btnCopy.textContent;
                btnCopy.textContent = "✅";
                setTimeout(() => btnCopy.textContent = original, 1200);
            });
        });

        // === DELETE BUTTON ===
        const btnDel = document.createElement("button");
        btnDel.className = "iconBtn small danger deleteBtn"; // danger usually has red styles
        btnDel.title = "Delete alias";
        btnDel.textContent = "🗑️";
        btnDel.addEventListener("click", async () => {
            // confirm logic...
            if (!confirm(`Delete ${address}?`)) return;
            try {
                setErr(els.appErr, "");
                await bg({ type: "MAM_DELETE_ALIAS", address });
                toast("Deleted.");
                await refreshAliases();
            } catch (e) {
                setErr(els.appErr, e.message || "Delete failed.");
            }
        });

        actions.appendChild(btnCopy);
        actions.appendChild(btnDel);

        row.appendChild(left);
        row.appendChild(actions);
        els.list.appendChild(row);
    }
}

function applySearch() {
    const q = normalize(els.searchInput.value);
    if (!q) return renderList(ALIASES);

    const filtered = ALIASES.filter(it => {
        const a = normalize(it.address);
        const g = normalize(it.goto);
        return a.includes(q) || g.includes(q);
    });

    renderList(filtered);
}

async function refreshAliases() {
    const res = await bg({ type: "MAM_LIST_ALIASES" });
    const data = Array.isArray(res.items) ? res.items : [];
    ALIASES = data;
    applySearch();
}

/* ------------------------- Routing / state ------------------------- */

async function hasLockConfigured() {
    const payload = await getApiKeyEncPayload();
    return Boolean(payload);
}

async function decideInitialRoute() {
    const encPayload = await getApiKeyEncPayload();
    const apiKeyPlain = normalize(await getApiKey());

    // nada configurado -> setup
    if (!encPayload && !apiKeyPlain) return "setup";

    // lock configured -> always open main (unlock only when user clicks the padlock)
    if (encPayload) return "main";

    // legacy mode: valid plaintext key -> main, otherwise setup
    if (!isLikelyApiKey(apiKeyPlain)) return "setup";
    return "main";
}

/* ------------------------- Actions ------------------------- */

async function doRefreshAll() {
    setErr(els.appErr, "");
    await loadDomains();
    await fillDomainSelect();
    await refreshAliases();
}

/* ------------------------- Bootstrap ------------------------- */

async function bootstrap() {
    // binds (once)

    els.btnOptions?.addEventListener("click", () => browser.runtime.openOptionsPage());

    els.btnRefresh?.addEventListener("click", async () => {
        try {
            await doRefreshAll();
            toast("Updated.");
        } catch (e) {
            setErr(els.appErr, e.message || "Refresh failed.");
        }
    });

    els.tabCreate?.addEventListener("click", () => setActiveTab("create"));
    els.tabList?.addEventListener("click", () => setActiveTab("list"));

    els.searchInput?.addEventListener("input", applySearch);

    // persist dropdown lastDomain
    els.domainSelect?.addEventListener("change", async () => {
        const v = normalize(els.domainSelect.value);
        if (v) await setLastDomain(v);
    });

    // padlock only appears if lock is configured (payload exists)
    const lockConfigured = await hasLockConfigured();
    if (lockConfigured) show(els.btnLock);
    else hide(els.btnLock);

    els.btnLock?.addEventListener("click", async () => {
        // if lock is already configured, clicking opens the unlock panel
        renderRoute("unlock");
        setErr(els.unlockErr, "");
        els.unlockPassword.value = "";
        els.unlockPassword.focus();
    });

    // unlock
    els.btnUnlock?.addEventListener("click", async () => {
        try {
            setErr(els.unlockErr, "");
            const pass = els.unlockPassword.value || "";
            if (pass.length < 6) throw new Error("Password too short.");

            const payload = await getApiKeyEncPayload();
            if (!payload) throw new Error("Missing encrypted key payload.");

            const apiKey = normalize(await decryptString(payload, pass));
            if (!isLikelyApiKey(apiKey)) throw new Error("Invalid API-Key after decrypt.");

            // set session and "unlock" the storage state (if you want a permanent lock, remove setLocked(false))
            await setSessionKeyInBg(apiKey);

            els.unlockPassword.value = "";
            renderRoute("main");
            setActiveTab("create");

            await doRefreshAll();
            toast("Unlocked.");
        } catch (e) {
            setErr(els.unlockErr, e.message || "Unlock failed.");
        }
    });

    // setup save
    els.btnSaveKey?.addEventListener("click", async () => {
        try {
            setErr(els.setupErr, "");
            const k = normalize(els.apiKeyInput.value);

            if (!isLikelyApiKey(k)) {
                throw new Error("Invalid API-Key. Expected: 64 chars (a-z0-9).");
            }

            await setApiKey(k);
            els.apiKeyInput.value = "";

            renderRoute("main");
            setActiveTab("create");

            await doRefreshAll();
        } catch (e) {
            setErr(els.setupErr, e.message || "Failed to save API-Key.");
        }
    });

    // create alias (always via background -> works with lock/session)
    els.btnCreate?.addEventListener("click", async () => {
        try {
            setErr(els.appErr, "");

            const handle = normalize(els.handleInput.value);
            const domain = normalize(els.domainSelect.value);

            if (!handle || !domain) throw new Error("Enter handle and domain.");
            if (!isAllowedDomain(domain)) throw new Error("Domain not allowed. Use the list.");
            if (!DOMAINS.length) throw new Error("Domains not loaded. Click refresh.");

            await bg({ type: "MAM_CREATE_ALIAS", handle, domain });

            els.handleInput.value = "";
            toast("Created.");
            await refreshAliases();
            setActiveTab("list");
        } catch (e) {
            setErr(els.appErr, e.message || "Create failed.");
        }
    });

    // generate random (via background)
    els.btnGenRandom?.addEventListener("click", async () => {
        try {
            setErr(els.appErr, "");
            const res = await bg({ type: "MAM_GENERATE_RANDOM_ALIAS" });

            // if the background returns "email"
            if (res.email) {
                toast(`Copied: ${res.email}`);
            } else {
                toast("Generated.");
            }

            await refreshAliases();
            setActiveTab("list");
        } catch (e) {
            setErr(els.appErr, e.message || "Failed to generate alias.");
        }
    });

    // logout
    els.btnLogout?.addEventListener("click", async () => {
        await clearSessionKeyInBg();
        await clearApiKey();
        await clearLastDomain();
        ALIASES = [];
        renderList([]);
        renderRoute("setup");
    });

    // initial route
    const route = await decideInitialRoute();
    renderRoute(route);

    // if entered main, load data
    if (route === "main") {
        setActiveTab("create");
        try {
            await doRefreshAll();
        } catch (e) {
            setErr(els.appErr, e.message || "Failed to load data.");
        }
    }

    // if entered setup, focus input
    if (route === "setup") {
        els.apiKeyInput?.focus();
    }
}

bootstrap();
