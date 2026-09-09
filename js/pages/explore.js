import "../../src/style.css";
import { isAuthenticated, getUser, isStudentVerified } from "../lib/session.js";
import { getActivities, getActivityById, participateActivity, unparticipateActivity, checkParticipation, searchActivities, searchSemantic } from "../api/activities.js";
import { listCategories } from "../api/categories.js";
import { addFavourite, removeFavourite, checkFavourite, getFavourites } from "../api/user.js";
import { getRecommendations, explainRecommendation } from "../api/recommendations.js";
import { createDiscussionWithScope } from "../api/forum.js";
import { CDN_DOMAIN } from "../config.js";
import { openEventPopup } from "../components/eventPopup.js";
import { t } from "../lib/i18n.js";
import { showConfirmDialog } from "../lib/modal.js";
import { initChatbot } from "../components/chatbot.js";
import { loadNavbar as loadSharedNavbar } from "../components/navbar.js";
import { renderPagination } from "../components/pagination.js";
import { canPerformAction, markActionPerformed } from "../lib/throttle.js";
import { sanitizeHtml, escapeHtml, escapeAttr } from "../lib/sanitize.js";
import { fetchContent, formatDate, capitalize, toLocalISODate, checkVerificationGuard, isToday, isPastDate, isUpcomingDate, getEventStatus } from "../lib/utils.js";
import { triggerBadgeCelebration } from "../components/badgeCelebration.js";
import { showExploreLoading, hideExploreLoading, bindLoadingLanguage, EXPLORE_SKELETON_OPTIONS } from "../lib/exploreLoading.js";
import { getMyUniversity, getUniversities } from "../api/universities.js";
import { showLoginPrompt } from "../components/authModal.js";

let allActivities = [];
let masterActivitiesList = [];
let currentFilteredActivities = [];
let currentPage = 1;
const pageSize = 20;
let currentCategory = "all";
let currentSort = "newest";
let currentStatus = "upcoming";
let currentMyUniOnly = false;
let currentCertificateOnly = false;
let myUniversity = null;
let cachedTemplate = null;
let participateQueue = [];
let activeParticipations = 0;
const MAX_CONCURRENT_PARTICIPATIONS = 3;
let loadingLanguageDisposer = null;

function trackLoadingLanguage(container, messageKey) {
    if (loadingLanguageDisposer) loadingLanguageDisposer();
    loadingLanguageDisposer = bindLoadingLanguage(container, messageKey);
}

function clearLoadingLanguage() {
    if (loadingLanguageDisposer) {
        loadingLanguageDisposer();
        loadingLanguageDisposer = null;
    }
}

async function enqueueParticipate(fn) {
    return new Promise((resolve, reject) => {
        participateQueue.push({ fn, resolve, reject });
        processParticipateQueue();
    });
}

async function processParticipateQueue() {
    while (activeParticipations < MAX_CONCURRENT_PARTICIPATIONS && participateQueue.length > 0) {
        const item = participateQueue.shift();
        activeParticipations++;
        try {
            const result = await item.fn();
            item.resolve(result);
        } catch (err) {
            item.reject(err);
        } finally {
            activeParticipations--;
            processParticipateQueue();
        }
    }
}
let categoriesList = [];

document.addEventListener("DOMContentLoaded", async () => {
    const cardsContainer = document.getElementById("cards-container");
    if (cardsContainer && cardsContainer.children.length === 0) {
        showExploreLoading(cardsContainer);
    }

    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("event") || params.get("id");

    const eventPromise = eventId
        ? getActivityById(eventId).then(r => r.activity || r).catch(() => null)
        : Promise.resolve(null);

    await loadNavbar();
    await initExplore();
    loadRecommendations().catch(() => {});
    await initChatbot();
    initializePage();

    if (eventId) {
        const activity = await eventPromise;
        if (activity) {
            if (!allActivities.some(a => a.activityID === eventId || a._id === eventId)) {
                allActivities.push(activity);
            }
            openEventPopup(eventId, { activityData: activity });
        }
    }
});

async function loadNavbar() {
    await loadSharedNavbar({ activeSection: "explore" });
    initScrollMerge();
}

function initScrollMerge() {
    const searchBar = document.querySelector(".explore-search-wrapper") || document.querySelector(".explore-search-bar");
    const navbar = document.getElementById("navbar");
    const mobileSearchBtn = document.getElementById("mobile-search-btn");
    if (!searchBar || !navbar) return;

    const isMobile = () => window.innerWidth < 768;

    let navbarH = navbar.offsetHeight || 60;
    let ticking = false;

    const update = () => {
        ticking = false;
        const rect = searchBar.getBoundingClientRect();
        const m = rect.top < navbarH;

        if (isMobile()) {
            navbar.classList.remove("merged");
            searchBar.classList.remove("merged");
            if (mobileSearchBtn) {
                if (m) {
                    mobileSearchBtn.classList.remove("hidden");
                    mobileSearchBtn.classList.add("flex");
                } else {
                    mobileSearchBtn.classList.add("hidden");
                    mobileSearchBtn.classList.remove("flex");
                }
            }
        } else {
            if (mobileSearchBtn) {
                mobileSearchBtn.classList.add("hidden");
                mobileSearchBtn.classList.remove("flex");
            }
            searchBar.classList.toggle("merged", m);
            navbar.classList.toggle("merged", m);
        }
    };

    window.addEventListener("scroll", () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });

    window.addEventListener("resize", () => {
        navbarH = navbar.offsetHeight || 60;
        update();
    }, { passive: true });

    if (mobileSearchBtn) {
        mobileSearchBtn.addEventListener("click", () => {
            const searchTarget = document.querySelector(".explore-search-wrapper") || searchBar;
            const targetTop = searchTarget.getBoundingClientRect().top + window.scrollY - navbarH - 16;
            window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
            setTimeout(() => {
                const input = document.getElementById("search-pref");
                if (input) input.focus();
            }, 350);
        });
    }
}

function initNavbarActiveLinks() {
    const navLinks = document.querySelectorAll(".nav-links a");
    navLinks.forEach(link => {
        link.classList.remove("active");
        if (link.dataset.section === "explore") {
            link.classList.add("active");
        }
    });
}



async function loadCategories() {
    try {
        const data = await listCategories();
        categoriesList = data.categories || [];
        const list = document.getElementById("categoryList");
        if (!list || categoriesList.length === 0) return;
        const allChip = list.querySelector('[data-category="all"]');
        list.innerHTML = "";
        if (allChip) list.appendChild(allChip);
        categoriesList.forEach(cat => {
            const btn = document.createElement("button");
            btn.className = "category-chip-figma category-chip";
            btn.dataset.category = cat.slug || cat._id;
            btn.innerHTML = cat.icon
                ? `<i class="${cat.icon}" style="font-size:14px;color:${cat.color || '#64748b'}"></i>`
                : "";
            btn.append(" " + cat.name);
            list.appendChild(btn);
        });
    } catch (e) {
        console.warn("Categories API unavailable, using static chips", e);
    }
}

async function initExplore() {
    try {
        await loadCategories();
    } catch (e) {
        console.error("Failed to load categories:", e);
    }

    try {
        initSearchDatePicker();
    } catch (e) {
        console.error("Failed to initialize search date picker:", e);
    }

    try {
        initSidebar();
    } catch (e) {
        console.error("Failed to initialize sidebar:", e);
    }

    try {
        await loadCards();
    } catch (e) {
        console.error("Failed to load activities cards:", e);
    }

    try {
        initSearchButton();
    } catch (e) {
        console.error("Failed to initialize search button handlers:", e);
    }

    try {
        initMapSelector();
    } catch (e) {
        console.error("Failed to initialize map selector:", e);
    }
}

async function ensureCardTemplate() {
    if (!cachedTemplate) {
        const templateHTML = await fetchContent("./components/cards.html");
        const parser = new DOMParser();
        const doc = parser.parseFromString(templateHTML, "text/html");
        cachedTemplate = doc.querySelector(".card");
    }
    return cachedTemplate;
}

