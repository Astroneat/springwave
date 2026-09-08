import { fetchContent } from "../lib/utils.js";
import { canPerformAction, markActionPerformed } from "../lib/throttle.js";
import { sanitizeHtml } from "../lib/sanitize.js";
import { createDiscussionWithScope } from "../api/forum.js";
import { TURNSTILE_SITE_KEY } from "../config.js";
import { triggerBadgeCelebration } from "../components/badgeCelebration.js";
import { addBadgeNotification } from "../lib/notifications.js";
import { applyTranslation, t } from "../lib/i18n.js";

let isInitialized = false;

// We'll keep the DOM elements here
let overlay, backdrop, closeBtn, cancelBtn, publishBtn, titleInput, contentInput, tagsInput, eventInfo;
let currentActivity = null;

function renderEventInfo(activity) {
    if (!eventInfo || !activity) return;
    eventInfo.innerHTML = `
      <span class="material-symbols-outlined text-blue-600">event</span>
      <div class="forum-post-event-info">
        <span class="text-sm font-medium text-slate-800">${activity.title}</span>
        <span class="text-xs text-slate-500">${t("post_modal.linked_hint", "This discussion will be linked to this event")}</span>
      </div>
      <span class="material-symbols-outlined text-blue-600">check_circle</span>
    `;
}

async function ensurePostModalElements() {
    if (isInitialized) return;
    
    // Fetch and inject HTML if not present
    let existingOverlay = document.getElementById("explorePostOverlay");
    if (!existingOverlay) {
        const html = await fetchContent("./components/postModal.html");
        const div = document.createElement("div");
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    }

    overlay = document.getElementById("explorePostOverlay");
    backdrop = document.getElementById("explorePostBackdrop");
    closeBtn = document.getElementById("explorePostClose");
    cancelBtn = document.getElementById("explorePostCancel");
    publishBtn = document.getElementById("explorePostPublish");
    titleInput = document.getElementById("explorePostTitle");
    contentInput = document.getElementById("explorePostContent");
    tagsInput = document.getElementById("explorePostTags");
    eventInfo = document.getElementById("explorePostEventInfo");

    if (overlay) applyTranslation(overlay);

    closeBtn?.addEventListener("click", closePostModal);
    cancelBtn?.addEventListener("click", closePostModal);
    if (backdrop) backdrop.addEventListener("click", closePostModal);

    overlay?.setAttribute("role", "dialog");
    overlay?.setAttribute("aria-modal", "true");
    overlay?.setAttribute("aria-label", "Create Discussion Post");

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay && !overlay.classList.contains("hidden") && overlay.style.display !== "none") {
            closePostModal();
        }
    });

    const initModalTurnstile = () => {
        if (typeof turnstile !== "undefined" && document.getElementById("turnstile-container-modal")) {
            turnstile.render("#turnstile-container-modal", {
                sitekey: TURNSTILE_SITE_KEY,
                callback: function(token) { window._postModalTurnstileToken = token; },
            });
        }
    };

    if (typeof turnstile === "undefined" && !document.getElementById("turnstile-script-modal")) {
        const script = document.createElement("script");
        script.id = "turnstile-script-modal";
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = initModalTurnstile;
        document.head.appendChild(script);
    } else {
        initModalTurnstile();
    }

    publishBtn?.addEventListener("click", async () => {
        const check = canPerformAction('createDiscussion');
        if (!check.allowed) {
            alert(`Please wait ${check.remaining} seconds before posting.`);
            return;
        }
        markActionPerformed('createDiscussion');

        const title = sanitizeHtml(titleInput.value.trim());
        if (!title) { titleInput.focus(); return; }
        publishBtn.disabled = true;
        
        try {
            const result = await createDiscussionWithScope({
                title,
                content: sanitizeHtml(contentInput.value.trim() || ""),
                category: "event",
                tags: (tagsInput.value || "").split(",").map(t => sanitizeHtml(t.trim())).filter(Boolean),
                relatedEvent: currentActivity?.activityID || currentActivity?._id,
                scope: "general",
                cfTurnstileResponse: window._postModalTurnstileToken || "",
            });

            if (!result) {
                alert("Failed to post discussion. Please try again.");
                return;
            }

            if (typeof turnstile !== "undefined" && document.getElementById("turnstile-container-modal")) {
                turnstile.reset("#turnstile-container-modal");
                window._postModalTurnstileToken = "";
            }

            closePostModal();

            result.relatedEvent = currentActivity?.activityID || currentActivity?._id;
            result._event = {
                title: currentActivity?.title || "",
                date: currentActivity?.heldDate || "",
                attendees: currentActivity?.participants || 0,
            };
            if (!result.tags) result.tags = (tagsInput.value || "").split(",").map(t => t.trim()).filter(Boolean);
            if (!result.category) result.category = "event";
            if (!result.lastActivity) result.lastActivity = "Just now";
            if (!result.replies) result.replies = 0;
            result.id = result.id || result._id;

            try { sessionStorage.setItem("springwave_pending_discussion", JSON.stringify(result)); } catch {}
            try {
                result._storedAt = Date.now();
                const stored = JSON.parse(localStorage.getItem("springwave_event_discussions") || "[]");
                const idx = stored.findIndex(d => (d.id || d._id) === (result.id || result._id));
                if (idx === -1) stored.unshift(result);
                else stored[idx] = result;
                localStorage.setItem("springwave_event_discussions", JSON.stringify(stored));
            } catch {}

            const discId = result._id || result.id;
            showSuccessToast(
                t("post_modal.toast_success", "Discussion posted successfully! Click here to view"),
                discId ? `./community.html?discussion=${discId}` : null,
                t("post_modal.toast_view", "View Discussion Detail")
            );

            if (result?.newBadges && Array.isArray(result.newBadges) && result.newBadges.length > 0) {
                result.newBadges.forEach((badgeKey) => {
                    addBadgeNotification(badgeKey, badgeKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
                    triggerBadgeCelebration(badgeKey);
                });
            }
        } catch (err) {
            alert(err?.message || "Failed to post discussion. Please try again.");
        } finally {
            publishBtn.disabled = false;
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay?.classList.contains("active")) closePostModal();
    });

    isInitialized = true;
}

