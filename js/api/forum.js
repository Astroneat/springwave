import { get, post, put, del, uploadFormData } from "./client.js";
import { getToken, getUser } from "../lib/session.js";
import { formatDate, getEventStatus } from "../lib/utils.js";

const DISCUSSIONS_FALLBACK = [];
const COMMENTS_FALLBACK = [];

const UNIVERSITIES_FALLBACK = [
  { id: 1, name: "University of Da Nang", memberCount: 2840, activeDiscussions: 156, color: "#3B6FD4" },
  { id: 2, name: "Duy Tan University", memberCount: 1950, activeDiscussions: 98, color: "#10B981" },
  { id: 3, name: "FPT University", memberCount: 1680, activeDiscussions: 87, color: "#F59E0B" },
  { id: 4, name: "University of Education", memberCount: 920, activeDiscussions: 45, color: "#8B5CF6" },
];

const SKILLS_FALLBACK = [
  { id: 1, name: "Communication", icon: "forum", discussionCount: 156, color: "#3B82F6", description: "Public speaking, writing, presentation & more" },
  { id: 2, name: "Technical", icon: "code", discussionCount: 234, color: "#8B5CF6", description: "Coding, engineering, problem-solving & more" },
  { id: 3, name: "Creativity", icon: "palette", discussionCount: 112, color: "#F59E0B", description: "Design, innovation, artistic thinking & more" },
  { id: 4, name: "Social Impact", icon: "volunteer_activism", discussionCount: 89, color: "#10B981", description: "Leadership, community, volunteering & more" },
];

let discussionsCache = null;
let commentsCache = {};

export async function getTrendingDiscussions() {
  try {
    const data = await get("/community/discussions?sort=trending&limit=20");
    if (data?.discussions) {
      discussionsCache = data.discussions;
      return data.discussions;
    }
  } catch {}
  return [];
}

export async function getDiscussionsByCategory(category) {
  if (category === "uni") return [];
  if (category === "mine") return getMyDiscussions();
  if (category === "saved") return getSavedDiscussions();
  try {
    const params = category === "all" ? "" : `?category=${category}`;
    const data = await get(`/community/discussions${params}`);
    if (data?.discussions) {
      discussionsCache = data.discussions;
      return data.discussions;
    }
  } catch {}
  return [];
}

export async function getDiscussionById(id, options = {}) {
  if (!id) return null;
  try {
    const query = options.skipIncrement ? "?increment=false" : "";
    const data = await get(`/community/discussions/${id}${query}`);
    if (data?.discussion) {
      return data.discussion;
    }
    return data || null;
  } catch (err) {
    console.warn("Failed to fetch discussion details:", err);
    return null;
  }
}

const COMMENTS_KEY_PREFIX = "forum_comments_";

function parseCommentTimestamp(c) {
  if (c.createdAt && !isNaN(new Date(c.createdAt).getTime())) {
    return new Date(c.createdAt).toISOString();
  }
  if (c.date && !isNaN(new Date(c.date).getTime())) {
    return new Date(c.date).toISOString();
  }
  const idStr = String(c.id || c._id || "");
  if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
    const ts = parseInt(idStr.substring(0, 8), 16) * 1000;
    if (!isNaN(ts) && ts > 0) return new Date(ts).toISOString();
  }
  const numId = Number(c.id || c._id);
  if (Number.isFinite(numId) && numId > 1000000000000) {
    return new Date(numId).toISOString();
  }
  return new Date().toISOString();
}

function getStoredComments(discussionId) {
  try {
    const list = JSON.parse(localStorage.getItem(COMMENTS_KEY_PREFIX + discussionId) || "[]");
    return list.map(c => {
      const realTs = parseCommentTimestamp(c);
      c.createdAt = realTs;
      c.date = realTs;
      return c;
    });
  } catch {
    return [];
  }
}

function storeComment(discussionId, comment) {
  const key = COMMENTS_KEY_PREFIX + discussionId;
  const stored = getStoredComments(discussionId);
  const commentId = String(comment.id || comment._id);
  const realTs = parseCommentTimestamp(comment);
  comment.createdAt = realTs;
  comment.date = realTs;
  const idx = stored.findIndex(c => String(c.id || c._id) === commentId);
  if (idx !== -1) {
    stored[idx] = { ...stored[idx], ...comment };
  } else {
    stored.push(comment);
  }
  localStorage.setItem(key, JSON.stringify(stored));
}

