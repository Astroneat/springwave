import "../../src/style.css";
import { isAuthenticated, getUser } from "../lib/session.js";
import { loadNavbar } from "../components/navbar.js";
import { getAdminAnalytics, downloadAdminExcelReport } from "../api/analytics.js";
import { t, applyTranslation } from "../lib/i18n.js";

let categoryChart = null;
let verificationChart = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!isAuthenticated()) {
    window.location.href = "/login.html";
    return;
  }
  const user = getUser();
  if (user?.role !== "admin") {
    window.location.href = "/login.html";
    return;
  }

  loadNavbar();
  await loadAnalytics();

  const exportBtn = document.getElementById("export-master-excel-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", async () => {
      try {
        await downloadAdminExcelReport();
      } catch (err) {
        alert(err.message || "Failed to download master Excel report");
      }
    });
  }
});

async function loadAnalytics() {
  try {
    const data = await getAdminAnalytics();
    const kpis = data.platformKpis || {};
    const categories = data.categoryBreakdown || [];
    const leaderboard = data.orgLeaderboard || [];
    const verification = data.verificationPipeline || {};

    // KPIs
    document.getElementById("admin-stat-events").textContent = kpis.totalEvents || 0;
    document.getElementById("admin-stat-users").textContent = kpis.totalUsers || 0;
    document.getElementById("admin-stat-students").textContent = kpis.verifiedStudents || 0;
    document.getElementById("admin-stat-checkins").textContent = kpis.totalCheckins || 0;

    // Categories Chart
    const catCtx = document.getElementById("chart-admin-categories")?.getContext("2d");
    if (catCtx && typeof Chart !== "undefined") {
      if (categoryChart) categoryChart.destroy();
      const labels = categories.map(c => c.name);
      const values = categories.map(c => c.eventCount);
      categoryChart = new Chart(catCtx, {
        type: "pie",
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: ["#3b6fd4", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "right" } }
        }
      });
    }

    // Verification Pipeline Chart
    const verCtx = document.getElementById("chart-admin-verification")?.getContext("2d");
    if (verCtx && typeof Chart !== "undefined") {
      if (verificationChart) verificationChart.destroy();
      verificationChart = new Chart(verCtx, {
        type: "doughnut",
        data: {
          labels: [t("admin_analytics.verified_students", "Verified Students"), t("admin_analytics.unverified_students", "Unverified")],
          datasets: [{
            data: [verification.verified || 0, verification.unverified || 0],
            backgroundColor: ["#10b981", "#cbd5e1"]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } }
        }
      });
    }

    // Leaderboard Table
    const tbody = document.getElementById("org-leaderboard-body");
    const countLabel = document.getElementById("org-count-label");
    if (countLabel) countLabel.textContent = `${leaderboard.length} ${t("admin_analytics.orgs_count", "top organization(s)")}`;

    if (tbody) {
      if (!leaderboard.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-[#94a3b8]">${t("admin_analytics.no_orgs", "No organizations registered yet.")}</td></tr>`;
      } else {
        tbody.innerHTML = leaderboard.map((org, index) => `
          <tr class="border-b border-[#ecedfa] hover:bg-[#f8f9fc]">
            <td class="py-3.5 px-6">
              <div class="flex items-center gap-3">
                <span class="w-6 h-6 rounded-full bg-[#dae1ff] text-primary text-xs font-bold flex items-center justify-center">${index + 1}</span>
                <span class="font-semibold text-[#191b22]">${org.name}</span>
              </div>
            </td>
            <td class="py-3.5 px-4 text-[#64748b]">${org.owner}</td>
            <td class="py-3.5 px-4 text-center font-medium">${org.eventCount}</td>
            <td class="py-3.5 px-4 text-center font-bold text-primary">${org.totalRegistrations}</td>
            <td class="py-3.5 px-6 text-right font-bold text-amber-500">${org.avgRating || '—'} ★</td>
          </tr>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Load Admin Analytics error:", err);
  }
}

window.addEventListener("language-changed", () => {
  applyTranslation();
  loadAnalytics();
});
