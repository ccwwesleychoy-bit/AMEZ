// AMEZ — Cart + Checkout
(() => {
  "use strict";

  const cfg = window.SHOP_CONFIG || {};
  const currency = cfg.currencyLabel || "HK$";
  const freeAtAmount = Number(cfg.freeShippingAtAmount || 240);
  const shipFee = Number(cfg.shippingFee || 30);

  const PRODUCTS = {
    nutty: {
      id: "nutty",
      nameKey: "p1Name",
      subKey:  "p1Sub",
      price:   120,
      image:   "nutty.svg",
    },
    fruity: {
      id: "fruity",
      nameKey: "p2Name",
      subKey:  "p2Sub",
      price:   150,
      image:   "fruity.svg",
    },
  };

  const state = {
    cart: {},            // { [id]: qty }
    orderId: "",
    submitting: false,
    paymentProof: null,  // { base64, mime, name, previewUrl }
  };

  const $ = (id) => document.getElementById(id);
  /** i18n: use this instead of t() so cart still works if Cloudflare Rocket Loader runs app.js before i18n.js. */
  function tr(key) {
    if (typeof t === "function") return t(key);
    if (typeof STR !== "undefined" && STR.en && STR.en[key] !== undefined) return STR.en[key];
    return key;
  }
  /** Safe for innerHTML / attributes (e.g. "Fruity & Floral" breaks parsing if left raw). */
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  const money = (n) => currency + Number(n || 0).toFixed(0);
  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "textarea:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  let lastCartTrigger = null;
  let lastCheckoutTrigger = null;

  function isFocusableVisible(el) {
    if (!el || el.tabIndex < 0) return false;
    if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
    // Do not use offsetParent — it is null for many descendants of transformed
    // ancestors (e.g. Tailwind translate on the cart drawer), which hid every
    // control from focus trapping and first-focus on iOS / Safari / Chrome.
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getFocusable(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll(focusableSelector)).filter(isFocusableVisible);
  }

  function focusFirst(root) {
    const focusables = getFocusable(root);
    const target = focusables[0] || root;
    if (target && target.focus) target.focus({ preventScroll: true });
  }

  function restoreFocus(el) {
    if (el && typeof el.focus === "function" && document.contains(el)) {
      el.focus({ preventScroll: true });
    }
  }

  function trapFocus(e, root) {
    if (e.key !== "Tab" || !root) return;
    const focusables = getFocusable(root);
    if (focusables.length === 0) {
      e.preventDefault();
      root.focus({ preventScroll: true });
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function setCartExpanded(expanded) {
    const btn = $("btn-cart");
    if (btn) btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function setSubmitStatus(message, isError = true) {
    const status = $("order-submit-status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("hidden", !message);
    status.classList.toggle("text-[#b15a5a]", isError);
    status.classList.toggle("text-brown-mid", !isError);
  }

  function updateCheckoutShippingNote() {
    const note = $("checkout-free-shipping-note");
    if (!note) return;
    const sub = subtotal();
    if (sub > 0 && sub < freeAtAmount) {
      note.textContent = (tr("chkFreeShipNote") || "").replace("{amt}", money(freeAtAmount - sub));
      note.classList.remove("hidden");
    } else {
      note.textContent = "";
      note.classList.add("hidden");
    }
  }

  // ---------- CART MATH ----------
  function subtotal() {
    return Object.keys(state.cart).reduce((s, id) => {
      const p = PRODUCTS[id];
      return p ? s + p.price * state.cart[id] : s;
    }, 0);
  }
  function shipping(sub) {
    return sub === 0 ? 0 : sub >= freeAtAmount ? 0 : shipFee;
  }
  function grandTotal() {
    const sub = subtotal();
    return sub + shipping(sub);
  }
  function totalUnits() {
    return Object.values(state.cart).reduce((a, b) => a + b, 0);
  }

  // ---------- CART OPS ----------
  function addToCart(id) {
    state.cart[id] = (state.cart[id] || 0) + 1;
    syncAll();
    openCart();
  }
  function removeFromCart(id) {
    delete state.cart[id];
    syncAll();
  }
  function changeQty(id, delta) {
    const next = (state.cart[id] || 0) + delta;
    if (next <= 0) delete state.cart[id];
    else state.cart[id] = next;
    syncAll();
  }

  function syncAll() {
    updateCartCount();
    renderCart();
  }

  function updateCartCount() {
    const badge = $("cart-count-badge");
    if (!badge) return;
    const n = totalUnits();
    if (n > 0) {
      badge.textContent = n;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  // ---------- RENDER CART DRAWER ----------
  function renderCart() {
    const container = $("cart-items");
    const totalEl   = $("cart-total");
    const subEl     = $("cart-subtotal");
    const shipEl    = $("cart-shipping");
    const progress  = $("cart-progress");
    const progFill  = $("cart-progress-fill");
    const progText  = $("cart-progress-text");
    const checkoutBtn = $("btn-checkout");

    const keys = Object.keys(state.cart);
    const sub  = subtotal();
    const ship = shipping(sub);
    const grand = sub + ship;

    if (totalEl) totalEl.textContent = money(grand);
    if (subEl)   subEl.textContent   = money(sub);
    if (shipEl)  shipEl.textContent  = sub === 0 ? "—" : (ship === 0 ? tr("shipFree") : money(ship));

    // Free shipping progress
    if (progress && progFill && progText) {
      if (sub > 0 && sub < freeAtAmount) {
        const pct = Math.min(100, Math.round((sub / freeAtAmount) * 100));
        progFill.style.width = pct + "%";
        const remaining = freeAtAmount - sub;
        progText.textContent = (tr("shipAway") || "").replace("{amt}", money(remaining));
        progress.classList.remove("hidden");
      } else if (sub >= freeAtAmount) {
        progFill.style.width = "100%";
        progText.textContent = tr("shipUnlocked");
        progress.classList.remove("hidden");
      } else {
        progress.classList.add("hidden");
      }
    }

    if (checkoutBtn) checkoutBtn.disabled = keys.length === 0;

    if (!container) return;

    if (keys.length === 0) {
      container.innerHTML = `
        <div class="py-16 text-center">
          <p class="font-zh-sans text-xs tracking-[0.28em] uppercase text-brown-light">${escapeHtml(tr("cartEmpty"))}</p>
        </div>`;
      return;
    }

    let html = "";
    keys.forEach((id) => {
      const p   = PRODUCTS[id];
      const qty = state.cart[id];
      if (!p || !qty) return;
      const lineTotal = p.price * qty;
      const nameEsc = escapeHtml(tr(p.nameKey));
      const subEsc = escapeHtml(tr(p.subKey));
      const rmEsc = escapeHtml(tr("remove"));
      html += `
        <div class="flex items-start gap-4 py-5 border-b border-cream-border last:border-b-0">
          <img src="${p.image}" alt="" width="80" height="80" decoding="async" class="w-20 h-20 object-contain bg-cream-dark p-1.5 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-zh-sans text-sm tracking-[0.04em] leading-snug text-brown">${nameEsc}</p>
            <p class="font-zh-sans text-[11px] tracking-[0.22em] uppercase text-brown-light mt-1">${subEsc}</p>
            <div class="flex items-center justify-between mt-3.5 gap-4">
              <div class="flex items-center gap-3 shrink-0">
                <button type="button" data-cart-act="dec" data-cart-id="${id}" class="w-7 h-7 border border-cream-border text-brown-mid hover:border-brown hover:text-brown transition-colors leading-none text-sm" aria-label="Decrease ${nameEsc} quantity">−</button>
                <span class="text-sm w-5 text-center tabular-nums price" aria-live="polite">${qty}</span>
                <button type="button" data-cart-act="inc" data-cart-id="${id}" class="w-7 h-7 border border-cream-border text-brown-mid hover:border-brown hover:text-brown transition-colors leading-none text-sm" aria-label="Increase ${nameEsc} quantity">+</button>
              </div>
              <span class="text-sm tracking-wider price text-brown ml-4">${money(lineTotal)}</span>
            </div>
          </div>
          <button type="button" data-cart-act="rm" data-cart-id="${id}" class="font-zh-sans text-[10px] tracking-[0.24em] uppercase text-brown-pale hover:text-brown transition-colors mt-0.5 shrink-0" aria-label="${rmEsc} ${nameEsc}">${rmEsc}</button>
        </div>`;
    });
    container.innerHTML = html;
  }

  // ---------- DRAWER OPEN / CLOSE ----------
  function openCart() {
    const drawer = $("cart-drawer");
    const overlay = $("cart-overlay");
    if (!drawer || !overlay) return;
    lastCartTrigger = document.activeElement;
    drawer.classList.remove("translate-x-full");
    overlay.classList.remove("hidden");
    setCartExpanded(true);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => focusFirst(drawer));
  }
  function closeCart(restore = true) {
    const drawer = $("cart-drawer");
    const overlay = $("cart-overlay");
    if (!drawer || !overlay) return;
    drawer.classList.add("translate-x-full");
    overlay.classList.add("hidden");
    setCartExpanded(false);
    if (!document.body.classList.contains("checkout-open")) {
      document.body.style.overflow = "";
    }
    if (restore) restoreFocus(lastCartTrigger || $("btn-cart"));
  }

  // ---------- ORDER ID ----------
  function genOrderId() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "AMEZ-" + y + m + day + "-" + r;
  }

  // ---------- ORDER SUMMARY ----------
  function buildOrderSummary() {
    const isZh = (typeof currentLang !== "undefined") && currentLang === "zh-Hant";
    const sub  = subtotal();
    const ship = shipping(sub);
    const grand = sub + ship;
    let items = "";
    Object.keys(state.cart).forEach((id) => {
      const p   = PRODUCTS[id];
      const qty = state.cart[id];
      const nm  = isZh ? tr(p.nameKey) : ((typeof STR !== "undefined" && STR.en && STR.en[p.nameKey]) || p.nameKey);
      items += `${nm} × ${qty}  @ ${money(p.price)}  = ${money(p.price * qty)}\n`;
    });
    let out = "";
    if (isZh) {
      out += "訂單編號：" + state.orderId + "\n\n" + items;
      out += `\n小計：${money(sub)}\n運費：${ship === 0 ? "免運" : money(ship)}\n合計：${money(grand)}\n`;
      out += "\n付款：PayMe 或 轉數快\n請於轉帳備註填寫訂單編號。\n（備註：" + state.orderId + "）\n";
    } else {
      out += "Order ID: " + state.orderId + "\n\n" + items;
      out += `\nSubtotal: ${money(sub)}\nShipping: ${ship === 0 ? "Free" : money(ship)}\nTotal: ${money(grand)}\n`;
      out += "\nPayment: PayMe or FPS\n" + (cfg.fpsNote || "Please put the Order ID in the transfer remark.") + "\n";
    }
    return out.trim();
  }

  // ---------- CHECKOUT OPEN / CLOSE ----------
  function openCheckout() {
    if (Object.keys(state.cart).length === 0) return;
    lastCheckoutTrigger = document.activeElement;
    state.orderId = genOrderId();
    state.paymentProof = null;
    resetPaymentProofUI();
    setSubmitStatus("");

    $("checkout-order-id").textContent = state.orderId;
    $("success-order-id").textContent = state.orderId;
    $("checkout-summary").textContent = buildOrderSummary();
    updateCheckoutShippingNote();

    const payme = $("payme-link");
    if (payme) payme.href = cfg.payMeUrl || "#";
    $("fps-id").textContent = cfg.fpsId || "";

    // Reset modal state
    $("checkout-success").classList.add("hidden");
    $("checkout-body").classList.remove("hidden");
    const submitBtn = $("btn-submit-order");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = tr("formSubmit");
    }
    const form = $("form-order");
    if (form) form.reset();
    $("order-id-field").value = state.orderId;
    $("order-summary-field").value = buildOrderSummary();

    $("checkout-modal").classList.remove("hidden");
    document.body.classList.add("checkout-open");
    document.body.style.overflow = "hidden";
    // Close the drawer behind the modal
    closeCart(false);
    requestAnimationFrame(() => focusFirst($("checkout-modal")));
  }

  function closeCheckout() {
    $("checkout-modal").classList.add("hidden");
    document.body.classList.remove("checkout-open");
    document.body.style.overflow = "";
    setSubmitStatus("");
    const drawer = $("cart-drawer");
    const fallback = $("btn-cart");
    restoreFocus(drawer && drawer.contains(lastCheckoutTrigger) ? fallback : (lastCheckoutTrigger || fallback));
  }

  // ---------- COPY ----------
  async function copyText(txt) {
    const s = String(txt || "").trim();
    if (!s) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch (_) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_) { return false; }
  }

  function flashCopied(btn) {
    const orig = btn.dataset.origText || btn.textContent;
    btn.dataset.origText = orig;
    btn.textContent = tr("copied");
    setTimeout(() => { btn.textContent = orig; }, 900);
  }

  // ---------- PAYMENT PROOF ----------
  function resetPaymentProofUI() {
    if (state.paymentProof && state.paymentProof.previewUrl) {
      try { URL.revokeObjectURL(state.paymentProof.previewUrl); } catch(_) {}
    }
    state.paymentProof = null;
    const input = $("payment-proof-input");
    if (input) input.value = "";
    const wrap = $("payment-proof-preview-wrap");
    if (wrap) wrap.classList.add("hidden");
    const prev = $("payment-proof-preview");
    if (prev) prev.removeAttribute("src");
    const err = $("payment-proof-error");
    if (err) { err.textContent = ""; err.classList.add("hidden"); }
    const fn = $("payment-proof-filename");
    if (fn) { fn.textContent = ""; fn.classList.add("hidden"); }
    const clr = $("btn-payment-proof-clear");
    if (clr) clr.classList.add("hidden");
  }

  function compressToJpeg(file, maxW = 1680, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return reject(new Error("image"));
        if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob(blob => {
          if (!blob) return reject(new Error("blob"));
          const fr = new FileReader();
          fr.onload = () => {
            const du = String(fr.result || "");
            const i = du.indexOf(",");
            const b64 = i >= 0 ? du.slice(i+1) : "";
            const base = String(file.name || "proof").replace(/\.[^.]+$/, "") || "proof";
            resolve({ base64: b64, mime: "image/jpeg", name: base + ".jpg", blob });
          };
          fr.onerror = () => reject(new Error("read"));
          fr.readAsDataURL(blob);
        }, "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load")); };
      img.src = url;
    });
  }

  function initPaymentProofUI() {
    const input   = $("payment-proof-input");
    const pick    = $("btn-payment-proof-pick");
    const clear   = $("btn-payment-proof-clear");
    const err     = $("payment-proof-error");
    const fnEl    = $("payment-proof-filename");
    const wrap    = $("payment-proof-preview-wrap");
    const prev    = $("payment-proof-preview");

    pick && pick.addEventListener("click", () => input && input.click());
    clear && clear.addEventListener("click", () => resetPaymentProofUI());

    input && input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (err) { err.textContent = ""; err.classList.add("hidden"); }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (file.type && !allowedTypes.includes(file.type)) {
        if (err) { err.textContent = tr("errImageType"); err.classList.remove("hidden"); }
        input.value = "";
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        if (err) { err.textContent = tr("errImageBig"); err.classList.remove("hidden"); }
        input.value = "";
        return;
      }
      try {
        const { base64, mime, name, blob } = await compressToJpeg(file);
        resetPaymentProofUI();
        const previewUrl = URL.createObjectURL(blob);
        state.paymentProof = { base64, mime, name, previewUrl };
        if (prev) prev.src = previewUrl;
        if (wrap) wrap.classList.remove("hidden");
        if (clear) clear.classList.remove("hidden");
        if (fnEl) { fnEl.textContent = name; fnEl.classList.remove("hidden"); }
      } catch (_) {
        if (err) { err.textContent = tr("errImageRead"); err.classList.remove("hidden"); }
        input.value = "";
      }
    });
  }

  // ---------- SUBMIT ORDER ----------
  async function submitOrder(ev) {
    ev.preventDefault();
    if (state.submitting) return;

    const form = $("form-order");
    const err  = $("payment-proof-error");
    setSubmitStatus("");

    if (!cfg.orderEndpoint) {
      setSubmitStatus(tr("errSubmit"));
      return;
    }

    const honeypot = form && form.querySelector('[name="website"]');
    if (honeypot && honeypot.value) return;

    if (!state.paymentProof || !state.paymentProof.base64) {
      if (err) { err.textContent = tr("errNeedProof"); err.classList.remove("hidden"); try { err.scrollIntoView({behavior:"smooth",block:"nearest"}); } catch(_) {} }
      setSubmitStatus(tr("errNeedProof"));
      return;
    }

    // Refresh summary with latest cart
    $("order-summary-field").value = buildOrderSummary();

    state.submitting = true;
    const btn = $("btn-submit-order");
    const oldTxt = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = tr("formSending"); }

    const phone = (form.querySelector('[name="phone"]') || {}).value || "";
    const payload = {
      orderId: state.orderId,
      createdAt: new Date().toISOString(),
      lang: (typeof currentLang !== "undefined") ? currentLang : "en",
      name:    (form.querySelector('[name="name"]')    || {}).value || "",
      phone,
      whatsapp: phone,
      address: (form.querySelector('[name="address"]') || {}).value || "",
      email:   (form.querySelector('[name="email"]')   || {}).value || "",
      note:    "",
      summary: $("order-summary-field").value,
      paymentProofBase64:   state.paymentProof.base64,
      paymentProofMime:     state.paymentProof.mime,
      paymentProofFileName: state.paymentProof.name,
    };

    const controller = window.AbortController ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 20000) : null;

    try {
      await fetch(cfg.orderEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined,
      });
      if (timeout) clearTimeout(timeout);
      // Success state
      $("checkout-body").classList.add("hidden");
      $("checkout-success").classList.remove("hidden");
      requestAnimationFrame(() => focusFirst($("checkout-success")));
      state.cart = {};
      syncAll();
    } catch (e) {
      if (timeout) clearTimeout(timeout);
      console.error("Order submit failed:", e);
      setSubmitStatus(tr("errSubmit"));
      if (btn) { btn.disabled = false; btn.textContent = tr("formFailed"); }
      setTimeout(() => { if (btn) btn.textContent = oldTxt || tr("formSubmit"); }, 1400);
    } finally {
      state.submitting = false;
    }
  }

  // ---------- CONTACT PHONE FORMATTING ----------
  function contactPhoneDisplay(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 8) return d.slice(0, 4) + " " + d.slice(4);
    return String(raw || "").trim();
  }
  /** WhatsApp chat link — api.whatsapp.com often resolves when wa.me does not (DNS/NXDOMAIN). */
  function whatsappHref(phoneDigits) {
    const cc = String(cfg.contactWhatsappCountryCode || "852").replace(/\D/g, "");
    return phoneDigits
      ? "https://api.whatsapp.com/send?phone=" + cc + phoneDigits
      : "#";
  }

  function renderContactInfo() {
    const phoneDigits = String(cfg.contactPhone || "").replace(/\D/g, "");
    const wa = whatsappHref(phoneDigits);
    const label = contactPhoneDisplay(cfg.contactPhone);

    const phoneEl = $("contact-phone");
    if (phoneEl) {
      phoneEl.textContent = label;
      phoneEl.setAttribute("href", wa);
      phoneEl.setAttribute("rel", "noopener noreferrer");
      phoneEl.setAttribute("target", "_blank");
    }
    const collabWa = $("collab-whatsapp");
    if (collabWa) {
      collabWa.textContent = label;
      collabWa.setAttribute("href", wa);
      collabWa.setAttribute("rel", "noopener noreferrer");
      collabWa.setAttribute("target", "_blank");
    }
    const emailEl = $("contact-email");
    if (emailEl) {
      const em = String(cfg.contactEmail || "").trim();
      emailEl.textContent = em;
      if (em) emailEl.setAttribute("href", "mailto:" + em);
    }
    const fpsInline = $("footer-fps");
    if (fpsInline) fpsInline.textContent = cfg.fpsId || "";
  }

  // ---------- INIT ----------
  function init() {
    // Bind close buttons / overlays via event delegation
    const overlay = $("cart-overlay");
    if (overlay) overlay.addEventListener("click", closeCart);
    const backdrop = $("checkout-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeCheckout);

    document.addEventListener("keydown", (e) => {
      const drawer = $("cart-drawer");
      const cartOpen = drawer && !drawer.classList.contains("translate-x-full");
      if (e.key === "Escape") {
        if (document.body.classList.contains("checkout-open")) closeCheckout();
        else if (cartOpen) closeCart();
        return;
      }
      if (document.body.classList.contains("checkout-open")) {
        trapFocus(e, $("checkout-modal"));
      } else if (cartOpen) {
        trapFocus(e, drawer);
      }
    });

    const cartItemsRoot = $("cart-items");
    if (cartItemsRoot) {
      cartItemsRoot.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-cart-act]");
        if (!btn || !cartItemsRoot.contains(btn)) return;
        const id = btn.getAttribute("data-cart-id");
        if (!id) return;
        const act = btn.getAttribute("data-cart-act");
        if (act === "dec") changeQty(id, -1);
        else if (act === "inc") changeQty(id, 1);
        else if (act === "rm") removeFromCart(id);
      });
    }

    const checkoutBtn = $("btn-checkout");
    if (checkoutBtn) checkoutBtn.addEventListener("click", openCheckout);

    const copyOrder = $("btn-copy-order-id");
    if (copyOrder) copyOrder.addEventListener("click", async () => {
      const ok = await copyText(state.orderId);
      if (ok) flashCopied(copyOrder);
    });
    const copyFps = $("btn-copy-fps");
    if (copyFps) copyFps.addEventListener("click", async () => {
      const ok = await copyText(cfg.fpsId || "");
      if (ok) flashCopied(copyFps);
    });

    initPaymentProofUI();

    const form = $("form-order");
    if (form) form.addEventListener("submit", submitOrder);

    renderContactInfo();
    syncAll();
    // Apply initial language (from i18n.js)
    if (typeof setLang === "function") setLang("en");
  }

  // Public API
  window.AMEZ = {
    addToCart,
    removeFromCart,
    changeQty,
    openCart,
    closeCart,
    openCheckout,
    closeCheckout,
    renderCart,          // re-render on language change
    renderContact: renderContactInfo,
  };

  // Legacy globals (used by existing inline onclick attributes / older HTML)
  window.addToCart      = addToCart;
  window.openCart       = openCart;
  window.closeCart      = closeCart;
  window.removeFromCart = removeFromCart;
  window.changeQty      = changeQty;
  window.handleCheckout = openCheckout;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
