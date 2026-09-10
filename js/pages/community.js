import "../../src/style.css";
import { t, getLang } from "../lib/i18n.js";
import { isAuthenticated, getUser, getToken, setUser, isProfileComplete, isStudentVerified } from "../lib/session.js";
import { canPerformAction, markActionPerformed, withSubmitLock } from "../lib/throttle.js";
import { sanitizeHtml } from "../lib/sanitize.js";
import { showToast as globalShowToast } from "../components/toast.js";
import { renderPagination as renderGlobalPagination } from "../components/pagination.js";
import { showLoginPrompt } from "../components/authModal.js";
import { showConfirmDialog, showAlertDialog } from "../lib/modal.js";
import { TURNSTILE_SITE_KEY } from "../config.js";
import {
  getTrendingDiscussions,
  getUniversityCommunities,
  getUpcomingEvents,
  getPopularDiscussions,
  getAISuggestions,
  getDiscussionsByCategory,
  getDiscussionById,
  getEventById,
  getEvents,
  getComments,
  getTopComment,
  addComment,
  getStats,
  joinUniversity,
  leaveUniversity,
  getMyUniversity,
  createDiscussionWithScope,
  getCommunityDiscussions,
  deleteDiscussion,
  likeComment,
  saveDiscussion,
  unsaveDiscussion,
  getSavedDiscussions,
  createUniversity,
  updateUniversity,
  deleteUniversity as deleteUni,
  addReply,
  deleteDiscussionComment,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  getUniversityMembers,
} from "../api/forum.js";
import { initChatbot } from "../components/chatbot.js";
import { loadNavbar as loadSharedNavbar, initBasicScroll } from "../components/navbar.js";
import { fetchContent, formatDate, capitalize, timeAgo } from "../lib/utils.js";
import { openEventPopup } from "../components/eventPopup.js";
import { getActivityById, getActivities } from "../api/activities.js";
import { getCurrentUser } from "../api/auth.js";
import { addBadgeNotification } from "../lib/notifications.js";
import { getPublicOrganizations, toggleFollowOrganization, getOrganizationPublicEvents, getMyOrganizations } from "../api/organizations.js";
import { CDN_DOMAIN } from "../config.js";
import { triggerBadgeCelebration } from "../components/badgeCelebration.js";

const CATEGORIES = {
  all:     { label: () => t("community.all_discussions"),        sectionTitle: () => t("community.trending_title", "Trending Discussions"),     sectionSubtitle: () => t("community.trending_subtitle", "Active conversations across the community") },
  general: { label: () => t("community.general_chat") || "General Chat", sectionTitle: () => t("community.general_chat", "General Chat"),   sectionSubtitle: () => t("community.general_subtitle", "Open discussions, questions, and casual conversations") },
  event:   { label: () => t("community.event_discussions"),      sectionTitle: () => t("community.event_discussions", "Event Discussions"),        sectionSubtitle: () => t("community.event_subtitle", "Discussions about events and activities") },
  uni:     { label: () => t("community.uni_communities"),        sectionTitle: () => t("community.uni_communities", "University Discussions"),   sectionSubtitle: () => t("community.uni_subtitle", "Discussions from your university community") },
  org:     { label: () => t("community.org_communities"),        sectionTitle: () => t("community.org_communities", "Organizations"),            sectionSubtitle: () => t("community.org_subtitle", "Discover clubs, teams, and organizations. Follow to stay updated on their events.") },
  mine:    { label: () => t("community.my_discussions"),         sectionTitle: () => t("community.my_discussions", "My Discussions"),           sectionSubtitle: () => t("community.my_subtitle", "Your discussions and topics") },
  saved:   { label: () => t("community.saved_posts"),            sectionTitle: () => t("community.saved_posts", "Saved Posts"),              sectionSubtitle: () => t("community.saved_subtitle", "Your bookmarked content") },
};

function getCategoryFromURL() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get("cat");
  return cat && CATEGORIES[cat] ? cat : "all";
}

function getDiscussionParamFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("discussion");
}

function getCommentParamFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("comment");
}

async function enrichDiscussionsEventData(discussions) {
  const needEnrich = discussions.filter(d => d.relatedEvent && !d._event);
  if (needEnrich.length === 0) return;
  const eventIds = [...new Set(needEnrich.map(d => d.relatedEvent))];
  await Promise.all(eventIds.map(async (eventId) => {
    try {
      const data = await getActivityById(eventId);
      const ev = data?.activity || data;
      if (ev) {
        needEnrich.filter(d => d.relatedEvent === eventId).forEach(d => {
          d._event = {
            title: ev.title,
            date: ev.heldDate || ev.date,
            attendees: ev.participants || ev.attendees || 0,
            thumbnail: ev.thumbnail || ev.image || ev.banner,
            certificateBackground: ev.certificateBackground,
          };
        });
      }
    } catch {
      try {
        const event = await getEventById(eventId);
        if (event) {
          needEnrich.filter(d => d.relatedEvent === eventId).forEach(d => {
          d._event = {
            title: event.title,
            date: event.date,
            attendees: event.attendees || 0,
            thumbnail: event.thumbnail || event.image || event.banner,
            certificateBackground: event.certificateBackground,
          };
          });
        }
      } catch {}
    }
  }));
}

const MAX_EVENT_DISCUSSIONS = 20;
let discussionsCache = [];
let savedDiscussionIds = new Set();

async function loadSavedDiscussionIds() {
  if (!isAuthenticated()) return;
  try {
    const saved = await getSavedDiscussions();
    savedDiscussionIds = new Set(saved.map(d => String(d.id)));
  } catch {
    savedDiscussionIds = new Set();
  }
}

function isSaved(id) {
  return savedDiscussionIds.has(String(id));
}

async function getEventDiscussions() {
  try {
    const { activities } = await getActivities();
    if (!activities || activities.length === 0) return [];
    return activities.slice(0, MAX_EVENT_DISCUSSIONS).map(eventToDiscussion);
  } catch {
    const events = await getEvents();
    if (!events || events.length === 0) return [];
    return events.map((e) => ({
      id: e.id,
      author: "SpringWave",
      university: "",
      avatar: "S",
      title: e.title,
      preview: `Join the discussion about ${e.title}! Share your thoughts and connect with other attendees.`,
      category: "event",
      tags: ["event"],
      replies: 0,
      views: 0,
      lastActivity: e.heldDate || e.date,
      relatedEvent: e.id,
    _event: {
      title: e.title,
      date: e.heldDate || e.date,
      attendees: e.participants || e.attendees || 0,
      thumbnail: e.thumbnail || e.image || e.banner,
      certificateBackground: e.certificateBackground,
    },
    }));
  }
}

function eventToDiscussion(event) {
  const commentCount = Array.isArray(event.comments)
    ? event.comments.length
    : (Array.isArray(event.commentsList) ? event.commentsList.length : (Number(event.replyCount) || 0));
  return {
    id: event.activityID || event._id,
    author: event.hostName || "SpringWave",
    university: event.location || "",
    avatar: (event.hostName || "S")[0],
    title: event.title,
    preview: (event.description || "").slice(0, 120) + ((event.description || "").length > 120 ? "..." : ""),
    category: "event",
    tags: [event.type || "event"],
    replies: commentCount,
    replyCount: commentCount,
    views: 0,
    lastActivity: event.heldDate ? formatDate(event.heldDate) : "Upcoming",
    relatedEvent: event.activityID || event._id,
    _event: {
      title: event.title,
      date: event.heldDate,
      attendees: event.participants?.length || event.participants || 0,
      thumbnail: event.thumbnail || event.image || event.banner,
      certificateBackground: event.certificateBackground,
    },
  };
}



// Unverified students are view-only: warn + redirect to the verify page.
function requireVerifiedOrRedirect() {
  if (!isAuthenticated()) {
    showLoginPrompt({
      message: t("auth_modal.desc_post", "Vui lòng đăng nhập để đăng bài hoặc bình luận."),
      redirectUrl: window.location.pathname + window.location.search
    });
    return false;
  }
  if (isStudentVerified(getUser())) return true;
  globalShowToast(t("community.verify_required_to_post", "Bạn cần xác thực sinh viên trước khi đăng bài hoặc bình luận."), true);
  setTimeout(() => { window.location.href = "/student-verify.html"; }, 900);
  return false;
}

function showProfileModal() {
  const overlay = document.getElementById("profileModalOverlay");
  if (!overlay) return;
  overlay.removeAttribute("hidden");
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";
  const laterBtn = document.getElementById("profileModalLater");
  if (laterBtn) {
    laterBtn.onclick = () => {
      overlay.classList.remove("active");
      setTimeout(() => {
        overlay.setAttribute("hidden", "");
        document.body.style.overflow = "";
      }, 300);
    };
  }
  const backdrop = document.getElementById("profileModalBackdrop");
  if (backdrop) {
    backdrop.onclick = () => {
      overlay.classList.remove("active");
      setTimeout(() => {
        overlay.setAttribute("hidden", "");
        document.body.style.overflow = "";
      }, 300);
    };
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const category = getCategoryFromURL();
  setActiveCategory(category);
  updatePageTitle(category);
  showSections(category);

  // Load right sidebar concurrently right away
  loadSidebar(category).catch(() => {});

  await loadNavbar();
  let user = getUser();

  const avatarEl = document.getElementById("forumStatusAvatar");
  if (avatarEl && user) {
    if (user.avatar && typeof user.avatar === 'string' && user.avatar.startsWith('http')) {
      avatarEl.innerHTML = `<img src="${user.avatar}" alt="${user.fullname || user.username || ''}" class="forum-avatar-img" />`;
    } else {
      avatarEl.textContent = (user.username || user.fullname || "?").charAt(0).toUpperCase();
    }
  }
  initBasicScroll();
  initForumSidebarToggle();
  await initPostModal();

  const urlParams = new URLSearchParams(window.location.search);
  const actionParam = urlParams.get("action");
  if (actionParam === "share-cert" || urlParams.get("certCode")) {
    const certCode = urlParams.get("certCode") || urlParams.get("code") || "";
    const eventId = urlParams.get("eventId") || "";
    const eventTitle = urlParams.get("eventTitle") || "";
    const orgName = urlParams.get("orgName") || "SpringWave";
    const customTitle = urlParams.get("title") || "";
    const customContent = urlParams.get("content") || "";

    const verifyUrl = `${window.location.origin}/certificate.html?code=${encodeURIComponent(certCode)}`;
    const isVi = getLang() === 'vi';
    const defaultTitle = customTitle || (isVi 
      ? `🎉 Mình vừa nhận được Chứng chỉ hoàn thành sự kiện: ${eventTitle || 'SpringWave'}!` 
      : `🎉 I just earned a Certificate of Completion for: ${eventTitle || 'SpringWave'}!`);
    const defaultContent = customContent || (isVi
      ? `Rất tự hào chia sẻ cùng mọi người: Mình đã hoàn thành xuất sắc sự kiện "${eventTitle}" do ${orgName} tổ chức và được cấp Giấy chứng nhận hoàn thành! 🏆\n\n📜 Mã chứng nhận: ${certCode}\n🔗 Tra cứu & Xác thực trực tiếp tại: ${verifyUrl}\n\nCảm ơn Ban tổ chức và các bạn đã đồng hành cùng mình! 🚀`
      : `Proud to share with everyone: I have successfully completed "${eventTitle}" organized by ${orgName} and received my official Certificate of Completion! 🏆\n\n📜 Certificate ID: ${certCode}\n🔗 Verify online at: ${verifyUrl}\n\nThank you to the organizers and participants for this amazing experience! 🚀`);

    setTimeout(() => {
      if (window.openPostModal) {
        window.openPostModal({
          category: eventId ? "event" : "general",
          eventId: eventId || undefined,
          eventTitle: eventTitle || undefined,
          certificateCode: certCode || undefined,
          title: defaultTitle,
          content: defaultContent,
          tags: "Certificate, Achievement, SpringWave",
        });
      }
    }, 200);
  }

  if (user && !isProfileComplete(user)) {
    showProfileModal();
  }
  const uniId = urlParams.get("uniId");
  const uniName = urlParams.get("uniName");
  const topic = urlParams.get("topic");

  let discussions = [];

  if (category === "org") {
    // Primary org view: immediately render organizations grid without loading discussions
    await renderOrgGrid();
  } else if (category === "uni" && !uniId) {
    // Primary uni view: immediately render university directory without loading discussions
    await renderUniGrid();
    const currentUser = getUser();
    const addBtn = document.getElementById("forumAddUniBtn");
    if (addBtn && currentUser?.role === "admin") {
      addBtn.style.display = "flex";
      addBtn.addEventListener("click", () => {
        openUniDialog(null, async (name, description, color, domains) => {
          const result = await createUniversity(name, description, color, domains);
          if (result) window.location.reload();
        });
      });
    }
    initUniDialog();
  } else {
    // Load discussions for categories: "all", "general", "event", "uni" (with uniId), "mine", "saved"
    if (category === "general") {
      discussions = await getDiscussionsByCategory("general");
    } else if (category === "event") {
      const [userDiscussions, eventDiscussions] = await Promise.all([
        getDiscussionsByCategory("event"),
        getEventDiscussions(),
      ]);
      discussions = [...userDiscussions, ...eventDiscussions];
      discussionsCache = eventDiscussions;
    } else if (category === "uni" && uniId) {
      discussions = await getCommunityDiscussions(uniId);
      const trendingHeader = document.querySelector("#trending .forum-section-header");
      if (trendingHeader && !document.getElementById("forumUniBackBtn")) {
        const backLink = document.createElement("a");
        backLink.id = "forumUniBackBtn";
        backLink.href = "./community.html?cat=uni";
        backLink.className = "inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline mb-2 cursor-pointer";
        backLink.innerHTML = `<span class="material-symbols-outlined text-sm">arrow_back</span> ${t("community.all_universities") || "All Universities"}`;
        trendingHeader.parentNode.insertBefore(backLink, trendingHeader);
      }
      const sectionTitle = document.querySelector("#trending .forum-section-title");
      if (sectionTitle && uniName) {
        sectionTitle.textContent = `${uniName} Discussions`;
      }
      const sectionSub = document.querySelector("#trending .forum-section-subtitle");
      if (sectionSub) {
        sectionSub.textContent = `Discussions from ${uniName || 'university'} community`;
      }
    } else if (category === "all") {
      const [allDisc, eventDisc] = await Promise.all([
        getDiscussionsByCategory("all"),
        getEventDiscussions().catch(() => [])
      ]);
      const combined = [...allDisc];
      for (const ed of eventDisc) {
        const edRelEvent = String(ed.relatedEvent || ed.id || ed._id);
        const existing = combined.find(d => 
          String(d.id || d._id) === String(ed.id || ed._id) || 
          (d.relatedEvent && String(d.relatedEvent) === edRelEvent)
        );
        if (existing) {
          if (!existing._event && ed._event) existing._event = ed._event;
        } else {
          combined.push(ed);
        }
      }
      discussions = combined;
    } else {
      discussions = await getDiscussionsByCategory(category);
    }

    if (category === "event" || category === "all") {
      const storedDiscRaw = localStorage.getItem("springwave_event_discussions");
      if (storedDiscRaw) {
        try {
          const storedDiscs = JSON.parse(storedDiscRaw).filter(sd => {
            const age = Date.now() - (sd._storedAt || 0);
            return age < 7 * 24 * 60 * 60 * 1000; // remove entries older than 7 days
          });
          for (const sd of storedDiscs) {
            const existing = discussions.findIndex(d => (d.id || d._id) === (sd.id || sd._id));
            if (existing !== -1) {
              discussions[existing]._event = sd._event;
              discussions[existing].relatedEvent = sd.relatedEvent || discussions[existing].relatedEvent;
            } else {
              delete sd._storedAt;
              discussions.unshift(sd);
            }
          }
        } catch {}
      }
    }

    const pendingRaw = sessionStorage.getItem("springwave_pending_discussion");
    if (pendingRaw) {
      sessionStorage.removeItem("springwave_pending_discussion");
      try {
        const pending = JSON.parse(pendingRaw);
        if (pending && (pending._id || pending.id)) {
          const pid = pending._id || pending.id;
          const existingIdx = discussions.findIndex(d => (d.id || d._id) === pid);
          if (existingIdx !== -1) discussions.splice(existingIdx, 1);
          discussions.unshift(pending);
        }
      } catch {}
    }

    // Category filtering
    if (category === "all") {
      // Aggregated Newsfeed: Show all public discussions across categories (general, event, etc.)
      // Only exclude internal private university discussions
      discussions = discussions.filter(d => d.scope !== "community");
    } else if (category === "uni" || category === "event" || category === "general") {
      discussions = discussions.filter(d => d.category === category);
    }

    window._currentDiscussions = discussions;
    await loadSavedDiscussionIds();
    await enrichDiscussionsEventData(discussions);

    renderDiscussions(discussions, category);
    renderPopularDiscussions(discussions);
    initFeedTabs();

    // Concurrently enrich and sync accurate comment/reply counts from database
    enrichDiscussionsReplies(discussions);
  }

  // Register interactive click and modal handlers immediately so UI is instantly smooth
  initSidebarLinkClick();

  initDiscussionDetail();
  console.log('openEventPopup is', openEventPopup);
  window.openEventPopup = openEventPopup;
  initDiscussionPopupClose();

  // Load ancillary components concurrently in background
  Promise.allSettled([
    initChatbot().catch(() => {}),
    loadFooter().catch(() => {})
  ]).then(() => {
    // Open targeted discussion and comment parameter if set in URL
    const discussionParam = getDiscussionParamFromURL();
    const commentParam = getCommentParamFromURL();
    if (discussionParam) {
      setTimeout(() => {
        if (typeof window.scrollToAndOpenDiscussion === "function") {
          window.scrollToAndOpenDiscussion(discussionParam, commentParam);
        } else {
          openDiscussionDetail(discussionParam, commentParam);
        }
      }, 200);
    }
  });

  window.openDiscussionDetail = openDiscussionDetail;
  window.scrollToAndOpenDiscussion = scrollToAndOpenDiscussion;

  const discussParam = urlParams.get("discuss");
  if (discussParam === "event") {
    history.replaceState({}, "", window.location.pathname);
  }

  // Handle clicking on event references inside discussions
  document.addEventListener("click", (e) => {
    const ref = e.target.closest(".forum-event-ref");
    if (!ref) return;
    const eventId = ref.dataset.eventId;
    if (eventId && typeof window.openEventPopup === "function") {
      window.openEventPopup(eventId);
    }
  });
});

