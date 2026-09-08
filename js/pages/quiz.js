import "../../src/style.css";
import { isAuthenticated, getUser, setUser, isStudentVerified } from "../lib/session.js";
import { getCurrentUser } from "../api/auth.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent } from "../lib/utils.js";
import { submitSurvey, getSurveyQuestions, getSurveyResult } from "../api/survey.js";
import { generateProfile, getMyProfile } from "../api/profile.js";
import { initI18n, getLang, setLang, t, applyTranslation } from "../lib/i18n.js";
import { canPerformAction, markActionPerformed } from "../lib/throttle.js";
import { triggerBadgeCelebration } from "../components/badgeCelebration.js";

const HARDCODED_QUESTIONS = [
  {
    id: 1,
    category: "Facing Challenges",
    categoryKey: "facing_challenges",
    icon: "psychology_alt",
    question: "When facing a completely new problem or feeling stuck, what is your natural reaction?",
    answers: [
      { label: "Dive deep, read documentation & tirelessly experiment until finding the solution", weights: { tech_builder: 5, deep_learner: 4 }, trait: "self_reliant" },
      { label: "Reach out to peers, mentors or experienced seniors to discuss and brainstorm", weights: { community_leader: 5, changemaker: 3 }, trait: "collaborative" },
      { label: "Step away, take a walk, listen to music and let creative intuition spark", weights: { creative_innovator: 6, dynamic_explorer: 2 }, trait: "intuitive" },
      { label: "Break the problem down into a detailed checklist and tackle it step by step", weights: { career_strategist: 5, tech_builder: 3 }, trait: "systematic" },
    ],
  },
  {
    id: 2,
    category: "Core Passion",
    categoryKey: "core_passion",
    icon: "interests",
    question: "Which domain naturally sparks your curiosity and makes you lose track of time?",
    answers: [
      { label: "Technology, Software Engineering, AI & Digital Systems", weights: { tech_builder: 6, deep_learner: 3 }, types: ["hackathon", "tech_talk", "coding_workshop"] },
      { label: "Business Strategy, Entrepreneurship, Marketing & Management", weights: { career_strategist: 6, community_leader: 2 }, types: ["seminar", "networking", "case_challenge"] },
      { label: "Visual Arts, UI/UX Design, Media Production & Content Creation", weights: { creative_innovator: 6, dynamic_explorer: 2 }, types: ["art_festival", "design_workshop", "exhibition"] },
      { label: "Social Sciences, Psychology, Community Development & Humanities", weights: { changemaker: 6, community_leader: 3 }, types: ["community_event", "volunteer_campaign"] },
      { label: "Sports, Fitness, Physical Wellness & Outdoor Challenges", weights: { dynamic_explorer: 5, changemaker: 3 }, types: ["cultural_festival", "community_event"] },
      { label: "Fundamental Science, Academic Research & Theoretical Discovery", weights: { deep_learner: 6, tech_builder: 2 }, types: ["research_seminar", "masterclass"] },
    ],
  },
  {
    id: 3,
    category: "Inspiring Activity",
    categoryKey: "inspiring_activity",
    icon: "local_fire_department",
    question: "What kind of extracurricular experience gives you the strongest sense of fulfillment?",
    answers: [
      { label: "Intensive Masterclasses & Hands-on Workshops with practical drills", weights: { deep_learner: 5, career_strategist: 3 }, types: ["masterclass", "hands_on_workshop"] },
      { label: "Academic contests, Hackathons & Fast-paced Case Challenges", weights: { tech_builder: 6, career_strategist: 3 }, types: ["hackathon", "case_challenge"] },
      { label: "Arts exhibitions, Cultural festivals & Inspiring creative showcases", weights: { creative_innovator: 6, dynamic_explorer: 2 }, types: ["art_festival", "exhibition", "music_show"] },
      { label: "Club meetups, Leadership gatherings & Cross-university networking", weights: { community_leader: 6, dynamic_explorer: 2 }, types: ["networking", "leadership_workshop"] },
      { label: "Volunteer expeditions, Charity projects & Environmental campaigns", weights: { changemaker: 6, community_leader: 2 }, types: ["volunteer_campaign", "charity_event", "environmental_project"] },
    ],
  },
  {
    id: 4,
    category: "Team Role",
    categoryKey: "team_role",
    icon: "badge",
    question: "In a team or collective project, in which role do you feel most confident and valuable?",
    answers: [
      { label: "The Coordinator / Team leader defining vision and keeping everyone on schedule", weights: { community_leader: 6, career_strategist: 3 } },
      { label: "The Specialist / Core builder solving tough technical problems and crafting the product", weights: { tech_builder: 6, deep_learner: 3 } },
      { label: "The Creative Catalyst / Idea generator breathing aesthetic and unique identity into the work", weights: { creative_innovator: 6, dynamic_explorer: 3 } },
      { label: "The Emotional Anchor / Caring facilitator listening, encouraging and maintaining harmony", weights: { changemaker: 6, community_leader: 3 } },
    ],
  },
  {
    id: 5,
    category: "Learning Style",
    categoryKey: "learning_style",
    icon: "auto_stories",
    question: "How do you recharge your mind and assimilate complex knowledge most effectively?",
    answers: [
      { label: "Engaging in energetic group debates, discussions and peer exchange", weights: { community_leader: 5, dynamic_explorer: 3 } },
      { label: "Deep solo contemplation in a quiet, undisturbed sanctuary", weights: { deep_learner: 6, tech_builder: 3 } },
      { label: "Immediate experiential practice — building, making mistakes and iterating", weights: { tech_builder: 5, creative_innovator: 3, career_strategist: 2 } },
      { label: "Listening to structured insights from masters and taking meticulous notes", weights: { deep_learner: 5, career_strategist: 3 } },
    ],
  },
  {
    id: 6,
    category: "Core Growth Goal",
    categoryKey: "core_growth_goal",
    icon: "flag",
    question: "What is your biggest personal milestone or aspiration through student activities?",
    answers: [
      { label: "Mastering deep expertise and building tangible products of real value", weights: { tech_builder: 5, deep_learner: 4 } },
      { label: "Polishing high-impact professional skills, boosting CV and accelerating career", weights: { career_strategist: 6 } },
      { label: "Broadening meaningful relationships and finding lifelong like-minded allies", weights: { community_leader: 5, dynamic_explorer: 2 } },
      { label: "Cultivating emotional intelligence, public speaking charisma and personal confidence", weights: { changemaker: 4, community_leader: 4 } },
      { label: "Unwinding, relieving stress and embracing diverse youthful adventures", weights: { dynamic_explorer: 6, creative_innovator: 2 } },
    ],
  },
  {
    id: 7,
    category: "Inner Hesitation",
    categoryKey: "inner_hesitation",
    icon: "help_center",
    question: "What is your most frequent hesitation before committing to a new activity?",
    answers: [
      { label: "Hesitant to attend alone / Feeling out of place in massive unfamiliar crowds", weights: { deep_learner: 2, tech_builder: 1 }, obstacle: "solo_shy" },
      { label: "Overwhelmed by academic deadlines, assignments and demanding coursework", weights: { career_strategist: 2, deep_learner: 1 }, obstacle: "busy_deadline" },
      { label: "Imposter syndrome / Feeling underprepared or less qualified than peers", weights: { deep_learner: 2, tech_builder: 2 }, obstacle: "imposter_syndrome" },
      { label: "Concerned the event is superficial or formalistic with little practical value", weights: { tech_builder: 2, career_strategist: 2 }, obstacle: "quality_content" },
      { label: "Commute distance, rigid timing or registration financial costs", weights: { changemaker: 2, dynamic_explorer: 2 }, obstacle: "commute_cost" },
    ],
  },
  {
    id: 8,
    category: "Flow State Space",
    categoryKey: "flow_state_space",
    icon: "self_improvement",
    question: "In what environment do you most easily enter your Flow State of deep immersion?",
    answers: [
      { label: "A secluded corner or quiet café with noise-cancelling headphones, immersed in my zone", weights: { deep_learner: 4, tech_builder: 3 } },
      { label: "An open, flexible space close to nature without rigid clocks or micromanagement", weights: { dynamic_explorer: 4, creative_innovator: 3 } },
      { label: "A dynamic collaborative room with whiteboards, buzzing with passionate brainstorming", weights: { community_leader: 4, creative_innovator: 2 } },
      { label: "A structured, highly professional environment where everyone is focused and disciplined", weights: { career_strategist: 4, tech_builder: 2 } },
    ],
  },
  {
    id: 9,
    category: "Daily Fulfillment",
    categoryKey: "daily_fulfillment",
    icon: "wb_sunny",
    question: "At the end of a long day, what gives you the most profound sense of pride and peace?",
    answers: [
      { label: "Having built or fixed something tangible that actually runs flawlessly", weights: { tech_builder: 5, creative_innovator: 2 } },
      { label: "Discovering an illuminating insight or truly understanding a concept that was once obscure", weights: { deep_learner: 5, tech_builder: 1 } },
      { label: "Knowing I genuinely supported or brightened someone's day through empathy", weights: { changemaker: 5, community_leader: 2 } },
      { label: "Executing all planned priorities on my checklist with self-discipline and focus", weights: { career_strategist: 4, tech_builder: 2 } },
    ],
  },
  {
    id: 10,
    category: "Key Spark",
    categoryKey: "key_spark",
    icon: "bolt",
    question: "What decisive spark makes you immediately hit Register without a second thought?",
    answers: [
      { label: "The presence of industry-leading mentors and renowned guest thinkers to learn from", weights: { deep_learner: 4, career_strategist: 3 }, motivator: "speakers" },
      { label: "Clear gateways to prestigious internships, career recommendations or high-value prizes", weights: { career_strategist: 5, tech_builder: 2 }, motivator: "career_boost" },
      { label: "A truly cutting-edge, avant-garde topic that sparks irresistible curiosity", weights: { creative_innovator: 4, tech_builder: 3 }, motivator: "novel_topic" },
      { label: "Close, trusted friends or trusted teammates enthusiastically going along", weights: { community_leader: 4, dynamic_explorer: 3 }, motivator: "friends" },
      { label: "A genuine, non-commercial initiative dedicated to real community empowerment", weights: { changemaker: 5, dynamic_explorer: 2 }, motivator: "community_cause" },
    ],
  },
];

