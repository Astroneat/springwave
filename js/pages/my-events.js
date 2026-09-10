import "../../src/style.css";
import { isAuthenticated, getUser } from "../lib/session.js";
import { getMyTickets } from "../api/user.js";
import { addEventReview } from "../api/activities.js";
import { getMyCertificates } from "../api/certificates.js";
import { loadNavbar as loadSharedNavbar, initBasicScroll } from "../components/navbar.js";
import { formatDate } from "../lib/utils.js";
import { API_BASE_URL } from "../config.js";
import { openEventPopup } from "../components/eventPopup.js";
import { t, applyTranslation } from "../lib/i18n.js";
import { showToast } from "../components/toast.js";

let allTickets = [];
let showPast = false;
let currentRateEventId = null;
let selectedRating = 0;

function getTicketStatus(t) {
  return t.ticketStatus || 'active';
}

function isInactive(t) {
  const s = getTicketStatus(t);
  return s === 'expired' || s === 'cancelled' || s === 'checked_in';
}

function isEventExpired(t) {
  const event = t.event || {};
  if (!event.heldDate && !event.heldDateEnd) return false;
  const endDate = event.heldDateEnd
    ? new Date(event.heldDateEnd).getTime()
    : new Date(event.heldDate).getTime() + 24 * 60 * 60 * 1000;
  return Date.now() > endDate;
}

function statusBadgeHTML(status) {
  const map = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
    checked_in: 'bg-sky-50 text-sky-700 border-sky-200/50',
    expired: 'bg-amber-50 text-amber-700 border-amber-200/50',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200/50',
  };
  const labels = {
    active: t('my_events.status_active', 'Active'),
    checked_in: t('my_events.status_checked_in', 'Checked In'),
    expired: t('my_events.status_expired', 'Expired'),
    cancelled: t('my_events.status_cancelled', 'Cancelled'),
  };
  const cls = map[status] || 'bg-slate-50 text-slate-600 border-slate-200/50';
  return `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls} border">${labels[status] || status}</span>`;
}

function canRateEvent(tkt) {
  const event = tkt.event || {};
  if (tkt.review) return false;
  if (event.hasAttendance) {
    return tkt.checkIn && tkt.checkIn.status === 'present';
  }
  return true;
}

function getRatingText(tkt) {
  if (tkt.review) return t('my_events.you_rated', { rating: tkt.review.rating }).replace('{{rating}}', tkt.review.rating);
  if (!canRateEvent(tkt)) return t('my_events.check_in_to_rate', 'Check in to rate');
  return t('my_events.rate_event', 'Rate Event');
}