async function loadNavbar() {
  await loadSharedNavbar({ activeSection: "community" });
}

async function loadFooter() {
  const html = await fetchContent("./components/footer.html");
  document.getElementById("footer-container").innerHTML = html;
}

function setActiveCategory(category) {
  document.querySelectorAll(".forum-category-item").forEach((item) => {
    const href = item.getAttribute("href");
    const itemCat = !href || href === "./community.html" ? "all" : (href.match(/cat=(\w+)/) || [])[1];
    const isActive = itemCat === category;
    item.classList.toggle("active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function updatePageTitle(category) {
  const config = CATEGORIES[category] || CATEGORIES.all;
  document.title = `${config.label()} - SpringWave`;
}

function buildDiscussionSkeletonHTML(count = 5) {
  let html = "";
  const titleWidths = ["w-3/4", "w-4/5", "w-2/3", "w-5/6", "w-1/2"];
  const previewWidths = ["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4"];
  for (let i = 0; i < count; i++) {
    const tw = titleWidths[i % titleWidths.length];
    const pw = previewWidths[i % previewWidths.length];
    html += `
      <div class="forum-discussion-skeleton" aria-hidden="true">
        <div class="forum-skeleton-header">
          <div class="forum-skeleton-avatar"></div>
          <div class="forum-skeleton-author">
            <div class="forum-skeleton-line" style="width: 120px; height: 13px;"></div>
            <div class="forum-skeleton-line" style="width: 80px; height: 10px;"></div>
          </div>
          <div class="forum-skeleton-line ml-auto" style="width: 60px; height: 10px;"></div>
        </div>
        <div class="flex flex-col gap-2 my-1">
          <div class="forum-skeleton-line ${tw}" style="height: 16px;"></div>
          <div class="forum-skeleton-line ${pw}" style="height: 12px;"></div>
          <div class="forum-skeleton-line w-3/5" style="height: 12px;"></div>
        </div>
        <div class="flex items-center gap-2 mt-1">
          <div class="forum-skeleton-pill" style="width: 70px;"></div>
          <div class="forum-skeleton-pill" style="width: 60px;"></div>
          <div class="forum-skeleton-pill" style="width: 85px;"></div>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-slate-50 mt-1">
          <div class="forum-skeleton-line" style="width: 100px; height: 12px;"></div>
          <div class="flex items-center gap-2">
            <div class="forum-skeleton-btn"></div>
            <div class="forum-skeleton-btn"></div>
          </div>
        </div>
      </div>
    `;
  }
  return html;
}

function buildUniSkeletonHTML(count = 6) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="forum-uni-skeleton-card" aria-hidden="true">
        <div class="p-6 bg-slate-50/80 flex flex-col items-center text-center gap-3 border-b border-slate-100">
          <div class="w-14 h-14 rounded-2xl forum-skeleton-line"></div>
          <div class="forum-skeleton-line w-32 h-4"></div>
          <div class="forum-skeleton-line w-20 h-3"></div>
        </div>
        <div class="p-4 flex items-center justify-between">
          <div class="forum-skeleton-line w-24 h-3"></div>
          <div class="forum-skeleton-pill w-20 h-8"></div>
        </div>
      </div>
    `;
  }
  return html;
}

function buildOrgSkeletonHTML(count = 6) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="forum-org-skeleton-card" aria-hidden="true">
        <div class="flex items-start gap-3">
          <div class="w-14 h-14 rounded-2xl forum-skeleton-line shrink-0"></div>
          <div class="flex flex-col gap-2 flex-1">
            <div class="forum-skeleton-line w-36 h-4"></div>
            <div class="forum-skeleton-line w-24 h-3"></div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <div class="forum-skeleton-line w-full h-3"></div>
          <div class="forum-skeleton-line w-4/5 h-3"></div>
        </div>
        <div class="flex items-center gap-2 pt-2 border-t border-slate-100">
          <div class="forum-skeleton-line w-full h-8 rounded-xl"></div>
          <div class="forum-skeleton-line w-full h-8 rounded-xl"></div>
        </div>
      </div>
    `;
  }
  return html;
}

function showSections(category) {
  const trending = document.getElementById("trending");
  const universities = document.getElementById("universities");
  const orgSection = document.getElementById("organizations-section");
  const statusBar = document.querySelector(".forum-status-bar");
  const feedTabs = document.getElementById("forumFeedTabs");
  const config = CATEGORIES[category] || CATEGORIES.all;

  const urlParams = new URLSearchParams(window.location.search);
  const uniId = urlParams.get("uniId");
  const uniName = urlParams.get("uniName");

  if (category === "uni") {
    if (uniId) {
      if (trending) {
        trending.style.display = "";
        const title = trending.querySelector(".forum-section-title");
        const titleText = typeof config.sectionTitle === "function" ? config.sectionTitle() : config.sectionTitle;
        const subText = typeof config.sectionSubtitle === "function" ? config.sectionSubtitle() : config.sectionSubtitle;
        if (title) title.textContent = uniName ? `${uniName} Discussions` : titleText;
        if (sub) sub.textContent = `Discussions from ${uniName || 'university'} community`;
      }
      if (universities) universities.style.display = "none";
      if (orgSection) orgSection.style.display = "none";
      if (statusBar) statusBar.style.display = "";
      if (feedTabs) feedTabs.style.display = "";

      const container = document.getElementById("forumDiscussions");
      if (container && !container.children.length) {
        container.innerHTML = buildDiscussionSkeletonHTML(5);
      }
    } else {
      if (trending) trending.style.display = "none";
      if (universities) {
        universities.style.display = "";
        const uniGrid = document.getElementById("forumUniGrid");
        if (uniGrid && !uniGrid.children.length) {
          uniGrid.innerHTML = buildUniSkeletonHTML(6);
        }
      }
      if (orgSection) orgSection.style.display = "none";
      if (statusBar) statusBar.style.display = "none";
      if (feedTabs) feedTabs.style.display = "none";
    }
  } else if (category === "org") {
    if (trending) trending.style.display = "none";
    if (universities) universities.style.display = "none";
    if (orgSection) {
      orgSection.style.display = "";
      const orgGrid = document.getElementById("forumOrgGrid");
      if (orgGrid && !orgGrid.children.length) {
        orgGrid.innerHTML = buildOrgSkeletonHTML(6);
      }
    }
    if (statusBar) statusBar.style.display = "none";
    if (feedTabs) feedTabs.style.display = "none";
  } else {
    // "all", "general", "event", "mine", "saved"
    if (universities) universities.style.display = "none";
    if (orgSection) orgSection.style.display = "none";
    if (trending) {
      trending.style.display = "";
      const title = trending.querySelector(".forum-section-title");
      const sub = trending.querySelector(".forum-section-subtitle");
      const titleText = typeof config.sectionTitle === "function" ? config.sectionTitle() : config.sectionTitle;
      const subText = typeof config.sectionSubtitle === "function" ? config.sectionSubtitle() : config.sectionSubtitle;
      if (title) title.textContent = titleText;
      if (sub) sub.textContent = subText;
    }
    if (statusBar) statusBar.style.display = "";
    if (feedTabs) feedTabs.style.display = "";

    const container = document.getElementById("forumDiscussions");
    if (container && !container.children.length) {
      container.innerHTML = buildDiscussionSkeletonHTML(5);
    }
  }
}

function initSidebarLinkClick() {
  document.querySelectorAll(".forum-category-item").forEach((link) => {
    link.addEventListener("click", () => {
      document.getElementById("forumSidebar")?.classList.remove("open");
    });
  });
}

function initFeedTabs() {
  const tabs = document.querySelectorAll(".feed-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", async () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const sort = tab.dataset.sort;
      currentSort = sort;
      
      let discussions = [...(window._currentDiscussions || [])];
      if (sort === "newest") {
        discussions.sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));
      } else if (sort === "popular") {
        discussions.sort((a, b) => (b.replies || 0) - (a.replies || 0));
      }
      renderDiscussions(discussions, getCategoryFromURL());
    });
  });
}

/* =============================
   SIDEBAR TOGGLE
   ============================= */

function initForumSidebarToggle() {
  const toggleBtns = document.querySelectorAll(".forum-mobile-filter-btn");
  const sidebar = document.getElementById("forumSidebar");
  const closeSidebar = () => {
    sidebar?.classList.remove("open");
    document.body.style.overflow = "";
  };

  if (sidebar && toggleBtns.length > 0) {
    toggleBtns.forEach(toggle => {
      toggle.addEventListener("click", () => {
        const isOpen = sidebar.classList.toggle("open");
        document.body.style.overflow = isOpen ? "hidden" : "";
      });
    });
    sidebar.addEventListener("click", (e) => {
      if (e.target === sidebar) {
        closeSidebar();
      }
    });
  }

  const closeBtn = document.getElementById("forumSidebarToggle");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeSidebar);
  }

  const closeIcon = document.getElementById("forumSidebarCloseIcon");
  if (closeIcon) {
    closeIcon.addEventListener("click", closeSidebar);
  }

  document.querySelectorAll(".forum-category-item").forEach((link) => {
    link.addEventListener("click", closeSidebar);
  });
}

let _popularRenderSeq = 0;

async function loadSidebar(category, discussionsList = null) {
  const container = document.getElementById("forumSidebarContainer");
  if (!container) return;

  if (!document.getElementById("sidebarPopular")) {
    const html = await fetchContent("./components/forum-sidebar.html");
    container.innerHTML = html;
  }

  const widgets = container.querySelectorAll(".forum-sidebar-widget");
  widgets.forEach((w) => {
    w.style.display = "";
  });

  const list = discussionsList || window._currentDiscussions || [];
  const promises = [
    renderUpcomingEvents(),
    renderAISuggestions()
  ];
  if (list.length > 0 || category === "all") {
    promises.push(renderPopularDiscussions(list, category));
  }
  await Promise.allSettled(promises);
}

async function enrichDiscussionsReplies(discussions) {
  if (!Array.isArray(discussions) || discussions.length === 0) return;
  const category = getCategoryFromURL();
  if (category === "org" || (category === "uni" && !new URLSearchParams(window.location.search).get("uniId"))) {
    return;
  }

  // 1. Instantly apply locally stored comment counts from this browser
  for (const d of discussions) {
    const discId = String(d.id || d._id);
    let storedCount = 0;
    try {
      const stored = JSON.parse(localStorage.getItem(`forum_comments_${discId}`) || "[]");
      storedCount = stored.length;
    } catch {}
    if (storedCount > (d.replies || 0)) {
      d.replies = storedCount;
      d.replyCount = storedCount;
      updateFeedDiscussionReplyCount(discId, storedCount);
    }
  }

  // 2. Only fetch remote comments for discussions where reply count is truly undefined/missing
  const needFetch = discussions.filter(d => d.replies === undefined || d.replies === null || isNaN(d.replies));
  if (needFetch.length > 0) {
    let idx = 0;
    const worker = async () => {
      while (idx < needFetch.length) {
        const d = needFetch[idx++];
        const discId = String(d.id || d._id);
        try {
          const comments = await getComments(discId);
          if (Array.isArray(comments)) {
            d.replies = comments.length;
            d.replyCount = comments.length;
            updateFeedDiscussionReplyCount(discId, comments.length);
          }
        } catch {}
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, needFetch.length) }, () => worker()));
  }

  renderPopularDiscussions(discussions, category).catch(() => {});
}

async function renderPopularDiscussions(discussionsList = null, categoryParam = null) {
  const seq = ++_popularRenderSeq;
  const container = document.getElementById("sidebarPopular");
  if (!container) return;
  const currentList = discussionsList || window._currentDiscussions || [];
  const cat = categoryParam || getCategoryFromURL();
  const popular = await getPopularDiscussions(currentList, cat);
  if (seq !== _popularRenderSeq) return;
  if (!popular || popular.length === 0) {
    container.innerHTML = '<div class="forum-sidebar-empty" style="padding:12px;text-align:center;color:#94a3b8;font-size:13px;">No discussions yet</div>';
    return;
  }
  container.innerHTML = popular
    .map(
      (d, i) => `
    <div class="forum-sidebar-popular-item" data-discussion-id="${d.id || d._id}" style="cursor:pointer;">
      <span class="forum-sidebar-popular-rank">${String(i + 1).padStart(2, "0")}</span>
      <div class="forum-sidebar-popular-info">
        <span class="forum-sidebar-popular-title">${d.title}</span>
        <span class="forum-sidebar-popular-replies">${Number.isFinite(Number(d.replies)) ? Number(d.replies) : 0} replies</span>
      </div>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".forum-sidebar-popular-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.discussionId;
      if (id) await openDiscussionDetail(id);
    });
  });
}

async function renderUpcomingEvents() {
  const container = document.getElementById("sidebarUpcomingEvents");
  if (!container) return;
  const events = await getUpcomingEvents();
  if (!events || events.length === 0) { container.innerHTML = '<div class="forum-sidebar-empty" style="padding:12px;text-align:center;color:#94a3b8;font-size:13px;">No upcoming events</div>'; return; }
  container.innerHTML = events
    .map(
      (e) => {
      const parts = (e.date || "").split(" ");
      return `
    <div class="forum-sidebar-event" data-event-id="${e.id}" style="cursor:pointer;">
      <div class="forum-sidebar-event-date">
        <span class="forum-sidebar-event-day">${parts[0] || "?"}</span>
        <span class="forum-sidebar-event-month">${parts[1] || ""}</span>
      </div>
      <div class="forum-sidebar-event-info">
        <span class="forum-sidebar-event-title">${e.title}</span>
      </div>
    </div>
  `
    })
    .join("");

  container.querySelectorAll(".forum-sidebar-event").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.eventId;
      if (id) {
        await window.openEventPopup?.(id);
      }
    });
  });
}

async function renderAISuggestions() {
  const container = document.getElementById("sidebarAISuggested");
  if (!container) return;
  const suggestions = await getAISuggestions();
  if (!suggestions || suggestions.length === 0) { container.style.display = "none"; return; }
  container.style.display = "";
  container.innerHTML = suggestions
    .map(
      (s) => `
    <div class="forum-sidebar-ai-item" data-event-id="${s.id}" style="cursor:pointer;">
      <div class="forum-sidebar-ai-icon">
        <span class="material-symbols-outlined">auto_awesome</span>
      </div>
      <div class="forum-sidebar-ai-info">
        <span class="forum-sidebar-ai-title">${s.title}</span>
        <span class="forum-sidebar-ai-reason">${s.reason}</span>
      </div>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".forum-sidebar-ai-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.eventId;
      if (id) {
        await window.openEventPopup?.(id);
      }
    });
  });
}

