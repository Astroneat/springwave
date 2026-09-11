import { getNotifications as fetchServerNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead } from "../api/forum.js";
import { isAuthenticated, getUser } from "../lib/session.js";

const NOTIF_POLL_INTERVAL = 30000;

let pollTimer = null;

function getStorageKey() {
  const user = getUser();
  return user ? `springwave_notifications_${user._id || user.id || "guest"}` : "springwave_notifications_guest";
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(getStorageKey(), JSON.stringify(list));
}

export function getNotifications() {
  return load();
}

export function getUnreadCount() {
  return load().filter((n) => !n.read).length;
}

export function addBadgeNotification(badgeKey, badgeLabel) {
  const list = load();
  const exists = list.some((n) => n.type === "badge" && n.badgeKey === badgeKey);
  if (exists) return;
  const label = badgeLabel || badgeKey;
  list.unshift({
    id: "notif_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    type: "badge",
    badgeKey,
    badgeLabel: label,
    message: `You earned the "${label}" badge!`,
    createdAt: new Date().toISOString(),
    read: false,
  });
  save(list);
  window.dispatchEvent(new CustomEvent("notifications-updated"));
}

export function addInteractionNotification(type, message, discussionId, commentId = null) {
  if (!isAuthenticated()) return;
  const list = load();
  list.unshift({
    id: "notif_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    type: type,
    message: message,
    createdAt: new Date().toISOString(),
    read: false,
    discussionId: discussionId,
    commentId: commentId,
  });
  if (list.length > 100) list.length = 100;
  save(list);
  window.dispatchEvent(new CustomEvent("notifications-updated"));
}

export function markRead(id) {
  const list = load();
  const n = list.find((item) => item.id === id);
  if (n) n.read = true;
  save(list);
  markNotificationRead(id).catch(() => {});
  window.dispatchEvent(new CustomEvent("notifications-updated"));
}

export function markAllRead() {
  const list = load();
  list.forEach((n) => (n.read = true));
  save(list);
  markAllNotificationsRead().catch(() => {});
  window.dispatchEvent(new CustomEvent("notifications-updated"));
}

export async function pollServerNotifications() {
  if (!isAuthenticated()) return;
  try {
    import("../components/badgeCelebration.js").then((m) => {
      if (typeof m.syncOfflineBadgeNotifications === "function") {
        m.syncOfflineBadgeNotifications();
      }
    }).catch(() => {});

    const serverNotifs = await fetchServerNotifications();
    if (!serverNotifs || serverNotifs.length === 0) return;
    const localList = load();
    const serverIds = new Set(serverNotifs.map(n => n._id || n.id));
    const existingIds = new Set(localList.map(n => n.id));
    const newNotifs = serverNotifs
      .filter(n => !existingIds.has(n._id || n.id))
      .map(n => ({
        id: n._id || n.id,
        type: n.type,
        message: n.message,
        createdAt: n.createdAt,
        read: n.read,
        discussionId: n.discussionId || n.discussion?._id || n.discussion || null,
        eventId: n.eventId || n.event?._id || n.event || null,
        certificateId: n.certificateId || n.certificate?._id || n.certificate || null,
        certificateCode: n.certificateCode || null,
        commentId: n.commentId || n.comment?._id || n.comment || n.replyId || n.reply?._id || n.reply || null,
        actorName: n.actorName,
      }));
    if (newNotifs.length > 0) {
      localList.unshift(...newNotifs);
      if (localList.length > 100) localList.length = 100;
      save(localList);
      window.dispatchEvent(new CustomEvent("notifications-updated"));
    }
    return serverNotifs;
  } catch {
    return [];
  }
}

export function startNotificationPolling() {
  stopNotificationPolling();
  pollServerNotifications();
  pollTimer = setInterval(pollServerNotifications, NOTIF_POLL_INTERVAL);
}

export function stopNotificationPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