function renderEvents() {
  const list = document.getElementById("events-list");
  if (!list) return;

  const validTickets = allTickets.filter(t => t && t.event && (t.event._id || t.event.title));
  const activeEvents = validTickets.filter(t => !isInactive(t) && !isEventExpired(t));
  const pastEvents = validTickets.filter(t => isInactive(t) || isEventExpired(t));

  const activeBadge = document.getElementById("active-count-badge");
  const inactiveBadge = document.getElementById("inactive-count-badge");
  if (activeBadge) activeBadge.textContent = `${activeEvents.length} ${t('my_events.active_tab', 'Active')}`;
  if (inactiveBadge) inactiveBadge.textContent = `${pastEvents.length} ${t('my_events.past_tab', 'Past')}`;

  const eventsToDisplay = showPast ? validTickets : activeEvents;

  if (!eventsToDisplay || eventsToDisplay.length === 0) {
    list.innerHTML = `
      <div class="text-center py-16 bg-white border border-[#ecedfa] rounded-2xl">
        <span class="material-symbols-outlined text-5xl text-[#64748b] mb-4">event_busy</span>
        <p class="text-lg font-semibold text-[#191b22]">${t('my_events.no_events', 'No events found')}</p>
        <p class="text-sm text-[#64748b] mt-1">${showPast ? t('my_events.no_events_desc_past', "You haven't participated in any events yet.") : t('my_events.no_events_desc_active', "You don't have any active events right now.")}</p>
        <a href="/explore.html" class="inline-block mt-5 px-6 py-2.5 rounded-xl bg-[#1755ba] text-white text-sm font-medium hover:bg-[#1755ba]/90 transition-all shadow-sm">${t('my_events.explore_btn', 'Explore Events')}</a>
      </div>`;
    return;
  }

  list.innerHTML = eventsToDisplay.map(tkt => {
    const event = tkt.event || {};
    const eventDate = event.heldDate ? formatDate(event.heldDate) : "TBD";
    const status = getTicketStatus(tkt);
    const expired = isEventExpired(tkt);

    let checkInInfo = '';
    if (tkt.checkIn && tkt.checkIn.status === 'present') {
      const time = tkt.checkIn.checkedInAt ? formatDate(tkt.checkIn.checkedInAt) : '';
      checkInInfo = `
        <div class="flex items-center gap-1.5 text-xs text-emerald-600">
          <span class="material-symbols-outlined text-[16px]">check_circle</span>
          <span class="font-medium">${t('my_events.checked_in', 'Checked in')}</span>
          ${time ? `<span class="text-slate-400">• ${time}</span>` : ''}
        </div>`;
    }

    const canRate = canRateEvent(tkt);
    const hasCertificate = !!tkt.certificate;
    const eventId = event._id || '';
    const eventTitle = event.title || 'Unknown Event';
    const safeTitle = eventTitle.replace(/'/g, "\\'");

    let actionButtons = '';
    if (expired || isInactive(tkt)) {
      if (canRate) {
        actionButtons += `
          <button class="rate-event-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1755ba] bg-[#1755ba]/10 hover:bg-[#1755ba]/25 transition-all" data-event-id="${eventId}" data-event-title="${safeTitle}">
            <i class="fa-regular fa-star mr-1"></i>${t('my_events.rate_event', 'Rate Event')}
          </button>`;
      } else if (tkt.review) {
        actionButtons += `
          <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50">
            <i class="fa-solid fa-star text-amber-500"></i> ${tkt.review.rating}/5
          </span>`;
      }
      if (hasCertificate) {
        actionButtons += `
          <button class="view-cert-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all" data-cert-code="${tkt.certificate.certificateCode}" data-event-title="${safeTitle}">
            <i class="fa-solid fa-award mr-1"></i>${t('my_events.certificate', 'Certificate')}
          </button>`;
      }
    }

    const statusBottomText = status === 'checked_in' 
      ? t('my_events.attended', 'Attended') 
      : (status === 'cancelled' ? t('my_events.status_cancelled', 'Cancelled') : t('my_events.ended', 'Ended'));

    return `
      <div class="group relative flex flex-col md:flex-row bg-white border border-[#ecedfa] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 ${expired || isInactive(tkt) ? "opacity-80" : ""}">
        <div class="relative w-full md:w-48 h-36 md:h-auto min-h-[144px] flex-shrink-0 bg-slate-100 overflow-hidden cursor-pointer event-card-preview" data-event-id="${eventId}">
          <img src="${event.thumbnail || 'https://images.unsplash.com/photo-1618477462146-050d2767eac4?q=80&w=1200&auto=format&fit=crop'}" 
               alt="${eventTitle}" 
               class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden"></div>
          <div class="absolute top-3 left-3 md:hidden">
            ${statusBadgeHTML(status)}
          </div>
        </div>

        <div class="flex-grow p-5 flex flex-col justify-between min-w-0">
          <div class="min-w-0">
            <div class="hidden md:flex items-center justify-between gap-2 mb-2">
              ${statusBadgeHTML(status)}
              ${expired ? `<span class="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 font-medium">${t('my_events.event_ended', 'Event ended')}</span>` : ''}
            </div>
            <h3 class="font-bold text-[#191b22] text-lg md:text-xl line-clamp-1 group-hover:text-[#1755ba] transition-colors duration-200 mb-2 cursor-pointer event-card-preview" data-event-id="${eventId}" title="${eventTitle}">${eventTitle}</h3>
            
            <div class="space-y-1.5 text-sm text-[#64748b] min-w-0">
              <div class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-outlined text-[18px] text-[#1755ba] shrink-0">calendar_today</span>
                <span class="truncate">${eventDate}</span>
              </div>
              ${event.location ? `
              <div class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-outlined text-[18px] text-[#1755ba] shrink-0">location_on</span>
                <span class="truncate" title="${event.location}">${event.location}</span>
              </div>` : ''}
              ${checkInInfo ? `<div class="flex items-center gap-2 min-w-0">${checkInInfo}</div>` : ''}
            </div>
          </div>

          ${actionButtons ? `
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            ${actionButtons}
          </div>` : `
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
            <span class="material-symbols-outlined text-[16px]">info</span>
            <span>${t('my_events.unlock_features', 'Participate and check in to unlock features')}</span>
          </div>`}
        </div>

        <div class="hidden md:flex flex-col justify-between items-center py-3 my-2 flex-shrink-0 w-[1px]">
          <div class="w-3 h-3 rounded-full bg-[#f8f9fc] -mt-5 -ml-1.5 border-b border-l border-r border-[#ecedfa]"></div>
          <div class="h-full border-l border-dashed border-slate-200"></div>
          <div class="w-3 h-3 rounded-full bg-[#f8f9fc] -mb-5 -ml-1.5 border-t border-l border-r border-[#ecedfa]"></div>
        </div>
        <div class="md:hidden flex items-center px-5 flex-shrink-0">
          <div class="w-full border-t border-dashed border-slate-200"></div>
        </div>

        <div class="w-full md:w-44 p-5 flex flex-col items-center justify-center bg-slate-50/50 md:bg-transparent flex-shrink-0">
          ${tkt.qrImageUrl && status === 'active'
            ? `
            <div class="relative group/qr cursor-zoom-in qr-zoom-btn" data-qr-url="${tkt.qrImageUrl}" data-event-title="${(event.title || 'Event').replace(/"/g, '&quot;')}" data-qr-code="${tkt.qrCode || ''}">
              <img src="${tkt.qrImageUrl}" alt="QR Code" class="w-24 h-24 rounded-xl border border-slate-200 bg-white p-1 hover:shadow-md transition-all duration-300" />
              <div class="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover/qr:opacity-100 flex items-center justify-center transition-opacity duration-200">
                <span class="material-symbols-outlined text-white text-xl">zoom_in</span>
              </div>
            </div>
            <span class="mt-2 text-[10px] font-mono text-slate-400 uppercase">${tkt.qrCode ? tkt.qrCode.slice(0, 8) : 'N/A'}</span>
            <a href="${tkt.qrImageUrl}" download="ticket_${tkt.qrCode || 'qr'}.png" target="_blank" class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#1755ba] hover:underline">
              <span class="material-symbols-outlined text-[14px]">download</span> ${t('my_events.download_qr', 'Download QR')}
            </a>
            `
            : `
            <div class="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1 select-none">
              <span class="material-symbols-outlined text-3xl">${status === 'checked_in' ? 'check_circle' : 'event_busy'}</span>
              <span class="text-[9px] font-bold uppercase tracking-wider">${statusBottomText}</span>
            </div>
            `
          }
        </div>
      </div>
    `;
  }).join("");

  // QR zoom clicks
  document.querySelectorAll(".qr-zoom-btn").forEach(el => {
    el.addEventListener("click", () => {
      openQrModal(el.dataset.qrUrl, el.dataset.eventTitle, el.dataset.qrCode);
    });
  });

  // Event preview clicks
  document.querySelectorAll(".event-card-preview").forEach(el => {
    el.addEventListener("click", () => {
      const eventId = el.dataset.eventId;
      if (!eventId) return;
      const ticket = allTickets.find(tk => tk?.event && String(tk.event._id) === eventId);
      openEventPopup(eventId, { activityData: ticket?.event || null });
    });
  });

  // Rate buttons
  document.querySelectorAll(".rate-event-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const eventId = btn.dataset.eventId;
      const eventTitle = btn.dataset.eventTitle;
      openRateModal(eventId, eventTitle);
    });
  });

  // Certificate buttons
  document.querySelectorAll(".view-cert-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const certCode = btn.dataset.certCode;
      const eventTitle = btn.dataset.eventTitle;
      openCertModal(certCode, eventTitle);
    });
  });
}

