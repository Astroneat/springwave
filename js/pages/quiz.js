import "../../src/style.css";
import { isAuthenticated, getUser, setUser, isStudentVerified } from "../lib/session.js";
import { getCurrentUser } from "../api/auth.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent } from "../lib/utils.js";
import { submitSurvey, getSurveyResult } from "../api/survey.js";
import { generateProfile, getMyProfile } from "../api/profile.js";
import { initI18n, getLang, setLang, t, applyTranslation } from "../lib/i18n.js";
import { canPerformAction, markActionPerformed } from "../lib/throttle.js";
import { triggerBadgeCelebration } from "../components/badgeCelebration.js";

const HARDCODED_QUESTIONS = [
  // --- Trục 1: E vs I (Nguồn năng lượng & Tương tác) ---
  {
    id: 1,
    dim: "EI",
    category: "Energy Source (E vs I)",
    categoryKey: "energy_source",
    icon: "bolt",
    question: "When kicking off a new academic week, what recharges your energy and motivation most?",
    answers: [
      { label: "Immersing yourself in club buzz, meeting friends, and engaging in dynamic team discussions", pole: "E" },
      { label: "Having quiet solo moments in your room or the library to read, reflect, and recharge privately", pole: "I" },
    ],
  },
  {
    id: 2,
    dim: "EI",
    category: "Energy Source (E vs I)",
    categoryKey: "energy_source",
    icon: "groups",
    question: "When attending a major campus event (such as a Club Fair or Seminar), what is your typical style?",
    answers: [
      { label: "Confidently introducing yourself, making new acquaintances, and networking with speakers", pole: "E" },
      { label: "Sticking with close friends, observing from a comfortable distance, and listening attentively", pole: "I" },
    ],
  },
  {
    id: 3,
    dim: "EI",
    category: "Energy Source (E vs I)",
    categoryKey: "energy_source",
    icon: "nightlife",
    question: "After a grueling day of coursework or final exams, how do you unwind best?",
    answers: [
      { label: "Going out for food, sports, or lively gatherings with a group of friends", pole: "E" },
      { label: "Retreating to your own private space with headphones, movies, or games to regain serenity", pole: "I" },
    ],
  },

  // --- Trục 2: S vs N (Tiếp nhận thông tin & Lối tư duy) ---
  {
    id: 4,
    dim: "SN",
    category: "Information Processing (S vs N)",
    categoryKey: "info_gathering",
    icon: "travel_explore",
    question: "When diving into a new research topic or subject, what draws your interest first?",
    answers: [
      { label: "Concrete facts, verified data, and clear step-by-step methodologies", pole: "S" },
      { label: "Novel concepts, imaginative possibilities, and big-picture future potential", pole: "N" },
    ],
  },
  {
    id: 5,
    dim: "SN",
    category: "Information Processing (S vs N)",
    categoryKey: "info_gathering",
    icon: "lightbulb",
    question: "When listening to a peer present a project idea, what matters most to you?",
    answers: [
      { label: "Practical feasibility: Concrete resources, realistic execution steps, and viable timelines", pole: "S" },
      { label: "Originality and significance: Does it solve a profound challenge with a breakthrough perspective?", pole: "N" },
    ],
  },
  {
    id: 6,
    dim: "SN",
    category: "Information Processing (S vs N)",
    categoryKey: "info_gathering",
    icon: "psychology",
    question: "In academic and extracurricular projects, you feel most confident when:",
    answers: [
      { label: "Applying proven hands-on skills and structured experience to execute tasks precisely", pole: "S" },
      { label: "Brainstorming out-of-the-box ideas and connecting abstract theories into unique solutions", pole: "N" },
    ],
  },

  // --- Trục 3: T vs F (Ra quyết định & Đánh giá) ---
  {
    id: 7,
    dim: "TF",
    category: "Decision Making (T vs F)",
    categoryKey: "decision_making",
    icon: "balance",
    question: "When your project team encounters a disagreement on direction, you prioritize:",
    answers: [
      { label: "Objective logical analysis, empirical evidence, and efficiency—pointing out flaws candidly", pole: "T" },
      { label: "Listening to everyone's feelings, seeking mutual harmony, and maintaining strong team camaraderie", pole: "F" },
    ],
  },
  {
    id: 8,
    dim: "TF",
    category: "Decision Making (T vs F)",
    categoryKey: "decision_making",
    icon: "verified",
    question: "When assessing the success of a student activity, your primary metric is:",
    answers: [
      { label: "Tangible deliverables: Were the defined targets met and was quality delivered on schedule?", pole: "T" },
      { label: "Human experience: Did attendees feel welcomed, connected, inspired, and uplifted?", pole: "F" },
    ],
  },
  {
    id: 9,
    dim: "TF",
    category: "Decision Making (T vs F)",
    categoryKey: "decision_making",
    icon: "favorite",
    question: "When a classmate shares personal academic or career struggles, you naturally:",
    answers: [
      { label: "Break down the root causes and suggest structured, actionable solutions to fix the issue", pole: "T" },
      { label: "Offer genuine empathy, active listening, and heartfelt encouragement before discussing fixes", pole: "F" },
    ],
  },

  // --- Trục 4: J vs P (Phong cách làm việc & Lối sống) ---
  {
    id: 10,
    dim: "JP",
    category: "Lifestyle & Planning (J vs P)",
    categoryKey: "lifestyle_pace",
    icon: "calendar_month",
    question: "When assigned a month-long course capstone or event planning project, you typically:",
    answers: [
      { label: "Draft a structured plan, divide milestones by week, and execute steadily to finish ahead of time", pole: "J" },
      { label: "Keep your schedule flexible, explore diverse directions, and peak in a burst of sprint energy", pole: "P" },
    ],
  },
  {
    id: 11,
    dim: "JP",
    category: "Lifestyle & Planning (J vs P)",
    categoryKey: "lifestyle_pace",
    icon: "checklist",
    question: "In your everyday student life, your workspace and study schedule are usually:",
    answers: [
      { label: "Organized, with structured to-do lists, feeling calm and in control when things follow an orderly plan", pole: "J" },
      { label: "Fluid and adaptable, shifting with spontaneous inspiration rather than rigid timetables", pole: "P" },
    ],
  },
  {
    id: 12,
    dim: "JP",
    category: "Lifestyle & Planning (J vs P)",
    categoryKey: "lifestyle_pace",
    icon: "explore",
    question: "When weekend plans or event schedules unexpectedly change at the last minute, you feel:",
    answers: [
      { label: "Somewhat frustrated or unsettled because your pre-arranged routine was disrupted", pole: "J" },
      { label: "Easygoing and intrigued, embracing it as a fun chance for a fresh, unexpected adventure", pole: "P" },
    ],
  },
];

