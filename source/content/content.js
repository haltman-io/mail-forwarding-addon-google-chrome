/* global browser */
"use strict";

/**
 * Mail Alias Manager — Content UI (MV2)
 * Goal: UI 100% immune to the site's CSS.
 *
 * Strategy:
 * - Each input[type=email] gets a "host" (<span>) with Shadow DOM.
 * - The menu is rendered in a global "portal" with Shadow DOM + position:fixed,
 *   so it is not affected by overflow/transform from the site's layout.
 */

const ICON_URL = browser.runtime.getURL("icons/icon-96.png");
const KEY_UI_MODE = "uiMode"; // "buttons" | "icon"

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function isEmailInput(el) {
  return !!(el && el.tagName === "INPUT" && String(el.type || "").toLowerCase() === "email");
}

function setInputValue(input, value) {
  input.focus();
  input.value = value;

  // trigger events for frameworks (React/Vue/etc)
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function getUiMode() {
  const res = await browser.storage.local.get(KEY_UI_MODE);
  return res[KEY_UI_MODE] || "icon";
}

async function copyTextToClipboard(text) {
  const t = String(text ?? "");
  if (!t) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch { }

  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    const parent = document.body || document.documentElement;
    if (!parent) return false;
    parent.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return Boolean(ok);
  } catch {
    return false;
  }
}

/* ---------------- Global portal (fixed menu) ---------------- */

