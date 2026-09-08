import "../../src/style.css";
import { isAuthenticated, getUser, setUser, isStudentVerified } from "../lib/session.js";
import { changeInfo, getFavourites, getUserContribution, uploadAvatar, getParticipatedActivities, getMyTickets, requestEmailChange, confirmEmailChange } from "../api/user.js";
import { getCurrentUser, changePassword } from "../api/auth.js";
import { getMyProfile } from "../api/profile.js";
import {
    getActivityById, participateActivity,
    unparticipateActivity, checkParticipation
} from "../api/activities.js";
import { addFavourite, removeFavourite, checkFavourite } from "../api/user.js";
import { getMyRoadmaps } from "../api/roadmap.js";
import { getMyOrganizations, getAllOrganizations, getOrgActivities } from "../api/organizations.js";
import { CDN_DOMAIN } from "../config.js";
import { initChatbot } from "../components/chatbot.js";
import { loadNavbar as loadSharedNavbar, initBasicScroll } from "../components/navbar.js";
import { openReviewModal } from "../components/reviewModal.js";
import { openEventPopup } from "../components/eventPopup.js";
import { fetchContent, formatDate, capitalize } from "../lib/utils.js";
import { escapeHtml, escapeAttr } from "../lib/sanitize.js";
import { t, getLang } from "../lib/i18n.js";
import { populateUniversitySelect } from "../api/universities.js";
import { triggerBadgeCelebration, BADGE_DEFINITIONS } from "../components/badgeCelebration.js";

const popupOverlay = document.getElementById("popup-overlay");
const popupContainer = document.getElementById("popup-container");
let currentUser = null;
let cropperInstance = null;

// Store badge rendering data for language change re-render
let badgeRenderData = null;

const CONTRIB_LEVELS = [
  { level: 1, min: 0, max: 99 },
  { level: 2, min: 100, max: 249 },
  { level: 3, min: 250, max: 499 },
  { level: 4, min: 500, max: 999 },
  { level: 5, min: 1000, max: 1999 },
  { level: 6, min: 2000, max: Infinity },
];

function calcContribLevel(score) {
  for (const l of CONTRIB_LEVELS) {
    if (score >= l.min && score <= l.max) {
      const range = l.max === Infinity ? l.min : l.max - l.min + 1;
      const progress = l.max === Infinity ? 1 : (score - l.min) / range;
      return { level: l.level, current: score - l.min, next: l.max === Infinity ? null : range, progress: Math.min(progress, 1) };
    }
  }
  return { level: 1, current: 0, next: 100, progress: 0 };
}

const ALL_BADGES = BADGE_DEFINITIONS;

function getBadgeProgress(key, c, user, favoritesCount = 0, participationsCount = 0) {
  switch (key) {
    case "talk_is_silver": return { current: c?.repliesGiven || 0, target: 1 };
    case "so_it_begins": return { current: c?.discussionsStarted || 0, target: 1 };
    case "conversation_starter": return { current: c?.discussionsStarted || 0, target: 5 };
    case "helper": return { current: c?.repliesGiven || 0, target: 10 };
    case "chatterbox": return { current: c?.repliesGiven || 0, target: 50 };
    case "respected": return { current: c?.likesReceived || 0, target: 20 };
    case "the_oracle": return { current: c?.likesReceived || 0, target: 50 };
    case "trendsetter": return { current: c?.discussionsStarted || 0, target: 20 };
    case "community_star": return { current: c?.score || 0, target: 100 };
    case "keyboard_warrior": return { current: c?.repliesGiven || 0, target: 100 };
    case "mentor": return { current: c?.score || 0, target: 1000 };
    case "the_sage": return { current: c?.score || 0, target: 2000 };

    // Activity progress
    case "active_explorer": return { current: favoritesCount || 0, target: 5 };
    case "event_goer": return { current: participationsCount || 0, target: 1 };

    // Knowledge progress
    case "certified_novice": return { current: c?.certificatesEarned || 0, target: 1 };
    case "certified_expert": return { current: c?.certificatesEarned || 0, target: 5 };
    case "certified_master": return { current: c?.certificatesEarned || 0, target: 10 };
    default: return null;
  }
}

function hasUserCompletedQuiz(user) {
  if (typeof window !== "undefined" && window._hasActiveAIProfile === true) return true;
  try {
    if (localStorage.getItem("springwave_quiz_completed") === "true") return true;
    if (localStorage.getItem("springwave_persona_key")) return true;
  } catch {}
  if (!user) return false;
  if (user.profile && (
    user.profile.archetypeTitle ||
    user.profile.personaKey ||
    user.profile.profileText ||
    user.profile.tagline ||
    (Array.isArray(user.profile.skills) && user.profile.skills.length > 0)
  )) return true;
  if (user.surveyScores && Object.values(user.surveyScores).some(s => typeof s === "number" && s > 0)) return true;
  if (Array.isArray(user.surveyAnswers) && user.surveyAnswers.length > 0) return true;
  return false;
}

function awardSelfDiscoveryBadgeIfNeeded(user) {
  try {
    localStorage.setItem("springwave_quiz_completed", "true");
  } catch {}
  if (badgeRenderData && !badgeRenderData.earnedKeys.has("self_discovery")) {
    badgeRenderData.earnedKeys.add("self_discovery");
    const activeUser = user || currentUser || getUser();
    const userId = activeUser?._id || activeUser?.id || 'guest';
    const badgeStorageKey = `springwave_badges_${userId}`;
    try {
      const stored = JSON.parse(localStorage.getItem(badgeStorageKey) || "[]");
      if (!stored.includes("self_discovery")) {
        stored.push("self_discovery");
        localStorage.setItem(badgeStorageKey, JSON.stringify(stored));
      }
    } catch {}
    renderBadgesPanel(
      badgeRenderData.earnedKeys,
      badgeRenderData.c,
      badgeRenderData.user || activeUser,
      badgeRenderData.favoritesCount,
      badgeRenderData.participationsCount
    );
  }
}

function computeLocalBadges(user, c = {}, favoritesCount = 0, participationsCount = 0) {
  const badges = [];
  if (user) badges.push("hello_world");
  if ((c.repliesGiven || 0) >= 1) badges.push("talk_is_silver");
  if ((c.discussionsStarted || 0) >= 1) badges.push("so_it_begins");
  if (hasUserCompletedQuiz(user)) {
    badges.push("self_discovery");
    try {
      localStorage.setItem("springwave_quiz_completed", "true");
    } catch {}
  }
  if ((c.discussionsStarted || 0) >= 5) badges.push("conversation_starter");
  if ((c.repliesGiven || 0) >= 10) badges.push("helper");
  if ((c.repliesGiven || 0) >= 50) badges.push("chatterbox");
  if ((c.likesReceived || 0) >= 20) badges.push("respected");
  if ((c.likesReceived || 0) >= 50) badges.push("the_oracle");
  if ((c.discussionsStarted || 0) >= 20) badges.push("trendsetter");
  if ((c.score || 0) >= 100) badges.push("community_star");
  if ((c.repliesGiven || 0) >= 100) badges.push("keyboard_warrior");
  if ((c.score || 0) >= 1000) badges.push("mentor");
  if ((c.score || 0) >= 2000) badges.push("the_sage");
  if ((c.repliesGiven || 0) > (c.discussionsStarted || 0) * 10 && (c.discussionsStarted || 0) > 0) badges.push("one_man_show");
  if ((c.discussionsStarted || 0) <= 3 && (c.discussionsStarted || 0) > 0 && (c.likesReceived || 0) >= (c.discussionsStarted || 0) * 5) badges.push("quality_over_quantity");

  // Activity & Event Gamification
  if (favoritesCount >= 5) badges.push("active_explorer");
  if (participationsCount >= 1) badges.push("event_goer");
  if (user && user.role === "host") {
    badges.push("rising_host");
    if ((c.score || 0) >= 100 || favoritesCount >= 5) {
      badges.push("grand_host");
    }
  }

  // Knowledge & Certificates Gamification
  if ((c.certificatesEarned || 0) >= 1) badges.push("certified_novice");
  if ((c.certificatesEarned || 0) >= 5) badges.push("certified_expert");
  if ((c.certificatesEarned || 0) >= 10) badges.push("certified_master");

  return badges;
}

function closePopup() {
    if (!popupOverlay) return;
    popupOverlay.classList.remove("active");
    setTimeout(() => {
        popupOverlay.setAttribute("hidden", "");
        if (popupContainer) popupContainer.innerHTML = "";
    }, 300);
}

