import "../../src/style.css";
import { isAuthenticated, getUser } from "../lib/session.js";
import { getMyTickets } from "../api/user.js";
import { addEventReview, getActivities } from "../api/activities.js";
import { getMyCertificates } from "../api/certificates.js";
import { loadNavbar as loadSharedNavbar, initBasicScroll } from "../components/navbar.js";
import { formatDate } from "../lib/utils.js";
import { API_BASE_URL } from "../config.js";
import { openEventPopup } from "../components/eventPopup.js";
import { t, applyTranslation, getLang } from "../lib/i18n.js";
import { showToast } from "../components/toast.js";
import { verifyOnlineCheckin } from "../api/attendance.js";
import { enhanceSelect } from "../components/customCombobox.js";

let allTickets = [];
let currentFilter = 'all'; // 'all' | 'upcoming' | 'checked_in' | 'expired'
let currentFormat = 'all'; // 'all' | 'online' | 'offline'
let currentRateEventId = null;
let selectedRating = 0;
let cachedActivitiesMap = null;

async function fetchActivitiesMap() {
  if (cachedActivitiesMap) return cachedActivitiesMap;
  try {
    const res = await getActivities();
    const list = res?.activities || res?.events || (Array.isArray(res) ? res : []);
    cachedActivitiesMap = new Map(list.map(a => [String(a._id || a.activityID), a]));
  } catch (e) {
    cachedActivitiesMap = new Map();
  }
  return cachedActivitiesMap;
}

function enrichTicketsWithActivities(tickets, actMap) {
  if (!Array.isArray(tickets)) return [];
  if (!actMap || actMap.size === 0) return tickets;
  return tickets.map(t => {
    if (t.event && t.event._id) {
      const full = actMap.get(String(t.event._id));
      if (full) {
        if (full.heldDateEnd && !t.event.heldDateEnd) t.event.heldDateEnd = full.heldDateEnd;
        if (full.format && !t.event.format) t.event.format = full.format;
        if (full.meetingUrl && !t.event.meetingUrl) t.event.meetingUrl = full.meetingUrl;
        if (full.onlineCheckin && !t.event.onlineCheckin) t.event.onlineCheckin = full.onlineCheckin;
        if (full.expiredCheckinMinutes !== undefined && t.event.expiredCheckinMinutes === undefined) {
          t.event.expiredCheckinMinutes = full.expiredCheckinMinutes;
        }
        if (full.hasCertificate !== undefined) {
          t.event.hasCertificate = full.hasCertificate;
        }
        if (full.isEnded !== undefined) {
          t.event.isEnded = full.isEnded;
        }
      }
    }
    return t;
  });
}

function getTicketStatus(t) {
  return t.ticketStatus || 'active';
}

function isInactive(t) {
  const s = getTicketStatus(t);
  return s === 'expired' || s === 'cancelled' || s === 'checked_in';
}

function isEventExpired(t) {
  const event = t.event || {};
  if (event.isEnded) return true;
  if (!event.heldDate && !event.heldDateEnd) return false;
  const now = Date.now();
  if (event.heldDateEnd) {
    return now > new Date(event.heldDateEnd).getTime();
  }
  if (event.expiredCheckinMinutes && Number(event.expiredCheckinMinutes) > 0) {
    return now > new Date(event.heldDate).getTime() + Number(event.expiredCheckinMinutes) * 60 * 1000;
  }
  return now > new Date(event.heldDate).getTime() + 3 * 60 * 60 * 1000;
}

function getEffectiveStatus(tkt) {
  if ((tkt.checkIn && tkt.checkIn.status === 'present') || getTicketStatus(tkt) === 'checked_in') {
    return 'checked_in';
  }
  if (getTicketStatus(tkt) === 'cancelled') {
    return 'cancelled';
  }
  if (getTicketStatus(tkt) === 'expired' || isEventExpired(tkt)) {
    return 'expired';
  }
  return 'active';
}

function statusBadgeHTML(status) {
  const map = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    checked_in: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    expired: 'bg-amber-50 text-amber-700 border-amber-200/80',
    cancelled: 'bg-rose-50 text-rose-700 border-rose-200/80',
  };
  const labels = {
    active: t('my_events.status_active', 'Active'),
    checked_in: t('my_events.status_checked_in', 'Checked In'),
    expired: t('my_events.status_expired', 'Expired'),
    cancelled: t('my_events.status_cancelled', 'Cancelled'),
  };
  const cls = map[status] || 'bg-slate-50 text-slate-600 border-slate-200/80';
  return `<span class="inline-flex items-center justify-center h-[26px] px-3 rounded-full text-xs font-semibold ${cls} border shadow-2xs leading-none">${labels[status] || status}</span>`;
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

