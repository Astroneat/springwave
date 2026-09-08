import "../../src/style.css";
import { loadNavbar } from "../components/navbar.js";
import { fetchContent, formatDate } from "../lib/utils.js";
import { showNoticeBox } from "../components/noticeBox.js";
import { getUser, isAuthenticated } from "../lib/session.js";
import { get } from "../api/client.js";
import { searchActivities } from "../api/activities.js";
import { t, getLang } from "../lib/i18n.js";
import { HERO_SLIDES } from "../config/heroSlides.js";

document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar({ activeSection: "home" });
  await loadFooter();
  initNavbarScroll();
  initScrollReveal();
  initSmoothScroll();
  checkAutoVerificationNotice();
  initFAQAccordion();
  initFinalCta();

  // Redesign 2.0 Dynamic Integrations
  initHeroSlider();
  initLiveStats();
  initLiveTicker();
  initEventHub();
  initThreePillars();

  window.addEventListener("language-changed", () => {
    loadEventHubTab(currentEventTab);
  });
});

function checkAutoVerificationNotice() {
  const showFlag = sessionStorage.getItem("show_auto_verified_notice");
  const user = getUser();
  if (!user || !user.isStudentVerified) {
    sessionStorage.removeItem("show_auto_verified_notice");
    return;
  }

  if (showFlag === "true") {
    sessionStorage.removeItem("show_auto_verified_notice");
    showNoticeBox({
      id: `auto_school_verification_${user._id}`,
      message: 'verification.schoolEmailVerified',
      type: 'success',
      once: true
    });
  }
}

async function loadFooter() {
  const html = await fetchContent("./components/footer.html");
  const container = document.getElementById("footer-container");
  if (container) container.innerHTML = html;
}

function initNavbarScroll() {
  const nav = document.getElementById("navbar");
  const hint = document.getElementById("navbar-hint");
  if (!nav) return;

  let mouseNearTop = false;
  let hintDismissed = false;
  const HOVER_THRESHOLD = 100;

  const update = () => {
    const dropdownOpen = !!document.querySelector(".user-menu.active") || !!document.querySelector("#notif-dropdown.active");
    const navVisible = dropdownOpen || window.scrollY > 50 || mouseNearTop;
    if (navVisible) {
      nav.classList.remove("navbar-hidden");
      hintDismissed = true;
    } else {
      nav.classList.add("navbar-hidden");
    }
    if (hint) {
      hint.classList.toggle("visible", navVisible ? false : !hintDismissed);
    }
  };

  let ticking = false;
  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    }
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("mousemove", (e) => {
    const near = e.clientY <= HOVER_THRESHOLD;
    if (near !== mouseNearTop) {
      mouseNearTop = near;
      requestUpdate();
    }
  }, { passive: true });
  document.addEventListener("click", (e) => {
    const clickOutsideUserMenu = !e.target.closest(".user-menu");
    const clickOutsideNotifDropdown = !e.target.closest("#notif-dropdown");
    if (clickOutsideUserMenu && clickOutsideNotifDropdown) {
      mouseNearTop = e.clientY <= HOVER_THRESHOLD;
      requestUpdate();
    }
  });
}

function initScrollReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
  );

  els.forEach((el) => observer.observe(el));
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