/* =============================
   DISCUSSIONS
   ============================= */

let currentDiscussionPage = 1;
const DISCUSSIONS_PER_PAGE = 10;

function renderTag(t) {
  const norm = String(t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const skillClasses = {
    communication: "forum-tag-communication forum-tag-skill",
    technical: "forum-tag-technical forum-tag-skill",
    creativity: "forum-tag-creativity forum-tag-skill",
    socialimpact: "forum-tag-social-impact forum-tag-skill",
  };
  const extraClass = skillClasses[norm] || "";
  return `<span class="forum-tag ${extraClass}" data-tag="${t}">${t}</span>`;
}

function renderDiscussions(discussions, category, page = 1) {
  const container = document.getElementById("forumDiscussions");
  if (!container) return;

  const trending = document.getElementById("trending");
  const feedTabs = document.getElementById("forumFeedTabs");
  const statusBar = document.querySelector(".forum-status-bar");
  const paginationContainer = document.getElementById("forumPagination");
  const urlParams = new URLSearchParams(window.location.search);
  const uniId = urlParams.get("uniId");

  if (category === "uni") {
    if (uniId) {
      if (trending) trending.style.display = "";
      if (feedTabs) feedTabs.style.display = "";
      if (statusBar) statusBar.style.display = "";
    }
  } else if (category === "org") {
    if (trending) trending.style.display = "none";
    if (feedTabs) feedTabs.style.display = "none";
    if (statusBar) statusBar.style.display = "none";
  } else {
    if (trending) trending.style.display = "";
    if (feedTabs) feedTabs.style.display = "";
    if (statusBar) statusBar.style.display = "";
  }

  if (discussions.length === 0) {
    if (paginationContainer) {
      paginationContainer.innerHTML = "";
      paginationContainer.style.display = "none";
    }
    const emptyMessages = {
      general: ["chat", t("community.empty_general_title", "No general discussions yet"), t("community.empty_general_desc", "Start an open conversation, ask a question, or share something with the community!")],
      mine:    ["forum", t("community.empty_mine_title", "No discussions yet"), t("community.empty_mine_desc", "You haven't started any discussions yet. Click 'Start Discussion' to create one!")],
      saved:   ["bookmark", t("community.empty_saved_title", "No saved posts"), t("community.empty_saved_desc", "You haven't saved any posts yet. Click the bookmark icon on a discussion to save it for later.")],
      uni:     ["account_balance", t("community.empty_uni_title", "No university discussions"), t("community.empty_uni_desc", "Join a university community above to see discussions from your campus.")],
      event:   ["event", t("community.empty_event_title", "No event discussions"), t("community.empty_event_desc", "There are no event discussions yet. Be the first to start one!")],
    };
    const msg = emptyMessages[category] || ["forum", t("community.empty_default_title", "No discussions yet"), t("community.empty_default_desc", "Be the first to start a discussion in this category.")];
    container.innerHTML = `
      <div class="empty-state py-12 text-center flex flex-col items-center justify-center">
        <span class="material-symbols-outlined text-4xl text-slate-300 mb-2">${msg[0]}</span>
        <p class="text-base font-bold text-slate-700">${msg[1]}</p>
        <p class="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">${msg[2]}</p>
      </div>
    `;
    return;
  }

  window._allCurrentDiscussions = discussions;
  const totalPages = Math.ceil(discussions.length / DISCUSSIONS_PER_PAGE) || 1;
  currentDiscussionPage = Math.max(1, Math.min(page, totalPages));

  const startIndex = (currentDiscussionPage - 1) * DISCUSSIONS_PER_PAGE;
  const pagedDiscussions = discussions.slice(startIndex, startIndex + DISCUSSIONS_PER_PAGE);

  container.innerHTML = pagedDiscussions
    .map((d) => buildDiscussionCardHTML(d))
    .join("");

  renderDiscussionPagination(discussions.length, totalPages, category);
}

function renderDiscussionPagination(totalItems, totalPages, category) {
  const container = document.getElementById("forumPagination");
  if (!container) return;

  renderGlobalPagination({
    container,
    currentPage: currentDiscussionPage,
    totalPages,
    onPageChange: (p) => {
      const target = document.getElementById("forumFeedTabs") || document.getElementById("trending");
      if (target) {
        const navbarHeight = document.getElementById("navbar")?.offsetHeight || 80;
        const y = target.getBoundingClientRect().top + window.scrollY - navbarHeight - 20;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
      renderDiscussions(window._allCurrentDiscussions || window._currentDiscussions || [], category, p);
    },
  });
}

function getForumCategoryLabel(category) {
  const cat = (category || "general").toLowerCase();
  const map = {
    general: t("community.general_chat", "General Chat"),
    event: t("community.event_discussions", "Event Discussions"),
    uni: t("community.uni_communities", "University Communities"),
    org: t("community.org_communities", "Organizations"),
  };
  return map[cat] || capitalize(cat);
}

function buildDiscussionCardHTML(d) {
  const eventRef = d.relatedEvent ? renderEventRef(d.relatedEvent, { ...d._event, certificateCode: d.certificateCode }) : "";
  const imageAttachments = renderDiscussionImages(d.images);
  const saved = isSaved(d.id || d._id);
  return `
      <div class="forum-discussion-card" data-discussion-id="${d.id || d._id}">
      <div class="forum-discussion-card-header">
        <div class="forum-discussion-author-avatar" style="background: #23499b;">
          ${renderAvatar(d.avatar, d.author)}
        </div>
        <div class="forum-discussion-author-info">
          <span class="forum-discussion-author-name">${d.author || "Unknown"}</span>
          <span class="forum-discussion-author-uni">${d.university || ""}</span>
        </div>
        <span class="forum-discussion-time">${d.lastActivity || "Just now"}</span>
      </div>
      <h3 class="forum-discussion-title">${d.title || ""}</h3>
      <p class="forum-discussion-preview">${d.preview || ""}</p>
      ${imageAttachments}
      ${eventRef}
      <div class="forum-discussion-meta">
        <span class="forum-category-badge forum-category-${d.category || "general"}">${getForumCategoryLabel(d.category)}</span>
        <div class="forum-discussion-tags">
          ${(Array.isArray(d.tags) ? d.tags : []).map((t) => renderTag(t)).join("")}
        </div>
      </div>

      <div class="forum-discussion-footer">
        <div class="forum-discussion-stats">
          <button class="forum-discussion-stat forum-reply-btn" data-discussion-id="${d.id || d._id}">
            <span class="material-symbols-outlined text-sm">chat_bubble</span>
            ${t("common.replies_count", { n: Number.isFinite(Number(d.replies)) ? Number(d.replies) : (Number.isFinite(Number(d.replyCount)) ? Number(d.replyCount) : 0) })}
          </button>
          <span class="forum-discussion-stat forum-view-stat">
            <span class="material-symbols-outlined text-sm">visibility</span>
            ${t("common.views_count", { n: d.views || 0 })}
          </span>
        </div>
        <div class="forum-discussion-actions">
          <button class="forum-discussion-action-btn" title="Save">
            <span class="material-symbols-outlined text-sm${saved ? ' bookmarked' : ''}">${saved ? 'bookmark' : 'bookmark_border'}</span>
          </button>
          <button class="forum-discussion-action-btn" title="Share">
            <span class="material-symbols-outlined text-sm">share</span>
          </button>
        </div>
      </div>
      </div>`;
}

function updateFeedDiscussionReplyCount(discussionId, newCount) {
  const cards = document.querySelectorAll(`.forum-discussion-card[data-discussion-id="${discussionId}"]`);
  cards.forEach(card => {
    const btn = card.querySelector(".forum-reply-btn");
    if (btn) {
      btn.innerHTML = `<span class="material-symbols-outlined text-sm">chat_bubble</span> ${newCount} replies`;
    }
  });
  if (Array.isArray(window._currentDiscussions)) {
    const item = window._currentDiscussions.find(d => String(d.id || d._id) === String(discussionId));
    if (item) {
      item.replies = newCount;
      item.replyCount = newCount;
    }
  }
  renderPopularDiscussions(window._currentDiscussions).catch(() => {});
}

function updateFeedDiscussionViewCount(discussionId, newCount) {
  const cards = document.querySelectorAll(`.forum-discussion-card[data-discussion-id="${discussionId}"]`);
  cards.forEach(card => {
    const viewStat = card.querySelector(".forum-view-stat");
    if (viewStat) {
      viewStat.innerHTML = `<span class="material-symbols-outlined text-sm">visibility</span> ${newCount} views`;
    }
  });
  if (Array.isArray(window._currentDiscussions)) {
    const item = window._currentDiscussions.find(d => String(d.id || d._id) === String(discussionId));
    if (item) {
      item.views = newCount;
    }
  }
}

function renderAvatar(avatar, name) {
  if (avatar && typeof avatar === 'string' && avatar.startsWith('http')) {
    return `<img src="${avatar}" alt="${name || ''}" class="forum-avatar-img" />`;
  }
  return avatar || (name || '?').charAt(0).toUpperCase();
}

function renderDiscussionImages(images) {
  if (!Array.isArray(images) || images.length === 0) return "";
  const safeImages = images
    .map((image, index) => {
      const source = typeof image === "string" ? image : image?.url;
      if (typeof source !== "string") return "";
      try {
        const url = new URL(source, window.location.origin);
        if (!/^https?:$/.test(url.protocol)) return "";
        const safeUrl = sanitizeHtml(url.href);
        return `<a class="forum-discussion-image-link" href="${safeUrl}" target="_blank" rel="noopener" aria-label="Open attached image ${index + 1}"><img src="${safeUrl}" alt="Discussion attachment ${index + 1}" loading="lazy"></a>`;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return safeImages.length ? `<div class="forum-discussion-images">${safeImages.join("")}</div>` : "";
}

function renderEventRef(eventId, eventData) {
  if (!eventData) return "";
  const event = eventData;
  const certificateCode = event.certificateCode || eventData.certificateCode;
  const certificateBackground = typeof event.certificateBackground === "string"
    && /^(https?:\/\/|\/)/.test(event.certificateBackground)
    ? event.certificateBackground
    : "";
  const safeEventTitle = sanitizeHtml(event.title || "SpringWave event");
  const safeCertificateCode = sanitizeHtml(certificateCode || "");
  const certPreview = certificateCode ? `
    <a class="forum-certificate-ref" href="/certificate.html?code=${encodeURIComponent(certificateCode)}" aria-label="View certificate for ${safeEventTitle}" ${certificateBackground ? `style="--certificate-bg: url('${certificateBackground.replace(/'/g, "%27")}')"` : ""}>
      <div class="forum-certificate-ref-art" aria-hidden="true">
        <span class="material-symbols-outlined">workspace_premium</span>
      </div>
      <div class="forum-certificate-ref-copy">
        <span class="forum-certificate-ref-label">Certificate earned</span>
        <strong>${safeEventTitle}</strong>
        <span class="forum-certificate-ref-code">${safeCertificateCode}</span>
      </div>
    </a>` : "";
  return `
    <div class="forum-event-ref" data-event-id="${eventId}" role="button" tabindex="0" aria-label="View event: ${safeEventTitle}">
      <div class="forum-event-ref-icon">
        <span class="material-symbols-outlined">event</span>
      </div>
      <div class="forum-event-ref-info">
        <span class="forum-event-ref-label">Discussing</span>
        <span class="forum-event-ref-title">${safeEventTitle}</span>
        <span class="forum-event-ref-meta">
          <span class="material-symbols-outlined text-xs">calendar_today</span>
          ${formatDate(event.date)}
        </span>
      </div>
      <span class="forum-event-ref-link">View event</span>
    </div>
    ${certPreview}
  `;
}

/* =============================
   DISCUSSION DETAIL POPUP
   ============================= */

function initDiscussionDetail() {
  document.getElementById("forumDiscussions")?.addEventListener("click", async (e) => {
    const card = e.target.closest(".forum-discussion-card");
    if (!card) return;
    if (e.target.closest(".forum-event-ref, .forum-event-ref-link")) return;

    const actionBtn = e.target.closest(".forum-discussion-action-btn");
    if (actionBtn) {
      const id = card.dataset.discussionId;
      if (!id) return;
      const icon = actionBtn.querySelector(".material-symbols-outlined");
      if (icon && icon.textContent.includes("bookmark")) {
        if (!isAuthenticated()) {
          showLoginPrompt({
            message: t("auth_modal.desc_bookmark", "Vui lòng đăng nhập để lưu bài viết."),
            redirectUrl: window.location.pathname + window.location.search
          });
          return;
        }
        const currentlySaved = icon.textContent === "bookmark";
        icon.textContent = currentlySaved ? "bookmark_border" : "bookmark";
        icon.classList.toggle("bookmarked", !currentlySaved);
        const ok = currentlySaved ? await unsaveDiscussion(id) : await saveDiscussion(id);
        if (ok) {
          if (currentlySaved) {
            savedDiscussionIds.delete(String(id));
          } else {
            savedDiscussionIds.add(String(id));
          }
        } else {
          icon.textContent = currentlySaved ? "bookmark" : "bookmark_border";
          icon.classList.toggle("bookmarked", currentlySaved);
        }
      } else if (icon && icon.textContent.includes("share")) {
        const url = `${window.location.origin}/community.html?discussion=${id}`;
        if (navigator.share) {
          try { await navigator.share({ title: "Check this discussion", url }); } catch {}
        } else {
          try {
            await navigator.clipboard.writeText(url);
            showToast(t("community.link_copied", "Link copied to clipboard!"));
          } catch {
            showToast(t("common.copy_failed", "Failed to copy link"), true);
          }
        }
      }
      return;
    }

    const id = card.dataset.discussionId;
    if (id) await openDiscussionDetail(id);
  });
}

function scrollToAndHighlightComment(container, targetCommentId) {
  if (!container || !targetCommentId) return;

  const tryScroll = (attempts = 0) => {
    const commentEl = container.querySelector(`.discussion-detail-comment[data-comment-id="${targetCommentId}"]`);
    if (commentEl) {
      // 1. If inside collapsed extra replies, expand parent
      const extraReplies = commentEl.closest(".forum-comment-extra-replies");
      if (extraReplies) {
        extraReplies.style.maxHeight = "2000px";
        const expandBtn = extraReplies.closest(".discussion-detail-comment")?.querySelector(".forum-comment-expand-btn");
        if (expandBtn) expandBtn.classList.add("expanded");
      }

      // 2. Smoothly scroll into view
      commentEl.scrollIntoView({ behavior: "smooth", block: "center" });

      // 3. Highlight with animated pulse glow and border ring
      commentEl.classList.add("ring-2", "ring-[#23499b]", "bg-blue-50/80", "rounded-2xl", "transition-all", "duration-500", "shadow-md");
      setTimeout(() => {
        commentEl.classList.remove("ring-2", "ring-[#23499b]", "bg-blue-50/80", "shadow-md");
      }, 3500);
    } else if (attempts < 8) {
      setTimeout(() => tryScroll(attempts + 1), 150);
    }
  };

  setTimeout(() => tryScroll(0), 100);
}

const VIEWED_DISCUSSIONS_KEY = "springwave_viewed_discussions";

function getViewedDiscussionsStorageKey() {
  const user = getUser();
  const uid = user?._id || user?.id || user?.username || "guest";
  return `${VIEWED_DISCUSSIONS_KEY}_${uid}`;
}

function hasUserViewedDiscussion(id) {
  try {
    const key = getViewedDiscussionsStorageKey();
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    return list.includes(String(id));
  } catch {
    return false;
  }
}

function markUserViewedDiscussion(id) {
  try {
    const key = getViewedDiscussionsStorageKey();
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    if (!list.includes(String(id))) {
      list.push(String(id));
      localStorage.setItem(key, JSON.stringify(list));
    }
  } catch {}
}

async function scrollToAndOpenDiscussion(id, targetCommentId = null) {
  if (!id) return;

  // 1. Close any conflicting creation modals or overlays
  const postOverlay = document.getElementById("forumPostOverlay");
  if (postOverlay && (postOverlay.classList.contains("active") || postOverlay.style.display !== "none")) {
    postOverlay.classList.remove("active");
    postOverlay.style.display = "none";
  }
  const explorePostOverlay = document.getElementById("explorePostOverlay");
  if (explorePostOverlay && (explorePostOverlay.classList.contains("active") || explorePostOverlay.style.display !== "none")) {
    explorePostOverlay.classList.remove("active");
    explorePostOverlay.style.display = "none";
  }
  const eventOverlay = document.getElementById("eventPopupOverlay");
  if (eventOverlay && eventOverlay.classList.contains("active")) {
    eventOverlay.classList.remove("active");
    eventOverlay.setAttribute("hidden", "");
  }

  // 2. Ensure trending/discussions feed section is visible
  const trending = document.getElementById("trending");
  if (trending && trending.style.display === "none") {
    trending.style.display = "";
  }
  const universities = document.getElementById("universities");
  if (universities) universities.style.display = "none";
  const orgSection = document.getElementById("organizations-section");
  if (orgSection) orgSection.style.display = "none";
  const feedTabs = document.getElementById("forumFeedTabs");
  if (feedTabs) feedTabs.style.display = "";
  const statusBar = document.querySelector(".forum-status-bar");
  if (statusBar) statusBar.style.display = "";

  // 3. Find discussion card in DOM
  let card = document.querySelector(`.forum-discussion-card[data-discussion-id="${id}"]`);
  
  // If card is not in current DOM (e.g. user was on another category or pagination page)
  if (!card) {
    let disc = (window._currentDiscussions || []).find(d => String(d.id || d._id) === String(id));
    if (!disc) {
      try {
        const stored = JSON.parse(localStorage.getItem("springwave_event_discussions") || "[]");
        disc = stored.find(d => String(d.id || d._id) === String(id));
      } catch {}
    }
    if (!disc) {
      try {
        const pending = JSON.parse(sessionStorage.getItem("springwave_pending_discussion") || "null");
        if (pending && String(pending.id || pending._id) === String(id)) {
          disc = pending;
        }
      } catch {}
    }

    if (disc) {
      if (!Array.isArray(window._currentDiscussions)) window._currentDiscussions = [];
      const idx = window._currentDiscussions.findIndex(d => String(d.id || d._id) === String(id));
      if (idx !== -1) {
        window._currentDiscussions.splice(idx, 1);
      }
      window._currentDiscussions.unshift(disc);
    }

    if (Array.isArray(window._currentDiscussions) && window._currentDiscussions.length > 0) {
      renderDiscussions(window._currentDiscussions, getCategoryFromURL(), 1);
      card = document.querySelector(`.forum-discussion-card[data-discussion-id="${id}"]`);
    }
  }

  // 4. Smoothly scroll to the discussion card and highlight it
  if (card) {
    const navbar = document.getElementById("navbar");
    const navHeight = navbar ? navbar.offsetHeight : 70;
    const rect = card.getBoundingClientRect();
    const scrollTop = window.scrollY + rect.top - navHeight - 30;
    window.scrollTo({
      top: Math.max(0, scrollTop),
      behavior: "smooth"
    });

    card.classList.add("forum-discussion-card-highlight");
    setTimeout(() => {
      card.classList.remove("forum-discussion-card-highlight");
    }, 3500);
  }

  // 5. Open discussion detail popup
  setTimeout(() => {
    openDiscussionDetail(id, targetCommentId);
  }, card ? 350 : 50);
}

async function openDiscussionDetail(id, targetCommentId = null) {
  const overlay = document.getElementById("discussionPopupOverlay");
  const container = document.getElementById("discussionPopupContainer");
  if (!overlay || !container) return;

  // Add the specific class for figma scrollable detailed modal sheets
  container.className = "popup-container discussion-detail-modal-container";
  container.dataset.activeDiscussionId = id;

  const chatbot = document.getElementById("chatbot-widget");
  if (chatbot) chatbot.style.display = "none";

  overlay.removeAttribute("hidden");
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";

  // 1. FAST LOCAL LOOKUP: Instant 0ms memory lookup
  const localList = [
    ...(window._currentDiscussions || []),
    ...(discussionsCache || [])
  ];
  let discussion = localList.find((d) => String(d.id || d._id) === String(id));
  let fetchedDetail = null;

  const alreadyViewed = hasUserViewedDiscussion(id);

  // If not found in memory (e.g. direct link / refresh), fetch asynchronously
  if (!discussion) {
    container.innerHTML = `<div class="popup-loading"><div class="spinner"></div></div>`;
    try {
      fetchedDetail = await getDiscussionById(id, { skipIncrement: alreadyViewed });
      if (fetchedDetail) {
        discussion = fetchedDetail;
        if (!alreadyViewed) {
          markUserViewedDiscussion(id);
        }
      } else {
        const allDiscussions = await getDiscussionsByCategory("all");
        discussion = (allDiscussions || []).find((d) => String(d.id || d._id) === String(id));
      }
    } catch {}
  }

  if (!discussion) {
    container.innerHTML = `<div class="popup-loading text-slate-500">${t("community.discussion_not_found")}</div>`;
    return;
  }

  // 2. INSTANT ZERO-LAG RENDER: Render shell immediately with skeletons
  container.innerHTML = buildDiscussionDetailHTML(discussion, null);
  requestAnimationFrame(() => { container.scrollTop = 0; });
  wireDiscussionEvents(id, container);

  // 3. PARALLEL BACKGROUND DATA FETCHING: Comments and Event fetched simultaneously
  const fetchEventTask = (async () => {
    if (discussion.relatedEvent && !discussion._event) {
      try {
        const data = await getActivityById(discussion.relatedEvent);
        const ev = data?.activity || data;
        if (ev) {
          discussion._event = { title: ev.title, date: ev.heldDate || ev.date, attendees: ev.participants || ev.attendees || 0 };
        }
      } catch {
        try {
          const event = await getEventById(discussion.relatedEvent);
          if (event) {
            discussion._event = { title: event.title, date: event.date, attendees: event.attendees || 0 };
          }
        } catch {}
      }
      const eventWrap = container.querySelector("#discussion-event-ref-wrap");
      if (eventWrap && discussion._event) {
        eventWrap.innerHTML = renderEventRef(discussion.relatedEvent, { ...discussion._event, certificateCode: discussion.certificateCode });
      }
    }
  })();

  const fetchCommentsTask = (async () => {
    const comments = await getComments(id);
    const commentsContainer = container.querySelector("#discussion-detail-comments");
    if (commentsContainer) {
      const { roots, childMap } = groupComments(comments);
      commentsContainer.innerHTML = comments.length === 0
        ? buildEmptyState()
        : roots.map(c => renderCommentTree(c, childMap, getUser())).join("");

      if (targetCommentId) {
        scrollToAndHighlightComment(container, targetCommentId);
      }
    }

    const countEl = container.querySelector(".forum-comments-count");
    if (countEl) countEl.textContent = t("common.comments_count", { n: comments.length }, `${comments.length} comment${comments.length !== 1 ? "s" : ""}`);

    const statsEl = container.querySelector(".forum-discussion-stats .forum-discussion-stat");
    if (statsEl) {
      statsEl.innerHTML = `<span class="material-symbols-outlined text-sm">chat_bubble</span> ${comments.length} replies`;
    }
    updateFeedDiscussionReplyCount(id, comments.length);
  })();

  const fetchDetailTask = (async () => {
    try {
      if (alreadyViewed && !fetchedDetail) {
        // User has already viewed this discussion; avoid incrementing views again
        return;
      }
      markUserViewedDiscussion(id);
      const fresh = fetchedDetail || (await getDiscussionById(id));
      if (fresh && typeof fresh.views === "number") {
        discussion.views = fresh.views;
        updateFeedDiscussionViewCount(id, fresh.views);
        const detailStat = container.querySelector(".forum-detail-view-stat");
        if (detailStat) {
          detailStat.innerHTML = `<span class="material-symbols-outlined text-sm">visibility</span> ${fresh.views} views`;
        }
        [window._currentDiscussions, discussionsCache].forEach(list => {
          if (Array.isArray(list)) {
            const item = list.find(d => String(d.id || d._id) === String(id));
            if (item) item.views = fresh.views;
          }
        });
      }
    } catch (err) {
      console.warn("Failed to update discussion views:", err);
    }
  })();

  await Promise.allSettled([fetchEventTask, fetchCommentsTask, fetchDetailTask]);

  if (targetCommentId) {
    scrollToAndHighlightComment(container, targetCommentId);
  }
}

async function postCommentOrReply({ discussionId, text, replyToId, container, inputEl, submitBtn, inlineBox }) {
  const sanitized = sanitizeHtml(text.trim());
  if (!sanitized) {
    showToast(t("community.comment_required", "Please enter a comment before submitting."), true);
    inputEl?.focus();
    return;
  }

  if (!requireVerifiedOrRedirect()) return;

  const check = canPerformAction('addComment');
  if (!check.allowed) {
    showToast(t("community.wait_before_comment", { seconds: check.remaining }, `Please wait ${check.remaining} seconds before posting another comment.`), true);
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-60", "pointer-events-none");
  }

  const currentDiscussions = window._currentDiscussions || [];
  const discContext = currentDiscussions.find(d => String(d.id || d._id) === String(discussionId) || (d.relatedEvent && String(d.relatedEvent) === String(discussionId)));

  try {
    let newComment;
    if (replyToId) {
      newComment = await addReply(discussionId, sanitized, replyToId, discContext);
    } else {
      newComment = await addComment(discussionId, sanitized, discContext);
    }

    markActionPerformed('addComment');

    // Show badge celebrations only from newBadges returned by backend action
    if (newComment?.newBadges && Array.isArray(newComment.newBadges) && newComment.newBadges.length > 0) {
      newComment.newBadges.forEach((badgeKey) => {
        addBadgeNotification(badgeKey, badgeKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
        triggerBadgeCelebration(badgeKey);
      });
    }

    if (inputEl) inputEl.value = "";

    if (inlineBox) {
      inlineBox.style.display = "none";
      const inlineInp = inlineBox.querySelector(".forum-comment-inline-input");
      if (inlineInp) {
        inlineInp.value = "";
        delete inlineInp.dataset.replyToId;
      }
    } else {
      const mainInput = container.querySelector("#discussion-input");
      if (mainInput) {
        delete mainInput.dataset.replyToId;
        mainInput.placeholder = "Write a comment... (Press Enter to post)";
      }
      const banner = container.querySelector("#discussion-replying-banner");
      if (banner) banner.style.display = "none";
      const mainBtn = container.querySelector("#discussion-submit-btn");
      if (mainBtn) {
        mainBtn.innerHTML = `<span class="material-symbols-outlined text-sm">send</span> Post`;
      }
    }

    if (newComment) {
      const user = getUser();
      const newCommentHTML = buildCommentHTML(newComment, user, "", replyToId ? 1 : 0);

      if (replyToId) {
        const targetComment = container.querySelector(`.discussion-detail-comment[data-comment-id="${replyToId}"]`);
        if (targetComment) {
          const rootComment = targetComment.classList.contains("forum-comment-nested")
            ? targetComment.closest(".discussion-detail-comment:not(.forum-comment-nested)") || targetComment
            : targetComment;

          let repliesContainer = rootComment.querySelector(".forum-comment-replies");
          if (!repliesContainer) {
            repliesContainer = document.createElement("div");
            repliesContainer.className = "forum-comment-replies";
            const inlineEditor = rootComment.querySelector(".forum-comment-inline-reply");
            if (inlineEditor) {
              rootComment.querySelector(".forum-comment-body").insertBefore(repliesContainer, inlineEditor);
            } else {
              rootComment.querySelector(".forum-comment-body").appendChild(repliesContainer);
            }
          }
          repliesContainer.classList.remove("hidden");

          const expandBtn = repliesContainer.querySelector(".forum-comment-expand-btn");
          if (expandBtn) {
            expandBtn.insertAdjacentHTML("beforebegin", newCommentHTML);
          } else {
            repliesContainer.insertAdjacentHTML("beforeend", newCommentHTML);
          }
        }
      } else {
        const commentsList = container.querySelector("#discussion-detail-comments");
        if (commentsList) {
          const empty = commentsList.querySelector(".forum-comments-empty");
          if (empty) empty.remove();
          commentsList.insertAdjacentHTML("beforeend", newCommentHTML);
        }
      }

      // Update counters
      const countEl = container.querySelector(".forum-comments-count");
      const current = parseInt(countEl?.textContent) || 0;
      if (countEl) countEl.textContent = `${current + 1} comment${current + 1 !== 1 ? "s" : ""}`;

      const statsEl = container.querySelector(".forum-discussion-stats .forum-discussion-stat");
      if (statsEl) {
        statsEl.innerHTML = `<span class="material-symbols-outlined text-sm">chat_bubble</span> ${current + 1} replies`;
      }
      updateFeedDiscussionReplyCount(discussionId, current + 1);

      // Scroll into view
      const newCommentEl = container.querySelector(`.discussion-detail-comment[data-comment-id="${newComment.id || newComment._id}"]`);
      if (newCommentEl) {
        newCommentEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  } catch (err) {
    console.error("Failed to post comment/reply:", err);
    showToast(err?.message || "Failed to post comment. Please try again.", true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-60", "pointer-events-none");
    }
  }
}

function wireDiscussionEvents(id, container) {
  if (container._abortController) {
    container._abortController.abort();
  }
  container._abortController = new AbortController();
  const { signal } = container._abortController;
  container.dataset.activeDiscussionId = String(id);

  const mainInput = container.querySelector("#discussion-input");
  const mainSubmitBtn = container.querySelector("#discussion-submit-btn");
  const banner = container.querySelector("#discussion-replying-banner");
  const replyingToName = container.querySelector("#replying-to-name");
  const cancelReplyBtn = container.querySelector("#cancel-reply-btn");

  container.querySelector("#discussion-back-btn")?.addEventListener("click", closeDiscussionDetail, { signal });

  // Main input submit
  const handleMainSubmit = () => {
    const text = mainInput?.value || "";
    const replyToId = mainInput?.dataset.replyToId || null;
    postCommentOrReply({
      discussionId: id,
      text,
      replyToId,
      container,
      inputEl: mainInput,
      submitBtn: mainSubmitBtn
    });
  };

  mainSubmitBtn?.addEventListener("click", handleMainSubmit, { signal });

  mainInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleMainSubmit();
    }
  }, { signal });

  // Cancel reply in bottom bar
  cancelReplyBtn?.addEventListener("click", () => {
    if (mainInput) {
      delete mainInput.dataset.replyToId;
      mainInput.placeholder = "Write a comment... (Press Enter to post)";
    }
    if (banner) banner.style.display = "none";
    if (mainSubmitBtn) {
      mainSubmitBtn.innerHTML = `<span class="material-symbols-outlined text-sm">send</span> Post`;
    }
  }, { signal });

  // Inline inputs: Enter key to submit
  container.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.target.classList.contains("forum-comment-inline-input")) {
      e.preventDefault();
      const inlineBox = e.target.closest(".forum-comment-inline-reply");
      if (!inlineBox) return;
      const text = e.target.value || "";
      const replyToId = e.target.dataset.replyToId || inlineBox.dataset.parentId;
      const submitBtn = inlineBox.querySelector(".forum-comment-inline-submit");
      postCommentOrReply({
        discussionId: id,
        text,
        replyToId,
        container,
        inputEl: e.target,
        submitBtn,
        inlineBox
      });
    }
  }, { signal });

  // Click delegation
  container.addEventListener("click", async (e) => {
    const currentDiscussionId = container.dataset.activeDiscussionId || id;

    // 1. Reply button clicked on a comment
    const replyBtn = e.target.closest(".forum-comment-reply-btn");
    if (replyBtn) {
      e.stopPropagation();
      const commentId = replyBtn.dataset.commentId;
      const author = replyBtn.dataset.author || "User";
      const commentEl = container.querySelector(`.discussion-detail-comment[data-comment-id="${commentId}"]`);
      if (!commentEl) return;

      // Close other inline reply boxes
      container.querySelectorAll(".forum-comment-inline-reply").forEach(r => r.style.display = "none");

      // Open the inline box of the comment
      const inline = commentEl.querySelector(".forum-comment-inline-reply");
      if (inline) {
        inline.style.display = "flex";
        const input = inline.querySelector(".forum-comment-inline-input");
        if (input) {
          input.value = `@${author} `;
          input.dataset.replyToId = commentId;
          input.focus();
        }
      }
      return;
    }

    // 2. Inline Cancel button
    const cancelInlineBtn = e.target.closest(".forum-comment-inline-cancel");
    if (cancelInlineBtn) {
      e.stopPropagation();
      const inline = cancelInlineBtn.closest(".forum-comment-inline-reply");
      if (inline) {
        inline.style.display = "none";
        const input = inline.querySelector(".forum-comment-inline-input");
        if (input) {
          input.value = "";
          delete input.dataset.replyToId;
        }
      }
      return;
    }

    // 3. Inline Submit button
    const submitInlineBtn = e.target.closest(".forum-comment-inline-submit");
    if (submitInlineBtn) {
      e.stopPropagation();
      const inline = submitInlineBtn.closest(".forum-comment-inline-reply");
      if (!inline) return;
      const input = inline.querySelector(".forum-comment-inline-input");
      if (!input) return;
      const text = input.value.trim();
      const replyToId = input.dataset.replyToId;
      await postCommentOrReply({
        discussionId: currentDiscussionId,
        text,
        replyToId,
        container,
        inputEl: input,
        submitBtn: submitInlineBtn,
        inlineBox: inline
      });
      return;
    }

    // 4. Like comment button
    const likeBtn = e.target.closest(".forum-comment-like-btn");
    if (likeBtn) {
      e.stopPropagation();
      const commentId = likeBtn.dataset.commentId;
      if (!commentId) return;
      likeComment(currentDiscussionId, commentId).then(res => {
        if (res && res.comment) {
          const countEl = likeBtn.querySelector(".forum-comment-like-count");
          if (countEl) countEl.textContent = res.comment.likes || 0;
          if (res.hasLiked) {
            likeBtn.classList.add("text-primary-600");
          } else {
            likeBtn.classList.remove("text-primary-600");
          }
        }
      });
      return;
    }

    // 5. Bookmark button inside discussion
    const bookmarkBtn = e.target.closest(".forum-discussion-bookmark-btn");
    if (bookmarkBtn) {
      e.stopPropagation();
      if (!isAuthenticated()) {
        showLoginPrompt({
          message: t("auth_modal.desc_bookmark", "Please log in to bookmark discussions."),
          redirectUrl: window.location.href
        });
        return;
      }
      const isSaved = bookmarkBtn.classList.contains("saved");
      const icon = bookmarkBtn.querySelector(".material-symbols-outlined");
      if (isSaved) {
        unsaveDiscussion(currentDiscussionId).then(ok => {
          if (ok) {
            bookmarkBtn.classList.remove("saved");
            if (icon) {
              icon.textContent = "bookmark_border";
              icon.style.fontVariationSettings = "'FILL' 0";
            }
            updateFeedDiscussionSavedState(currentDiscussionId, false);
          }
        });
      } else {
        saveDiscussion(currentDiscussionId).then(ok => {
          if (ok) {
            bookmarkBtn.classList.add("saved");
            if (icon) {
              icon.textContent = "bookmark";
              icon.style.fontVariationSettings = "'FILL' 1";
            }
            updateFeedDiscussionSavedState(currentDiscussionId, true);
          }
        });
      }
      return;
    }

    // 6. Delete comment button
    const deleteBtn = e.target.closest(".forum-comment-delete-btn");
    if (deleteBtn) {
      e.stopPropagation();
      const commentId = deleteBtn.dataset.commentId;
      if (!commentId) return;
      const confirmed = await showConfirmDialog({
        titleKey: "common.delete_confirm_title",
        messageKey: "community.delete_comment_confirm",
        confirmTextKey: "common.delete_btn",
        type: "danger"
      });
      if (!confirmed) return;
      const commentEl = container.querySelector(`.discussion-detail-comment[data-comment-id="${commentId}"]`);
      deleteDiscussionComment(currentDiscussionId, commentId).then(success => {
        if (success) {
          if (commentEl) commentEl.remove();
          const countEl = container.querySelector(".forum-comments-count");
          if (countEl) {
            const current = parseInt(countEl.textContent) || 0;
            countEl.textContent = `${Math.max(0, current - 1)} comment${current - 1 !== 1 ? "s" : ""}`;
          }
          const statsEl = container.querySelector(".forum-discussion-stats .forum-discussion-stat");
          if (statsEl) {
            const current = parseInt(statsEl.textContent.replace(/[^0-9]/g, '')) || 0;
            statsEl.innerHTML = `<span class="material-symbols-outlined text-sm">chat_bubble</span> ${Math.max(0, current - 1)} replies`;
          }
          updateFeedDiscussionReplyCount(currentDiscussionId, Math.max(0, (parseInt(countEl?.textContent) || 0) - 1));
          const commentsContainer = document.getElementById("discussion-detail-comments");
          if (commentsContainer && commentsContainer.children.length === 0) {
            commentsContainer.innerHTML = buildEmptyState();
          }
        }
      });
      return;
    }

    // 7. Start comment empty state button
    const startBtn = e.target.closest(".forum-comment-start-btn");
    if (startBtn) {
      const input = container.querySelector("#discussion-input");
      if (input) input.focus();
      return;
    }

    // 8. Share & Delete discussion
    const deleteDiscBtn = e.target.closest("#discussion-delete-btn");
    if (deleteDiscBtn) {
      const confirmed = await showConfirmDialog({
        titleKey: "common.delete_confirm_title",
        messageKey: "community.delete_post_confirm",
        confirmTextKey: "common.delete_btn",
        type: "danger"
      });
      if (!confirmed) return;
      deleteDiscussion(currentDiscussionId).then(ok => {
        if (ok) {
          closeDiscussionDetail();
          window.location.reload();
        } else {
          showToast(t("community.delete_failed", "Failed to delete discussion"), true);
        }
      });
      return;
    }

    const shareDiscBtn = e.target.closest("#discussion-share-btn");
    if (shareDiscBtn) {
      const url = `${window.location.origin}/community.html?discussion=${currentDiscussionId}`;
      if (navigator.share) {
        try { navigator.share({ title: "Check this discussion", url }); } catch {}
      } else {
        try {
          navigator.clipboard.writeText(url);
          showToast(t("community.link_copied", "Link copied to clipboard!"));
        } catch {
          showToast(t("common.copy_failed", "Failed to copy link"), true);
        }
      }
      return;
    }
  }, { signal });

  const sortEl = container.querySelector("#forum-comments-sort");
  if (sortEl && !sortEl._wired) {
    sortEl._wired = true;
    sortEl.addEventListener("change", async (e) => {
      const sortBy = e.target.value;
      const currentDiscussionId = container.dataset.activeDiscussionId || id;
      const allComments = await getComments(currentDiscussionId);
      const sorted = sortComments(allComments, sortBy);
      const { roots, childMap } = groupComments(sorted);
      const commentsContainer = document.getElementById("discussion-detail-comments");
      if (commentsContainer) {
        commentsContainer.innerHTML = sorted.length === 0
          ? buildEmptyState()
          : roots.map(c => renderCommentTree(c, childMap, getUser())).join("");
      }
    });
  }
}

function closeDiscussionDetail() {
  const overlay = document.getElementById("discussionPopupOverlay");
  const container = document.getElementById("discussionPopupContainer");
  if (!overlay || !container || overlay.hasAttribute("hidden")) return;

  if (container._abortController) {
    container._abortController.abort();
    container._abortController = null;
  }

  const chatbot = document.getElementById("chatbot-widget");
  if (chatbot) chatbot.style.display = "";

  overlay.classList.remove("active");
  document.body.style.overflow = "";
  setTimeout(() => {
    container.innerHTML = "";
    overlay.setAttribute("hidden", "");
  }, 300);
}

function hideDiscussionPopup() {
  const overlay = document.getElementById("discussionPopupOverlay");
  const container = document.getElementById("discussionPopupContainer");
  if (!overlay || !container || overlay.hasAttribute("hidden")) return;

  if (container._abortController) {
    container._abortController.abort();
    container._abortController = null;
  }

  const chatbot = document.getElementById("chatbot-widget");
  if (chatbot) chatbot.style.display = "";

  overlay.classList.remove("active");
  overlay.setAttribute("hidden", "");
}

function groupComments(comments) {
  const map = {};
  const childMap = {};
  const roots = [];

  comments.forEach(c => {
    const cId = String(c.id || c._id);
    c.id = cId;
    map[cId] = c;
    childMap[cId] = childMap[cId] || [];
  });

  comments.forEach(c => {
    const rawParentId = c.replyToId
      ? (typeof c.replyToId === "object" ? (c.replyToId._id || c.replyToId.id || "") : c.replyToId)
      : null;
    const parentId = rawParentId ? String(rawParentId) : null;
    if (parentId && map[parentId]) {
      (childMap[parentId] = childMap[parentId] || []).push(c);
    } else {
      roots.push(c);
    }
  });

  return { roots, childMap };
}

function collectDescendants(comment, childMap) {
  const result = [];
  const cId = String(comment.id || comment._id);
  const children = childMap[cId] || [];
  children.forEach(child => {
    result.push(child);
    result.push(...collectDescendants(child, childMap));
  });
  return result;
}

function renderCommentTree(comment, childMap, currentUser, depth = 0) {
  if (depth === 0) {
    const allDescendants = collectDescendants(comment, childMap);
    const visibleReplies = allDescendants.slice(0, 2);
    const hiddenReplies = allDescendants.slice(2);
    const repliesHtml = visibleReplies.map(r => buildCommentHTML(r, currentUser, "", 1)).join("");
    const hiddenHtml = hiddenReplies.map(r => buildCommentHTML(r, currentUser, "", 1)).join("");
    return buildCommentHTML(comment, currentUser, repliesHtml, 0, hiddenHtml, hiddenReplies.length);
  }
  return buildCommentHTML(comment, currentUser, "", Math.min(depth, 1));
}

function sortComments(comments, sortBy) {
  const sorted = [...comments];
  switch (sortBy) {
    case "newest": return sorted.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
    case "oldest": return sorted.sort((a, b) => new Date(a.createdAt || a.date || 0) - new Date(b.createdAt || b.date || 0));
    case "relevant": return sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    default: return sorted;
  }
}

function buildCommentSkeleton(count = 3) {
  return `
    <div class="forum-comments-skeleton">
      ${Array.from({ length: count }, () => `
      <div class="forum-skeleton-row">
        <div class="forum-skeleton-avatar"></div>
        <div class="forum-skeleton-lines">
          <div class="forum-skeleton-line" style="width:120px"></div>
          <div class="forum-skeleton-line" style="width:100%"></div>
          <div class="forum-skeleton-line" style="width:60%"></div>
        </div>
      </div>`).join("")}
    </div>`;
}

function buildEmptyState() {
  const user = getUser();
  return `
    <div class="forum-comments-empty">
      <div class="forum-comments-empty-icon">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="8" y="12" width="48" height="36" rx="8" fill="#e2e8f0"/>
          <rect x="14" y="20" width="36" height="4" rx="2" fill="#cbd5e1"/>
          <rect x="14" y="28" width="28" height="4" rx="2" fill="#cbd5e1"/>
          <rect x="14" y="36" width="20" height="4" rx="2" fill="#cbd5e1"/>
          <circle cx="16" cy="54" r="6" fill="#e2e8f0"/>
          <circle cx="32" cy="54" r="6" fill="#e2e8f0"/>
          <circle cx="48" cy="54" r="6" fill="#e2e8f0"/>
        </svg>
      </div>
      <h3>${t("community.no_comments_title")}</h3>
      <p>${t("community.no_comments_desc")}</p>
      ${user ? `<button class="forum-comment-start-btn" style="margin-top:12px;padding:8px 20px;background:#23499b;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">${t("community.write_a_comment")}</button>` : ""}
    </div>`;
}

function buildDiscussionDetailHTML(d, comments) {
  const eventRef = d.relatedEvent ? renderEventRef(d.relatedEvent, { ...d._event, certificateCode: d.certificateCode }) : "";
  const imageAttachments = renderDiscussionImages(d.images);
  const user = getUser();
  const isOwner = user && (d.author === (user.fullname || user.username));
  const isAdmin = user && user.role === "admin";
  const topActions = `
    <div class="top-actions">
      <button class="icon-btn" id="discussion-share-btn"><span class="material-symbols-outlined text-base">share</span> ${t("org_profile.share_btn")}</button>
      ${isOwner || isAdmin ? `<button class="delete-btn" id="discussion-delete-btn"><span class="material-symbols-outlined text-base">delete</span> ${t("common.delete")}</button>` : ""}
    </div>
  `;
  const commentsCount = comments ? comments.length : (Number.isFinite(Number(d.replies)) ? Number(d.replies) : (Number.isFinite(Number(d.replyCount)) ? Number(d.replyCount) : 0));
  const commentsContent = comments === null
    ? buildCommentSkeleton(3)
    : (comments.length === 0
        ? buildEmptyState()
        : (() => { const { roots, childMap } = groupComments(comments); return roots.map(c => renderCommentTree(c, childMap, user)).join(""); })());

  return `
    <div class="container discussion-detail">
      <div class="top-bar">
        <button class="back-btn" id="discussion-back-btn"><i class="fa-solid fa-arrow-left"></i> ${t("common.back")}</button>
        ${topActions}
      </div>
      
      <!-- Scrollable Message & Comment Area -->
      <div class="discussion-detail-scroll-area">
        <div class="discussion-detail-card">
          <div class="forum-discussion-card-header">
            <div class="forum-discussion-author-avatar" style="background: #23499b;">
              ${renderAvatar(d.avatar, d.author)}
            </div>
            <div class="forum-discussion-author-info">
              <span class="forum-discussion-author-name">${d.author}</span>
              <span class="forum-discussion-author-uni">${d.university || "SpringWave"}</span>
            </div>
            <span class="forum-discussion-time">${d.lastActivity || timeAgo(d.createdAt || d.date)}</span>
          </div>
          <h3 class="forum-discussion-title">${d.title}</h3>
          <p class="forum-discussion-preview">${d.preview || d.content || ""}</p>
          ${imageAttachments}
          <div id="discussion-event-ref-wrap">${eventRef}</div>
          <div class="forum-discussion-meta">
            <span class="forum-category-badge forum-category-${d.category}">${getForumCategoryLabel(d.category)}</span>
            <div class="forum-discussion-tags">
            ${(Array.isArray(d.tags) ? d.tags : []).map((t) => `<span class="forum-tag">${t}</span>`).join("")}
            </div>
          </div>
          <div class="forum-discussion-stats">
            <span class="forum-discussion-stat">
              <span class="material-symbols-outlined text-sm">chat_bubble</span>
              ${t("common.replies_count", { n: commentsCount })}
            </span>
            <span class="forum-discussion-stat forum-detail-view-stat">
              <span class="material-symbols-outlined text-sm">visibility</span>
              ${t("common.views_count", { n: d.views || 0 })}
            </span>
          </div>
        </div>
        
        <div class="forum-comments-header">
          <span class="forum-comments-count">${t("common.comments_count", { n: commentsCount })}</span>
          <select class="forum-comments-sort" id="forum-comments-sort">
            <option value="newest">${t("community.sort_newest", "Newest")}</option>
            <option value="oldest">${t("community.sort_oldest", "Oldest")}</option>
            <option value="relevant">${t("community.sort_relevant", "Most Relevant")}</option>
          </select>
        </div>
        
        <div class="discussion-detail-comments" id="discussion-detail-comments">
          ${commentsContent}
        </div>
      </div>
      
      <!-- Floating Input form sits outside scroll area at absolute bottom -->
      <div class="discussion-detail-form-wrap">
        <div class="discussion-replying-banner" id="discussion-replying-banner" style="display:none;">
          <span class="text-xs text-slate-600 font-medium flex items-center gap-1">
            <span class="material-symbols-outlined text-sm text-primary">reply</span>
            ${t("community.replying_to")} <b class="text-primary font-bold" id="replying-to-name">@User</b>
          </span>
          <button type="button" class="replying-cancel-btn" id="cancel-reply-btn" title="${t("community.cancel_reply")}">
            <span class="material-symbols-outlined text-xs">close</span>
          </button>
        </div>
        <div class="discussion-detail-form">
          <div class="forum-comment-avatar forum-my-avatar" style="background: #23499b;">
            ${renderAvatar(user?.avatar, user?.fullname || user?.username)}
          </div>
          <input type="text" id="discussion-input" class="forum-comment-input" placeholder="${t("community.write_comment_placeholder")}" data-reply-to-id="" />
          <button class="forum-comment-submit" id="discussion-submit-btn" type="button">
            <span class="material-symbols-outlined text-sm">send</span> ${t("community.post")}
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildCommentHTML(c, currentUser, repliesHtml = "", depth = 0, hiddenHtml = "", hiddenCount = 0) {
  const cId = String(c.id || c._id);
  c.id = cId;
  const user = currentUser || getUser();
  const liked = c.likedBy && user && c.likedBy.some ? c.likedBy.some(id => String(id) === String(user._id || user.id)) : false;
  const replyToHtml = c.replyTo && (c.replyTo.userName || c.replyTo.author)
    ? `<span class="forum-comment-reply-to">@${c.replyTo.userName || c.replyTo.author}</span> `
    : "";
  const isNested = depth > 0;
  const authorName = c.author || c.userName || "Anonymous";

  const canDelete = user && (
    String(c.userID || c.userId) === String(user._id || user.id) ||
    user.role === "admin" ||
    (c.userName && (c.userName === user.fullname || c.userName === user.username)) ||
    (c.author && (c.author === user.fullname || c.author === user.username))
  );

  return `
    <div class="discussion-detail-comment ${isNested ? 'forum-comment-nested' : ''}" data-comment-id="${cId}">
      <div class="forum-comment-avatar ${isNested ? 'forum-comment-nested-avatar' : ''}" style="background: #23499b;">
        ${renderAvatar(c.avatar, authorName)}
      </div>
      <div class="forum-comment-body">
        <div class="forum-comment-header">
          <span class="forum-comment-author">${authorName}</span>
          <span class="forum-comment-dot">•</span>
          <span class="forum-comment-date">${timeAgo(c.createdAt || c.date)}</span>
        </div>
        <div class="forum-comment-content">
          <p class="forum-comment-text">${replyToHtml}${c.content}</p>
        </div>
        <div class="forum-comment-footer">
          <button type="button" class="forum-comment-like-btn ${liked ? 'liked' : ''}" data-comment-id="${cId}" title="${t("common.like", "Like")}">
            <span class="material-symbols-outlined text-xs">thumb_up</span>
            <span class="like-count">${c.likes || 0}</span>
          </button>
          <button type="button" class="forum-comment-reply-btn" data-comment-id="${cId}" data-author="${authorName}" title="${t("community.reply", "Reply")}">
            <span class="material-symbols-outlined text-xs">reply</span>
            <span>${t("community.reply", "Reply")}</span>
          </button>
          ${canDelete ? `
          <button type="button" class="forum-comment-delete-btn" data-comment-id="${cId}" title="${t("community.delete_comment", "Delete comment")}">
            <span class="material-symbols-outlined text-xs">delete</span>
          </button>` : ""}
        </div>

        <div class="forum-comment-inline-reply" data-parent-id="${cId}" style="display:none;">
          <div class="forum-comment-avatar forum-comment-nested-avatar" style="background: #23499b;">
            ${renderAvatar(user?.avatar, user?.fullname || user?.username)}
          </div>
          <div class="forum-comment-inline-body">
            <div class="flex items-center gap-1 text-[11px] text-slate-500 font-medium mb-1">
              <span>${t("community.replying_to", "Replying to")}</span>
              <span class="text-primary font-bold">@${authorName}</span>
            </div>
            <input type="text" class="forum-comment-inline-input" placeholder="${t("community.write_reply_placeholder", "Write a reply... (Press Enter to post)")}" data-reply-to-id="${cId}" />
            <div class="forum-comment-inline-actions">
              <button type="button" class="forum-comment-inline-cancel">${t("common.cancel", "Cancel")}</button>
              <button type="button" class="forum-comment-inline-submit">
                <span class="material-symbols-outlined text-sm">send</span> ${t("community.reply", "Reply")}
              </button>
            </div>
          </div>
        </div>

        ${!isNested && (repliesHtml || hiddenCount > 0) ? `
        <div class="forum-comment-replies">
          ${repliesHtml}
          ${hiddenCount > 0 ? `
          <div class="forum-comment-extra-replies" style="max-height:0;overflow:hidden;transition:max-height 0.35s ease,opacity 0.25s ease;">
            ${hiddenHtml}
          </div>
          <button type="button" class="forum-comment-expand-btn" data-comment-id="${cId}" data-hidden-count="${hiddenCount}">
            <span class="forum-comment-expand-text">${t("community.view_more_replies", { n: hiddenCount })}</span>
            <span class="forum-comment-expand-text-hide" style="display:none">${t("community.show_less", "Show less")}</span>
          </button>` : ""}
        </div>` : ""}
      </div>
    </div>
  `;
}

/* =============================
   UNIVERSITY GRID
   ============================= */

async function renderUniGrid() {
  const container = document.getElementById("forumUniGrid");
  if (!container) return;
  if (!container.children.length) {
    container.innerHTML = buildUniSkeletonHTML(6);
  }
  const isAuthed = isAuthenticated();
  const [unis, myUni] = await Promise.all([
    getUniversityCommunities(),
    isAuthed ? getMyUniversity().catch(() => null) : Promise.resolve(null),
  ]);
  const myUniId = myUni?._id || myUni?.id;
  const user = getUser();
  const isAdmin = user?.role === "admin";
  const universities = document.getElementById("universities");
  const category = getCategoryFromURL();
  if (universities && category === "uni") {
    universities.style.display = "";
  }

  if (!unis || unis.length === 0) {
    container.innerHTML = `
      <div class="forum-empty" style="grid-column:1/-1;">
        <span class="material-symbols-outlined forum-empty-icon">account_balance</span>
        <p class="forum-empty-title">${t("community.empty_uni_communities_title")}</p>
        <p class="forum-empty-desc">${t("community.empty_uni_communities_desc")}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = unis
    .map(
      (u) => {
      const isJoined = myUniId && (String(u.id) === String(myUniId));
      return `
    <div class="forum-uni-card" data-uni-id="${u.id}">
      <div class="forum-uni-card-top" style="background: ${u.color}15;">
        <div class="forum-uni-icon" style="background: ${u.color};">
          <span class="material-symbols-outlined text-white text-2xl">account_balance</span>
        </div>
        <h3 class="forum-uni-name">${u.name}</h3>
        ${isAdmin ? `
        <div class="forum-uni-admin-actions">
          <button class="forum-uni-edit-btn" title="Edit"><span class="material-symbols-outlined text-sm">edit</span></button>
          <button class="forum-uni-delete-btn" title="Delete"><span class="material-symbols-outlined text-sm">delete</span></button>
        </div>` : ""}
      </div>
      <div class="forum-uni-card-body">
        <div class="forum-uni-stat">
          <span class="forum-uni-stat-value">${(u.memberCount || 0).toLocaleString()}</span>
          <span class="forum-uni-stat-label">Members</span>
        </div>
        <div class="forum-uni-stat">
          <span class="forum-uni-stat-value">${u.activeDiscussions}</span>
          <span class="forum-uni-stat-label">Discussions</span>
        </div>
        <div class="forum-uni-card-actions">
          <button class="forum-uni-members-btn" title="View Members">
            <span class="material-symbols-outlined text-sm">group</span> Members
          </button>
          <button class="forum-uni-join-btn ${isJoined ? 'joined' : ''}">
            ${isJoined ? '✓ Joined' : 'Join Community'}
          </button>
        </div>
      </div>
    </div>
  `}).join("");

  function updateMemberCount(cardEl, delta) {
    const stat = cardEl?.querySelector(".forum-uni-stat-value");
    if (!stat) return;
    const current = parseInt(stat.textContent.replace(/,/g, "")) || 0;
    stat.textContent = (current + delta).toLocaleString();
  }

  container.querySelectorAll(".forum-uni-join-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!isAuthenticated()) {
        showLoginPrompt({
          message: t("auth_modal.desc_default", "Vui lòng đăng nhập để tham gia cộng đồng trường."),
          redirectUrl: window.location.pathname + window.location.search
        });
        return;
      }
      const card = btn.closest(".forum-uni-card");
      const id = card?.dataset.uniId;
      if (!id) return;
      if (btn.classList.contains("joined")) {
        await leaveUniversity(id);
        btn.classList.remove("joined");
        btn.textContent = t("community.join_community", "Join Community");
        updateMemberCount(card, -1);
      } else {
        const res = await joinUniversity(id);
        if (res) {
          const prevJoined = document.querySelector(".forum-uni-join-btn.joined");
          if (prevJoined) updateMemberCount(prevJoined.closest(".forum-uni-card"), -1);
          document.querySelectorAll(".forum-uni-join-btn").forEach(b => {
            b.classList.remove("joined");
            b.textContent = t("community.join_community", "Join Community");
          });
          btn.classList.add("joined");
          btn.textContent = "✓ Joined";
          updateMemberCount(card, 1);
        }
      }
    });
  });

  container.querySelectorAll(".forum-uni-card").forEach(card => {
    card.addEventListener("click", async (e) => {
      if (e.target.closest(".forum-uni-join-btn, .forum-uni-edit-btn, .forum-uni-delete-btn, .forum-uni-members-btn")) return;
      const id = card.dataset.uniId;
      if (!id) return;
      const uni = unis.find(u => String(u.id) === String(id));
      if (!uni) return;
      window.location.href = `./community.html?cat=uni&uniId=${id}&uniName=${encodeURIComponent(uni.name)}`;
    });
  });

  container.querySelectorAll(".forum-uni-members-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const card = btn.closest(".forum-uni-card");
      const id = card?.dataset.uniId;
      if (!id) return;
      const members = await getUniversityMembers(id);
      const uni = unis.find(u => String(u.id) === String(id));
      showUniMembersModal(uni?.name || "Members", members);
    });
  });

  container.querySelectorAll(".forum-uni-edit-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const card = btn.closest(".forum-uni-card");
      const id = card?.dataset.uniId;
      if (!id) return;
      const uni = unis.find(u => String(u.id) === String(id));
      if (!uni) return;
      openUniDialog(uni, async (name, description, color, domains) => {
        const result = await updateUniversity(id, { name, description, color, domains });
        if (result) window.location.reload();
      });
    });
  });

  container.querySelectorAll(".forum-uni-delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const card = btn.closest(".forum-uni-card");
      const id = card?.dataset.uniId;
      if (!id) return;
      const confirmed = await showConfirmDialog({
        titleKey: "common.delete_confirm_title",
        messageKey: "community.delete_uni_confirm",
        confirmTextKey: "common.delete_btn",
        type: "danger"
      });
      if (!confirmed) return;
      const ok = await deleteUni(id);
      if (ok) window.location.reload();
    });
  });
}

