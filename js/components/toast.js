/**
 * Global Toast Notification Service for SpringWave
 * Supports unified styling, accessible live regions, auto-dismiss, and flexible argument signatures.
 */

import { t, getLang } from "../lib/i18n.js";
import { escapeHtml } from "../lib/sanitize.js";

let toastContainer = null;

function ensureToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) {
    // Keep container as last element of body to guarantee highest stacking layer
    if (document.body.lastElementChild !== toastContainer) {
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }
  toastContainer = document.getElementById("global-toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "global-toast-container";
    toastContainer.setAttribute("role", "region");
    toastContainer.setAttribute("aria-label", "Notifications");
    document.body.appendChild(toastContainer);
  }
  toastContainer.className =
    "fixed bottom-5 right-5 flex flex-col-reverse gap-2.5 max-w-sm w-[calc(100vw-40px)] sm:w-full pointer-events-none transition-all";
  toastContainer.style.setProperty("z-index", "999999", "important");
  return toastContainer;
}

const TYPE_CONFIG = {
  success: {
    icon: "check_circle",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    iconColor: "text-emerald-500",
  },
  error: {
    icon: "error",
    border: "border-rose-200",
    bg: "bg-rose-50",
    text: "text-rose-800",
    iconColor: "text-rose-500",
  },
  warning: {
    icon: "warning",
    border: "border-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    iconColor: "text-amber-500",
  },
  info: {
    icon: "info",
    border: "border-blue-200",
    bg: "bg-blue-50",
    text: "text-blue-800",
    iconColor: "text-blue-500",
  },
};

/**
 * Displays a toast notification.
 * @param {string|object} options - Message string or options object.
 * @param {string|boolean} [typeOrIsError='info'] - 'success'|'error'|'info'|'warning' or boolean (true = error, false = success).
 * @param {number} [duration=3500] - Duration in ms before auto-dismiss.
 */
export function showToast(options, typeOrIsError = "info", duration = 3500) {
  let message = "";
  let type = "info";
  let timeout = duration;
  let i18nKey = "";
  let i18nParams = {};

  if (typeof options === "object" && options !== null) {
    i18nKey = options.key || options.i18nKey || (typeof options.message === "string" && options.message.includes(".") ? options.message : "");
    i18nParams = options.params || {};
    message = options.message || (i18nKey ? t(i18nKey, i18nParams, options.fallback || "") : "");
    type = options.type || "info";
    timeout = options.duration || 3500;
  } else {
    const raw = String(options || "");
    if (raw.includes(".") && !raw.includes(" ")) {
      i18nKey = raw;
      message = t(i18nKey, {}, raw);
    } else {
      message = raw;
    }
    if (typeof typeOrIsError === "boolean") {
      type = typeOrIsError ? "error" : "success";
    } else if (typeof typeOrIsError === "string") {
      type = typeOrIsError;
    }
  }

  if (!TYPE_CONFIG[type]) {
    type = "info";
  }

  const container = ensureToastContainer();
  const config = TYPE_CONFIG[type];

  const toast = document.createElement("div");
  toast.style.setProperty("z-index", "999999", "important");
  toast.className = `pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border ${config.border} ${config.bg} shadow-lg shadow-black/5 transform translate-x-[calc(100%+32px)] opacity-0 transition-all duration-500 ease-out backdrop-blur-md will-change-transform`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  // Escape HTML in message
  const div = document.createElement("div");
  div.textContent = message;
  const escapedMessage = div.innerHTML;

  toast.innerHTML = `
    <span class="material-symbols-outlined text-xl ${config.iconColor} shrink-0 mt-0.5">${config.icon}</span>
    <div class="toast-message-text text-xs font-semibold ${config.text} leading-relaxed flex-1" ${i18nKey ? `data-i18n="${i18nKey}"` : ""} ${Object.keys(i18nParams).length ? `data-i18n-params='${JSON.stringify(i18nParams)}'` : ""}>${escapedMessage}</div>
    <button type="button" class="toast-close-btn p-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0" aria-label="Close notification">
      <span class="material-symbols-outlined text-sm">close</span>
    </button>
  `;

  const dismiss = () => {
    toast.classList.remove("translate-x-0", "opacity-100");
    toast.classList.add("opacity-0", "translate-x-[calc(100%+32px)]");
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 500);
  };

  const closeBtn = toast.querySelector(".toast-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", dismiss);
  }

  container.appendChild(toast);
  void toast.offsetWidth;

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove("translate-x-[calc(100%+32px)]", "opacity-0");
    toast.classList.add("translate-x-0", "opacity-100");
  });

  if (timeout > 0) {
    setTimeout(dismiss, timeout);
  }

  return toast;
}