const AI_QUIZ_VERSION = "mbti_v2";

let QUESTIONS = [...HARDCODED_QUESTIONS];

export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP"
];

export const LEGACY_TO_MBTI = {
  deep_learner: "INTJ",
  tech_builder: "ISTP",
  creative_innovator: "INFP",
  community_leader: "ENFJ",
  career_strategist: "ENTJ",
  changemaker: "INFJ",
  dynamic_explorer: "ESTP",
};

export function normalizeToMBTI(key) {
  if (!key) return "INTJ";
  const upper = String(key).trim().toUpperCase();
  if (MBTI_TYPES.includes(upper)) return upper;
  const lower = String(key).trim().toLowerCase();
  if (LEGACY_TO_MBTI[lower]) return LEGACY_TO_MBTI[lower];
  return "INTJ";
}

// 16 MBTI Personas grouped by 4 classical temperaments
const TEMPERAMENT_PALETTES = {
  analysts: { temperament: "analysts", temperamentTitle: getLang() === "vi" ? "Nhà Phân Tích (Analysts)" : "Analysts", solidColor: "#23499b", textColor: "#23499b", bgSoft: "#f8fafc", icon: "psychology" },
  diplomats: { temperament: "diplomats", temperamentTitle: getLang() === "vi" ? "Nhà Ngoại Giao (Diplomats)" : "Diplomats", solidColor: "#23499b", textColor: "#23499b", bgSoft: "#f8fafc", icon: "diversity_3" },
  sentinels: { temperament: "sentinels", temperamentTitle: getLang() === "vi" ? "Người Bảo Hộ (Sentinels)" : "Sentinels", solidColor: "#23499b", textColor: "#23499b", bgSoft: "#f8fafc", icon: "shield" },
  explorers: { temperament: "explorers", temperamentTitle: getLang() === "vi" ? "Nhà Thám Hiểm (Explorers)" : "Explorers", solidColor: "#23499b", textColor: "#23499b", bgSoft: "#f8fafc", icon: "explore" },
};

const PERSONA_CONFIGS = {
  // Analysts (NT)
  INTJ: { key: "INTJ", ...TEMPERAMENT_PALETTES.analysts, types: ["hackathon", "tech_talk", "research_seminar", "case_challenge"] },
  INTP: { key: "INTP", ...TEMPERAMENT_PALETTES.analysts, types: ["research_seminar", "masterclass", "coding_workshop", "tech_talk"] },
  ENTJ: { key: "ENTJ", ...TEMPERAMENT_PALETTES.analysts, types: ["case_challenge", "leadership_workshop", "networking", "career_talk"] },
  ENTP: { key: "ENTP", ...TEMPERAMENT_PALETTES.analysts, types: ["hackathon", "seminar", "design_workshop", "networking"] },

  // Diplomats (NF)
  INFJ: { key: "INFJ", ...TEMPERAMENT_PALETTES.diplomats, types: ["volunteer_campaign", "community_forum", "masterclass", "study_group"] },
  INFP: { key: "INFP", ...TEMPERAMENT_PALETTES.diplomats, types: ["art_festival", "exhibition", "community_event", "design_workshop"] },
  ENFJ: { key: "ENFJ", ...TEMPERAMENT_PALETTES.diplomats, types: ["community_event", "leadership_workshop", "volunteer_campaign", "networking"] },
  ENFP: { key: "ENFP", ...TEMPERAMENT_PALETTES.diplomats, types: ["cultural_festival", "art_festival", "networking", "community_event"] },

  // Sentinels (SJ)
  ISTJ: { key: "ISTJ", ...TEMPERAMENT_PALETTES.sentinels, types: ["academic_conference", "industry_workshop", "study_group", "seminar"] },
  ISFJ: { key: "ISFJ", ...TEMPERAMENT_PALETTES.sentinels, types: ["volunteer_campaign", "charity_event", "community_event", "study_group"] },
  ESTJ: { key: "ESTJ", ...TEMPERAMENT_PALETTES.sentinels, types: ["career_talk", "company_tour", "leadership_workshop", "case_challenge"] },
  ESFJ: { key: "ESFJ", ...TEMPERAMENT_PALETTES.sentinels, types: ["club_fair", "community_event", "networking", "charity_event"] },

  // Explorers (SP)
  ISTP: { key: "ISTP", ...TEMPERAMENT_PALETTES.explorers, types: ["hands_on_workshop", "coding_workshop", "tech_talk", "hackathon"] },
  ISFP: { key: "ISFP", ...TEMPERAMENT_PALETTES.explorers, types: ["art_festival", "design_workshop", "music_show", "exhibition"] },
  ESTP: { key: "ESTP", ...TEMPERAMENT_PALETTES.explorers, types: ["hackathon", "networking", "case_challenge", "hands_on_workshop"] },
  ESFP: { key: "ESFP", ...TEMPERAMENT_PALETTES.explorers, types: ["cultural_festival", "music_show", "club_fair", "community_event"] },

  // Legacy Persona Fallbacks (mapped cleanly to MBTI counterparts)
  deep_learner: { key: "INTJ", ...TEMPERAMENT_PALETTES.analysts, types: ["research_seminar", "masterclass", "academic_conference", "study_group"] },
  tech_builder: { key: "ISTP", ...TEMPERAMENT_PALETTES.explorers, types: ["hackathon", "tech_talk", "coding_workshop", "seminar"] },
  creative_innovator: { key: "INFP", ...TEMPERAMENT_PALETTES.diplomats, types: ["art_festival", "design_workshop", "music_show", "exhibition"] },
  community_leader: { key: "ENFJ", ...TEMPERAMENT_PALETTES.diplomats, types: ["networking", "community_event", "leadership_workshop", "seminar"] },
  career_strategist: { key: "ENTJ", ...TEMPERAMENT_PALETTES.analysts, types: ["career_talk", "case_challenge", "company_tour", "industry_workshop"] },
  changemaker: { key: "INFJ", ...TEMPERAMENT_PALETTES.diplomats, types: ["volunteer_campaign", "charity_event", "environmental_project", "community_forum"] },
  dynamic_explorer: { key: "ESTP", ...TEMPERAMENT_PALETTES.explorers, types: ["cultural_festival", "hands_on_workshop", "club_fair", "community_event"] },
};