// ─── Rate Modal ───

function openRateModal(eventId, eventTitle) {
  currentRateEventId = eventId;
  selectedRating = 0;
  document.getElementById("rate-modal-event-name").textContent = eventTitle;
  document.getElementById("rate-review-content").value = "";
  document.getElementById("submit-rate-btn").disabled = true;
  document.querySelectorAll("#star-rating .star").forEach(s => {
    s.classList.remove("text-yellow-400");
    s.classList.add("text-slate-200");
  });
  const modal = document.getElementById("rate-modal");
  const content = modal.querySelector(".bg-white");
  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.remove("opacity-0", "pointer-events-none");
    content.classList.remove("scale-95");
    content.classList.add("scale-100");
  });
}

function closeRateModal() {
  const modal = document.getElementById("rate-modal");
  const content = modal.querySelector(".bg-white");
  modal.classList.add("opacity-0", "pointer-events-none");
  content.classList.remove("scale-100");
  content.classList.add("scale-95");
  setTimeout(() => {
    if (modal.classList.contains("opacity-0")) {
      modal.hidden = true;
    }
  }, 300);
  currentRateEventId = null;
}

// ─── Certificate Modal ───

function openCertModal(certCode, eventTitle) {
  document.getElementById("cert-modal-event-name").textContent = eventTitle;
  document.getElementById("cert-modal-code").textContent = certCode;
  document.getElementById("cert-verify-link").href = `/certificate.html?code=${encodeURIComponent(certCode)}`;
  const modal = document.getElementById("cert-modal");
  const content = modal.querySelector(".bg-white");
  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.remove("opacity-0", "pointer-events-none");
    content.classList.remove("scale-95");
    content.classList.add("scale-100");
  });
}

