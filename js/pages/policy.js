import "../../src/style.css";
import { loadNavbar } from "../components/navbar.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent } from "../lib/utils.js";
import { initI18n, applyTranslation } from "../lib/i18n.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  await loadNavbar({ activeSection: "policy" });
  await loadFooter();
  await initChatbot();
  applyTranslation();

  initTabs();
  initTableOfContents();
  initPrintAction();

  window.addEventListener("language-changed", () => {
    applyTranslation();
  });
});

async function loadFooter() {
  const html = await fetchContent("./components/footer.html");
  const container = document.getElementById("footer-container");
  if (container) {
    container.innerHTML = html;
    applyTranslation(container);
  }
}

function initTabs() {
  const tabButtons = document.querySelectorAll(".policy-tab-btn");
  if (!tabButtons.length) return;

  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get("tab") || "privacy";

  function setActiveTab(tabKey, shouldScroll = false) {
    tabButtons.forEach((btn) => {
      const isSelected = btn.dataset.tab === tabKey;
      btn.classList.toggle("active", isSelected);
      btn.classList.toggle("bg-white", isSelected);
      btn.classList.toggle("text-[#1755ba]", isSelected);
      btn.classList.toggle("shadow-sm", isSelected);
      btn.classList.toggle("text-slate-600", !isSelected);
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
    });

    if (shouldScroll) {
      let targetEl = null;
      if (tabKey === "terms") {
        targetEl = document.getElementById("sec10");
      } else if (tabKey === "google") {
        targetEl = document.getElementById("sec4");
      } else {
        targetEl = document.getElementById("sec1");
      }

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabKey = btn.dataset.tab;
      const url = new URL(window.location);
      url.searchParams.set("tab", tabKey);
      window.history.replaceState({}, "", url);
      setActiveTab(tabKey, true);
    });
  });

  if (initialTab !== "privacy") {
    setActiveTab(initialTab, true);
  }
}

function initTableOfContents() {
  const sections = document.querySelectorAll(".policy-section");
  const tocLinks = document.querySelectorAll("#policy-toc .toc-link");

  if (!sections.length || !tocLinks.length) return;

  const observerOptions = {
    root: null,
    rootMargin: "-120px 0px -60% 0px",
    threshold: 0,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute("id");
        tocLinks.forEach((link) => {
          const href = link.getAttribute("href");
          const isActive = href === `#${id}`;
          link.classList.toggle("text-[#1755ba]", isActive);
          link.classList.toggle("bg-blue-50/70", isActive);
          link.classList.toggle("font-bold", isActive);
          link.classList.toggle("text-slate-600", !isActive);
        });

        // Sync active tab if crossing major boundaries
        const tabButtons = document.querySelectorAll(".policy-tab-btn");
        let activeTab = "privacy";
        if (id === "sec10") activeTab = "terms";
        else if (id === "sec4") activeTab = "google";

        tabButtons.forEach((btn) => {
          const isSelected = btn.dataset.tab === activeTab;
          btn.classList.toggle("active", isSelected);
          btn.classList.toggle("bg-white", isSelected);
          btn.classList.toggle("text-[#1755ba]", isSelected);
          btn.classList.toggle("shadow-sm", isSelected);
          btn.classList.toggle("text-slate-600", !isSelected);
        });
      }
    });
  }, observerOptions);

  sections.forEach((sec) => observer.observe(sec));
}

function initPrintAction() {
  const printBtn = document.getElementById("policy-print-btn");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }
}