let currentQuestion = 0;
let answers = [];
let lastResultData = null;

let pendingExitUrl = null;

if (!isAuthenticated()) {
  window.location.replace("/login.html");
} else {
  document.body.style.display = "";
}

async function checkStudentVerification() {
  let user = getUser();
  if (!isStudentVerified(user)) {
    try {
      const res = await getCurrentUser();
      if (res?.user) {
        setUser(res.user);
        user = res.user;
      }
    } catch (e) {
      console.warn("Failed to refresh user status:", e);
    }
  }

  if (!isStudentVerified(user)) {
    showScreen("quizVerifyRequired");
    return false;
  }
  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  initLanguageSwitcher();
  initExitInterceptors();
  await initChatbot();
  loadFooter();

  const verified = await checkStudentVerification();
  if (!verified) return;

  await checkExistingResult();
  initQuiz();
});

function isQuizInProgress() {
  const qScreen = document.getElementById("quizQuestion");
  return qScreen && !qScreen.classList.contains("hidden");
}

function openExitModal(targetUrl) {
  pendingExitUrl = targetUrl;
  const modal = document.getElementById("quizExitModal");
  if (!modal) {
    window.location.href = targetUrl;
    return;
  }
  const content = modal.querySelector(".bg-white");
  modal.hidden = false;
  requestAnimationFrame(() => {
    modal.classList.remove("opacity-0", "pointer-events-none");
    if (content) {
      content.classList.remove("scale-95");
      content.classList.add("scale-100");
    }
  });
}

function closeExitModal() {
  const modal = document.getElementById("quizExitModal");
  if (!modal) return;
  const content = modal.querySelector(".bg-white");
  modal.classList.add("opacity-0", "pointer-events-none");
  if (content) {
    content.classList.remove("scale-100");
    content.classList.add("scale-95");
  }
  setTimeout(() => {
    if (modal.classList.contains("opacity-0")) {
      modal.hidden = true;
    }
  }, 300);
  pendingExitUrl = null;
}

