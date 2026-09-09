/**
 * Explore page loading state helpers.
 * Renders skeleton activity cards directly into the #cards-container while
 * activities are being fetched, and gracefully clears them when content arrives.
 */

import { t } from "./i18n.js";

const SKELETON_COUNT_DESKTOP = 8;
const FALLBACK_MESSAGE = "Loading...";

export function buildSkeletonCard(delayIndex = 0) {
  const delay = (delayIndex % 8) * 60;
  return `
    <div class="explore-skeleton-card" style="animation-delay:${delay}ms">
      <div class="explore-skeleton-image-wrap">
        <div class="explore-skeleton-block explore-skeleton-image"></div>
        <div class="explore-skeleton-tag"></div>
      </div>
      <div class="explore-skeleton-body">
        <div class="explore-skeleton-block explore-skeleton-title"></div>
        <div class="explore-skeleton-block explore-skeleton-title short"></div>
        <div class="explore-skeleton-info-row">
          <div class="explore-skeleton-block explore-skeleton-icon"></div>
          <div class="explore-skeleton-block explore-skeleton-line wide"></div>
        </div>
        <div class="explore-skeleton-info-row">
          <div class="explore-skeleton-block explore-skeleton-icon"></div>
          <div class="explore-skeleton-block explore-skeleton-line medium"></div>
        </div>
        <div class="explore-skeleton-info-row">
          <div class="explore-skeleton-block explore-skeleton-icon"></div>
          <div class="explore-skeleton-block explore-skeleton-line short"></div>
        </div>
        <div class="explore-skeleton-footer">
          <div class="explore-skeleton-block explore-skeleton-button"></div>
          <div class="explore-skeleton-block explore-skeleton-star"></div>
        </div>
      </div>
    </div>
  `;
}

function resolveMessage(keyOrText) {
  if (!keyOrText) return "";
  if (keyOrText.includes(".") && !/[{}<>]/.test(keyOrText)) {
    const translated = t(keyOrText, {}, "");
    if (translated && translated !== keyOrText) return translated;
  }
  return keyOrText;
}

export function buildSkeletonHTML({ count } = {}) {
  const numCards = count ?? getCountForViewport();
  return Array.from({ length: numCards }, (_, i) => buildSkeletonCard(i)).join("");
}

export function getCountForViewport() {
  if (typeof window === "undefined") return SKELETON_COUNT_DESKTOP;
  const w = window.innerWidth;
  if (w < 640) return 4;
  if (w < 1024) return 6;
  return SKELETON_COUNT_DESKTOP;
}

/**
 * Show loading skeleton inside the cards container.
 * @param {HTMLElement|string|null} container - container element or id
 * @param {{ messageKey?: string, icon?: string, count?: number }} [options]
 */
export function showExploreLoading(container, options = {}) {
  const el = typeof container === "string"
    ? document.getElementById(container)
    : container;
  if (!el) return;
  const count = options.count ?? getCountForViewport();
  el.innerHTML = buildSkeletonHTML({ count });
  const pag = document.getElementById("pagination-container");
  if (pag) pag.innerHTML = "";
  const resultsCount = document.getElementById("resultsCount");
  if (resultsCount) {
    resultsCount.textContent = "...";
    resultsCount.dataset.loading = "1";
  }
}

/**
 * Mark loading skeleton as complete (used when actual content is about to render).
 */
export function hideExploreLoading() {
  const resultsCount = document.getElementById("resultsCount");
  if (resultsCount) delete resultsCount.dataset.loading;
}

/**
 * Kept for backwards compatibility with callers.
 */
export function bindLoadingLanguage(container, messageKey) {
  return () => {};
}

export function refreshExploreLoadingText(container, messageKey) {
  // Banner removed, no-op kept for API compatibility
}

export const EXPLORE_SKELETON_OPTIONS = {
  initial: { icon: "auto_awesome", messageKey: "explore.loading_events" },
  search: { icon: "search", messageKey: "explore.searching" },
  refresh: { icon: "refresh", messageKey: "explore.refreshing" },
  pagination: { icon: "sync", messageKey: "explore.loading_page" },
};