/* =============================
   TOPIC GRID
   ============================= */

async function renderTopicGrid() {
  const container = document.getElementById("forumTopicGrid");
  if (!container) return;
  const topics = await getSkillTopics();
  const careerTopics = document.getElementById("careerTopics");
  const category = getCategoryFromURL();
  if (careerTopics && category === "skills") {
    careerTopics.style.display = "";
  }
  if (!topics || topics.length === 0) {
    container.innerHTML = `
      <div class="forum-empty" style="grid-column:1/-1;">
        <span class="material-symbols-outlined forum-empty-icon">school</span>
        <p class="forum-empty-title">${t("community.empty_skill_topics_title")}</p>
        <p class="forum-empty-desc">${t("community.empty_skill_topics_desc")}</p>
      </div>
    `;
    return;
  }
  container.innerHTML = topics
    .map(
      (t) => `
    <div class="forum-topic-card" data-topic="${t.name}" style="cursor:pointer;">
      <div class="forum-topic-icon" style="background: ${t.color}15; color: ${t.color};">
        <span class="material-symbols-outlined text-2xl">${t.icon}</span>
      </div>
      <div class="forum-topic-info">
        <h3 class="forum-topic-name">${t.name}</h3>
        <p class="forum-topic-desc">${t.description}</p>
        <span class="forum-topic-count">${t.discussionCount} discussions</span>
      </div>
    </div>
  `
    )
    .join("");

  container.querySelectorAll(".forum-topic-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const topic = card.dataset.topic;
      if (!topic) return;
      window.location.href = `./community.html?cat=skills&topic=${encodeURIComponent(topic)}`;
    });
  });
}