function createActivityCard(rawActivity, options = {}) {
    if (!cachedTemplate) return null;
    const actId = String(rawActivity.activityID || rawActivity._id || '');
    const fullEvent = allActivities.find(e => String(e.activityID || e._id) === actId) || {};
    const activity = { ...fullEvent, ...rawActivity };
    if (rawActivity.hasCertificate === undefined && fullEvent.hasCertificate !== undefined) {
        activity.hasCertificate = fullEvent.hasCertificate;
    }

    const card = cachedTemplate.cloneNode(true);
    card.classList.add("revealed");

    const image = card.querySelector(".card-image");
    if (image) {
        image.src = activity.thumbnail;
        image.alt = activity.title;
        image.loading = "lazy";
        image.decoding = "async";
    }
    card.querySelector(".card-title").textContent = activity.title;
    const locationSpan = card.querySelector(".info-location");
    if (locationSpan) locationSpan.textContent = activity.location || t("explore.unknown_location");

    const dateSpan = card.querySelector(".info-date");
    if (dateSpan) dateSpan.textContent = formatDate(activity.heldDate);

    const typeSpan = card.querySelector(".info-type");
    if (typeSpan) {
        const cat = activity.category;
        if (cat && cat.name) {
            typeSpan.textContent = cat.name;
        } else {
            typeSpan.textContent = capitalize(activity.type || "Activity");
        }
    }

    const hostSpan = card.querySelector(".info-host");
    if (hostSpan) {
        const hostOrgName = typeof activity.organization === 'object' ? activity.organization?.name : null;
        const orgUni = activity.organization?.university;
        const uniShort = orgUni?.shortName || activity.source?.school;
        const baseHost = hostOrgName || activity.hostName || (activity.organization ? t("common.organization", "Organization") : activity.createdByName) || t("common.unknown") || "Unknown";
        hostSpan.textContent = uniShort ? `${baseHost} (${uniShort})` : baseHost;
    }
    
    const status = getEventStatus(activity);

    const btn = card.querySelector(".details-btn");
    if (btn && status !== 'ended') {
        btn.textContent = t("explore.view_details") || "View Details";
    }

    const topLeftBadges = document.createElement("div");
    topLeftBadges.className = "absolute top-2.5 left-2.5 sm:top-3 sm:left-3 flex flex-col items-start gap-1.5 z-10 pointer-events-none";

    let pct = null;
    if (Number.isFinite(activity.percentage)) {
        pct = Math.round(activity.percentage);
    } else if (Number.isFinite(activity.score)) {
        pct = Math.round(activity.score <= 1 ? activity.score * 100 : activity.score);
    } else if (Number.isFinite(activity.matchPercentage)) {
        pct = Math.round(activity.matchPercentage);
    } else if (Number.isFinite(activity.matchScore)) {
        pct = Math.round(activity.matchScore <= 1 ? activity.matchScore * 100 : activity.matchScore);
    } else if (Number.isFinite(activity.similarity)) {
        pct = Math.round(activity.similarity <= 1 ? activity.similarity * 100 : activity.similarity);
    } else if (options.matchScore !== undefined && options.matchScore !== null && Number.isFinite(Number(options.matchScore))) {
        const s = Number(options.matchScore);
        pct = Math.round(s <= 1 ? s * 100 : s);
    } else if (options.isRecommended) {
        // Deterministic high-match score for AI recommendations if not provided by backend
        const str = String(activity.activityID || activity._id || activity.title || 'sw');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        pct = 86 + Math.abs(hash % 12);
    }

    // Top-Right container for Category Tag Overlay and Percentage Match Badge
    let topRightBadges = card.querySelector(".card-top-right");
    if (!topRightBadges) {
        topRightBadges = document.createElement("div");
        topRightBadges.className = "card-top-right absolute top-2 right-2 sm:top-2.5 sm:right-2.5 flex flex-col items-end gap-1.5 z-10 pointer-events-none max-w-[65%]";
        const tagOverlay = card.querySelector(".card-tag-overlay");
        if (tagOverlay) {
            tagOverlay.classList.remove("absolute", "top-2", "right-2", "sm:top-2.5", "sm:right-2.5", "max-w-[75%]", "max-w-[48%]");
            tagOverlay.classList.add("pointer-events-auto", "max-w-full");
            tagOverlay.parentNode.insertBefore(topRightBadges, tagOverlay);
            topRightBadges.appendChild(tagOverlay);
        } else {
            card.appendChild(topRightBadges);
        }
    }

    if (pct !== null) {
        const matchPill = document.createElement("div");
        matchPill.className = "recommendation-match-pill pointer-events-auto";
        matchPill.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> <span>${pct}% ${t("explore.match_pill", "Match")}</span>`;
        topRightBadges.appendChild(matchPill);
    }

    if (status === 'ended') {
        card.classList.add("opacity-75", "grayscale-[0.5]");
        if (btn) {
            btn.textContent = t("explore.ended") || "Ended";
            btn.classList.add("!bg-gray-300", "!text-gray-600", "cursor-not-allowed", "!shadow-none");
            btn.classList.remove("bg-primary", "text-white");
            btn.style.pointerEvents = "none";
        }
        const endedBadge = document.createElement("div");
        endedBadge.className = "bg-red-50 text-red-700 border border-red-200/90 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs";
        endedBadge.innerHTML = `<i class="fa-solid fa-clock-rotate-left text-xs"></i><span>${t("explore.ended") || "Ended"}</span>`;
        topLeftBadges.appendChild(endedBadge);
    } else if (status === 'ongoing') {
        const ongoingBadge = document.createElement("div");
        ongoingBadge.className = "bg-emerald-50 text-emerald-700 border border-emerald-200/90 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs";
        ongoingBadge.innerHTML = `<i class="fa-solid fa-circle-play text-xs animate-pulse"></i><span>${t("explore.ongoing") || "Ongoing"}</span>`;
        topLeftBadges.appendChild(ongoingBadge);
    } else if (status === 'registration_closed') {
        const closedBadge = document.createElement("div");
        closedBadge.className = "bg-amber-50 text-amber-800 border border-amber-200/90 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs";
        closedBadge.innerHTML = `<i class="fa-solid fa-user-xmark text-xs"></i><span>${t("explore.registration_closed") || "Hết hạn đăng ký"}</span>`;
        topLeftBadges.appendChild(closedBadge);
    }

    const hasCert = activity.hasCertificate === true || activity.hasCertificate === 'true' 
                 || activity.certificate === true || activity.certificate === 'true'
                 || fullEvent?.hasCertificate === true || fullEvent?.hasCertificate === 'true';
    if (hasCert) {
        const certBadge = document.createElement("div");
        certBadge.className = "bg-amber-50 text-amber-900 border border-amber-300/90 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs pointer-events-auto";
        certBadge.innerHTML = `<i class="fa-solid fa-award text-amber-600 text-xs"></i><span>${t("explore.certificate_badge") || "Certificate"}</span>`;
        topLeftBadges.appendChild(certBadge);
    }

    if (topLeftBadges.children.length > 0) {
        card.appendChild(topLeftBadges);
    }

    card.dataset.id = String(activity.activityID || activity._id);
    return card;
}

async function loadRecommendations() {
    const section = document.getElementById("recommendations-section");
    const container = document.getElementById("recommendations-container");
    if (!section || !container) return;

    if (!isAuthenticated()) return;

    try {
        const data = await getRecommendations();
        const rawRecommended = data?.events || data?.recommendations || [];
        const recommended = rawRecommended.filter(a => getEventStatus(a) === 'registration_open');
        if (recommended.length === 0) {
            section.style.display = "none";
            return;
        }

        await ensureCardTemplate();

        section.style.display = "block";
        container.innerHTML = "";
        const frag = document.createDocumentFragment();
        recommended.slice(0, 8).forEach(a => {
            const card = createActivityCard(a, { isRecommended: true });
            if (card) {
                if (!allActivities.some(existing => String(existing.activityID || existing._id) === String(a.activityID || a._id))) {
                    allActivities.push(a);
                }
                frag.appendChild(card);
            }
        });
        container.appendChild(frag);

        initCardClickHandlers();
        await syncCardFavourites();
    } catch {
        section.style.display = "none";
    }
}

// Synchronize card badge in real time whenever AI Match score is evaluated or updated in the popup
window.addEventListener('springwave:ai-match-updated', (e) => {
    const { activityID, percentage } = e.detail || {};
    if (!activityID || !Number.isFinite(percentage)) return;

    const cards = document.querySelectorAll(`.card[data-id="${activityID}"]`);
    cards.forEach(card => {
        let pill = card.querySelector('.recommendation-match-pill');
        if (pill) {
            pill.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> <span>${percentage}% ${t("explore.match_pill", "Match")}</span>`;
        } else {
            let topRightBadges = card.querySelector(".card-top-right");
            if (!topRightBadges) {
                topRightBadges = document.createElement("div");
                topRightBadges.className = "card-top-right absolute top-2 right-2 sm:top-2.5 sm:right-2.5 flex flex-col items-end gap-1.5 z-10 pointer-events-none max-w-[65%]";
                const tagOverlay = card.querySelector(".card-tag-overlay");
                if (tagOverlay) {
                    tagOverlay.classList.remove("absolute", "top-2", "right-2", "sm:top-2.5", "sm:right-2.5", "max-w-[75%]", "max-w-[48%]");
                    tagOverlay.classList.add("pointer-events-auto", "max-w-full");
                    tagOverlay.parentNode.insertBefore(topRightBadges, tagOverlay);
                    topRightBadges.appendChild(tagOverlay);
                } else {
                    card.appendChild(topRightBadges);
                }
            }
            const newPill = document.createElement('div');
            newPill.className = 'recommendation-match-pill pointer-events-auto';
            newPill.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> <span>${percentage}% ${t("explore.match_pill", "Match")}</span>`;
            topRightBadges.appendChild(newPill);
        }
    });
});

function initSearchButton() {
    const searchLoc = document.getElementById("search-location");
    const searchPref = document.getElementById("search-pref");
    const navbarInput = document.getElementById("search-navbar");
    const executeBtn = document.getElementById("searchExecuteBtn");

    if (!searchPref && !navbarInput) return;

    let debounceTimeout = null;

    const performSearch = async () => {
        const location = searchLoc?.value.trim() || "";
        const keyword = searchPref?.value.trim() || navbarInput?.value.trim() || "";

        const dates = window.__searchDates || {};

        // Sync text inputs to ensure they always match
        if (searchPref && searchPref.value !== keyword) searchPref.value = keyword;
        if (navbarInput && navbarInput.value !== keyword) navbarInput.value = keyword;

        // Clear active category filters when searching
        document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
        document.querySelector(".category-chip[data-category='all']")?.classList.add("active");
        currentCategory = "all";

        // If searching with specific date range, auto switch status filter to 'all' so events in that range aren't hidden
        if (dates.startDate) {
            document.querySelectorAll(".status-option").forEach(c => c.classList.remove("active"));
            document.querySelector(".status-option[data-status='all']")?.classList.add("active");
            currentStatus = "all";
        }

        const cardsContainer = document.getElementById("cards-container");
        showExploreLoading(cardsContainer, {
            messageKey: "explore.searching",
            ...EXPLORE_SKELETON_OPTIONS.search,
        });
        trackLoadingLanguage(cardsContainer, "explore.searching");
        const pagContainer = document.getElementById("pagination-container");
        if (pagContainer) pagContainer.style.display = "none";

        try {
            const catChip = document.querySelector(".category-chip.active");
            const catValue = catChip && catChip.dataset.category !== "all" ? catChip.dataset.category : undefined;

            const fromDateStr = dates.startDate ? `${toLocalISODate(dates.startDate)}T00:00:00.000Z` : undefined;
            const toDateStr = dates.endDate 
                ? `${toLocalISODate(dates.endDate)}T23:59:59.999Z` 
                : (dates.startDate ? `${toLocalISODate(dates.startDate)}T23:59:59.999Z` : undefined);

            const params = {
                location: location || undefined,
                category: catValue,
                heldDateFrom: fromDateStr,
                heldDateTo: toDateStr
            };

            const data = keyword
                ? await searchSemantic({ q: keyword, ...params })
                : await searchActivities({ keyword, ...params });

            let activities = data?.activities || [];

            // Client-side filtering fallback to ensure exact matching for location and dates
            if (location) {
                activities = activities.filter(a =>
                    (a.location || "").toLowerCase().includes(location.toLowerCase())
                );
            }
            if (dates.startDate && dates.endDate) {
                const s = new Date(dates.startDate);
                s.setHours(0, 0, 0, 0);
                const e = new Date(dates.endDate);
                e.setHours(23, 59, 59, 999);
                activities = activities.filter(a => {
                    if (!a.heldDate) return false;
                    const held = new Date(a.heldDate);
                    return held >= s && held <= e;
                });
            } else if (dates.startDate) {
                const s = new Date(dates.startDate);
                s.setHours(0, 0, 0, 0);
                const e = new Date(dates.startDate);
                e.setHours(23, 59, 59, 999);
                activities = activities.filter(a => {
                    if (!a.heldDate) return false;
                    const held = new Date(a.heldDate);
                    return held >= s && held <= e;
                });
            }
            if (keyword) {
                const kwLower = keyword.toLowerCase();
                activities = activities.filter(a => {
                    const exactMatch = (a.title || "").toLowerCase().includes(kwLower) ||
                        (a.description || "").toLowerCase().includes(kwLower) ||
                        (a.location || "").toLowerCase().includes(kwLower) ||
                        (a.type || "").toLowerCase().includes(kwLower) ||
                        (a.tags || []).some(t => t.toLowerCase().includes(kwLower));

                    // AI embeddings can give junk strings (like "a", "22") scores around 0.5. 
                    // Use 0.60 to filter out junk semantic matches.
                    const semanticMatch = a.score !== undefined && a.score >= 0.60;
                    return exactMatch || semanticMatch;
                });

                // Auto-switch to relevance sorting for semantic search
                document.querySelectorAll(".sort-option").forEach(o => o.classList.remove("active"));
                currentSort = "relevance";
            }

            if (activities.length === 0) {
                cardsContainer.innerHTML = `<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#94a3b8"><span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:12px">search_off</span><p style="font-size:16px;font-weight:600">${t("explore.no_results")}</p></div>`;
                document.getElementById("resultsCount").textContent = t("explore.results", { n: 0 });
                return;
            }
            await renderCards(activities);
            clearLoadingLanguage();
        } catch (e) {
            clearLoadingLanguage();
            hideExploreLoading();
            cardsContainer.innerHTML = `<div class="empty-state" style="text-align:center;padding:40px;color:var(--text-muted)">${t("explore.search_error")}</div>`;
        }
    };

    // Click search button
    executeBtn?.addEventListener("click", performSearch);

    const refreshBtn = document.getElementById("searchRefreshBtn");
    refreshBtn?.addEventListener("click", async () => {
        if (searchLoc) searchLoc.value = "";
        if (searchPref) searchPref.value = "";
        if (navbarInput) navbarInput.value = "";
        if (typeof window.__resetSearchDates === "function") {
            window.__resetSearchDates();
        } else if (window.__searchDates) {
            window.__searchDates.startDate = null;
            window.__searchDates.endDate = null;
            const placeholder = document.getElementById("drPlaceholder");
            const value = document.getElementById("drValue");
            if (placeholder) placeholder.classList.remove("hidden");
            if (value) value.classList.remove("visible");
        }

        document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
        document.querySelector(".category-chip[data-category='all']")?.classList.add("active");
        currentCategory = "all";
        document.querySelectorAll(".sort-option").forEach(o => o.classList.remove("active"));
        document.querySelector(".sort-option[data-sort='newest']")?.classList.add("active");
        currentSort = "newest";
        document.querySelectorAll(".status-option").forEach(b => b.classList.remove("active"));
        document.querySelector(".status-option[data-status='upcoming']")?.classList.add("active");
        currentStatus = "upcoming";

        currentMyUniOnly = false;
        const myUniToggle = document.getElementById("toggleMyUni");
        if (myUniToggle) myUniToggle.checked = false;

        currentCertificateOnly = false;
        const certToggle = document.getElementById("toggleCertificate");
        if (certToggle) certToggle.checked = false;

        const cardsContainer = document.getElementById("cards-container");
        showExploreLoading(cardsContainer, {
            messageKey: "explore.refreshing",
            ...EXPLORE_SKELETON_OPTIONS.refresh,
        });
        trackLoadingLanguage(cardsContainer, "explore.refreshing");
        const pagContainer = document.getElementById("pagination-container");
        if (pagContainer) pagContainer.style.display = "none";

        try {
            const data = await getActivities();
            masterActivitiesList = data.activities || [];
            await renderCards(masterActivitiesList);
            clearLoadingLanguage();
        } catch (e) {
            clearLoadingLanguage();
            hideExploreLoading();
            if (cardsContainer) cardsContainer.innerHTML = `<div class="empty-state" style="text-align:center;padding:40px;color:var(--text-muted)">${t("common.error") || "Error fetching data"}</div>`;
        }
    });

    // Sync clear button visibility on navbar search
    const navbarClearBtn = document.getElementById("search-navbar-clear");
    const navbarSearchContainer = document.getElementById("navbarSearchContainer");
    const updateNavbarSearchState = () => {
        const hasVal = Boolean(navbarInput?.value?.trim());
        navbarSearchContainer?.classList.toggle("has-value", hasVal);
    };

    if (navbarClearBtn && navbarInput) {
        navbarClearBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            navbarInput.value = "";
            if (searchPref) searchPref.value = "";
            updateNavbarSearchState();
            navbarInput.focus();
            clearTimeout(debounceTimeout);
            performSearch();
        });
    }

    // Typing in either preferences or navbar search inputs triggers search with debounce
    const inputs = [searchPref, navbarInput].filter(Boolean);
    inputs.forEach(input => {
        input.addEventListener("input", (e) => {
            const val = e.target.value;
            if (searchPref && searchPref !== e.target && searchPref.value !== val) searchPref.value = val;
            if (navbarInput && navbarInput !== e.target && navbarInput.value !== val) navbarInput.value = val;
            updateNavbarSearchState();

            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(performSearch, 350);
        });

        input.addEventListener("keyup", (e) => {
            if (e.key === "Enter") {
                clearTimeout(debounceTimeout);
                performSearch();
            }
        });
    });

    updateNavbarSearchState();
}

