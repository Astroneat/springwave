const STORAGE_KEY = "springwave_lang";
const DEFAULT_LANG = "en";

let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
let translations = {};
let loaded = false;

export async function initI18n() {
  try {
    const [en, vi] = await Promise.all([
      fetch("/locales/en.json").then(r => r.json()),
      fetch("/locales/vi.json").then(r => r.json()),
    ]);
    translations = { en, vi };
    loaded = true;
  } catch (e) {
    console.error("i18n init error:", e);
  }
  applyTranslation();
  window.dispatchEvent(new CustomEvent("language-changed", { detail: { lang: currentLang } }));
  return currentLang;
}

export function t(key, params = {}, fallback = '') {
  let actualParams = {};
  let defaultText = typeof params === 'string' ? params : (fallback || key);
  if (typeof params === 'object' && params !== null) {
    actualParams = params;
  }

  const keys = key.split(".");
  let val = translations[currentLang];
  if (val) {
    for (const k of keys) {
      val = val?.[k];
    }
  }

  if (val === undefined && translations.en) {
    val = translations.en;
    for (const k of keys) {
      val = val?.[k];
    }
  }

  if (val === undefined) return defaultText;
  if (typeof val === "string") {
    return val.replace(/\{{1,2}(\w+)\}{1,2}/g, (_, p) => actualParams[p] ?? `{{${p}}}`);
  }
  return val;
}

export function getLang() {
  return currentLang;
}

export async function setLang(lang) {
  if (lang === currentLang) return;
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  applyTranslation();
  window.dispatchEvent(new CustomEvent("language-changed", { detail: { lang } }));
}

export function applyTranslation(scope = document) {
  const root = scope || document;
  root.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    const text = t(key);
    if (text !== key) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.placeholder = text;
      } else if (el.tagName === "TITLE") {
        document.title = text;
      } else {
        el.textContent = text;
      }
    }
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const text = t(el.dataset.i18nPlaceholder);
    if (text !== el.dataset.i18nPlaceholder) el.placeholder = text;
  });
  root.querySelectorAll("[data-i18n-title]").forEach(el => {
    const text = t(el.dataset.i18nTitle);
    if (text !== el.dataset.i18nTitle) el.title = text;
  });
  root.querySelectorAll("[data-i18n-html]").forEach(el => {
    const text = t(el.dataset.i18nHtml);
    if (text !== el.dataset.i18nHtml) el.innerHTML = text;
  });
}

export function getCategoryI18nKey(category) {
  if (!category) return "";
  const name = typeof category === "object" ? (category.name || category.slug || "") : String(category);
  const slug = typeof category === "object" ? (category.slug || "") : "";
  const normalized = (slug || name).toLowerCase().trim().replace(/[^a-z0-9]/g, "");

  const keyMap = {
    sport: "explore.sports",
    sports: "explore.sports",
    thethao: "explore.sports",
    music: "explore.music",
    amnhac: "explore.music",
    education: "explore.education",
    giaoduc: "explore.education",
    technology: "explore.technology",
    tech: "explore.technology",
    congnghe: "explore.technology",
    volunteering: "explore.volunteering",
    volunteer: "explore.volunteering",
    tinhnguyen: "explore.volunteering",
    social: "explore.social",
    socialactivity: "explore.social",
    xahoi: "explore.social",
    art: "explore.arts",
    arts: "explore.arts",
    nghethuat: "explore.arts",
    workshop: "explore.workshop",
    seminar: "explore.seminar",
    hoithao: "explore.seminar"
  };
  return keyMap[normalized] || "";
}

export function getCategoryName(category, fallback = "") {
  if (!category) return fallback;
  const name = typeof category === "object" ? (category.name || category.slug || "") : String(category);
  const key = getCategoryI18nKey(category);
  if (key) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return name || fallback;
}

if (typeof window !== "undefined") {
  window.getCategoryName = getCategoryName;
  window.getCategoryI18nKey = getCategoryI18nKey;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (!loaded) initI18n();
    else applyTranslation();
  });
} else {
  if (!loaded) initI18n();
  else applyTranslation();
}