function closeCertModal() {
  const modal = document.getElementById("cert-modal");
  const content = modal.querySelector(".bg-white");
  modal.classList.add("opacity-0", "pointer-events-none");
  content.classList.remove("scale-100");
  content.classList.add("scale-95");
  setTimeout(() => {
    if (modal.classList.contains("opacity-0")) {
      modal.hidden = true;
    }
  }, 300);
}

// ─── QR Zoom Modal ───

function openQrModal(imageUrl, eventTitle, qrCodeText) {
  const modal = document.getElementById("qr-modal");
  const content = document.getElementById("qr-modal-content");
  const titleEl = document.getElementById("modal-event-title");
  const imgEl = document.getElementById("modal-qr-img");
  const codeEl = document.getElementById("modal-qr-code");
  const downloadEl = document.getElementById("modal-download-btn");

  if (!modal || !content) return;

  if (titleEl) titleEl.textContent = eventTitle || "Event";
  if (imgEl) imgEl.src = imageUrl;
  if (codeEl) codeEl.textContent = qrCodeText ? qrCodeText.toUpperCase() : "N/A";
  if (downloadEl) {
    downloadEl.href = imageUrl;
    downloadEl.download = `ticket_${qrCodeText || 'qr'}.png`;
  }

  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.remove("opacity-0", "pointer-events-none");
    content.classList.remove("scale-95");
    content.classList.add("scale-100");
  });
}

function closeQrModal() {
  const modal = document.getElementById("qr-modal");
  const content = document.getElementById("qr-modal-content");
  if (!modal || !content) return;
  modal.classList.add("opacity-0", "pointer-events-none");
  content.classList.remove("scale-100");
  content.classList.add("scale-95");
  setTimeout(() => {
    if (modal.classList.contains("opacity-0")) {
      modal.hidden = true;
    }
  }, 300);
}

// ─── Init Modals ───