export function isOnlineEvent(event) {
  if (!event) return false;
  if (event.format === 'online') return true;
  const loc = String(event.location || '').trim().toLowerCase();
  if (loc === 'online' || loc.includes('online') || loc.includes('zoom') || loc.includes('meet') || loc.includes('teams') || loc.includes('webex')) return true;
  if (event.meetingUrl && String(event.meetingUrl).trim().length > 0) return true;
  if (event.onlineCheckin && (event.onlineCheckin.isOpen || event.onlineCheckin.code)) return true;
  return false;
}

function renderEvents() {
  const list = document.getElementById("events-list");
  if (!list) return;

  const validTickets = allTickets.filter(t => t && t.event && (t.event._id || t.event.title));

  const countAllEl = document.getElementById("count-all");
  const countUpcomingEl = document.getElementById("count-upcoming");
  const countCheckedInEl = document.getElementById("count-checked-in");
  const countExpiredEl = document.getElementById("count-expired");
  const summaryEl = document.getElementById("registered-summary-text");

  // 1. Filter by format (Online / Offline / All)
  const formatFiltered = validTickets.filter(t => {
    if (currentFormat === 'all') return true;
    const isOnline = isOnlineEvent(t.event);
    if (currentFormat === 'online') return isOnline;
    if (currentFormat === 'offline') return !isOnline;
    return true;
  });

  const upcomingCount = formatFiltered.filter(t => getEffectiveStatus(t) === 'active').length;
  const checkedInCount = formatFiltered.filter(t => getEffectiveStatus(t) === 'checked_in').length;
  const expiredCount = formatFiltered.filter(t => getEffectiveStatus(t) === 'expired' || getEffectiveStatus(t) === 'cancelled').length;

  if (countAllEl) countAllEl.textContent = formatFiltered.length;
  if (countUpcomingEl) countUpcomingEl.textContent = upcomingCount;
  if (countCheckedInEl) countCheckedInEl.textContent = checkedInCount;
  if (countExpiredEl) countExpiredEl.textContent = expiredCount;
  if (summaryEl) {
    summaryEl.textContent = t('my_events.registered_events_count', `${formatFiltered.length} registered events`).replace('{{n}}', formatFiltered.length);
  }

  if (validTickets.length === 0) {
    list.innerHTML = `
      <div class="text-center py-16 bg-white border border-[#ecedfa] rounded-2xl">
        <span class="material-symbols-outlined text-5xl text-[#64748b] mb-4">event_busy</span>
        <p class="text-lg font-semibold text-[#191b22]">${t('my_events.no_registered_events', 'No registered events yet')}</p>
        <p class="text-sm text-[#64748b] mt-1">${t('my_events.no_registered_events_desc', "You haven't registered for any events yet.")}</p>
        <a href="/explore.html" class="inline-block mt-5 px-6 py-2.5 rounded-xl bg-[#1755ba] text-white text-sm font-medium hover:bg-[#1755ba]/90 transition-all shadow-sm">${t('my_events.explore_btn', 'Explore Events')}</a>
      </div>`;
    return;
  }

  // 2. Filter by status tab
  let eventsToDisplay = formatFiltered;
  if (currentFilter === 'upcoming') {
    eventsToDisplay = formatFiltered.filter(t => getEffectiveStatus(t) === 'active');
  } else if (currentFilter === 'checked_in') {
    eventsToDisplay = formatFiltered.filter(t => getEffectiveStatus(t) === 'checked_in');
  } else if (currentFilter === 'expired') {
    eventsToDisplay = formatFiltered.filter(t => getEffectiveStatus(t) === 'expired' || getEffectiveStatus(t) === 'cancelled');
  }

  if (eventsToDisplay.length === 0) {
    let emptyMsg = t('my_events.no_filtered_events', 'No events in this category');
    let emptyDesc = '';
    if (currentFilter === 'upcoming') {
      emptyDesc = t('my_events.no_events_desc_upcoming', "You don't have any upcoming tickets right now.");
    } else if (currentFilter === 'checked_in') {
      emptyDesc = t('my_events.no_events_desc_checked_in', "You haven't checked into any events yet.");
    } else if (currentFilter === 'expired') {
      emptyDesc = t('my_events.no_events_desc_expired', "No expired events found.");
    } else if (currentFormat !== 'all') {
      emptyDesc = t('my_events.no_events_desc_format', 'Không có vé nào phù hợp với hình thức đã chọn.');
    }

    list.innerHTML = `
      <div class="text-center py-12 bg-white border border-[#ecedfa] rounded-2xl">
        <span class="material-symbols-outlined text-4xl text-[#64748b] mb-3">filter_list_off</span>
        <p class="text-base font-semibold text-[#191b22]">${emptyMsg}</p>
        ${emptyDesc ? `<p class="text-sm text-[#64748b] mt-1">${emptyDesc}</p>` : ''}
      </div>`;
    return;
  }

  list.innerHTML = eventsToDisplay.map(tkt => {
    const effectiveStatus = getEffectiveStatus(tkt);
    const event = tkt.event || {};
    const eventDate = event.heldDate ? formatDate(event.heldDate) : "TBD";

    let checkInInfo = '';
    if (tkt.checkIn && tkt.checkIn.status === 'present') {
      const time = tkt.checkIn.checkedInAt ? formatDate(tkt.checkIn.checkedInAt) : '';
      checkInInfo = `
        <div class="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <span class="material-symbols-outlined text-[16px]">check_circle</span>
          <span>${t('my_events.checked_in', 'Checked in')}</span>
          ${time ? `<span class="text-slate-400 font-normal">• ${time}</span>` : ''}
        </div>`;
    }

    const canRate = canRateEvent(tkt);
    const hasCertificate = Boolean(tkt.certificate);
    const hasReview = Boolean(tkt.review);
    const isCertRevoked = Boolean(tkt.certificate?.isRevoked || tkt.certificate?.status === 'revoked');
    const isCertUnlocked = hasCertificate && hasReview && !isCertRevoked && Boolean(tkt.certificate?.certificateCode);
    const eventId = event._id || '';
    const eventTitle = event.title || 'Unknown Event';
    const safeTitle = eventTitle.replace(/'/g, "\\'");

    let actionButtons = '';
    const isOnline = isOnlineEvent(event);
    const hasOnlineCheckinOpen = Boolean(event.onlineCheckin && event.onlineCheckin.isOpen);
    if (effectiveStatus === 'active') {
      // PIN check-in button is rendered on the right stub
    } else {
      if (canRate) {
        const rateBtnText = (hasCertificate && !isCertRevoked)
          ? t('my_events.rate_to_achieve_cert', 'Đánh giá để nhận chứng nhận')
          : t('my_events.rate_event', 'Rate Event');
        actionButtons += `
          <button class="rate-event-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1755ba] bg-[#1755ba]/10 hover:bg-[#1755ba]/25 transition-all cursor-pointer inline-flex items-center gap-1.5" data-event-id="${eventId}" data-event-title="${safeTitle}">
            <i class="fa-regular fa-star"></i>
            <span>${rateBtnText}</span>
          </button>`;
      } else if (hasReview) {
        actionButtons += `
          <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50">
            <i class="fa-solid fa-star text-amber-500"></i> ${tkt.review.rating}/5
          </span>`;
        if (hasCertificate) {
          if (isCertRevoked) {
            const rawReason = tkt.certificate.revocationReason || t('my_events.revoked_default_reason', 'Thu hồi bởi Ban tổ chức');
            const safeReason = rawReason.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const revokedDate = tkt.certificate.revokedAt ? formatDate(tkt.certificate.revokedAt) : '';
            actionButtons += `
              <button class="revoked-cert-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                      data-cert-code="${tkt.certificate.certificateCode || ''}"
                      data-event-title="${safeTitle}"
                      data-event-id="${eventId}"
                      data-revoked-at="${revokedDate}"
                      data-revocation-reason="${safeReason}">
                <i class="fa-solid fa-ban text-rose-600 text-[11px]"></i>
                <span>${t('my_events.cert_revoked_btn', 'Chứng nhận đã bị thu hồi')}</span>
              </button>`;
          } else if (isCertUnlocked) {
            actionButtons += `
              <button class="view-cert-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all cursor-pointer inline-flex items-center gap-1.5 border border-emerald-200" data-cert-code="${tkt.certificate.certificateCode}" data-event-title="${safeTitle}" data-event-id="${eventId}">
                <i class="fa-solid fa-award"></i>
                <span>${t('my_events.certificate', 'Certificate')}</span>
              </button>`;
          }
        }
      }
    }

    const statusBottomText = effectiveStatus === 'checked_in' 
      ? t('my_events.attended', 'Attended') 
      : (effectiveStatus === 'cancelled' ? t('my_events.status_cancelled', 'Cancelled') : t('my_events.ended', 'Ended'));

    const statusIcon = effectiveStatus === 'checked_in'
      ? 'check_circle'
      : (effectiveStatus === 'cancelled' ? 'cancel' : 'event_busy');

    let statusBadgeTag = '';
    if (effectiveStatus === 'checked_in') {
      statusBadgeTag = `<span class="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-medium">${t('my_events.attended', 'Attended')}</span>`;
    } else if (effectiveStatus === 'expired') {
      statusBadgeTag = `<span class="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 font-medium">${t('my_events.event_ended', 'Event ended')}</span>`;
    }

    const isOnlineDisplay = isOnline;

    let formatBadgeTag = '';
    if (isOnlineDisplay) {
      formatBadgeTag = `<span class="inline-flex items-center justify-center h-[26px] text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 rounded-full border border-emerald-200/80 shadow-2xs leading-none">${t('my_events.format_online', 'Trực tuyến')}</span>`;
    } else {
      formatBadgeTag = `<span class="inline-flex items-center justify-center h-[26px] text-xs font-semibold text-[#1755ba] bg-blue-50 px-3 rounded-full border border-blue-200/80 shadow-2xs leading-none">${t('my_events.format_offline', 'Trực tiếp')}</span>`;
    }

    const eventHasCert = Boolean(
      event.hasCertificate === true || 
      event.hasCertificate === 'true' || 
      tkt.certificate
    );

    let certBadgeTag = '';
    if (isCertRevoked) {
      certBadgeTag = `
        <span class="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-lg text-xs font-bold text-rose-900 bg-rose-50 border border-rose-300/90 shadow-2xs leading-none">
          <i class="fa-solid fa-ban text-rose-600 text-xs"></i>
          <span>${t('my_events.badge_revoked', 'Đã thu hồi')}</span>
        </span>`;
    } else if (eventHasCert) {
      certBadgeTag = `
        <span class="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-lg text-xs font-bold text-amber-900 bg-amber-50 border border-amber-300/90 shadow-2xs leading-none">
          <i class="fa-solid fa-award text-amber-600 text-xs"></i>
          <span>${t('explore.certificate_badge') || 'Certificate'}</span>
        </span>`;
    }

    const showQR = effectiveStatus === 'active' && !isOnline && !!tkt.qrImageUrl;

    return `
      <div id="ticket-card-${eventId}" data-event-id="${eventId}" data-activity-id="${event.activityID || ''}" data-ticket-id="${tkt._id || ''}" class="ticket-card-item group relative flex flex-col md:flex-row bg-white border border-[#ecedfa] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
        <div class="relative w-full md:w-48 h-36 md:h-auto min-h-[144px] flex-shrink-0 bg-slate-100 overflow-hidden cursor-pointer event-card-preview" data-event-id="${eventId}">
          <img src="${event.thumbnail || 'https://images.unsplash.com/photo-1618477462146-050d2767eac4?q=80&w=1200&auto=format&fit=crop'}" 
               alt="${eventTitle}" 
               class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden"></div>
          <div class="absolute top-3 left-3 md:hidden flex items-center gap-1.5 flex-wrap">
            ${statusBadgeHTML(effectiveStatus)}
            ${formatBadgeTag}
            ${certBadgeTag}
          </div>
        </div>

        <div class="flex-grow p-5 flex flex-col justify-between min-w-0">
          <div class="min-w-0">
            <div class="hidden md:flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2 flex-wrap">
                ${statusBadgeHTML(effectiveStatus)}
                ${formatBadgeTag}
                ${certBadgeTag}
              </div>
              ${statusBadgeTag}
            </div>
            <h3 class="font-bold text-[#191b22] text-lg md:text-xl line-clamp-1 group-hover:text-[#1755ba] transition-colors duration-200 mb-2 cursor-pointer event-card-preview" data-event-id="${eventId}" title="${eventTitle}">${eventTitle}</h3>
            
            <div class="space-y-1.5 text-sm text-[#64748b] min-w-0">
              <div class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-outlined text-[18px] text-[#1755ba] shrink-0">calendar_today</span>
                <span class="truncate">${eventDate}</span>
              </div>
              ${isOnline ? `
              <div class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-outlined text-[18px] text-emerald-600 shrink-0">videocam</span>
                <span class="truncate font-medium text-emerald-700">${t('my_events.online_event_label', 'Sự kiện trực tuyến (Google Meet / Zoom)')}</span>
                ${event.meetingUrl ? `
                  <a href="${event.meetingUrl}" target="_blank" rel="noopener noreferrer" class="ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all">
                    <span>${t('my_events.join_meeting', 'Vào phòng')}</span>
                    <span class="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                ` : ''}
              </div>` : (event.location ? `
              <div class="flex items-center gap-2 min-w-0">
                <span class="material-symbols-outlined text-[18px] text-[#1755ba] shrink-0">location_on</span>
                <span class="truncate" title="${event.location}">${event.location}</span>
              </div>` : '')}
              ${checkInInfo ? `<div class="flex items-center gap-2 min-w-0">${checkInInfo}</div>` : ''}
            </div>
          </div>

          ${actionButtons ? `
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            ${actionButtons}
          </div>` : (effectiveStatus === 'active' ? `
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
            <span class="material-symbols-outlined text-[16px]">info</span>
            <span>${t('my_events.unlock_features', 'Participate and check in to unlock features')}</span>
          </div>` : '')}
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
          ${effectiveStatus === 'active' ? (
            isOnline ? `
              <div class="w-24 h-24 rounded-xl border border-emerald-200 bg-white p-2 flex flex-col items-center justify-center shadow-xs cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all pin-checkin-btn group/pin" data-event-id="${eventId}" data-event-title="${safeTitle}" title="${t('my_events.pin_checkin_btn', 'Online PIN Check-in')}">
                <div class="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover/pin:scale-105 group-hover/pin:bg-emerald-100/70 transition-all">
                  <span class="material-symbols-outlined text-3xl">dialpad</span>
                </div>
                <span class="mt-1 text-[9px] font-bold text-emerald-700 uppercase tracking-wider">PIN CODE</span>
              </div>
              <span class="mt-2 text-[10px] font-mono text-slate-400 uppercase">ONLINE PASS</span>
            ` : (
              showQR ? `
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
              ` : `
                <div class="w-24 h-24 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 flex flex-col items-center justify-center gap-1 select-none">
                  <span class="material-symbols-outlined text-3xl">qr_code_2</span>
                  <span class="text-[9px] font-bold uppercase tracking-wider">No QR</span>
                </div>
              `
            )
          ) : `
            <div class="w-24 h-24 rounded-xl ${effectiveStatus === 'checked_in' ? 'bg-emerald-50 border border-emerald-200/60 text-emerald-600' : (effectiveStatus === 'cancelled' ? 'bg-rose-50 border border-rose-200/60 text-rose-600' : 'bg-slate-100 border border-slate-200 text-slate-400')} flex flex-col items-center justify-center gap-1 select-none">
              <span class="material-symbols-outlined text-3xl">${statusIcon}</span>
              <span class="text-[9px] font-bold uppercase tracking-wider">${statusBottomText}</span>
            </div>
          `}
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

  // Certificate buttons (unlocked)
  document.querySelectorAll(".view-cert-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const certCode = btn.dataset.certCode;
      const eventTitle = btn.dataset.eventTitle;
      const eventId = btn.dataset.eventId;
      openCertModal(certCode, eventTitle, eventId);
    });
  });

  // Revoked Certificate buttons
  document.querySelectorAll(".revoked-cert-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const certCode = btn.dataset.certCode || '';
      const eventTitle = btn.dataset.eventTitle || 'Event';
      const reason = btn.dataset.revocationReason || '';
      const date = btn.dataset.revokedAt || '';
      openRevokedModal(certCode, eventTitle, reason, date);
    });
  });

  // Locked Certificate buttons (require rating)
  document.querySelectorAll(".locked-cert-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const eventId = btn.dataset.eventId;
      const eventTitle = btn.dataset.eventTitle;
      showToast(t('my_events.rate_first_to_get_cert', 'Please rate this event first to unlock and receive your certificate!'), 'info');
      openRateModal(eventId, eventTitle, { unlockCert: true });
    });
  });

  // PIN Check-in clicks
  document.querySelectorAll(".pin-checkin-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const eventId = btn.dataset.eventId;
      const eventTitle = btn.dataset.eventTitle;
      openPinModal(eventId, eventTitle);
    });
  });
}

// ─── Online PIN Check-in Modal ───

let currentPinEventId = null;

function openPinModal(eventId, eventTitle) {
  currentPinEventId = eventId;
  const modal = document.getElementById("pin-modal");
  const eventName = document.getElementById("pin-modal-event-name");
  const input = document.getElementById("pin-input");
  const errorMsg = document.getElementById("pin-error-msg");
  if (eventName) eventName.textContent = eventTitle || "Event";
  if (input) {
    input.value = "";
    input.disabled = false;
  }
  if (errorMsg) {
    errorMsg.textContent = "";
    errorMsg.classList.add("hidden");
  }

  if (modal) {
    modal.hidden = false;
    requestAnimationFrame(() => {
      modal.classList.remove("opacity-0", "pointer-events-none");
      const content = document.getElementById("pin-modal-content");
      content?.classList.remove("scale-95");
      content?.classList.add("scale-100");
    });
    setTimeout(() => input?.focus(), 150);
  }
}

function closePinModal() {
  const modal = document.getElementById("pin-modal");
  if (!modal) return;
  const content = document.getElementById("pin-modal-content");
  modal.classList.add("opacity-0", "pointer-events-none");
  content?.classList.remove("scale-100");
  content?.classList.add("scale-95");
  setTimeout(() => {
    if (modal.classList.contains("opacity-0")) {
      modal.hidden = true;
    }
  }, 300);
  currentPinEventId = null;
}

// ─── Rate Modal ───

function updateStarRatingUI(displayRating) {
  document.querySelectorAll("#star-rating .star").forEach((s, i) => {
    const isLit = i < displayRating;
    if (isLit) {
      s.classList.remove("text-slate-200");
      s.classList.add("text-yellow-400", "active");
    } else {
      s.classList.remove("text-yellow-400", "active");
      s.classList.add("text-slate-200");
    }
    s.setAttribute("aria-checked", i + 1 === selectedRating ? "true" : "false");
  });
}

function openRateModal(eventId, eventTitle, options = {}) {
  currentRateEventId = eventId;
  selectedRating = 0;
  document.getElementById("rate-modal-event-name").textContent = eventTitle;
  document.getElementById("rate-review-content").value = "";
  document.getElementById("submit-rate-btn").disabled = true;

  const certNotice = document.getElementById("rate-modal-cert-notice");
  if (certNotice) {
    const tkt = allTickets.find(t => t?.event && String(t.event._id) === String(eventId));
    const willUnlockCert = options.unlockCert || (tkt && !!tkt.certificate && !tkt.review);
    if (willUnlockCert) {
      certNotice.classList.remove("hidden");
    } else {
      certNotice.classList.add("hidden");
    }
  }

  updateStarRatingUI(0);
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

function openCertModal(certCode, eventTitle, eventId) {
  // Guard: if user has not reviewed the event, redirect to rate modal
  const targetTkt = allTickets.find(t => {
    if (eventId && t?.event && String(t.event._id) === String(eventId)) return true;
    if (certCode && t?.certificate?.certificateCode === certCode) return true;
    return false;
  });

  if (targetTkt && !targetTkt.review) {
    showToast(t('my_events.rate_first_to_get_cert', 'Please rate this event first to unlock and receive your certificate!'), 'warning');
    openRateModal(targetTkt.event?._id || eventId, eventTitle, { unlockCert: true });
    return;
  }

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

// ─── Revoked Certificate Modal ───

function openRevokedModal(certCode, eventTitle, reason, date) {
  const nameEl = document.getElementById("revoked-modal-event-name");
  const codeEl = document.getElementById("revoked-modal-code");
  const reasonEl = document.getElementById("revoked-modal-reason");
  const dateEl = document.getElementById("revoked-modal-date");

  if (nameEl) nameEl.textContent = eventTitle || "Event";
  if (codeEl) codeEl.textContent = certCode || "N/A";
  if (reasonEl) reasonEl.textContent = reason || t('my_events.revoked_default_reason', 'Thu hồi bởi Ban tổ chức');
  if (dateEl) {
    dateEl.textContent = date 
      ? t('my_events.revoked_at_label', `Thu hồi lúc: ${date}`).replace('{{date}}', date)
      : '';
  }

  const modal = document.getElementById("revoked-cert-modal");
  const content = modal?.querySelector(".bg-white");
  if (!modal || !content) return;
  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.remove("opacity-0", "pointer-events-none");
    content.classList.remove("scale-95");
    content.classList.add("scale-100");
  });
}

function closeRevokedModal() {
  const modal = document.getElementById("revoked-cert-modal");
  const content = modal?.querySelector(".bg-white");
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

  const starContainer = document.getElementById("star-rating");
  const stars = document.querySelectorAll("#star-rating .star");

  stars.forEach(star => {
    star.addEventListener("mouseenter", () => {
      const hoverRating = parseInt(star.dataset.rating, 10);
      updateStarRatingUI(hoverRating);
    });

    star.addEventListener("focus", () => {
      const hoverRating = parseInt(star.dataset.rating, 10);
      updateStarRatingUI(hoverRating);
    });

    star.addEventListener("click", () => {
      const rating = parseInt(star.dataset.rating, 10);
      selectedRating = rating;
      updateStarRatingUI(selectedRating);
      document.getElementById("submit-rate-btn").disabled = false;
    });
  });

  starContainer?.addEventListener("mouseleave", () => {
    updateStarRatingUI(selectedRating);
  });

  document.getElementById("submit-rate-btn").addEventListener("click", async () => {
    if (!currentRateEventId || !selectedRating) return;
    const content = document.getElementById("rate-review-content").value.trim();
    const btn = document.getElementById("submit-rate-btn");
    btn.disabled = true;
    btn.textContent = t("my_events.rate_modal_submitting", "Submitting...");
    const ratedEventId = currentRateEventId;
    try {
      await addEventReview(ratedEventId, selectedRating, content);
      closeRateModal();

      // Refresh tickets from server to get updated review and unlocked certificate
      try {
        const { tickets } = await getMyTickets();
        if (Array.isArray(tickets)) {
          const actMap = await fetchActivitiesMap();
          allTickets = enrichTicketsWithActivities(
            tickets.filter(t => t && t.event && (t.event._id || t.event.title)),
            actMap
          );
        }
      } catch (refErr) {
        console.warn("Failed to re-fetch tickets, updating in-memory:", refErr);
        const tkt = allTickets.find(t => {
          const ev = t.event || {};
          return String(ev._id) === String(ratedEventId);
        });
        if (tkt) {
          tkt.review = { rating: selectedRating, content };
        }
      }

      renderEvents();

      // Check if this event unlocked a certificate
      const updatedTkt = allTickets.find(t => {
        const ev = t.event || {};
        return String(ev._id) === String(ratedEventId);
      });

      if (updatedTkt && updatedTkt.certificate && updatedTkt.certificate.certificateCode) {
        showToast(t("my_events.rate_success_cert_unlocked", "Thank you for your review! Your certificate has been unlocked 🎉"), "success");
        setTimeout(() => {
          openCertModal(
            updatedTkt.certificate.certificateCode,
            updatedTkt.event?.title || "Event",
            ratedEventId
          );
        }, 350);
      } else {
        showToast(t("my_events.rate_success", "Thank you for submitting your review!"), "success");
      }
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

  // Revoked certificate modal
  const revokedModal = document.getElementById("revoked-cert-modal");
  document.getElementById("close-revoked-modal")?.addEventListener("click", closeRevokedModal);
  document.getElementById("revoked-modal-close-btn")?.addEventListener("click", closeRevokedModal);
  revokedModal?.addEventListener("click", (e) => {
    if (e.target === revokedModal) closeRevokedModal();
  });

  // QR zoom modal
  const qrModal = document.getElementById("qr-modal");
  document.getElementById("close-qr-modal")?.addEventListener("click", closeQrModal);
  qrModal?.addEventListener("click", (e) => {
    if (e.target === qrModal) closeQrModal();
  });

  // Online PIN check-in modal
  const pinModal = document.getElementById("pin-modal");
  document.getElementById("close-pin-modal")?.addEventListener("click", closePinModal);
  pinModal?.addEventListener("click", (e) => {
    if (e.target === pinModal) closePinModal();
  });

  const pinForm = document.getElementById("pin-checkin-form");
  pinForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentPinEventId) return;

    const input = document.getElementById("pin-input");
    const code = (input?.value || "").trim();
    const errorMsg = document.getElementById("pin-error-msg");
    const submitBtn = document.getElementById("submit-pin-btn");

    if (!code || code.length < 4) {
      if (errorMsg) {
        errorMsg.textContent = t("my_events.invalid_pin_format", {}, "Vui lòng nhập mã PIN hợp lệ (4-6 chữ số)");
        errorMsg.classList.remove("hidden");
      }
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> <span>${t("common.processing", {}, "Đang xử lý...")}</span>`;
      if (errorMsg) errorMsg.classList.add("hidden");

      const res = await verifyOnlineCheckin(currentPinEventId, code);
      showToast(res.message || t("my_events.checkin_success", {}, "Điểm danh trực tuyến thành công! 🎉"), "success");
      closePinModal();

      // Update ticket in local array immediately
      const targetTkt = allTickets.find(t => String(t.event?._id) === String(currentPinEventId));
      if (targetTkt) {
        targetTkt.ticketStatus = 'checked_in';
        targetTkt.checkIn = {
          status: 'present',
          checkedInAt: new Date().toISOString()
        };
      }
      renderEvents();

      // Background re-fetch to ensure sync with server
      try {
        const fresh = await getMyTickets();
        if (fresh && fresh.tickets) {
          const actMap = await fetchActivitiesMap();
          allTickets = enrichTicketsWithActivities(
            fresh.tickets.filter(t => t && t.event && (t.event._id || t.event.title)),
            actMap
          );
          renderEvents();
        }
      } catch (e) {
        console.warn("Silent ticket refresh failed:", e);
      }
    } catch (err) {
      console.error("PIN checkin error:", err);
      if (errorMsg) {
        errorMsg.textContent = err.message || t("my_events.pin_checkin_failed", {}, "Điểm danh không thành công. Vui lòng kiểm tra lại mã PIN.");
        errorMsg.classList.remove("hidden");
      } else {
        showToast(err.message || t("my_events.pin_checkin_failed", {}, "Điểm danh thất bại"), "error");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">verified</span> <span>${t("my_events.confirm_checkin", {}, "Xác nhận điểm danh")}</span>`;
    }
  });

  // Global Escape key listener
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeRateModal();
      closeCertModal();
      closeQrModal();
      closePinModal();
    }
  });
}

