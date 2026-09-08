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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (!loaded) initI18n();
    else applyTranslation();
  });
} else {
  if (!loaded) initI18n();
  else applyTranslation();
}