/* =============================
   UNIVERSITY DIALOG
   ============================= */

let uniDialogCallback = null;
let uniDialogMode = "create";
let uniDialogEditId = null;

function initUniDialog() {
  const overlay = document.getElementById("uniDialog");
  const closeBtn = document.getElementById("uniDialogClose");
  const cancelBtn = document.getElementById("uniDialogCancel");
  const saveBtn = document.getElementById("uniDialogSave");
  const colorPicker = document.getElementById("uniColorPicker");
  const colorHex = document.getElementById("uniColorHex");

  if (!overlay) return;

  function close() {
    overlay.style.display = "none";
    document.body.style.overflow = "";
  }

  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  colorPicker?.addEventListener("input", () => {
    if (colorHex) colorHex.value = colorPicker.value;
  });

  colorHex?.addEventListener("input", () => {
    const val = colorHex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      if (colorPicker) colorPicker.value = val;
    }
  });

  document.querySelectorAll(".forum-uni-color-swatch").forEach(swatch => {
    swatch.addEventListener("click", () => {
      const color = swatch.dataset.color;
      if (colorPicker) colorPicker.value = color;
      if (colorHex) colorHex.value = color;
      document.querySelectorAll(".forum-uni-color-swatch").forEach(s => s.classList.remove("active"));
      swatch.classList.add("active");
    });
  });

  saveBtn?.addEventListener("click", () => {
    const name = document.getElementById("uniName")?.value.trim();
    if (!name) {
      document.getElementById("uniName")?.focus();
      return;
    }
    const description = document.getElementById("uniDescription")?.value.trim() || "";
    const color = document.getElementById("uniColorPicker")?.value || "#3B6FD4";
    const domains = (document.getElementById("uniDomains")?.value || "")
      .split(",").map(d => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
    close();
    if (uniDialogCallback) uniDialogCallback(name, description, color, domains);
    uniDialogCallback = null;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.style.display !== "none") close();
  });
}

