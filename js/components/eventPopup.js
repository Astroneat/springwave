import { sanitizeHtml } from "../lib/sanitize.js";
import { getActivityById, checkParticipation, unparticipateActivity, participateActivity, getEventComments, addEventComment, getSimilarEvents } from "../api/activities.js";
import { addFavourite, removeFavourite, checkFavourite, getParticipatedActivities, getFavourites } from "../api/user.js";
import { CDN_DOMAIN } from "../config.js";
import { t, getLang, applyTranslation, getCategoryName } from "../lib/i18n.js";
import { isAuthenticated, getUser, isProfileComplete, isStudentVerified, hasUserCompletedQuiz } from "../lib/session.js";
import { formatDate, capitalize, timeAgo, isToday, isPastDate, getEventStatus } from "../lib/utils.js";
import { openPostModal } from "./postModal.js";
import { explainRecommendation } from "../api/recommendations.js";
import { getMyProfile } from "../api/profile.js";
import { showLoginPrompt } from "./authModal.js";
import { showQuizPrompt } from "./quizModal.js";

let userParticipatedIds = null;
let userFavouriteIds = null;
let prefetchPromise = null;
let activeOnCloseCallback = null;
let underlyingModalToRestore = null;
let currentOpenActivity = null;
let currentBackText = "";
const activityCache = new Map();
const aiMatchSnapshots = new Map();

if (typeof window !== "undefined") {
    window.openEventPopup = openEventPopup;
    window.closeEventPopup = closeEventPopup;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function ensurePrefetchedData() {
    if (!isAuthenticated()) {
        userParticipatedIds = new Set();
        userFavouriteIds = new Set();
        return Promise.resolve();
    }
    if (prefetchPromise) return prefetchPromise;

    prefetchPromise = (async () => {
        try {
            const [partResp, favResp] = await Promise.all([
                getParticipatedActivities().catch(() => ({ events: [] })),
                getFavourites().catch(() => ({ activities: [] }))
            ]);
            userParticipatedIds = new Set((partResp?.events || []).map(e => String(e._id || e.activityID)));
            userFavouriteIds = new Set((favResp?.activities || []).map(e => String(e._id || e.activityID)));
        } catch (err) {
            console.error("Failed to prefetch participation/favorites data:", err);
            userParticipatedIds = userParticipatedIds || new Set();
            userFavouriteIds = userFavouriteIds || new Set();
            prefetchPromise = null;
        }
    })();

    return prefetchPromise;
}

// Prefetch immediately if user is authenticated
if (isAuthenticated()) {
    ensurePrefetchedData().catch(() => {});
}

// Unverified students are view-only: prompt + redirect to the verify page.
async function requireVerifiedOrRedirect() {
    if (!isAuthenticated()) {
        showLoginPrompt({
            message: t("auth_modal.desc_participate", "Vui lòng đăng nhập để đăng ký và tham gia hoạt động."),
            redirectUrl: window.location.href
        });
        return false;
    }
    if (isStudentVerified(getUser())) return true;
    try {
        const { getCurrentUser } = await import("../api/auth.js");
        const { setUser } = await import("../lib/session.js");
        const res = await getCurrentUser();
        if (res?.user) {
            setUser(res.user);
            if (isStudentVerified(res.user)) return true;
        }
    } catch {}
    alert(t("student_verify.alert_require_verify", "You need to verify your student status to join activities!"));
    window.location.href = "/student-verify.html";
    return false;
}

// Ensure overlay and container exist
function ensurePopupElements() {
    let overlay = document.getElementById("popup-overlay");
    let container = document.getElementById("popup-container");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "popup-overlay";
        overlay.className = "popup-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Event details");
        overlay.hidden = true;
        document.body.appendChild(overlay);
    } else {
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Event details");
    }
    if (!container) {
        container = document.createElement("div");
        container.id = "popup-container";
        container.className = "popup-container";
        overlay.appendChild(container);
    }

    // Bind overlay click once
    if (!overlay.dataset.bound) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay || e.target.classList.contains("popup-backdrop")) {
                e.stopPropagation();
                closeEventPopup();
            }
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                const ov = document.getElementById("popup-overlay");
                if (ov && ov.classList.contains("active")) {
                    e.stopImmediatePropagation();
                    closeEventPopup();
                }
            }
        });
        overlay.dataset.bound = "true";
    }

    return { overlay, container };
}

export async function openEventPopup(activityID, options = {}) {
    if (!activityID) return;
    const { overlay, container } = ensurePopupElements();

    activeOnCloseCallback = options.onClose || null;

    // Detect and hide any currently active modal/popup (e.g. Favourites, Discussion, Profile)
    const activeModals = Array.from(document.querySelectorAll(
        ".popup-overlay.active:not(#popup-overlay), .forum-post-overlay.active:not(#popup-overlay), .modal.active:not(#popup-overlay), .edit-modal-overlay.active, #global-favourites-overlay.active, #discussionPopupOverlay.active, #profileModalOverlay.active, #post-modal-overlay.active, #swipe-modal:not(.hidden)"
    ));

    if (activeModals.length > 0) {
        underlyingModalToRestore = activeModals[activeModals.length - 1];
        underlyingModalToRestore.classList.remove("active");
        underlyingModalToRestore.setAttribute("hidden", "true");
        if (underlyingModalToRestore.id === "swipe-modal") {
            underlyingModalToRestore.classList.add("hidden");
        }
    } else {
        underlyingModalToRestore = null;
    }

    const backText = options.backText || t("explore.back") || "Back";

    container.innerHTML = `
        <div class="popup-loading-container">
            <div class="editorial-spinner"></div>
            <p class="text-xs font-semibold text-slate-400 mt-3 animate-pulse">${t("event_popup.loading", "Loading event details...")}</p>
        </div>
    `;
    overlay.style.zIndex = "12500";
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    // Allow passing activityData directly if already fetched to save network roundtrip
    let activity = options.activityData;
    if (!activity && activityCache.has(activityID)) {
        activity = activityCache.get(activityID);
    }

    // Check if the activity object is incomplete (e.g. organization is just an unpopulated ID string without a name)
    const hasIncompleteOrg = activity && activity.organization && (typeof activity.organization !== 'object' || !activity.organization?.name);
    const isCachedOrPassed = !!activity && !hasIncompleteOrg;

    // Prefetch user participation/favorites in parallel with fetching activity data
    const activityPromise = (activity && !hasIncompleteOrg)
        ? Promise.resolve(activity) 
        : getActivityById(activityID).then(resp => {
            const act = resp.activity;
            if (act) activityCache.set(activityID, act);
            return act;
          }).catch(() => null);
    
    const prefetchPromise = isAuthenticated() ? ensurePrefetchedData() : Promise.resolve();

    const [fetchedActivity] = await Promise.all([activityPromise, prefetchPromise]);
    activity = fetchedActivity;

    if (!activity) {
        closeEventPopup();
        return;
    }

    currentOpenActivity = activity;
    currentBackText = backText;

    container.innerHTML = buildPopupHTML(activity, backText);

    initParticipateButton(activityID);
    disableParticipationButtons(activity);

    // If we used cached or passed data, revalidate in the background
    if (isCachedOrPassed) {
        getActivityById(activityID).then(resp => {
            const freshActivity = resp.activity;
            if (freshActivity) {
                activityCache.set(activityID, freshActivity);
                currentOpenActivity = freshActivity;
                updatePopupWithFreshData(freshActivity);
            }
        }).catch(err => console.warn("Failed to revalidate activity details:", err));
    }

    bindPopupInteractiveElements(container, activity, activityID, options);
}