function initExitInterceptors() {
  const brandLink = document.getElementById("quizBrandLink");
  const exitBtn = document.getElementById("quizExitBtn");
  const cancelBtn = document.getElementById("quizExitCancelBtn");
  const confirmBtn = document.getElementById("quizExitConfirmBtn");
  const modal = document.getElementById("quizExitModal");

  brandLink?.addEventListener("click", (e) => {
    if (isQuizInProgress()) {
      e.preventDefault();
      openExitModal("./index.html");
    }
  });

  exitBtn?.addEventListener("click", (e) => {
    if (isQuizInProgress()) {
      e.preventDefault();
      openExitModal("./profile.html");
    }
  });

  cancelBtn?.addEventListener("click", closeExitModal);

  confirmBtn?.addEventListener("click", () => {
    const url = pendingExitUrl || "./profile.html";
    window.location.href = url;
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeExitModal();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (isQuizInProgress()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

function initLanguageSwitcher() {
  const btn = document.getElementById("quizLangToggleBtn");
  const text = document.getElementById("quizLangText");
  if (text) text.textContent = getLang().toUpperCase();

  btn?.addEventListener("click", async () => {
    const nextLang = getLang() === "en" ? "vi" : "en";
    await setLang(nextLang);
    if (text) text.textContent = nextLang.toUpperCase();
  });

  window.addEventListener("language-changed", async (e) => {
    const lang = (e.detail?.lang || getLang()).toLowerCase();
    if (text) text.textContent = lang.toUpperCase();

    // Update start screen button
    const startBtn = document.getElementById("quizStartBtn");
    if (startBtn) {
      const isRetake = startBtn.dataset.isRetake === "true";
      startBtn.innerHTML = isRetake
        ? `<span class="material-symbols-outlined">refresh</span> <span data-i18n="quiz.retake_btn">${t("quiz.retake_btn")}</span>`
        : `<span class="material-symbols-outlined">play_arrow</span> <span data-i18n="quiz.start_btn">${t("quiz.start_btn")}</span>`;
    }

    // Re-render question if question screen is active
    const qScreen = document.getElementById("quizQuestion");
    if (qScreen && !qScreen.classList.contains("hidden")) {
      renderQuestion();
    }

    // Re-render results if result screen is active
    const rScreen = document.getElementById("quizResult");
    if (rScreen && !rScreen.classList.contains("hidden") && lastResultData) {
      const targetLang = lang;
      const existingProfile = lastResultData.profilesByLang?.[targetLang] || lastResultData.profile?.translations?.[targetLang];
      if (existingProfile) {
        lastResultData.profile = existingProfile;
        renderResults(lastResultData.personaKey, lastResultData);
      } else if (isAuthenticated()) {
        const config = PERSONA_CONFIGS[lastResultData.personaKey] || PERSONA_CONFIGS.dynamic_explorer;
        rScreen.innerHTML = `
          <div class="quiz-loading-result" style="padding:60px 24px;text-align:center;">
            <div class="quiz-spinner" style="border-top-color:${config.solidColor};"></div>
            <p style="font-size:15px;color:#334155;font-weight:600;margin-top:16px;">
              ${targetLang === 'en' ? 'Crafting your English Persona Portrait...' : 'Đang phác họa chân dung bản sắc tiếng Việt...'}
            </p>
          </div>
        `;
        try {
          const res = await generateProfile(
            lastResultData.answerData || [],
            lastResultData.personaKey,
            lastResultData.semanticTraits || null,
            targetLang
          );
          if (res?.profile) {
            lastResultData.profilesByLang = lastResultData.profilesByLang || {};
            lastResultData.profilesByLang[targetLang] = res.profile;
            if (res.profile.translations) {
              lastResultData.profilesByLang = {
                ...lastResultData.profilesByLang,
                ...res.profile.translations,
              };
            }
            lastResultData.profile = res.profile;
          }
        } catch (err) {
          console.error("[Quiz] Generation for " + targetLang + " failed:", err);
        }
        renderResults(lastResultData.personaKey, lastResultData);
      } else {
        renderResults(lastResultData.personaKey, lastResultData);
      }
    }
  });
}

async function checkExistingResult() {
  if (!isAuthenticated()) return;
  const startBtn = document.getElementById("quizStartBtn");
  if (!startBtn) return;

  try {
    const [surveyRes, profileRes] = await Promise.allSettled([
      getSurveyResult(),
      getMyProfile()
    ]);
    const data = surveyRes.status === "fulfilled" ? surveyRes.value : null;
    const pData = profileRes.status === "fulfilled" ? profileRes.value : null;

    if (data?.scores || data?.personaKey || pData?.profile) {
      startBtn.dataset.isRetake = "true";
      startBtn.innerHTML = `<span class="material-symbols-outlined">refresh</span> <span data-i18n="quiz.retake_btn">${t("quiz.retake_btn")}</span>`;
    }

    if (pData?.profile) {
      const p = pData.profile;
      const key = normalizeToMBTI(p.personaKey || data?.personaKey || localStorage.getItem("springwave_persona_key") || "INTJ");
      const currentLang = getLang();
      const profilesByLang = p.translations || {};
      if (!profilesByLang[currentLang]) {
        profilesByLang[currentLang] = p;
      }
      lastResultData = {
        personaKey: key,
        clientEval: { personaKey: key, mbtiType: key },
        profile: profilesByLang[currentLang] || p,
        profilesByLang,
      };
    }
  } catch {
    // No existing result
  }
}

async function loadFooter() {
  const html = await fetchContent("./components/footer.html");
  const container = document.getElementById("footer-container");
  if (container) {
    container.innerHTML = html;
    applyTranslation(container);
  }
}

function initQuiz() {
  document.getElementById("quizStartBtn")?.addEventListener("click", startQuiz);
  document.getElementById("quizNextBtn")?.addEventListener("click", nextQuestion);
  document.getElementById("quizPrevBtn")?.addEventListener("click", prevQuestion);
}

function showScreen(id) {
  document.querySelectorAll(".quiz-card").forEach((c) => c.classList.add("hidden"));
  document.getElementById(id)?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function startQuiz() {
  const verified = await checkStudentVerification();
  if (!verified) return;

  currentQuestion = 0;
  answers = new Array(QUESTIONS.length).fill(null).map(() => []);
  lastResultData = null;
  showScreen("quizQuestion");
  renderQuestion();
}

function escapeHtml(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCategoryColor(categoryKey) {
  return "#23499b";
}

function renderQuestion() {
  const q = QUESTIONS[currentQuestion];
  const qKey = `q${q.id}`;
  const rawTranslatedQ = t(`quiz.${qKey}.question`);
  const translatedQuestion = (rawTranslatedQ && rawTranslatedQ !== `quiz.${qKey}.question`) ? rawTranslatedQ : q.question;

  const categoryEl = document.getElementById("questionCategory");
  const transCategory = t("quiz.categories." + q.categoryKey, {}, q.category);
  if (categoryEl) {
    categoryEl.style.background = "#f8fafc";
    categoryEl.style.color = "#334155";
    categoryEl.style.border = "1px solid #e2e8f0";
    categoryEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;color:#23499b;">${q.icon || "help"}</span> ${transCategory}`;
  }

  const title = document.getElementById("questionTitle");
  if (title) {
    title.textContent = translatedQuestion;
    title.style.color = "#0f172a";
  }

  const progress = ((currentQuestion + 1) / QUESTIONS.length) * 100;
  const bar = document.getElementById("quizProgressBar");
  if (bar) {
    bar.style.width = `${progress}%`;
    bar.setAttribute("aria-valuenow", currentQuestion + 1);
  }
  const progText = document.getElementById("quizProgressText");
  if (progText) {
    progText.textContent = `${currentQuestion + 1} / ${QUESTIONS.length}`;
  }

  const container = document.getElementById("quizAnswers");
  if (!container) return;
  container.innerHTML = "";
  const selected = answers[currentQuestion] || [];
  
  const hintDiv = document.createElement("div");
  hintDiv.style.cssText = "font-size:13px;color:#64748b;margin-bottom:18px;font-weight:600;display:flex;align-items:center;gap:6px;";
  hintDiv.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;color:#23499b;">tune</span> ${t("quiz.multi_select", "Select the option that best reflects your natural self")}`;
  container.appendChild(hintDiv);

  const translatedAnswers = t(`quiz.${qKey}.answers`);
  q.answers.forEach((answer, idx) => {
    const isSelected = selected.includes(idx);
    const translatedLabel = Array.isArray(translatedAnswers) ? translatedAnswers[idx] : undefined;
    const displayLabel = translatedLabel || answer.label;
    const letter = idx === 0 ? "A" : "B";
    
    const div = document.createElement("div");
    div.className = `quiz-answer-btn ${isSelected ? "selected" : ""}`;
    div.innerHTML = `
      <span class="quiz-answer-circle font-black">${letter}</span>
      <span class="quiz-answer-text">${displayLabel}</span>
      <span class="quiz-answer-check">${
        isSelected
          ? '<span class="material-symbols-outlined" style="font-size:24px;color:#23499b;">check_circle</span>'
          : '<span class="material-symbols-outlined" style="font-size:24px;color:#cbd5e1;">radio_button_unchecked</span>'
      }</span>
    `;
    div.addEventListener("click", () => selectAnswer(idx));
    div.dataset.index = idx;
    container.appendChild(div);
  });

  updateNavButtons();
}

function selectAnswer(index) {
  answers[currentQuestion] = [index];
  renderQuestion();
  const nextBtn = document.getElementById("quizNextBtn");
  if (nextBtn) {
    nextBtn.disabled = false;
  }
}

function nextQuestion() {
  const current = answers[currentQuestion] || [];
  if (current.length === 0) return;
  if (currentQuestion === QUESTIONS.length - 1) {
    finishQuiz();
    return;
  }
  currentQuestion++;
  renderQuestion();
}

function prevQuestion() {
  if (currentQuestion === 0) return;
  currentQuestion--;
  renderQuestion();
}

function updateNavButtons() {
  const prevBtn = document.getElementById("quizPrevBtn");
  const nextBtn = document.getElementById("quizNextBtn");
  if (!prevBtn || !nextBtn) return;

  prevBtn.classList.toggle("hidden", currentQuestion === 0);

  if (currentQuestion === QUESTIONS.length - 1) {
    nextBtn.innerHTML = `<span class="material-symbols-outlined">auto_awesome</span> ${t("quiz.finish")}`;
  } else {
    nextBtn.innerHTML = `${t("quiz.next")} <span class="material-symbols-outlined">arrow_forward</span>`;
  }

  nextBtn.disabled = !answers[currentQuestion] || answers[currentQuestion].length === 0;
}

function evaluatePersonaClientSide(userAnswers) {
  let countE = 0, countI = 0;
  let countS = 0, countN = 0;
  let countT = 0, countF = 0;
  let countJ = 0, countP = 0;

  userAnswers.forEach((selectedIndices, qIdx) => {
    const ansIdx = selectedIndices?.[0];
    if (ansIdx === undefined || ansIdx === null) return;
    const q = QUESTIONS[qIdx];
    if (!q) return;

    if (q.dim === "EI") {
      if (ansIdx === 0) countE++; else countI++;
    } else if (q.dim === "SN") {
      if (ansIdx === 0) countS++; else countN++;
    } else if (q.dim === "TF") {
      if (ansIdx === 0) countT++; else countF++;
    } else if (q.dim === "JP") {
      if (ansIdx === 0) countJ++; else countP++;
    }
  });

  const poleEI = countE >= countI ? "E" : "I";
  const poleSN = countS >= countN ? "S" : "N";
  const poleTF = countT >= countF ? "T" : "F";
  const poleJP = countJ >= countP ? "J" : "P";
  const mbti = `${poleEI}${poleSN}${poleTF}${poleJP}`;

  return {
    personaKey: mbti,
    mbtiType: mbti,
    traits: {
      energy: poleEI === "E" ? "Extraversion (E)" : "Introversion (I)",
      information: poleSN === "S" ? "Sensing (S)" : "Intuition (N)",
      decision: poleTF === "T" ? "Thinking (T)" : "Feeling (F)",
      lifestyle: poleJP === "J" ? "Judging (J)" : "Perceiving (P)",
    },
    ratios: { countE, countI, countS, countN, countT, countF, countJ, countP },
  };
}

async function finishQuiz() {
  showScreen("quizResult");
  const resultContainer = document.getElementById("quizResult");
  if (resultContainer) {
    resultContainer.innerHTML = `
      <div class="quiz-loading-result">
        <div class="quiz-spinner"></div>
        <p style="font-size:14px;color:#475569;font-weight:600;">${t("quiz.analyzing")}</p>
      </div>
    `;
  }

  const clientEval = evaluatePersonaClientSide(answers);
  let resolvedPersona = clientEval.personaKey;
  let generatedProfile = null;
  let newBadges = [];

  const answerData = answers.map((selectedIndices, qIndex) => ({
    questionIndex: qIndex,
    answerIndex: selectedIndices,
  }));

  const selectedLabel = (questionIndex) => HARDCODED_QUESTIONS[questionIndex]?.answers[answers[questionIndex]?.[0]]?.label || "";
  const semanticTraits = {
    facingChallenges: selectedLabel(6),
    coreInterest: selectedLabel(3),
    activityPreference: selectedLabel(1),
    teamRole: selectedLabel(8),
    learningStyle: selectedLabel(5),
    primaryGoal: selectedLabel(0),
    obstacle: selectedLabel(2),
    flowState: selectedLabel(10),
    meaningfulPride: selectedLabel(7),
    motivator: selectedLabel(9),
  };

  let profilesByLang = {};
  let persistedQuiz = false;

  if (isAuthenticated()) {
    let user = getUser();
    if (!isStudentVerified(user)) {
      try {
        const res = await getCurrentUser();
        if (res?.user) {
          setUser(res.user);
          user = res.user;
        }
      } catch (e) {
        console.warn("Failed to refresh user status:", e);
      }
    }

    if (isStudentVerified(user)) {
      try {
        const surveyRes = await submitSurvey(answerData, AI_QUIZ_VERSION);
        persistedQuiz = Boolean(surveyRes?.scores);
        const currentLang = getLang();
        // Wait up to 35s for AI evaluation response (LLMs usually take 6-15s)
        const profilePromise = generateProfile(answerData, resolvedPersona, semanticTraits, currentLang).catch((err) => {
          console.error("[Quiz] AI Profile evaluation error:", err);
          return null;
        });
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 35000));
        
        const profileRes = await Promise.race([profilePromise, timeoutPromise]);

        if (surveyRes?.newBadges && Array.isArray(surveyRes.newBadges)) {
          newBadges.push(...surveyRes.newBadges);
        }
        if (profileRes?.newBadges && Array.isArray(profileRes.newBadges)) {
          newBadges.push(...profileRes.newBadges);
        }
        newBadges = [...new Set(newBadges)];
        
        if (profileRes?.profile) {
          generatedProfile = profileRes.profile;
          if (profileRes.profile.translations) {
            profilesByLang = { ...profileRes.profile.translations };
          }
          profilesByLang[currentLang] = profileRes.profile;
        }
      } catch (profileErr) {
        console.error("[Quiz] AI Profile evaluation error:", profileErr);
      }
    } else {
      console.warn("[Quiz] User is not student verified, skipping AI profile generation");
    }
  } else {
    // Unauthenticated/guest users: trigger celebration once per guest browser session
    const guestCelebrated = sessionStorage.getItem("springwave_guest_self_discovery_celebrated");
    if (!guestCelebrated) {
      sessionStorage.setItem("springwave_guest_self_discovery_celebrated", "true");
      newBadges.push("self_discovery");
    }
  }

  resolvedPersona = normalizeToMBTI(resolvedPersona || clientEval?.personaKey || "INTJ");
  if (persistedQuiz) {
    localStorage.setItem("springwave_quiz_completed", "true");
    localStorage.setItem("springwave_persona_key", resolvedPersona);
    localStorage.setItem("springwave_mbti_type", resolvedPersona);
  }

  const resultData = {
    personaKey: resolvedPersona,
    clientEval,
    profile: generatedProfile,
    answerData,
    semanticTraits,
    profilesByLang,
    newBadges,
  };
  lastResultData = resultData;
  renderResults(resolvedPersona, resultData);

  // Background non-blocking pre-generation of the opposite language
  const activeLang = getLang();
  const oppositeLang = activeLang === "en" ? "vi" : "en";
  if (answerData?.length > 0 && !profilesByLang[oppositeLang] && isAuthenticated()) {
    generateProfile(answerData, resolvedPersona, semanticTraits, oppositeLang)
      .then((res) => {
        if (res?.profile && lastResultData) {
          lastResultData.profilesByLang = lastResultData.profilesByLang || {};
          lastResultData.profilesByLang[oppositeLang] = res.profile;
          if (res.profile.translations) {
            lastResultData.profilesByLang = {
              ...lastResultData.profilesByLang,
              ...res.profile.translations,
            };
          }
        }
      })
      .catch((err) => console.warn("[Quiz] Background opposite language pre-generation failed:", err));
  }
}

function renderResults(rawPersonaKey, resultData = {}) {
  const personaKey = normalizeToMBTI(rawPersonaKey);
  const currentLang = getLang();
  const rawProfile = resultData.profile || null;
  const profilesByLang = resultData.profilesByLang || {};
  const localizedProfile = profilesByLang[currentLang]
    || rawProfile?.translations?.[currentLang]
    || rawProfile;
  const profile = localizedProfile;
  lastResultData = { personaKey, ...resultData, profile };
  const config = PERSONA_CONFIGS[personaKey] || PERSONA_CONFIGS.INTJ;
  const personaI18n = t(`quiz.personas.${personaKey}`) || {};
  
  // Custom Dynamic Archetype Title: Ensure personaKey (e.g. INTJ) is always prominent!
  let pureTitle = profile?.archetypeTitle || "";
  // Strip any old legacy names
  if (/Deep Specialist|Tech Builder|Creative Innovator|Community Leader|Career Strategist|Changemaker|Dynamic Explorer/i.test(pureTitle)) {
    pureTitle = "";
  }
  // Strip repeated MBTI prefix if AI or fallback added it
  pureTitle = pureTitle.replace(/^[A-Z]{4}\s*[-—:•]\s*/i, '').trim();
  
  let displayTitle = "";
  if (pureTitle) {
    displayTitle = `${personaKey} — ${pureTitle}`;
  } else if (personaI18n.title) {
    displayTitle = personaI18n.title.toUpperCase().includes(personaKey)
      ? personaI18n.title
      : `${personaKey} — ${personaI18n.title}`;
  } else {
    displayTitle = `${personaKey} — MBTI`;
  }
  displayTitle = escapeHtml(displayTitle);
  const displayTagline = escapeHtml(profile?.tagline || personaI18n.tagline || "");
  
  // Strengths: AI generated profile.skills or fallback to persona strengths
  const rawStrengths = (profile?.skills && Array.isArray(profile.skills) && profile.skills.length > 0)
    ? profile.skills
    : (Array.isArray(personaI18n.strengths) ? personaI18n.strengths : []);
  const strengths = rawStrengths.map((s) => escapeHtml(s));

  // Portrait Narrative (profile.profileText) and Personal Advice
  const portraitNarrative = profile?.profileText ? escapeHtml(profile.profileText) : "";
  const advice = personaI18n.advice ? escapeHtml(personaI18n.advice) : "";

  // Suggested Activities: from profile.preferredActivities or config.types
  const rawTypes = (profile?.preferredActivities && Array.isArray(profile.preferredActivities) && profile.preferredActivities.length > 0)
    ? profile.preferredActivities
    : (config.types || ["workshop", "seminar", "networking"]);
  const types = rawTypes.map(typeStr => {
    const key = typeStr.toLowerCase().replace(/[\s-]+/g, "_");
    const translated = t(`quiz.types.${key}`, {}, typeStr);
    return escapeHtml(translated);
  });

  // 4-Axis Breakdown calculation
  const poleEI = personaKey[0] || 'I';
  const poleSN = personaKey[1] || 'N';
  const poleTF = personaKey[2] || 'T';
  const poleJP = personaKey[3] || 'J';

  const ratios = resultData.clientEval?.ratios || {};
  const totalEI = ((ratios.countE || 0) + (ratios.countI || 0)) || 3;
  const pctE = Math.round(((ratios.countE != null ? ratios.countE : (poleEI === 'E' ? 2 : 1)) / totalEI) * 100);
  const pctI = 100 - pctE;

  const totalSN = ((ratios.countS || 0) + (ratios.countN || 0)) || 3;
  const pctS = Math.round(((ratios.countS != null ? ratios.countS : (poleSN === 'S' ? 2 : 1)) / totalSN) * 100);
  const pctN = 100 - pctS;

  const totalTF = ((ratios.countT || 0) + (ratios.countF || 0)) || 3;
  const pctT = Math.round(((ratios.countT != null ? ratios.countT : (poleTF === 'T' ? 2 : 1)) / totalTF) * 100);
  const pctF = 100 - pctT;

  const totalJP = ((ratios.countJ || 0) + (ratios.countP || 0)) || 3;
  const pctJ = Math.round(((ratios.countJ != null ? ratios.countJ : (poleJP === 'J' ? 2 : 1)) / totalJP) * 100);
  const pctP = 100 - pctJ;

  const axisBreakdownHtml = `
    <div class="quiz-block" style="margin-top:20px;">
      <div class="quiz-block-header">
        <span class="material-symbols-outlined" style="color:${config.solidColor};">tune</span>
        <span>${t("quiz.mbti_breakdown_title", {}, "Chi tiết 4 trục tính cách MBTI")}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px;">
        <!-- EI -->
        <div style="background:#f8fafc;padding:12px 16px;border-radius:12px;border:1px solid #e2e8f0;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:6px;">
            <span style="color:${poleEI === 'E' ? config.solidColor : '#64748b'};">${t("quiz.extraversion", {}, "Hướng ngoại (E)")} <strong>${pctE}%</strong></span>
            <span style="font-size:11px;color:#94a3b8;font-weight:600;">${t("quiz.axis_ei", {}, "Năng lượng & Tương tác")}</span>
            <span style="color:${poleEI === 'I' ? config.solidColor : '#64748b'};"><strong>${pctI}%</strong> ${t("quiz.introversion", {}, "Hướng nội (I)")}</span>
          </div>
          <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;display:flex;">
            <div style="width:${pctE}%;background:${poleEI === 'E' ? config.solidColor : '#cbd5e1'};"></div>
            <div style="width:${pctI}%;background:${poleEI === 'I' ? config.solidColor : '#cbd5e1'};"></div>
          </div>
        </div>

        <!-- SN -->
        <div style="background:#f8fafc;padding:12px 16px;border-radius:12px;border:1px solid #e2e8f0;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:6px;">
            <span style="color:${poleSN === 'S' ? config.solidColor : '#64748b'};">${t("quiz.sensing", {}, "Thực tế (S)")} <strong>${pctS}%</strong></span>
            <span style="font-size:11px;color:#94a3b8;font-weight:600;">${t("quiz.axis_sn", {}, "Tiếp nhận thông tin")}</span>
            <span style="color:${poleSN === 'N' ? config.solidColor : '#64748b'};"><strong>${pctN}%</strong> ${t("quiz.intuition", {}, "Trực giác (N)")}</span>
          </div>
          <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;display:flex;">
            <div style="width:${pctS}%;background:${poleSN === 'S' ? config.solidColor : '#cbd5e1'};"></div>
            <div style="width:${pctN}%;background:${poleSN === 'N' ? config.solidColor : '#cbd5e1'};"></div>
          </div>
        </div>

        <!-- TF -->
        <div style="background:#f8fafc;padding:12px 16px;border-radius:12px;border:1px solid #e2e8f0;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:6px;">
            <span style="color:${poleTF === 'T' ? config.solidColor : '#64748b'};">${t("quiz.thinking", {}, "Lý trí (T)")} <strong>${pctT}%</strong></span>
            <span style="font-size:11px;color:#94a3b8;font-weight:600;">${t("quiz.axis_tf", {}, "Ra quyết định")}</span>
            <span style="color:${poleTF === 'F' ? config.solidColor : '#64748b'};"><strong>${pctF}%</strong> ${t("quiz.feeling", {}, "Cảm xúc (F)")}</span>
          </div>
          <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;display:flex;">
            <div style="width:${pctT}%;background:${poleTF === 'T' ? config.solidColor : '#cbd5e1'};"></div>
            <div style="width:${pctF}%;background:${poleTF === 'F' ? config.solidColor : '#cbd5e1'};"></div>
          </div>
        </div>

        <!-- JP -->
        <div style="background:#f8fafc;padding:12px 16px;border-radius:12px;border:1px solid #e2e8f0;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;margin-bottom:6px;">
            <span style="color:${poleJP === 'J' ? config.solidColor : '#64748b'};">${t("quiz.judging", {}, "Nguyên tắc (J)")} <strong>${pctJ}%</strong></span>
            <span style="font-size:11px;color:#94a3b8;font-weight:600;">${t("quiz.axis_jp", {}, "Lối sống & Kế hoạch")}</span>
            <span style="color:${poleJP === 'P' ? config.solidColor : '#64748b'};"><strong>${pctP}%</strong> ${t("quiz.perceiving", {}, "Linh hoạt (P)")}</span>
          </div>
          <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;display:flex;">
            <div style="width:${pctJ}%;background:${poleJP === 'J' ? config.solidColor : '#cbd5e1'};"></div>
            <div style="width:${pctP}%;background:${poleJP === 'P' ? config.solidColor : '#cbd5e1'};"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const resultContainer = document.getElementById("quizResult");
  if (!resultContainer) return;
  resultContainer.innerHTML = `
    <!-- Persona Hero Card -->
    <div class="quiz-persona-card">
      <div class="quiz-persona-badge" style="background:#f8fafc;color:#334155;border:1px solid #e2e8f0;">
        <span class="material-symbols-outlined" style="font-size:16px;color:#23499b;">${config.icon}</span>
        <span>${t("quiz.persona_badge")}: <strong style="font-size:13px;letter-spacing:0.04em;color:#0f172a;">${escapeHtml(personaKey)}</strong> • ${t("quiz.temperaments." + (config.temperament || "analysts"), {}, config.temperamentTitle || "")}</span>
      </div>
      <div class="quiz-persona-icon-box" style="background:#23499b;box-shadow:0 6px 18px rgba(15,23,42,0.12);">
        <span class="material-symbols-outlined">${config.icon}</span>
      </div>
      <h1 class="quiz-persona-name">${displayTitle}</h1>
      <p class="quiz-persona-motto">${displayTagline}</p>
    </div>

    <!-- AI Personality Portrait Narrative Section (if generated) -->
    ${
      portraitNarrative
        ? `
      <div class="quiz-portrait-narrative">
        <div class="quiz-block-header">
          <span class="material-symbols-outlined" style="color:#23499b;font-size:18px;">psychology</span>
          <span style="font-weight:700;">${t("quiz.portrait_narrative_title", {}, "Bản sắc Cá nhân & Lối tư duy")}</span>
        </div>
        <p>${portraitNarrative}</p>
      </div>
    `
        : ""
    }

    <!-- 4-Axis MBTI Breakdown Card -->
    ${axisBreakdownHtml}

    <!-- Strengths Section -->
    ${
      strengths.length > 0
        ? `
      <div class="quiz-block">
        <div class="quiz-block-header">
          <span class="material-symbols-outlined" style="color:#23499b;">verified</span>
          <span>${t("quiz.strengths_title")}</span>
        </div>
        <div class="quiz-strength-grid">
          ${strengths
            .map(
              (s) => `
            <div class="quiz-strength-chip">
              <span class="material-symbols-outlined">check_circle</span>
              <span>${s}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
        : ""
    }

    <!-- Personal Advice Card -->
    ${
      advice
        ? `
      <div class="quiz-advice-box">
        <div class="quiz-block-header">
          <span class="material-symbols-outlined">tips_and_updates</span>
          <span>${t("quiz.advice_title")}</span>
        </div>
        <p class="quiz-advice-text">${advice}</p>
      </div>
    `
        : ""
    }

    <!-- Pathway Section -->
    <div class="quiz-block">
      <div class="quiz-block-header">
        <span class="material-symbols-outlined" style="color:#23499b;">route</span>
        <span>${t("quiz.suggested_activities")}</span>
      </div>
      <div class="quiz-pathway-list">
        ${types
          .map(
            (item) => `
          <span class="quiz-pathway-chip">
            <span class="material-symbols-outlined">stars</span>
            <span>${item}</span>
          </span>
        `
          )
          .join("")}
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="quiz-actions-container">
      <button class="quiz-action-primary" id="quizExploreBtn">
        <span class="material-symbols-outlined" style="font-size:20px;">explore</span>
        <span>${isAuthenticated() ? t("quiz.explore_activities") : t("quiz.register_explore")}</span>
      </button>
      <button class="quiz-action-secondary" id="quizRetakeBtn">
        <span class="material-symbols-outlined" style="font-size:18px;">replay</span>
        <span>${t("quiz.retake")}</span>
      </button>
    </div>
  `;

  document.getElementById("quizExploreBtn")?.addEventListener("click", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get("redirect");
    if (redirectUrl && (redirectUrl.startsWith("/") || redirectUrl.startsWith(window.location.origin))) {
      window.location.href = redirectUrl;
      return;
    }
    window.location.href = isAuthenticated() ? "/explore.html" : "/register.html";
  });

  document.getElementById("quizRetakeBtn")?.addEventListener("click", () => {
    currentQuestion = 0;
    answers = [];
    lastResultData = null;
    showScreen("quizStart");
  });

  // Trigger Achievement Celebration with Graffiti & Confetti FX only if newly unlocked
  if (resultData?.newBadges?.includes("self_discovery")) {
    setTimeout(() => {
      triggerBadgeCelebration("self_discovery");
    }, 450);
    resultData.newBadges = resultData.newBadges.filter((b) => b !== "self_discovery");
  }
}