function removeStoredComment(discussionId, commentId) {
  const key = COMMENTS_KEY_PREFIX + discussionId;
  const stored = getStoredComments(discussionId);
  const filtered = stored.filter(c => String(c.id || c._id) !== String(commentId));
  localStorage.setItem(key, JSON.stringify(filtered));
}

export async function getComments(discussionId) {
  let fallback = COMMENTS_FALLBACK.filter(c => String(c.discussionId) === String(discussionId));
  const stored = getStoredComments(discussionId);
  try {
    const data = await get(`/community/discussions/${discussionId}/comments`);
    if (data?.comments && data.comments.length > 0) {
      const mapped = data.comments.map(c => {
        const cId = String(c._id || c.id);
        const localMatch = stored.find(s => String(s.id || s._id) === cId || (s.content === c.content && String(s.userID) === String(c.userID)));
        const realTs = parseCommentTimestamp(c);
        const parentId = c.replyToId
          ? (typeof c.replyToId === "object" ? String(c.replyToId._id || c.replyToId.id || "") : String(c.replyToId))
          : (localMatch && localMatch.replyToId ? String(localMatch.replyToId) : null);
        return {
          ...c,
          id: cId,
          _id: cId,
          date: realTs,
          createdAt: realTs,
          replyToId: parentId,
          replyTo: c.replyTo || (localMatch ? localMatch.replyTo : null),
        };
      });
      stored.forEach(s => {
        if (!mapped.find(m => String(m.id || m._id) === String(s.id || s._id))) {
          mapped.push(s);
        }
      });
      commentsCache[discussionId] = mapped;
      return mapped;
    }
  } catch {}

  // If discussion comments not found, try event comments endpoint
  try {
    const evData = await get(`/events/${discussionId}/comments`);
    if (evData?.comments && evData.comments.length > 0) {
      const mapped = evData.comments.map(c => {
        const cId = String(c._id || c.id);
        const localMatch = stored.find(s => String(s.id || s._id) === cId || (s.content === c.content && String(s.userID) === String(c.userID)));
        const realTs = parseCommentTimestamp(c);
        const parentId = c.replyToId
          ? (typeof c.replyToId === "object" ? String(c.replyToId._id || c.replyToId.id || "") : String(c.replyToId))
          : (localMatch && localMatch.replyToId ? String(localMatch.replyToId) : null);
        return {
          id: cId,
          _id: cId,
          discussionId,
          userID: c.userID,
          author: c.userName || "User",
          userName: c.userName || "User",
          avatar: (c.userName || "?").charAt(0).toUpperCase(),
          content: c.content,
          date: realTs,
          createdAt: realTs,
          likes: c.likes || 0,
          replyToId: parentId,
          replyTo: c.replyTo || (localMatch ? localMatch.replyTo : null),
        };
      });
      // Merge with any local replies not yet in backend
      stored.forEach(s => {
        if (!mapped.find(m => String(m.id || m._id) === String(s.id || s._id))) {
          mapped.push(s);
        }
      });
      commentsCache[discussionId] = mapped;
      return mapped;
    }
  } catch {}

  const merged = [...fallback];
  stored.forEach(s => {
    if (!merged.find(m => String(m.id) === String(s.id))) {
      merged.push(s);
    }
  });
  return merged;
}

export async function addComment(discussionId, content) {
  try {
    const data = await post(`/community/discussions/${discussionId}/comments`, { content });
    const commentObj = data?.comment || (data?._id ? data : null);
    if (commentObj) {
      if (data?.newBadges && Array.isArray(data.newBadges)) {
        commentObj.newBadges = data.newBadges;
      }
      storeComment(discussionId, commentObj);
      return commentObj;
    }
  } catch (err) {
    // If not found in discussions, try event comments
    if (err?.status === 404 || err?.message?.toLowerCase().includes("not found")) {
      try {
        const evData = await post(`/events/${discussionId}/comments`, { content });
        if (evData?.comment) {
          const user = getUser() || {};
            const nowIso = evData.comment.createdAt || new Date().toISOString();
            const mapped = {
              id: String(evData.comment._id || Date.now()),
              _id: String(evData.comment._id || Date.now()),
              discussionId,
              userID: evData.comment.userID || user._id,
              author: evData.comment.userName || user.fullname || user.username || "You",
              userName: evData.comment.userName || user.fullname || user.username || "You",
              avatar: (evData.comment.userName || user.fullname || "U")[0].toUpperCase(),
              content: evData.comment.content,
              date: nowIso,
              createdAt: nowIso,
              likes: 0,
            };
          storeComment(discussionId, mapped);
          return mapped;
        }
      } catch (evErr) {
        // If it's a mock discussion or client-side fallback post
        if (String(discussionId).startsWith("mock-") || evErr?.status === 404) {
          const user = getUser() || {};
          const nowIso = new Date().toISOString();
          const localComment = {
            id: Date.now(),
            _id: Date.now(),
            discussionId,
            userID: user._id || "local-user",
            author: user.fullname || user.username || "You",
            userName: user.fullname || user.username || "You",
            avatar: (user.fullname || user.username || "U")[0].toUpperCase(),
            content,
            date: nowIso,
            createdAt: nowIso,
            likes: 0,
          };
          storeComment(discussionId, localComment);
          return localComment;
        }
        throw evErr;
      }
    }
    console.error("Failed to add comment:", err);
    throw err;
  }
  return null;
}

