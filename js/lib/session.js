const STORAGE = window.localStorage;

export function setToken(token) {
    STORAGE.setItem("token", token);
}

export function getToken() {
    return STORAGE.getItem("token");
}

export function removeToken() {
    STORAGE.removeItem("token");
}

export function setSigningKey(key) {
    STORAGE.setItem("signingKey", key);
}

export function getSigningKey() {
    return STORAGE.getItem("signingKey");
}

export function removeSigningKey() {
    STORAGE.removeItem("signingKey");
}

export function setUser(user) {
    STORAGE.setItem("user", JSON.stringify(user));
}

export function getUser() {
    const user = STORAGE.getItem("user");
    if (!user) return null;
    try {
      return JSON.parse(user);
    } catch (e) {
      console.warn("Corrupted user JSON in session storage", e);
      return null;
    }
}

export function removeUser() {
    STORAGE.removeItem("user");
}

export function createSession(token, user) {
    setToken(token);
    setUser(user);
}

export function clearSession() {
    const user = getUser();
    if (user && user._id) {
        STORAGE.removeItem(`springwave_notifications_${user._id}`);
    }
    STORAGE.removeItem("springwave_notifications");
    STORAGE.removeItem("springwave_notifications_guest");
    removeToken();
    removeSigningKey();
    removeUser();
}

export function isAuthenticated() {
    return !!getToken();
}

export function logout() {
    clearSession();
    if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
            window.google.accounts.id.disableAutoSelect();
        } catch (e) {
            // Google SSO script may not be fully initialized; logout should still succeed.
            console.warn("Google auto-select disable failed", e);
        }
    }
}

export function isProfileComplete(user) {
    if (!user) return false;
    return !!(user.dob && user.school && user.class && user.major && user.phoneNo);
}

export function isStudentVerified(user) {
    if (!user) return false;
    return !!(user.isStudentVerified || user.role === "admin" || user.role === "host");
}

export function hasUserCompletedQuiz(user = getUser()) {
    if (typeof window !== "undefined" && window._hasActiveAIProfile === true) return true;
    try {
        if (typeof localStorage !== "undefined") {
            if (localStorage.getItem("springwave_quiz_completed") === "true") return true;
            if (localStorage.getItem("springwave_persona_key")) return true;
        }
    } catch {}
    if (!user) return false;
    if (user.hasCompletedQuiz === true) return true;
    if (user.profile && (
        user.profile.archetypeTitle ||
        user.profile.personaKey ||
        user.profile.profileText ||
        user.profile.tagline ||
        (Array.isArray(user.profile.skills) && user.profile.skills.length > 0)
    )) return true;
    if (user.surveyScores && Object.values(user.surveyScores).some(s => typeof s === "number" && s > 0)) return true;
    if (Array.isArray(user.surveyAnswers) && user.surveyAnswers.length > 0) return true;
    return false;
}