function renderCachedProfileAndBadges() {
    const user = getUser();
    if (!user) return;

    currentUser = user;
    const userId = user._id || user.id || 'guest';

    const nameEl = document.getElementById("profile-name");
    if (nameEl) nameEl.textContent = user.username || user.fullname || "";
    const emailEl = document.getElementById("profile-email");
    if (emailEl) emailEl.textContent = user.email || "-";
    const phoneEl = document.getElementById("profile-phone");
    if (phoneEl) phoneEl.textContent = user.phoneNo || "-";
    const usernameEl = document.getElementById("profile-username");
    if (usernameEl) usernameEl.textContent = user.fullname || "-";

    if (user.dob) {
        const dobEl = document.getElementById("profile-dob");
        if (dobEl) dobEl.textContent = formatDate(user.dob, false);
    }

    if (user.school) {
        const schoolEl = document.getElementById("profile-school");
        if (schoolEl) schoolEl.textContent = user.school;
    }

    const roleMap = { student: t("user.student", "Student"), host: t("user.host", "Host"), admin: t("user.admin", "Admin") };
    const roleEl = document.getElementById("profile-role");
    if (roleEl) roleEl.textContent = roleMap[user.role] || "Student";

    const initial = (user.username || user.fullname || "?").charAt(0).toUpperCase();
    const avatarImg = document.getElementById("avatar-image");
    const avatarInitial = document.getElementById("avatar-initial");
    if (user.avatar && avatarImg) {
        avatarImg.src = user.avatar;
        avatarImg.style.display = "";
        if (avatarInitial) avatarInitial.style.display = "none";
    } else {
        if (avatarImg) avatarImg.style.display = "none";
        if (avatarInitial) {
            avatarInitial.textContent = initial;
            avatarInitial.style.display = "";
        }
    }

    // Immediately populate Badges and Contribute Score from localStorage in 0ms
    const badgeStorageKey = `springwave_badges_${userId}`;
    const contribStorageKey = `springwave_contrib_${userId}`;
    const countsStorageKey = `springwave_counts_${userId}`;
    
    let cachedContrib = { score: 0, discussionsStarted: 0, repliesGiven: 0, likesReceived: 0, likesGiven: 0, certificatesEarned: 0, badges: [] };
    try {
        const savedContrib = localStorage.getItem(contribStorageKey);
        if (savedContrib) cachedContrib = { ...cachedContrib, ...JSON.parse(savedContrib) };
    } catch {}

    let cachedCounts = { favoritesCount: 0, participationsCount: 0, hostedEventsCount: 0 };
    try {
        const savedCounts = localStorage.getItem(countsStorageKey);
        if (savedCounts) cachedCounts = { ...cachedCounts, ...JSON.parse(savedCounts) };
    } catch {}

    let storedBadges = [];
    try {
        const savedBadges = localStorage.getItem(badgeStorageKey);
        if (savedBadges) storedBadges = JSON.parse(savedBadges);
    } catch {}

    // Synchronously compute local badges immediately (0ms)
    const localBadges = computeLocalBadges(user, cachedContrib, cachedCounts.favoritesCount, cachedCounts.participationsCount);
    const serverBadges = cachedContrib.badges || [];
    const mergedBadges = [...new Set([...storedBadges, ...serverBadges, ...localBadges])];
    const earnedKeys = new Set(mergedBadges);

    const { level, current, next, progress } = calcContribLevel(cachedContrib.score || 0);
    const pct = Math.round(progress * 100);
    const nextLabel = next !== null ? `${current} / ${next} pts` : `${cachedContrib.score || 0} pts (Max)`;

    const scoreVal = document.getElementById("contribute-score-val");
    const levelEl = document.getElementById("contribute-level");
    const progressBar = document.getElementById("contribute-progress-bar");
    const scoreTarget = document.getElementById("contribute-score-target");
    const statDiscussions = document.getElementById("stat-discussions");
    const statCertificates = document.getElementById("stat-certificates");
    const statEvents = document.getElementById("stat-events");

    if (scoreVal) scoreVal.textContent = `${cachedContrib.score || 0} pts`;
    if (levelEl) levelEl.textContent = `Lv.${level}`;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (scoreTarget) scoreTarget.textContent = nextLabel;
    if (statDiscussions) statDiscussions.textContent = cachedContrib.discussionsStarted || 0;
    if (statCertificates) statCertificates.textContent = cachedContrib.certificatesEarned || 0;
    if (statEvents) statEvents.textContent = cachedCounts.participationsCount || 0;

    // ⚡ Instant 0ms Render for Hosted Events Card (Host / Admin)
    const isHost = user && user.role === "host";
    const isAdmin = user && user.role === "admin";
    const showHosted = isHost || isAdmin;
    const statHosted = document.getElementById("stat-hosted");
    const statHostedCard = document.getElementById("stat-hosted-card");
    const statsContainer = document.getElementById("stats-grid-container");

    if (showHosted && statsContainer && statHostedCard) {
        statHostedCard.classList.remove("hidden");
        statsContainer.classList.remove("sm:grid-cols-3");
        statsContainer.classList.add("sm:grid-cols-4");
        if (statHosted) statHosted.textContent = cachedCounts.hostedEventsCount || 0;
    } else if (statsContainer && statHostedCard) {
        statHostedCard.classList.add("hidden");
        statsContainer.classList.remove("sm:grid-cols-4");
        statsContainer.classList.add("sm:grid-cols-3");
    }

    badgeRenderData = { earnedKeys, c: cachedContrib, user, favoritesCount: cachedCounts.favoritesCount, participationsCount: cachedCounts.participationsCount };
    renderBadgesPanel(earnedKeys, cachedContrib, user, cachedCounts.favoritesCount, cachedCounts.participationsCount);
}

document.addEventListener("DOMContentLoaded", () => {
    if (!isAuthenticated()) {
        window.location.href = "/login.html";
        return;
    }

    // ⚡ 1. Render immediate cached state in 0ms (Zero delay!)
    renderCachedProfileAndBadges();

    initEditProfile();
    initChangePasswordModal();
    initChangeEmailModal();
    initContributionInfo();
    
    // Expose for onclick handlers
    window.openReviewModal = openReviewModal;

    // Re-render badges, AI profile, roadmap, and participated events on language change
    window.addEventListener("language-changed", () => {
        if (badgeRenderData) {
            renderBadgesPanel(
                badgeRenderData.earnedKeys,
                badgeRenderData.c,
                badgeRenderData.user,
                badgeRenderData.favoritesCount,
                badgeRenderData.participationsCount
            );
        }
        renderAIProfile();
        renderRoadmapSection().catch(() => {});
        renderParticipatedEventsPanel().catch(() => {});
    });

    // Check hash for badges redirection scroll
    function scrollToBadgeTarget() {
        const hash = window.location.hash;
        if (!hash || (!hash.startsWith("#badge-") && hash !== "#badges-section")) return;

        let targetEl = null;
        if (hash.startsWith("#badge-")) {
            const key = hash.replace("#badge-", "");
            targetEl = document.querySelector(`.badge-card[data-badge-key="${key}"]`);
        }
        if (!targetEl) {
            targetEl = document.getElementById("badges-section");
        }
        if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
            if (targetEl.classList.contains("badge-card")) {
                targetEl.classList.add("ring-4", "ring-primary/60", "shadow-2xl", "scale-[1.04]", "transition-all", "duration-500");
                setTimeout(() => {
                    targetEl.classList.remove("ring-4", "ring-primary/60", "shadow-2xl", "scale-[1.04]");
                }, 3000);
            }
        }
    }

    if (window.location.hash.includes("badge")) {
        setTimeout(scrollToBadgeTarget, 200);
        setTimeout(scrollToBadgeTarget, 600); // Secondary fallback after dynamic badges load
    }

    // 🚀 2. Parallel background sync for live fresh data
    Promise.allSettled([
        loadNavbar(),
        loadFooter(),
        initChatbot(),
        loadUserProfile(),
        renderRoadmapSection(),
        syncBadgesAndContribution(),
        syncHostedEventsCount(),
        renderParticipatedEventsPanel(),
        renderAIProfile()
    ]);
});

async function loadNavbar() {
    await loadSharedNavbar();
    initBasicScroll();
}

async function loadFooter() {
    const html = await fetchContent("./components/footer.html");
    document.getElementById("footer-container").innerHTML = html;
}

