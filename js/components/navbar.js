import { isAuthenticated, getUser, setUser, logout, isStudentVerified } from "../lib/session.js";
import { getNotifications, getUnreadCount, markRead, markAllRead, startNotificationPolling, stopNotificationPolling } from "../lib/notifications.js";
import { fetchContent } from "../lib/utils.js";
import { initI18n, setLang, getLang, t, applyTranslation } from "../lib/i18n.js";
import { initPageTransition } from "./pageLoader.js";
import { initBadgeCelebration, syncOfflineBadgeNotifications, BADGE_DEFINITIONS } from "./badgeCelebration.js";
import { showToast } from "./toast.js";
import { enhanceAllSelects } from "./customCombobox.js";

export function populateUserChip(user, activeSection) {
    if (!user) return;
    const avatarImg = document.querySelector(".user-avatar-img");
    const avatarInitial = document.getElementById("user-avatar-initial");
    const dropdownAvatarImg = document.querySelector(".dropdown-avatar-img");
    const dropdownAvatarInitial = document.querySelector(".dropdown-avatar-initial");
    const userInitial = (user.username || user.fullname || user.email || "U").charAt(0).toUpperCase();

    if (user.avatar) {
        if (avatarImg) { avatarImg.src = user.avatar; avatarImg.style.display = ""; }
        if (avatarInitial) avatarInitial.style.display = "none";
        if (dropdownAvatarImg) { dropdownAvatarImg.src = user.avatar; dropdownAvatarImg.style.display = ""; }
        if (dropdownAvatarInitial) dropdownAvatarInitial.style.display = "none";
    } else {
        if (avatarImg) avatarImg.style.display = "none";
        if (avatarInitial) { avatarInitial.textContent = userInitial; avatarInitial.style.display = ""; }
        if (dropdownAvatarImg) dropdownAvatarImg.style.display = "none";
        if (dropdownAvatarInitial) { dropdownAvatarInitial.textContent = userInitial; dropdownAvatarInitial.style.display = ""; }
    }

    const usernameEl = document.getElementById("dropdown-username");
    const emailEl = document.getElementById("dropdown-email");
    const roleEl = document.getElementById("dropdown-role-badge");

    if (usernameEl) usernameEl.textContent = user.fullname || user.username || "User";
    if (emailEl) emailEl.textContent = user.email || "";
    if (roleEl) {
        if (user.role === 'admin') {
            roleEl.textContent = t("user.role_admin") || "Admin";
            roleEl.className = "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 uppercase tracking-wider";
        } else if (user.role === 'host') {
            roleEl.textContent = t("user.role_host") || "Host / Organizer";
            roleEl.className = "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider";
        } else if (isStudentVerified(user)) {
            roleEl.textContent = t("user.role_verified_student") || "Verified Student";
            roleEl.className = "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-wider";
        } else {
            roleEl.textContent = t("user.role_student") || "Student";
            roleEl.className = "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider";
        }
    }

    const pageLabelEl = document.getElementById("chip-active-page-label");
    if (pageLabelEl) {
        const sectionName = activeSection || getSectionFromPath();
        pageLabelEl.textContent = getSectionTitle(sectionName);
    }

    const adminDashboardBtn = document.getElementById("admin-dashboard-btn");
    if (adminDashboardBtn) {
        adminDashboardBtn.style.display = user?.role === "admin" ? "" : "none";
    }
}