let activeAuraCleanup = null;

export function highlightTicket(targetEventId) {
  if (!targetEventId) return;

  const eventsList = document.getElementById("events-list");
  const card = document.getElementById(`ticket-card-${targetEventId}`) 
    || document.querySelector(`.ticket-card-item[data-event-id="${targetEventId}"]`)
    || document.querySelector(`.ticket-card-item[data-activity-id="${targetEventId}"]`)
    || document.querySelector(`.ticket-card-item[data-ticket-id="${targetEventId}"]`);

  if (!card) return;

  // Clear any existing active aura highlight
  if (typeof activeAuraCleanup === "function") {
    activeAuraCleanup();
    activeAuraCleanup = null;
  }

  // Clear aura class on any other cards
  document.querySelectorAll(".ticket-highlight-aura").forEach(el => {
    el.classList.remove("ticket-highlight-aura");
  });

  // Scroll to the card smoothly centered in viewport
  setTimeout(() => {
    card.scrollIntoView({ behavior: "smooth", block: "center" });

    if (eventsList) {
      eventsList.classList.add("ticket-aura-focus");
    }

    // Trigger reflow & add aura
    card.classList.remove("ticket-highlight-aura");
    void card.offsetWidth;
    card.classList.add("ticket-highlight-aura");

    // Add monochromatic badge inside top-right of the card
    let badge = card.querySelector(".ticket-aura-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "ticket-aura-badge absolute top-3 right-3 z-30 px-3 py-1 rounded-full text-xs font-bold text-white bg-[#1755ba] shadow-md shadow-[#1755ba]/35 flex items-center gap-1.5 pointer-events-none transition-all duration-500 animate-fadeIn";
      const isVi = getLang() === "vi";
      badge.innerHTML = `<span class="material-symbols-outlined text-[15px]">verified</span><span>${isVi ? "Vừa đăng ký" : "Just Registered"}</span>`;
      card.appendChild(badge);
    }

    // Dismissal function to smoothly restore all tickets
    let isDismissed = false;
    const dismissAura = () => {
      if (isDismissed) return;
      isDismissed = true;
      if (eventsList) eventsList.classList.remove("ticket-aura-focus");
      card.classList.remove("ticket-highlight-aura");
      if (badge) {
        badge.classList.add("opacity-0", "translate-y-[-4px]");
        setTimeout(() => badge.remove(), 400);
      }
      document.removeEventListener("click", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
      activeAuraCleanup = null;
    };

    const onClickOutside = (e) => {
      if (!card.contains(e.target)) {
        dismissAura();
      }
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        dismissAura();
      }
    };

    // Listeners for manual dismissal after initial transition
    setTimeout(() => {
      document.addEventListener("click", onClickOutside);
      document.addEventListener("keydown", onKeyDown);
    }, 450);

    // Auto-dismiss after 5 seconds
    const timer = setTimeout(dismissAura, 5000);

    activeAuraCleanup = () => {
      clearTimeout(timer);
      dismissAura();
    };
  }, 250);
}

function setFilter(filter) {
  currentFilter = filter;

  const tabs = {
    all: document.getElementById("tab-all"),
    upcoming: document.getElementById("tab-upcoming"),
    checked_in: document.getElementById("tab-checked-in"),
    expired: document.getElementById("tab-expired"),
  };

  Object.entries(tabs).forEach(([key, btn]) => {
    if (!btn) return;
    const isSelected = key === filter;
    btn.setAttribute("aria-selected", isSelected ? "true" : "false");
    const countBadge = btn.querySelector("span:last-child");

    if (isSelected) {
      btn.className = "filter-tab px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-white text-[#1755ba] shadow-sm";
      if (countBadge) countBadge.className = "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-[#1755ba]/10 text-[#1755ba]";
    } else {
      btn.className = "filter-tab px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-slate-600 hover:text-slate-900";
      if (countBadge) countBadge.className = "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-600";
    }
  });

  renderEvents();
}

function setupFilterTabs() {
  document.getElementById("tab-all")?.addEventListener("click", () => setFilter('all'));
  document.getElementById("tab-upcoming")?.addEventListener("click", () => setFilter('upcoming'));
  document.getElementById("tab-checked-in")?.addEventListener("click", () => setFilter('checked_in'));
  document.getElementById("tab-expired")?.addEventListener("click", () => setFilter('expired'));

  const formatSelect = document.getElementById("ticketFormatSelect");
  if (formatSelect) {
    enhanceSelect(formatSelect);
    formatSelect.addEventListener("change", (e) => {
      currentFormat = e.target.value || 'all';
      renderEvents();
    });
  }
}

function checkAndHighlightTicket() {
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get("event") 
    || urlParams.get("highlight") 
    || urlParams.get("id") 
    || sessionStorage.getItem("lastRegisteredEventId");

  if (!targetId) return;

  try {
    sessionStorage.removeItem("lastRegisteredEventId");
  } catch {}

  const validTickets = allTickets.filter(t => t && t.event && (t.event._id || t.event.title));
  const targetTicket = validTickets.find(t => String(t.event?._id) === String(targetId) || String(t.event?.activityID) === String(targetId) || String(t._id) === String(targetId));

  if (targetTicket) {
    const effectiveStatus = getEffectiveStatus(targetTicket);
    const targetFilter = effectiveStatus === 'active' ? 'upcoming' : effectiveStatus;
    if (currentFilter !== 'all' && currentFilter !== targetFilter) {
      setFilter('all');
    }
    highlightTicket(targetId);
  }

  // Clean URL query param cleanly without reloading
  if (urlParams.has("event") || urlParams.has("highlight") || urlParams.has("id")) {
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

if (typeof window !== "undefined") {
  window.highlightTicket = highlightTicket;
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
  setupFilterTabs();

  const list = document.getElementById("events-list");
  if (!list) return;

  try {
    const actMapPromise = fetchActivitiesMap();
    const ticketsPromise = getMyTickets();
    const [{ tickets }, actMap] = await Promise.all([
      ticketsPromise,
      actMapPromise
    ]);

    const validRaw = (tickets || []).filter(t => t && t.event && (t.event._id || t.event.title));
    allTickets = enrichTicketsWithActivities(validRaw, actMap);

    const validTickets = allTickets;

    const filterBar = document.getElementById("filter-bar");
    if (filterBar) {
      if (validTickets.length > 0) {
        filterBar.classList.remove("hidden");
      } else {
        filterBar.classList.add("hidden");
      }
    }

    renderEvents();
    checkAndHighlightTicket();
  } catch (err) {
    console.error("Failed to load events:", err);
    list.innerHTML = `<div class="text-center py-12 text-red-500 font-medium bg-white border border-red-100 rounded-2xl">${t("my_events.failed_load", "Failed to load events. Please try again later.")}</div>`;
  }
}

window.addEventListener("language-changed", () => {
  applyTranslation();
  renderEvents();
});

loadPage();
