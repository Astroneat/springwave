import { t } from "../lib/i18n.js";

let quizModalOverlay = null;
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
 * Ensures the quiz prompt modal DOM exists and returns it.
 */
function ensureQuizModal() {
  if (quizModalOverlay && document.body.contains(quizModalOverlay)) {
    return quizModalOverlay;
  }

  let existing = document.getElementById("quiz-required-modal");
  if (existing) {
    quizModalOverlay = existing;
    return quizModalOverlay;
  }

  const overlay = document.createElement("div");
  overlay.id = "quiz-required-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "quiz-modal-title");
  overlay.setAttribute("aria-describedby", "quiz-modal-desc");
  overlay.style.setProperty("z-index", "999000", "important");
  overlay.className =
    "fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300 opacity-0 pointer-events-none";

  overlay.innerHTML = `
    <div class="quiz-modal-card bg-white border border-slate-200/80 rounded-3xl shadow-2xl p-6 sm:p-7 max-w-md w-full text-center relative overflow-hidden transform scale-95 transition-transform duration-300">
      <!-- Close button -->
      <button type="button" class="quiz-modal-close-icon absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-all cursor-pointer z-10" aria-label="Close dialog">
        <span class="material-symbols-outlined text-lg">close</span>
      </button>

      <!-- Title & Description -->
      <h3 id="quiz-modal-title" data-i18n="quiz_modal.title" class="text-xl sm:text-2xl font-bold text-slate-900 mb-2 pt-2 font-headline tracking-tight">
        ${t("quiz_modal.title", "Khám phá bản thân với AI Quiz")}
      </h3>
      <p id="quiz-modal-desc" data-i18n="quiz_modal.desc" class="text-xs sm:text-sm text-slate-600 mb-5 leading-relaxed">
        ${t("quiz_modal.desc", "Bạn chưa hoàn thành bài trắc nghiệm AI Quiz. Hãy dành 2 phút để AI hiểu định hướng, sở thích và tính toán độ phù hợp chính xác từng sự kiện cho bạn!")}
      </p>

      <!-- Feature Perks Grid -->
      <div class="grid grid-cols-2 gap-2 text-left mb-6">
        <div class="p-3 rounded-2xl bg-slate-50/80 border border-slate-150 flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-base">insights</span>
          </div>
          <div class="text-[11px] leading-tight text-slate-700 font-medium" data-i18n="quiz_modal.perk_match">
            ${t("quiz_modal.perk_match", "Đo độ hợp % từng sự kiện")}
          </div>
        </div>
        <div class="p-3 rounded-2xl bg-slate-50/80 border border-slate-150 flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-base">neurology</span>
          </div>
          <div class="text-[11px] leading-tight text-slate-700 font-medium" data-i18n="quiz_modal.perk_profile">
            ${t("quiz_modal.perk_profile", "Hồ sơ tính cách & thế mạnh")}
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex flex-col gap-2.5">
        <a id="quiz-modal-start-btn" href="/quiz.html" class="w-full py-3.5 px-5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-semibold text-sm shadow-md transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">play_arrow</span>
          <span class="quiz-modal-start-text" data-i18n="quiz_modal.start_btn">${t("quiz_modal.start_btn", "Làm AI Quiz ngay (2 phút)")}</span>
        </a>

        <button type="button" class="quiz-modal-cancel-btn mt-1 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer" data-i18n="quiz_modal.close_btn">
          ${t("quiz_modal.close_btn", "Để sau")}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Setup click listeners
  const closeIcon = overlay.querySelector(".quiz-modal-close-icon");
  const cancelBtn = overlay.querySelector(".quiz-modal-cancel-btn");
  closeIcon?.addEventListener("click", closeQuizPrompt);
  cancelBtn?.addEventListener("click", closeQuizPrompt);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeQuizPrompt();
    }
  });

  quizModalOverlay = overlay;
  return quizModalOverlay;
}

/**
 * Displays the AI Quiz Required prompt modal.
 * @param {object} [options]
 * @param {string} [options.title] - Optional title override.
 * @param {string} [options.message] - Optional message/description override.
 * @param {string} [options.redirectUrl] - URL to return to after quiz completion.
 */
export function showQuizPrompt(options = {}) {
  const overlay = ensureQuizModal();
  const card = overlay.querySelector(".quiz-modal-card");
  const titleEl = overlay.querySelector("#quiz-modal-title");
  const descEl = overlay.querySelector("#quiz-modal-desc");
  const startBtn = overlay.querySelector("#quiz-modal-start-btn");

  lastActiveElement = document.activeElement;

  const returnUrl = options.redirectUrl || window.location.pathname + window.location.search;
  const quizHref = `/quiz.html?redirect=${encodeURIComponent(returnUrl)}`;

  if (startBtn) startBtn.href = quizHref;

  if (titleEl) {
    const titleKey = options.titleKey || (options.title ? "" : "quiz_modal.title");
    titleEl.dataset.i18n = titleKey;
    titleEl.textContent = options.title || (titleKey ? t(titleKey) : "Khám phá bản thân với AI Quiz");
  }

  if (descEl) {
    const descKey = options.messageKey || (typeof options.message === "string" && options.message.startsWith("quiz_modal.") ? options.message : (options.message ? "" : "quiz_modal.desc"));
    descEl.dataset.i18n = descKey;
    descEl.textContent = options.message ? (descKey ? t(descKey) : options.message) : t("quiz_modal.desc", "Bạn chưa hoàn thành bài trắc nghiệm AI Quiz. Hãy dành 2 phút để AI hiểu định hướng, sở thích và tính toán độ phù hợp chính xác từng sự kiện cho bạn!");
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

  keydownHandler = function (e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeQuizPrompt();
      return;
    }

    if (e.key === "Tab") {
      const focusable = overlay.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  document.addEventListener("keydown", keydownHandler);

  // Focus primary CTA
  setTimeout(() => {
    startBtn?.focus();
  }, 50);
}

/**
 * Closes the AI Quiz prompt modal.
 */
export function closeQuizPrompt() {
  if (!quizModalOverlay) return;

  const card = quizModalOverlay.querySelector(".quiz-modal-card");
  if (card) {
    card.classList.remove("scale-100");
    card.classList.add("scale-95");
  }

  quizModalOverlay.classList.remove("opacity-100", "pointer-events-auto");
  quizModalOverlay.classList.add("opacity-0", "pointer-events-none");

  // Restore scroll
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";

  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }

  if (lastActiveElement && typeof lastActiveElement.focus === "function") {
    try {
      lastActiveElement.focus();
    } catch (_) {}
    lastActiveElement = null;
  }
}