function getGuestChipHTML(activeSection) {
    const sec = activeSection || getSectionFromPath();
    const title = getSectionTitle(sec);
    return `
        <div class="hidden md:flex items-center gap-2">
            <a href="/login.html" class="figma-navbar-login-btn flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition spring-ease" data-i18n="nav.login_btn">
                <span data-i18n="nav.login">${t("nav.login") || "Login"}</span>
                <img src="/assets/images/icon-login.svg" alt="Login Icon" class="w-4 h-4" />
            </a>
        </div>
        <div class="md:hidden user-menu guest-menu">
            <button type="button" class="user-chip" id="user-chip" aria-label="Navigation & Account Menu" aria-haspopup="true" aria-expanded="false" aria-controls="user-dropdown">
                <div class="user-avatar" id="user-avatar" aria-hidden="true">
                    <span class="material-symbols-outlined text-base text-primary">person</span>
                </div>
                <span class="chip-active-page font-extrabold text-xs text-[#1c274c] truncate max-w-[85px] sm:max-w-[110px]" id="chip-active-page-label">${title}</span>
                <i class="fa-solid fa-chevron-down text-[10px] text-[#1c274c]/70 transition-transform duration-300" aria-hidden="true"></i>
            </button>
            <div class="user-dropdown" id="user-dropdown" role="menu" aria-label="User account menu">
                <div class="px-3 pt-2 pb-3 mb-2 border-b border-slate-100/80">
                    <p class="text-sm font-bold text-slate-800" data-i18n="user.welcome_title">${t("user.welcome_title") || "Welcome to SpringWave"}</p>
                    <p class="text-xs text-slate-500" data-i18n="user.welcome_subtitle">${t("user.welcome_subtitle") || "Sign in to unlock all features"}</p>
                </div>
                <div class="dropdown-nav-group border-b border-slate-100/80 pb-2 mb-2">
                    <div class="px-3 py-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider" data-i18n="user.navigation">${t("user.navigation") || "Navigation"}</div>
                    <a href="/index.html" class="dropdown-item" data-section="home">
                        <i class="fa-solid fa-house"></i>
                        <span data-i18n="nav.home">${t("nav.home") || "Home"}</span>
                        <span class="ml-auto w-1.5 h-1.5 rounded-full bg-primary active-dot hidden"></span>
                    </a>
                    <a href="/explore.html" class="dropdown-item" data-section="explore">
                        <i class="fa-solid fa-compass"></i>
                        <span data-i18n="nav.explore">${t("nav.explore") || "Explore"}</span>
                        <span class="ml-auto w-1.5 h-1.5 rounded-full bg-primary active-dot hidden"></span>
                    </a>
                    <a href="/community.html" class="dropdown-item" data-section="community">
                        <i class="fa-solid fa-comments"></i>
                        <span data-i18n="nav.community">${t("nav.community") || "Community"}</span>
                        <span class="ml-auto w-1.5 h-1.5 rounded-full bg-primary active-dot hidden"></span>
                    </a>
                    <a href="/quiz.html" class="dropdown-item" data-section="quiz">
                        <i class="fa-solid fa-brain"></i>
                        <span data-i18n="index.hero_take_quiz">${t("index.hero_take_quiz") || "AI Quiz"}</span>
                        <span class="ml-auto w-1.5 h-1.5 rounded-full bg-primary active-dot hidden"></span>
                    </a>
                    <a href="/about.html" class="dropdown-item" data-section="about">
                        <i class="fa-solid fa-circle-info"></i>
                        <span data-i18n="nav.about">${t("nav.about") || "About Us"}</span>
                        <span class="ml-auto w-1.5 h-1.5 rounded-full bg-primary active-dot hidden"></span>
                    </a>
                </div>
                <div class="dropdown-tools-group pb-2 mb-2 border-b border-slate-100/80">
                    <button class="dropdown-item" id="dropdown-mobile-lang-btn">
                        <i class="fa-solid fa-language"></i>
                        <span><span data-i18n="common.language">${t("common.language") || "Language"}</span>: <strong id="dropdown-lang-code" class="text-primary font-extrabold">${getLang().toUpperCase()}</strong></span>
                    </button>
                </div>
                <div class="flex flex-col gap-2 pt-1">
                    <a href="/login.html" class="w-full py-2 px-3 rounded-xl bg-primary text-white text-center font-bold text-xs shadow-sm hover:bg-primary/90 transition text-decoration-none">
                        <span data-i18n="nav.login">${t("nav.login") || "Login"}</span>
                    </a>
                    <a href="/register.html" class="w-full py-2 px-3 rounded-xl bg-slate-100 text-slate-700 text-center font-bold text-xs hover:bg-slate-200 transition text-decoration-none">
                        <span data-i18n="login.register_now">${t("login.register_now") || "Register"}</span>
                    </a>
                </div>
            </div>
        </div>
    `;
}