// ----------------------------------------------------
// HERO BACKGROUND SLIDESHOW (Auto-playing CDN Images)
// ----------------------------------------------------
function initHeroSlider() {
  const sliderWrap = document.getElementById("hero-slider-wrap");
  const dotsContainer = document.getElementById("hero-slider-dots");
  const heroSection = document.getElementById("hero");

  if (!sliderWrap) return;

  if (!Array.isArray(HERO_SLIDES) || HERO_SLIDES.length === 0) {
    if (dotsContainer) dotsContainer.style.display = "none";
    return;
  }

  sliderWrap.innerHTML = "";
  if (dotsContainer) dotsContainer.innerHTML = "";

  let currentIndex = 0;
  let timer = null;
  let isPaused = false;
  const INTERVAL_MS = 6000;

  // Build slides dynamically from image URLs
  HERO_SLIDES.forEach((item, idx) => {
    const imgUrl = typeof item === "string" ? item : (item?.url || "");
    if (!imgUrl) return;

    const slideEl = document.createElement("div");
    slideEl.className = `hero-slide${idx === 0 ? " active" : ""}`;
    slideEl.setAttribute("data-slide-index", idx);

    const img = document.createElement("img");
    img.className = "hero-slide-img";
    img.src = imgUrl;
    img.alt = `SpringWave Background ${idx + 1}`;
    if (idx === 0) {
      img.loading = "eager";
      img.fetchPriority = "high";
    } else {
      img.loading = "lazy";
    }
    img.onerror = () => {
      img.style.display = "none";
    };

    slideEl.appendChild(img);
    sliderWrap.appendChild(slideEl);

    // Create dot indicator if multiple slides exist
    if (dotsContainer && HERO_SLIDES.length > 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `hero-dot${idx === 0 ? " active" : ""}`;
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", `Chuyển tới ảnh nền ${idx + 1}`);
      dot.setAttribute("aria-selected", idx === 0 ? "true" : "false");
      dot.addEventListener("click", (e) => {
        e.preventDefault();
        goToSlide(idx);
        restartTimer();
      });
      dotsContainer.appendChild(dot);
    }
  });

  // If only 1 slide, hide dots
  if (HERO_SLIDES.length <= 1) {
    if (dotsContainer) dotsContainer.style.display = "none";
    return;
  }

  const goToSlide = (newIndex) => {
    const slides = sliderWrap.querySelectorAll(".hero-slide");
    const dots = dotsContainer ? dotsContainer.querySelectorAll(".hero-dot") : [];

    if (slides[currentIndex]) slides[currentIndex].classList.remove("active");
    if (dots[currentIndex]) {
      dots[currentIndex].classList.remove("active");
      dots[currentIndex].setAttribute("aria-selected", "false");
    }

    currentIndex = (newIndex + HERO_SLIDES.length) % HERO_SLIDES.length;

    if (slides[currentIndex]) slides[currentIndex].classList.add("active");
    if (dots[currentIndex]) {
      dots[currentIndex].classList.add("active");
      dots[currentIndex].setAttribute("aria-selected", "true");
    }
  };

  const nextSlide = () => goToSlide(currentIndex + 1);

  const startTimer = () => {
    stopTimer();
    timer = setInterval(() => {
      if (!isPaused) {
        nextSlide();
      }
    }, INTERVAL_MS);
  };

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const restartTimer = () => {
    stopTimer();
    startTimer();
  };

  // Pause on hover or focus for accessibility
  if (heroSection) {
    heroSection.addEventListener("mouseenter", () => { isPaused = true; });
    heroSection.addEventListener("mouseleave", () => { isPaused = false; });
    heroSection.addEventListener("focusin", () => { isPaused = true; });
    heroSection.addEventListener("focusout", () => { isPaused = false; });
  }

  // Respect user preference for reduced motion
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!mediaQuery.matches) {
    startTimer();
  }
}

// ----------------------------------------------------
// 1. LIVE STATS COUNTERS
// ----------------------------------------------------
async function initLiveStats() {
  const statEventsEl = document.getElementById("stat-events-val");
  const statClubsEl = document.getElementById("stat-clubs-val");
  const statStudentsEl = document.getElementById("stat-students-val");
  const statUniversitiesEl = document.getElementById("stat-universities-val");

  try {
    const [eventsRes, orgsRes, communityRes] = await Promise.all([
      get("/events/search/all?limit=1").catch(() => null),
      get("/organizations").catch(() => null),
      get("/community/stats").catch(() => null)
    ]);

    const totalEvents = eventsRes?.total || 150;
    const totalClubs = Array.isArray(orgsRes) ? orgsRes.length : (orgsRes?.organizations?.length || 45);
    const totalStudents = communityRes?.students || 12000;
    const totalUniversities = communityRes?.universities || 10;

    const setupCounter = (el, val, suffix = "+") => {
      if (!el) return;
      let hasAnimated = false;
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !hasAnimated) {
          hasAnimated = true;
          animateNumber(el, val, suffix);
          observer.disconnect();
        }
      }, { threshold: 0.2 });
      observer.observe(el);
    };

    setupCounter(statEventsEl, totalEvents, "+");
    setupCounter(statClubsEl, totalClubs, "+");
    setupCounter(statStudentsEl, totalStudents, "+");
    setupCounter(statUniversitiesEl, totalUniversities, "+");
  } catch (err) {
    console.warn("Failed to fetch live stats:", err);
    if (statEventsEl) statEventsEl.textContent = "150+";
    if (statClubsEl) statClubsEl.textContent = "45+";
    if (statStudentsEl) statStudentsEl.textContent = "12,000+";
    if (statUniversitiesEl) statUniversitiesEl.textContent = "10+";
  }
}