import { populateUniversitySelect } from "../api/universities.js";

async function loadSchoolsIntoSelect(selectEl, editData) {
  try {
    await populateUniversitySelect(selectEl, editData?.name);
  } catch (e) {
    selectEl.innerHTML = '<option value="">-- Select university --</option>';
  }
}

function openUniDialog(editData, callback) {
  const overlay = document.getElementById("uniDialog");
  const title = document.getElementById("uniDialogTitle");
  const nameInput = document.getElementById("uniName");
  const descInput = document.getElementById("uniDescription");
  const domainsInput = document.getElementById("uniDomains");
  const colorPicker = document.getElementById("uniColorPicker");
  const colorHex = document.getElementById("uniColorHex");
  if (!overlay) return;

  loadSchoolsIntoSelect(nameInput, editData);

  if (editData) {
    title.textContent = t("community.edit_uni_title");
    nameInput.value = editData.name || "";
    descInput.value = editData.description || "";
    if (domainsInput) domainsInput.value = (editData.domains || []).join(", ");
    const c = editData.color || "#3B6FD4";
    if (colorPicker) colorPicker.value = c;
    if (colorHex) colorHex.value = c;
  } else {
    title.textContent = t("community.add_uni_title");
    nameInput.value = "";
    descInput.value = "";
    if (domainsInput) domainsInput.value = "";
    if (colorPicker) colorPicker.value = "#3B6FD4";
    if (colorHex) colorHex.value = "#3B6FD4";
  }

  document.querySelectorAll(".forum-uni-color-swatch").forEach(s => s.classList.remove("active"));

  uniDialogCallback = callback;
  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";
  setTimeout(() => nameInput?.focus(), 100);
}