async function loadCards() {
    const cardsContainer = document.getElementById("cards-container");
    if (cardsContainer && !cardsContainer.querySelector(".explore-skeleton-card")) {
        showExploreLoading(cardsContainer);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const tag = urlParams.get("tag");
    const keyword = urlParams.get("keyword");

    try {
        if (!cachedTemplate) {
            const templateHTML = await fetchContent("./components/cards.html");
            const parser = new DOMParser();
            const doc = parser.parseFromString(templateHTML, "text/html");
            cachedTemplate = doc.querySelector(".card");
        }

        const category = urlParams.get("category");

        let activities = [];
        if (tag) {
            const data = await searchActivities({ tag });
            activities = data.activities || [];
        } else if (keyword) {
            const data = await searchSemantic({ q: keyword });
            activities = data.activities || [];
            const searchPref = document.getElementById("search-pref");
            const navbarInput = document.getElementById("search-navbar");
            if (searchPref) searchPref.value = keyword;
            if (navbarInput) navbarInput.value = keyword;
        } else {
            const data = await getActivities();
            activities = data.activities || [];
        }

        if (category) {
            let chip = document.querySelector(`.category-chip[data-category="${category}"]`);
            if (!chip) {
                const chips = document.querySelectorAll(".category-chip");
                for (const c of chips) {
                    const chipText = c.textContent.trim().toLowerCase();
                    if (chipText === category.toLowerCase() || chipText.includes(category.toLowerCase())) {
                        chip = c;
                        break;
                    }
                }
            }

            if (chip) {
                document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                currentCategory = chip.dataset.category;
            }
        }

        masterActivitiesList = activities;
        allActivities = activities;

        // Sync certificate badges on recommendation cards in case recommendations rendered first
        document.querySelectorAll("#recommendations-container .card").forEach(card => {
            const id = card.dataset.id;
            const match = allActivities.find(a => String(a.activityID || a._id) === String(id));
            if (match && (match.hasCertificate === true || match.hasCertificate === 'true')) {
                let topLeftBadges = card.querySelector(".absolute.top-2\\.5.left-2\\.5, .absolute.top-2.left-2, .absolute.top-3.left-3");
                if (!topLeftBadges) {
                    topLeftBadges = document.createElement("div");
                    topLeftBadges.className = "absolute top-2.5 left-2.5 sm:top-3 sm:left-3 flex flex-col items-start gap-1.5 z-10 pointer-events-none";
                    card.appendChild(topLeftBadges);
                }
                if (!topLeftBadges.querySelector(".fa-award")) {
                    const certBadge = document.createElement("div");
                    certBadge.className = "bg-amber-50 text-amber-900 border border-amber-300/90 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs pointer-events-auto";
                    certBadge.innerHTML = `<i class="fa-solid fa-award text-amber-600 text-xs"></i><span>${t("explore.certificate_badge") || "Certificate"}</span>`;
                    topLeftBadges.appendChild(certBadge);
                }
            }
        });
        if (typeof window.__renderSearchCalendar === "function") window.__renderSearchCalendar();
        await applyFiltersAndSort();
        clearLoadingLanguage();
    } catch (err) {
        console.error(err);
        clearLoadingLanguage();
        hideExploreLoading();
        cardsContainer.innerHTML = `<div class="empty-state">${t("explore.failed_load")}</div>`;
    }
}

async function renderCards(activities) {
    if (!cachedTemplate) {
        const templateHTML = await fetchContent("./components/cards.html");
        const parser = new DOMParser();
        const doc = parser.parseFromString(templateHTML, "text/html");
        cachedTemplate = doc.querySelector(".card");
    }

    allActivities = activities;
    if (typeof window.__renderSearchCalendar === "function") window.__renderSearchCalendar();
    await applyFiltersAndSort();
}

async function applyFiltersAndSort() {
    currentPage = 1;
    let filtered = [...allActivities];

    if (currentCategory !== "all") {
        filtered = filtered.filter(a => {
            const cat = a.category?.slug || a.category?._id || (a.type || "").toLowerCase();
            return cat === currentCategory;
        });
    }

    if (currentStatus === "upcoming") {
        filtered = filtered.filter(a => getEventStatus(a) === 'registration_open');
    } else if (currentStatus === "ongoing") {
        filtered = filtered.filter(a => getEventStatus(a) === 'ongoing');
    } else if (currentStatus === "past") {
        filtered = filtered.filter(a => getEventStatus(a) === 'ended');
    } else if (currentStatus === "registration_closed") {
        filtered = filtered.filter(a => getEventStatus(a) === 'registration_closed');
    }

    if (currentCertificateOnly) {
        filtered = filtered.filter(a => a.hasCertificate === true || a.hasCertificate === 'true');
    }

    if (currentMyUniOnly && myUniversity) {
        const myUniId = String(myUniversity._id || "");
        const myShort = (myUniversity.shortName || "").trim().toLowerCase();
        const myName = (myUniversity.name || "").trim().toLowerCase();

        filtered = filtered.filter(a => {
            // 1. Matched by organization's university ObjectId
            const orgUni = a.organization?.university;
            const orgUniId = orgUni?._id || (typeof orgUni === "string" ? orgUni : null);
            if (orgUniId && String(orgUniId) === myUniId) return true;

            // 2. Matched by organization's university shortName or name
            const orgUniShort = (orgUni?.shortName || "").trim().toLowerCase();
            const orgUniName = (orgUni?.name || "").trim().toLowerCase();
            if (myShort && orgUniShort && orgUniShort === myShort) return true;
            if (myName && orgUniName && orgUniName === myName) return true;

            // 3. Matched by scraped non-partner school name
            const sourceSchool = (a.source?.school || "").trim().toLowerCase();
            if (sourceSchool) {
                if (myShort && sourceSchool.includes(myShort)) return true;
                if (myName && (sourceSchool.includes(myName) || myName.includes(sourceSchool))) return true;
            }

            // 4. Matched by location if mentioning school
            const loc = (a.location || "").toLowerCase();
            if (loc && myShort && (loc.includes(`(${myShort})`) || loc.includes(` ${myShort} `) || loc.startsWith(`${myShort} `) || loc.endsWith(` ${myShort}`))) return true;

            return false;
        });
    }

    switch (currentSort) {
        case "relevance":
            filtered.sort((a, b) => {
                const scoreA = a.score !== undefined ? a.score : 0;
                const scoreB = b.score !== undefined ? b.score : 0;
                return scoreB - scoreA;
            });
            break;
        case "newest":
            filtered.sort((a, b) => new Date(b.heldDate || 0) - new Date(a.heldDate || 0));
            break;
        case "popular":
            filtered.sort((a, b) => ((b.participants?.length || b.viewCount || 0) - (a.participants?.length || a.viewCount || 0)));
            break;
        case "ending":
            filtered.sort((a, b) => new Date(a.applicationDeadline || a.heldDate || 0) - new Date(b.applicationDeadline || b.heldDate || 0));
            break;
    }

    currentFilteredActivities = filtered;
    await renderCardsDirect(filtered);
}

async function renderCardsDirect(activities) {
    const cardsContainer = document.getElementById("cards-container");
    if (!cachedTemplate) return;

    if (activities.length === 0) {
        cardsContainer.innerHTML = `<div class="empty-state" style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#94a3b8"><span class="material-symbols-outlined" style="font-size:48px;display:block;margin-bottom:12px">search_off</span><p style="font-size:16px;font-weight:600">${t("explore.no_match")}</p><p style="font-size:13px;margin-top:4px">${t("explore.no_match_hint")}</p></div>`;
        document.getElementById("resultsCount").textContent = t("explore.results", { n: 0 });
        const pagContainer = document.getElementById("pagination-container");
        if (pagContainer) pagContainer.innerHTML = "";
        return;
    }

    const totalPages = Math.ceil(activities.length / pageSize);
    // Ensure currentPage is within bounds
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * pageSize;
    const paginatedActivities = activities.slice(startIndex, startIndex + pageSize);

    cardsContainer.innerHTML = "";
    const frag = document.createDocumentFragment();
    paginatedActivities.forEach(activity => {
        const card = createActivityCard(activity);
        if (card) frag.appendChild(card);
    });
    cardsContainer.appendChild(frag);

    document.getElementById("resultsCount").textContent = activities.length === 1 ? t("explore.result_singular", { n: activities.length }) : t("explore.results", { n: activities.length });

    renderPaginationControls(activities.length, totalPages);

    await syncCardFavourites();
    initCardClickHandlers();
}

function renderPaginationControls(totalItems, totalPages) {
    const container = document.getElementById("pagination-container");
    if (!container) return;
    container.style.display = ""; // Ensure it's visible again after search

    renderPagination({
        container,
        currentPage,
        totalPages,
        onPageChange: async (page) => {
            const cardsContainer = document.getElementById("cards-container");
            if (cardsContainer) {
                cardsContainer.querySelectorAll(".explore-skeleton-card").forEach(el => el.classList.add("fade-out"));
            }

            // Scroll to results header smoothly, accounting for fixed navbar
            const target = document.querySelector(".results-header");
            if (target) {
                const navbarHeight = document.getElementById("navbar")?.offsetHeight || 80;
                const y = target.getBoundingClientRect().top + window.scrollY - navbarHeight - 20;
                window.scrollTo({ top: y, behavior: "smooth" });
            }

            // Wait for smooth scroll to finish before rendering new cards
            await new Promise(resolve => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    window.removeEventListener('scrollend', finish);
                    clearTimeout(fallback);
                    resolve();
                };
                const fallback = setTimeout(finish, 800);
                window.addEventListener('scrollend', finish, { once: true });
            });

            currentPage = page;
            await renderCardsDirect(currentFilteredActivities);
        }
    });
}