function animateNumber(element, target, suffix = "+") {
  const duration = 1200;
  const startTime = performance.now();
  const startValue = 0;

  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(startValue + (target - startValue) * easeOut);
    element.textContent = current.toLocaleString() + suffix;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = target.toLocaleString() + suffix;
    }
  };

  requestAnimationFrame(update);
}

// ----------------------------------------------------
// 2. LIVE TICKER STRIP
// ----------------------------------------------------
async function initLiveTicker() {
  const track = document.getElementById("live-ticker-track");
  if (!track) return;

  try {
    const now = new Date().toISOString();
    const res = await searchActivities({
      heldDateFrom: now,
      sortBy: "heldDate",
      sortOrder: "ASC",
      limit: 6
    });

    const activities = res.activities || res.events || [];
    if (!activities.length) {
      const fallbackRes = await searchActivities({ limit: 5, sortBy: "heldDate", sortOrder: "DESC" });
      const fallbackList = fallbackRes.activities || fallbackRes.events || [];
      if (fallbackList.length) {
        renderTickerItems(track, fallbackList);
      }
      return;
    }

    renderTickerItems(track, activities);
  } catch (err) {
    console.warn("Failed to populate live ticker:", err);
  }
}

function renderTickerItems(track, items) {
  const fragment = document.createDocumentFragment();
  const displayItems = [...items, ...items];

  displayItems.forEach((item) => {
    const link = document.createElement("a");
    link.className = "ticker-item";
    link.href = `/explore.html?event=${item.activityID || item._id}`;

    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined text-xs text-blue-400";
    icon.textContent = "event";

    const titleStrong = document.createElement("strong");
    titleStrong.textContent = item.title;

    const dateSpan = document.createElement("span");
    dateSpan.textContent = formatDate(item.heldDate, false);

    const dot = document.createElement("span");
    dot.className = "ticker-item-dot";
    dot.textContent = "●";

    link.appendChild(icon);
    link.appendChild(titleStrong);
    link.appendChild(document.createTextNode(" • "));
    link.appendChild(dateSpan);

    fragment.appendChild(link);
    fragment.appendChild(dot);
  });

  track.innerHTML = "";
  track.appendChild(fragment);
}

// ----------------------------------------------------
// ----------------------------------------------------
// 3. EVENT HUB SECTION
// ----------------------------------------------------
let currentEventTab = "upcoming";
const eventCache = {};

function getCategoryName(category) {
  if (!category) return "";
  const name = category.name || "";
  const lang = getLang();

  const normalized = (category.slug || name).toLowerCase().trim().replace(/[^a-z0-9]/g, "");

  const categoryMap = {
    technology: { vi: "Công nghệ", en: "Technology" },
    tech: { vi: "Công nghệ", en: "Technology" },
    congnghe: { vi: "Công nghệ", en: "Technology" },
    sport: { vi: "Thể thao", en: "Sports" },
    sports: { vi: "Thể thao", en: "Sports" },
    thethao: { vi: "Thể thao", en: "Sports" },
    music: { vi: "Âm nhạc", en: "Music" },
    amnhac: { vi: "Âm nhạc", en: "Music" },
    education: { vi: "Giáo dục", en: "Education" },
    giaoduc: { vi: "Giáo dục", en: "Education" },
    volunteering: { vi: "Tình nguyện", en: "Volunteering" },
    volunteer: { vi: "Tình nguyện", en: "Volunteering" },
    tinhnguyen: { vi: "Tình nguyện", en: "Volunteering" },
    social: { vi: "Xã hội", en: "Social" },
    socialactivity: { vi: "Xã hội", en: "Social" },
    xahoi: { vi: "Xã hội", en: "Social" },
    art: { vi: "Nghệ thuật", en: "Arts" },
    arts: { vi: "Nghệ thuật", en: "Arts" },
    nghethuat: { vi: "Nghệ thuật", en: "Arts" },
    workshop: { vi: "Workshop", en: "Workshop" },
    seminar: { vi: "Hội thảo", en: "Seminar" },
    hoithao: { vi: "Hội thảo", en: "Seminar" }
  };

  const match = categoryMap[normalized];
  if (match) {
    return lang === "vi" ? match.vi : match.en;
  }
  return name;
}