/**
 * Displays a bottom-right toast notification when user successfully registers for an event.
 * Contains direct link to /my-events.html with an action button.
 * @param {object|string} activityOrTitle - Activity object or string title.
 */
export function showEventRegisteredToast(activityOrTitle = {}) {
  const existing = document.querySelectorAll(".event-reg-toast");
  existing.forEach((t) => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  });

  const eventTitle =
    typeof activityOrTitle === "string"
      ? activityOrTitle
      : activityOrTitle?.title || activityOrTitle?.activityName || "";

  const eventId =
    typeof activityOrTitle === "object" && activityOrTitle !== null
      ? (activityOrTitle._id || activityOrTitle.id || activityOrTitle.activityID || "")
      : "";

  if (eventId) {
    try {
      sessionStorage.setItem("lastRegisteredEventId", String(eventId));
    } catch {}
  }

  const targetUrl = eventId
    ? `/my-events.html?event=${encodeURIComponent(eventId)}`
    : `/my-events.html`;

  const isVi = getLang() === "vi";
  const titleText = t(
    "explore.event_registered_toast_title",
    isVi ? "Đăng ký sự kiện thành công!" : "Event Registration Successful!"
  );

  let msgText = "";
  if (eventTitle) {
    msgText = isVi
      ? `Bạn đã đăng ký tham gia "${escapeHtml(eventTitle)}" thành công. Xem ticket tại mục My Events.`
      : `You have successfully registered for "${escapeHtml(eventTitle)}". View your ticket in My Events.`;
  } else {
    msgText = t(
      "explore.event_registered_toast_msg",
      isVi
        ? "Bạn đã đăng ký tham gia sự kiện thành công. Xem ticket tại mục My Events."
        : "You have successfully registered for this event. View your ticket in My Events."
    );
  }

  const btnText = t(
    "explore.event_registered_toast_btn",
    isVi ? "Xem ticket ở My Events" : "View Ticket in My Events"
  );

  const toast = document.createElement("div");
  toast.className = "event-reg-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  toast.innerHTML = `
    <div class="event-reg-toast-icon">
      <span class="material-symbols-outlined">confirmation_number</span>
    </div>
    <div class="event-reg-toast-body">
      <span class="event-reg-toast-title">${escapeHtml(titleText)}</span>
      <span class="event-reg-toast-desc">${msgText}</span>
      <a href="${targetUrl}" class="event-reg-toast-btn" id="eventRegToastBtn">
        <span class="material-symbols-outlined">local_activity</span>
        <span>${escapeHtml(btnText)}</span>
        <span class="material-symbols-outlined">arrow_forward</span>
      </a>
    </div>
    <button class="event-reg-toast-close" type="button" aria-label="Close notification">
      <span class="material-symbols-outlined">close</span>
    </button>
  `;

  document.body.appendChild(toast);

  // Force reflow so browser registers the initial offscreen position before sliding in
  void toast.offsetWidth;

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  let dismissTimer = null;
  const dismiss = () => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 750);
  };

  const startDismissTimer = () => {
    dismissTimer = setTimeout(dismiss, 8000);
  };

  const clearDismissTimer = () => {
    if (dismissTimer) clearTimeout(dismissTimer);
  };

  startDismissTimer();

  toast.addEventListener("mouseenter", clearDismissTimer);
  toast.addEventListener("mouseleave", startDismissTimer);

  toast.querySelector(".event-reg-toast-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearDismissTimer();
    dismiss();
  });

  const btn = toast.querySelector("#eventRegToastBtn");
  if (btn && (window.location.pathname.includes("my-events") || window.location.pathname.endsWith("/my-events"))) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      dismiss();
      if (typeof window.highlightTicket === "function" && eventId) {
        window.history.pushState({}, "", targetUrl);
        window.highlightTicket(eventId);
      } else {
        window.location.href = targetUrl;
      }
    });
  }

  return toast;
}

// Expose globally for pages using vanilla inline scripts
if (typeof window !== "undefined") {
  window.showToast = showToast;
  window.showEventRegisteredToast = showEventRegisteredToast;

  window.addEventListener("language-changed", () => {
    document.querySelectorAll(".toast-message-text[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (key) {
        let params = {};
        try {
          if (el.dataset.i18nParams) params = JSON.parse(el.dataset.i18nParams);
        } catch {}
        el.textContent = t(key, params, el.textContent);
      }
    });
  });
}