function bindPopupInteractiveElements(container, activity, activityID, options = {}) {
    container.querySelectorAll("#back-btn, .event-modal-close-btn").forEach(btn => {
        btn.addEventListener("click", closeEventPopup);
    });

    // Social share buttons
    container.querySelectorAll(".event-share-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const currentBtn = e.currentTarget;
            const title = activity.title || "SpringWave Event";
            const url = `${window.location.origin}/explore.html?event=${activityID}`;
            if (navigator.share) {
                navigator.share({ title, url }).catch(() => { });
            } else {
                navigator.clipboard.writeText(url).then(() => {
                    const orig = currentBtn.innerHTML;
                    currentBtn.innerHTML = `<i class="fa-solid fa-check text-emerald-600"></i> <span>${t("event_popup.copied", "Copied!")}</span>`;
                    setTimeout(() => { currentBtn.innerHTML = orig; }, 2000);
                }).catch(() => { });
            }
        });
    });

    container.querySelectorAll(".discuss-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            openPostModal(activity);
        });
    });

    initAIMatchButton(container, activityID);
    initEventComments(activityID, container);
    loadSimilarEvents(activityID);

    if (isAuthenticated()) {
        if (userParticipatedIds && userParticipatedIds.has(String(activityID))) {
            setParticipated(activity);
        }
        if (userFavouriteIds && userFavouriteIds.has(String(activityID))) {
            setFavourited();
        }
    }

    // Banner Fullscreen Lightbox
    const coverWrapper = container.querySelector("#event-cover-wrapper");
    if (coverWrapper) {
        const bannerUrl = activity.thumbnail || 'https://images.unsplash.com/photo-1618477462146-050d2767eac4?q=80&w=1200&auto=format&fit=crop';
        const triggerLightbox = (e) => {
            if (e.target.closest(".event-modal-close-btn") || e.target.closest("#back-btn")) return;
            openImageLightbox(bannerUrl, activity.title);
        };
        coverWrapper.addEventListener("click", triggerLightbox);
        coverWrapper.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                triggerLightbox(e);
            }
        });
    }

    const favoriteBtns = container.querySelectorAll(".favorite-btn");
    favoriteBtns.forEach(btn => {
        btn.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!isAuthenticated()) {
                showLoginPrompt({
                    message: t("auth_modal.desc_favorite", "Vui lòng đăng nhập để lưu hoạt động yêu thích."),
                    redirectUrl: window.location.href
                });
                return;
            }
            const isActive = btn.classList.contains("active");
            favoriteBtns.forEach(b => b.classList.toggle("active"));

            if (options.onFavouriteToggle) {
                options.onFavouriteToggle(activityID, !isActive);
            }

            try {
                if (isActive) await removeFavourite(activityID);
                else await addFavourite(activityID);
            } catch (err) {
                favoriteBtns.forEach(b => b.classList.toggle("active"));
                if (options.onFavouriteToggle) {
                    options.onFavouriteToggle(activityID, isActive);
                }
                console.error("Failed to toggle favourite:", err);
            }
        });
    });
}

export function openImageLightbox(src, alt = "Event banner") {
    if (!src) return;
    let lightbox = document.getElementById("event-image-lightbox");
    if (!lightbox) {
        lightbox = document.createElement("div");
        lightbox.id = "event-image-lightbox";
        lightbox.className = "event-image-lightbox";
        lightbox.setAttribute("role", "dialog");
        lightbox.setAttribute("aria-modal", "true");
        lightbox.setAttribute("aria-label", "Full size image preview");
        document.body.appendChild(lightbox);
    }

    lightbox.innerHTML = `
        <div class="lightbox-backdrop"></div>
        <div class="lightbox-content">
            <div class="lightbox-actions-top">
                <a href="${src}" target="_blank" rel="noopener noreferrer" class="lightbox-action-btn" title="Open original in new tab">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    <span>${t("event_popup.open_full", "Open full")}</span>
                </a>
            </div>
            <button type="button" class="lightbox-close-btn" aria-label="Close image preview" title="Close">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <img src="${src}" alt="${escapeHtml(alt)}" class="lightbox-img" />
        </div>
    `;

    lightbox.classList.add("active");

    const closeLightbox = () => {
        lightbox.classList.remove("active");
        setTimeout(() => {
            lightbox.innerHTML = "";
        }, 250);
        document.removeEventListener("keydown", handleKeydown);
    };

    const handleKeydown = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            closeLightbox();
        }
    };

    document.addEventListener("keydown", handleKeydown);

    lightbox.querySelector(".lightbox-backdrop")?.addEventListener("click", closeLightbox);
    lightbox.querySelector(".lightbox-close-btn")?.addEventListener("click", closeLightbox);
}

export function closeEventPopup() {
    currentOpenActivity = null;
    currentBackText = "";
    const overlay = document.getElementById("popup-overlay");
    const container = document.getElementById("popup-container");
    if (!overlay || !container) return;

    overlay.classList.remove("active");
    overlay.style.zIndex = "";

    // Restore any underlying modal that was paused
    if (underlyingModalToRestore) {
        const modal = underlyingModalToRestore;
        underlyingModalToRestore = null;
        modal.removeAttribute("hidden");
        if (modal.id === "swipe-modal") {
            modal.classList.remove("hidden");
        }
        void modal.offsetWidth;
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    } else {
        const hasOtherModal = !!document.querySelector(
            ".popup-overlay.active:not(#popup-overlay), .forum-post-overlay.active:not(#popup-overlay), .modal.active:not(#popup-overlay), .edit-modal-overlay.active, #global-favourites-overlay.active, #discussionPopupOverlay:not([hidden]):not(.hidden), #profileModalOverlay:not([hidden]):not(.hidden), #post-modal-overlay.active, #swipe-modal:not(.hidden)"
        );
        if (!hasOtherModal) {
            document.body.style.overflow = "";
        } else {
            document.body.style.overflow = "hidden";
        }
    }

    if (typeof activeOnCloseCallback === "function") {
        const cb = activeOnCloseCallback;
        activeOnCloseCallback = null;
        try { cb(); } catch (err) { console.error("Error in onClose callback:", err); }
    }

    setTimeout(() => {
        container.innerHTML = "";
        overlay.setAttribute("hidden", "");
    }, 300);
}

function buildAttachmentsHTML(attachments) {
    return (attachments || []).map(f => {
        const link = f.link || f.activityAttachLink || "";
        const fileName = decodeURIComponent(link.split('/').pop());
        const href = (link.startsWith("http://") || link.startsWith("https://")) ? link : `${CDN_DOMAIN}/${link}`;
        return `
        <a class="event-file-card" href="${href}" target="_blank" download>
            <div class="event-file-icon">
                <i class="fa-solid fa-file-arrow-down"></i>
            </div>
            <div class="event-file-meta">
                <span class="event-file-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
                <span class="event-file-subtext">${t("event_popup.download_hint", "Click to download resource")}</span>
            </div>
            <div class="event-file-download-icon">
                <i class="fa-solid fa-arrow-down"></i>
            </div>
        </a>`;
    }).join("");
}

function updatePopupWithFreshData(a) {
    const container = document.getElementById("popup-container");
    if (!container) return;

    // Update participant count & slots progress
    const participantCount = a.participants?.length || 0;
    const slotsRows = container.querySelectorAll(".event-slots-row");
    if (slotsRows.length > 0 && a.slots) {
        slotsRows.forEach(row => {
            row.dataset.totalSlots = a.slots;
            const totalEl = row.querySelector(".slots-total-val");
            if (totalEl) totalEl.textContent = a.slots;
        });
    } else if (a.slots && Number(a.slots) > 0) {
        // Upgrade any standard capacity row to the slots row
        container.querySelectorAll(".event-sidebar-details-list").forEach(list => {
            const rows = list.querySelectorAll(".event-sidebar-info-row");
            rows.forEach(r => {
                if (r.querySelector(".sidebar-info-icon.capacity")) {
                    r.outerHTML = buildParticipantsAndSlotsHTML(a, participantCount);
                }
            });
        });
    }
    updateEventCountUI(participantCount);

    // Update description
    const descEl = container.querySelector(".popup-description-val");
    if (descEl && a.description) {
        descEl.innerHTML = a.description.split('\n').filter(p => p.trim()).map(p => `<p>${escapeHtml(p)}</p>`).join('');
    }

    // Update attachments
    const filesHTML = buildAttachmentsHTML(a.attachments);
    const filesEl = container.querySelector(".popup-files-val");
    const sectionEl = container.querySelector(".popup-attachments-section");
    const countEl = container.querySelector(".attachments-count");
    
    if (filesEl && a.attachments && a.attachments.length > 0) {
        filesEl.innerHTML = filesHTML;
        if (countEl) countEl.textContent = `(${(a.attachments || []).length})`;
        if (sectionEl) sectionEl.style.display = "";
    } else {
        if (sectionEl) sectionEl.style.display = "none";
    }

    // Update Host Card when fresh data arrives
    const isNonPartner = a.isNonPartner === true;
    const hostOrgName = typeof a.organization === 'object' ? a.organization?.name : null;
    const hostUnitName = isNonPartner 
        ? (a.hostName || a.createdByName || t("common.unknown")) 
        : (hostOrgName || a.hostName || (a.organization ? t("common.organization", "Organization") : a.createdByName) || t("common.unknown"));
    const hostAvatar = isNonPartner ? null : (typeof a.organization === 'object' && a.organization?.avatar ? a.organization.avatar : null);
    const orgId = typeof a.organization === 'object' ? a.organization?._id : (typeof a.organization === 'string' && a.organization ? a.organization : null);

    const hostCard = container.querySelector(".event-host-card");
    if (hostCard) {
        const hostNameEl = hostCard.querySelector(".event-host-name");
        if (hostNameEl && hostUnitName) hostNameEl.textContent = hostUnitName;

        const avatarWrapper = hostCard.querySelector(".event-host-avatar");
        if (avatarWrapper) {
            if (hostAvatar) {
                avatarWrapper.className = "event-host-avatar";
                avatarWrapper.innerHTML = `<img src="${escapeAttr(hostAvatar)}" alt="${escapeHtml(hostUnitName)}" />`;
            } else {
                avatarWrapper.className = "event-host-avatar initial";
                avatarWrapper.textContent = (hostUnitName[0] || 'U').toUpperCase();
            }
        }

        const existingLink = hostCard.querySelector(".event-host-profile-link");
        if (!isNonPartner && orgId) {
            if (existingLink) {
                existingLink.href = `/org-profile.html?orgId=${orgId}`;
            } else {
                const link = document.createElement("a");
                link.href = `/org-profile.html?orgId=${orgId}`;
                link.className = "event-host-profile-link";
                link.title = "View organization profile";
                link.innerHTML = `<span>Organizer Profile</span><i class="fa-solid fa-arrow-right"></i>`;
                hostCard.appendChild(link);
            }
        } else if (existingLink) {
            existingLink.remove();
        }
    }
}