export async function getTopComment(discussionId) {
  try {
    const comments = await getComments(discussionId);
    if (comments.length === 0) return null;
    return comments.reduce((best, c) => (c.likes || 0) > (best.likes || 0) ? c : best);
  } catch {
    return null;
  }
}

export async function getUniversityCommunities() {
  try {
    const data = await get("/community/universities");
    if (data?.universities) return data.universities;
  } catch {
    console.warn('[Forum] API unavailable, using fallback data for universities');
  }
  return UNIVERSITIES_FALLBACK;
}

export async function getSkillTopics() {
  try {
    const data = await get("/community/skills");
    if (data?.skills) return data.skills;
  } catch {
    console.warn('[Forum] API unavailable, using fallback data for skills');
  }
  return SKILLS_FALLBACK;
}

export async function getUpcomingEvents() {
  try {
    const data = await get("/community/sidebar");
    if (data?.upcomingEvents) return data.upcomingEvents;
  } catch {}
  return [];
}

export async function getPopularDiscussions(currentDiscussions = [], category = null) {
  const cat = category || (typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("cat") || "all") : "all");
  const globalList = (typeof window !== "undefined" && window._currentDiscussions) || [];
  let rawList = (Array.isArray(currentDiscussions) && currentDiscussions.length > 0)
    ? currentDiscussions 
    : (Array.isArray(globalList) && globalList.length > 0 ? globalList : []);

  // If in a specific category, filter rawList to that category
  if (cat && cat !== "all" && cat !== "mine" && cat !== "saved") {
    rawList = rawList.filter(d => d.category === cat || (cat === "event" && (d.category === "event" || d.relatedEvent || d._event)));
  }

  // Prioritize real discussions from current category/view
  let list = rawList.filter(d => !String(d.id || d._id).startsWith("mock-"));
  if (list.length > 0) {
    const scored = list.map(d => {
      const discId = String(d.id || d._id);
      const stored = getStoredComments(discId);
      const replyCount = Math.max(Number(d.replies) || 0, Number(d.replyCount) || 0, stored.length);
      const viewCount = Number(d.views) || 0;
      const score = replyCount * 3 + viewCount;
      return {
        id: discId,
        _id: discId,
        title: d.title || "Untitled Discussion",
        replies: replyCount,
        views: viewCount,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score || b.replies - a.replies);
    return scored.slice(0, 5);
  }

  // Only fallback to global sidebar endpoint if viewing "All Discussions"
  if (cat === "all") {
    try {
      const data = await get("/community/sidebar");
      if (data?.popular && data.popular.length > 0) return data.popular;
    } catch {}
  }

  return [];
}

export async function getAISuggestions() {
  try {
    const token = getToken();
    if (!token) return [];
    const { getRecommendations } = await import("./recommendations.js");
    const data = await getRecommendations();
    const rawRecs = data?.recommendations || data?.events || [];
    const recs = rawRecs.filter(r => getEventStatus(r) === 'registration_open');
    return recs.slice(0, 3).map(r => ({
      id: r._id || r.activityID,
      title: r.title || "Recommended activity",
      reason: `${r.type || "Activity"} • Matches your interests`,
    }));
  } catch {}
  return [];
}

export async function getStats() {
  try {
    const data = await get("/community/stats");
    if (data) return data;
  } catch {}
  return { students: 15000, discussions: 2000, universities: 10 };
}

export async function joinUniversity(id) {
  return post(`/community/universities/${id}/join`, {});
}

export async function leaveUniversity(id) {
  return post(`/community/universities/${id}/leave`, {});
}

export async function getMyUniversity() {
  try {
    const data = await get("/community/universities/me");
    return data?.university || null;
  } catch {}
  return null;
}

export async function createDiscussionWithScope({ title, content, category, tags, relatedEvent, certificateCode, images = [], scope, communityId, cfTurnstileResponse, postAsOrg, orgId }) {
  const validImages = Array.from(images).filter(file => file instanceof File);
  const payload = {
    title, content, category, tags: tags || [],
    relatedEvent: relatedEvent || undefined,
    certificateCode: certificateCode || undefined,
    scope: scope || "general",
    communityId: communityId || undefined,
    cfTurnstileResponse: cfTurnstileResponse || undefined,
    postAsOrg: postAsOrg || undefined,
    orgId: orgId || undefined,
  };
  const data = validImages.length > 0
    ? await uploadDiscussionWithImages(payload, validImages)
    : await post("/community/discussions", payload);
  if (data) {
    const disc = data.discussion || (data._id || data.id ? data : null);
    if (disc) {
      if (data.newBadges && Array.isArray(data.newBadges)) {
        disc.newBadges = data.newBadges;
      }
      return disc;
    }
  }
  return null;
}

async function uploadDiscussionWithImages(payload, images) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false || value === "") return;
    formData.append(key, key === "tags" ? JSON.stringify(value) : String(value));
  });
  images.forEach(file => formData.append("images", file, file.name));
  return uploadFormData("/community/discussions", formData);
}

