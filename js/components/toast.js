/**
 * Global Toast Notification Service for SpringWave
 * Supports unified styling, accessible live regions, auto-dismiss, and flexible argument signatures.
 */

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
    "fixed top-5 right-5 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-40px)] sm:w-full pointer-events-none transition-all";
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

  if (typeof options === "object" && options !== null) {
    message = options.message || "";
    type = options.type || "info";
    timeout = options.duration || 3500;
  } else {
    message = String(options || "");
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
  toast.className = `pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border ${config.border} ${config.bg} shadow-lg shadow-black/5 transform translate-y-2 opacity-0 transition-all duration-300 backdrop-blur-md`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  // Escape HTML in message
  const div = document.createElement("div");
  div.textContent = message;
  const escapedMessage = div.innerHTML;

  toast.innerHTML = `
    <span class="material-symbols-outlined text-xl ${config.iconColor} shrink-0 mt-0.5">${config.icon}</span>
    <div class="text-xs font-semibold ${config.text} leading-relaxed flex-1">${escapedMessage}</div>
    <button type="button" class="toast-close-btn p-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0" aria-label="Close notification">
      <span class="material-symbols-outlined text-sm">close</span>
    </button>
  `;

  const dismiss = () => {
    toast.classList.add("opacity-0", "-translate-y-2");
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  };

  const closeBtn = toast.querySelector(".toast-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", dismiss);
  }

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  if (timeout > 0) {
    setTimeout(dismiss, timeout);
  }

  return toast;
}

// Expose globally for pages using vanilla inline scripts
if (typeof window !== "undefined") {
  window.showToast = showToast;
}
