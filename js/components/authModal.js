import { t } from "../lib/i18n.js";
import { isAuthenticated } from "../lib/session.js";

let authModalOverlay = null;
let lastActiveElement = null;
let keydownHandler = null;

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Ensures the login prompt modal DOM exists and returns it.
 */
function ensureAuthModal() {
  if (authModalOverlay && document.body.contains(authModalOverlay)) {
    return authModalOverlay;
  }

  let existing = document.getElementById("auth-required-modal");
  if (existing) {
    authModalOverlay = existing;
    return authModalOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "auth-required-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "auth-modal-title");
  overlay.setAttribute("aria-describedby", "auth-modal-desc");
  overlay.style.setProperty("z-index", "999000", "important");
  overlay.className =
    "fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300 opacity-0 pointer-events-none";

  overlay.innerHTML = `
    <div class="auth-modal-card bg-white border border-slate-200/80 rounded-3xl shadow-2xl p-7 max-w-md w-full text-center relative overflow-hidden transform scale-95 transition-transform duration-300">
      <!-- Close button -->
      <button type="button" class="auth-modal-close-icon absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-all cursor-pointer" aria-label="Close dialog">
        <span class="material-symbols-outlined text-lg">close</span>
      </button>

      <!-- Hero Icon -->
      <div class="w-16 h-16 rounded-2xl bg-blue-50 text-[#1755ba] flex items-center justify-center mx-auto mb-4 shadow-inner">
        <span class="material-symbols-outlined text-3xl">lock</span>
      </div>

      <!-- Title & Description -->
      <h3 id="auth-modal-title" data-i18n="auth_modal.title" class="text-xl sm:text-2xl font-bold text-slate-900 mb-2 font-headline">
        ${t("auth_modal.title", "Login Required")}
      </h3>
      <p id="auth-modal-desc" data-i18n="auth_modal.desc_default" class="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
        ${t("auth_modal.desc_default", "You need to log in to use this feature.")}
      </p>

      <!-- Actions -->
      <div class="flex flex-col gap-2.5">
        <a id="auth-modal-login-btn" href="/login.html" class="w-full py-3 px-5 rounded-2xl bg-[#1755ba] hover:bg-[#134699] text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
          <span class="material-symbols-outlined text-[20px]">login</span>
          <span class="auth-modal-login-text" data-i18n="auth_modal.login_btn">${t("auth_modal.login_btn", "Log In Now")}</span>
        </a>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <span class="auth-modal-register-prompt" data-i18n="auth_modal.register_prompt">${t("auth_modal.register_prompt", "Don't have an account?")}</span>
          <a id="auth-modal-register-btn" href="/register.html" data-i18n="auth_modal.register_btn" class="font-bold text-[#1755ba] hover:underline">
            ${t("auth_modal.register_btn", "Sign Up")}
          </a>
        </div>

        <button type="button" class="auth-modal-cancel-btn mt-1 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer" data-i18n="auth_modal.close_btn">
          ${t("auth_modal.close_btn", "Maybe Later")}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Setup click listeners
  const closeIcon = overlay.querySelector(".auth-modal-close-icon");
  const cancelBtn = overlay.querySelector(".auth-modal-cancel-btn");
  closeIcon?.addEventListener("click", closeLoginPrompt);
  cancelBtn?.addEventListener("click", closeLoginPrompt);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeLoginPrompt();
    }
  });

  authModalOverlay = overlay;
  return authModalOverlay;
}

/**
 * Displays the Login Required prompt modal.
 * @param {object} [options]
 * @param {string} [options.title] - Optional title override.
 * @param {string} [options.message] - Optional message/description override.
 * @param {string} [options.redirectUrl] - URL to return to after successful login.
 */
export function showLoginPrompt(options = {}) {
  const overlay = ensureAuthModal();
  const card = overlay.querySelector(".auth-modal-card");
  const titleEl = overlay.querySelector("#auth-modal-title");
  const descEl = overlay.querySelector("#auth-modal-desc");
  const loginBtn = overlay.querySelector("#auth-modal-login-btn");
  const registerBtn = overlay.querySelector("#auth-modal-register-btn");

  lastActiveElement = document.activeElement;

  const returnUrl = options.redirectUrl || window.location.pathname + window.location.search;
  const loginHref = `/login.html?redirect=${encodeURIComponent(returnUrl)}`;
  const registerHref = `/register.html?redirect=${encodeURIComponent(returnUrl)}`;

  if (loginBtn) loginBtn.href = loginHref;
  if (registerBtn) registerBtn.href = registerHref;

  if (titleEl) {
    const titleKey = options.titleKey || (options.title ? "" : "auth_modal.title");
    titleEl.dataset.i18n = titleKey;
    titleEl.textContent = options.title || (titleKey ? t(titleKey) : "Login Required");
  }

  if (descEl) {
    const descKey = options.messageKey || (typeof options.message === "string" && options.message.startsWith("auth_modal.") ? options.message : (options.message ? "" : "auth_modal.desc_default"));
    descEl.dataset.i18n = descKey;
    descEl.textContent = options.message ? (descKey ? t(descKey) : options.message) : t("auth_modal.desc_default", "You need to log in to use this feature.");
  }

  // Prevent background scroll with scrollbar compensation
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  }

  overlay.classList.remove("pointer-events-none", "opacity-0");
  overlay.classList.add("pointer-events-auto", "opacity-100");
  if (card) {
    card.classList.remove("scale-95");
    card.classList.add("scale-100");
  }

  // Keydown trap & Escape key
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
  }
  keydownHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeLoginPrompt();
      return;
    }
    if (e.key === "Tab") {
      const focusables = Array.from(
        card.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener("keydown", keydownHandler);

  // Focus login button
  requestAnimationFrame(() => {
    loginBtn?.focus();
  });
}

/**
 * Closes the Login Required prompt modal.
 */
export function closeLoginPrompt() {
  if (!authModalOverlay) return;

  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }

  const card = authModalOverlay.querySelector(".auth-modal-card");
  authModalOverlay.classList.remove("opacity-100", "pointer-events-auto");
  authModalOverlay.classList.add("opacity-0", "pointer-events-none");
  if (card) {
    card.classList.remove("scale-100");
    card.classList.add("scale-95");
  }

  setTimeout(() => {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      try {
        lastActiveElement.focus();
      } catch {}
    }
  }, 250);
}

/**
 * Utility helper: runs callback if authenticated; otherwise displays the login modal.
 * @param {Function} actionFn
 * @param {object} [options]
 * @returns {boolean} Whether user was authenticated and action executed.
 */
export function requireAuth(actionFn, options = {}) {
  if (isAuthenticated()) {
    if (typeof actionFn === "function") {
      actionFn();
    }
    return true;
  }
  showLoginPrompt(options);
  return false;
}

// Global exposure for HTML inline attributes and scripts
if (typeof window !== "undefined") {
  window.showLoginPrompt = showLoginPrompt;
  window.closeLoginPrompt = closeLoginPrompt;
  window.requireAuth = requireAuth;

  // Auto-delegate clicks on elements with [data-requires-auth]
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-requires-auth]");
    if (trigger && !isAuthenticated()) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const message = trigger.dataset.authMessage || t("auth_modal.desc_default", "You need to log in to use this feature.");
      showLoginPrompt({ message });
      return false;
    }
  }, true);

  window.addEventListener("language-changed", () => {
    if (!authModalOverlay) return;
    const titleEl = authModalOverlay.querySelector("#auth-modal-title");
    const descEl = authModalOverlay.querySelector("#auth-modal-desc");
    const loginText = authModalOverlay.querySelector(".auth-modal-login-text");
    const registerPrompt = authModalOverlay.querySelector(".auth-modal-register-prompt");
    const registerBtn = authModalOverlay.querySelector("#auth-modal-register-btn");
    const cancelBtn = authModalOverlay.querySelector(".auth-modal-cancel-btn");

    if (titleEl?.dataset.i18n) titleEl.textContent = t(titleEl.dataset.i18n);
    if (descEl?.dataset.i18n) descEl.textContent = t(descEl.dataset.i18n);
    if (loginText?.dataset.i18n) loginText.textContent = t(loginText.dataset.i18n);
    if (registerPrompt?.dataset.i18n) registerPrompt.textContent = t(registerPrompt.dataset.i18n);
    if (registerBtn?.dataset.i18n) registerBtn.textContent = t(registerBtn.dataset.i18n);
    if (cancelBtn?.dataset.i18n) cancelBtn.textContent = t(cancelBtn.dataset.i18n);
  });
}