/* =============================
   POST MODAL
   ============================= */

/* =============================
   TOAST
   ============================= */

function showToast(message, isError = false) {
  return globalShowToast(message, isError);
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
      <span class="success-toast-heading">Success!</span>
      <span class="success-toast-message">${message}</span>
      ${linkUrl ? `<span class="success-toast-link">${linkText || "View Discussion Detail"}</span>` : ""}
    </div>
    <button class="success-toast-close" type="button" aria-label="Close notification">
      <span class="material-symbols-outlined">close</span>
    </button>
  `;
  document.body.appendChild(toast);
  void toast.offsetWidth;
  requestAnimationFrame(() => toast.classList.add("show"));

  const closeToast = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 600);
  };

  const handleToastClick = () => {
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

  if (linkUrl) {
    toast.addEventListener("click", (e) => {
      if (e.target.closest(".success-toast-close")) return;
      handleToastClick();
    });
    toast.style.cursor = "pointer";
  }

  toast.querySelector(".success-toast-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeToast();
  });

  setTimeout(closeToast, 6000);
}

function initPostModal() {
  const overlay = document.getElementById("forumPostOverlay");
  const backdrop = document.getElementById("forumPostBackdrop");
  const openBtns = document.querySelectorAll("[id='startDiscussionBtn']");
  const closeBtn = document.getElementById("forumPostClose");
  const cancelBtn = document.getElementById("forumPostCancel");
  const categorySelect = document.getElementById("postCategory");
  const postEventCards = document.getElementById("postEventCards");
  const postEventLabel = document.getElementById("postEventLabel");
  const postScopeField = document.getElementById("postScopeField");
  const postImagesInput = document.getElementById("postImages");
  const postImagePreview = document.getElementById("postImagePreview");

  let selectedEventId = null;
  let selectedCertificateCode = null;
  let _selectedEventData = null;
  let closeTimer = null;
  let _allEvents = [];
  let _eventSearchTimeout = null;
  let communityTurnstileWidgetId = null;
  let selectedDiscussionImages = [];
  let previewObjectUrls = [];

  function clearDiscussionImages() {
    previewObjectUrls.forEach(url => URL.revokeObjectURL(url));
    previewObjectUrls = [];
    selectedDiscussionImages = [];
    if (postImagesInput) postImagesInput.value = "";
    if (postImagePreview) postImagePreview.replaceChildren();
  }

  function renderDiscussionImagePreview() {
    if (!postImagePreview) return;
    previewObjectUrls.forEach(url => URL.revokeObjectURL(url));
    previewObjectUrls = [];
    postImagePreview.replaceChildren();

    selectedDiscussionImages.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      previewObjectUrls.push(url);
      const item = document.createElement("div");
      item.className = "forum-post-image-preview-item";

      const image = document.createElement("img");
      image.src = url;
      image.alt = `Selected image ${index + 1}: ${file.name}`;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "forum-post-image-remove";
      removeButton.setAttribute("aria-label", `Remove ${file.name}`);
      removeButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';
      removeButton.addEventListener("click", () => {
        selectedDiscussionImages.splice(index, 1);
        renderDiscussionImagePreview();
      });

      item.append(image, removeButton);
      postImagePreview.append(item);
    });
  }

  postImagesInput?.addEventListener("change", () => {
    const incoming = Array.from(postImagesInput.files || []);
    const imageFiles = incoming.filter(file => file.type.startsWith("image/"));
    if (imageFiles.length !== incoming.length) {
      showToast(t("community.image_only", "Only image files can be attached to a discussion."), true);
    }
    const oversized = imageFiles.find(file => file.size > 10 * 1024 * 1024);
    if (oversized) {
      showToast(t("community.image_size_limit", "Each image must be 10 MB or smaller."), true);
    }
    selectedDiscussionImages = [...selectedDiscussionImages, ...imageFiles.filter(file => file.size <= 10 * 1024 * 1024)].slice(0, 4);
    if (incoming.length + selectedDiscussionImages.length > 4) {
      showToast(t("community.image_count_limit", "You can attach up to 4 images."), true);
    }
    postImagesInput.value = "";
    renderDiscussionImagePreview();
  });

  function renderEventCards(events) {
    if (!postEventCards) return;
    if (!events || events.length === 0) {
      postEventCards.innerHTML = '<div class="forum-post-empty-events">No events found</div>';
      return;
    }
    postEventCards.innerHTML = events.map(e => {
      const parts = (e.date || "").split(" ");
      const isSelected = String(e.id) === String(selectedEventId);
      return `
      <div class="forum-post-event-card ${isSelected ? 'selected' : ''}" data-event-id="${e.id}">
        <div class="forum-post-event-date">
          <span class="forum-post-event-day">${parts[0] || "?"}</span>
          <span class="forum-post-event-month">${parts[1] || ""}</span>
        </div>
        <div class="forum-post-event-info">
          <span class="forum-post-event-title">${e.title}</span>
        </div>
        <span class="forum-post-event-check ${isSelected ? '' : 'hidden'}">
          <span class="material-symbols-outlined text-sm">check_circle</span>
        </span>
      </div>
    `}).join("");

    postEventCards.querySelectorAll(".forum-post-event-card").forEach(card => {
      card.addEventListener("click", () => {
        postEventCards.querySelectorAll(".forum-post-event-card").forEach(c => {
          c.classList.remove("selected");
          c.querySelector(".forum-post-event-check")?.classList.add("hidden");
        });
        card.classList.add("selected");
        card.querySelector(".forum-post-event-check")?.classList.remove("hidden");
        selectedEventId = card.dataset.eventId;
        _selectedEventData = null;
        const ev = _allEvents.find(e => String(e.id) === String(selectedEventId));
        if (ev) _selectedEventData = { title: ev.title, date: ev.date, attendees: ev.attendees || 0 };
      });
    });
  }

  async function loadEventCards() {
    if (!postEventCards) return;
    postEventCards.innerHTML = `<div class="forum-post-loading-events">${t("community.loading_events")}</div>`;
    const events = await getEvents();
    _allEvents = events || [];
    if (!events || events.length === 0) {
      postEventCards.innerHTML = `<div class="forum-post-empty-events">${t("org_profile.no_upcoming")}</div>`;
      return;
    }
    renderEventCards(events.slice(0, 5));
  }

  const eventSearchInput = document.getElementById("postEventSearchInput");
  const postEventSearch = document.getElementById("postEventSearch");
  if (eventSearchInput && postEventSearch) {
    eventSearchInput.addEventListener("input", () => {
      clearTimeout(_eventSearchTimeout);
      _eventSearchTimeout = setTimeout(() => {
        const q = eventSearchInput.value.trim().toLowerCase();
        if (!q) {
          renderEventCards(_allEvents.slice(0, 5));
          return;
        }
        const filtered = _allEvents.filter(e => e.title.toLowerCase().includes(q));
        renderEventCards(filtered);
      }, 150);
    });
  }

  function updateCategoryUI(category, callback) {
    const isEvent = category === "event";

    const categoryPills = document.getElementById("postCategoryPills");
    if (categoryPills) {
      categoryPills.querySelectorAll(".category-select-pill").forEach(p => {
        p.classList.toggle("active", p.dataset.category === category);
      });
    }

    if (postEventCards) postEventCards.style.display = isEvent ? "" : "none";
    if (postEventLabel) {
      postEventLabel.style.display = isEvent ? "" : "none";
      postEventLabel.textContent = t("community.related_event");
    }
    if (postEventSearch) postEventSearch.style.display = isEvent ? "" : "none";

    if (isEvent) {
      if (eventSearchInput) eventSearchInput.value = "";
      loadEventCards().then(() => callback?.());
    }
  }

  if (categorySelect) {
    categorySelect.addEventListener("change", () => updateCategoryUI(categorySelect.value));
  }

  const categoryPills = document.getElementById("postCategoryPills");
  if (categoryPills && categorySelect) {
    categoryPills.querySelectorAll(".category-select-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        categorySelect.value = pill.dataset.category;
        categorySelect.dispatchEvent(new Event("change"));
      });
    });
  }

  async function checkScope() {
    if (!postScopeField) return;
    if (!isAuthenticated()) { postScopeField.style.display = "none"; return; }
    const myUni = await getMyUniversity().catch(() => null);
    const myUniId = myUni?._id || myUni?.id;
    postScopeField.style.display = myUniId ? "" : "none";
  }

  async function checkPostIdentity() {
    const postIdentityField = document.getElementById("postIdentityField");
    const postIdentitySelect = document.getElementById("postIdentitySelect");
    if (!postIdentityField || !postIdentitySelect) return;
    
    if (!isAuthenticated()) {
      postIdentityField.classList.add("hidden");
      return;
    }

    try {
      const data = await getMyOrganizations();
      const orgs = data?.organizations || [];
      const user = getUser();
      const isAdmin = user?.role === "admin";
      const ownerOrgs = orgs.filter(org => isAdmin || org.membershipRole === "owner" || String(org.owner?._id || org.owner) === String(user?._id || user?.id));
      if (ownerOrgs.length > 0) {
        postIdentityField.classList.remove("hidden");
        postIdentitySelect.innerHTML = '<option value="personal">Personal (Me)</option>';
        ownerOrgs.forEach(org => {
          const opt = document.createElement("option");
          opt.value = `org-${org._id}`;
          opt.textContent = `Organization: ${org.name}`;
          postIdentitySelect.appendChild(opt);
        });
      } else {
        postIdentityField.classList.add("hidden");
      }
    } catch (err) {
      console.error("Failed to fetch user organizations for post identity:", err);
      postIdentityField.classList.add("hidden");
    }
  }

  function open(config) {
    if (!isAuthenticated()) {
      showLoginPrompt({
        message: t("auth_modal.desc_post", "Vui lòng đăng nhập để đăng bài và thảo luận cùng cộng đồng."),
        redirectUrl: window.location.pathname + window.location.search
      });
      return;
    }
    const user = getUser();
    if (user && !isProfileComplete(user)) {
      showProfileModal();
      return;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    selectedEventId = null;
    selectedCertificateCode = config?.certificateCode || null;
    _selectedEventData = null;
    clearDiscussionImages();
    checkScope();
    checkPostIdentity();
    overlay.style.display = "flex";
    requestAnimationFrame(() => {
      overlay.classList.add("active");
    });
    document.body.style.overflow = "hidden";

    if (typeof turnstile !== "undefined") {
      const container = document.getElementById("community-turnstile-container");
      if (container) {
        if (communityTurnstileWidgetId !== null) {
          turnstile.reset(communityTurnstileWidgetId);
        } else {
          communityTurnstileWidgetId = turnstile.render(container, {
            sitekey: TURNSTILE_SITE_KEY,
            theme: "light",
          });
        }
      }
    }

    let cat = config?.category || categorySelect?.value || "general";
    if (config?.eventTitle) {
      cat = "event";
      if (categorySelect) categorySelect.value = "event";
      updateCategoryUI(cat, () => {
        const cards = postEventCards?.querySelectorAll(".forum-post-event-card");
        if (cards) {
          for (const card of cards) {
            const titleEl = card.querySelector(".forum-post-event-title");
            if (titleEl && titleEl.textContent.trim() === config.eventTitle) {
              card.click();
              break;
            }
          }
        }
      });
    } else {
      if (config?.eventId) {
        selectedEventId = config.eventId;
        cat = "event";
        if (categorySelect) categorySelect.value = "event";
      }
      updateCategoryUI(cat);
    }
    if (config?.title) {
      const titleInput = document.getElementById("postTitle");
      if (titleInput) titleInput.value = config.title;
    }
    if (config?.content) {
      const contentInput = document.getElementById("postContent");
      if (contentInput) contentInput.value = config.content;
    }
    if (config?.tags) {
      const tagsInput = document.getElementById("postTags");
      if (tagsInput) tagsInput.value = Array.isArray(config.tags) ? config.tags.join(", ") : config.tags;
    }
    checkScope();
  }
  window.openPostModal = open;

  function close() {
    overlay.classList.remove("active");
    closeTimer = setTimeout(() => {
      overlay.style.display = "none";
    }, 300);
    document.body.style.overflow = "";
  }

  openBtns.forEach((btn) => {
    if (btn) btn.addEventListener("click", () => {
      const cat = getCategoryFromURL();
      open({ category: cat === "event" ? "event" : "general" });
    });
  });
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);

  const publishBtn = document.getElementById("forumPostPublish");
  if (publishBtn) {
    publishBtn.addEventListener("click", async () => {
      const user = getUser();
      if (user && user.emailVerified === false) {
        showToast(t("community.verify_email_post", "Please verify your email before posting. Check your inbox or resend the verification."), true);
        return;
      }
      if (!requireVerifiedOrRedirect()) return;

      const titleInput = document.getElementById("postTitle");
      const contentInput = document.getElementById("postContent");
      const title = sanitizeHtml(titleInput?.value.trim() || "");
      const content = sanitizeHtml(contentInput?.value.trim() || "");

      if (!title && !content) {
        showToast(t("community.title_content_required", "Please enter both a title and content for your discussion."), true);
        titleInput?.focus();
        return;
      }

      if (!title) {
        showToast(t("community.title_required", "Please enter a title for your discussion."), true);
        titleInput?.focus();
        return;
      }

      if (!content) {
        showToast(t("community.content_required", "Please enter the content for your discussion."), true);
        contentInput?.focus();
        return;
      }

      const check = canPerformAction('createDiscussion');
      if (!check.allowed) {
        showToast(t("community.wait_before_post", { seconds: check.remaining }, `Please wait ${check.remaining} seconds before posting another discussion.`), true);
        return;
      }

      publishBtn.disabled = true;
      try {
        const category = categorySelect?.value || "general";
        const tagsInput = document.getElementById("postTags")?.value || "";
        const tags = tagsInput ? tagsInput.split(",").map(t => sanitizeHtml(t.trim())).filter(Boolean) : [];

        let relatedEvent = undefined;
        if (category === "event" && selectedEventId) relatedEvent = selectedEventId;

        const scopeEl = document.querySelector('input[name="scope"]:checked');
        const scope = scopeEl?.value === "community" ? "community" : "general";
        let communityId = undefined;
        if (scope === "community") {
          const myUni = await getMyUniversity().catch(() => null);
          communityId = myUni?._id || myUni?.id;
        }

        const identitySelect = document.getElementById("postIdentitySelect");
        const identityVal = identitySelect?.value || "personal";
        const postAsOrg = identityVal.startsWith("org-");
        const orgId = postAsOrg ? identityVal.replace("org-", "") : undefined;

        const result = await createDiscussionWithScope({
          title, content, category, tags, relatedEvent,
          certificateCode: selectedCertificateCode || undefined,
          images: selectedDiscussionImages,
          scope, communityId,
          cfTurnstileResponse: (typeof turnstile !== "undefined" && communityTurnstileWidgetId !== null)
            ? turnstile.getResponse(communityTurnstileWidgetId) : undefined,
          postAsOrg,
          orgId,
        }).catch((err) => {
          showToast(err?.message || "Failed to post discussion. Please try again.", true);
          return null;
        });

        if (!result) return;

        // Mark action performed only after successful publication
        markActionPerformed('createDiscussion');

        // Check if any badges were unlocked during this specific action
        if (result?.newBadges && Array.isArray(result.newBadges) && result.newBadges.length > 0) {
          result.newBadges.forEach((badgeKey) => {
            addBadgeNotification(badgeKey, badgeKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
            triggerBadgeCelebration(badgeKey);
          });
        }

        const u = getUser();
        result.author = result.author || result.authorName || u?.fullname || u?.username || "Unknown";
        if (!result.avatar) {
          result.avatar = result.author[0].toUpperCase();
        }
        result.university = result.postAsOrg ? "Organization" : (u?.university || u?.school || "");
        result.lastActivity = "Just now";
        result.preview = content.substring(0, 150) + (content.length > 150 ? "..." : "");
        result.tags = tags;
        result.replies = 0;
        result.views = 0;

        if (category === "event" && relatedEvent) {
          result.relatedEvent = relatedEvent;
          if (_selectedEventData) result._event = { ..._selectedEventData };
        }
        if (result._event) {
          try {
            result._storedAt = Date.now();
            const stored = JSON.parse(localStorage.getItem("springwave_event_discussions") || "[]");
            const idx = stored.findIndex(d => (d.id || d._id) === (result.id || result._id));
            if (idx === -1) stored.unshift(result);
            else stored[idx] = result;
            localStorage.setItem("springwave_event_discussions", JSON.stringify(stored));
          } catch {}
        }

        close();
        document.getElementById("postTitle").value = "";
        document.getElementById("postContent").value = "";
        document.getElementById("postTags").value = "";
        clearDiscussionImages();
        selectedEventId = null;
        selectedCertificateCode = null;

        const currentCat = getCategoryFromURL();

        if (Array.isArray(window._currentDiscussions)) {
          window._currentDiscussions.unshift(result);
        }

        if (Array.isArray(window._currentDiscussions)) {
          renderDiscussions(window._currentDiscussions, currentCat, 1);
        }

        const discId = result._id || result.id;
        showSuccessToast("Discussion posted successfully! Click here to view", discId ? `./community.html?discussion=${discId}` : null, "View Discussion Detail");

        const uniId = communityId || document.querySelector(".forum-uni-join-btn.joined")?.closest(".forum-uni-card")?.dataset.uniId;
        if (uniId) {
          const uniCard = document.querySelector(`.forum-uni-card[data-uni-id="${uniId}"]`);
          const discStats = uniCard?.querySelectorAll(".forum-uni-stat-value");
          const discStat = discStats?.[1];
          if (discStat) {
            const current = parseInt(discStat.textContent.replace(/,/g, "")) || 0;
            discStat.textContent = (current + 1).toLocaleString();
          }
        }
      } finally {
        publishBtn.disabled = false;
        if (typeof turnstile !== "undefined" && communityTurnstileWidgetId !== null) {
          turnstile.reset(communityTurnstileWidgetId);
        }
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });
}

/* =============================
   EVENT DETAIL POPUP
   ============================= */





function showUniMembersModal(uniName, members) {
  const existing = document.getElementById("uniMembersModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "uniMembersModal";
  modal.className = "fixed inset-0 z-50 flex items-center justify-center";
  modal.style.background = "rgba(0,0,0,0.6)";
  modal.innerHTML = `
    <div class="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl mx-4">
      <div class="flex items-center justify-between p-5 border-b border-slate-200">
        <h3 class="text-lg font-semibold text-slate-800">${t("community.uni_members_title", { name: uniName })}</h3>
        <button class="text-slate-400 hover:text-slate-600 text-2xl leading-none" id="uniMembersClose">&times;</button>
      </div>
      <div class="p-4 overflow-y-auto max-h-[55vh]">
        ${members.length === 0
          ? `<p class="text-slate-500 text-center py-8">${t("community.no_members_yet")}</p>`
          : members.map(m => `
            <div class="flex items-center gap-3 py-3 px-2 hover:bg-slate-50 rounded-lg">
              <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                ${(m.fullname || m.username || '?').charAt(0).toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-800 truncate">${m.fullname || m.username || 'Unknown'}</p>
                <p class="text-xs text-slate-500 truncate">${m.major || m.school || ''}</p>
              </div>
            </div>
          `).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.querySelector("#uniMembersClose")?.addEventListener("click", () => modal.remove());
  document.addEventListener("keydown", function closeOnEsc(e) {
    if (e.key === "Escape") { modal.remove(); document.removeEventListener("keydown", closeOnEsc); }
  });
}

function initDiscussionPopupClose() {
  const overlay = document.getElementById("discussionPopupOverlay");
  const backdrop = document.getElementById("discussionPopupBackdrop");
  if (!overlay) return;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || backdrop?.contains(e.target)) closeDiscussionDetail();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hasAttribute("hidden")) closeDiscussionDetail();
  });
}