export async function loadNavbar({ activeSection } = {}) {
    try {
        initPageTransition();
    } catch (e) {}

    const navbarContainer = document.getElementById("navbar-container");
    const cachedNav = sessionStorage.getItem("cached_navbar_html");
    const cachedUserChip = sessionStorage.getItem("cached_userchip_html");
    if (navbarContainer && cachedNav && !navbarContainer.innerHTML.trim()) {
        navbarContainer.innerHTML = cachedNav;
        const authSection = document.getElementById("auth-section");
        const bellIcon = document.getElementById("bell-icon");

        if (authSection) {
            if (isAuthenticated()) {
                const user = getUser();
                if (cachedUserChip) {
                    authSection.innerHTML = cachedUserChip;
                    populateUserChip(user, activeSection);
                    initUserDropdown();
                }
                if (bellIcon) {
                    bellIcon.classList.remove("hidden");
                    bellIcon.classList.add("flex");
                }
            } else {
                authSection.innerHTML = getGuestChipHTML(activeSection);
                initUserDropdown();
                if (bellIcon) { bellIcon.classList.add("hidden"); bellIcon.classList.remove("flex"); }
            }
            updateHostBtn();
        }
        setActiveLink(activeSection);
    }

    if (isAuthenticated()) {
        try {
            const { getCurrentUser } = await import("../api/auth.js");
            const res = await getCurrentUser();
            if (res && res.user) {
                setUser(res.user);
            }
        } catch (err) {
            console.warn("Sync session on navbar load failed:", err);
        }

        try {
            const { initVerificationGuard } = await import("./verificationGuard.js");
            initVerificationGuard();
        } catch (e) {}
    }

    const html = await fetchContent("/components/navbar.html");
    if (html && navbarContainer) {
        navbarContainer.innerHTML = html;
        sessionStorage.setItem("cached_navbar_html", html);
    }

    setActiveLink(activeSection);

    const authSection = document.getElementById("auth-section");
    const bellIcon = document.getElementById("bell-icon");
    if (authSection) {
        if (isAuthenticated()) {
            const user = getUser();
            const userChipHTML = await fetchContent("/components/userchip.html");
            if (userChipHTML) {
                authSection.innerHTML = userChipHTML;
                sessionStorage.setItem("cached_userchip_html", userChipHTML);
                populateUserChip(user, activeSection);
            }

            initUserDropdown();
            if (bellIcon) {
                bellIcon.classList.remove("hidden");
                bellIcon.classList.add("flex");
            }
            initNotifications();

            window.addEventListener("avatar-updated", (e) => {
                const avatarUrl = e.detail?.avatar;
                if (avatarUrl) {
                    const avatarImg = document.querySelector(".user-avatar-img");
                    const dropdownAvatarImg = document.querySelector(".dropdown-avatar-img");
                    if (avatarImg) { avatarImg.src = avatarUrl; avatarImg.style.display = ""; }
                    if (dropdownAvatarImg) { dropdownAvatarImg.src = avatarUrl; dropdownAvatarImg.style.display = ""; }
                }
            });
        } else {
            authSection.innerHTML = getGuestChipHTML(activeSection);
            initUserDropdown();
            if (bellIcon) { bellIcon.classList.add("hidden"); bellIcon.classList.remove("flex"); }
        }
        updateHostBtn();
    }

    await initI18n();
    initLangSwitcher();
    initSlidingIndicator();
    initBadgeCelebration();
    enhanceAllSelects();

    return document.getElementById("navbar");
}

export function initBasicScroll() {
    const navbar = document.getElementById("navbar");
    if (!navbar) return;
    let ticking = false;
    window.addEventListener("scroll", () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(() => {
                navbar.classList.toggle("collapsed", window.scrollY > 60);
                ticking = false;
            });
        }
    }, { passive: true });
}

export function getSectionFromPath() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("explore")) return "explore";
    if (path.includes("community")) return "community";
    if (path.includes("about")) return "about";
    if (path.includes("profile")) return "profile";
    if (path.includes("my-events")) return "my-events";
    if (path.includes("roadmap")) return "roadmap";
    if (path.includes("org-dashboard")) return "org-dashboard";
    if (path.includes("admin")) return "admin";
    return "home";
}