let QUESTIONS = [...HARDCODED_QUESTIONS];

const PERSONA_CONFIGS = {
  tech_builder: {
    key: "tech_builder",
    icon: "terminal",
    solidColor: "#2563eb",
    textColor: "#2563eb",
    bgSoft: "#eff6ff",
    types: ["hackathon", "tech_talk", "coding_workshop", "seminar"],
  },
  community_leader: {
    key: "community_leader",
    icon: "groups",
    solidColor: "#7c3aed",
    textColor: "#7c3aed",
    bgSoft: "#f5f3ff",
    types: ["networking", "community_event", "leadership_workshop", "seminar"],
  },
  creative_innovator: {
    key: "creative_innovator",
    icon: "palette",
    solidColor: "#ea580c",
    textColor: "#ea580c",
    bgSoft: "#fff7ed",
    types: ["art_festival", "design_workshop", "music_show", "exhibition"],
  },
  career_strategist: {
    key: "career_strategist",
    icon: "work_outline",
    solidColor: "#0284c7",
    textColor: "#0284c7",
    bgSoft: "#f0f9ff",
    types: ["career_talk", "case_challenge", "company_tour", "industry_workshop"],
  },
  deep_learner: {
    key: "deep_learner",
    icon: "psychology",
    solidColor: "#4f46e5",
    textColor: "#4f46e5",
    bgSoft: "#eef2ff",
    types: ["research_seminar", "masterclass", "academic_conference", "study_group"],
  },
  changemaker: {
    key: "changemaker",
    icon: "volunteer_activism",
    solidColor: "#059669",
    textColor: "#059669",
    bgSoft: "#ecfdf5",
    types: ["volunteer_campaign", "charity_event", "environmental_project", "community_forum"],
  },
  dynamic_explorer: {
    key: "dynamic_explorer",
    icon: "explore",
    solidColor: "#e11d48",
    textColor: "#e11d48",
    bgSoft: "#fff1f2",
    types: ["cultural_festival", "hands_on_workshop", "club_fair", "community_event"],
  },
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

  await loadQuestions();
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
      const key = p.personaKey || data?.personaKey || "tech_builder";
      const currentLang = getLang();
      const profilesByLang = p.translations || {};
      if (!profilesByLang[currentLang]) {
        profilesByLang[currentLang] = p;
      }
      lastResultData = {
        personaKey: key,
        clientEval: { personaKey: key },
        profile: profilesByLang[currentLang] || p,
        profilesByLang,
      };
    }
  } catch {
    // No existing result
  }
}