function initSidebar() {
    document.querySelectorAll(".category-chip").forEach(chip => {
        chip.addEventListener("click", async () => {
            document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            currentCategory = chip.dataset.category;
            await applyFiltersAndSort();
        });
    });

    document.querySelectorAll(".sort-option").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".sort-option").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentSort = btn.dataset.sort;
            applyFiltersAndSort();
        });
    });

    document.querySelectorAll(".status-option").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".status-option").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentStatus = btn.dataset.status;
            applyFiltersAndSort();
        });
    });

    document.getElementById("clearFilters")?.addEventListener("click", async () => {
        const searchInput = document.getElementById("search-pref");
        const navbarInput = document.getElementById("search-navbar");
        const locInput = document.getElementById("search-location");
        if (searchInput) searchInput.value = "";
        if (navbarInput) {
            navbarInput.value = "";
            document.getElementById("navbarSearchContainer")?.classList.remove("has-value");
        }
        if (locInput) locInput.value = "";
        if (typeof window.__resetSearchDates === "function") {
            window.__resetSearchDates();
        } else if (window.__searchDates) {
            window.__searchDates.startDate = null;
            window.__searchDates.endDate = null;
            const placeholder = document.getElementById("drPlaceholder");
            const value = document.getElementById("drValue");
            if (placeholder) placeholder.classList.remove("hidden");
            if (value) value.classList.remove("visible");
        }

        document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
        document.querySelector(".category-chip[data-category='all']")?.classList.add("active");
        currentCategory = "all";
        document.querySelectorAll(".sort-option").forEach(o => o.classList.remove("active"));
        document.querySelector(".sort-option[data-sort='newest']")?.classList.add("active");
        currentSort = "newest";
        document.querySelectorAll(".status-option").forEach(b => b.classList.remove("active"));
        document.querySelector(".status-option[data-status='upcoming']")?.classList.add("active");
        currentStatus = "upcoming";

        currentMyUniOnly = false;
        const myUniToggle = document.getElementById("toggleMyUni");
        if (myUniToggle) {
            myUniToggle.checked = false;
            document.getElementById("myUniSection")?.classList.remove("active");
        }

        currentCertificateOnly = false;
        const certToggle = document.getElementById("toggleCertificate");
        if (certToggle) {
            certToggle.checked = false;
            document.getElementById("certificateSection")?.classList.remove("active-amber");
        }

        await applyFiltersAndSort();
    });

    initMyUniToggle();

    const certToggle = document.getElementById("toggleCertificate");
    certToggle?.addEventListener("change", async () => {
        currentCertificateOnly = certToggle.checked;
        document.getElementById("certificateSection")?.classList.toggle("active-amber", certToggle.checked);
        await applyFiltersAndSort();
    });

    document.getElementById("sidebarToggle")?.addEventListener("click", () => {
        document.getElementById("exploreSidebar")?.classList.toggle("open");
    });

    document.getElementById("closeSidebarBtn")?.addEventListener("click", () => {
        document.getElementById("exploreSidebar")?.classList.remove("open");
    });

    const sidebar = document.getElementById("exploreSidebar");
    sidebar?.addEventListener("click", (e) => {
        if (e.target === sidebar) sidebar.classList.remove("open");
    });
}