export async function openPostModal(activity) {
    if (!activity) return;
    await ensurePostModalElements();
    
    currentActivity = activity;
    
    titleInput.value = "";
    contentInput.value = "";
    tagsInput.value = "";
    renderEventInfo(activity);
    
    overlay.style.display = "flex";
    requestAnimationFrame(() => overlay.classList.add("active"));
    document.body.style.overflow = "hidden";
}

function closePostModal() {
    if (!overlay) return;
    overlay.classList.remove("active");
    setTimeout(() => { overlay.style.display = "none"; }, 300);
    // Don't remove overflow hidden if the event popup is still open!
    // Since eventPopup also manages overflow, we should only reset it if no other popups are active.
    // For now, let's assume we can just remove it, but check if popup-overlay is active.
    const eventPopupOverlay = document.getElementById("popup-overlay");
    if (!eventPopupOverlay || !eventPopupOverlay.classList.contains("active")) {
        document.body.style.overflow = "";
    }
}

function showSuccessToast(message, linkUrl, linkText = "View Discussion Detail") {
    const existing = document.querySelectorAll(".success-toast");
    const offset = existing.length * 80;
    const toast = document.createElement("div");
    toast.className = "success-toast";
    toast.style.bottom = `${24 + offset}px`;
    toast.innerHTML = `
      <div class="success-toast-icon">
        <span class="material-symbols-outlined">check_circle</span>
      </div>
      <div class="success-toast-body">
        <span class="success-toast-heading">${t("common.success", "Success!")}</span>
        <span class="success-toast-message">${message}</span>
        ${linkUrl ? `<span class="success-toast-link">${linkText || "View Discussion Detail"}</span>` : ""}
      </div>
      <button class="success-toast-close" type="button" aria-label="Close notification">
        <span class="material-symbols-outlined">close</span>
      </button>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));

    const closeToast = () => {
      toast.classList.add("hiding");
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    };

    const handleNavigate = () => {
      closeToast();
      if (!linkUrl) return;

      const isCommunityPage = window.location.pathname.includes("community.html") || window.location.pathname.endsWith("/community") || window.location.pathname === "/community";
      if (isCommunityPage) {
        try {
          const url = new URL(linkUrl, window.location.origin);
          const discId = url.searchParams.get("discussion");
          const commentId = url.searchParams.get("comment");
          if (discId && typeof window.scrollToAndOpenDiscussion === "function") {
            window.history.pushState({}, "", linkUrl);
            window.scrollToAndOpenDiscussion(discId, commentId);
            return;
          }
        } catch (err) {
          console.warn("Failed to parse discussion URL in toast:", err);
        }
      }
      window.location.href = linkUrl;
    };

    const closeBtn = toast.querySelector(".success-toast-close");
    closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeToast();
    });

    if (linkUrl) {
      toast.addEventListener("click", (e) => {
        if (e.target.closest(".success-toast-close")) return;
        handleNavigate();
      });
      toast.style.cursor = "pointer";
    }

    // Auto remove after 6 seconds
    setTimeout(() => {
      if (document.body.contains(toast)) {
        closeToast();
      }
    }, 6000);
}

if (typeof window !== "undefined") {
    window.addEventListener("language-changed", () => {
        if (overlay) applyTranslation(overlay);
        if (currentActivity) renderEventInfo(currentActivity);
    });
}