export function getSectionTitle(sec) {
    switch (sec) {
        case "explore": return t("nav.explore") || "Explore";
        case "community": return t("nav.community") || "Community";
        case "about": return t("nav.about") || "About Us";
        case "profile": return t("user.profile") || "Profile";
        case "my-events": return t("user.my_events") || "My Events";
        case "roadmap": return t("user.roadmap") || "Roadmap";
        case "quiz": return t("index.hero_take_quiz") || "AI Quiz";
        case "org-dashboard": return t("user.host_dashboard") || "Dashboard";
        case "admin": return t("admin.dashboard") || "Admin";
        default: return t("nav.home") || "Home";
    }
}

export function setActiveLink(section) {
    const sec = section || getSectionFromPath();
    const navLinks = document.querySelectorAll(".nav-links a, .figma-navbar-link, .dropdown-item[data-section]");
    navLinks.forEach(link => {
        link.classList.remove("active");
        if (link.dataset.section === sec) {
            link.classList.add("active");
        }
    });

    const pageLabelEl = document.getElementById("chip-active-page-label");
    if (pageLabelEl) {
        pageLabelEl.textContent = getSectionTitle(sec);
    }
}

/* =========================
   NAVBAR TOAST
   ========================= */

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function showNavbarToast({ message, tone = "info", durationMs = 4000 }) {
    showToast(message, tone, durationMs);
}

/* =========================
   USER DROPDOWN
   ========================= */

function updateHostBtn() {
    const u = getUser();
    const isHost = u?.role === 'host';
    const isAdmin = u?.role === 'admin';

    const desktopBtn = document.getElementById("desktop-become-host-btn");
    if (desktopBtn && (isHost || isAdmin)) {
        desktopBtn.style.display = "none";
    }

    // Hosts and admins get a direct Host Dashboard link; admins keep "Become a Host" hidden
    const hostDashboardBtn = document.getElementById("host-dashboard-btn");
    if (hostDashboardBtn && (isHost || isAdmin)) {
        hostDashboardBtn.style.display = "";
        // Resolve the org id once so the link goes directly to the user's organization
        import("../api/host.js").then(({ getMyHostStatus }) => {
            getMyHostStatus().then((data) => {
                const url = data?.orgId ? `/org-dashboard.html?orgId=${data.orgId}` : "/org-dashboard.html";
                hostDashboardBtn.setAttribute("href", url);
            }).catch(() => {
                // Fallback to plain dashboard if status lookup fails
                hostDashboardBtn.setAttribute("href", "/org-dashboard.html");
            });
        }).catch(() => {
            hostDashboardBtn.setAttribute("href", "/org-dashboard.html");
        });
    }
}

function prefetchProfileData() {
    if (!isAuthenticated()) return;
    const user = getUser();
    if (!user) return;
    const userId = user._id || user.id || 'guest';
    const contribStorageKey = `springwave_contrib_${userId}`;
    const countsStorageKey = `springwave_counts_${userId}`;

    import("../api/user.js").then(({ getUserContribution, getFavourites, getMyTickets }) => {
        Promise.allSettled([
            getUserContribution(),
            getFavourites(),
            getMyTickets()
        ]).then(([cRes, fRes, tRes]) => {
            if (cRes.status === "fulfilled" && cRes.value?.contribution) {
                localStorage.setItem(contribStorageKey, JSON.stringify(cRes.value.contribution));
            }
            let curCounts = { favoritesCount: 0, participationsCount: 0, hostedEventsCount: 0 };
            try {
                const s = localStorage.getItem(countsStorageKey);
                if (s) curCounts = { ...curCounts, ...JSON.parse(s) };
            } catch {}
            if (fRes.status === "fulfilled" && fRes.value?.activities) {
                curCounts.favoritesCount = fRes.value.activities.length;
            }
            if (tRes.status === "fulfilled" && tRes.value?.tickets) {
                const checked = (tRes.value.tickets || []).filter(t => t.ticketStatus === 'checked_in' && t.event && t.event.organization);
                curCounts.participationsCount = checked.length;
            }
            localStorage.setItem(countsStorageKey, JSON.stringify(curCounts));
        }).catch(() => {});
    }).catch(() => {});
}