function initEventHub() {
  const tabButtons = document.querySelectorAll(".event-tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === currentEventTab) return;
      tabButtons.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentEventTab = tab;
      loadEventHubTab(tab);
    });
  });

  loadEventHubTab(currentEventTab);
}

async function loadEventHubTab(tab, forceReload = false) {
  const container = document.getElementById("event-hub-container");
  if (!container) return;

  if (!forceReload && eventCache[tab]) {
    if (!eventCache[tab].length) {
      renderEventHubEmptyState(container, tab);
    } else {
      renderEventHubCards(container, eventCache[tab], tab);
    }
    return;
  }

  container.innerHTML = `
    <div class="event-empty-box">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-3"></div>
      <p class="text-slate-500 text-sm">${t("index.events_loading", {}, "Đang tải danh sách sự kiện...")}</p>
    </div>
  `;

  try {
    const now = new Date().toISOString();
    let activities = [];

    if (tab === "upcoming") {
      const res = await searchActivities({
        heldDateFrom: now,
        sortBy: "heldDate",
        sortOrder: "ASC",
        limit: 6
      });
      activities = res.activities || res.events || [];
    } else if (tab === "past") {
      const res = await searchActivities({
        heldDateTo: now,
        sortBy: "heldDate",
        sortOrder: "DESC",
        limit: 6
      });
      activities = res.activities || res.events || [];
    } else if (tab === "ongoing") {
      const res = await searchActivities({
        sortBy: "heldDate",
        sortOrder: "DESC",
        limit: 20
      });
      const all = res.activities || res.events || [];
      const nowDate = new Date();
      activities = all.filter((ev) => {
        if (!ev.heldDate) return false;
        const start = new Date(ev.heldDate);
        const end = ev.heldDateEnd ? new Date(ev.heldDateEnd) : new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return start <= nowDate && end >= nowDate;
      }).slice(0, 6);
    }

    eventCache[tab] = activities;

    if (!activities.length) {
      renderEventHubEmptyState(container, tab);
      return;
    }

    renderEventHubCards(container, activities, tab);
  } catch (err) {
    console.error(`Failed to load events for tab ${tab}:`, err);
    container.innerHTML = `
      <div class="event-empty-box">
        <span class="material-symbols-outlined event-empty-icon text-red-400">error</span>
        <p class="text-slate-700 font-bold mb-1">${t("index.events_error_title", {}, "Không thể tải danh sách sự kiện")}</p>
        <p class="text-slate-500 text-xs mb-4">${t("index.events_error_desc", {}, "Vui lòng kiểm tra kết nối mạng và thử lại.")}</p>
        <button class="px-4 py-2 text-xs font-bold rounded-full bg-blue-600 text-white" onclick="window.location.reload()">${t("index.events_retry", {}, "Thử lại")}</button>
      </div>
    `;
  }
}

