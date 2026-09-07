import { post, get } from "./client.js";

export function generateProfile(answers, personaKey = null, semanticTraits = null, lang = "vi") {
    return post("/profile/generate", { answers, personaKey, semanticTraits, lang });
}

export function getMyProfile(lang = null) {
    const endpoint = lang ? `/profile/me?lang=${encodeURIComponent(lang)}` : "/profile/me";
    return get(endpoint);
}