function initModals() {
  // Rate modal
  const rateModal = document.getElementById("rate-modal");
  document.getElementById("close-rate-modal").addEventListener("click", closeRateModal);
  rateModal.addEventListener("click", (e) => {
    if (e.target === rateModal) closeRateModal();
  });

  document.querySelectorAll("#star-rating .star").forEach(star => {
    star.addEventListener("click", () => {
      const rating = parseInt(star.dataset.rating);
      selectedRating = rating;
      document.querySelectorAll("#star-rating .star").forEach((s, i) => {
        if (i < rating) {
          s.classList.remove("text-slate-200");
          s.classList.add("text-yellow-400");
        } else {
          s.classList.remove("text-yellow-400");
          s.classList.add("text-slate-200");
        }
      });
      document.getElementById("submit-rate-btn").disabled = false;
    });
  });

  document.getElementById("submit-rate-btn").addEventListener("click", async () => {
    if (!currentRateEventId || !selectedRating) return;
    const content = document.getElementById("rate-review-content").value.trim();
    const btn = document.getElementById("submit-rate-btn");
    btn.disabled = true;
    btn.textContent = t("my_events.rate_modal_submitting", "Submitting...");
    try {
      await addEventReview(currentRateEventId, selectedRating, content);
      closeRateModal();
      const tkt = allTickets.find(t => {
        const ev = t.event || {};
        return ev._id === currentRateEventId;
      });
      if (tkt) {
        tkt.review = { rating: selectedRating, content };
      }
      showToast(t("my_events.rate_success", "Thank you for submitting your review!"), "success");
      renderEvents();
    } catch (err) {
      showToast(err.message || t("my_events.rate_modal_failed", "Failed to submit review"), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = t("my_events.rate_modal_submit", "Submit Review");
    }
  });

  // Certificate modal
  const certModal = document.getElementById("cert-modal");
  document.getElementById("close-cert-modal").addEventListener("click", closeCertModal);
  certModal.addEventListener("click", (e) => {
    if (e.target === certModal) closeCertModal();
  });

  // QR zoom modal
  const qrModal = document.getElementById("qr-modal");
  document.getElementById("close-qr-modal")?.addEventListener("click", closeQrModal);
  qrModal?.addEventListener("click", (e) => {
    if (e.target === qrModal) closeQrModal();
  });

  // Global Escape key listener
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeRateModal();
      closeCertModal();
      closeQrModal();
    }
  });
}

// ─── Load Page ───

async function loadPage() {
  if (!isAuthenticated()) {
    window.location.href = "/login.html";
    return;
  }

  await loadSharedNavbar();
  initBasicScroll();
  initModals();

  const list = document.getElementById("events-list");
  if (!list) return;

  try {
    const { tickets } = await getMyTickets();
    allTickets = (tickets || []).filter(t => t && t.event && (t.event._id || t.event.title));

    if (allTickets.length === 0) {
      list.innerHTML = `
        <div class="text-center py-16 bg-white border border-[#ecedfa] rounded-2xl">
          <span class="material-symbols-outlined text-5xl text-[#64748b] mb-4">event_busy</span>
          <p class="text-lg font-semibold text-[#191b22]">${t("my_events.no_events_yet", "No events yet")}</p>
          <p class="text-sm text-[#64748b] mt-1">${t("my_events.no_events_yet_desc", "Participate in an event to get started.")}</p>
          <a href="/explore.html" class="inline-block mt-5 px-6 py-2.5 rounded-xl bg-[#1755ba] text-white text-sm font-medium hover:bg-[#1755ba]/90 transition-all shadow-sm">${t("my_events.explore_btn", "Explore Events")}</a>
        </div>`;
      return;
    }

    const filterBar = document.getElementById("filter-bar");
    const toggleBtn = document.getElementById("toggle-expired-btn");
    const toggleIcon = document.getElementById("toggle-expired-icon");
    const toggleText = document.getElementById("toggle-expired-text");

    if (filterBar) filterBar.classList.remove("hidden");

    const pastEvents = allTickets.filter(t => isInactive(t) || isEventExpired(t));
    if (toggleBtn) {
      if (pastEvents.length === 0) {
        toggleBtn.classList.add("hidden");
      } else {
        toggleBtn.classList.remove("hidden");
        toggleBtn.addEventListener("click", () => {
          showPast = !showPast;
          if (showPast) {
            toggleIcon.textContent = "visibility_off";
            toggleText.textContent = t("my_events.hide_past_btn", "Hide Past Events");
            toggleBtn.classList.add("bg-slate-100");
          } else {
            toggleIcon.textContent = "visibility";
            toggleText.textContent = t("my_events.show_past_btn", "Show Past Events");
            toggleBtn.classList.remove("bg-slate-100");
          }
          renderEvents();
        });
      }
    }

    renderEvents();
  } catch (err) {
    console.error("Failed to load events:", err);
    list.innerHTML = `<div class="text-center py-12 text-red-500 font-medium bg-white border border-red-100 rounded-2xl">${t("my_events.failed_load", "Failed to load events. Please try again later.")}</div>`;
  }
}

window.addEventListener("language-changed", () => {
  applyTranslation();
  const toggleText = document.getElementById("toggle-expired-text");
  if (toggleText) {
    toggleText.textContent = showPast ? t("my_events.hide_past_btn", "Hide Past Events") : t("my_events.show_past_btn", "Show Past Events");
  }
  renderEvents();
});

loadPage();
