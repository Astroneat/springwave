import { getLang } from './i18n.js';

const contentCache = new Map();

export async function fetchContent(url) {
    if (contentCache.has(url)) {
        return contentCache.get(url);
    }
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        contentCache.set(url, text);
        return text;
    } catch (e) {
        console.error("fetchContent error:", url, e);
        return "";
    }
}

export function formatDate(dateString, opts = true) {
    if (!dateString) return "N/A";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "N/A";

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");

    const dateOnly = `${day}/${month}/${year}`;
    const timeOnly = `${hours}:${minutes}`;

    const includeTime = typeof opts === "boolean" ? opts : (opts.includeTime ?? true);

    if (includeTime) {
        return `${dateOnly}, ${timeOnly}`;
    }
    return dateOnly;
}

export function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

export function toTitleCase(str) {
    if (!str || typeof str !== "string") return "";
    return str
        .trim()
        .split(/\s+/)
        .map(word => {
            if (!word) return "";
            const lower = word.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ");
}

export function toLocalISODate(date) {
    if (!date || isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
export function timeAgo(dateString) {
    const isVi = getLang() === 'vi';
    const justNowStr = isVi ? "vừa xong" : "just now";
    if (!dateString) return justNowStr;
    if (typeof dateString === "string") {
        const trimmed = dateString.trim();
        if (/^\d+[smhdwMy]\s*ago$/i.test(trimmed) || /^\d+[smhdwMy]$/i.test(trimmed)) {
            return trimmed;
        }
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return justNowStr;

    const now = new Date();
    const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

    if (diffInSeconds < 60) return justNowStr;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return isVi ? `${diffInMinutes} phút trước` : `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return isVi ? `${diffInHours} giờ trước` : `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return isVi ? `${diffInDays} ngày trước` : `${diffInDays}d ago`;
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) return isVi ? `${diffInWeeks} tuần trước` : `${diffInWeeks}w ago`;
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return isVi ? `${diffInMonths} tháng trước` : `${diffInMonths}mo ago`;
    const diffInYears = Math.floor(diffInDays / 365);
    return isVi ? `${diffInYears} năm trước` : `${diffInYears}y ago`;
}

import { checkSchoolEmail } from '../api/universities.js';

/**
 * Check if an email belongs to a school domain using API domain map
 * @param {string} email - The email address to check
 * @returns {Promise<boolean>} - True if the email belongs to a school domain
 */
export async function isSchoolEmail(email) {
    const result = await checkSchoolEmail(email);
    return result.isSchool;
}

export async function isAutoVerifyEmail(email) {
    const result = await checkSchoolEmail(email);
    return Boolean(result.isSchool && result.university && result.university.autoVerify !== false);
}

/**
 * Extract domain from email
 * @param {string} email - The email address
 * @returns {string|null} - The domain or null if invalid
 */
export function extractEmailDomain(email) {
    if (!email || typeof email !== 'string') return null;
    const parts = email.split('@');
    return parts.length === 2 ? parts[1] : null;
}

/**
 * Check if user is verified or exempt (admin/host)
 * @param {Object} user - The user object
 * @returns {boolean} - True if user is verified or exempt
 */
export function isUserVerifiedOrExempt(user) {
    if (!user) return false;
    // Admins and hosts are exempt from verification
    if (user.role === 'admin' || user.role === 'host') return true;
    // Check if student is verified
    return !!user.isStudentVerified;
}

/**
 * Show verification required message
 * @deprecated Use verificationGuard.js modal instead
 * @param {string} action - The action being attempted
 */
export function showVerificationRequired(action = "perform this action") {
    console.warn('showVerificationRequired is deprecated. Use verificationGuard modal.');
}

/**
 * Guard function to prevent unverified users from performing actions
 * @param {Object} user - The user object
 * @param {string} action - The action being attempted
 * @returns {boolean} - True if user can proceed, false if blocked
 */
export function checkVerificationGuard(user, action = "perform this action") {
    if (!isUserVerifiedOrExempt(user)) {
        showVerificationRequired(action);
        return false;
    }
    return true;
}

/**
 * Format a date as YYYY-MM-DD in Vietnam timezone (Asia/Ho_Chi_Minh)
 * @param {string|Date} dateInput 
 * @returns {string} YYYY-MM-DD
 */
export function getVietnameseDateStr(dateInput) {
    if (!dateInput) return "";
    try {
        return new Date(dateInput).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    } catch (e) {
        return "";
    }
}

/**
 * Get today's date as YYYY-MM-DD in Vietnam timezone (Asia/Ho_Chi_Minh)
 * @returns {string} YYYY-MM-DD
 */
export function getTodayVietnameseDateStr() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/**
 * Check if the event date is today in Vietnam timezone
 * @param {string|Date} dateStr 
 * @returns {boolean}
 */
export function isToday(dateStr) {
    if (!dateStr) return false;
    return getVietnameseDateStr(dateStr) === getTodayVietnameseDateStr();
}

/**
 * Check if the event date is strictly before today in Vietnam timezone
 * @param {string|Date} dateStr 
 * @returns {boolean}
 */
export function isPastDate(dateStr) {
    if (!dateStr) return false;
    return getVietnameseDateStr(dateStr) < getTodayVietnameseDateStr();
}

/**
 * Check if the event date is strictly after today in Vietnam timezone
 * @param {string|Date} dateStr 
 * @returns {boolean}
 */
export function isUpcomingDate(dateStr) {
    if (!dateStr) return false;
    return getVietnameseDateStr(dateStr) > getTodayVietnameseDateStr();
}

/**
 * Evaluates real-time event status:
 * - 'registration_open': now < applicationDeadline (or now < heldDate)
 * - 'registration_closed': applicationDeadline <= now < heldDate
 * - 'ongoing': heldDate <= now <= heldDateEnd
 * - 'ended': now > heldDateEnd
 * @param {Object} event 
 * @returns {'registration_open'|'registration_closed'|'ongoing'|'ended'}
 */
export function getEventStatus(event) {
    if (!event) return 'registration_open';
    if (event.isEnded) return 'ended';
    const now = Date.now();
    const startDate = event.heldDate ? new Date(event.heldDate).getTime() : null;
    const endDate = event.heldDateEnd ? new Date(event.heldDateEnd).getTime() : (startDate ? startDate + 24 * 60 * 60 * 1000 : null);
    const deadline = event.applicationDeadline ? new Date(event.applicationDeadline).getTime() : startDate;

    if (endDate && now > endDate) {
        return 'ended';
    }
    if (startDate && now >= startDate && (!endDate || now <= endDate)) {
        return 'ongoing';
    }
    if (deadline && now >= deadline) {
        return 'registration_closed';
    }
    return 'registration_open';
}

/**
 * Checks whether an event is formatted as online
 * @param {Object} event
 * @returns {boolean}
 */
export function isOnlineEvent(event) {
    if (!event) return false;
    if (event.format === 'online') return true;
    if (event.format === 'offline') return false;
    const loc = String(event.location || '').trim().toLowerCase();
    if (loc === 'online' || loc.includes('online') || loc.includes('zoom') || loc.includes('meet') || loc.includes('teams') || loc.includes('webex')) return true;
    if (event.meetingUrl && String(event.meetingUrl).trim().length > 0) return true;
    if (event.onlineCheckin && (event.onlineCheckin.isOpen || event.onlineCheckin.code)) return true;
    return false;
}

