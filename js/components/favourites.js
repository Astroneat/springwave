import { getFavourites } from "../api/user.js";
import { t } from "../lib/i18n.js";
import { formatDate, capitalize, getEventStatus } from "../lib/utils.js";
import { isAuthenticated } from "../lib/session.js";
import { openEventPopup } from "./eventPopup.js";
import { showLoginPrompt } from "./authModal.js";

let favouritesOverlay = null;

export async function showFavouritesGlobal() {
    if (!isAuthenticated()) {
        showLoginPrompt({
            message: t("auth_modal.desc_favorite", "Vui lòng đăng nhập để xem các hoạt động yêu thích."),
            redirectUrl: window.location.pathname + window.location.search
        });
        return;
    }

    if (!favouritesOverlay) {
        favouritesOverlay = document.createElement('div');
        favouritesOverlay.className = 'popup-overlay hidden';
        favouritesOverlay.id = 'global-favourites-overlay';
        favouritesOverlay.innerHTML = '<div class="popup-container" id="global-favourites-container"></div>';
        document.body.appendChild(favouritesOverlay);
    }

    const popupContainer = favouritesOverlay.querySelector('#global-favourites-container');

    try {
        const { activities } = await getFavourites();
        popupContainer.innerHTML = buildFavouritesHTML(activities || []);
        
        favouritesOverlay.removeAttribute("hidden");
        // Force reflow
        void favouritesOverlay.offsetWidth;
        favouritesOverlay.classList.add("active");
        document.body.style.overflow = "hidden";

        const closeBtn = popupContainer.querySelector("#back-btn");
        if (closeBtn) {
            closeBtn.addEventListener("click", closeFavouritesPopup);
        }

        // Close when clicking outside
        favouritesOverlay.addEventListener('click', (e) => {
            if (e.target === favouritesOverlay) {
                closeFavouritesPopup();
            }
        });

        // Add event listeners to cards to open event popup directly over current page
        const cards = popupContainer.querySelectorAll(".activity-card");
        activities.forEach((a, i) => {
            if (cards[i]) {
                cards[i].addEventListener("click", () => {
                    const eventId = a.activityID || a._id;
                    openEventPopup(eventId, { activityData: a });
                });
            }
        });

    } catch (err) {
        console.error("Failed to show favourites:", err);
    }
}

function closeFavouritesPopup() {
    if (!favouritesOverlay) return;
    favouritesOverlay.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(() => {
        favouritesOverlay.setAttribute("hidden", "true");
    }, 300);
}

function buildFavouritesHTML(activities) {
    if (!activities || activities.length === 0) {
        return `<div class="container" style="padding:24px; max-width:600px; margin:0 auto; background:white; border-radius:16px;">
                    <div class="top-bar" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:16px; margin-bottom:16px;">
                        <button class="back-btn" id="back-btn" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-primary);font-weight:600;display:flex;align-items:center;gap:8px;">
                            <i class="fa-solid fa-arrow-left"></i> ${t("explore.back")}
                        </button>
                        <h2 style="font-size:20px;font-weight:700;margin:0;">${t("explore.favourite_activities")}</h2>
                        <div style="width:70px;"></div>
                    </div>
                    <p>${t("explore.no_favourites")}</p>
                </div>`;
    }
    const items = activities.map(a => {
        const held = formatDate(a.heldDate);
        const type = capitalize(a.type);
        const status = getEventStatus(a);
        let statusTag = '';
        if (status === 'ongoing') {
            statusTag = `<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:#d1fae5;color:#059669;font-weight:600;">${t("explore.ongoing") || "Đang diễn ra"}</span>`;
        } else if (status === 'registration_closed') {
            statusTag = `<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#b45309;font-weight:600;">${t("explore.registration_closed") || "Hết hạn đăng ký"}</span>`;
        } else if (status === 'ended') {
            statusTag = `<span style="font-size:11px;padding:2px 8px;border-radius:999px;background:#fee2e2;color:#dc2626;font-weight:600;">${t("explore.ended") || "Đã kết thúc"}</span>`;
        }
        return `<div class="activity-card" data-id="${a.activityID}" style="cursor:pointer;border:1px solid #e8ecf4;border-radius:12px;padding:16px;margin-bottom:12px;display:flex;gap:16px;transition:background 0.2s">
            <div style="width:120px;height:90px;border-radius:10px;overflow:hidden;background:#e8ecf4;flex-shrink:0;">
                ${a.thumbnail ? `<img src="${a.thumbnail}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="padding:30px;text-align:center;color:#999"><i class="fa-regular fa-image"></i></div>'}
            </div>
            <div style="flex:1">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <div style="display:flex;gap:6px;align-items:center;">
                        <span style="font-size:12px;padding:2px 10px;border-radius:999px;background:#dce9ff;color:var(--accent);font-weight:600;">${type}</span>
                        ${statusTag}
                    </div>
                    <span style="font-size:12px;color:var(--text-muted)">${held}</span>
                </div>
                <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${a.title}</h3>
                <div style="font-size:13px;color:var(--text-secondary)"><i class="fa-solid fa-location-dot" style="color:var(--accent)"></i> ${a.location || 'N/A'}</div>
            </div>
        </div>`;
    }).join('');
    return `<div class="container" style="padding:24px; max-width:600px; margin:0 auto; background:white; border-radius:16px;">
                <div class="top-bar" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:16px; margin-bottom:16px;">
                    <button class="back-btn" id="back-btn" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-primary);font-weight:600;display:flex;align-items:center;gap:8px;">
                        <i class="fa-solid fa-arrow-left"></i> ${t("explore.back")}
                    </button>
                    <h2 style="font-size:20px;font-weight:700;margin:0;">${t("explore.favourite_activities")}</h2>
                    <div style="width:70px;"></div>
                </div>
                <div style="max-height:60vh; overflow-y:auto; padding-right:8px;" class="custom-scrollbar">
                    ${items}
                </div>
            </div>`;
}