const Portal = (() => {
  let portalHost = null;
  let shadow = null;

  // menu state
  let open = false;
  let anchorEl = null;        // button/host that opened
  let targetInput = null;     // current input
  let lastRect = null;

  // elements in shadow
  let ui = null;

  function ensurePortal() {
    if (portalHost && shadow) return;

    portalHost = document.createElement("div");
    portalHost.setAttribute("data-mam-portal", "1");

    // important: insert at the top to reduce interference
    (document.documentElement || document.body).appendChild(portalHost);

    shadow = portalHost.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box !important; }

      @keyframes mamSlideUp {
        from { opacity: 0; transform: translateY(10px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .mam-layer{
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      }

      .mam-menu{
        overflow: hidden !important;
        pointer-events: auto !important;
        position: fixed !important;
        width: 340px !important;
        max-width: calc(100vw - 24px) !important;
        
        max-height: calc(50vh - 24px) !important;
        display: flex !important;
        flex-direction: column !important;

        /* Glassmorphism Dark Theme */
        background: rgba(22, 27, 34, 0.85) !important;
        backdrop-filter: blur(20px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
        
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        border-radius: 20px !important;
        box-shadow: 
          0 20px 50px -10px rgba(0,0,0,0.7),
          0 0 0 1px rgba(0,0,0,0.4) !important;
        
        padding: 16px !important;
        color: #f0f6fc !important;
        
        animation: mamSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        transform-origin: top center !important;
      }

      .mam-hidden{ display:none !important; }

      .mam-head{
        display:flex !important;
        align-items:center !important;
        justify-content: space-between !important;
        margin-bottom: 16px !important;
      }
      .mam-title{
        font-weight: 700 !important;
        font-size: 15px !important;
        letter-spacing: -0.01em !important;
        color: #fff !important;
        display: flex !important; 
        align-items: center !important;
        gap: 8px !important;
      }
      .mam-title::before {
        content: '';
        display: inline-block;
        width: 10px; height: 10px;
        background: #2f81f7;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(47, 129, 247, 0.4);
      }

      .mam-close{
        all: unset !important;
        cursor: pointer !important;
        width: 28px !important; height: 28px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 8px !important;
        color: #8b949e !important;
        transition: all 0.2s !important;
      }
      .mam-close:hover{ background: rgba(255,255,255,0.1) !important; color: #fff !important; }

      .mam-row{
        display:grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 12px !important;
      }

      .mam-btn{
        all: unset !important;
        display: inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        padding: 12px 16px !important;
        border-radius: 12px !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
        background: linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)) !important;
        color: #e8eef6 !important;
        cursor: pointer !important;
        user-select: none !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        line-height: 1.2 !important;
        text-align: center !important;
        transition: all 0.2s ease !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
      }
      .mam-btn:hover{ 
        background: linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03)) !important;
        border-color: rgba(255,255,255,0.2) !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important; 
      }
      .mam-btn:active{ transform: translateY(0) !important; }
      
      .mam-btn[data-act="gen"] {
        background: linear-gradient(135deg, #238636, #1a632a) !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        color: #fff !important;
        text-shadow: 0 1px 2px rgba(0,0,0,0.2) !important;
      }
      .mam-btn[data-act="gen"]:hover {
        background: linear-gradient(135deg, #2ea043, #238636) !important;
        box-shadow: 0 0 20px rgba(46, 160, 67, 0.4) !important;
      }

      .mam-muted{
        color: #8b949e !important;
        font-size: 13px !important;
        margin-top: 12px !important;
        min-height: 20px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        white-space: pre-wrap !important;
        opacity: 0.8 !important;
      }

      .mam-choose{
        margin-top: 16px !important;
        display: flex !important;
        flex-direction: column !important;
        min-height: 0 !important; 
        flex: 1 1 auto !important; /* expande */
      }


      .mam-input{
        all: unset !important;
        display: block !important;
        box-sizing: border-box !important;
        width: 100% !important;
        
        border-radius: 10px !important;
        border: 1px solid rgba(255,255,255,0.15) !important;
        background: rgba(0,0,0,0.3) !important;
        color: #fff !important;

        padding: 12px 12px !important;
        font-size: 13px !important;
        transition: border-color 0.2s !important;
      }
      .mam-input:focus {
        border-color: #58a6ff !important;
        box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.3) !important;
      }
      .mam-input::placeholder { color: rgba(255,255,255,0.4) !important; }


      .mam-list{
        margin-top: 8px !important;
        flex: 1 1 auto !important;
        overflow: auto !important;
        min-height: 120px !important;
        
        border-radius: 10px !important;
        /* Custom scrollbar if possible, but Firefox default is already decent */
        scrollbar-width: thin !important;
        scrollbar-color: rgba(255,255,255,0.2) transparent !important;
      }

      .mam-item{
        padding: 10px 12px !important;
        cursor: pointer !important;
        margin-bottom: 4px !important;
        border-radius: 8px !important;
        color: #e8eef6 !important;
        font-size: 13px !important;
        line-height: 1.4 !important;
        transition: background 0.15s !important;
      }
      .mam-item:hover{ background: rgba(255,255,255,0.1) !important; }
      
      .mam-item div:first-child {
        font-weight: 500 !important;
        color: #fff !important;
      }
      
      .mam-sub{
        color: #8b949e !important;
        font-size: 11px !important;
        margin-top: 2px !important;
      }
    `;

    const layer = document.createElement("div");
    layer.className = "mam-layer";
    layer.innerHTML = `
      <div class="mam-menu mam-hidden" role="dialog" aria-label="Mail Alias Manager">
        <div class="mam-head">
          <div class="mam-title">Mail Alias Manager</div>
          <button class="mam-close" type="button" title="Close">×</button>
        </div>

        <div class="mam-row">
          <button class="mam-btn" type="button" data-act="gen">Generate alias</button>
          <button class="mam-btn" type="button" data-act="choose">Choose alias</button>
        </div>

        <div class="mam-muted mam-status"></div>

        <div class="mam-choose mam-hidden">
          <input class="mam-input" type="text" placeholder="Search aliases..." />
          <div class="mam-list"></div>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(layer);

    // cache nodes
    ui = {
      layer,
      menu: layer.querySelector(".mam-menu"),
      close: layer.querySelector(".mam-close"),
      status: layer.querySelector(".mam-status"),
      chooseBox: layer.querySelector(".mam-choose"),
      search: layer.querySelector(".mam-choose .mam-input"),
      list: layer.querySelector(".mam-list"),
    };

    ui.close.addEventListener("click", () => closeMenu());

    ui.menu.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-act]");
      if (!btn) return;

      try {
        const act = btn.getAttribute("data-act");
        if (act === "gen") await handleGenerate();
        if (act === "choose") await handleChoose();
      } catch (e) {
        setStatus(e.message || "Error.");
      }
    });

    // ESC closes
    document.addEventListener("keydown", (e) => {
      if (!open) return;
      if (e.key === "Escape") closeMenu();
    }, true);

    // click outside closes
    document.addEventListener("mousedown", (e) => {
      if (!open) return;

      // if clicking the anchor that opened it, don't close here (button handler decides)
      if (anchorEl && (e.composedPath?.() || []).includes(anchorEl)) return;

      // click inside the menu (shadow) -> don't close
      // (composedPath doesn't cross the portal shadow easily),
      // so we check the viewport bounding box:
      const r = ui.menu.getBoundingClientRect();
      const x = e.clientX, y = e.clientY;
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (!inside) closeMenu();
    }, true);

    // reposition on scroll/resize
    window.addEventListener("scroll", () => { if (open) positionMenu(); }, true);
    window.addEventListener("resize", () => { if (open) positionMenu(); }, true);
  }

  function setStatus(txt) {
    ui.status.textContent = txt || "";
  }

  function closeMenu() {
    if (!ui) return;
    open = false;
    anchorEl = null;
    targetInput = null;
    lastRect = null;
    ui.menu.classList.add("mam-hidden");
    ui.chooseBox.classList.add("mam-hidden");
    setStatus("");
  }

  function positionMenu() {
    if (!open || !anchorEl || !ui) return;

    const rect = anchorEl.getBoundingClientRect();
    lastRect = rect;

    // prefer to appear below the button; if there's no space, move up
    const margin = 10;
    const menuW = Math.min(320, window.innerWidth - margin * 2);
    ui.menu.style.width = `${menuW}px`;

    // measure real height (already with max-height applied)
    const menuRect = ui.menu.getBoundingClientRect();
    const menuH = menuRect.height || 240;


    let left = rect.left;
    left = clamp(left, margin, window.innerWidth - menuW - margin);

    let top = rect.bottom + 8;
    const bottomOverflow = (top + menuH + margin) > window.innerHeight;
    if (bottomOverflow) {
      top = rect.top - menuH - 8;
      top = clamp(top, margin, window.innerHeight - menuH - margin);
    }

    ui.menu.style.left = `${Math.round(left)}px`;
    ui.menu.style.top = `${Math.round(top)}px`;
  }

  async function handleGenerate() {
    setStatus("Generating...");
    const res = await browser.runtime.sendMessage({ type: "MAM_GENERATE_RANDOM_ALIAS" });
    if (!res || !res.ok) throw new Error(res?.error || "Failed to generate alias.");

    setInputValue(targetInput, res.email);
    setStatus("Inserted into the field.");
    setTimeout(closeMenu, 550);
  }

  function renderAliases(items, q) {
    const query = String(q || "").trim().toLowerCase();

    const filtered = items.filter(it => {
      const a = String(it.address || "").toLowerCase();
      const g = String(it.goto || "").toLowerCase();
      return !query || a.includes(query) || g.includes(query);
    });

    ui.list.innerHTML = "";

    if (filtered.length === 0) {
      const div = document.createElement("div");
      div.className = "mam-item";
      div.textContent = "No results.";
      ui.list.appendChild(div);
      return;
    }

    for (const it of filtered) {
      const row = document.createElement("div");
      row.className = "mam-item";
      row.innerHTML = `
        <div>${it.address || ""}</div>
        <div class="mam-sub">${it.goto || ""}</div>
      `;
      row.addEventListener("click", () => {
        if (it.address) setInputValue(targetInput, it.address);
        closeMenu();
      });
      ui.list.appendChild(row);
    }
  }

  async function handleChoose() {
    setStatus("Loading aliases...");
    ui.chooseBox.classList.remove("mam-hidden");
    // reflow/posicionamento depois de expandir o menu (evita estourar viewport)

    requestAnimationFrame(() => positionMenu());

    const res = await browser.runtime.sendMessage({ type: "MAM_LIST_ALIASES" });
    if (!res || !res.ok) throw new Error(res?.error || "Failed to list aliases.");

    const items = Array.isArray(res.items) ? res.items : [];
    renderAliases(items, "");
    setStatus(`${items.length} loaded.`);

    ui.search.value = "";
    ui.search.focus();
    ui.search.oninput = () => renderAliases(items, ui.search.value);
  }

  function openMenuFor(anchor, input) {
    ensurePortal();

    // toggle: if already open on the same anchor, close
    if (open && anchorEl === anchor) {
      closeMenu();
      return;
    }

    open = true;
    anchorEl = anchor;
    targetInput = input;

    ui.menu.classList.remove("mam-hidden");
    ui.chooseBox.classList.add("mam-hidden");
    setStatus("");

    // position after it appears
    requestAnimationFrame(() => positionMenu());
  }

  return { openMenuFor };
})();