export async function getCommunityDiscussions(communityId) {
  try {
    const data = await get(`/community/discussions?scope=community&communityId=${communityId}&limit=20`);
    if (data?.discussions) return data.discussions;
  } catch {}
  return [];
}

export async function deleteDiscussion(id) {
  try {
    await del(`/community/discussions/${id}`);
    return true;
  } catch {
    return false;
  }
}

export async function createUniversity(name, description, color, domains) {
  try {
    const data = await post("/community/universities", {
      name,
      description: description || "",
      color: color || "#3B6FD4",
      domains: domains || [],
    });
    return data?.university || null;
  } catch {
    return null;
  }
}

export async function updateUniversity(id, updates) {
  try {
    const data = await put(`/community/universities/${id}`, updates);
    return data?.university || null;
  } catch {
    return null;
  }
}

export async function deleteUniversity(id) {
  try {
    await del(`/community/universities/${id}`);
    return true;
  } catch {
    return false;
  }
}

export async function likeComment(discussionId, commentId) {
  try {
    const data = await post(`/community/discussions/${discussionId}/comments/${commentId}/like`, {});
    return data || null;
  } catch {
    return null;
  }
}

export async function deleteDiscussionComment(discussionId, commentId) {
  removeStoredComment(discussionId, commentId);
  try {
    await del(`/community/discussions/${discussionId}/comments/${commentId}`);
    return true;
  } catch (err) {
    if (err?.status === 404 || err?.message?.toLowerCase().includes("not found")) {
      try {
        await del(`/events/${discussionId}/comments/${commentId}`);
        return true;
      } catch (evErr) {
        console.error("Delete event comment failed:", evErr);
      }
    }
    if (String(discussionId).startsWith("mock-") || String(commentId).startsWith("mock-")) {
      return true;
    }
    return false;
  }
}