function initUserDropdown() {
    const userMenu = document.querySelector(".user-menu");
    const userChip = document.getElementById("user-chip");
    const logoutBtn = document.getElementById("logout-btn");
    if (!userMenu || !userChip) return;

    // Prefetch on hover before user clicks
    userChip.addEventListener("mouseenter", prefetchProfileData, { once: true });

    const setUserMenuOpen = (open) => {
        userMenu.classList.toggle("active", open);
        userChip.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
            prefetchProfileData();
            const notif = document.getElementById("notif-dropdown");
            if (notif) {
                notif.classList.remove("active");
                document.getElementById("bell-icon")?.setAttribute("aria-expanded", "false");
            }
            // Move focus into the dropdown for keyboard users
            const firstItem = userMenu.querySelector(".dropdown-item, button, a[href]");
            if (firstItem && typeof firstItem.focus === "function") {
                firstItem.focus();
            }
        }
    };

    userChip.addEventListener("click", (e) => {
        e.stopPropagation();
        setUserMenuOpen(!userMenu.classList.contains("active"));
    });

    userChip.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setUserMenuOpen(true);
        } else if (e.key === "Escape" && userMenu.classList.contains("active")) {
            e.preventDefault();
            setUserMenuOpen(false);
            userChip.focus();
        }
    });

    document.addEventListener("click", (e) => {
        if (!userMenu.contains(e.target) && e.target !== userChip) {
            setUserMenuOpen(false);
        }
    });
    userMenu.addEventListener("click", (e) => e.stopPropagation());

    // Arrow-key navigation inside the dropdown
    const items = () => Array.from(userMenu.querySelectorAll(".dropdown-item, button:not(.dropdown-item), a[href]"))
        .filter(el => el.offsetParent !== null && !el.hasAttribute("disabled"));
    userMenu.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setUserMenuOpen(false);
            userChip.focus();
            return;
        }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
        const list = items();
        if (!list.length) return;
        const currentIndex = list.indexOf(document.activeElement);
        let nextIndex = currentIndex;
        if (e.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % list.length;
        if (e.key === "ArrowUp") nextIndex = currentIndex <= 0 ? list.length - 1 : currentIndex - 1;
        if (e.key === "Home") nextIndex = 0;
        if (e.key === "End") nextIndex = list.length - 1;
        e.preventDefault();
        list[nextIndex].focus();
    });

    logoutBtn?.addEventListener("click", () => {
        logout();
        window.location.href = "/login.html";
    });

    const desktopHostBtn = document.getElementById("desktop-become-host-btn");
    if (desktopHostBtn) {
        desktopHostBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (!isAuthenticated()) {
                const { showLoginPrompt } = await import("./authModal.js");
                showLoginPrompt({
                    message: t("auth_modal.desc_default", "Vui lòng đăng nhập để đăng ký làm Host sự kiện."),
                    redirectUrl: "/register-host.html"
                });
                return;
            }
            const u = getUser();
            // Hosts and admins use the dedicated Host Dashboard link instead
            if (u?.role === 'host' || u?.role === 'admin') return;
            try {
                const { getMyHostStatus } = await import("../api/host.js");
                const data = await getMyHostStatus();
                if (data.status === 'approved') {
                    // Approved but role not yet set — go to the dashboard
                    const url = data.orgId ? `/org-dashboard.html?orgId=${data.orgId}` : "/org-dashboard.html";
                    window.location.href = url;
                    return;
                }
                if (data.status === 'pending') {
                    showNavbarToast({
                        message: t("navbar.host_pending_review", "Your host registration is pending review. Please wait for approval."),
                        tone: "warning",
                        durationMs: 5000
                    });
                    return;
                }
            } catch {}
            if (!u?.dob || !u?.school || !u?.class || !u?.major || !u?.phoneNo) {
                showNavbarToast({
                    message: t("navbar.complete_profile_before_host", "Complete your profile (Date of birth, School, Class, Major, Phone) before registering as a Host."),
                    tone: "warning",
                    durationMs: 6000
                });
                setTimeout(() => { window.location.href = "/profile.html"; }, 1200);
            } else {
                window.location.href = "/register-host.html";
            }
        });
    }

    const favBtn = document.getElementById("favourites-btn");
    favBtn?.addEventListener("click", async (e) => {
        e.stopPropagation();
        userMenu.classList.remove("active");
        const { showFavouritesGlobal } = await import("./favourites.js");
        showFavouritesGlobal();
    });

    const verifyBtn = document.getElementById("verify-student-btn");
    if (verifyBtn) {
        const u = getUser();
        verifyBtn.style.display = (u && !isStudentVerified(u)) ? "flex" : "none";
        verifyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            userMenu.classList.remove("active");
            window.location.href = "/student-verify.html";
        });
    }
}

