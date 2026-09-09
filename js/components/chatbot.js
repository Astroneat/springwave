import { isAuthenticated, getUser } from "../lib/session.js";
import { sendChatMessage, sendChatMessageStream, fetchChatHistory, clearChatHistory } from "../api/chatbot.js";
import { t, applyTranslation } from "../lib/i18n.js";
import { openEventPopup } from "./eventPopup.js";
import { formatDate } from "../lib/utils.js";
import { CDN_DOMAIN } from "../config.js";

const HISTORY_KEY = "springwave_chat_history";
const MAX_HISTORY = 50;

let isOpen = false;
let isSending = false;
let conversationHistory = [];

function formatCardDate(dateStr) {
  if (!dateStr) return "";
  if (dateStr.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    try {
      return formatDate(dateStr);
    } catch {
      return dateStr;
    }
  }
  return dateStr;
}

function escapeHtml(text) {
  if (!text) return "";
  const d = document.createElement("div");
  d.textContent = String(text);
  return d.innerHTML;
}

/**
 * 1. Standard Event Card Renderer
 */
function renderEventCardFromJSON(data) {
  const cleanId = escapeHtml(String(data.id || data.eventId || "").trim());
  if (!cleanId) return "";

  const cleanTitle = escapeHtml(String(data.title || data.name || t("chatbot.event")).trim());
  const cleanType = escapeHtml(String(data.type || data.category || t("chatbot.event")).trim());
  const cleanStatus = escapeHtml(String(data.status || t("chatbot.ongoing")).trim());
  
  const rawTime = data.time || data.heldDate || data.startDate || "";
  const cleanTime = escapeHtml(formatCardDate(rawTime));
  
  const rawDeadline = data.deadline || data.applicationDeadline || data.regDeadline || "";
  const cleanDeadline = escapeHtml(formatCardDate(rawDeadline));
  
  const cleanLocation = escapeHtml(String(data.location || data.address || "").trim());

  const statusUpper = cleanStatus.toUpperCase();
  let statusBadgeClass = "status-ended";
  if (statusUpper.includes("ĐANG") || statusUpper.includes("ONGOING")) {
    statusBadgeClass = "status-ongoing";
  } else if (statusUpper.includes("SẮP") || statusUpper.includes("UPCOMING")) {
    statusBadgeClass = "status-upcoming";
  }

  const html = `
  <div class="chatbot-event-card" data-event-id="${cleanId}">
    <div class="chatbot-event-card-content">
      <div class="chatbot-event-card-badges-row">
        <span class="chatbot-pill-type"><i class="fa-solid fa-tag"></i> ${cleanType}</span>
        <span class="chatbot-pill-status ${statusBadgeClass}">${cleanStatus}</span>
      </div>
      <h4 class="chatbot-event-card-title">${cleanTitle}</h4>
      <div class="chatbot-info-box">
        ${cleanTime ? `
          <div class="info-row">
            <i class="fa-regular fa-calendar info-icon text-blue-500"></i>
            <span class="info-value"><strong>${t("chatbot.start")}</strong> ${cleanTime}</span>
          </div>` : ''}
        ${cleanDeadline ? `
          <div class="info-row">
            <i class="fa-regular fa-clock info-icon text-amber-500"></i>
            <span class="info-value"><strong class="text-amber-600">${t("chatbot.deadline")}</strong> ${cleanDeadline}</span>
          </div>` : ''}
        ${cleanLocation ? `
          <div class="info-row">
            <i class="fa-solid fa-location-dot info-icon text-red-500"></i>
            <span class="info-value"><strong>${t("chatbot.location")}</strong> ${cleanLocation}</span>
          </div>` : ''}
      </div>
      <button type="button" data-event-id="${cleanId}" class="chat-event-btn-blue">
        <span><i class="fa-solid fa-eye"></i> ${t("cards.view_details", {}, "Xem chi tiết")}</span>
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>
  </div>`;
  return html.replace(/\n/g, " ");
}

/**
 * 2. Agentic Action Cards Renderer
 */