async function initMyUniToggle() {
    const toggleInput = document.getElementById("toggleMyUni");
    const subtitle = document.getElementById("myUniSubtitle");
    if (!toggleInput || !subtitle) return;

    if (!isAuthenticated()) {
        subtitle.className = "text-xs sm:text-[13px] text-slate-500 font-medium leading-relaxed mt-2.5 break-words flex items-center gap-1.5";
        subtitle.innerHTML = `<span class="material-symbols-outlined text-[15px] shrink-0 text-slate-400">lock</span><span>${t("explore.my_university_login_hint", "Log in to filter")}</span>`;
        toggleInput.addEventListener("change", (e) => {
            e.preventDefault();
            toggleInput.checked = false;
            document.getElementById("myUniSection")?.classList.remove("active");
            showLoginPrompt({
                message: t("auth_modal.desc_filter_uni", "Vui lòng đăng nhập để xem các sự kiện từ trường của bạn."),
                redirectUrl: window.location.pathname + window.location.search
            });
        });
        return;
    }

    const user = getUser();
    try {
        myUniversity = await getMyUniversity();
    } catch (e) {
        console.warn("Failed to fetch my university:", e);
    }

    // Fallback: match by user's school field if joinedUniversity isn't populated
    if (!myUniversity && user?.school) {
        try {
            const allUnis = await getUniversities();
            const schoolName = user.school.trim().toLowerCase();
            myUniversity = allUnis.find(u =>
                (u.shortName && u.shortName.toLowerCase() === schoolName) ||
                (u.name && u.name.toLowerCase() === schoolName) ||
                (u.name && u.name.toLowerCase().includes(schoolName)) ||
                (schoolName.includes(u.name?.toLowerCase() || ""))
            ) || null;
        } catch (e) {
            console.warn("Fallback university matching failed:", e);
        }
    }

    if (myUniversity) {
        const displayName = myUniversity.shortName
            ? `${myUniversity.shortName} - ${myUniversity.name}`
            : myUniversity.name;
        subtitle.title = displayName;
        subtitle.className = "text-xs sm:text-[13px] text-primary font-semibold leading-relaxed mt-2.5 break-words flex items-center gap-1.5";
        subtitle.innerHTML = `<span class="material-symbols-outlined text-[15px] shrink-0 text-emerald-600">verified</span><span class="truncate">${escapeHtml(displayName)}</span>`;

        toggleInput.addEventListener("change", async () => {
            currentMyUniOnly = toggleInput.checked;
            document.getElementById("myUniSection")?.classList.toggle("active", toggleInput.checked);
            await applyFiltersAndSort();
        });
    } else {
        // User logged in but has not verified student status / no school
        subtitle.className = "text-xs sm:text-[13px] text-amber-700 font-medium leading-relaxed mt-2.5 break-words flex items-center gap-1.5";
        subtitle.innerHTML = `<span class="material-symbols-outlined text-[15px] shrink-0 text-amber-600">info</span><span>${t("explore.my_university_verify_hint", "Verify student ID to filter")}</span>`;
        toggleInput.addEventListener("change", async (e) => {
            e.preventDefault();
            toggleInput.checked = false;
            document.getElementById("myUniSection")?.classList.remove("active");
            const confirmed = await showConfirmDialog({
                titleKey: "common.confirm_title",
                messageKey: "explore.my_university_verify_prompt",
                confirmTextKey: "common.confirm_btn",
                type: "primary"
            });
            if (confirmed) {
                window.location.href = "./student-verify.html";
            }
        });
    }
}