/* =========================
   NOTIFICATIONS
   ========================= */

function initNotifications() {
    renderNotifCount();
    renderNotifDropdown();

    const bell = document.getElementById("bell-icon");
    const dropdown = document.getElementById("notif-dropdown");
    if (!bell || !dropdown) return;

    startNotificationPolling();
    syncOfflineBadgeNotifications();

    const setNotifOpen = (open) => {
        dropdown.classList.toggle("active", open);
        bell.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) {
            syncOfflineBadgeNotifications();
            const userMenu = document.querySelector(".user-menu");
            if (userMenu) {
                userMenu.classList.remove("active");
                document.getElementById("user-chip")?.setAttribute("aria-expanded", "false");
            }
        }
    };

    bell.addEventListener("click", (e) => {
        e.stopPropagation();
        setNotifOpen(!dropdown.classList.contains("active"));
    });

    bell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setNotifOpen(!dropdown.classList.contains("active"));
        } else if (e.key === "Escape" && dropdown.classList.contains("active")) {
            e.preventDefault();
            setNotifOpen(false);
            bell.focus();
        }
    });

    document.addEventListener("click", (e) => {
        if (!dropdown.contains(e.target) && e.target !== bell && !bell.contains(e.target)) {
            dropdown.classList.remove("active");
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            syncOfflineBadgeNotifications();
        }
    });

    window.addEventListener("notifications-updated", () => {
        renderNotifCount();
        renderNotifDropdown();
    });
}

function renderNotifCount() {
    const count = getUnreadCount();
    const el = document.getElementById("bell-count");
    if (!el) return;
    if (count > 0) {
        el.textContent = count > 9 ? "9+" : count;
        el.classList.remove("hidden");
    } else {
        el.classList.add("hidden");
    }
}