/* ---------------- Host per input (Shadow DOM) ---------------- */

function attachUi(input, mode) {
  if (input.dataset.mamBound === "1") return;
  input.dataset.mamBound = "1";

  // host inserted next to the input
  const host = document.createElement("span");
  host.setAttribute("data-mam-host", "1");

  // try to respect layout without breaking it
  host.style.display = "inline-block";
  host.style.verticalAlign = "middle";
  host.style.marginLeft = "6px";

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box !important; }

    @keyframes mamPulse {
      0% { box-shadow: 0 0 0 0 rgba(47, 129, 247, 0.6); transform: scale(1); }
      70% { box-shadow: 0 0 0 10px rgba(47, 129, 247, 0); transform: scale(1.05); }
      100% { box-shadow: 0 0 0 0 rgba(47, 129, 247, 0); transform: scale(1); }
    }

    .wrap{
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
    }

    .btn{
      all: unset !important;
      display:inline-flex !important;
      align-items:center !important;
      justify-content:center !important;
      border-radius: 20px !important;
      padding: 6px 14px !important;
      cursor: pointer !important;
      user-select:none !important;
      
      border: 1px solid rgba(255,255,255,0.1) !important;
      background: linear-gradient(135deg, #1f2937, #111827) !important;
      color: #e8eef6 !important;
      
      font-size: 11px !important;
      font-weight: 600 !important;
      letter-spacing: 0.5px !important;
      line-height: 1 !important;
      
      transition: all 0.2s ease !important;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important;
    }
    .btn:hover{ 
      background: linear-gradient(135deg, #374151, #1f2937) !important;
      border-color: rgba(255,255,255,0.3) !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3) !important;
    }
    .btn:active{ transform: translateY(0.5px) !important; }

    .ico{
      all: unset !important;
      position: relative !important;
      display:inline-flex !important;
      align-items:center !important;
      justify-content:center !important;
      
      width: 30px !important;
      height: 30px !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      
      border: 1px solid rgba(255,255,255,0.15) !important;
      background: linear-gradient(135deg, #2f81f7, #2353ae) !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      
      animation: mamPulse 2.5s infinite !important;
      transition: transform 0.2s !important;
      margin-top: 10px !important;
    }
    .ico:hover{ 
      filter: brightness(1.2) !important; 
      transform: scale(1.1) !important;
      animation: none !important; 
    }
    
    img{ 
      width: 16px !important; 
      height: 16px !important; 
      display:block !important; 
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)) !important;
    }

    .ico::after {
      content: '';
      position: absolute;
      top: -1px; right: -1px;
      width: 8px; height: 8px;
      background: #238636;
      border-radius: 50%;
      border: 2px solid #0d1117;
    }

    .lbl-box {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      line-height: 1.1 !important;
      margin-top: 10px !important; /* alinhar com o margin-top do icone */
    }
    .lbl-primary {
      color: #4d5257 !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
      letter-spacing: 0.2px !important;
    }
    .lbl-secondary {
      color: #4d5257 !important;
      font-size: 10px !important;
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
    /* Group Container (Pill) */
    .mam-group {
      display: inline-flex !important;
      align-items: center !important;
      padding: 3px 4px !important;
      border-radius: 999px !important;
      background: rgba(22, 27, 34, 0.75) !important;
      backdrop-filter: blur(8px) !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
      gap: 6px !important;
      transition: all 0.2s ease !important;
    }
    .mam-group:hover {
      background: rgba(22, 27, 34, 0.9) !important;
      box-shadow: 0 6px 16px rgba(0,0,0,0.25) !important;
      border-color: rgba(255, 255, 255, 0.2) !important;
    }

    /* Buttons inside group */
    .btn-pill {
      all: unset !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 6px 12px !important;
      border-radius: 999px !important;
      
      background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)) !important;
      border: 1px solid rgba(255,255,255,0.05) !important;
      color: #e8eef6 !important;
      
      font-size: 11px !important;
      font-weight: 600 !important;
      line-height: 1 !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
    }
    .btn-pill:hover {
      background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05)) !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1) !important;
    }
    .btn-pill:active { transform: translateY(0) !important; }

    /* Special style for GEN button */
    .btn-pill[data-style="gen"] {
      background: linear-gradient(135deg, #1f2937, #111827) !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
    }
    .btn-pill[data-style="gen"]:hover {
      background: linear-gradient(135deg, #374151, #1f2937) !important;
      border-color: rgba(255,255,255,0.3) !important;
    }

    /* Branding Label */
    .mam-brand {
      color: #8b949e !important;
      font-size: 9px !important;
      font-weight: 500 !important;
      padding-right: 6px !important;
      padding-left: 2px !important;
      user-select: none !important;
      opacity: 0.8 !important;
      font-family: 'Inter', system-ui, sans-serif !important; 
    }
  `;

  const root = document.createElement("span");
  root.className = "wrap";

  function makeActionButton(label, title, act) {
    const b = document.createElement("button");
    b.className = "btn-pill"; // Changed class
    if (act === "gen") b.setAttribute("data-style", "gen");

    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      Portal.openMenuFor(b, input);
    });
    return b;
  }

  if (mode === "buttons") {
    // Buttons mode: keep inline layout
    host.style.display = "inline-block";
    host.style.verticalAlign = "middle";
    host.style.marginLeft = "8px";
    host.style.marginTop = "0px";

    // Container group
    const group = document.createElement("div");
    group.className = "mam-group";

    const gen = makeActionButton("Gen", "Generate alias", "gen");
    const choose = makeActionButton("Choose", "Choose alias", "choose");

    // Branding
    const brand = document.createElement("span");
    brand.className = "mam-brand";
    brand.textContent = "Haltman.io";

    // Setup clicks
    gen.addEventListener("click", () => {
      setTimeout(() => {
        const portalShadow = document.querySelector('[data-mam-portal="1"]')?.shadowRoot;
        const btn = portalShadow?.querySelector('[data-act="gen"]');
        btn?.click();
      }, 0);
    });

    choose.addEventListener("click", () => {
      setTimeout(() => {
        const portalShadow = document.querySelector('[data-mam-portal="1"]')?.shadowRoot;
        const btn = portalShadow?.querySelector('[data-act="choose"]');
        btn?.click();
      }, 0);
    });

    group.appendChild(gen);
    group.appendChild(choose);
    group.appendChild(brand);

    root.appendChild(group);
  } else {
    // Icon mode: layout below the input (block)
    host.style.display = "block";
    host.style.marginLeft = "0px";
    host.style.marginTop = "0px";

    const ico = document.createElement("button");
    ico.className = "ico";
    ico.type = "button";
    ico.title = "Mail Alias Manager";
    ico.innerHTML = `<img src="${ICON_URL}" alt="MAM" />`;
    ico.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      Portal.openMenuFor(ico, input);
    });

    // Labels
    const lblBox = document.createElement("div");
    lblBox.className = "lbl-box";

    const p1 = document.createElement("div");
    p1.className = "lbl-primary";
    p1.textContent = "Mail Forwarding";

    const p2 = document.createElement("div");
    p2.className = "lbl-secondary";
    p2.textContent = "by haltman.io";

    lblBox.appendChild(p1);
    lblBox.appendChild(p2);

    root.appendChild(ico);
    root.appendChild(lblBox);
  }

  shadow.appendChild(style);
  shadow.appendChild(root);

  input.insertAdjacentElement("afterend", host);
}

async function scanAndAttach() {
  const mode = await getUiMode();
  const inputs = Array.from(document.querySelectorAll('input[type="email"]'));
  for (const input of inputs) attachUi(input, mode);
}

(async function main() {
  await scanAndAttach();

  // SPAs / dynamic inputs
  const mo = new MutationObserver(() => {
    if (main._t) clearTimeout(main._t);
    main._t = setTimeout(scanAndAttach, 120);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // option change (applies to new inputs; existing ones need reload)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.uiMode) {
      // do not remove existing ones to avoid layout breakage
    }
  });
})();

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "MAM_COPY_TEXT") return;

  copyTextToClipboard(msg.text)
    .then((ok) => sendResponse({ ok: Boolean(ok) }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));

  return true;
});