function renderEventHubCards(container, activities, tab) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  activities.forEach((ev) => {
    const card = document.createElement("a");
    card.className = "event-hub-card";
    card.href = `/explore.html?event=${ev.activityID || ev._id}`;

    // Thumbnail
    const coverWrap = document.createElement("div");
    coverWrap.className = "event-card-cover-wrap";

    const img = document.createElement("img");
    img.className = "event-card-cover";
    img.alt = ev.title || "Event Cover";
    img.loading = "lazy";
    img.src = ev.thumbnail || "/assets/images/banner-landscape-pixelart.png";
    img.onerror = () => {
      img.src = "/assets/images/banner-landscape-pixelart.png";
    };
    coverWrap.appendChild(img);

    // Badges on cover
    const badgesTop = document.createElement("div");
    badgesTop.className = "event-card-badges-top";

    const statusPill = document.createElement("span");
    if (tab === "upcoming") {
      statusPill.className = "event-status-pill open";
      statusPill.textContent = t("index.event_status_open", {}, "Đang mở đơn");
    } else if (tab === "ongoing") {
      statusPill.className = "event-status-pill ongoing";
      statusPill.textContent = t("index.event_status_ongoing", {}, "Đang diễn ra");
    } else {
      statusPill.className = "event-status-pill ended";
      statusPill.textContent = t("index.event_status_ended", {}, "Đã kết thúc");
    }
    badgesTop.appendChild(statusPill);

    if (ev.category && ev.category.name) {
      const catPill = document.createElement("span");
      catPill.className = "event-category-pill";

      const iconStr = (ev.category.icon || "").trim();
      let iconEl;
      if (iconStr.includes("fa-") || iconStr.startsWith("fa")) {
        iconEl = document.createElement("i");
        iconEl.className = iconStr;
      } else if (iconStr) {
        iconEl = document.createElement("span");
        iconEl.className = "material-symbols-outlined text-xs";
        iconEl.textContent = iconStr;
      } else {
        iconEl = document.createElement("i");
        iconEl.className = "fa-solid fa-tag";
      }

      if (ev.category.color) {
        iconEl.style.color = ev.category.color;
      }

      catPill.appendChild(iconEl);

      const catName = document.createElement("span");
      catName.textContent = getCategoryName(ev.category);
      catPill.appendChild(catName);

      badgesTop.appendChild(catPill);
    }
    coverWrap.appendChild(badgesTop);
    card.appendChild(coverWrap);

    // Body
    const body = document.createElement("div");
    body.className = "event-card-body";

    const title = document.createElement("h3");
    title.className = "event-card-title";
    title.textContent = ev.title;
    body.appendChild(title);

    // Host info
    const hostRow = document.createElement("div");
    hostRow.className = "event-card-host";

    const hostNameText = ev.organization?.name || ev.hostName || t("index.event_host_default", {}, "Ban Tổ Chức");

    let hostAvatar;
    if (ev.organization?.avatar) {
      hostAvatar = document.createElement("img");
      hostAvatar.className = "event-host-avatar";
      hostAvatar.src = ev.organization.avatar;
      hostAvatar.alt = hostNameText;
      hostAvatar.loading = "lazy";
      hostAvatar.onerror = () => {
        const iconWrap = document.createElement("div");
        iconWrap.className = "event-host-avatar event-host-avatar-icon";
        iconWrap.innerHTML = `<span class="material-symbols-outlined">corporate_fare</span>`;
        if (hostAvatar.parentNode) {
          hostAvatar.parentNode.replaceChild(iconWrap, hostAvatar);
        }
      };
    } else {
      hostAvatar = document.createElement("div");
      hostAvatar.className = "event-host-avatar event-host-avatar-icon";
      hostAvatar.innerHTML = `<span class="material-symbols-outlined">corporate_fare</span>`;
    }

    const hostName = document.createElement("span");
    hostName.className = "event-host-name";
    hostName.textContent = hostNameText;

    hostRow.appendChild(hostAvatar);
    hostRow.appendChild(hostName);
    body.appendChild(hostRow);

    // Metadata list
    const metaList = document.createElement("div");
    metaList.className = "event-card-meta-list";

    // Date
    const dateRow = document.createElement("div");
    dateRow.className = "event-meta-row";
    dateRow.innerHTML = `<span class="material-symbols-outlined">calendar_today</span> <span>${formatDate(ev.heldDate, false)}</span>`;
    metaList.appendChild(dateRow);

    // Location
    const locRow = document.createElement("div");
    locRow.className = "event-meta-row";
    const locText = ev.location || (ev.isNonPartner ? t("index.event_location_online", {}, "Trực tuyến") : t("index.event_location_campus", {}, "Cơ sở ĐH"));
    locRow.innerHTML = `<span class="material-symbols-outlined">location_on</span> <span title="${escapeHtml(locText)}">${escapeHtml(locText)}</span>`;
    metaList.appendChild(locRow);

    body.appendChild(metaList);

    // Card Action
    const action = document.createElement("div");
    action.className = "event-card-action";
    action.innerHTML = `<span>${t("index.event_view_details", {}, "Xem chi tiết")}</span><span class="material-symbols-outlined text-sm">arrow_forward</span>`;
    body.appendChild(action);

    card.appendChild(body);
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

function renderEventHubEmptyState(container, tab) {
  let msg = t("index.event_no_upcoming", {}, "Hiện chưa có sự kiện nào sắp mở đơn mới. Bạn hãy quay lại sau nhé!");
  if (tab === "ongoing") {
    msg = t("index.event_no_ongoing", {}, "Hôm nay không có sự kiện nào đang diễn ra trực tiếp. Khám phá các sự kiện sắp tới nhé!");
  } else if (tab === "past") {
    msg = t("index.event_no_past", {}, "Chưa có sự kiện nào trong danh sách đã kết thúc.");
  }

  container.innerHTML = `
    <div class="event-empty-box">
      <span class="material-symbols-outlined event-empty-icon">event_busy</span>
      <p class="text-slate-700 font-bold mb-1">${msg}</p>
      <p class="text-slate-500 text-xs mb-4">${t("index.event_empty_desc", {}, "Các sự kiện và hoạt động mới được ban tổ chức cập nhật liên tục mỗi ngày.")}</p>
      <a href="/explore.html" class="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors">
        <span>${t("index.view_all_events", {}, "Xem tất cả sự kiện")}</span>
        <span class="material-symbols-outlined text-sm">arrow_forward</span>
      </a>
    </div>
  `;
}

// ----------------------------------------------------
// 4. THREE PILLARS (CLUB LOGO STRIP)
// ----------------------------------------------------
async function initThreePillars() {
  const strip = document.getElementById("org-logo-strip");
  if (!strip) return;

  try {
    const res = await get("/organizations");
    const orgs = Array.isArray(res) ? res : (res.organizations || []);

    if (!orgs.length) {
      strip.innerHTML = `<span class="text-xs text-slate-400">Đang liên kết các CLB & Đoàn Hội...</span>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    orgs.slice(0, 8).forEach((org) => {
      const followersLabel = t("index.members_followers", {}, "thành viên/theo dõi");
      const titleText = `${org.name} (${org.followersCount || 0} ${followersLabel})`;

      if (org.avatar) {
        const img = document.createElement("img");
        img.className = "org-logo-item";
        img.src = org.avatar;
        img.alt = org.name;
        img.title = titleText;
        img.loading = "lazy";
        img.onerror = () => {
          const iconWrap = document.createElement("div");
          iconWrap.className = "org-logo-item flex items-center justify-center bg-blue-50 text-blue-600";
          iconWrap.title = titleText;
          iconWrap.innerHTML = `<span class="material-symbols-outlined text-lg">corporate_fare</span>`;
          if (img.parentNode) {
            img.parentNode.replaceChild(iconWrap, img);
          }
        };
        fragment.appendChild(img);
      } else {
        const iconWrap = document.createElement("div");
        iconWrap.className = "org-logo-item flex items-center justify-center bg-blue-50 text-blue-600";
        iconWrap.title = titleText;
        iconWrap.innerHTML = `<span class="material-symbols-outlined text-lg">corporate_fare</span>`;
        fragment.appendChild(iconWrap);
      }
    });

    strip.innerHTML = "";
    strip.appendChild(fragment);
  } catch (err) {
    console.warn("Failed to fetch organizations for pillars strip:", err);
    strip.innerHTML = `<span class="text-xs text-slate-400">45+ CLB đối tác từ các trường ĐH</span>`;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initFAQAccordion() {
  const faqHeaders = document.querySelectorAll(".faq-header");

  faqHeaders.forEach(header => {
    header.addEventListener("click", () => {
      const item = header.closest(".faq-item");
      const content = header.nextElementSibling;
      const isActive = item.classList.contains("active");

      // Close all other FAQ items for accordian style
      document.querySelectorAll(".faq-item").forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove("active");
          const otherHeader = otherItem.querySelector(".faq-header");
          if (otherHeader) {
            otherHeader.setAttribute("aria-expanded", "false");
          }
          const otherContent = otherItem.querySelector(".faq-content");
          if (otherContent) {
            otherContent.style.maxHeight = null;
          }
        }
      });

      if (isActive) {
        item.classList.remove("active");
        header.setAttribute("aria-expanded", "false");
        content.style.maxHeight = null;
      } else {
        item.classList.add("active");
        header.setAttribute("aria-expanded", "true");
        content.style.maxHeight = content.scrollHeight + "px";
      }
    });
  });
}

function initFinalCta() {
  const btn = document.getElementById("finalCtaBtn");
  if (!btn) return;
  if (isAuthenticated()) {
    btn.href = "/explore.html";
  } else {
    btn.href = "/login.html";
  }
}