function renderNotifDropdown() {
    const dropdown = document.getElementById("notif-dropdown");
    if (!dropdown) return;

    const all = getNotifications();

    if (all.length === 0) {
        dropdown.innerHTML = `
            <div class="notif-dropdown-menu">
                <div class="notif-empty">
                    <span class="material-symbols-outlined notif-empty-icon">notifications_none</span>
                    <span data-i18n="user.no_notifications">No notifications yet</span>
                </div>
            </div>
        `;
        applyTranslation(dropdown);
        return;
    }

    const unreadCount = all.filter((n) => !n.read).length;

    function getNotifIcon(type) {
        switch (type) {
            case 'comment_like': return 'thumb_up';
            case 'reply': return 'reply';
            case 'new_comment': return 'chat_bubble';
            case 'new_discussion': return 'forum';
            case 'event_review': return 'rate_review';
            case 'event_ended': return 'event_busy';
            case 'certificate_issued': return 'workspace_premium';
            case 'badge': return 'military_tech';
            default: return 'notifications';
        }
    }

    function getNotifLink(n) {
        if (n.type === 'certificate_issued') {
            const param = n.eventId ? `?rate=${encodeURIComponent(n.eventId)}` : (n.certificateCode ? `?code=${encodeURIComponent(n.certificateCode)}` : '');
            return `/my-events.html${param}`;
        }
        if (n.type === 'event_ended') {
            return n.eventId ? `/explore.html?id=${encodeURIComponent(n.eventId)}` : '/my-events.html';
        }
        if (n.type === 'badge') {
            return n.badgeKey ? `/profile.html#badge-${encodeURIComponent(n.badgeKey)}` : '/profile.html#badges-section';
        }
        if (n.discussionId) {
            let url = `/community.html?discussion=${encodeURIComponent(n.discussionId)}`;
            if (n.commentId) url += `&comment=${encodeURIComponent(n.commentId)}`;
            return url;
        }
        return '#';
    }

    dropdown.innerHTML = `
        <div class="notif-dropdown-menu">
            <div class="notif-header">
                <span class="notif-header-title" data-i18n="user.notifications">Notifications</span>
                ${unreadCount > 0 ? `<button class="notif-mark-all" id="notif-mark-all" data-i18n="user.mark_all_read">Mark all read</button>` : ""}
            </div>
            <div class="notif-list">
                ${all.map((n) => {
                    const isBadge = n.type === 'badge';
                    const iconClass = isBadge ? "notif-item-icon badge-notif" : `notif-item-icon ${n.read ? "" : "unread"}`;
                    let displayMsg = n.message;
                    if (isBadge && n.badgeKey) {
                        const badgeDef = BADGE_DEFINITIONS.find(b => b.key === n.badgeKey);
                        const fallbackLabel = badgeDef ? badgeDef.label : (n.badgeLabel || n.badgeKey);
                        const localizedBadge = t(`badges.list.${n.badgeKey}.label`, fallbackLabel);
                        displayMsg = t("user.badge_earned_msg", { badge: localizedBadge });
                    }
                    return `
                    <div class="notif-item ${n.read ? "" : "unread"}" data-notif-id="${n.id}">
                        <div class="${iconClass}">
                            <span class="material-symbols-outlined">${getNotifIcon(n.type)}</span>
                        </div>
                        <div class="notif-item-body">
                            <span class="notif-item-msg">${displayMsg}</span>
                            <span class="notif-item-time">${timeAgo(n.createdAt)}</span>
                        </div>
                        ${n.read ? "" : '<span class="notif-unread-dot"></span>'}
                    </div>
                `;}).join("")}
            </div>
        </div>
    `;
    applyTranslation(dropdown);

    dropdown.querySelectorAll(".notif-item").forEach((item) => {
        item.addEventListener("click", () => {
            const id = item.dataset.notifId;
            if (id) {
                const n = all.find((x) => x.id === id);
                if (n) {
                    markRead(id);
                    if (n.type === 'certificate_issued') {
                        if (n.certificateCode) {
                            window.location.href = `/certificate.html?code=${encodeURIComponent(n.certificateCode)}`;
                        } else {
                            window.location.href = '/my-events.html';
                        }
                    } else if (n.type === 'event_ended') {
                        if (n.eventId) {
                            window.location.href = `/explore.html?id=${encodeURIComponent(n.eventId)}`;
                        } else {
                            window.location.href = '/my-events.html';
                        }
                    } else if (n.type === 'event_review' && n.eventId) {
                        import('./reviewModal.js').then(m => m.openReviewModal(n.eventId, n.message));
                    } else if (n.type === 'badge') {
                        const targetBadgeKey = n.badgeKey;
                        const link = targetBadgeKey ? `/profile.html#badge-${targetBadgeKey}` : '/profile.html#badges-section';
                        if (window.location.pathname.includes("profile.html")) {
                            window.location.hash = targetBadgeKey ? `badge-${targetBadgeKey}` : 'badges-section';
                            let targetEl = targetBadgeKey ? document.querySelector(`.badge-card[data-badge-key="${targetBadgeKey}"]`) : null;
                            if (!targetEl) targetEl = document.getElementById("badges-section");
                            if (targetEl) {
                                targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
                                if (targetEl.classList.contains("badge-card")) {
                                    targetEl.classList.add("ring-4", "ring-primary/60", "shadow-2xl", "scale-[1.04]", "transition-all", "duration-500");
                                    setTimeout(() => {
                                        targetEl.classList.remove("ring-4", "ring-primary/60", "shadow-2xl", "scale-[1.04]");
                                    }, 3000);
                                }
                            }
                        } else {
                            window.location.href = link;
                        }
                    } else if (n.discussionId) {
                        const link = getNotifLink(n);
                        if (window.location.pathname.includes("community.html")) {
                            window.history.pushState({}, "", link);
                            if (typeof window.scrollToAndOpenDiscussion === "function") {
                                window.scrollToAndOpenDiscussion(n.discussionId, n.commentId);
                            } else if (typeof window.openDiscussionDetail === "function") {
                                window.openDiscussionDetail(n.discussionId, n.commentId);
                            } else {
                                window.location.href = link;
                            }
                        } else {
                            window.location.href = link;
                        }
                    } else {
                        const link = getNotifLink(n);
                        if (link && link !== '#') window.location.href = link;
                    }
                }
            }
        });
    });

    const markAllBtn = document.getElementById("notif-mark-all");
    if (markAllBtn) {
        markAllBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            markAllRead();
        });
    }
}