async function loadQuestions() {
  try {
    const data = await getSurveyQuestions();
    if (data?.questions?.length === HARDCODED_QUESTIONS.length) {
      QUESTIONS = HARDCODED_QUESTIONS.map((hq, idx) => {
        const remoteQ = data.questions[idx];
        return {
          ...hq,
          question: remoteQ?.question || hq.question,
          answers: hq.answers.map((ha, aIdx) => ({
            ...ha,
            label: remoteQ?.answers?.[aIdx]?.label || ha.label,
          })),
        };
      });
    }
  } catch {
    console.log("Using hardcoded questions");
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
  const colors = {
    facing_challenges: "#2563EB",
    core_passion: "#8B5CF6",
    inspiring_activity: "#F59E0B",
    team_role: "#06B6D4",
    learning_style: "#6366F1",
    core_growth_goal: "#3B82F6",
    inner_hesitation: "#EF4444",
    flow_state_space: "#10B981",
    daily_fulfillment: "#F97316",
    key_spark: "#EC4899",
  };
  return colors[categoryKey] || "#2563EB";
}

function renderQuestion() {
  const q = QUESTIONS[currentQuestion];
  const qKey = `q${q.id}`;
  const rawTranslatedQ = t(`quiz.${qKey}.question`);
  const translatedQuestion = (rawTranslatedQ && rawTranslatedQ !== `quiz.${qKey}.question`) ? rawTranslatedQ : q.question;
  const color = getCategoryColor(q.categoryKey);

  const numEl = document.getElementById("questionNumber");
  if (numEl) {
    numEl.textContent = `${t("quiz.question")} ${currentQuestion + 1} / ${QUESTIONS.length}`;
  }
  
  const categoryEl = document.getElementById("questionCategory");
  const transCategory = t("quiz.categories." + q.categoryKey, {}, q.category);
  if (categoryEl) {
    categoryEl.style.background = color + "15";
    categoryEl.style.color = color;
    categoryEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">${q.icon || "help"}</span> ${transCategory}`;
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
  hintDiv.style.cssText = "font-size:12px;color:#64748b;margin-bottom:12px;font-weight:500;display:flex;align-items:center;gap:4px;";
  hintDiv.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">checklist</span> ${t("quiz.multi_select", "Select all that apply")}`;
  container.appendChild(hintDiv);

  const translatedAnswers = t(`quiz.${qKey}.answers`);
  q.answers.forEach((answer, idx) => {
    const isSelected = selected.includes(idx);
    const translatedLabel = Array.isArray(translatedAnswers) ? translatedAnswers[idx] : undefined;
    const displayLabel = translatedLabel || answer.label;
    
    const div = document.createElement("div");
    div.className = `quiz-answer-btn ${isSelected ? "selected" : ""}`;
    div.innerHTML = `
      <span class="quiz-answer-checkbox">${
        isSelected
          ? '<span class="material-symbols-outlined" style="font-size:20px;color:#23499b;">check_box</span>'
          : '<span class="material-symbols-outlined" style="font-size:20px;color:#94a3b8;">check_box_outline_blank</span>'
      }</span>
      <span class="quiz-answer-text">${displayLabel}</span>
    `;
    div.addEventListener("click", () => selectAnswer(idx));
    div.dataset.index = idx;
    container.appendChild(div);
  });

  updateNavButtons();
}

function selectAnswer(index) {
  const current = answers[currentQuestion] || [];
  const idx = current.indexOf(index);
  if (idx > -1) {
    current.splice(idx, 1);
  } else {
    current.push(index);
  }
  answers[currentQuestion] = current;
  renderQuestion();
  const nextBtn = document.getElementById("quizNextBtn");
  if (nextBtn) {
    nextBtn.disabled = current.length === 0;
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
  // Psychological & behavioral weightings:
  // Q2: Core Passion (idx: 1) -> 3.5x
  // Q4: Team Role (idx: 3) -> 2.5x
  // Q5: Learning Style (idx: 4) -> 2.0x
  // Q9: Daily Fulfillment (idx: 8) -> 2.0x
  // Q8: Flow State Space (idx: 7) -> 1.8x
  // Q1: Facing Challenges (idx: 0) -> 1.8x
  // Q3: Inspiring Activity (idx: 2) -> 1.5x
  // Q6: Core Growth Goal (idx: 5) -> 1.5x
  // Q10: Key Spark (idx: 9) -> 1.2x
  // Q7: Inner Hesitation (idx: 6) -> 0.8x
  const multipliers = {
    1: 3.5, // Core Passion
    3: 2.5, // Team Role
    4: 2.0, // Learning Style
    8: 2.0, // Daily Fulfillment
    7: 1.8, // Flow State Space
    0: 1.8, // Facing Challenges
    2: 1.5, // Inspiring Activity
    5: 1.5, // Core Growth Goal
    9: 1.2, // Key Spark
    6: 0.8, // Inner Hesitation
  };

  const weights = {
    tech_builder: 0,
    community_leader: 0,
    creative_innovator: 0,
    career_strategist: 0,
    deep_learner: 0,
    changemaker: 0,
    dynamic_explorer: 0,
  };

  const collectedTypes = [];

  userAnswers.forEach((selectedIndices, qIdx) => {
    const q = QUESTIONS[qIdx];
    if (!q) return;
    const mult = multipliers[qIdx] ?? 1.0;
    selectedIndices.forEach((ansIdx) => {
      const ans = q.answers[ansIdx];
      if (!ans) return;
      if (ans.weights) {
        Object.entries(ans.weights).forEach(([key, val]) => {
          weights[key] = (weights[key] || 0) + val * mult;
        });
      }
      if (ans.types) {
        collectedTypes.push(...ans.types);
      }
    });
  });

  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const primaryKey = sorted[0]?.[0] || "deep_learner";
  return {
    personaKey: primaryKey,
    weights,
    collectedTypes: [...new Set(collectedTypes)],
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

  const semanticTraits = {
    facingChallenges: HARDCODED_QUESTIONS[0]?.answers[answers[0]?.[0]]?.label || "",
    coreInterest: HARDCODED_QUESTIONS[1]?.answers[answers[1]?.[0]]?.label || "",
    activityPreference: HARDCODED_QUESTIONS[2]?.answers[answers[2]?.[0]]?.label || "",
    teamRole: HARDCODED_QUESTIONS[3]?.answers[answers[3]?.[0]]?.label || "",
    learningStyle: HARDCODED_QUESTIONS[4]?.answers[answers[4]?.[0]]?.label || "",
    primaryGoal: HARDCODED_QUESTIONS[5]?.answers[answers[5]?.[0]]?.label || "",
    obstacle: HARDCODED_QUESTIONS[6]?.answers[answers[6]?.[0]]?.label || "",
    flowState: HARDCODED_QUESTIONS[7]?.answers[answers[7]?.[0]]?.label || "",
    meaningfulPride: HARDCODED_QUESTIONS[8]?.answers[answers[8]?.[0]]?.label || "",
    motivator: HARDCODED_QUESTIONS[9]?.answers[answers[9]?.[0]]?.label || "",
  };

  let profilesByLang = {};

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
        const surveyPromise = submitSurvey(answerData).catch((err) => {
          console.warn("Survey submission failed:", err);
          return null;
        });

        const currentLang = getLang();
        console.log("[Quiz] Requesting AI profile generation with traits (lang=" + currentLang + "):", semanticTraits);
        // Wait up to 35s for AI evaluation response (LLMs usually take 6-15s)
        const profilePromise = generateProfile(answerData, resolvedPersona, semanticTraits, currentLang).catch((err) => {
          console.error("[Quiz] AI Profile evaluation error:", err);
          return null;
        });
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 35000));
        
        const [surveyRes, profileRes] = await Promise.all([
          surveyPromise,
          Promise.race([profilePromise, timeoutPromise]),
        ]);

        if (surveyRes?.newBadges && Array.isArray(surveyRes.newBadges)) {
          newBadges.push(...surveyRes.newBadges);
        }
        if (profileRes?.newBadges && Array.isArray(profileRes.newBadges)) {
          newBadges.push(...profileRes.newBadges);
        }
        newBadges = [...new Set(newBadges)];
        
        console.log("[Quiz] AI profile response received:", profileRes);

        if (profileRes?.profile) {
          generatedProfile = profileRes.profile;
          if (profileRes.profile.personaKey) {
            resolvedPersona = profileRes.profile.personaKey;
          }
          if (profileRes.profile.translations) {
            profilesByLang = { ...profileRes.profile.translations };
          }
          profilesByLang[currentLang] = profileRes.profile;
        } else if (profileRes?.personaKey) {
          resolvedPersona = profileRes.personaKey;
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

  localStorage.setItem("springwave_quiz_completed", "true");
  localStorage.setItem("springwave_persona_key", resolvedPersona);

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

function renderResults(personaKey, resultData = {}) {
  const currentLang = getLang();
  const rawProfile = resultData.profile || null;
  const profilesByLang = resultData.profilesByLang || {};
  const localizedProfile = profilesByLang[currentLang]
    || rawProfile?.translations?.[currentLang]
    || rawProfile;
  const profile = localizedProfile;
  lastResultData = { personaKey, ...resultData, profile };
  const config = PERSONA_CONFIGS[personaKey] || PERSONA_CONFIGS.dynamic_explorer;
  const personaI18n = t(`quiz.personas.${personaKey}`) || {};
  
  // Custom Dynamic Archetype Title from AI Portrait or Fallback to i18n
  const displayTitle = escapeHtml(profile?.archetypeTitle || personaI18n.title || personaKey);
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

  const resultContainer = document.getElementById("quizResult");
  if (!resultContainer) return;
  resultContainer.innerHTML = `
    <!-- Persona Hero Card -->
    <div class="quiz-persona-card">
      <div class="quiz-persona-badge" style="background:${config.bgSoft};color:${config.textColor};border-color:${config.solidColor}33;">
        <span class="material-symbols-outlined" style="font-size:15px;color:${config.textColor};">auto_awesome</span>
        <span>${t("quiz.persona_badge")}</span>
      </div>
      <div class="quiz-persona-icon-box" style="background:${config.solidColor};box-shadow:0 12px 28px -4px ${config.solidColor}55;">
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
          <span class="material-symbols-outlined" style="color:${config.solidColor};font-size:18px;">psychology</span>
          <span style="font-weight:700;">${t("quiz.portrait_narrative_title", {}, "Bản sắc Cá nhân & Lối tư duy")}</span>
        </div>
        <p>${portraitNarrative}</p>
      </div>
    `
        : ""
    }

    <!-- Strengths Section -->
    ${
      strengths.length > 0
        ? `
      <div class="quiz-block">
        <div class="quiz-block-header">
          <span class="material-symbols-outlined" style="color:#10b981;">verified</span>
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
        <span class="material-symbols-outlined" style="color:${config.solidColor};">route</span>
        <span>${t("quiz.suggested_activities")}</span>
      </div>
      <div class="quiz-pathway-list">
        ${types
          .map(
            (item) => `
          <span class="quiz-pathway-chip" style="background:${config.bgSoft};border-color:${config.solidColor}26;color:${config.textColor};">
            <span class="material-symbols-outlined" style="color:${config.solidColor};">stars</span>
            <span>${item}</span>
          </span>
        `
          )
          .join("")}
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="quiz-actions-container">
      <button class="quiz-action-primary" id="quizExploreBtn" style="background:${config.solidColor};">
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