function initializePage() {
    initCardReveal();
}



function toggleCardStar(activityID, active) {
    const cards = document.querySelectorAll(`.card[data-id="${activityID}"]`);
    cards.forEach(card => {
        const star = card.querySelector(".star");
        if (star) star.classList.toggle("active", active);
    });
}

const boundCardContainers = new WeakSet();
let favReqInFlight = null;
let cachedFavIds = null;
const favLocks = new Set();

function attachCardContainerEvents(container) {
    if (!container || boundCardContainers.has(container)) return;
    boundCardContainers.add(container);

    container.addEventListener("click", async (e) => {
        const star = e.target.closest(".star");
        if (star) {
            e.preventDefault();
            e.stopPropagation();
            const card = star.closest(".card");
            const id = card?.dataset.id;
            if (!id || favLocks.has(id)) return;
            if (!isAuthenticated()) {
                showLoginPrompt({
                    message: t("auth_modal.desc_favorite", "Vui lòng đăng nhập để lưu hoạt động yêu thích."),
                    redirectUrl: window.location.pathname + window.location.search
                });
                return;
            }

            const user = getUser();
            if (!checkVerificationGuard(user, "favourite activities")) {
                return;
            }
            const active = star.classList.contains("active");
            star.classList.toggle("active");
            if (cachedFavIds) {
                if (active) cachedFavIds.delete(id);
                else cachedFavIds.add(id);
            }
            favLocks.add(id);
            try {
                if (active) await removeFavourite(id);
                else {
                    await addFavourite(id);
                    const currentUserId = user?._id || user?.id || "guest";
                    const explorerKey = `springwave_has_earned_explorer_${currentUserId}`;

                    let alreadyHasBadge = false;
                    try {
                        const contribRaw = localStorage.getItem(`springwave_contrib_${currentUserId}`);
                        if (contribRaw) {
                            const contrib = JSON.parse(contribRaw);
                            if (contrib?.badges?.includes("active_explorer")) {
                                alreadyHasBadge = true;
                            }
                        }
                    } catch {}

                    if (cachedFavIds && cachedFavIds.size >= 5 && !localStorage.getItem(explorerKey) && !alreadyHasBadge) {
                        localStorage.setItem(explorerKey, "true");
                        setTimeout(() => {
                            triggerBadgeCelebration("active_explorer");
                        }, 500);
                    }
                }
            } catch (err) {
                star.classList.toggle("active");
                if (cachedFavIds) {
                    if (active) cachedFavIds.add(id);
                    else cachedFavIds.delete(id);
                }
                console.error("Failed to toggle favourite:", err);
            } finally {
                favLocks.delete(id);
            }
            return;
        }

        const detailsBtn = e.target.closest(".details-btn");
        if (detailsBtn) {
            e.stopPropagation();
            const card = detailsBtn.closest(".card");
            if (card?.dataset.id) {
                const actData = allActivities.find(a => String(a.activityID || a._id) === card.dataset.id);
                await openEventPopup(card.dataset.id, { activityData: actData });
            }
            return;
        }

        const card = e.target.closest(".card");
        if (card?.dataset.id) {
            const actData = allActivities.find(a => String(a.activityID || a._id) === card.dataset.id);
            await openEventPopup(card.dataset.id, { activityData: actData });
        }
    });
}

function initCardClickHandlers() {
    const cardsContainer = document.getElementById("cards-container");
    const recContainer = document.getElementById("recommendations-container");
    if (cardsContainer) attachCardContainerEvents(cardsContainer);
    if (recContainer) attachCardContainerEvents(recContainer);
}

async function syncCardFavourites() {
    if (!isAuthenticated()) return;
    try {
        let activities;
        if (favReqInFlight) {
            const res = await favReqInFlight;
            activities = res.activities || [];
        } else {
            favReqInFlight = getFavourites();
            const res = await favReqInFlight;
            favReqInFlight = null;
            activities = res.activities || [];
        }
        cachedFavIds = new Set(activities.map(a => a.activityID));
        cachedFavIds.forEach(id => toggleCardStar(id, true));
    } catch (err) {
        console.error("Failed to sync favourites:", err);
    }
}

function buildPopupHTML(a, backText) {
    const heldDate = formatDate(a.heldDate);
    const cat = a.category;
    const typeLabel = cat && cat.name ? cat.name : capitalize(a.type);
    const typeIcon = cat && cat.icon ? cat.icon.replace(/[^a-z0-9_-]/gi, "") : "fa-solid fa-tag";
    const typeColor = /^#[0-9a-fA-F]{3,8}$/.test(cat && cat.color) ? cat.color : "#64748b";
    const hasCoords = a.locationLat && a.locationLng;
    const googleMapsLink = hasCoords
        ? `https://www.google.com/maps?q=${a.locationLat},${a.locationLng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.location)}`;
    backText = backText || t("explore.back");
    const filesHTML = (a.attachments || []).map(f => {
        const link = f.link || f.activityAttachLink || "";
        const fileName = decodeURIComponent(link.split('/').pop());
        return `<div class="file-item">
            <div class="file-left">
                <div class="file-icon"><i class="fa-solid fa-file"></i></div>
                <div><h4>${escapeHtml(fileName)}</h4></div>
            </div>
            <a class="download-btn" href="${escapeAttr(CDN_DOMAIN)}/${escapeAttr(link)}" target="_blank"><i class="fa-solid fa-download"></i></a>
        </div>`;
    }).join("");

    const hostOrgName = typeof a.organization === 'object' ? a.organization?.name : null;
    const displayHost = hostOrgName || a.hostName || (a.organization ? t("common.organization", "Organization") : a.createdByName) || t("common.unknown");

    const safeTitle = escapeHtml(a.title || "");
    const safeBack = escapeHtml(backText);
    const safeHost = escapeHtml(displayHost || "U");
    const safeTypeLabel = escapeHtml(typeLabel);
    const safeDescription = (a.description || "").split('\n').filter(p => p.trim()).map(p => `<p>${escapeHtml(p)}</p>`).join('');
    const safeHostAvatar = safeHost.charAt(0).toUpperCase();
    const safeThumb = escapeAttr(a.thumbnail || 'https://images.unsplash.com/photo-1618477462146-050d2767eac4?q=80&w=1200&auto=format&fit=crop');
    const safeLocation = escapeHtml(a.location || "");

    return `
    <div class="activity-popup-layout">
        <div class="popup-hero-cover">
            <img src="${safeThumb}" alt="${safeTitle}">
            <div class="popup-hero-overlay"></div>
            <button class="back-btn-floating" id="back-btn" title="${safeBack}"><i class="fa-solid fa-arrow-left"></i></button>
            <span class="popup-category-badge" style="background:${typeColor}20;color:${typeColor}"><i class="${typeIcon}"></i><span>${safeTypeLabel}</span></span>
        </div>

        <div class="popup-body-grid">
            <div class="popup-body-main">
                <h1 class="popup-main-title">${safeTitle}</h1>
                <div class="popup-host-row">
                    <div class="popup-host-avatar">${safeHostAvatar}</div>
                    <div class="popup-host-info">
                        <span class="host-label">Hosted by</span>
                        <h4 class="host-name">${safeHost}</h4>
                    </div>
                </div>
                <div class="popup-section-divider"></div>
                <h3 class="popup-section-title">About this Activity</h3>
                <div class="popup-description-text">
                    ${safeDescription}
                </div>
                ${filesHTML ? `
                <div class="popup-section-divider"></div>
                <div class="popup-attachments-section">
                    <h3>${t("explore.attached_files")} (${(a.attachments || []).length})</h3>
                    <div class="popup-files-list">${filesHTML}</div>
                </div>` : ""}
            </div>

            <aside class="popup-sidebar">
                <div class="popup-sidebar-card">
                    <h3 class="sidebar-card-title">Activity Details</h3>
                    <div class="sidebar-details-list">
                        <div class="sidebar-detail-item">
                            <i class="fa-regular fa-calendar"></i>
                            <div>
                                <span>Date & Time</span>
                                <p>${heldDate}</p>
                            </div>
                        </div>
                        <div class="sidebar-detail-item">
                            <i class="fa-solid fa-location-dot"></i>
                            <div>
                                <span>Location</span>
                                <p><a href="${escapeAttr(googleMapsLink)}" target="_blank" class="sidebar-location-link">${escapeHtml(a.location)} <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a></p>
                            </div>
                        </div>
                        <div class="sidebar-detail-item">
                            <i class="${typeIcon}" style="color:${typeColor}"></i>
                            <div>
                                <span>Category</span>
                                <p>${typeLabel}</p>
                            </div>
                        </div>
                    </div>

                    <div class="sidebar-actions-group">
                        <button class="action-btn participate" type="button">
                            <i class="fa-solid fa-users"></i>
                            <div>
                                <h4 class="participate-header">${t("explore.participate")}</h4>
                                <p class="participate-text">${t("explore.join_activity")}</p>
                            </div>
                        </button>
                        <button class="action-btn discuss discuss-btn" data-event-id="${escapeAttr(a.activityID)}" data-event-title="${escapeAttr(a.title)}" type="button">
                            <i class="fa-solid fa-comments"></i>
                            <div>
                                <h4>DISCUSS</h4>
                                <p>Join the thread</p>
                            </div>
                        </button>
                        <div class="sidebar-minor-row">
                            <button class="icon-btn minor-btn" type="button"><span class="material-symbols-outlined text-base">share</span> ${t("explore.share")}</button>
                            <button type="button" class="favorite-btn minor-btn"><div class="star"><i class="fa-solid fa-star"></i></div><span class="favorite-text">${t("explore.favourite")}</span></button>
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    </div>`;
}