export async function addReply(discussionId, content, replyToId) {
  const cachedList = commentsCache[discussionId] || [];
  const storedList = getStoredComments(discussionId);
  const parentComment = cachedList.find(c => String(c.id || c._id) === String(replyToId)) || storedList.find(c => String(c.id || c._id) === String(replyToId));
  const fallbackReplyTo = parentComment ? {
    userId: parentComment.userID || parentComment.userId,
    userName: parentComment.userName || parentComment.author,
  } : null;

  try {
    const data = await post(`/community/discussions/${discussionId}/comments`, { content, replyToId });
    const rawComment = data?.comment || (data?._id ? data : null);
    if (rawComment) {
      const commentToStore = {
        ...rawComment,
        replyToId: rawComment.replyToId ? String(rawComment.replyToId._id || rawComment.replyToId.id || rawComment.replyToId) : String(replyToId),
        replyTo: rawComment.replyTo || fallbackReplyTo,
        newBadges: (data?.newBadges && Array.isArray(data.newBadges)) ? data.newBadges : (rawComment.newBadges || []),
      };
      storeComment(discussionId, commentToStore);
      return commentToStore;
    }
  } catch (err) {
    // If not found in discussions, try event comments endpoint
    if (err?.status === 404 || err?.message?.toLowerCase().includes("not found")) {
      try {
        const evData = await post(`/events/${discussionId}/comments`, { content, replyToId });
        if (evData?.comment) {
          const user = getUser() || {};
          const nowIso = evData.comment.createdAt || new Date().toISOString();
          const mapped = {
            id: String(evData.comment._id || Date.now()),
            _id: String(evData.comment._id || Date.now()),
            discussionId,
            userID: evData.comment.userID || user._id,
            author: evData.comment.userName || user.fullname || user.username || "You",
            userName: evData.comment.userName || user.fullname || user.username || "You",
            avatar: (evData.comment.userName || user.fullname || "U")[0].toUpperCase(),
            content: evData.comment.content,
            replyToId: evData.comment.replyToId ? String(evData.comment.replyToId._id || evData.comment.replyToId.id || evData.comment.replyToId) : String(replyToId),
            replyTo: evData.comment.replyTo || fallbackReplyTo,
            date: nowIso,
            createdAt: nowIso,
            likes: 0,
          };
          storeComment(discussionId, mapped);
          return mapped;
        }
      } catch (evErr) {
        // If it's a mock discussion or client-side fallback post
        if (String(discussionId).startsWith("mock-") || evErr?.status === 404) {
          const user = getUser() || {};
          const nowIso = new Date().toISOString();
          const localComment = {
            id: Date.now(),
            _id: Date.now(),
            discussionId,
            userID: user._id || "local-user",
            author: user.fullname || user.username || "You",
            userName: user.fullname || user.username || "You",
            avatar: (user.fullname || user.username || "U")[0].toUpperCase(),
            content,
            replyToId: String(replyToId),
            replyTo: fallbackReplyTo,
            date: nowIso,
            createdAt: nowIso,
            likes: 0,
          };
          storeComment(discussionId, localComment);
          return localComment;
        }
        throw evErr;
      }
    }
    console.error("Failed to add reply:", err);
    throw err;
  }
  return null;
}

export async function getNotifications() {
  try {
    const data = await get("/notifications");
    if (data?.notifications) return data.notifications;
  } catch {}
  return [];
}

export async function getUnreadNotificationCount() {
  try {
    const data = await get("/notifications/unread-count");
    return data?.count || 0;
  } catch {}
  return 0;
}

export async function markNotificationRead(id) {
  try {
    await put(`/notifications/${id}/read`, {});
    return true;
  } catch {
    return false;
  }
}

export async function markAllNotificationsRead() {
  try {
    await put("/notifications/read-all", {});
    return true;
  } catch {
    return false;
  }
}

export async function getUniversityMembers(uniId) {
  try {
    const data = await get(`/community/universities/${uniId}/members`);
    if (data?.members) return data.members;
  } catch {}
  return [];
}

const SAVED_KEY = "saved_discussions";

function getSavedIds() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveIdLocally(id) {
  const ids = getSavedIds();
  if (!ids.includes(String(id))) {
    ids.push(String(id));
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  }
}

function unsaveIdLocally(id) {
  const ids = getSavedIds().filter(sid => sid !== String(id));
  localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
}

export async function saveDiscussion(id) {
  try {
    await post(`/community/discussions/${id}/save`, {});
    return true;
  } catch {
    saveIdLocally(id);
    return true;
  }
}

export async function unsaveDiscussion(id) {
  try {
    await del(`/community/discussions/${id}/save`);
    return true;
  } catch {
    unsaveIdLocally(id);
    return true;
  }
}

export async function getSavedDiscussions() {
  try {
    const data = await get("/community/discussions/saved/me");
    if (data?.discussions) return data.discussions;
  } catch {}
  return [];
}

export async function getMyDiscussions() {
  try {
    const data = await get("/community/discussions?author=me");
    if (data?.discussions) return data.discussions;
  } catch {}
  return [];
}

export async function getEventById(id) {
  const { getActivityById } = await import("./activities.js");
  try {
    const data = await getActivityById(id);
    if (data?.activity) return { id: data.activity._id || id, title: data.activity.title, date: formatDate(data.activity.heldDate), attendees: data.activity.participants || 0 };
  } catch {}
  return null;
}

export async function getEvents() {
  try {
    const data = await get("/community/sidebar");
    if (data?.upcomingEvents) return data.upcomingEvents;
  } catch {}
  return [];
}
