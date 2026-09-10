import { get, post } from "./client.js";
import { getLang } from "../lib/i18n.js";

export function getRecommendations(lang = getLang()) {
    const activeLang = lang || 'vi';
    return get(`/recommendations?lang=${encodeURIComponent(activeLang)}`);
}

export function explainRecommendation(eventId, lang = getLang()) {
    const activeLang = lang || 'vi';
    return post("/recommendations/explain", { eventId, lang: activeLang, bypassCache: true }, { priority: true, timeout: 65000 });
}