function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("user.just_now");
    if (mins < 60) return t("user.m_ago", { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("user.h_ago", { n: hrs });
    const days = Math.floor(hrs / 24);
    return t("user.d_ago", { n: days });
}

function initLangSwitcher() {
    const btn = document.getElementById("langSwitcher");
    const label = document.getElementById("langLabel");
    const dropdownLangBtn = document.getElementById("dropdown-mobile-lang-btn");
    const dropdownLangCode = document.getElementById("dropdown-lang-code");
    
    const updateLabel = () => {
        const lang = getLang().toUpperCase();
        if (label) label.textContent = lang;
        if (dropdownLangCode) dropdownLangCode.textContent = lang;
        setActiveLink();
        if (isAuthenticated()) {
            populateUserChip(getUser());
            renderNotifDropdown();
        }
    };
    updateLabel();
    
    const toggleLang = (e) => {
        if (e) e.stopPropagation();
        const next = getLang() === "en" ? "vi" : "en";
        setLang(next).then(updateLabel);
    };
    
    btn?.addEventListener("click", toggleLang);
    dropdownLangBtn?.addEventListener("click", toggleLang);
    window.addEventListener("language-changed", updateLabel);
}

function initSlidingIndicator() {
    const menu = document.getElementById("navLinks");
    if (!menu) return;

    let indicator = menu.querySelector(".nav-indicator-pill");
    if (!indicator) {
        indicator = document.createElement("div");
        indicator.className = "nav-indicator-pill";
        menu.appendChild(indicator);
    }

    const links = menu.querySelectorAll(".figma-navbar-link");

    const moveIndicator = (targetLink) => {
        if (!targetLink) {
            indicator.style.opacity = "0";
            return;
        }
        const menuRect = menu.getBoundingClientRect();
        const linkRect = targetLink.getBoundingClientRect();

        const left = linkRect.left - menuRect.left;
        const width = linkRect.width;

        // Keep the original width and position
        const reducedWidth = width;
        const centeredLeft = left;

        indicator.style.left = `${centeredLeft}px`;
        indicator.style.width = `${reducedWidth}px`;
        indicator.style.opacity = "1";

        links.forEach(l => {
            if (l === targetLink) {
                l.classList.add("active-text");
            } else {
                l.classList.remove("active-text");
            }
        });
    };

    const activeLink = menu.querySelector(".figma-navbar-link.active");

    if (activeLink) {
        // Initialize position instantly on page load without sliding animation
        indicator.style.transition = "none";
        moveIndicator(activeLink);

        // Force browser layout update
        indicator.offsetHeight;

        // Restore transition for smooth hover movement
        setTimeout(() => {
            indicator.style.transition = "";
        }, 50);
    }

    links.forEach((link) => {
        link.addEventListener("mouseenter", () => moveIndicator(link));
        link.addEventListener("mouseleave", () => {
            const currentActive = menu.querySelector(".figma-navbar-link.active");
            if (currentActive) {
                moveIndicator(currentActive);
            } else {
                indicator.style.opacity = "0";
                links.forEach(l => l.classList.remove("active-text"));
            }
        });
    });

    window.addEventListener("resize", () => {
        const currentActive = menu.querySelector(".figma-navbar-link.active");
        if (currentActive) {
            moveIndicator(currentActive);
        }
    }, { passive: true });
}