async function renderOrgGrid() {
  const container = document.getElementById("forumOrgGrid");
  if (!container) return;
  if (!container.children.length) {
    container.innerHTML = buildOrgSkeletonHTML(6);
  }
  
  let orgsData = null;
  let loadError = null;
  try {
    orgsData = await getPublicOrganizations();
  } catch (err) {
    loadError = err;
    console.error("Failed to load public organizations:", err);
  }

  const orgSection = document.getElementById("organizations-section");
  const category = getCategoryFromURL();
  if (orgSection && category === "org") {
    orgSection.style.display = "";
  }

  if (loadError) {
    container.innerHTML = `
      <div class="forum-empty text-center py-10" style="grid-column:1/-1;">
        <span class="material-symbols-outlined forum-empty-icon text-red-500" style="font-size:48px;">error</span>
        <p class="forum-empty-title text-base font-semibold text-[#191b22] mt-2">${t("community.failed_load_orgs", "Không thể tải danh sách tổ chức")}</p>
        <p class="forum-empty-desc text-xs text-[#64748b] mt-1 mb-4">${loadError.message || t("community.try_again_later", "Vui lòng thử lại sau.")}</p>
        <button id="retryLoadOrgsBtn" class="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all inline-flex items-center gap-1.5">
          <span class="material-symbols-outlined text-sm">refresh</span> ${t("common.retry", "Thử lại")}
        </button>
      </div>
    `;
    document.getElementById("retryLoadOrgsBtn")?.addEventListener("click", () => renderOrgGrid());
    return;
  }

  const orgs = orgsData?.organizations || [];

  if (!orgs || orgs.length === 0) {
    container.innerHTML = `
      <div class="forum-empty" style="grid-column:1/-1;">
        <span class="material-symbols-outlined forum-empty-icon">groups</span>
        <p class="forum-empty-title">${t("community.no_orgs_found_title")}</p>
        <p class="forum-empty-desc">${t("community.no_orgs_found_desc")}</p>
      </div>
    `;
    return;
  }

  // Render cards immediately with lightweight event placeholder
  container.innerHTML = orgs.map(org => {
    const avatarUrl = org.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(org.name)}`;
    return `
      <div class="bg-white rounded-3xl border border-[#ecedfa] shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col justify-between" data-org-id="${org._id}">
        <div>
          <!-- Header info -->
          <div class="flex items-start gap-4 mb-4">
            <img src="${avatarUrl}" class="w-14 h-14 rounded-2xl object-cover border border-[#ecedfa] bg-[#f8f9fc]" alt="${org.name}" />
            <div class="min-w-0 flex-grow">
              <h3 class="font-bold text-[#191b22] text-base truncate hover:text-primary transition-colors cursor-pointer" onclick="window.location.href='/org-profile.html?orgId=${org._id}'">${org.name}</h3>
              <p class="text-xs text-[#64748b] flex items-center gap-1 mt-0.5">
                <span class="material-symbols-outlined text-[12px] text-primary">groups</span>
                <span class="followers-count font-semibold">${org.followersCount || 0}</span> ${t("org_profile.followers").toLowerCase()}
              </p>
            </div>
          </div>
          <!-- Description -->
          <p class="text-xs text-[#64748b] line-clamp-2 mb-4 h-8">${org.description || t("community.no_description")}</p>
          
          <!-- Upcoming Events -->
          <div class="mb-4">
            <h4 class="text-xs font-bold text-[#191b22] mb-2 flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px] text-primary">event</span>
              <span id="org-events-title-${org._id}">${t("org_profile.upcoming")}</span>
            </h4>
            <div class="space-y-2" id="org-events-list-${org._id}">
              <div class="h-9 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center">
                <span class="text-[10px] text-gray-400 italic">${t("common.loading", "Đang tải...")}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Follow CTA -->
        <div class="pt-2 border-t border-[#ecedfa] flex items-center justify-between gap-3">
          <a href="/org-profile.html?orgId=${org._id}" class="px-3 py-2 rounded-xl bg-[#f8f9fc] hover:bg-[#ecedfa] border border-[#ecedfa] text-xs font-semibold text-[#191b22] text-center flex-1 transition-colors">
            ${t("user.profile")}
          </a>
          <button class="follow-org-btn px-3 py-2 rounded-xl text-xs font-bold text-center flex-1 transition-all ${org.isFollowing ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-primary text-white hover:bg-primary/90'}" data-org-id="${org._id}">
            ${org.isFollowing ? '✓ ' + t("org_profile.following_btn") : t("org_profile.follow_btn")}
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Add click listeners to Follow buttons
  container.querySelectorAll(".follow-org-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!isAuthenticated()) {
        showLoginPrompt({
          message: t("auth_modal.desc_follow", "Vui lòng đăng nhập để theo dõi tổ chức."),
          redirectUrl: window.location.pathname + window.location.search
        });
        return;
      }
      const orgId = btn.dataset.orgId;
      if (!orgId) return;

      btn.disabled = true;
      try {
        const result = await toggleFollowOrganization(orgId);
        if (result.isFollowing) {
          btn.textContent = "✓ " + t("org_profile.following_btn");
          btn.className = "follow-org-btn px-3 py-2 rounded-xl text-xs font-bold text-center flex-1 transition-all bg-gray-100 text-gray-500 hover:bg-gray-200";
        } else {
          btn.textContent = t("org_profile.follow_btn");
          btn.className = "follow-org-btn px-3 py-2 rounded-xl text-xs font-bold text-center flex-1 transition-all bg-primary text-white hover:bg-primary/90";
        }

        const card = container.querySelector(`[data-org-id="${orgId}"]`);
        if (card) {
          const counter = card.querySelector(".followers-count");
          if (counter) counter.textContent = result.followerCount;
        }
      } catch (err) {
        showToast(err.message || t("community.failed_update_follow", "Failed to update follow status."), true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Smoothly load organization events in background with bounded concurrency pool
  loadOrgEventsWithPool(orgs, 3).catch(() => {});
}

async function loadOrgEventsWithPool(orgList, limit = 3) {
  let index = 0;
  async function worker() {
    while (index < orgList.length) {
      const org = orgList[index++];
      try {
        const resp = await getOrganizationPublicEvents(org._id, 1);
        const events = resp?.events || [];
        const isPast = events.length > 0 && new Date(events[0].heldDate || events[0].createdAt) < new Date();
        const titleEl = document.getElementById(`org-events-title-${org._id}`);
        if (titleEl) {
          titleEl.textContent = events.length === 0 ? t("org_profile.upcoming") : (isPast ? t("community.latest_events") : t("org_profile.upcoming"));
        }
        const listEl = document.getElementById(`org-events-list-${org._id}`);
        if (listEl) {
          if (events.length > 0) {
            listEl.innerHTML = events.map(e => `
              <div class="flex items-center justify-between text-xs p-2 rounded-lg bg-[#f8f9fc] border border-[#ecedfa] hover:border-primary/30 transition-colors">
                <div class="min-w-0 flex-grow pr-2">
                  <p class="font-semibold text-[#191b22] truncate">${e.title}</p>
                  <p class="text-[10px] text-[#64748b] flex items-center gap-1 mt-0.5">
                    <span class="material-symbols-outlined text-[10px]">calendar_today</span>
                    ${formatDate(e.heldDate)}
                  </p>
                </div>
                <button type="button" onclick="openEventPopup('${e._id}')" class="text-[10px] text-primary font-bold hover:underline shrink-0 flex items-center gap-0.5">
                  ${t("common.detail", "Details")} <span class="material-symbols-outlined text-[10px]">chevron_right</span>
                </button>
              </div>
            `).join("");
          } else {
            listEl.innerHTML = `<p class="text-xs text-[#94a3b8] italic text-center py-2">${t("org_profile.no_events")}</p>`;
          }
        }
      } catch {
        const listEl = document.getElementById(`org-events-list-${org._id}`);
        if (listEl) {
          listEl.innerHTML = `<p class="text-xs text-[#94a3b8] italic text-center py-2">${t("org_profile.no_events")}</p>`;
        }
      }
    }
  }
  const poolSize = Math.min(limit, orgList.length);
  const workers = Array.from({ length: poolSize }, () => worker());
  await Promise.all(workers);
}

if (typeof window !== "undefined") {
  window.addEventListener("language-changed", () => {
    const category = getCategoryFromURL();
    setActiveCategory(category);
    updatePageTitle(category);
    showSections(category);
    if (category === "org") {
      renderOrgGrid().catch(() => {});
    } else if (category === "uni" && !new URLSearchParams(window.location.search).get("uniId")) {
      renderUniGrid().catch(() => {});
    } else if (window._currentDiscussions) {
      renderDiscussions(window._currentDiscussions, category);
      renderPopularDiscussions(window._currentDiscussions, category);
    }
    loadSidebar(category).catch(() => {});
  });
}