function getSolidColorClass(pct) {
    if (pct >= 100) return 'fill-full';
    if (pct >= 85) return 'fill-warning';
    return 'fill-normal';
}

function getSolidTagHTML(participantCount, totalSlots) {
    if (participantCount >= totalSlots) {
        return `<span class="event-slots-tag full">${t("explore.slots_full", "Đã hết chỗ")}</span>`;
    }
    const pct = Math.min(100, Math.round((participantCount / totalSlots) * 100));
    const remaining = Math.max(0, totalSlots - participantCount);
    if (pct >= 85) {
        return `<span class="event-slots-tag warning">${t("explore.slots_almost_full", "Sắp hết chỗ")}</span>`;
    }
    return `<span class="event-slots-tag available">${t("explore.slots_left", { n: remaining }, `Còn ${remaining} chỗ`)}</span>`;
}

function buildParticipantsAndSlotsHTML(a, participantCount) {
    if (a.isNonPartner) return '';
    const totalSlots = (a.slots !== undefined && a.slots !== null && Number(a.slots) > 0) ? Number(a.slots) : 0;

    if (totalSlots > 0) {
        const pct = Math.min(100, Math.round((participantCount / totalSlots) * 100));
        const colorClass = getSolidColorClass(pct);
        const tagHTML = getSolidTagHTML(participantCount, totalSlots);
        const unit = t("explore.slots_unit", "chỗ");

        return `
        <div class="event-sidebar-info-row event-slots-row" data-total-slots="${totalSlots}">
            <div class="sidebar-info-icon capacity"><i class="fa-solid fa-users"></i></div>
            <div class="sidebar-info-meta">
                <div class="event-slots-wrapper">
                    <div class="event-slots-header">
                        <span class="sidebar-info-label">${t("explore.slots_capacity", "Participants")}</span>
                        <div class="event-slots-tag-container">${tagHTML}</div>
                    </div>
                    <div class="event-slots-header">
                        <div class="event-slots-ratio">
                            <span class="participants-count-val" data-count="${participantCount}">${participantCount}</span>
                            <span class="slots-total">/ <span class="slots-total-val">${totalSlots}</span> ${unit}</span>
                        </div>
                        <span class="event-slots-pct text-[11px] font-bold text-slate-600">${pct}%</span>
                    </div>
                    <div class="event-slots-track" role="progressbar" aria-valuenow="${participantCount}" aria-valuemin="0" aria-valuemax="${totalSlots}">
                        <div class="event-slots-fill ${colorClass}" style="width: ${pct}%"></div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    return `
    <div class="event-sidebar-info-row">
        <div class="sidebar-info-icon capacity"><i class="fa-solid fa-users"></i></div>
        <div class="sidebar-info-meta">
            <span class="sidebar-info-label">${t("description.participants", "Registered")}</span>
            <p class="sidebar-info-value participants-count-val" data-count="${participantCount}">${t("explore.registered_count", { n: participantCount }, `${participantCount} students`)}</p>
        </div>
    </div>`;
}

function updateEventCountUI(count) {
    const valEls = document.querySelectorAll(".participants-count-val");
    valEls.forEach(el => {
        el.dataset.count = count;
    });

    const slotsRows = document.querySelectorAll(".event-slots-row");
    if (slotsRows.length > 0) {
        slotsRows.forEach(row => {
            const totalSlots = parseInt(row.dataset.totalSlots, 10);
            if (!isNaN(totalSlots) && totalSlots > 0) {
                const pct = Math.min(100, Math.round((count / totalSlots) * 100));
                const countVal = row.querySelector(".participants-count-val");
                if (countVal) countVal.textContent = count;

                const pctEl = row.querySelector(".event-slots-pct");
                if (pctEl) pctEl.textContent = `${pct}%`;

                const fillEl = row.querySelector(".event-slots-fill");
                if (fillEl) {
                    fillEl.style.width = `${pct}%`;
                    fillEl.classList.remove("fill-normal", "fill-warning", "fill-full");
                    fillEl.classList.add(getSolidColorClass(pct));
                }

                const trackEl = row.querySelector(".event-slots-track");
                if (trackEl) {
                    trackEl.setAttribute("aria-valuenow", count);
                }

                const tagContainer = row.querySelector(".event-slots-tag-container");
                if (tagContainer) {
                    tagContainer.innerHTML = getSolidTagHTML(count, totalSlots);
                }
            }
        });
    } else {
        valEls.forEach(el => {
            el.textContent = t("explore.registered_count", { n: count }, `${count} students`);
        });
    }
}

function buildPopupHTML(a, backText) {
    const status = getEventStatus(a);
    const heldDate = formatDate(a.heldDate);
    const endDateFormatted = a.heldDateEnd ? formatDate(a.heldDateEnd) : null;
    const deadlineFormatted = a.applicationDeadline ? formatDate(a.applicationDeadline) : null;
    const type = getCategoryName(a.category || a.type || "Activity");
    const hasCoords = a.locationLat && a.locationLng;
    const googleMapsLink = hasCoords
        ? `https://www.google.com/maps?q=${a.locationLat},${a.locationLng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.location)}`;

    let statusBadgeHTML = "";
    if (status === 'ongoing') {
        statusBadgeHTML = `<span class="event-pill-badge status ongoing"><i class="fa-solid fa-circle-play animate-pulse"></i><span>${t("explore.ongoing") || "Ongoing"}</span></span>`;
    } else if (status === 'registration_closed') {
        statusBadgeHTML = `<span class="event-pill-badge status closed"><i class="fa-solid fa-user-xmark"></i><span>${t("explore.registration_closed") || "Registration Closed"}</span></span>`;
    } else if (status === 'ended') {
        statusBadgeHTML = `<span class="event-pill-badge status ended"><i class="fa-solid fa-clock-rotate-left"></i><span>${t("explore.ended") || "Ended"}</span></span>`;
    } else {
        statusBadgeHTML = `<span class="event-pill-badge status open"><i class="fa-solid fa-circle-check"></i><span>${t("explore.registration_open") || "Open for Registration"}</span></span>`;
    }

    const filesHTML = buildAttachmentsHTML(a.attachments);
    const tagsHTML = (a.tags || []).map(tag => `<span class="event-modern-tag">${escapeHtml(tag)}</span>`).join("");
    const participantCount = a.participants?.length || 0;

    const isNonPartner = a.isNonPartner === true;
    const hostOrgName = typeof a.organization === 'object' ? a.organization?.name : null;
    const hostUnitName = isNonPartner 
        ? (a.hostName || a.createdByName || t("common.unknown")) 
        : (hostOrgName || a.hostName || (a.organization ? t("common.organization", "Organization") : a.createdByName) || t("common.unknown"));
    const hostAvatar = isNonPartner ? null : (typeof a.organization === 'object' && a.organization?.avatar ? a.organization.avatar : null);
    const orgId = typeof a.organization === 'object' ? a.organization?._id : (typeof a.organization === 'string' && a.organization ? a.organization : null);

    const extUrl = isNonPartner ? (a.registrationLink || a.source?.url || '') : (a.source?.url || '');
    const participateBtnText = isNonPartner ? (t("explore.register_external", "Đăng ký tại trang gốc") || "Đăng ký tại trang gốc") : (extUrl ? t("explore.explore_more", "Explore more") : t("explore.participate", "Register for Event"));
    const participateBtnIcon = extUrl ? 'arrow-up-right-from-square' : 'circle-check';

    const isParticipating = isAuthenticated() && userParticipatedIds && userParticipatedIds.has(String(a.activityID || a._id));
    const isFavourited = isAuthenticated() && userFavouriteIds && userFavouriteIds.has(String(a.activityID || a._id));
    const finalParticipateBtnText = isParticipating ? (t("explore.participated") || "Joined ✓") : participateBtnText;

    const hostAvatarHTML = hostAvatar 
        ? `<div class="event-host-avatar"><img src="${hostAvatar}" alt="${escapeHtml(hostUnitName)}" /></div>`
        : `<div class="event-host-avatar initial">${(hostUnitName[0] || 'U').toUpperCase()}</div>`;

    return `
    <div class="event-modal-shell">
        <!-- Cover Banner -->
        <div class="event-modal-cover-wrapper" id="event-cover-wrapper" role="button" tabindex="0" title="Click to view full banner">
            <img src="${a.thumbnail || 'https://images.unsplash.com/photo-1618477462146-050d2767eac4?q=80&w=1200&auto=format&fit=crop'}" alt="${escapeHtml(a.title)}" class="event-modal-cover-img" />
            <div class="event-modal-cover-gradient"></div>
            <div class="event-modal-expand-hint">
                <i class="fa-solid fa-expand"></i>
                <span>${t("explore.view_full_banner", "View full banner")}</span>
            </div>
            
            <!-- Top Right Close Button -->
            <button type="button" class="event-modal-close-btn" id="back-btn" aria-label="Close modal" title="${backText}">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <!-- Bottom Badges on Cover -->
            <div class="event-modal-badges">
                <span class="event-pill-badge category"><i class="fa-solid fa-tag"></i> ${type}</span>
                ${statusBadgeHTML}
                ${isNonPartner ? `<span class="event-pill-badge non-partner"><i class="fa-solid fa-arrow-up-right-from-square"></i> Non-Partner</span>` : ''}
            </div>
        </div>

        <!-- Main Layout Body -->
        <div class="event-modal-body">
            <div class="event-modal-main-col">
                
                <!-- Title & Tags -->
                <div class="event-modal-header-block">
                    <h1 class="event-modal-title">${escapeHtml(a.title)}</h1>
                    ${tagsHTML ? `<div class="event-modal-tags">${tagsHTML}</div>` : ''}
                </div>

                <!-- Host / Organizer Card -->
                <div class="event-host-card">
                    ${hostAvatarHTML}
                    <div class="event-host-meta">
                        <span class="event-host-eyebrow">${t("description.hosted_by", "Organized by")}</span>
                        <h4 class="event-host-name">${escapeHtml(hostUnitName)}</h4>
                    </div>
                    ${!isNonPartner && orgId ? `
                    <a href="/org-profile.html?orgId=${orgId}" class="event-host-profile-link" title="View organization profile">
                        <span>${t("event_popup.organizer_profile", "Organizer Profile")}</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </a>` : ''}
                </div>

                <!-- Mobile Only Flow: Quick Details & Actions -->
                <div class="event-mobile-info-section md:hidden flex flex-col gap-3.5">
                    <!-- Primary CTA Card (Mobile) -->
                    <div class="event-cta-card">
                        <button class="event-primary-btn participate ${isParticipating ? 'active' : ''}" type="button" ${extUrl ? `data-external-url="${extUrl}"` : ''}>
                            <i class="fa-solid fa-${participateBtnIcon}"></i>
                            <span>${finalParticipateBtnText}</span>
                        </button>
                    </div>

                    <!-- Event Details Card -->
                    <div class="event-sidebar-details-card">
                        <div class="event-sidebar-details-header">
                            <i class="fa-solid fa-circle-info text-blue-600"></i>
                            <span>${t("event_popup.event_details", "Event Details")}</span>
                        </div>

                        <div class="event-sidebar-details-list">
                            <!-- Date & Time -->
                            <div class="event-sidebar-info-row">
                                <div class="sidebar-info-icon date"><i class="fa-regular fa-calendar"></i></div>
                                <div class="sidebar-info-meta">
                                    <span class="sidebar-info-label">${t("description.date", "Time & Date")}</span>
                                    <p class="sidebar-info-value">${heldDate}${endDateFormatted ? ` → ${endDateFormatted}` : ''}</p>
                                </div>
                            </div>

                            <!-- Registration Deadline -->
                            ${deadlineFormatted ? `
                            <div class="event-sidebar-info-row deadline">
                                <div class="sidebar-info-icon deadline"><i class="fa-solid fa-hourglass-half"></i></div>
                                <div class="sidebar-info-meta">
                                    <span class="sidebar-info-label">${t("profile.apply_deadline", "Deadline")}</span>
                                    <p class="sidebar-info-value deadline-val">${deadlineFormatted}</p>
                                </div>
                            </div>` : ''}

                            <!-- Location -->
                            <div class="event-sidebar-info-row">
                                <div class="sidebar-info-icon location"><i class="fa-solid fa-location-dot"></i></div>
                                <div class="sidebar-info-meta">
                                    <span class="sidebar-info-label">${t("description.location", "Location")}</span>
                                    <p class="sidebar-info-value">
                                        <a href="${googleMapsLink}" target="_blank" class="event-location-link" rel="noopener noreferrer">
                                            ${escapeHtml(a.location)} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                                        </a>
                                    </p>
                                </div>
                            </div>

                            <!-- Participants & Slots -->
                            ${buildParticipantsAndSlotsHTML(a, participantCount)}
                        </div>
                    </div>

                    <!-- AI Compatibility Card -->
                    <div class="event-ai-card">
                        <div class="event-ai-card-header">
                            <div class="flex items-center gap-2">
                                <span class="ai-sparkle-badge"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
                                <span class="font-bold text-xs text-slate-800 uppercase tracking-wide">${t("event_popup.ai_match", "AI Match")}</span>
                            </div>
                            <button type="button" class="ai-match-trigger-btn ai-match-btn" title="Calculate Match">
                                <span>${t("event_popup.check_match", "Check Match")}</span>
                            </button>
                        </div>

                        <div class="event-ai-result-panel" style="display:none;"></div>
                    </div>

                    <!-- Secondary Actions (Discuss, Share, Favorite) -->
                    <div class="event-secondary-actions-panel">
                        <button class="event-secondary-btn discuss discuss-btn" data-event-id="${a.activityID || a._id}" data-event-title="${a.title}" type="button">
                            <i class="fa-solid fa-comments"></i>
                            <span>${t("explore.discuss", "Discuss")}</span>
                        </button>

                        <button class="event-secondary-btn event-share-btn icon-btn" type="button" title="Share event">
                            <i class="fa-solid fa-share-nodes"></i>
                            <span>${t("explore.share") || "Share"}</span>
                        </button>

                        <button type="button" class="event-secondary-btn favorite-btn ${isFavourited ? 'active' : ''}" title="Bookmark event">
                            <i class="fa-solid fa-star"></i>
                            <span class="favorite-text">${t("explore.favourite") || "Favorite"}</span>
                        </button>
                    </div>
                </div>

                <!-- Description Prose -->
                <div class="event-modal-section">
                    <h3 class="event-section-heading">${t("explore.about_activity", "About this Activity")}</h3>
                    <div class="event-prose-description popup-description-val">
                        ${(a.description || "").split('\n').filter(p => p.trim()).map(p => `<p>${escapeHtml(p)}</p>`).join('')}
                    </div>
                </div>

                <!-- Attachments Section -->
                <div class="event-modal-section popup-attachments-section" style="${filesHTML ? '' : 'display: none;'}">
                    <h3 class="event-section-heading">${t("explore.attached_files", "Attachments & Resources")} <span class="attachments-count">(${(a.attachments || []).length})</span></h3>
                    <div class="event-attachments-grid popup-files-val">${filesHTML}</div>
                </div>

                <!-- Similar Events Section -->
                <div class="event-modal-section" id="similar-events-section">
                    <h3 class="event-section-heading" data-i18n="explore.similar_activities">${t("explore.similar_activities", "Similar Activities")}</h3>
                    <div id="similar-events-container" class="similar-events-grid">
                        <div class="empty-state" data-i18n="explore.loading_similar_activities">${t("explore.loading_similar_activities", "Loading similar events...")}</div>
                    </div>
                </div>

                <!-- Comments Section -->
                <div class="event-modal-section" id="popup-comments-container">
                    <h3 class="event-section-heading">${t("profile.comments", "Community Discussion")}</h3>
                    
                    <div class="event-comment-composer">
                        <div class="event-comment-user-avatar">
                            <span id="current-user-avatar-initial">?</span>
                        </div>
                        <div class="event-comment-input-box">
                            <textarea id="event-comment-input" rows="1" placeholder="${t("explore.write_comment", "Write a thought or question...")}" aria-label="Comment input"></textarea>
                            <button type="button" id="event-comment-submit" aria-label="Post comment" class="comment-submit-btn">
                                <i class="fa-solid fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>

                    <div id="event-comments-list" class="event-comments-feed">
                        <div class="popup-loading-small"><div class="editorial-spinner"></div></div>
                    </div>
                    
                    <button id="event-comments-see-more" class="event-comments-load-more" style="display: none;">${t("explore.see_more_comments", "See more comments")}</button>
                </div>
            </div>

            <!-- Sticky Action Sidebar (Right Column - Desktop Only) -->
            <aside class="event-modal-sidebar-col hidden md:block">
                <div class="event-sidebar-sticky-panel">
                    
                    <!-- Primary CTA Card -->
                    <div class="event-cta-card">
                        <button class="event-primary-btn participate ${isParticipating ? 'active' : ''}" type="button" ${extUrl ? `data-external-url="${extUrl}"` : ''}>
                            <i class="fa-solid fa-${participateBtnIcon}"></i>
                            <span>${finalParticipateBtnText}</span>
                        </button>
                    </div>

                    <!-- Event Details Card (Date, Deadline, Location, Participants) -->
                    <div class="event-sidebar-details-card">
                        <div class="event-sidebar-details-header">
                            <i class="fa-solid fa-circle-info text-blue-600"></i>
                            <span>${t("event_popup.event_details", "Event Details")}</span>
                        </div>

                        <div class="event-sidebar-details-list">
                            <!-- Date & Time -->
                            <div class="event-sidebar-info-row">
                                <div class="sidebar-info-icon date"><i class="fa-regular fa-calendar"></i></div>
                                <div class="sidebar-info-meta">
                                    <span class="sidebar-info-label">${t("description.date", "Time & Date")}</span>
                                    <p class="sidebar-info-value">${heldDate}${endDateFormatted ? ` → ${endDateFormatted}` : ''}</p>
                                </div>
                            </div>

                            <!-- Registration Deadline -->
                            ${deadlineFormatted ? `
                            <div class="event-sidebar-info-row deadline">
                                <div class="sidebar-info-icon deadline"><i class="fa-solid fa-hourglass-half"></i></div>
                                <div class="sidebar-info-meta">
                                    <span class="sidebar-info-label">${t("profile.apply_deadline", "Deadline")}</span>
                                    <p class="sidebar-info-value deadline-val">${deadlineFormatted}</p>
                                </div>
                            </div>` : ''}

                            <!-- Location -->
                            <div class="event-sidebar-info-row">
                                <div class="sidebar-info-icon location"><i class="fa-solid fa-location-dot"></i></div>
                                <div class="sidebar-info-meta">
                                    <span class="sidebar-info-label">${t("description.location", "Location")}</span>
                                    <p class="sidebar-info-value">
                                        <a href="${googleMapsLink}" target="_blank" class="event-location-link" rel="noopener noreferrer">
                                            ${escapeHtml(a.location)} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                                        </a>
                                    </p>
                                </div>
                            </div>

                            <!-- Participants & Slots -->
                            ${buildParticipantsAndSlotsHTML(a, participantCount)}
                        </div>
                    </div>

                    <!-- AI Compatibility Card -->
                    <div class="event-ai-card">
                        <div class="event-ai-card-header">
                            <div class="flex items-center gap-2">
                                <span class="ai-sparkle-badge"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
                                <span class="font-bold text-xs text-slate-800 uppercase tracking-wide">${t("event_popup.ai_match", "AI Match")}</span>
                            </div>
                            <button type="button" class="ai-match-trigger-btn ai-match-btn" title="Calculate Match">
                                <span>${t("event_popup.check_match", "Check Match")}</span>
                            </button>
                        </div>

                        <div class="event-ai-result-panel" style="display:none;"></div>
                    </div>

                    <!-- Secondary Actions (Discuss, Share, Favorite) -->
                    <div class="event-secondary-actions-panel">
                        <button class="event-secondary-btn discuss discuss-btn" data-event-id="${a.activityID || a._id}" data-event-title="${a.title}" type="button">
                            <i class="fa-solid fa-comments"></i>
                            <span>${t("explore.discuss", "Discuss")}</span>
                        </button>

                        <button class="event-secondary-btn event-share-btn icon-btn" type="button" title="Share event">
                            <i class="fa-solid fa-share-nodes"></i>
                            <span>${t("explore.share") || "Share"}</span>
                        </button>

                        <button type="button" class="event-secondary-btn favorite-btn ${isFavourited ? 'active' : ''}" title="Bookmark event">
                            <i class="fa-solid fa-star"></i>
                            <span class="favorite-text">${t("explore.favourite") || "Favorite"}</span>
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    </div>`;
}

function setParticipated(activity) {
    const btns = document.querySelectorAll(".participate");
    btns.forEach(btn => {
        if (!btn) return;
        if (btn.dataset.externalUrl) return;
        btn.classList.add("active");
        
        const span = btn.querySelector("span");
        if (span) {
            span.textContent = t("explore.participated") || "Joined ✓";
        }
    });

    if (activity && activity.heldDate && (isPastDate(activity.heldDate) || isToday(activity.heldDate))) {
        btns.forEach(btn => {
            if (btn.dataset.externalUrl) return;
            btn.disabled = true;
            btn.classList.add("disabled", "opacity-50", "cursor-not-allowed");
            btn.style.pointerEvents = "none";
        });
    }
}

function disableParticipationButtons(activity) {
    if (!activity) return;
    const status = getEventStatus(activity);
    const participantCount = activity.participants?.length || 0;
    const totalSlots = (activity.slots !== undefined && activity.slots !== null && Number(activity.slots) > 0) ? Number(activity.slots) : 0;
    const isFull = totalSlots > 0 && participantCount >= totalSlots;
    const isParticipating = isAuthenticated() && userParticipatedIds && userParticipatedIds.has(String(activity.activityID || activity._id));

    if (status === 'ended' || status === 'ongoing' || status === 'registration_closed') {
        const btns = document.querySelectorAll(".participate");
        btns.forEach(btn => {
            if (btn.dataset.externalUrl) return;
            btn.disabled = true;
            btn.classList.add("disabled", "opacity-50", "cursor-not-allowed");
            btn.style.pointerEvents = "none";
            const span = btn.querySelector("span");
            if (span) {
                if (status === 'ongoing') {
                    span.textContent = t("explore.ongoing") || "Ongoing";
                } else if (status === 'registration_closed') {
                    span.textContent = t("explore.registration_closed") || "Registration Closed";
                } else {
                    span.textContent = t("explore.ended") || "Ended";
                }
            }
        });
    } else if (isFull && !isParticipating) {
        const btns = document.querySelectorAll(".participate");
        btns.forEach(btn => {
            if (btn.dataset.externalUrl) return;
            btn.disabled = true;
            btn.classList.add("disabled", "opacity-60", "cursor-not-allowed");
            btn.style.pointerEvents = "none";
            const span = btn.querySelector("span");
            if (span) {
                span.textContent = t("explore.slots_full", "Đã hết chỗ") || "Fully booked";
            }
        });
    }
}

function setFavourited() {
    const btns = document.querySelectorAll(".favorite-btn");
    btns.forEach(btn => {
        if (btn) btn.classList.add("active");
    });
}

export function showLeaveEventConfirmModal(onConfirmCallback) {
    let modal = document.getElementById("leaveEventConfirmModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "leaveEventConfirmModal";
        modal.className = "fixed inset-0 z-[15000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm hidden";
        modal.style.zIndex = "15000";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        document.body.appendChild(modal);
    } else {
        modal.style.zIndex = "15000";
    }

    modal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 transform transition-all duration-200 scale-95 opacity-0" id="leaveEventModalCard">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                    <span class="material-symbols-outlined text-2xl">warning</span>
                </div>
                <h3 class="text-base font-bold text-slate-900 leading-tight" data-i18n="explore.leave_modal_title">${t("explore.leave_modal_title") || "Leave Event?"}</h3>
            </div>
            <p class="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6" data-i18n="explore.leave_modal_desc">
                ${t("explore.leave_modal_desc") || "Are you sure you want to leave this event? You will lose your registered ticket, and your slot may be taken by another student."}
            </p>
            <div class="flex items-center justify-end gap-2.5">
                <button type="button" class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-full transition cursor-pointer" id="leaveModalCancel" data-i18n="explore.leave_modal_cancel">
                    ${t("explore.leave_modal_cancel") || "Keep Registration"}
                </button>
                <button type="button" class="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-full transition shadow-sm cursor-pointer" id="leaveModalConfirm" data-i18n="explore.leave_modal_confirm">
                    ${t("explore.leave_modal_confirm") || "Confirm Leave"}
                </button>
            </div>
        </div>
    `;

    const modalCard = document.getElementById("leaveEventModalCard");
    const cancelBtn = document.getElementById("leaveModalCancel");
    const confirmBtn = document.getElementById("leaveModalConfirm");

    const show = () => {
        modal.classList.remove("hidden");
        requestAnimationFrame(() => {
            modalCard?.classList.remove("scale-95", "opacity-0");
            modalCard?.classList.add("scale-100", "opacity-100");
        });
    };

    const hide = () => {
        modalCard?.classList.remove("scale-100", "opacity-100");
        modalCard?.classList.add("scale-95", "opacity-0");
        setTimeout(() => {
            modal.classList.add("hidden");
        }, 150);
        document.removeEventListener("keydown", handleKeydown);
    };

    const handleKeydown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            hide();
        }
    };
    document.addEventListener("keydown", handleKeydown);

    cancelBtn?.addEventListener("click", hide);
    confirmBtn?.addEventListener("click", () => {
        hide();
        if (typeof onConfirmCallback === "function") onConfirmCallback();
    });

    modal.onclick = (e) => {
        if (e.target === modal) {
            hide();
        }
    };

    show();
}

export function showJoinEventConfirmModal(onConfirmCallback, activity) {
    let modal = document.getElementById("joinEventConfirmModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "joinEventConfirmModal";
        modal.className = "fixed inset-0 z-[15000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm hidden";
        modal.style.zIndex = "15000";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        document.body.appendChild(modal);
    } else {
        modal.style.zIndex = "15000";
    }

    const eventName = activity ? (activity.activityName || activity.title || "") : "";
    const eventDate = activity ? (activity.heldDate || activity.date || "") : "";
    const eventLoc = activity ? (activity.location || "") : "";

    modal.innerHTML = `
        <div class="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 transform transition-all duration-200 scale-95 opacity-0" id="joinEventModalCard">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-2xl bg-blue-50 text-[#1755ba] flex items-center justify-center shrink-0 border border-blue-100">
                    <span class="material-symbols-outlined text-2xl">event_available</span>
                </div>
                <h3 class="text-base font-bold text-slate-900 leading-tight" data-i18n="explore.join_modal_title">${t("explore.join_modal_title") || "Confirm Event Registration"}</h3>
            </div>
            ${eventName ? `
            <div class="bg-slate-50/80 rounded-2xl p-3 border border-slate-200/70 mb-3 text-left">
                <div class="font-bold text-xs text-slate-800 line-clamp-2">${escapeHtml(eventName)}</div>
                <div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1.5">
                    ${eventDate ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">calendar_today</span>${escapeHtml(eventDate)}</span>` : ""}
                    ${eventLoc ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">location_on</span>${escapeHtml(eventLoc)}</span>` : ""}
                </div>
            </div>` : ""}
            <p class="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6" data-i18n="explore.join_modal_desc">
                ${t("explore.join_modal_desc") || "You are registering for this event. A digital ticket will be issued to your account. Please ensure you can attend on schedule."}
            </p>
            <div class="flex items-center justify-end gap-2.5">
                <button type="button" class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-full transition cursor-pointer" id="joinModalCancel" data-i18n="explore.join_modal_cancel">
                    ${t("explore.join_modal_cancel") || "Maybe Later"}
                </button>
                <button type="button" class="px-4 py-2 text-xs font-bold text-white bg-[#1755ba] hover:bg-[#134494] rounded-full transition shadow-sm cursor-pointer" id="joinModalConfirm" data-i18n="explore.join_modal_confirm">
                    ${t("explore.join_modal_confirm") || "Confirm Registration"}
                </button>
            </div>
        </div>
    `;

    const modalCard = document.getElementById("joinEventModalCard");
    const cancelBtn = document.getElementById("joinModalCancel");
    const confirmBtn = document.getElementById("joinModalConfirm");

    const show = () => {
        modal.classList.remove("hidden");
        requestAnimationFrame(() => {
            modalCard?.classList.remove("scale-95", "opacity-0");
            modalCard?.classList.add("scale-100", "opacity-100");
        });
    };

    const hide = () => {
        modalCard?.classList.remove("scale-100", "opacity-100");
        modalCard?.classList.add("scale-95", "opacity-0");
        setTimeout(() => {
            modal.classList.add("hidden");
        }, 150);
        document.removeEventListener("keydown", handleKeydown);
    };

    const handleKeydown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            hide();
        }
    };
    document.addEventListener("keydown", handleKeydown);

    cancelBtn?.addEventListener("click", hide);
    confirmBtn?.addEventListener("click", () => {
        hide();
        if (typeof onConfirmCallback === "function") onConfirmCallback();
    });

    modal.onclick = (e) => {
        if (e.target === modal) {
            hide();
        }
    };

    show();
}

function initParticipateButton(activityID) {
    const btns = document.querySelectorAll(".participate");
    if (btns.length === 0) return;

    let lastClick = 0;
    const COOLDOWN = 3000;

    btns.forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();

            const now = Date.now();
            if (now - lastClick < COOLDOWN) {
                return;
            }

            if (btn.dataset.externalUrl) {
                window.open(btn.dataset.externalUrl, '_blank');
                return;
            }

            if (!isAuthenticated()) {
                showLoginPrompt({
                    message: t("auth_modal.desc_participate", "Vui lòng đăng nhập để đăng ký và tham gia hoạt động."),
                    redirectUrl: window.location.href
                });
                return;
            }

            const verified = await requireVerifiedOrRedirect();
            if (!verified) return;

            const user = getUser();
            if (!isProfileComplete(user)) {
                alert(t("profile.alert_complete_profile_event"));
                window.location.href = '/profile.html';
                return;
            }

            const isActive = btn.classList.contains("active");

            // Check if slots are full when attempting to join
            if (!isActive) {
                const slotsRow = document.querySelector(".event-slots-row");
                if (slotsRow && slotsRow.dataset.totalSlots) {
                    const totalSlots = parseInt(slotsRow.dataset.totalSlots, 10);
                    const valEls = document.querySelectorAll(".participants-count-val");
                    const currentCount = valEls.length > 0 ? (parseInt(valEls[0].dataset.count, 10) || 0) : 0;
                    if (totalSlots > 0 && currentCount >= totalSlots) {
                        alert(t("explore.slots_full", "Sự kiện đã hết chỗ tham gia!"));
                        return;
                    }
                }
            }

            const proceedAction = async () => {
                lastClick = now;

                // Get current count from DOM
                const valEls = document.querySelectorAll(".participants-count-val");
                let initialCount = 0;
                if (valEls.length > 0 && valEls[0].dataset.count !== undefined) {
                    initialCount = parseInt(valEls[0].dataset.count, 10) || 0;
                }
                const newCount = isActive ? Math.max(0, initialCount - 1) : initialCount + 1;

                // Helper to update participant count elements
                const updateCountUI = updateEventCountUI;

                // Update participant counter optimistically
                updateCountUI(newCount);

                try {
                    // Update all buttons status
                    const allBtns = document.querySelectorAll(".participate");
                    allBtns.forEach(b => {
                        if (isActive) {
                            b.classList.remove("active");
                            const span = b.querySelector("span");
                            if (span) span.textContent = t("explore.participate") || "Register for Event";
                        } else {
                            b.classList.add("active");
                            const span = b.querySelector("span");
                            if (span) span.textContent = t("explore.participated") || "Joined ✓";
                        }
                    });

                    if (isActive) {
                        await unparticipateActivity(activityID);
                        if (userParticipatedIds) userParticipatedIds.delete(String(activityID));
                    } else {
                        await participateActivity(activityID);
                        if (userParticipatedIds) userParticipatedIds.add(String(activityID));
                    }

                    // Update cache
                    if (activityCache.has(activityID)) {
                        const cached = activityCache.get(activityID);
                        if (cached) {
                            const myId = user?._id || user?.id;
                            if (isActive) {
                                cached.participants = (cached.participants || []).filter(p => String(p._id || p) !== String(myId));
                            } else {
                                if (!cached.participants) cached.participants = [];
                                if (myId && !cached.participants.some(p => String(p._id || p) === String(myId))) {
                                    cached.participants.push(myId);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Participate error:", err);
                    // Revert count on error
                    updateCountUI(initialCount);
                    // Revert button status on error
                    const allBtns = document.querySelectorAll(".participate");
                    allBtns.forEach(b => {
                        if (isActive) {
                            b.classList.add("active");
                            const span = b.querySelector("span");
                            if (span) span.textContent = t("explore.participated") || "Joined ✓";
                        } else {
                            b.classList.remove("active");
                            const span = b.querySelector("span");
                            if (span) span.textContent = t("explore.participate") || "Register for Event";
                        }
                    });
                    alert(err.message || "Failed to participate");
                }
            };

            if (isActive) {
                showLeaveEventConfirmModal(proceedAction);
            } else {
                showJoinEventConfirmModal(proceedAction, currentOpenActivity);
            }
        });
    });
}

function initAIMatchButton(container, activityID) {
    const btns = container.querySelectorAll(".ai-match-btn");
    if (!btns || btns.length === 0) return;

    let lastClick = 0;
    const COOLDOWN = 15000;

    function setBtnLoading() {
        btns.forEach(b => {
            b.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${t("ai_recommend.analyzing", "Analyzing...")}</span>`;
        });
    }

    function setBtnCooldown(remaining) {
        btns.forEach(b => {
            b.innerHTML = `<i class="fa-solid fa-hourglass-half"></i><span>${remaining}s</span>`;
        });
    }

    function resetBtn() {
        btns.forEach(b => {
            b.disabled = false;
            b.innerHTML = `<span>${t("event_popup.check_match", "Check Match")}</span>`;
        });
    }

    btns.forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!hasUserCompletedQuiz()) {
                showQuizPrompt({
                    redirectUrl: window.location.href
                });
                return;
            }

            if (!isAuthenticated()) {
                showLoginPrompt({
                    message: t("auth_modal.desc_ai_match", "Vui lòng đăng nhập để sử dụng tính năng AI Match cá nhân hoá."),
                    redirectUrl: window.location.href
                });
                return;
            }

            const now = Date.now();
            if (now - lastClick < COOLDOWN) {
                const remaining = Math.ceil((COOLDOWN - (now - lastClick)) / 1000);
                setBtnCooldown(remaining);
                setTimeout(() => {
                    resetBtn();
                }, COOLDOWN - (now - lastClick));
                return;
            }

            lastClick = now;
            btns.forEach(b => { b.disabled = true; });
            setBtnLoading();
            const resultEls = container.querySelectorAll(".event-ai-result-panel");
            resultEls.forEach(el => { el.style.display = "none"; });

            try {
                const currentLang = (typeof getLang === 'function' ? getLang() : localStorage.getItem('springwave_lang')) || 'vi';
                const isVi = currentLang.startsWith('vi');

                const snapshotKey = String(activityID);
                const cachedResult = aiMatchSnapshots.get(snapshotKey);
                const result = cachedResult
                    ? {
                        ...cachedResult,
                        explanation: cachedResult.explanations?.[isVi ? 'vi' : 'en'] || cachedResult.explanation,
                        tags: cachedResult.tagsByLocale?.[isVi ? 'vi' : 'en'] || cachedResult.tags || [],
                    }
                    : await explainRecommendation(activityID, currentLang);
                if (!cachedResult) aiMatchSnapshots.set(snapshotKey, result);
                const pct = Number.isFinite(result?.percentage) ? result.percentage : (result?.score ? Math.round(result.score * 100) : 75);
                const fallbackExplanation = isVi 
                    ? "Sự kiện này phù hợp với sở thích và mục tiêu phát triển của bạn."
                    : "This event aligns well with your interests and growth goals.";
                const explanation = result?.explanation || result?.message || fallbackExplanation;
                const tags = Array.isArray(result?.tags) ? result.tags : [];
                const breakdown = result?.breakdown || {};

                // Synchronize the evaluated AI score with external components (e.g. explore recommendation cards)
                try {
                    window.dispatchEvent(new CustomEvent('springwave:ai-match-updated', {
                        detail: {
                            activityID: String(activityID),
                            percentage: pct,
                            score: result?.score,
                            breakdown: result?.breakdown,
                        }
                    }));
                } catch (_) {}

                let badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
                let progressBg = "#059669";
                let levelText = isVi ? "Rất phù hợp" : "Strong Match";

                if (pct >= 80) {
                    badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
                    progressBg = "#059669";
                    levelText = isVi ? "Rất phù hợp" : "Strong Match";
                } else if (pct >= 60) {
                    badgeClass = "bg-blue-100 text-blue-800 border-blue-300";
                    progressBg = "#1755ba";
                    levelText = isVi ? "Phù hợp tốt" : "Good Match";
                } else if (pct >= 45) {
                    badgeClass = "bg-amber-100 text-amber-800 border-amber-300";
                    progressBg = "#d97706";
                    levelText = isVi ? "Phù hợp vừa" : "Moderate Match";
                } else {
                    badgeClass = "bg-slate-100 text-slate-700 border-slate-300";
                    progressBg = "#475569";
                    levelText = isVi ? "Khám phá mới" : "Explore";
                }

                const tagsHTML = tags.length
                    ? tags.map(t => `<span class="ai-match-pill-tag"><i class="fa-solid fa-sparkles text-[9px] mr-1"></i>${escapeHtml(t)}</span>`).join("")
                    : "";

                const breakdownHTML = (breakdown.majorFit || breakdown.surveyFit || breakdown.activityFit) ? `
                    <div class="ai-match-breakdown-grid mb-3">
                        <div class="ai-breakdown-item">
                            <span class="ai-breakdown-label"><i class="fa-solid fa-graduation-cap text-blue-500"></i> ${isVi ? 'Ngành học' : 'Major'}</span>
                            <span class="ai-breakdown-value">${breakdown.majorFit || 60}%</span>
                        </div>
                        <div class="ai-breakdown-item">
                            <span class="ai-breakdown-label"><i class="fa-solid fa-bolt text-amber-500"></i> ${isVi ? 'Năng lực' : 'Competency'}</span>
                            <span class="ai-breakdown-value">${breakdown.surveyFit || 60}%</span>
                        </div>
                        <div class="ai-breakdown-item">
                            <span class="ai-breakdown-label"><i class="fa-solid fa-bullseye text-emerald-500"></i> ${isVi ? 'Mục tiêu' : 'Goal'}</span>
                            <span class="ai-breakdown-value">${breakdown.activityFit || 60}%</span>
                        </div>
                    </div>
                ` : '';

                const contentHTML = `
                    <div class="ai-match-card-content">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <i class="fa-solid fa-chart-pie text-primary"></i> ${isVi ? 'Điểm Tương Thích' : 'Match Score'}
                            </span>
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${badgeClass}">
                                ${pct}% • ${levelText}
                            </span>
                        </div>
                        
                        <!-- Progress Bar -->
                        <div class="w-full bg-slate-200/80 rounded-full h-2.5 mb-3 overflow-hidden p-0.5">
                            <div class="h-full rounded-full transition-all duration-700 ease-out" style="width: ${pct}%; background-color: ${progressBg};"></div>
                        </div>

                        ${breakdownHTML}

                        <p class="text-xs text-slate-700 leading-relaxed text-left mb-3 bg-white/70 p-2.5 rounded-xl border border-slate-200">
                            ${escapeHtml(explanation)}
                        </p>
                        
                        ${tagsHTML ? `<div class="flex flex-wrap gap-1.5 justify-start mb-2">${tagsHTML}</div>` : ""}

                        <div class="mt-2 text-right">
                            <a href="/quiz.html" class="text-[10.5px] text-primary hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-1">
                                <i class="fa-solid fa-sliders"></i> ${isVi ? 'Cập nhật hồ sơ AI Quiz →' : 'Update AI Quiz Profile →'}
                            </a>
                        </div>
                    </div>
                `;
                resultEls.forEach(el => {
                    el.innerHTML = contentHTML;
                    el.style.display = "block";
                });
            } catch (err) {
                console.error("AI Match error:", err);
                if (
                    err?.code === "AI_QUIZ_REQUIRED" ||
                    err?.error === "AI_QUIZ_REQUIRED" ||
                    (err?.status === 403 && (err?.message?.includes("AI Quiz") || err?.data?.error === "AI_QUIZ_REQUIRED" || err?.data?.code === "AI_QUIZ_REQUIRED"))
                ) {
                    showQuizPrompt({
                        redirectUrl: window.location.href
                    });
                    resetBtn();
                    return;
                }
                const currentLang = (typeof getLang === 'function' ? getLang() : localStorage.getItem('springwave_lang')) || 'vi';
                const isVi = currentLang.startsWith('vi');
                const defaultErr = isVi ? "Không thể phân tích độ phù hợp lúc này." : "Unable to analyze compatibility at this time.";
                const errorHTML = `
                    <div class="ai-match-empty-box text-rose-600">
                        <i class="fa-solid fa-circle-exclamation text-lg"></i>
                        <p class="text-[11px] mt-1">${err.message || defaultErr}</p>
                    </div>
                `;
                resultEls.forEach(el => {
                    el.innerHTML = errorHTML;
                    el.style.display = "block";
                });
            }
            resetBtn();
        });
    });
}

async function loadSimilarEvents(activityID) {
    const container = document.getElementById('similar-events-container');
    if (!container) return;

    try {
        const data = await getSimilarEvents(activityID, 10);
        const rawEvents = data?.events || [];

        // Filter out events that have ended or whose registration deadline has passed
        const events = rawEvents.filter(a => {
            const status = getEventStatus(a);
            return status === 'registration_open';
        }).slice(0, 6);

        if (events.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center" data-i18n="explore.no_similar_activities">${t('explore.no_similar_activities', 'No similar activities currently open for registration.')}</p>`;
            return;
        }

        container.innerHTML = events.map(a => {
            const held = formatDate(a.heldDate);
            return `
            <div class="similar-event-card" data-id="${a._id || a.activityID}">
                <div class="similar-event-thumb">
                    ${a.thumbnail ? `<img src="${a.thumbnail}" alt="${escapeHtml(a.title)}" loading="lazy">` : '<div class="similar-thumb-fallback"><i class="fa-regular fa-calendar"></i></div>'}
                </div>
                <div class="similar-event-info">
                    <h4 class="similar-event-title">${escapeHtml(a.title)}</h4>
                    <p class="similar-event-meta"><i class="fa-regular fa-calendar"></i> ${held}</p>
                    <p class="similar-event-meta"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(a.location || 'Online')}</p>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.similar-event-card').forEach(card => {
            card.addEventListener('click', async () => {
                const id = card.dataset.id;
                await openEventPopup(id, { activityData: null });
            });
        });
    } catch (err) {
        console.error("Failed to load similar events:", err);
        container.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center" data-i18n="explore.no_similar_activities">${t('explore.no_similar_activities', 'No similar activities currently open for registration.')}</p>`;
    }
}

async function initEventComments(eventId, container) {
    const listEl = container.querySelector('#event-comments-list');
    const inputEl = container.querySelector('#event-comment-input');
    const submitBtn = container.querySelector('#event-comment-submit');
    const seeMoreBtn = container.querySelector('#event-comments-see-more');
    const avatarSpan = container.querySelector('#current-user-avatar-initial');
    
    if (isAuthenticated()) {
        const user = getUser();
        if (user) {
            avatarSpan.textContent = (user.fullname || user.username || '?').charAt(0).toUpperCase();
        }
    }
    
    let comments = [];
    let visibleCount = 4;

    function renderComments() {
        if (!comments || comments.length === 0) {
            listEl.innerHTML = `
                <div class="no-comments-box">
                    <i class="fa-regular fa-comments text-2xl text-slate-300 mb-1.5 block"></i>
                    <p class="text-xs text-slate-400 font-medium">No comments yet. Start the conversation!</p>
                </div>
            `;
            if (seeMoreBtn) seeMoreBtn.style.display = 'none';
            return;
        }

        const visibleComments = comments.slice(0, visibleCount);
        listEl.innerHTML = visibleComments.map(c => {
            const name = c.userName || c.author || c.createdByName || 'Student';
            const initial = name.charAt(0).toUpperCase();
            return `
            <div class="event-comment-row">
                <div class="event-comment-avatar-bubble">${initial}</div>
                <div class="event-comment-bubble">
                    <div class="event-comment-bubble-header">
                        <h5 class="event-comment-author-name">${escapeHtml(name)}</h5>
                        <span class="event-comment-timestamp">${timeAgo(c.date || c.createdAt)}</span>
                    </div>
                    <p class="event-comment-body-text">${sanitizeHtml(c.content)}</p>
                </div>
            </div>`;
        }).join('');

        if (comments.length > visibleCount) {
            seeMoreBtn.style.display = 'inline-block';
            seeMoreBtn.textContent = `View more comments (${comments.length - visibleCount})`;
        } else {
            seeMoreBtn.style.display = 'none';
        }
    }

    seeMoreBtn?.addEventListener('click', () => {
        visibleCount += 5;
        renderComments();
    });

    // Auto resize comment textarea
    inputEl?.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = `${Math.min(inputEl.scrollHeight, 120)}px`;
    });

    submitBtn?.addEventListener('click', async () => {
        if (!isAuthenticated()) {
            showLoginPrompt({
                message: t("auth_modal.desc_comment", "Vui lòng đăng nhập để gửi bình luận."),
                redirectUrl: window.location.href
            });
            return;
        }
        
        const user = getUser();
        if (!isProfileComplete(user)) {
            alert(t("profile.alert_complete_profile_comment"));
            window.location.href = '/profile.html';
            return;
        }
        const verified = await requireVerifiedOrRedirect();
        if (!verified) return;

        const text = inputEl.value.trim();
        if (!text) return;
        
        submitBtn.disabled = true;
        try {
            const resp = await addEventComment(eventId, text);
            if (resp) {
                inputEl.value = '';
                inputEl.style.height = 'auto';
                comments.unshift({
                    author: user.fullname || user.username,
                    content: text,
                    date: new Date().toISOString()
                });
                renderComments();
            }
        } catch (err) {
            alert(err.message || 'Failed to post comment');
        } finally {
            submitBtn.disabled = false;
        }
    });

    try {
        const resp = await getEventComments(eventId);
        comments = (resp && resp.comments) ? resp.comments : [];
        comments.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
        renderComments();
    } catch (err) {
        listEl.innerHTML = '<div class="no-comments-box"><p class="text-xs text-slate-400">Failed to load comments</p></div>';
        if (seeMoreBtn) seeMoreBtn.style.display = 'none';
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("language-changed", () => {
        const overlay = document.getElementById("popup-overlay");
        const container = document.getElementById("popup-container");
        if (overlay && overlay.classList.contains("active") && container && currentOpenActivity) {
            const actId = currentOpenActivity.activityID || currentOpenActivity._id;
            const backText = currentBackText || t("explore.back") || "Back";
            container.innerHTML = buildPopupHTML(currentOpenActivity, backText);
            initParticipateButton(actId);
            disableParticipationButtons(currentOpenActivity);
            bindPopupInteractiveElements(container, currentOpenActivity, actId);
            if (aiMatchSnapshots.has(String(actId))) {
                container.querySelector('.ai-match-btn')?.click();
            }
        }
        const leaveModal = document.getElementById("leaveEventConfirmModal");
        if (leaveModal && !leaveModal.classList.contains("hidden")) {
            applyTranslation(leaveModal);
        }
        const joinModal = document.getElementById("joinEventConfirmModal");
        if (joinModal && !joinModal.classList.contains("hidden")) {
            applyTranslation(joinModal);
        }
    });
}
