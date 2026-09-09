/**
 * Global Page & API Transition Progress Bar Loader (Zero dependencies)
 */

let progressEl = null;
let progressVal = 0;
let progressTimer = null;
let activeRequests = 0;

function ensureProgressBar() {
  if (progressEl) return progressEl;

  progressEl = document.createElement("div");
  progressEl.id = "top-progress-bar";
  progressEl.className = "fixed top-0 left-0 h-[3px] bg-primary z-[99999] transition-all duration-300 ease-out opacity-0 pointer-events-none";
  progressEl.style.width = "0%";

  if (document.body) {
    document.body.prepend(progressEl);
  } else {
    document.addEventListener("DOMContentLoaded", () => document.body.prepend(progressEl));
  }
  return progressEl;
}

export function startProgress() {
  const el = ensureProgressBar();
  if (!el) return;

  activeRequests++;
  if (activeRequests === 1) {
    clearInterval(progressTimer);
    progressVal = 15;
    el.style.width = `${progressVal}%`;
    el.style.opacity = "1";

    progressTimer = setInterval(() => {
      if (progressVal < 85) {
        progressVal += Math.random() * 10;
        el.style.width = `${progressVal}%`;
      }
    }, 200);
  }
}

export function completeProgress() {
  const el = ensureProgressBar();
  if (!el) return;

  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) {
    clearInterval(progressTimer);
    progressVal = 100;
    el.style.width = "100%";

    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => {
        el.style.width = "0%";
        progressVal = 0;
      }, 300);
    }, 200);
  }
}

const prefetchedUrls = new Set();

function prefetchLink(url) {
  if (!url || prefetchedUrls.has(url)) return;
  prefetchedUrls.add(url);
  try {
    const linkEl = document.createElement("link");
    linkEl.rel = "prefetch";
    linkEl.href = url;
    document.head.appendChild(linkEl);
  } catch (e) {}
}

// Auto-intercept page link clicks for smooth transition visual feedback & hover prefetching
export function initPageTransition() {
  ensureProgressBar();

  document.addEventListener("mouseover", (e) => {
    const link = e.target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href");
    if (
      href &&
      !href.startsWith("#") &&
      !href.startsWith("javascript:") &&
      !href.startsWith("mailto:") &&
      !href.startsWith("tel:") &&
      link.target !== "_blank"
    ) {
      prefetchLink(href);
    }
  });

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      link.target === "_blank" ||
      link.hasAttribute("download")
    ) {
      return;
    }

    // Local navigation link clicked -> start loading progress & smooth body fade
    startProgress();
    if (document.body) {
      document.body.style.transition = "opacity 0.15s ease-out";
    }
  });

  window.addEventListener("beforeunload", () => {
    startProgress();
  });
}

if (typeof window !== "undefined") {
  window.startProgress = startProgress;
  window.completeProgress = completeProgress;
}