function initDetailButtons() {
    document.querySelectorAll(".details-btn").forEach(button => {
        button.addEventListener("click", (e) => e.stopPropagation());
    });
}

function initCardReveal() {
    const cards = document.querySelectorAll(".card");
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("revealed");
                    observer.unobserve(entry.target);
                }
            });
        },
        { threshold: 0, rootMargin: "0px 0px -40px 0px" }
    );
    cards.forEach((card, index) => {
        card.style.transitionDelay = `${index * 70}ms`;
        observer.observe(card);
    });
}


function setFavourited(activityID) {
    const btn = document.querySelector(".favorite-btn");
    if (btn) btn.classList.add("active");
    toggleCardStar(activityID, true);
}

async function showFavourites() {
    if (!isAuthenticated()) {
        showLoginPrompt({
            message: t("auth_modal.desc_favorite", "Vui lòng đăng nhập để xem các hoạt động yêu thích."),
            redirectUrl: window.location.pathname + window.location.search
        });
        return;
    }
    try {
        const { activities } = await getFavourites();
        popupContainer.innerHTML = buildFavouritesHTML(activities || []);
        popupOverlay.removeAttribute("hidden");
        popupOverlay.classList.add("active");
        document.body.style.overflow = "hidden";
        popupContainer.querySelector("#back-btn")?.addEventListener("click", closePopup);
        const cards = popupContainer.querySelectorAll(".activity-card");
        activities.forEach((a, i) => {
            cards[i]?.addEventListener("click", () => openPopup2(a.activityID, a));
        });
    } catch (err) {
        console.error("Failed to show favourites:", err);
    }
}

function buildFavouritesHTML(activities) {
    if (activities.length === 0) {
        return `<div class="container" style="padding:40px;text-align:center;color:var(--text-muted)"><p>${t("explore.no_favourites")}</p></div>`;
    }
    const items = activities.map(a => {
        const held = formatDate(a.heldDate);
        const cat = a.category;
        const type = cat && cat.name ? cat.name : capitalize(a.type);
        const safeType = escapeHtml(type);
        const safeTitle = escapeHtml(a.title);
        const safeLocation = escapeHtml(a.location);
        const safeThumb = escapeAttr(a.thumbnail);
        return `<div class="activity-card" data-id="${escapeAttr(a.activityID)}" style="cursor:pointer;border:1px solid #e8ecf4;border-radius:12px;padding:16px;margin-bottom:12px;display:flex;gap:16px;transition:background 0.2s">
            <div style="width:120px;height:90px;border-radius:10px;overflow:hidden;background:#e8ecf4;flex-shrink:0;">
                ${a.thumbnail ? `<img src="${safeThumb}" style="width:100%;height:100%;object-fit:cover;" alt="${safeTitle}">` : '<div style="padding:30px;text-align:center;color:#999"><i class="fa-regular fa-image"></i></div>'}
            </div>
            <div style="flex:1">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="font-size:12px;padding:2px 10px;border-radius:999px;background:#dce9ff;color:var(--accent);font-weight:600;">${safeType}</span>
                    <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(held)}</span>
                </div>
                <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">${safeTitle}</h3>
                <div style="font-size:13px;color:var(--text-secondary)"><i class="fa-solid fa-location-dot" style="color:var(--accent)"></i> ${safeLocation}</div>
            </div>
        </div>`;
    }).join('');
    return `<div class="container"><div class="top-bar"><button class="back-btn" id="back-btn"><i class="fa-solid fa-arrow-left"></i> ${t("explore.back")}</button><h2 style="font-size:22px;font-weight:700;">${t("explore.favourite_activities")}</h2></div><div style="margin-top:20px;">${items}</div></div>`;
}

function initParticipateButton(activityID) {
    const participateBtn = document.querySelector(".participate");
    if (!participateBtn) return;
    participateBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const button = e.currentTarget;
        const isActive = button.classList.contains("active");
        if (!isAuthenticated()) return;
        try {
            if (isActive) {
                await unparticipateActivity(activityID);
                button.classList.remove("active");
                button.querySelector(".participate-header").textContent = t("explore.participate");
                button.querySelector(".participate-text").textContent = t("explore.join_activity");
            } else {
                await participateActivity(activityID);
                button.classList.add("active");
                button.querySelector(".participate-header").textContent = t("explore.participated");
                button.querySelector(".participate-text").textContent = t("explore.joined_activity");
            }
        } catch (err) {
            console.error("Participate error:", err);
            button.querySelector(".participate-text").textContent = err.message || t("common.error");
            setTimeout(() => {
                button.querySelector(".participate-text").textContent = button.classList.contains("active") ? t("explore.joined_activity") : t("explore.join_activity");
            }, 2000);
        }
    });
}