function renderActionCardFromJSON(data) {
  if (!data || typeof data !== "object") return "";

  const cardType = data.type || "action_success";

  // CASE A: Ticket Card (Register Success / My Ticket)
  if (cardType === "ticket_card") {
    const event = data.event || {};
    const ticket = data.ticket || {};
    const cleanId = escapeHtml(event.id || "");
    const cleanTitle = escapeHtml(event.title || t("chatbot.event", "Sự kiện"));
    const cleanTime = escapeHtml(formatCardDate(event.heldDate || ""));
    const cleanLocation = escapeHtml(event.location || t("common.unknown", "Chưa cập nhật"));
    const ticketCode = escapeHtml(ticket.ticketCode || "TICKET");
    const qrImageUrl = escapeHtml(ticket.qrImageUrl || "");

    return `
    <div class="chatbot-action-card card-ticket" data-event-id="${cleanId}">
      <div class="action-card-header">
        <span class="action-card-badge-ticket"><i class="fa-solid fa-ticket"></i> ${t("chatbot.actions.ticket_valid", "VÉ THAM GIA HỢP LỆ")}</span>
        <span class="action-ticket-code">#${ticketCode}</span>
      </div>
      <div class="action-card-body">
        <h4 class="action-card-title">${cleanTitle}</h4>
        <div class="action-card-meta">
          ${cleanTime ? `<div class="meta-item"><i class="fa-regular fa-calendar text-blue-500"></i> <span>${cleanTime}</span></div>` : ''}
          ${cleanLocation ? `<div class="meta-item"><i class="fa-solid fa-location-dot text-red-500"></i> <span>${cleanLocation}</span></div>` : ''}
        </div>
      </div>
      <div class="action-card-actions">
        ${qrImageUrl ? `
          <button type="button" class="action-btn-primary" data-action-qr="${qrImageUrl}" data-ticket-code="${ticketCode}" data-event-title="${cleanTitle}">
            <i class="fa-solid fa-qrcode"></i> <span>${t("chatbot.actions.open_qr", "Mở mã QR Check-in")}</span>
          </button>
        ` : ''}
        ${cleanId ? `
          <button type="button" class="action-btn-secondary" data-event-id="${cleanId}">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> <span>${t("chatbot.actions.event_details", "Chi tiết sự kiện")}</span>
          </button>
        ` : ''}
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE A2: Non-Partner Card (Direct external registration)
  if (cardType === "non_partner_card" || data.isNonPartner) {
    const event = data.event || {};
    const cleanId = escapeHtml(event.id || "");
    const cleanTitle = escapeHtml(event.title || t("chatbot.event", "Sự kiện"));
    const cleanHost = escapeHtml(event.hostName || t("chatbot.actions.external_unit", "Đơn vị ngoài"));
    const cleanTime = escapeHtml(formatCardDate(event.heldDate || ""));
    const cleanLocation = escapeHtml(event.location || t("common.unknown", "Chưa cập nhật"));
    const regLink = escapeHtml(event.registrationLink || "");

    return `
    <div class="chatbot-action-card card-non-partner" data-event-id="${cleanId}">
      <div class="action-card-header header-non-partner">
        <span class="action-card-badge-non-partner"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${t("chatbot.actions.non_partner", "ĐỐI TÁC NGOÀI")}</span>
        <span class="action-host-name">${cleanHost}</span>
      </div>
      <div class="action-card-body">
        <h4 class="action-card-title">${cleanTitle}</h4>
        <div class="action-card-meta">
          ${cleanTime ? `<div class="meta-item"><i class="fa-regular fa-calendar text-indigo-500"></i> <span>${cleanTime}</span></div>` : ''}
          ${cleanLocation ? `<div class="meta-item"><i class="fa-solid fa-location-dot text-red-500"></i> <span>${cleanLocation}</span></div>` : ''}
        </div>
        <p class="non-partner-notice"><i class="fa-solid fa-circle-info text-indigo-500"></i> ${t("chatbot.actions.non_partner_notice", "Sự kiện đăng ký trực tiếp qua cổng của Ban tổ chức (không dùng mã QR điểm danh của SpringWave).")}</p>
      </div>
      <div class="action-card-actions">
        ${regLink ? `
          <a href="${regLink}" target="_blank" rel="noopener noreferrer" class="action-btn-external">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> <span>${t("chatbot.actions.open_external_reg", "Mở link đăng ký gốc của BTC")}</span>
          </a>
        ` : ''}
        ${cleanId ? `
          <button type="button" class="action-btn-secondary" data-event-id="${cleanId}">
            <i class="fa-solid fa-eye"></i> <span>${t("chatbot.actions.view_post_details", "Xem chi tiết bài viết")}</span>
          </button>
        ` : ''}
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE B: Schedule Conflict Card
  if (cardType === "conflict_card") {
    const target = data.targetEvent || {};
    const conflict = data.conflictingEvent || {};
    const targetId = escapeHtml(target.id || "");
    const targetTitle = escapeHtml(target.title || t("chatbot.event", "Sự kiện mới"));
    const targetTime = escapeHtml(formatCardDate(target.heldDate || ""));
    const conflictTitle = escapeHtml(conflict.title || t("chatbot.event", "Sự kiện đã đăng ký"));
    const conflictTime = escapeHtml(formatCardDate(conflict.heldDate || ""));

    return `
    <div class="chatbot-action-card card-conflict">
      <div class="action-card-header header-warning">
        <span class="action-card-badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> ${t("chatbot.actions.conflict_warning", "CẢNH BÁO TRÙNG LỊCH")}</span>
      </div>
      <div class="action-card-body">
        <p class="conflict-desc">${t("chatbot.actions.conflict_desc", "Mốc thời gian của sự kiện mới bị trùng với sự kiện bạn đã đăng ký trước đó:")}</p>
        <div class="conflict-item target">
          <div class="conflict-tag">${t("chatbot.actions.new_event_tag", "Sự kiện mới:")}</div>
          <div class="conflict-title font-semibold">${targetTitle}</div>
          <div class="conflict-time text-xs text-slate-500">${targetTime}</div>
        </div>
        <div class="conflict-item existing">
          <div class="conflict-tag">${t("chatbot.actions.existing_event_tag", "Đã đăng ký trước:")}</div>
          <div class="conflict-title font-semibold">${conflictTitle}</div>
          <div class="conflict-time text-xs text-slate-500">${conflictTime}</div>
        </div>
      </div>
      <div class="action-card-actions">
        <button type="button" class="action-btn-confirm" data-action-conflict-confirm="true" data-event-id="${targetId}">
          <i class="fa-solid fa-bolt"></i> <span>${t("chatbot.actions.conflict_confirm", "Vẫn muốn đăng ký")}</span>
        </button>
        <button type="button" class="action-btn-cancel" data-action-conflict-cancel="true">
          <i class="fa-solid fa-xmark"></i> <span>${t("chatbot.actions.conflict_cancel", "Bỏ qua")}</span>
        </button>
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE C: My Tickets List
  if (cardType === "my_tickets_list") {
    const tickets = Array.isArray(data.tickets) ? data.tickets : [];
    if (tickets.length === 0) {
      return `
      <div class="chatbot-action-card card-empty">
        <i class="fa-solid fa-ticket-simple text-3xl text-slate-300 mb-2"></i>
        <p class="text-xs text-slate-600 font-medium">${escapeHtml(data.message || t("chatbot.actions.no_tickets", "Bạn chưa có vé tham gia sự kiện nào còn hiệu lực."))}</p>
      </div>`.replace(/\n/g, " ");
    }

    const itemsHtml = tickets.map(t => {
      const ev = t.event || {};
      const evTitle = escapeHtml(ev.title || "Sự kiện");
      const evTime = escapeHtml(formatCardDate(ev.heldDate || ""));
      const tCode = escapeHtml(t.ticketCode || "");
      const qrUrl = escapeHtml(t.qrImageUrl || "");
      const evId = escapeHtml(ev.id || "");

      return `
      <div class="ticket-row-item">
        <div class="ticket-row-info">
          <div class="ticket-row-title">${evTitle}</div>
          <div class="ticket-row-time text-xs text-slate-500">${evTime}</div>
          <span class="ticket-row-code">#${tCode}</span>
        </div>
        <div class="ticket-row-btn-group">
          ${qrUrl ? `<button type="button" class="ticket-row-qr-btn" data-action-qr="${qrUrl}" data-ticket-code="${tCode}" data-event-title="${evTitle}"><i class="fa-solid fa-qrcode"></i></button>` : ''}
          ${evId ? `<button type="button" class="ticket-row-view-btn" data-event-id="${evId}"><i class="fa-solid fa-eye"></i></button>` : ''}
        </div>
      </div>`;
    }).join("");

    return `
    <div class="chatbot-action-card card-tickets-list">
      <div class="action-card-header">
        <span class="action-card-badge-ticket"><i class="fa-solid fa-list-check"></i> ${t("chatbot.actions.registered_tickets", { n: tickets.length }, `VÉ ĐÃ ĐĂNG KÝ (${tickets.length})`)}</span>
      </div>
      <div class="tickets-list-scroll">
        ${itemsHtml}
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE D: Favorite Confirmation
  if (cardType === "favorite_confirm") {
    const isFav = Boolean(data.isFavorite);
    const ev = data.event || {};
    const evTitle = escapeHtml(ev.title || "Sự kiện");

    return `
    <div class="chatbot-action-card card-favorite">
      <div class="favorite-icon-box ${isFav ? 'fav-added' : 'fav-removed'}">
        <i class="fa-solid fa-heart"></i>
      </div>
      <div class="favorite-content">
        <h4 class="action-card-title">${evTitle}</h4>
        <p class="text-xs text-slate-600">${escapeHtml(data.message || "")}</p>
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE E: Extracurricular Stats
  if (cardType === "user_stats") {
    const stats = data.stats || {};
    return `
    <div class="chatbot-action-card card-stats">
      <div class="action-card-header">
        <span class="action-card-badge-ticket"><i class="fa-solid fa-chart-pie"></i> ${t("chatbot.actions.activity_stats", "THỐNG KÊ HOẠT ĐỘNG")}</span>
      </div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-val text-blue-600">${stats.activeTickets || 0}</div>
          <div class="stat-label">${t("chatbot.actions.active_tickets", "Vé hiệu lực")}</div>
        </div>
        <div class="stat-box">
          <div class="stat-val text-emerald-600">${stats.attendedEvents || 0}</div>
          <div class="stat-label">${t("chatbot.actions.attended_events", "Đã tham gia")}</div>
        </div>
        <div class="stat-box">
          <div class="stat-val text-purple-600">${stats.certificates || 0}</div>
          <div class="stat-label">${t("chatbot.actions.certificates_count", "Chứng nhận")}</div>
        </div>
        <div class="stat-box">
          <div class="stat-val text-rose-500">${stats.favoritesCount || 0}</div>
          <div class="stat-label">${t("chatbot.actions.favorites_count", "Yêu thích")}</div>
        </div>
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE G: Certificate Card
  if (cardType === "certificate_card") {
    const cert = data.certificate || {};
    const ev = data.event || {};
    const cleanTitle = escapeHtml(ev.title || cert.metadata?.eventTitle || "Sự kiện");
    const certCode = escapeHtml(cert.certificateCode || "");
    const verifyUrl = cert.verifyUrl || (certCode ? `/certificate.html?code=${encodeURIComponent(certCode)}` : "");
    const isRevoked = cert.status === "revoked";
    const issuedDate = cert.issuedAt ? escapeHtml(formatCardDate(cert.issuedAt)) : "";
    const orgName = escapeHtml(ev.organization || "SpringWave");

    if (!certCode && data.count === 0) {
      return `
      <div class="chatbot-action-card card-empty">
        <i class="fa-solid fa-award text-3xl text-amber-400 mb-2"></i>
        <p class="text-xs text-slate-600 font-medium">${escapeHtml(data.message || t("chatbot.actions.no_certs", "Bạn chưa có chứng nhận nào được cấp trên SpringWave."))}</p>
      </div>`.replace(/\n/g, " ");
    }

    return `
    <div class="chatbot-action-card card-certificate ${isRevoked ? 'cert-revoked' : ''}">
      <div class="action-card-header ${isRevoked ? 'header-revoked' : 'header-cert'}">
        <span class="action-card-badge-cert"><i class="fa-solid fa-award"></i> ${isRevoked ? t("chatbot.actions.revoked_cert", 'CHỨNG NHẬN ĐÃ THU HỒI') : t("chatbot.actions.completed_cert", 'CHỨNG NHẬN HOÀN THÀNH')}</span>
        ${certCode ? `<span class="action-cert-code">#${certCode}</span>` : ''}
      </div>
      <div class="action-card-body">
        <h4 class="action-card-title">${cleanTitle}</h4>
        <div class="action-card-meta">
          ${orgName ? `<div class="meta-item"><i class="fa-solid fa-building-columns text-amber-500"></i> <span>${orgName}</span></div>` : ''}
          ${issuedDate ? `<div class="meta-item"><i class="fa-regular fa-calendar-check text-emerald-500"></i> <span>${t("chatbot.actions.issued_on", "Cấp ngày:")} ${issuedDate}</span></div>` : ''}
        </div>
        ${isRevoked ? `<p class="cert-revocation-msg text-xs text-rose-600 mt-1 font-medium"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(cert.revocationReason || 'Chứng chỉ đã bị thu hồi bởi BTC.')}</p>` : ''}
      </div>
      <div class="action-card-actions">
        ${verifyUrl ? `
          <a href="${verifyUrl}" class="action-btn-cert" target="_blank" rel="noopener noreferrer">
            <i class="fa-solid fa-certificate"></i> <span>${t("chatbot.actions.view_digital_cert", "Mở xem chứng chỉ số")}</span>
          </a>
        ` : ''}
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE H: My Certificates List
  if (cardType === "my_certificates_list") {
    const certs = Array.isArray(data.certificates) ? data.certificates : [];
    if (certs.length === 0) {
      return `
      <div class="chatbot-action-card card-empty">
        <i class="fa-solid fa-award text-3xl text-amber-400 mb-2"></i>
        <p class="text-xs text-slate-600 font-medium">${escapeHtml(data.message || t("chatbot.actions.no_certs", "Bạn chưa có chứng chỉ nào được cấp."))}</p>
      </div>`.replace(/\n/g, " ");
    }

    const itemsHtml = certs.map(c => {
      const ev = c.event || {};
      const evTitle = escapeHtml(ev.title || "Sự kiện");
      const cCode = escapeHtml(c.certificateCode || "");
      const vUrl = c.verifyUrl || `/certificate.html?code=${encodeURIComponent(cCode)}`;
      const isRev = c.status === "revoked";

      return `
      <div class="ticket-row-item cert-row-item ${isRev ? 'cert-item-revoked' : ''}">
        <div class="ticket-row-info">
          <div class="ticket-row-title">${evTitle}</div>
          <span class="cert-row-code text-xs font-mono text-amber-600 font-semibold">#${cCode}</span>
          ${isRev ? '<span class="text-rose-500 text-[10px] font-semibold ml-1">(Đã thu hồi)</span>' : ''}
        </div>
        <div class="ticket-row-btn-group">
          <a href="${vUrl}" target="_blank" rel="noopener noreferrer" class="ticket-row-view-btn cert-view-btn" title="Xem chứng nhận">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </a>
        </div>
      </div>`;
    }).join("");

    return `
    <div class="chatbot-action-card card-certs-list">
      <div class="action-card-header header-cert">
        <span class="action-card-badge-cert"><i class="fa-solid fa-award"></i> ${t("chatbot.actions.achieved_certs", { n: certs.length }, `CHỨNG NHẬN ĐÃ ĐẠT (${certs.length})`)}</span>
      </div>
      <div class="tickets-list-scroll">
        ${itemsHtml}
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE I: Attendance Status Card
  if (cardType === "attendance_status") {
    const ev = data.event || {};
    const att = data.attendance || {};
    const cleanTitle = escapeHtml(ev.title || "Sự kiện");
    const isPresent = att.status === "present";
    const checkInTime = att.checkedInAt ? escapeHtml(formatCardDate(att.checkedInAt)) : "";

    return `
    <div class="chatbot-action-card card-attendance ${isPresent ? 'att-present' : 'att-absent'}">
      <div class="action-card-header ${isPresent ? 'header-success' : 'header-warning'}">
        <span class="${isPresent ? 'action-card-badge-success' : 'action-card-badge-warning'}">
          <i class="fa-solid ${isPresent ? 'fa-circle-check' : 'fa-circle-question'}"></i> ${isPresent ? t("chatbot.actions.checked_in", 'ĐÃ ĐIỂM DANH') : t("chatbot.actions.not_checked_in", 'CHƯA ĐIỂM DANH')}
        </span>
      </div>
      <div class="action-card-body">
        <h4 class="action-card-title">${cleanTitle}</h4>
        <p class="text-xs text-slate-600 leading-relaxed mt-1">
          ${isPresent ? t("chatbot.actions.checked_in_at", { time: checkInTime }, `Điểm danh thành công lúc <strong>${checkInTime}</strong>.`) : t("chatbot.actions.not_checked_in_msg", 'Chưa ghi nhận mã check-in của bạn tại sự kiện này.')}
        </p>
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // CASE J: General Success or Error
  if (cardType === "action_error") {
    return `
    <div class="chatbot-action-card card-error">
      <div class="action-card-header header-error">
        <span class="action-card-badge-error"><i class="fa-solid fa-circle-exclamation"></i> ${t("chatbot.actions.action_notice", "THÔNG BÁO")}</span>
      </div>
      <div class="action-card-body">
        <p class="text-xs leading-relaxed text-rose-800">${escapeHtml(data.message || "Không thể thực hiện hành động này.")}</p>
      </div>
    </div>`.replace(/\n/g, " ");
  }

  // Fallback: Success Card
  return `
  <div class="chatbot-action-card card-success">
    <div class="action-card-header header-success">
      <span class="action-card-badge-success"><i class="fa-solid fa-circle-check"></i> ${t("chatbot.actions.action_success", "THỰC HIỆN THÀNH CÔNG")}</span>
    </div>
    <div class="action-card-body">
      <p class="text-xs leading-relaxed text-emerald-800">${escapeHtml(data.message || t("chatbot.actions.action_done", "Hành động đã hoàn tất."))}</p>
    </div>
  </div>`.replace(/\n/g, " ");
}

/**
 * Format message content: parses Markdown, JSON blocks, Action cards, Event cards
 */
function formatMessageContent(text) {
  if (!text) return "";

  // Strip internal model reasoning tags (<thought>, <think>) and tool_call JSON blocks
  let rawProcessed = text
    .replace(/<(thought|think)>[\s\S]*?<\/(thought|think)>/gi, "")
    .replace(/```json:tool_call\s*[\s\S]*?```/gi, "")
    .trim();

  const cardsMap = {};
  let cardIndex = 0;

  // 0. Extract ```json:action ... ``` blocks BEFORE HTML escaping
  rawProcessed = rawProcessed.replace(/```json:action\s*([\s\S]*?)\s*```/gi, (match, jsonString) => {
    try {
      const decodedJson = jsonString.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const data = JSON.parse(decodedJson.trim());
      if (data) {
        const placeholder = `___ACTION_CARD_TOKEN_${cardIndex++}___`;
        cardsMap[placeholder] = renderActionCardFromJSON(data);
        return placeholder;
      }
    } catch (err) {
      console.warn("Error parsing JSON action block in chatbot:", err);
    }
    return "";
  });

  // 1. Extract ```json:event ... ``` or ```json ... ``` blocks BEFORE HTML escaping
  rawProcessed = rawProcessed.replace(/```json(?::event)?\s*([\s\S]*?)\s*```/gi, (match, jsonString) => {
    try {
      const decodedJson = jsonString.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const data = JSON.parse(decodedJson.trim());
      if (Array.isArray(data)) {
        const validEvents = data.filter((d) => d && (d.id || d.eventId));
        if (validEvents.length > 0) {
          return validEvents
            .map((d) => {
              const placeholder = `___EVENT_CARD_TOKEN_${cardIndex++}___`;
              cardsMap[placeholder] = renderEventCardFromJSON(d);
              return placeholder;
            })
            .join("\n\n");
        }
      } else if (data && (data.id || data.eventId)) {
        const placeholder = `___EVENT_CARD_TOKEN_${cardIndex++}___`;
        cardsMap[placeholder] = renderEventCardFromJSON(data);
        return placeholder;
      }
    } catch (err) {
      console.warn("Error parsing JSON event block in chatbot:", err);
    }
    return match;
  });

  let safe = escapeHtml(rawProcessed);

  // 2. Match custom All-In-One Light Event Card syntax: [EVENT_CARD:id|title|type|status|time|location|desc]
  safe = safe.replace(/\[EVENT_CARD:([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]*)\]/g,
    (match, id, title, type, status, time, location) => {
      const cleanId = id.trim();
      const cleanTitle = title.trim() || t("chatbot.event");
      const cleanType = type.trim() || t("chatbot.event");
      const cleanStatus = status.trim() || t("chatbot.ongoing");
      const cleanTime = time.trim() || "";
      const cleanLocation = location.trim() || "";

      const placeholder = `___EVENT_CARD_TOKEN_${cardIndex++}___`;
      cardsMap[placeholder] = renderEventCardFromJSON({ id: cleanId, title: cleanTitle, type: cleanType, status: cleanStatus, time: cleanTime, location: cleanLocation });
      return placeholder;
    }
  );

  // 3. Replace Markdown links with event ID: [label](/explore.html?id=xxx) or [label](/explore.html?event=xxx)
  safe = safe.replace(/(?:👉\s*)?\[([^\]]+)\]\(([^)]+)\)\s*(?:[-─➔➜➔→>]*)/gi, (match, label, url) => {
    const eventIdMatch = url.match(/[?&](?:id|event)=([a-f0-9]{24})/i) || url.match(/\/events?\/([a-f0-9]{24})/i);
    if (eventIdMatch) {
      const eventId = eventIdMatch[1];
      let cleanLabel = label.replace(/^👉\s*/, '').replace(/\s*[-─➔➜➔→>]+$/, '').trim();
      if (!cleanLabel || cleanLabel.toLowerCase().includes('details') || cleanLabel.toLowerCase().includes('chi tiết')) {
        cleanLabel = "Xem chi tiết sự kiện";
      }
      const placeholder = `___EVENT_BTN_TOKEN_${cardIndex++}___`;
      cardsMap[placeholder] = `<button type="button" data-event-id="${eventId}" class="chat-event-btn-action"><span><i class="fa-solid fa-eye"></i> ${escapeHtml(cleanLabel)}</span><i class="fa-solid fa-arrow-right"></i></button>`;
      return placeholder;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary font-medium underline hover:text-primary-dark">${label}</a>`;
  });

  // 4. Handle plain text "View Details ->" or "Xem chi tiết ->" when NOT inside a markdown link
  safe = safe.replace(/(?:👉\s*)?(View Details|Xem chi tiết sự kiện|Xem chi tiết)\s*(?:[-─➔➜➔→>]+)?/gi, (match, textLabel) => {
    const cleanLabel = textLabel.trim() || "Xem chi tiết sự kiện";
    const placeholder = `___EVENT_BTN_TOKEN_${cardIndex++}___`;
    cardsMap[placeholder] = `<button type="button" class="chat-event-btn-action" onclick="const card=this.closest('.message-content').querySelector('[data-event-id]'); if(card) openEventPopup(card.dataset.eventId);"><span><i class="fa-solid fa-eye"></i> ${escapeHtml(cleanLabel)}</span><i class="fa-solid fa-arrow-right"></i></button>`;
    return placeholder;
  });

  // Clean up orphan trailing arrow lines like "->" or "→" or "➔"
  safe = safe.replace(/^(?:[-─➔➜➔→>]|\s)+$/gm, "");

  // Bold text **text**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Bullet points * item or - item
  safe = safe.replace(/^[\*\-]\s+(.+)$/gm, "• $1");

  // Newlines -> <br>
  safe = safe.replace(/\n/g, "<br>");

  // Re-inject rendered event cards, action cards & button tokens cleanly
  Object.keys(cardsMap).forEach(token => {
    safe = safe.replace(token, cardsMap[token]);
  });

  // Clean multiple consecutive <br>
  safe = safe.replace(/(<br>\s*){3,}/gi, "<br><br>");

  return safe;
}

/**
 * QR Code Modal Handlers
 */
function openQrModal(qrImageUrl, ticketCode, eventTitle) {
  const modal = document.getElementById("chatbot-qr-modal");
  const img = document.getElementById("chatbot-qr-image");
  const codeText = document.getElementById("chatbot-qr-code-text");
  const titleText = document.getElementById("chatbot-qr-event-name");
  const downloadBtn = document.getElementById("chatbot-qr-download-btn");

  if (!modal || !img) return;

  img.src = qrImageUrl || "";
  if (codeText) codeText.textContent = t("chatbot.qr_modal.ticket_code", { code: ticketCode || "------" }, `Mã vé: #${ticketCode || "------"}`);
  if (titleText) titleText.textContent = eventTitle || t("chatbot.event", "Sự kiện SpringWave");

  if (downloadBtn) {
    downloadBtn.onclick = () => {
      const a = document.createElement("a");
      a.href = qrImageUrl;
      a.download = `SpringWave_QR_${ticketCode || "Ticket"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  }

  modal.classList.remove("hidden");
}

function closeQrModal() {
  const modal = document.getElementById("chatbot-qr-modal");
  if (modal) modal.classList.add("hidden");
}

/**
 * Global Event Delegations inside Chatbot
 */
function bindMessageClicks() {
  const container = document.getElementById("chatbot-messages");
  if (container && !container.dataset.boundClicks) {
    container.addEventListener("click", (e) => {
      // 1. QR Code Button Click
      const qrBtn = e.target.closest("[data-action-qr]");
      if (qrBtn) {
        e.stopPropagation();
        const qrUrl = qrBtn.dataset.actionQr;
        const code = qrBtn.dataset.ticketCode || "";
        const title = qrBtn.dataset.eventTitle || "";
        openQrModal(qrUrl, code, title);
        return;
      }

      // 2. Conflict Confirm Button Click -> Send force registration message
      const conflictConfirmBtn = e.target.closest("[data-action-conflict-confirm]");
      if (conflictConfirmBtn) {
        e.stopPropagation();
        const input = document.getElementById("chatbot-input");
        if (input) {
          input.value = "Xác nhận đăng ký dù trùng lịch";
          sendMessage();
        }
        return;
      }

      // 3. Conflict Cancel Button Click
      const conflictCancelBtn = e.target.closest("[data-action-conflict-cancel]");
      if (conflictCancelBtn) {
        e.stopPropagation();
        const input = document.getElementById("chatbot-input");
        if (input) {
          input.value = "Không đăng ký sự kiện này nữa";
          sendMessage();
        }
        return;
      }

      // 4. Standard Event Card / Details Button Click
      const card = e.target.closest("[data-event-id]");
      if (card && card.dataset.eventId && !e.target.closest("button:not(.chat-event-btn-blue):not(.chat-event-btn-action):not(.action-btn-secondary):not(.ticket-row-view-btn)")) {
        openEventPopup(card.dataset.eventId);
        return;
      }

      // 4b. Any anchor link to an event
      const eventLink = e.target.closest("a");
      if (eventLink && eventLink.href) {
        const match = eventLink.href.match(/[?&](?:id|event)=([a-f0-9]{24})/i) || eventLink.href.match(/\/events?\/([a-f0-9]{24})/i);
        if (match) {
          e.preventDefault();
          e.stopPropagation();
          openEventPopup(match[1]);
          return;
        }
      }

      // 5. Retry Button Click
      const retryBtn = e.target.closest("[data-action-retry]");
      if (retryBtn) {
        e.stopPropagation();
        const retryText = retryBtn.dataset.actionRetry || "";
        const msgEl = retryBtn.closest(".message");
        if (msgEl) msgEl.remove();
        const input = document.getElementById("chatbot-input");
        if (input && retryText) {
          input.value = retryText;
          sendMessage();
        }
        return;
      }
    });
    container.dataset.boundClicks = "true";
  }

  // QR Modal Close Buttons
  const qrClose = document.getElementById("chatbot-qr-close");
  const qrBackdrop = document.getElementById("chatbot-qr-backdrop");
  if (qrClose) qrClose.onclick = closeQrModal;
  if (qrBackdrop) qrBackdrop.onclick = closeQrModal;
}

function loadHistoryFromStorage() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.slice(-MAX_HISTORY);
      }
    }
  } catch {}
  return [];
}

function saveHistoryToStorage() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(conversationHistory.slice(-MAX_HISTORY)));
  } catch {}
}

export async function initChatbot() {
  const container = document.getElementById("chatbot-container");
  if (!container) return;

  const resp = await fetch("./components/chatbot.html");
  const html = await resp.text();
  container.innerHTML = html;
  applyTranslation(container);

  conversationHistory = loadHistoryFromStorage();

  document.getElementById("chatbot-bubble").addEventListener("click", toggleChat);
  document.getElementById("chatbot-close").addEventListener("click", closeChat);
  document.getElementById("chatbot-send").addEventListener("click", sendMessage);

  const clearBtn = document.getElementById("chatbot-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", handleClearHistory);
  }

  const suggestionsContainer = document.getElementById("chatbot-suggestions");
  if (suggestionsContainer) {
    suggestionsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-suggest]");
      if (btn) {
        const text = (btn.dataset.suggestKey ? t(btn.dataset.suggestKey) : null) || btn.dataset.suggest;
        const input = document.getElementById("chatbot-input");
        if (input && text) {
          input.value = text;
          sendMessage();
        }
      }
    });
  }

  const input = document.getElementById("chatbot-input");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  restoreMessages();
  bindMessageClicks();

  // If authenticated, sync history from MongoDB backend with Skeleton Loading
  if (isAuthenticated()) {
    const skeleton = document.getElementById("chatbot-skeleton");
    if (skeleton) skeleton.classList.remove("hidden");
    try {
      const data = await fetchChatHistory();
      if (data && Array.isArray(data.history)) {
        conversationHistory = data.history;
        saveHistoryToStorage();
      }
    } catch (err) {
      console.warn("Failed to fetch chat history from DB:", err);
    } finally {
      if (skeleton) skeleton.classList.add("hidden");
      restoreMessages();
    }
  }

  window.addEventListener("language-changed", () => {
    const c = document.getElementById("chatbot-container");
    if (c) applyTranslation(c);
    restoreMessages();
  });

  window.addEventListener("beforeunload", () => saveHistoryToStorage());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveHistoryToStorage();
  });
}

async function handleClearHistory() {
  conversationHistory = [];
  try {
    localStorage.removeItem(HISTORY_KEY);
    if (isAuthenticated()) {
      await clearChatHistory();
    }
  } catch (err) {
    console.error("Error clearing chat history:", err);
  }
  restoreMessages();
}

function restoreMessages() {
  const container = document.getElementById("chatbot-messages");
  if (!container) return;

  const skeleton = document.getElementById("chatbot-skeleton");
  container.innerHTML = "";
  if (skeleton) container.appendChild(skeleton);

  const defaultGreeting = document.createElement("div");
  defaultGreeting.className = "message bot";
  defaultGreeting.innerHTML = `<div class="message-content" data-i18n="chatbot.greeting">${t("chatbot.greeting", {}, "Xin chào! Tôi là Trợ lý AI Tự Hành SpringWave. Bạn cần tìm kiếm sự kiện, đăng ký vé, hay quản lý hoạt động gì hôm nay?")}</div>`;

  if (conversationHistory.length === 0) {
    container.appendChild(defaultGreeting);
    toggleSuggestions(true);
    return;
  }

  conversationHistory.forEach(msg => {
    const div = document.createElement("div");
    div.className = `message ${msg.role === "assistant" ? "bot" : msg.role}`;
    div.innerHTML = `<div class="message-content">${msg.role === "assistant" ? formatMessageContent(msg.content) : escapeHtml(msg.content)}</div>`;
    container.appendChild(div);
  });
  bindMessageClicks();
  toggleSuggestions(false);
  container.scrollTop = container.scrollHeight;
}

function toggleSuggestions(show) {
  const sug = document.getElementById("chatbot-suggestions");
  if (sug) {
    sug.style.display = show ? "flex" : "none";
  }
}

function toggleChat() {
  isOpen = !isOpen;
  const widget = document.getElementById("chatbot-widget");
  const bubble = document.getElementById("chatbot-bubble");
  if (widget) widget.classList.toggle("open", isOpen);
  if (bubble) bubble.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (isOpen) {
    document.getElementById("chatbot-input")?.focus();
    const container = document.getElementById("chatbot-messages");
    if (container) container.scrollTop = container.scrollHeight;
  }
}

function closeChat() {
  isOpen = false;
  const widget = document.getElementById("chatbot-widget");
  const bubble = document.getElementById("chatbot-bubble");
  if (widget) widget.classList.remove("open");
  if (bubble) bubble.setAttribute("aria-expanded", "false");
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isOpen) {
    closeChat();
  }
});

async function sendMessage() {
  if (isSending) return;
  const input = document.getElementById("chatbot-input");
  const sendBtn = document.getElementById("chatbot-send-btn");
  const text = input.value.trim();
  if (!text) return;

  isSending = true;
  if (sendBtn) sendBtn.disabled = true;
  input.disabled = true;

  toggleSuggestions(false);
  addMessage("user", text);
  input.value = "";
  input.style.height = "auto";
  saveHistoryToStorage();

  if (!isAuthenticated()) {
    const loginText = t("auth_modal.login_btn", "Đăng nhập ngay");
    const loginUrl = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    addMessage("assistant", `${t("chatbot.login_required", {}, "Bạn cần đăng nhập tài khoản SpringWave để sử dụng đầy đủ các tính năng tự hành và tương tác này nhé!")}<br><br><a href="${loginUrl}" class="inline-flex items-center gap-1.5 px-4 py-2 mt-1 rounded-xl bg-[#1755ba] text-white text-xs font-semibold hover:bg-[#134699] transition-all shadow-sm"><span class="material-symbols-outlined text-[16px]">login</span> ${loginText}</a>`);
    saveHistoryToStorage();
    isSending = false;
    if (sendBtn) sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
    return;
  }

  const msgEl = addMessage("assistant", "");
  msgEl.classList.add("typing");
  const contentEl = msgEl.querySelector(".message-content");
  contentEl.innerHTML = "<span></span><span></span><span></span>";

  try {
    const res = await sendChatMessage(text, conversationHistory);
    msgEl.classList.remove("typing");
    const reply = res?.reply || t("chatbot.error", {}, "Không nhận được phản hồi từ trợ lý.");
    contentEl.innerHTML = formatMessageContent(reply);
    bindMessageClicks();

    if (res?.history && Array.isArray(res.history)) {
      conversationHistory = res.history;
    } else {
      conversationHistory.push({ role: "assistant", content: reply });
    }
    saveHistoryToStorage();
    const container = document.getElementById("chatbot-messages");
    if (container) container.scrollTop = container.scrollHeight;
  } catch (err) {
    msgEl.classList.remove("typing");
    const errMsg = String(err?.message || "").toLowerCase();
    const isTimeout = errMsg.includes("abort") || errMsg.includes("timeout") || err?.status === 504;
    let msg = isTimeout
      ? "⏱️ Trợ lý AI đang phản hồi lâu hơn bình thường (timeout). Bạn có thể thử lại ngay hoặc gửi câu hỏi ngắn gọn hơn nhé."
      : t("chatbot.error", {}, "Đã xảy ra lỗi khi kết nối tới Trợ lý AI. Vui lòng thử lại sau.");
    showError(msg, text);
  } finally {
    isSending = false;
    if (sendBtn) sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

/**
 * Show an error message in the bot response slot with a retry button.
 */
function showError(errorMsg, originalText) {
  const errMsgEl = document.createElement("div");
  errMsgEl.className = "chatbot-error-notice";
  const safeText = escapeHtml(originalText || "").replace(/"/g, '&quot;');
  errMsgEl.innerHTML = `
    <p class="text-xs leading-relaxed text-rose-700 m-0">${escapeHtml(errorMsg)}</p>
    <button type="button" class="chatbot-retry-btn" data-action-retry="${safeText}">
      <i class="fa-solid fa-rotate-right"></i> Thử lại
    </button>
  `;
  // Find the bot message element (last one) and replace its content
  const container = document.getElementById("chatbot-messages");
  const lastBotMsg = container ? Array.from(container.querySelectorAll(".message.bot")).pop() : null;
  if (lastBotMsg) {
    lastBotMsg.classList.remove("typing");
    const contentEl = lastBotMsg.querySelector(".message-content");
    if (contentEl) contentEl.innerHTML = "";
    if (contentEl) contentEl.appendChild(errMsgEl);
    bindMessageClicks();
  }
  // Still push to history so retry works
  conversationHistory.push({ role: "assistant", content: errorMsg });
  saveHistoryToStorage();
}

function addMessage(role, content) {
  const container = document.getElementById("chatbot-messages");
  const div = document.createElement("div");
  div.className = `message ${role === "assistant" ? "bot" : role}`;
  const formatted = role === "assistant" ? formatMessageContent(content) : escapeHtml(typeof content === 'string' ? content : '');
  div.innerHTML = `<div class="message-content">${formatted}</div>`;
  container.appendChild(div);
  bindMessageClicks();
  container.scrollTop = container.scrollHeight;

  if (content) {
    conversationHistory.push({ role, content });
  }
  return div;
}

if (typeof window !== "undefined") {
  window.addEventListener("language-changed", () => {
    const widget = document.getElementById("chatbot-widget");
    if (widget) {
      applyTranslation(widget);
    }
  });
}