async function loadUserProfile() {
    let user = getUser();
    if (!user) return;

    try {
        const fullUser = await getCurrentUser();
        if (fullUser && fullUser.user) {
            user = fullUser.user;
            setUser(user);
        }
    } catch {} // fallback to localStorage

    currentUser = user;
    if (hasUserCompletedQuiz(user)) {
        awardSelfDiscoveryBadgeIfNeeded(user);
    }

    document.getElementById("profile-name").textContent = user.username || user.fullname;
    document.getElementById("profile-email").textContent = user.email || "-";
    document.getElementById("profile-phone").textContent = user.phoneNo || "-";
    document.getElementById("profile-username").textContent = user.fullname || "-";

    if (user.dob) {
        document.getElementById("profile-dob").textContent = formatDate(user.dob, false);
    }

    if (user.school) {
        document.getElementById("profile-school").textContent = user.school;
    }

    const changePassBtn = document.getElementById("change-pass-btn");
    if (changePassBtn) {
        if (user.hasPassword === false) {
            changePassBtn.innerHTML = `<i class="fa-solid fa-key text-[#1755ba]"></i> ${t("profile.create_password", "Create Password")}`;
        } else {
            changePassBtn.innerHTML = `<i class="fa-solid fa-key text-[#1755ba]"></i> ${t("profile.change_password", "Change Password")}`;
        }
    }

    const roleMap = { student: t("user.student"), host: t("user.host"), admin: t("user.admin") };
    document.getElementById("profile-role").textContent = roleMap[user.role] || "Student";

    // Add verification status
    const verificationBadge = document.getElementById("verification-badge");
    if (verificationBadge) {
        if (isStudentVerified(user)) {
            verificationBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${t("profile.verified_student")}`;
            verificationBadge.classList.remove("hidden");
        } else {
            verificationBadge.classList.add("hidden");
        }
    }

    const initial = (user.username || user.fullname || "?").charAt(0).toUpperCase();
    const avatarImg = document.getElementById("avatar-image");
    const avatarInitial = document.getElementById("avatar-initial");
    if (user.avatar && avatarImg) {
        avatarImg.src = user.avatar;
        avatarImg.style.display = "";
        if (avatarInitial) avatarInitial.style.display = "none";
    } else {
        if (avatarImg) avatarImg.style.display = "none";
        if (avatarInitial) {
            avatarInitial.textContent = initial;
            avatarInitial.style.display = "";
        }
    }

    updateEditButton(user);

    const avatarInput = document.getElementById("avatarUploadInput");
    if (avatarInput) {
        avatarInput.addEventListener("change", async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            openCropModal(file, async (croppedBlob) => {
                try {
                    const result = await uploadAvatar(croppedBlob);
                    if (result?.avatar) {
                        user.avatar = result.avatar;
                        setUser(user);
                        if (avatarImg) {
                            avatarImg.src = result.avatar;
                            avatarImg.style.display = "";
                            if (avatarInitial) avatarInitial.style.display = "none";
                        }
                        window.dispatchEvent(new CustomEvent("avatar-updated", { detail: { avatar: result.avatar } }));
                    }
                } catch (err) {
                    console.error("Avatar upload failed:", err);
                    alert(t("profile.failed_upload"));
                }
            });
        });
    }
}

function updateEditButton(user) {
    const btn = document.getElementById("edit-profile-btn");
    if (!btn) return;

    const isComplete = user.dob && user.school && user.class && user.major && user.phoneNo;
    if (isComplete) {
        btn.innerHTML = `<i class="fa-regular fa-pen-to-square"></i> ${t("profile.edit_profile")}`;
        btn.classList.remove("complete");
    } else {
        btn.innerHTML = `<i class="fa-regular fa-circle-check"></i> ${t("profile.complete_profile")}`;
        btn.classList.add("complete");
    }
}

async function renderRoadmapSection() {
    const list = document.getElementById("roadmap-list");
    if (!list) return;

    // Render Skeleton Loader while fetching
    list.innerHTML = `
        <div class="space-y-2 animate-pulse">
            <div class="h-14 bg-gray-100 rounded-xl"></div>
            <div class="h-14 bg-gray-100 rounded-xl"></div>
        </div>
    `;

    try {
        const res = await getMyRoadmaps();
        const roadmaps = res.roadmaps || [];
        if (roadmaps.length === 0) {
            list.innerHTML = `
                <div class="text-center py-6 text-gray-400">
                    <span class="material-symbols-outlined text-3xl mb-2">map</span>
                    <p class="text-sm" data-i18n="profile.no_roadmaps">${t("profile.no_roadmaps")}</p>
                </div>
            `;
            return;
        }

        list.innerHTML = roadmaps.map(r => {
            const statusClass = r.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
            const statusText = r.status === 'confirmed' ? t('roadmap.confirmed') : t('roadmap.draft');
            const startDate = r.input?.timeframe?.startDate ? formatDate(r.input.timeframe.startDate) : '';
            const endDate = r.input?.timeframe?.endDate ? formatDate(r.input.timeframe.endDate) : '';
            const dates = startDate && endDate ? `${startDate} - ${endDate}` : formatDate(r.createdAt);
            
            return `
                <a href="/roadmap.html?id=${r._id}" class="block bg-gray-50 hover:bg-gray-100 p-3.5 rounded-xl transition-colors border border-gray-100">
                    <div class="flex justify-between items-start mb-1.5">
                        <h3 class="font-bold text-sm text-gray-800 line-clamp-1 flex-1 mr-2">${r.input?.goal || 'Roadmap'}</h3>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${statusClass}">${statusText}</span>
                    </div>
                    <div class="text-xs text-gray-500 flex items-center gap-1.5">
                        <i class="fa-regular fa-calendar"></i> <span>${dates}</span>
                    </div>
                </a>
            `;
        }).join('');
    } catch (err) {
        console.warn("Failed to fetch roadmaps:", err);
        list.innerHTML = `
            <div class="text-center py-4 text-gray-400 text-sm">
                <span>${t("profile.no_roadmaps")}</span>
            </div>
        `;
    }
}

/* =========================
   POPUP
========================= */


/* =========================
   FAVOURITES POPUP
   ========================= */

async function showFavPopup() {
    try {
        const { activities } = await getFavourites();
        const items = (activities || []).map(a => {
            const held = formatDate(a.heldDate);
            return `<div class="fav-item" data-id="${a.activityID}">
                <div class="fav-thumb">${a.thumbnail ? `<img src="${escapeAttr(a.thumbnail)}" alt="${escapeAttr(a.title)}">` : '<div class="fav-thumb-placeholder"><i class="fa-regular fa-image"></i></div>'}</div>
                <div class="fav-body"><div class="fav-title">${escapeHtml(a.title)}</div><div class="fav-location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(a.location)}</div><div class="fav-date">${escapeHtml(held)}</div></div>
            </div>`;
        }).join("");

        popupContainer.innerHTML = `
            <div class="container">
                <div class="top-bar">
                    <button class="back-btn" id="back-btn"><i class="fa-solid fa-arrow-left"></i> ${t("profile.back")}</button>
                    <h2 class="fav-popup-title">${t("profile.favourite_activities")}</h2>
                </div>
                <div class="fav-list">${items || `<p class="fav-empty">${t("profile.no_favourites")}</p>`}</div>
            </div>`;

        popupOverlay.removeAttribute("hidden");
        popupOverlay.classList.add("active");
        document.getElementById("back-btn").addEventListener("click", closePopup);

        popupContainer.querySelectorAll(".fav-item").forEach(el => {
            el.addEventListener("click", () => {
                const actData = activities.find(a => String(a.activityID || a._id) === el.dataset.id);
                openEventPopup(el.dataset.id, { activityData: actData });
            });
        });
    } catch {}
}

/* =========================
   EDIT PROFILE
========================= */

function initEditProfile() {
    const editBtn = document.getElementById("edit-profile-btn");
    const modal = document.getElementById("edit-modal");
    const closeBtn = document.getElementById("edit-modal-close");
    const cancelBtn = document.getElementById("edit-btn-cancel");
    const form = document.getElementById("edit-form");
    const backdrop = modal?.querySelector(".edit-modal-backdrop");

    if (!editBtn || !modal) return;

    editBtn.addEventListener("click", () => openEditModal());
    closeBtn?.addEventListener("click", closeEditModal);
    cancelBtn?.addEventListener("click", closeEditModal);
    backdrop?.addEventListener("click", closeEditModal);
    form?.addEventListener("submit", handleEditSubmit);
}

function openEditModal() {
    const user = currentUser || getUser();
    if (!user) return;

    const emailDisplay = document.getElementById("edit-email-display");
    if (emailDisplay) emailDisplay.value = user.email || "";

    document.getElementById("edit-fullname").value = user.fullname || "";
    document.getElementById("edit-dob").value = user.dob ? user.dob.split("T")[0] : "";
    document.getElementById("edit-phone").value = user.phoneNo || "";
    const schoolInput = document.getElementById("edit-school");
    if (schoolInput) {
        populateUniversitySelect(schoolInput, user.school || "");
        if (user.schoolLocked) {
            schoolInput.disabled = true;
            schoolInput.classList.add("opacity-70", "cursor-not-allowed");
            schoolInput.title = "Trường học đã được xác thực qua email và không thể thay đổi.";
        } else {
            schoolInput.disabled = false;
            schoolInput.classList.remove("opacity-70", "cursor-not-allowed");
            schoolInput.title = "";
        }
    }
    document.getElementById("edit-class").value = user.class || "";
    document.getElementById("edit-major").value = user.major || "";

    const modal = document.getElementById("edit-modal");
    modal.style.display = "flex";
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeEditModal() {
    const modal = document.getElementById("edit-modal");
    modal.classList.remove("active");
    modal.style.display = "none";
    document.body.style.overflow = "";
    const status = document.querySelector(".edit-form-status");
    if (status) status.remove();
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const user = currentUser || getUser();
    if (!user) return;

    const statusEl = document.createElement("div");
    statusEl.className = "edit-form-status";
    const existing = document.querySelector(".edit-form-status");
    if (existing) existing.remove();

    const data = {
        username: user.username,
        fullname: document.getElementById("edit-fullname").value.trim(),
        dob: document.getElementById("edit-dob").value,
        phoneNo: document.getElementById("edit-phone").value.trim(),
        school: document.getElementById("edit-school").value.trim(),
        className: document.getElementById("edit-class").value.trim(),
        major: document.getElementById("edit-major").value.trim()
    };

    if (!data.fullname || !data.dob || !data.school || !data.className || !data.major) {
        statusEl.className = "edit-form-status error";
        statusEl.textContent = t("profile.fill_required");
        document.getElementById("edit-form").appendChild(statusEl);
        return;
    }

    statusEl.className = "edit-form-status";
    statusEl.textContent = t("profile.saving");
    document.getElementById("edit-form").appendChild(statusEl);

    try {
        const result = await changeInfo(data);
        currentUser = result.user;
        setUser(result.user);
        await loadUserProfile();
        await renderAIProfile();
        statusEl.className = "edit-form-status success";
        statusEl.textContent = t("profile.profile_updated");
        setTimeout(closeEditModal, 1200);
    } catch (err) {
        statusEl.className = "edit-form-status error";
        statusEl.textContent = err.message || t("profile.failed_update");
    }
}

/* =========================
   AVATAR CROP MODAL
   ========================= */

function openCropModal(file, onSave) {
    const modal = document.getElementById("cropModal");
    const img = document.getElementById("cropImage");
    const closeBtn = document.getElementById("cropModalClose");
    const cancelBtn = document.getElementById("cropBtnCancel");
    const saveBtn = document.getElementById("cropBtnSave");
    if (!modal || !img) return;

    if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        img.src = e.target.result;
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";

        img.onload = () => {
            cropperInstance = new Cropper(img, {
                aspectRatio: 1,
                viewMode: 1,
                dragMode: "move",
                cropBoxResizable: true,
                cropBoxMovable: true,
                background: false,
                minCropBoxWidth: 100,
                minCropBoxHeight: 100,
            });
        };
    };
    reader.readAsDataURL(file);

    function closeCropModal() {
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }
        modal.style.display = "none";
        document.body.style.overflow = "";
        img.src = "";
    }

    closeBtn?.addEventListener("click", closeCropModal);
    cancelBtn?.addEventListener("click", closeCropModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeCropModal();
    });

    saveBtn?.addEventListener("click", () => {
        if (!cropperInstance) return;
        const canvas = cropperInstance.getCroppedCanvas({ width: 512, height: 512 });
        canvas.toBlob((blob) => {
            const croppedFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });
            closeCropModal();
            if (onSave) onSave(croppedFile);
        }, "image/jpeg", 0.92);
    });
}

async function renderAIProfile() {
  const card = document.getElementById("ai-profile-card");
  const container = document.getElementById("ai-profile-content");
  if (!card || !container) return;

  const studentUser = currentUser || getUser();
  const verified = isStudentVerified(studentUser);

  card.style.display = "block";

  if (!verified) {
    card.querySelector("h2").innerHTML = `
      <span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;color:#8B5CF6">auto_awesome</span>
      <span data-i18n="profile.ai_profile">${t("profile.ai_profile")}</span>
    `;
    container.innerHTML = `
      <div class="py-4 text-center">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 mb-3">
          <span class="material-symbols-outlined !text-[24px]">verified_user</span>
        </div>
        <p class="text-sm text-text-secondary mb-4 leading-relaxed max-w-sm mx-auto" data-i18n="profile.ai_verify_required_desc">${t("profile.ai_verify_required_desc")}</p>
        <a href="/student-verify.html" class="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-sm active:scale-95 transition-all spring-ease">
          <span class="material-symbols-outlined !text-[18px]">verified</span>
          <span data-i18n="profile.verify_student_btn">${t("profile.verify_student_btn")}</span>
        </a>
      </div>
    `;
    return;
  }

  try {
    const activeLang = getLang();
    const data = await getMyProfile(activeLang);

    // Check if the user has actually generated an AI profile
    const hasProfile = !!(
      data?.profile && (
        data.profile.archetypeTitle ||
        data.profile.personaKey ||
        data.profile.profileText ||
        (Array.isArray(data.profile.skills) && data.profile.skills.length > 0)
      )
    );

    if (!hasProfile) {
      card.style.display = "block";
      card.querySelector("h2").innerHTML = `
        <span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;color:#8B5CF6">auto_awesome</span>
        <span data-i18n="profile.ai_profile">${t("profile.ai_profile")}</span>
      `;
      container.innerHTML = `
        <div class="py-4 text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#8B5CF6]/10 text-[#8B5CF6] mb-3">
            <span class="material-symbols-outlined !text-[24px]">auto_awesome</span>
          </div>
          <p class="text-sm text-text-secondary mb-4 leading-relaxed max-w-sm mx-auto" data-i18n="profile.no_ai_profile_desc">${t("profile.no_ai_profile_desc")}</p>
          <a href="/quiz.html" class="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl bg-[#23499b] hover:bg-[#1b3877] text-white text-sm font-semibold shadow-sm active:scale-95 transition-all spring-ease">
            <span class="material-symbols-outlined !text-[18px]">psychology</span>
            <span data-i18n="profile.take_ai_quiz">${t("profile.take_ai_quiz")}</span>
          </a>
        </div>
      `;
      return;
    }

    window._hasActiveAIProfile = true;
    try {
      localStorage.setItem("springwave_quiz_completed", "true");
    } catch {}
    if (currentUser) {
      currentUser.profile = data.profile;
      setUser(currentUser);
    }
    awardSelfDiscoveryBadgeIfNeeded(currentUser);

    const p = data.profile;
    const currentLang = getLang();
    const localized = p.translations?.[currentLang] || p;
    const displayMajor = studentUser?.major || data.user?.major || localized.major || p.major;
    
    // Add Retake button to the header
    card.querySelector("h2").innerHTML = `
      <div class="w-full flex items-center justify-between">
        <span class="flex items-center gap-2">
          <span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;color:#8B5CF6">auto_awesome</span>
          <span data-i18n="profile.ai_profile">${t("profile.ai_profile")}</span>
        </span>
        <a href="/quiz.html" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#8B5CF6]/10 text-[#8B5CF6] hover:bg-[#8B5CF6]/20 text-xs font-semibold active:scale-95 transition-all spring-ease">
          <span class="material-symbols-outlined !text-[14px]">replay</span>
          <span data-i18n="profile.retake_quiz">${t("profile.retake_quiz")}</span>
        </a>
      </div>
    `;

    const personaKey = localized.personaKey || p.personaKey || localStorage.getItem("springwave_persona_key");
    if (personaKey && !localStorage.getItem("springwave_persona_key")) {
      localStorage.setItem("springwave_persona_key", personaKey);
    }
    const rawPersonaTitle = personaKey ? t(`quiz.personas.${personaKey}.title`) : null;
    const fallbackTitle = (rawPersonaTitle && rawPersonaTitle !== `quiz.personas.${personaKey}.title`) ? rawPersonaTitle : personaKey;
    const displayTitle = localized.archetypeTitle || fallbackTitle;
    const personaBadge = displayTitle ? `
      <div class="mb-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 text-[#8B5CF6] text-xs font-semibold">
        <span class="material-symbols-outlined !text-[14px]">auto_awesome</span>
        <span>${escapeHtml(displayTitle)}</span>
      </div>
    ` : '';
    const taglineHtml = localized.tagline ? `
      <p class="text-xs text-slate-500 font-medium italic mb-4">"${escapeHtml(localized.tagline)}"</p>
    ` : '';

    const displaySkills = localized.skills || p.skills || [];
    const displayActivities = localized.preferredActivities || p.preferredActivities || [];
    const displayNarrative = localized.profileText || p.profileText;
    const displayGoal = localized.goal || p.goal;
    const displayDesc = localized.description || p.description;

    container.innerHTML = `
      ${personaBadge}
      ${taglineHtml}
      <div class="ai-profile-section">
        ${displayMajor ? `<div class="ai-profile-field"><span class="ai-profile-label" data-i18n="profile.ai_major">${t("profile.ai_major", "Major")}</span><span class="ai-profile-value">${escapeHtml(displayMajor)}</span></div>` : ''}
        ${displayGoal ? `<div class="ai-profile-field"><span class="ai-profile-label" data-i18n="profile.ai_goal">${t("profile.ai_goal", "Goal")}</span><span class="ai-profile-value">${escapeHtml(displayGoal)}</span></div>` : ''}
        ${displaySkills?.length ? `
          <div class="ai-profile-field">
            <span class="ai-profile-label" data-i18n="profile.ai_skills">${t("profile.ai_skills", "Skills")}</span>
            <div class="ai-profile-tags">${displaySkills.map(s => `<span class="ai-profile-tag">${escapeHtml(s)}</span>`).join('')}</div>
          </div>
        ` : ''}
        ${displayActivities?.length ? `
          <div class="ai-profile-field">
            <span class="ai-profile-label" data-i18n="profile.ai_preferred_activities">${t("profile.ai_preferred_activities", "Preferred Activities")}</span>
            <div class="ai-profile-tags">${displayActivities.map(a => `<span class="ai-profile-tag">${escapeHtml(a)}</span>`).join('')}</div>
          </div>
        ` : ''}
        ${displayNarrative ? `
          <div class="ai-profile-field">
            <span class="ai-profile-label" data-i18n="profile.ai_narrative">${t("profile.ai_narrative", "Bản sắc cá nhân")}</span>
            <p class="ai-profile-desc leading-relaxed">${escapeHtml(displayNarrative)}</p>
          </div>
        ` : (displayDesc ? `
          <div class="ai-profile-field">
            <span class="ai-profile-label" data-i18n="profile.ai_about">${t("profile.ai_about", "About")}</span>
            <p class="ai-profile-desc">${escapeHtml(displayDesc)}</p>
          </div>
        ` : '')}
      </div>
    `;
  } catch (error) {
    console.error("Failed to load AI profile:", error);
    if (verified) {
      card.style.display = "block";
      card.querySelector("h2").innerHTML = `
        <span class="material-symbols-outlined" style="font-size:20px;vertical-align:middle;color:#8B5CF6">auto_awesome</span>
        <span data-i18n="profile.ai_profile">${t("profile.ai_profile")}</span>
      `;
      container.innerHTML = `
        <div class="py-4 text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#8B5CF6]/10 text-[#8B5CF6] mb-3">
            <span class="material-symbols-outlined !text-[24px]">auto_awesome</span>
          </div>
          <p class="text-sm text-text-secondary mb-4 leading-relaxed max-w-sm mx-auto" data-i18n="profile.no_ai_profile_desc">${t("profile.no_ai_profile_desc")}</p>
          <a href="/quiz.html" class="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl bg-[#23499b] hover:bg-[#1b3877] text-white text-sm font-semibold shadow-sm active:scale-95 transition-all spring-ease">
            <span class="material-symbols-outlined !text-[18px]">psychology</span>
            <span data-i18n="profile.take_ai_quiz">${t("profile.take_ai_quiz")}</span>
          </a>
        </div>
      `;
    } else {
      card.style.display = "none";
    }
  }
}

let myTicketsPromise = null;
function fetchMyTicketsOnce() {
  if (!myTicketsPromise) {
    myTicketsPromise = getMyTickets().catch(() => ({ tickets: [] }));
  }
  return myTicketsPromise;
}

async function syncBadgesAndContribution() {
  const user = currentUser || getUser();
  if (!user) return;
  const userId = user._id || user.id || 'guest';
  const badgeStorageKey = `springwave_badges_${userId}`;
  const contribStorageKey = `springwave_contrib_${userId}`;
  const countsStorageKey = `springwave_counts_${userId}`;

  let cachedCounts = { favoritesCount: 0, participationsCount: 0, hostedEventsCount: 0 };
  try {
    const saved = localStorage.getItem(countsStorageKey);
    if (saved) cachedCounts = { ...cachedCounts, ...JSON.parse(saved) };
  } catch {}

  try {
    const [contribResult, favsResult, ticketsResult] = await Promise.allSettled([
      getUserContribution(),
      getFavourites(),
      fetchMyTicketsOnce()
    ]);

    let data = { contribution: { score: 0, discussionsStarted: 0, repliesGiven: 0, likesReceived: 0, likesGiven: 0, badges: [] } };
    if (contribResult.status === "fulfilled" && contribResult.value) {
      data = contribResult.value;
    }

    let favoritesCount = cachedCounts.favoritesCount || 0;
    if (favsResult.status === "fulfilled" && favsResult.value?.activities) {
      favoritesCount = favsResult.value.activities.length;
    }

    let participationsCount = cachedCounts.participationsCount || 0;
    if (ticketsResult.status === "fulfilled" && ticketsResult.value?.tickets) {
      const tickets = ticketsResult.value.tickets || [];
      const checkedInTickets = tickets.filter(t => t.ticketStatus === 'checked_in' && t.event && t.event.organization);
      participationsCount = checkedInTickets.length;
    }

    const c = data.contribution || {};
    const serverBadges = c.badges || [];
    const localBadges = computeLocalBadges(user, c, favoritesCount, participationsCount);
    const mergedBadges = [...new Set([...serverBadges, ...localBadges])];
    const earnedKeys = new Set(mergedBadges);

    // Save to localStorage for instant 0ms loads on future visits
    localStorage.setItem(badgeStorageKey, JSON.stringify(mergedBadges));
    localStorage.setItem(contribStorageKey, JSON.stringify(c));

    cachedCounts.favoritesCount = favoritesCount;
    cachedCounts.participationsCount = participationsCount;
    localStorage.setItem(countsStorageKey, JSON.stringify(cachedCounts));

    // Update Contribute Score UI
    const { level, current, next, progress } = calcContribLevel(c.score || 0);
    const pct = Math.round(progress * 100);
    const nextLabel = next !== null ? `${current} / ${next} pts` : `${c.score || 0} pts (Max)`;

    const scoreVal = document.getElementById("contribute-score-val");
    const levelEl = document.getElementById("contribute-level");
    const progressBar = document.getElementById("contribute-progress-bar");
    const scoreTarget = document.getElementById("contribute-score-target");
    const statDiscussions = document.getElementById("stat-discussions");
    const statEvents = document.getElementById("stat-events");
    const statCertificates = document.getElementById("stat-certificates");

    if (scoreVal) scoreVal.textContent = `${c.score || 0} pts`;
    if (levelEl) levelEl.textContent = `Lv.${level}`;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (scoreTarget) scoreTarget.textContent = nextLabel;
    if (statDiscussions) statDiscussions.textContent = c.discussionsStarted || 0;
    if (statEvents) statEvents.textContent = participationsCount;
    if (statCertificates) statCertificates.textContent = c.certificatesEarned || 0;

    // Render badges panel immediately
    badgeRenderData = { earnedKeys, c, user, favoritesCount, participationsCount };
    renderBadgesPanel(earnedKeys, c, user, favoritesCount, participationsCount);
  } catch (err) {
    console.warn("Failed to sync badges and contribution:", err);
  }
}

async function syncHostedEventsCount() {
  const user = currentUser || getUser();
  if (!user) return;
  const isHost = user.role === "host";
  const isAdmin = user.role === "admin";
  const showHosted = isHost || isAdmin;
  if (!showHosted) return;

  const statHosted = document.getElementById("stat-hosted");
  const statHostedCard = document.getElementById("stat-hosted-card");
  const statsContainer = document.getElementById("stats-grid-container");

  if (statsContainer && statHostedCard) {
    statHostedCard.classList.remove("hidden");
    statsContainer.classList.remove("sm:grid-cols-3");
    statsContainer.classList.add("sm:grid-cols-4");
  }

  const userId = user._id || user.id || 'guest';
  const countsStorageKey = `springwave_counts_${userId}`;

  try {
    const orgData = isAdmin ? await getAllOrganizations() : await getMyOrganizations();
    const orgs = orgData?.organizations || [];

    // Parallel fetching across all organizations
    const actResults = await Promise.allSettled(
      orgs.map(org => getOrgActivities(org._id).catch(() => ({ events: [] })))
    );

    let hostedEventsCount = 0;
    for (const res of actResults) {
      if (res.status === "fulfilled" && res.value) {
        const events = res.value.events || [];
        hostedEventsCount += events.length;
      }
    }

    if (statHosted) statHosted.textContent = hostedEventsCount;

    // Cache updated hostedEventsCount
    try {
      let cachedCounts = { favoritesCount: 0, participationsCount: 0, hostedEventsCount: 0 };
      const saved = localStorage.getItem(countsStorageKey);
      if (saved) cachedCounts = { ...cachedCounts, ...JSON.parse(saved) };
      cachedCounts.hostedEventsCount = hostedEventsCount;
      localStorage.setItem(countsStorageKey, JSON.stringify(cachedCounts));
    } catch {}
  } catch (err) {
    console.warn("Failed to sync hosted events count:", err);
  }
}

async function renderParticipatedEventsPanel() {
  const container = document.getElementById("participated-list");
  if (!container) return;

  let globalCheckedInTickets = [];

  try {
    const ticketsResult = await fetchMyTicketsOnce();
    const tickets = ticketsResult?.tickets || [];
    globalCheckedInTickets = tickets.filter(t => t.ticketStatus === 'checked_in' && t.event && t.event.organization);

    window.changeParticipatedPage = (page) => {
      renderParticipatedPage(page);
    };

    function renderParticipatedPage(page) {
      if (globalCheckedInTickets.length === 0) {
        container.innerHTML = `<p class="text-sm text-text-secondary italic">${t("profile.no_participated_events") || "You haven't participated in any events yet."}</p>`;
        return;
      }

      const EVENTS_PER_PAGE = 5;
      const startIndex = (page - 1) * EVENTS_PER_PAGE;
      const paginatedTickets = globalCheckedInTickets.slice(startIndex, startIndex + EVENTS_PER_PAGE);

      const orgs = {};
      paginatedTickets.forEach(t => {
        let orgObj = t.event.organization;
        if (typeof orgObj === 'string') {
          orgObj = { _id: orgObj, name: 'Unknown Organization' };
        }
        const orgId = orgObj._id || orgObj;
        if (!orgs[orgId]) {
          orgs[orgId] = {
            name: orgObj.name || 'Unknown Organization',
            avatar: orgObj.avatar || '',
            events: []
          };
        }
        t.event.review = t.review;
        orgs[orgId].events.push(t.event);
      });

      let html = '';
      for (const orgId in orgs) {
        const org = orgs[orgId];
        html += `
          <div class="org-group mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div class="flex items-center gap-3 mb-3 border-b pb-2">
              ${org.avatar ? `<img src="${org.avatar}" class="w-8 h-8 rounded-full object-cover">` : `<div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">${(org.name || '?').charAt(0)}</div>`}
              <h3 class="font-bold text-gray-800 text-sm">${org.name || 'Unknown Organization'}</h3>
            </div>
            <div class="space-y-3">
              ${org.events.map(e => {
                  let starsHtml = '';
                  if (e.review && e.review.rating) {
                      starsHtml = `
                      <div class="flex text-yellow-400 text-[10px] ml-2">
                          ${Array.from({length: 5}, (_, i) => `<i class="fa-solid fa-star ${i < e.review.rating ? '' : 'text-gray-200'}"></i>`).join('')}
                      </div>
                      `;
                  }
                  return `
                <div class="flex items-start gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors" data-id="${e._id}" data-title="${e.title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}" data-thumb="${e.thumbnail || ''}" data-org="${org.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">
                  ${e.thumbnail ? `<img src="${e.thumbnail}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0">` : `<div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400"><i class="fa-solid fa-image"></i></div>`}
                  <div class="flex-1">
                    <div class="flex items-center justify-between">
                      <h4 class="font-semibold text-gray-800 text-sm line-clamp-1">${e.title}</h4>
                      ${starsHtml}
                    </div>
                    <div class="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span><i class="fa-regular fa-calendar mr-1"></i>${formatDate(e.heldDate)}</span>
                    </div>
                  </div>
                </div>
              `}).join('')}
            </div>
          </div>
        `;
      }

      const totalPages = Math.ceil(globalCheckedInTickets.length / EVENTS_PER_PAGE);
      if (totalPages > 1) {
        html += `
          <div class="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
            <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${page === 1 ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-primary bg-primary/10 hover:bg-primary/20'}" ${page === 1 ? 'disabled' : ''} data-action="participated-page" data-page="${page - 1}">
              <i class="fa-solid fa-chevron-left mr-1"></i> Prev
            </button>
            <span class="text-sm font-medium text-gray-500">Page ${page} of ${totalPages}</span>
            <button type="button" class="px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${page === totalPages ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-primary bg-primary/10 hover:bg-primary/20'}" ${page === totalPages ? 'disabled' : ''} data-action="participated-page" data-page="${page + 1}">
              Next <i class="fa-solid fa-chevron-right ml-1"></i>
            </button>
          </div>
        `;
      }

      container.innerHTML = html;
    }

    // Click delegation for the participated events panel
    container.addEventListener("click", (e) => {
      const reviewRow = e.target.closest("[data-id][data-title]");
      if (reviewRow) {
        const { id, title, thumb, org } = reviewRow.dataset;
        openReviewModal(id, title, thumb, org);
        return;
      }
      const pageBtn = e.target.closest("[data-action='participated-page']");
      if (pageBtn && !pageBtn.disabled) {
        const page = parseInt(pageBtn.dataset.page, 10);
        if (page >= 1) renderParticipatedPage(page);
      }
    });

    renderParticipatedPage(1);
  } catch (err) {
    console.error("CRITICAL ERROR in renderParticipatedEventsPanel:", err);
    container.innerHTML = `<p class="text-sm text-text-secondary italic">${t("profile.no_participated_events") || "You haven't participated in any events yet."}</p>`;
  }
}

function getBadgeDetails(b) {
  // Category mapping
  let categoryKey = "community";
  const key = b.key;
  if (key === "hello_world" || key === "talk_is_silver" || key === "so_it_begins") {
    categoryKey = "welcome";
  } else if (key === "self_discovery") {
    categoryKey = "profile";
  } else if (key === "active_explorer" || key === "event_goer" || key === "rising_host" || key === "grand_host") {
    categoryKey = "events";
  } else if (key === "community_star" || key === "mentor" || key === "the_sage") {
    categoryKey = "milestone";
  } else if (key === "certified_novice" || key === "certified_expert" || key === "certified_master") {
    categoryKey = "knowledge";
  }

  // Rarity mapping
  let rarityKey = "common";
  if (b.tier === "explorer") {
    rarityKey = "uncommon";
  } else if (b.tier === "contributor") {
    rarityKey = "rare";
  } else if (b.tier === "legendary") {
    rarityKey = "legendary";
  }

  return { categoryKey, rarityKey };
}

function renderBadgesPanel(earnedKeys, c, user, favoritesCount, participationsCount) {
  const grid = document.getElementById("badges-grid");
  if (!grid) return;

  const TIERS_CONFIG = [
    {
      key: "newbie",
      tierNum: "Tier 1",
      title: "Newbie (Common)",
      desc: "Introductory onboarding milestones — Easiest to achieve",
      icon: "waving_hand",
      colorClass: "text-blue-700 bg-blue-50/70 border-blue-100",
      accentBg: "bg-blue-600"
    },
    {
      key: "explorer",
      tierNum: "Tier 2",
      title: "Activity Explorer (Uncommon)",
      desc: "Early discovery through activities, favorites, and certificates",
      icon: "explore",
      colorClass: "text-emerald-700 bg-emerald-50/70 border-emerald-100",
      accentBg: "bg-emerald-600"
    },
    {
      key: "contributor",
      tierNum: "Tier 3",
      title: "Community Contributor (Rare)",
      desc: "Active forum engagement, helpful replies, and event hosting",
      icon: "forum",
      colorClass: "text-purple-700 bg-purple-50/70 border-purple-100",
      accentBg: "bg-purple-600"
    },
    {
      key: "legendary",
      tierNum: "Tier 4",
      title: "Legendary (Epic / Master)",
      desc: "Ultimate long-term platform achievements — Hardest to achieve",
      icon: "stars",
      colorClass: "text-amber-700 bg-amber-50/70 border-amber-100",
      accentBg: "bg-amber-500"
    }
  ];

  grid.innerHTML = TIERS_CONFIG.map(tier => {
    const tierBadges = ALL_BADGES.filter(b => b.tier === tier.key);
    const tierEarnedCount = tierBadges.filter(b => earnedKeys.has(b.key)).length;

    const cardsHtml = tierBadges.map(b => {
      const earned = earnedKeys.has(b.key);
      const progress = getBadgeProgress(b.key, c, user, favoritesCount, participationsCount);
      const { categoryKey, rarityKey } = getBadgeDetails(b);

      const statusProgress = t("badges.status.progress", "Progress");
      let progressHtml = "";
      if (!earned && progress) {
        const pct = Math.min(100, Math.round((progress.current / progress.target) * 100));
        progressHtml = `
          <div class="badge-progress-container">
            <div class="badge-progress-info">
              <span>${statusProgress}</span>
              <span>${progress.current} / ${progress.target}</span>
            </div>
            <div class="badge-progress-bar">
              <div class="badge-progress-fill" style="transform: scaleX(${pct / 100});"></div>
            </div>
          </div>
        `;
      }

      const def = BADGE_DEFINITIONS.find(item => item.key === b.key) || b;
      const label = t(`badges.list.${b.key}.label`, def.label || b.label || b.key);
      const desc = t(`badges.list.${b.key}.desc`, def.desc || b.desc || "");
      const category = t(`badges.categories.${categoryKey}`, def.category || capitalize(categoryKey));
      const rarity = t(`badges.rarity.${rarityKey}`, capitalize(rarityKey));
      const statusEarned = t("badges.status.earned", "Earned");
      const statusLocked = t("badges.status.locked", "Locked");

      const footerHtml = (!earned && progress) 
        ? progressHtml 
        : `<div class="badge-meta">
             <span>${category}</span>
             <span class="badge-meta-dot">●</span>
             <span>${rarity}</span>
           </div>`;

      const statusHtml = `
        <div class="badge-status-group">
          <span class="badge-tier-pill">${rarity}</span>
          <div class="badge-status ${earned ? "earned" : "locked"}">
            <span class="material-symbols-outlined badge-status-icon">${earned ? "check" : "lock"}</span>
            <span>${earned ? statusEarned : statusLocked}</span>
          </div>
        </div>
      `;

      return `
        <div class="badge-card tier-${b.tier} ${earned ? "earned cursor-pointer hover:scale-[1.03] transition-transform" : "locked"}" data-badge-key="${b.key}" data-earned="${earned}">
          <div class="badge-card-top">
            <div class="badge-emblem ${earned ? "earned" : "locked"}">
              <span class="material-symbols-outlined badge-icon">${b.icon}</span>
            </div>
            ${statusHtml}
          </div>
          
          <div class="badge-info">
            <h4 class="badge-label">${label}</h4>
            <p class="badge-desc">${desc}</p>
          </div>
          
          ${footerHtml}
        </div>
      `;
    }).join("");

    return `
      <div class="badge-tier-group mb-8 last:mb-2">
        <div class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3.5 mb-4 rounded-xl border ${tier.colorClass}">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="material-symbols-outlined text-xl shrink-0">${tier.icon}</span>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${tier.accentBg} text-white shrink-0 whitespace-nowrap inline-flex items-center justify-center leading-normal select-none">${tier.tierNum}</span>
                <h3 class="font-bold text-sm text-gray-900">${tier.title}</h3>
              </div>
              <p class="text-xs text-gray-500 mt-0.5">${tier.desc}</p>
            </div>
          </div>
          <span class="text-xs font-bold px-3 py-1 rounded-lg bg-white/90 border border-gray-200/60 text-gray-700 shadow-2xs shrink-0 whitespace-nowrap">
            ${tierEarnedCount} / ${tierBadges.length} ${t("badges.status.earned", "Unlocked")}
          </span>
        </div>
        <div class="badges-all">
          ${cardsHtml}
        </div>
      </div>
    `;
  }).join("");

  // Attach interactive click listener
  grid.querySelectorAll(".badge-card[data-badge-key]").forEach(card => {
    card.addEventListener("click", () => {
      const key = card.dataset.badgeKey;
      const isEarned = card.dataset.earned === "true";
      if (isEarned) {
        triggerBadgeCelebration(key, { isInspect: true });
      }
    });
  });
}

function initChangePasswordModal() {
  const btn = document.getElementById("change-pass-btn");
  const modal = document.getElementById("change-pass-modal");
  const backdrop = document.getElementById("change-pass-backdrop");
  const closeBtn = document.getElementById("change-pass-modal-close");
  const cancelBtn = document.getElementById("change-pass-btn-cancel");
  const form = document.getElementById("change-pass-form");
  const statusEl = document.getElementById("change-pass-status");
  const submitBtn = document.getElementById("change-pass-submit-btn");
  const currPassInput = document.getElementById("change-curr-pass");
  const currPassGroup = document.getElementById("change-curr-pass-group") || currPassInput?.closest(".edit-form-group");

  if (!btn || !modal) return;

  const closeModal = () => {
    modal.classList.remove("active");
    setTimeout(() => {
      modal.style.display = "none";
    }, 300);
    document.body.style.overflow = "";
    if (form) form.reset();
    if (statusEl) statusEl.classList.add("hidden");
    modal.querySelectorAll("input").forEach(input => {
      if (input.id && input.id.startsWith("change-") && input.type === "text") {
        input.type = "password";
      }
    });
    modal.querySelectorAll(".pass-toggle-btn i").forEach(icon => {
      icon.className = "fa-regular fa-eye text-xs";
    });
  };

  const openModal = () => {
    const activeUser = currentUser || getUser();
    const isCreateMode = activeUser?.hasPassword === false;
    modal.style.display = "flex";
    requestAnimationFrame(() => {
      modal.classList.add("active");
    });
    document.body.style.overflow = "hidden";
    if (statusEl) statusEl.classList.add("hidden");

    const iconEl = document.getElementById("change-pass-icon");
    const titleTextEl = document.getElementById("change-pass-title-text");

    if (isCreateMode) {
      if (iconEl) iconEl.textContent = "key";
      if (titleTextEl) titleTextEl.textContent = t("profile.create_pass_title", "Create Password");
      if (currPassGroup) currPassGroup.style.display = "none";
      if (currPassInput) currPassInput.removeAttribute("required");
      if (submitBtn) submitBtn.textContent = t("profile.create_password", "Create Password");
    } else {
      if (iconEl) iconEl.textContent = "lock";
      if (titleTextEl) titleTextEl.textContent = t("profile.change_pass_title", "Change Password");
      if (currPassGroup) currPassGroup.style.display = "";
      if (currPassInput) currPassInput.setAttribute("required", "");
      if (submitBtn) submitBtn.textContent = t("profile.save_password", "Save Password");
    }
  };

  btn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (backdrop) backdrop.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  // Password reveal toggles
  modal.querySelectorAll(".pass-toggle-btn").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const targetId = toggle.dataset.target;
      const targetInput = document.getElementById(targetId);
      const icon = toggle.querySelector("i");
      if (!targetInput || !icon) return;

      if (targetInput.type === "password") {
        targetInput.type = "text";
        icon.className = "fa-regular fa-eye-slash text-xs";
      } else {
        targetInput.type = "password";
        icon.className = "fa-regular fa-eye text-xs";
      }
    });
  });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const activeUser = currentUser || getUser();
      const isCreateMode = activeUser?.hasPassword === false;
      const currPass = isCreateMode ? "" : (currPassInput?.value || "");
      const newPass = document.getElementById("change-new-pass")?.value?.trim();
      const confirmPass = document.getElementById("change-confirm-pass")?.value?.trim();

      if (!isCreateMode && !currPass) {
        if (statusEl) {
          statusEl.textContent = "Vui lòng nhập mật khẩu hiện tại.";
          statusEl.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
        return;
      }

      if (!newPass || !confirmPass) {
        if (statusEl) {
          statusEl.textContent = "Vui lòng nhập đầy đủ mật khẩu mới và xác nhận.";
          statusEl.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
        return;
      }

      if (newPass !== confirmPass) {
        if (statusEl) {
          statusEl.textContent = "Mật khẩu mới và mật khẩu xác nhận không trùng khớp.";
          statusEl.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
        return;
      }

      const passRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
      if (!passRegex.test(newPass)) {
        if (statusEl) {
          statusEl.textContent = "Mật khẩu mới phải có ít nhất 8 ký tự, bao gồm cả chữ cái và chữ số.";
          statusEl.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (statusEl) {
        statusEl.textContent = isCreateMode ? "Đang tạo mật khẩu..." : "Đang xử lý đổi mật khẩu...";
        statusEl.className = "text-xs rounded-xl p-3 bg-blue-50 text-blue-700 block";
      }

      try {
        const res = await changePassword(currPass, newPass, confirmPass);
        const updatedUser = currentUser || getUser();
        if (updatedUser) {
          updatedUser.hasPassword = true;
          setUser(updatedUser);
          currentUser = updatedUser;
          if (btn) btn.innerHTML = `<i class="fa-solid fa-key text-[#1755ba]"></i> ${t("profile.change_password", "Change Password")}`;
        }
        if (statusEl) {
          statusEl.textContent = res.message || (isCreateMode ? "Tạo mật khẩu thành công!" : "Đổi mật khẩu thành công!");
          statusEl.className = "text-xs rounded-xl p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 block";
        }
        setTimeout(() => {
          closeModal();
        }, 1800);
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = err.message || "Thao tác thất bại. Vui lòng thử lại.";
          statusEl.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

function initChangeEmailModal() {
  const openBtn = document.getElementById("open-change-email-btn");
  const modal = document.getElementById("change-email-modal");
  const backdrop = document.getElementById("change-email-backdrop");
  const closeBtn = document.getElementById("change-email-modal-close");
  const cancelBtn = document.getElementById("change-email-btn-cancel");
  const backBtn = document.getElementById("change-email-back-btn");
  const step1Form = document.getElementById("change-email-step1-form");
  const step2Form = document.getElementById("change-email-step2-form");
  const step1Status = document.getElementById("change-email-step1-status");
  const step2Status = document.getElementById("change-email-step2-status");
  const sendOtpBtn = document.getElementById("change-email-send-otp-btn");
  const confirmBtn = document.getElementById("change-email-confirm-btn");
  const resendBtn = document.getElementById("change-email-resend-btn");
  const otpInput = document.getElementById("change-email-otp-input");
  const timerEl = document.getElementById("change-email-timer");
  const targetEmailDisplay = document.getElementById("change-email-target-display");
  const currentEmailInput = document.getElementById("change-email-current");
  const newEmailInput = document.getElementById("change-email-new");
  const passInput = document.getElementById("change-email-pass");
  const passGroup = document.getElementById("change-email-pass-group");

  if (!modal) return;

  let timerInterval = null;
  let countdownSeconds = 600;
  let currentTargetEmail = "";

  const startTimer = () => {
    clearInterval(timerInterval);
    countdownSeconds = 600;
    if (resendBtn) resendBtn.disabled = true;

    const updateDisplay = () => {
      const minutes = Math.floor(countdownSeconds / 60);
      const seconds = countdownSeconds % 60;
      if (timerEl) {
        timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      if (countdownSeconds <= 0) {
        clearInterval(timerInterval);
        if (resendBtn) resendBtn.disabled = false;
        if (timerEl) timerEl.textContent = "00:00 (Hết hạn)";
      }
      countdownSeconds--;
    };

    updateDisplay();
    timerInterval = setInterval(updateDisplay, 1000);
  };

  const closeModal = () => {
    clearInterval(timerInterval);
    modal.classList.remove("active");
    setTimeout(() => {
      modal.style.display = "none";
      if (step1Form) { step1Form.reset(); step1Form.style.display = "block"; }
      if (step2Form) { step2Form.reset(); step2Form.style.display = "none"; }
      if (step1Status) step1Status.classList.add("hidden");
      if (step2Status) step2Status.classList.add("hidden");
    }, 300);
    document.body.style.overflow = "";
  };

  const openModal = () => {
    const user = currentUser || getUser();
    if (!user) return;

    if (currentEmailInput) currentEmailInput.value = user.email || "";
    if (newEmailInput) newEmailInput.value = "";
    if (passInput) passInput.value = "";

    const isNoPassword = user.hasPassword === false;
    if (passGroup) passGroup.style.display = isNoPassword ? "none" : "";
    if (passInput) {
      if (isNoPassword) passInput.removeAttribute("required");
      else passInput.setAttribute("required", "");
    }

    if (step1Form) step1Form.style.display = "block";
    if (step2Form) step2Form.style.display = "none";
    if (step1Status) step1Status.classList.add("hidden");
    if (step2Status) step2Status.classList.add("hidden");

    modal.style.display = "flex";
    requestAnimationFrame(() => modal.classList.add("active"));
    document.body.style.overflow = "hidden";
  };

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (backdrop) backdrop.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      clearInterval(timerInterval);
      if (step2Form) step2Form.style.display = "none";
      if (step1Form) step1Form.style.display = "block";
      if (step2Status) step2Status.classList.add("hidden");
    });
  }

  modal.querySelectorAll(".pass-toggle-btn").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const targetId = toggle.dataset.target;
      const targetInput = document.getElementById(targetId);
      const icon = toggle.querySelector("i");
      if (!targetInput || !icon) return;

      if (targetInput.type === "password") {
        targetInput.type = "text";
        icon.className = "fa-regular fa-eye-slash text-xs";
      } else {
        targetInput.type = "password";
        icon.className = "fa-regular fa-eye text-xs";
      }
    });
  });

  if (step1Form) {
    step1Form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const user = currentUser || getUser();
      const newEmail = newEmailInput?.value?.trim();
      const isNoPassword = user?.hasPassword === false;
      const password = isNoPassword ? "" : (passInput?.value || "");

      if (!newEmail) {
        if (step1Status) {
          step1Status.textContent = t("profile.enter_new_email") || "Vui lòng nhập địa chỉ email mới.";
          step1Status.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
        return;
      }

      if (user?.email && user.email.toLowerCase() === newEmail.toLowerCase()) {
        if (step1Status) {
          step1Status.textContent = t("profile.email_same_current") || "Email mới trùng với email hiện tại của bạn.";
          step1Status.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
        return;
      }

      if (sendOtpBtn) sendOtpBtn.disabled = true;
      if (step1Status) {
        step1Status.textContent = t("profile.sending_otp") || "Đang gửi mã OTP xác thực...";
        step1Status.className = "text-xs rounded-xl p-3 bg-blue-50 text-blue-700 block";
      }

      try {
        await requestEmailChange({ newEmail, password });
        currentTargetEmail = newEmail;
        if (targetEmailDisplay) targetEmailDisplay.textContent = newEmail;

        step1Form.style.display = "none";
        step2Form.style.display = "block";
        if (step2Status) step2Status.classList.add("hidden");
        if (otpInput) {
          otpInput.value = "";
          setTimeout(() => otpInput.focus(), 200);
        }
        startTimer();
      } catch (err) {
        if (step1Status) {
          step1Status.textContent = err.message || "Gửi mã OTP thất bại. Vui lòng thử lại.";
          step1Status.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
      } finally {
        if (sendOtpBtn) sendOtpBtn.disabled = false;
      }
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      const user = currentUser || getUser();
      const isNoPassword = user?.hasPassword === false;
      const password = isNoPassword ? "" : (passInput?.value || "");

      resendBtn.disabled = true;
      if (step2Status) {
        step2Status.textContent = t("profile.resending_otp") || "Đang gửi lại mã xác thực...";
        step2Status.className = "text-xs rounded-xl p-3 bg-blue-50 text-blue-700 block";
      }

      try {
        await requestEmailChange({ newEmail: currentTargetEmail, password });
        if (step2Status) {
          step2Status.textContent = t("profile.otp_resent_success") || "Mã xác thực mới đã được gửi lại thành công!";
          step2Status.className = "text-xs rounded-xl p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 block";
        }
        startTimer();
      } catch (err) {
        resendBtn.disabled = false;
        if (step2Status) {
          step2Status.textContent = err.message || "Gửi lại mã thất bại.";
          step2Status.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
      }
    });
  }

  if (step2Form) {
    step2Form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const otp = otpInput?.value?.trim();

      if (!otp || otp.length !== 6) {
        if (step2Status) {
          step2Status.textContent = t("profile.enter_full_otp") || "Vui lòng nhập đủ 6 chữ số mã OTP.";
          step2Status.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
        return;
      }

      if (confirmBtn) confirmBtn.disabled = true;
      if (step2Status) {
        step2Status.textContent = t("profile.verifying_otp") || "Đang xác thực mã OTP...";
        step2Status.className = "text-xs rounded-xl p-3 bg-blue-50 text-blue-700 block";
      }

      try {
        const result = await confirmEmailChange({ otp });
        currentUser = result.user;
        setUser(result.user);

        const editEmailDisplay = document.getElementById("edit-email-display");
        if (editEmailDisplay) editEmailDisplay.value = result.user.email || "";

        await loadUserProfile();

        if (step2Status) {
          step2Status.innerHTML = `<strong>${result.message || "Đổi email thành công!"}</strong><br><span class="text-[11px] opacity-90">${result.studentStatusMessage || ""}</span>`;
          step2Status.className = "text-xs rounded-xl p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 block leading-relaxed";
        }

        setTimeout(() => {
          closeModal();
        }, 2200);
      } catch (err) {
        if (step2Status) {
          step2Status.textContent = err.message || "Xác thực OTP thất bại. Vui lòng kiểm tra lại.";
          step2Status.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
        }
      } finally {
        if (confirmBtn) confirmBtn.disabled = false;
      }
    });
  }
}

function initContributionInfo() {
  const infoBtn = document.getElementById("contrib-info-btn");
  const closeBtn = document.getElementById("close-contrib-info-btn");
  const popover = document.getElementById("contrib-info-popover");

  if (!infoBtn || !popover) return;

  infoBtn.addEventListener("click", () => {
    popover.classList.toggle("hidden");
  });

  closeBtn?.addEventListener("click", () => {
    popover.classList.add("hidden");
  });
}