function initSearchDatePicker() {
    const item = document.getElementById("zone-date");
    const trigger = document.getElementById("drTrigger");
    const placeholder = document.getElementById("drPlaceholder");
    const value = document.getElementById("drValue");
    const dropdown = document.getElementById("drDropdown");
    const grid = document.getElementById("drCalGrid");
    const monthLabel = document.getElementById("drMonthLabel");
    const prevBtn = document.getElementById("drPrev");
    const nextBtn = document.getElementById("drNext");
    const clearBtn = document.getElementById("drClear");
    const closeBtn = document.getElementById("drClose");
    if (!trigger) return;

    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    let startDate = null;
    let endDate = null;
    window.__searchDates = { startDate: null, endDate: null };

    function syncSearchDates() { window.__searchDates.startDate = startDate; window.__searchDates.endDate = endDate; }
    function pad(n) { return String(n).padStart(2, "0"); }

    function formatDisplay() {
        if (startDate && endDate) {
            value.textContent = `${pad(startDate.getDate())}/${pad(startDate.getMonth() + 1)} - ${pad(endDate.getDate())}/${pad(endDate.getMonth() + 1)}`;
            value.classList.add("visible");
            placeholder.classList.add("hidden");
        } else if (startDate) {
            value.textContent = `${pad(startDate.getDate())}/${pad(startDate.getMonth() + 1)} - dd/mm`;
            value.classList.add("visible");
            placeholder.classList.add("hidden");
        } else {
            value.classList.remove("visible");
            placeholder.classList.remove("hidden");
        }
    }

    function getEventCountsByDate() {
        const counts = {};
        const source = (masterActivitiesList && masterActivitiesList.length > 0) ? masterActivitiesList : allActivities;
        if (!Array.isArray(source)) return counts;
        for (const a of source) {
            if (!a || !a.heldDate) continue;
            const d = new Date(a.heldDate);
            if (isNaN(d.getTime())) continue;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
    }

    function renderCalendar() {
        grid.innerHTML = "";
        const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
        weekdays.forEach(d => { const el = document.createElement("div"); el.className = "dr-weekday"; el.textContent = d; grid.appendChild(el); });
        monthLabel.textContent = new Date(currentYear, currentMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;
        for (let i = startOffset - 1; i >= 0; i--) {
            const el = document.createElement("div");
            el.className = "dr-day other-month";
            el.innerHTML = `<span class="dr-day-num">${daysInPrevMonth - i}</span>`;
            grid.appendChild(el);
        }
        const today = new Date();
        const eventCounts = getEventCountsByDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const el = document.createElement("div");
            el.className = "dr-day";
            const date = new Date(currentYear, currentMonth, d);
            const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const count = eventCounts[dateKey] || 0;

            let dayHtml = `<span class="dr-day-num">${d}</span>`;
            if (count > 0) {
                el.classList.add("has-events");
                const countLabel = count > 99 ? "99+" : count;
                dayHtml += `<span class="dr-day-events" title="${count} ${count === 1 ? 'event' : 'events'}">${countLabel}</span>`;
                el.title = `${d}/${currentMonth + 1}/${currentYear}: ${count} ${count === 1 ? 'event' : 'events'}`;
            }
            el.innerHTML = dayHtml;

            if (d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) el.classList.add("today");
            el.dataset.date = date.toISOString();
            if (startDate && endDate && date > startDate && date < endDate) el.classList.add("in-range");
            if (startDate && date.getTime() === startDate.getTime()) { el.classList.add("range-start"); el.classList.add("in-range"); }
            if (endDate && date.getTime() === endDate.getTime()) { el.classList.add("range-end"); el.classList.add("in-range"); }
            if (startDate && endDate && startDate.getTime() === endDate.getTime() && date.getTime() === startDate.getTime()) el.classList.add("selected");
            el.addEventListener("click", () => {
                const clicked = new Date(currentYear, currentMonth, d);
                if (!startDate || (startDate && endDate)) { startDate = clicked; endDate = null; }
                else if (clicked < startDate) { startDate = clicked; }
                else { endDate = clicked; }
                syncSearchDates(); renderCalendar(); formatDisplay();
            });
            grid.appendChild(el);
        }
        const totalCells = startOffset + daysInMonth;
        const remaining = (7 - (totalCells % 7)) % 7;
        for (let i = 1; i <= remaining; i++) {
            const el = document.createElement("div");
            el.className = "dr-day other-month";
            el.innerHTML = `<span class="dr-day-num">${i}</span>`;
            grid.appendChild(el);
        }
    }

    window.__renderSearchCalendar = renderCalendar;
    window.__resetSearchDates = () => {
        startDate = null;
        endDate = null;
        syncSearchDates();
        renderCalendar();
        formatDisplay();
    };

    function openDropdown() {
        dropdown.removeAttribute("hidden");
        const today = new Date(); currentMonth = today.getMonth(); currentYear = today.getFullYear();
        renderCalendar(); dropdown.classList.add("active"); item.classList.add("active");
    }

    function closeDropdown() {
        dropdown.classList.remove("active"); item.classList.remove("active");
        dropdown.setAttribute("hidden", "");
    }

    trigger.addEventListener("click", (e) => { e.stopPropagation(); dropdown.classList.contains("active") ? closeDropdown() : openDropdown(); });
    prevBtn.addEventListener("click", (e) => { e.stopPropagation(); currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(); });
    nextBtn.addEventListener("click", (e) => { e.stopPropagation(); currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); });
    clearBtn.addEventListener("click", (e) => { e.stopPropagation(); startDate = null; endDate = null; syncSearchDates(); renderCalendar(); formatDisplay(); });
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeDropdown(); });
    document.addEventListener("click", (e) => { if (dropdown.classList.contains("active") && !dropdown.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) closeDropdown(); });
    dropdown.addEventListener("click", (e) => e.stopPropagation());
    formatDisplay();
}

function initMapSelector() {
    const trigger = document.getElementById("mapTrigger");
    const locInput = document.getElementById("search-location");
    const overlay = document.getElementById("mapModalOverlay");
    const backdrop = document.getElementById("mapModalBackdrop");
    const closeBtn = document.getElementById("mapModalClose");
    const cancelBtn = document.getElementById("mapCancelBtn");
    const confirmBtn = document.getElementById("mapConfirmBtn");
    const searchInput = document.getElementById("mapSearchInput");
    const searchBtn = document.getElementById("mapSearchBtn");
    const locateBtn = document.getElementById("mapLocateBtn");
    const addressText = document.getElementById("selectedAddressText");

    if (!trigger || !overlay) return;

    let map = null;
    let marker = null;
    let selectedAddress = "";

    const openModal = () => {
        overlay.removeAttribute("hidden");
        overlay.classList.add("active");
        document.body.style.overflow = "hidden";

        if (typeof L === "undefined") {
            if (addressText) {
                addressText.innerHTML = `<span style="color:#ef4444;font-weight:600">The map library (Leaflet) could not be loaded because unpkg.com is blocked or offline. Please check your network.</span>`;
            }
            return;
        }

        if (!map) {
            map = L.map("leafletMap").setView([16.0544, 108.2022], 13);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            map.on("click", async (e) => {
                const { lat, lng } = e.latlng;
                updateMarker(lat, lng);
            });
        }

        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    };

    const closeModal = () => {
        overlay.classList.remove("active");
        document.body.style.overflow = "";
        setTimeout(() => {
            overlay.setAttribute("hidden", "");
        }, 300);
    };

    const updateMarker = async (lat, lng) => {
        if (marker) {
            marker.setLatLng([lat, lng]);
        } else {
            marker = L.marker([lat, lng], { draggable: true }).addTo(map);
            marker.on("dragend", async () => {
                const pos = marker.getLatLng();
                await reverseGeocode(pos.lat, pos.lng);
            });
        }
        map.panTo([lat, lng]);
        await reverseGeocode(lat, lng);
    };

    const searchAddress = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        searchBtn.disabled = true;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
            const data = await res.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                map.setView([lat, lon], 14);
                updateMarker(lat, lon);
            } else {
                alert("Location not found. Try searching for a city or address.");
            }
        } catch (e) {
            console.error("Geocoding failed:", e);
        } finally {
            searchBtn.disabled = false;
        }
    };

    const useCurrentLocation = () => {
        if (!navigator.geolocation) {
            addressText.textContent = "Your browser does not support location services. Search for an address instead.";
            return;
        }

        const originalButtonContent = locateBtn?.innerHTML;
        if (locateBtn) {
            locateBtn.disabled = true;
            locateBtn.innerHTML = '<span class="material-symbols-outlined map-locating-icon" aria-hidden="true">progress_activity</span>';
        }
        addressText.textContent = "Getting your current location...";

        const restoreButton = () => {
            if (locateBtn) {
                locateBtn.disabled = false;
                locateBtn.innerHTML = originalButtonContent;
            }
        };

        navigator.geolocation.getCurrentPosition(
            async ({ coords }) => {
                try {
                    map.setView([coords.latitude, coords.longitude], 15);
                    await updateMarker(coords.latitude, coords.longitude);
                } finally {
                    restoreButton();
                }
            },
            (error) => {
                addressText.textContent = error.code === error.PERMISSION_DENIED
                    ? "Location permission was not granted. Search for an address instead."
                    : "We could not get your location. Check your connection and try again.";
                restoreButton();
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    };

    const reverseGeocode = async (lat, lng) => {
        addressText.textContent = "Loading address details...";
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            if (data && data.display_name) {
                const parts = data.display_name.split(",");
                selectedAddress = parts.slice(0, 3).join(",").trim();
                addressText.textContent = selectedAddress;
            } else {
                selectedAddress = `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                addressText.textContent = selectedAddress;
            }
        } catch (e) {
            selectedAddress = `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            addressText.textContent = selectedAddress;
        }
    };

    trigger.addEventListener("click", openModal);
    locInput.addEventListener("click", openModal);

    [closeBtn, cancelBtn, backdrop].filter(Boolean).forEach(el => {
        el.addEventListener("click", closeModal);
    });

    searchBtn.addEventListener("click", searchAddress);
    locateBtn?.addEventListener("click", useCurrentLocation);
    searchInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter") searchAddress();
    });

    confirmBtn.addEventListener("click", () => {
        if (locInput && selectedAddress) {
            locInput.value = selectedAddress;
        }
        closeModal();
    });
}

if (typeof window !== "undefined") {
    window.addEventListener("language-changed", async () => {
        if (currentFilteredActivities && currentFilteredActivities.length > 0) {
            await renderCardsDirect(currentFilteredActivities);
        } else if (allActivities && allActivities.length > 0) {
            await renderCardsDirect(allActivities);
        }
        loadRecommendations().catch(() => {});
    });
}





