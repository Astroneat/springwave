import "../../src/style.css";
import { loadNavbar } from "../components/navbar.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent, formatDate, capitalize } from "../lib/utils.js";
import { openEventPopup } from "../components/eventPopup.js";
import {
  getOrganizationPublicProfile,
  toggleFollowOrganization,
  uploadOrgAvatar,
  uploadOrgCover,
  getOrgActivities
} from "../api/organizations.js";
import { isAuthenticated, getUser } from "../lib/session.js";

// --- State ---
let allEvents = [];
let currentTab = "all";
let toastTimeout = null;

// --- Toast Helper ---
function showToast(message, isError = false) {
  const toast = document.getElementById("org-toast");
  const msgEl = document.getElementById("org-toast-msg");
  const iconEl = document.getElementById("org-toast-icon");
  if (!toast || !msgEl) return;

  clearTimeout(toastTimeout);
  msgEl.textContent = message;

  if (isError) {
    toast.className = "org-toast show toast-error";
    if (iconEl) iconEl.textContent = "error";
  } else {
    toast.className = "org-toast show toast-success";
    if (iconEl) iconEl.textContent = "check_circle";
  }

  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

// --- Event delegation for cards ---
function initEventDelegation() {
  document.getElementById("org-events-grid")?.addEventListener("click", (e) => {
    const card = e.target.closest(".event-card");
    if (card) {
      e.preventDefault();
      const id = card.dataset.id;
      const actData = allEvents.find((ev) => String(ev._id || ev.activityID) === id);
      openEventPopup(id, { activityData: actData });
    }
  });
}

// --- Render Event Cards ---
function renderFilteredEvents() {
  const grid = document.getElementById("org-events-grid");
  if (!grid) return;

  const now = new Date();
  let filtered = allEvents;

  if (currentTab === "upcoming") {
    filtered = allEvents.filter((e) => {
      if (!e.heldDate) return true;
      return new Date(e.heldDate) >= now;
    });
  } else if (currentTab === "past") {
    filtered = allEvents.filter((e) => {
      if (!e.heldDate) return false;
      return new Date(e.heldDate) < now;
    });
  }

  if (filtered.length === 0) {
    const emptyMsg =
      currentTab === "upcoming"
        ? "No upcoming events scheduled at the moment."
        : currentTab === "past"
        ? "No past events recorded for this organization."
        : "No events published yet.";

    grid.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center text-center py-12 px-4 rounded-2xl bg-white border border-[#ecedfa]">
        <div class="w-14 h-14 rounded-2xl bg-slate-100 text-[#94a3b8] flex items-center justify-center mb-3">
          <span class="material-symbols-outlined text-3xl">event_busy</span>
        </div>
        <p class="font-bold text-sm text-[#191b22]">${emptyMsg}</p>
        <p class="text-xs text-[#64748b] mt-1">Check back later or follow this organization for announcements.</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((e) => {
      const isPast = e.heldDate ? new Date(e.heldDate) < now : false;
      const statusBadge = isPast
        ? `<span class="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0">Ended</span>`
        : `<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0">Upcoming</span>`;

      return `
        <div data-id="${e._id}" class="event-card cursor-pointer flex flex-col justify-between bg-white border border-[#ecedfa] rounded-[20px] overflow-hidden shadow-sm hover:shadow-lg hover:scale-[1.015] active:scale-[0.99] transition-all duration-200 group">
          <div class="h-36 sm:h-40 bg-[#f1f5f9] overflow-hidden relative">
            ${
              e.thumbnail
                ? `<img src="${e.thumbnail}" alt="${e.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">`
                : `<div class="w-full h-full flex items-center justify-center text-[#94a3b8]"><span class="material-symbols-outlined text-3xl">event</span></div>`
            }
            <div class="absolute top-3 left-3 z-10">
              ${statusBadge}
            </div>
            <div class="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[11px] font-bold text-primary flex items-center gap-1.5 border border-primary/20 shadow-sm z-10 max-w-[70%]">
              <i class="fa-solid fa-tag text-primary text-[10px] shrink-0"></i>
              <span class="info-type truncate">${capitalize(e.type || (e.category?.name || "Activity"))}</span>
            </div>
          </div>
          <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between">
            <h3 class="font-bold text-sm sm:text-base text-[#191b22] line-clamp-2 mb-2 group-hover:text-primary transition-colors">${e.title}</h3>
            <div class="space-y-1.5 mt-auto pt-2 border-t border-[#f1f5f9]">
              <div class="flex items-center gap-1.5 text-xs text-[#64748b]">
                <span class="material-symbols-outlined text-sm text-primary shrink-0">calendar_today</span>
                <span class="truncate font-medium">${formatDate(e.heldDate)}</span>
              </div>
              ${
                e.location
                  ? `<div class="flex items-center gap-1.5 text-xs text-[#64748b]">
                      <span class="material-symbols-outlined text-sm text-rose-500 shrink-0">location_on</span>
                      <span class="truncate">${e.location}</span>
                    </div>`
                  : ""
              }
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

// --- Setup Event Filter Tabs ---
function initEventTabs() {
  const tabBtns = document.querySelectorAll(".event-tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      renderFilteredEvents();
    });
  });
}

// --- Update Follow Button UI ---
function updateFollowButtonUI(button, isFollowing) {
  const labelEl = button.querySelector(".follow-label");
  const iconEl = document.getElementById("follow-icon");

  button.dataset.following = isFollowing ? "true" : "false";

  if (isFollowing) {
    if (labelEl) labelEl.textContent = "Following";
    if (iconEl) iconEl.textContent = "check";
    button.className =
      "follow-btn flex items-center gap-2 font-semibold text-sm bg-slate-100 text-slate-700 border border-slate-300 px-7 py-2.5 rounded-full shadow-sm hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 active:scale-95 transition-all cursor-pointer";
  } else {
    if (labelEl) labelEl.textContent = "Follow";
    if (iconEl) iconEl.textContent = "add";
    button.className =
      "follow-btn flex items-center gap-2 font-semibold text-sm bg-primary text-white px-7 py-2.5 rounded-full shadow-md hover:shadow-primary/25 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer";
  }
}

// --- Show 404 Error State ---
function showErrorState(title, message) {
  const mainContent = document.getElementById("org-main-content");
  const errorState = document.getElementById("org-error-state");
  const errorTitle = document.getElementById("org-error-title");
  const errorDesc = document.getElementById("org-error-desc");

  if (mainContent) mainContent.classList.add("hidden");
  if (errorState) errorState.classList.remove("hidden");
  if (errorTitle && title) errorTitle.textContent = title;
  if (errorDesc && message) errorDesc.textContent = message;
}

// --- DOM Ready ---
document.addEventListener("DOMContentLoaded", async () => {
  await loadNavbar();
  await fetchContent("./components/footer.html").then((html) => {
    const footerContainer = document.getElementById("footer-container");
    if (footerContainer) footerContainer.innerHTML = html;
  });
  await initChatbot();
  initEventDelegation();
  initEventTabs();

  const params = new URLSearchParams(window.location.search);
  const orgId = params.get("orgId") || params.get("id");

  if (!orgId) {
    showErrorState("Organization Not Found", "No organization ID was provided in the URL.");
    return;
  }

  let org = null;
  try {
    const data = await getOrganizationPublicProfile(orgId);
    org = data?.organization;
  } catch (error) {
    console.error("Failed to load organization from public API:", error);
  }

  if (!org) {
    showErrorState("Organization Not Found", "Failed to load organization details or this organization does not exist.");
    return;
  }

  // --- Core fields ---
  const orgName = (org.name || "Unknown Organization").normalize("NFC");
  document.getElementById("org-name").textContent = orgName;
  document.title = `${orgName} | SpringWave`;
  document.getElementById("org-bio").textContent = (org.description || "No description provided.").normalize("NFC");

  // --- University Badge ---
  const uniBadge = document.getElementById("org-university-badge");
  const uniNameEl = document.getElementById("org-university-name");
  if (uniBadge && uniNameEl) {
    if (org.university) {
      const uName = org.university.shortName
        ? `${org.university.name} (${org.university.shortName})`
        : (org.university.name || org.university);
      uniNameEl.textContent = uName;
      if (org.university.color) {
        uniBadge.style.color = org.university.color;
        uniBadge.style.borderColor = `${org.university.color}40`;
        uniBadge.style.backgroundColor = `${org.university.color}15`;
      }
      uniBadge.classList.remove("hidden");
    } else {
      uniNameEl.textContent = "Tổ chức độc lập / Tự do";
      uniBadge.className = "inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200";
      uniBadge.classList.remove("hidden");
    }
  }

  // --- Avatar / cover ---
  const avatarImg = document.getElementById("org-avatar");
  const coverImg = document.getElementById("org-cover");
  const loggedInUser = getUser() || {};

  const orgAvatar =
    org.avatar || "https://ui-avatars.com/api/?name=" + encodeURIComponent(org.name || "Org");
  const orgCover = org.coverImage || "";

  if (avatarImg) {
    avatarImg.src = orgAvatar;
  }
  if (coverImg && orgCover) {
    coverImg.style.backgroundImage = `url('${orgCover}')`;
  }

  // --- Contact & website ---
  const emailEl = document.getElementById("org-email");
  if (emailEl) emailEl.textContent = org.contactInfo?.email || "-";

  const phoneItem = document.getElementById("org-phone-item");
  const phoneEl = document.getElementById("org-phone");
  if (org.contactInfo?.phoneNo) {
    if (phoneEl) phoneEl.textContent = org.contactInfo.phoneNo;
    if (phoneItem) phoneItem.classList.remove("hidden");
  } else {
    if (phoneItem) phoneItem.classList.add("hidden");
  }

  const websiteEl = document.getElementById("org-website");
  if (websiteEl) {
    if (org.website) {
      websiteEl.textContent = org.website;
      websiteEl.href = org.website.startsWith("http") ? org.website : "https://" + org.website;
    } else {
      websiteEl.textContent = "Not provided";
      websiteEl.removeAttribute("href");
      websiteEl.classList.remove("text-primary", "hover:underline");
      websiteEl.classList.add("text-[#64748b]");
    }
  }

  // --- Stats ---
  const eventsCountEl = document.getElementById("org-stats-events");
  const followersCountEl = document.getElementById("org-stats-followers");
  const ratingEl = document.getElementById("org-stats-rating");
  const starEl = document.getElementById("org-stats-star");
  const reviewsLabel = document.getElementById("org-stats-reviews-label");

  if (eventsCountEl) eventsCountEl.textContent = org.eventCount ?? 0;
  if (followersCountEl) followersCountEl.textContent = org.followerCount ?? 0;

  const reviewCount = Number(org.reviewCount) || 0;
  const rawRating = org.averageRating != null ? Number(org.averageRating) : null;
  const hasRating = reviewCount > 0 && rawRating != null && !isNaN(rawRating) && rawRating > 0;

  if (ratingEl) {
    if (hasRating) {
      ratingEl.textContent = rawRating.toFixed(1);
      ratingEl.className = "font-display-lg text-2xl font-bold text-amber-500";
    } else {
      ratingEl.textContent = "N/A";
      ratingEl.className = "font-display-lg text-2xl font-bold text-slate-400";
    }
  }

  if (starEl) {
    if (hasRating) {
      starEl.className = "material-symbols-outlined text-amber-400 text-lg";
      starEl.style.fontVariationSettings = "'FILL' 1";
    } else {
      starEl.className = "material-symbols-outlined text-slate-300 text-lg";
      starEl.style.fontVariationSettings = "'FILL' 0";
    }
  }

  if (reviewsLabel) {
    reviewsLabel.textContent = `${reviewCount} Platform Reviews`;
  }

  // --- Social links ---
  const linkSelectors = {
    linkedin: 'a[data-social="linkedin"]',
    facebook: 'a[data-social="facebook"]',
    twitter: 'a[data-social="twitter"]',
    instagram: 'a[data-social="instagram"]',
  };
  const socialLinks = org.socialLinks || {};
  let hasAnySocial = false;

  Object.entries(linkSelectors).forEach(([key, selector]) => {
    const url = socialLinks[key];
    const el = document.querySelector(selector);
    if (!el) return;
    if (url) {
      el.href = url.startsWith("http") ? url : "https://" + url;
      el.style.display = "flex";
      hasAnySocial = true;
    } else {
      el.style.display = "none";
    }
  });

  const socialsContainer = document.getElementById("org-socials-container");
  if (socialsContainer && !hasAnySocial) {
    socialsContainer.style.display = "none";
  }

  // --- Auth check for upload capabilities ---
  const loggedInId = loggedInUser?._id ? String(loggedInUser._id) : "";
  const ownerId = org.owner?._id ? String(org.owner._id) : (org.owner ? String(org.owner) : "");
  const isOwner = Boolean(loggedInId && ownerId && loggedInId === ownerId);

  const isManager = Boolean(
    loggedInId &&
      org.managers &&
      org.managers.some((m) => {
        const mId = m?._id ? String(m._id) : String(m);
        return mId === loggedInId;
      })
  );

  const isAuthorized = isOwner || isManager || loggedInUser.role === "admin";

  if (isAuthorized) {
    const editAvatarBtn = document.getElementById("edit-avatar-btn");
    const editCoverBtn = document.getElementById("edit-cover-btn");
    const avatarInput = document.getElementById("avatar-file-input");
    const coverInput = document.getElementById("cover-file-input");

    if (editAvatarBtn) editAvatarBtn.classList.remove("hidden");
    if (editCoverBtn) editCoverBtn.classList.remove("hidden");

    if (editAvatarBtn && avatarInput) {
      editAvatarBtn.addEventListener("click", () => avatarInput.click());
    }
    if (editCoverBtn && coverInput) {
      editCoverBtn.addEventListener("click", () => coverInput.click());
    }

    if (avatarInput) {
      avatarInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const res = await uploadOrgAvatar(orgId, file);
          if (res.avatar) {
            avatarImg.src = res.avatar;
            showToast("Organization logo updated successfully!");
          }
        } catch (error) {
          console.error("Failed to upload avatar:", error);
          showToast(error.message || "Failed to upload logo.", true);
        }
      });
    }

    if (coverInput) {
      coverInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const res = await uploadOrgCover(orgId, file);
          if (res.coverImage) {
            coverImg.style.backgroundImage = `url('${res.coverImage}')`;
            showToast("Organization cover photo updated successfully!");
          }
        } catch (error) {
          console.error("Failed to upload cover:", error);
          showToast(error.message || "Failed to upload cover photo.", true);
        }
      });
    }
  }

  // ─── Share Button ───
  const shareBtn = document.getElementById("share-org-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const shareData = {
        title: org.name || "SpringWave Organization",
        text: `Check out ${org.name || "this organization"} on SpringWave!`,
        url: window.location.href,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (err) {
          if (err.name !== "AbortError") {
            await navigator.clipboard.writeText(window.location.href);
            showToast("Organization profile link copied to clipboard!");
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(window.location.href);
          showToast("Organization profile link copied to clipboard!");
        } catch {
          showToast("Failed to copy link.", true);
        }
      }
    });
  }

  // ─── Follow button ───
  const followBtn = document.getElementById("follow-btn");
  if (followBtn) {
    updateFollowButtonUI(followBtn, Boolean(org.isFollowing));

    followBtn.addEventListener("click", async () => {
      if (!isAuthenticated()) {
        showToast("Please log in to follow organizations.", true);
        setTimeout(() => {
          window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }, 1200);
        return;
      }

      try {
        const result = await toggleFollowOrganization(orgId);
        if (followersCountEl) {
          followersCountEl.textContent = result.followerCount ?? 0;
        }
        updateFollowButtonUI(followBtn, result.isFollowing);
        showToast(result.isFollowing ? "You are now following this organization!" : "Unfollowed organization.");
      } catch (error) {
        console.error("Follow toggle failed:", error);
        showToast(error.message || "Follow request failed. Please try again.", true);
      }
    });
  }

  // ─── Load & render events ───
  try {
    const { events = [] } = await getOrgActivities(orgId);
    allEvents = events;
    if (eventsCountEl) eventsCountEl.textContent = events.length;
    renderFilteredEvents();
  } catch (err) {
    console.error("Failed to load organization events:", err);
    renderFilteredEvents();
  }
});
