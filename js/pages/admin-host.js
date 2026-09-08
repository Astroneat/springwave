import "../../src/style.css";
import { isAuthenticated, getUser } from "../lib/session.js";
import { loadNavbar } from "../components/navbar.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent, formatDate, capitalize } from "../lib/utils.js";
import { t, applyTranslation } from "../lib/i18n.js";
import { getRegistrations, getRegistrationById, approveRegistration, rejectRegistration } from "../api/host.js";
import { toggleDisableOrganizationAdmin } from "../api/organizations.js";

let currentTab = "all";
let currentPage = 1;
let totalPages = 1;
let actionTarget = null;
let searchTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!isAuthenticated()) {
    window.location.href = "/login.html";
    return;
  }
  const user = getUser();
  if (user?.role !== "admin") {
    window.location.href = "/";
    return;
  }

  await loadNavbar({ activeSection: "admin" });
  await fetchContent("./components/footer.html").then(html => {
    const c = document.getElementById("footer-container");
    if (c) c.innerHTML = html;
  });
  await initChatbot();

  initTabs();
  initSearch();
  initRefresh();
  initPopups();
  await loadData();

  window.addEventListener("language-changed", () => {
    applyTranslation();
    loadData();
  });
});

async function loadData() {
  try {
    const params = { page: currentPage, pageSize: 10 };
    if (currentTab !== "all") params.status = currentTab;
    const sd = document.getElementById("search-input")?.value.trim();
    if (sd) params.search = sd;

    const data = await getRegistrations(params);
    renderTable(data.data || []);
    renderPagination(data.pagination);
    renderStats(data.data || []);
  } catch (err) {
    console.error("Load data error:", err);
    showEmpty();
  }
}

function renderStats(items) {
  // We need counts per status — fetch all if partial
  Promise.all([
    getRegistrations({ page: 1, pageSize: 1 }).catch(() => ({ pagination: { totalItems: 0 } })),
    getRegistrations({ status: "pending", page: 1, pageSize: 1 }).catch(() => ({ pagination: { totalItems: 0 } })),
    getRegistrations({ status: "approved", page: 1, pageSize: 1 }).catch(() => ({ pagination: { totalItems: 0 } })),
    getRegistrations({ status: "rejected", page: 1, pageSize: 1 }).catch(() => ({ pagination: { totalItems: 0 } })),
  ]).then(([all, pending, approved, rejected]) => {
    document.getElementById("stat-total").textContent = all.pagination?.totalItems ?? 0;
    document.getElementById("stat-pending").textContent = pending.pagination?.totalItems ?? 0;
    document.getElementById("stat-approved").textContent = approved.pagination?.totalItems ?? 0;
    document.getElementById("stat-rejected").textContent = rejected.pagination?.totalItems ?? 0;
  });
}

function renderTable(registrations) {
  const tbody = document.getElementById("table-body");
  const empty = document.getElementById("table-empty");
  const count = document.getElementById("table-count");

  if (!registrations.length) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    count.textContent = t("admin_host.registrations_count", { n: 0 });
    return;
  }

  empty.classList.add("hidden");
  count.textContent = t("admin_host.registrations_count", { n: registrations.length });

  tbody.innerHTML = registrations.map(reg => {
    const isOrgDisabled = reg.organization && (reg.organization.isActive === false || reg.organization.status === 'disabled');

    const statusBadge = isOrgDisabled ? `<span class="badge-rejected">${t("admin_host.disabled", "Disabled")}</span>`
      : reg.status === "pending" ? `<span class="badge-pending">${t("admin_host.tab_pending", "Pending")}</span>`
      : reg.status === "approved" ? `<span class="badge-approved">${t("admin_host.tab_approved", "Approved")}</span>`
      : `<span class="badge-rejected">${t("admin_host.tab_rejected", "Rejected")}</span>`;

    const actions = reg.status === "pending" ? `
      <button class="approve-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#059669] hover:bg-green-50 hover:border-green-200 transition-all spring-ease" title="${t("admin_host.btn_approve", "Approve")}">
        <i class="fa-solid fa-check text-sm"></i>
      </button>
      <button class="reject-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#ef4444] hover:bg-red-50 hover:border-red-200 transition-all spring-ease" title="${t("admin_host.btn_reject", "Reject")}">
        <i class="fa-solid fa-ban text-sm"></i>
      </button>
    ` : reg.organization ? `
      <button class="toggle-disable-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center ${isOrgDisabled ? 'text-[#059669] hover:bg-green-50 hover:border-green-200' : 'text-[#d97706] hover:bg-amber-50 hover:border-amber-200'} transition-all spring-ease" title="${isOrgDisabled ? t("admin_host.action_enable", "Reactivate organization") : t("admin_host.action_disable", "Disable organization")}" data-org-id="${reg.organization._id}" data-disable="${!isOrgDisabled}">
        <i class="fa-solid fa-power-off text-sm"></i>
      </button>
    ` : `<span class="text-xs text-[#94a3b8]">—</span>`;

    const submittedBy = reg.submittedBy || {};
    const submittedDate = formatDate(reg.createdAt);
    const universityName = reg.university?.shortName
      ? `${reg.university.name} (${reg.university.shortName})`
      : (reg.university?.name || null);
    const universityTag = universityName
      ? `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-md mt-1 max-w-[220px] truncate"><i class="fa-solid fa-graduation-cap text-[10px] shrink-0"></i> <span class="truncate">${universityName}</span></span>`
      : `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md mt-1"><i class="fa-solid fa-globe text-[10px] shrink-0"></i> ${t("admin_host.independent", "Independent")}</span>`;

    return `
      <tr class="border-b border-[#ecedfa] hover:bg-[#f8f9fc] transition-colors cursor-pointer" data-id="${reg._id}">
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-[#dae1ff] flex items-center justify-center text-primary shrink-0">
              <i class="fa-regular fa-building"></i>
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-[#191b22] truncate max-w-[200px]">${reg.orgName}</p>
              <p class="text-[12px] text-[#64748b] mt-0.5">${submittedBy.fullname || "—"}</p>
              <div>${universityTag}</div>
            </div>
          </div>
        </td>
        <td class="py-3.5 px-4 text-[#64748b] hidden md:table-cell">${reg.representativeName}</td>
        <td class="py-3.5 px-4 text-[#64748b] hidden lg:table-cell">${reg.phoneNo}</td>
        <td class="py-3.5 px-4 text-[#64748b] hidden sm:table-cell text-[13px]">${submittedDate}</td>
        <td class="py-3.5 px-4">${statusBadge}</td>
        <td class="py-3.5 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">${actions}</div>
        </td>
      </tr>
    `;
  }).join("");

  // Row click → detail
  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      openDetail(tr.dataset.id);
    });
  });

  // Action buttons
  tbody.querySelectorAll(".approve-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.closest("tr").dataset.id;
      const name = btn.closest("tr").querySelector("td:first-child .font-semibold")?.textContent || "this organization";
      openApprove(id, name);
    });
  });

  tbody.querySelectorAll(".reject-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.closest("tr").dataset.id;
      const name = btn.closest("tr").querySelector("td:first-child .font-semibold")?.textContent || "this organization";
      openReject(id, name);
    });
  });

  tbody.querySelectorAll(".toggle-disable-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const orgId = btn.dataset.orgId;
      const shouldDisable = btn.dataset.disable === "true";
      const orgName = btn.closest("tr").querySelector("td:first-child .font-semibold")?.textContent || "this organization";
      const actionText = shouldDisable ? t("admin_host.action_disable", "disable") : t("admin_host.action_enable", "reactivate");
      if (confirm(t("admin_host.confirm_toggle", { action: actionText, name: orgName }))) {
        try {
          btn.disabled = true;
          await toggleDisableOrganizationAdmin(orgId, shouldDisable);
          await loadData();
        } catch (err) {
          alert(t("admin_host.toggle_failed", { msg: err.message }));
        }
      }
    });
  });
}

function renderPagination(pagination) {
  const el = document.getElementById("pagination");
  if (!pagination || pagination.totalPages <= 1) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  currentPage = pagination.page;
  totalPages = pagination.totalPages;
  document.getElementById("pagination-info").textContent =
    t("admin_host.page_info", { page: pagination.page, total: pagination.totalPages, count: pagination.totalItems });
  document.getElementById("prev-page").disabled = pagination.page <= 1;
  document.getElementById("next-page").disabled = pagination.page >= pagination.totalPages;
}

function initPagination() {
  document.getElementById("prev-page").addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; loadData(); }
  });
  document.getElementById("next-page").addEventListener("click", () => {
    if (currentPage < totalPages) { currentPage++; loadData(); }
  });
}

function showEmpty() {
  document.getElementById("table-body").innerHTML = "";
  document.getElementById("table-empty").classList.remove("hidden");
  document.getElementById("table-count").textContent = t("admin_host.registrations_count", { n: 0 });
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      currentPage = 1;
      loadData();
    });
  });
}

function initSearch() {
  const input = document.getElementById("search-input");
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      loadData();
    }, 300);
  });
}

function initRefresh() {
  document.getElementById("refresh-btn").addEventListener("click", () => {
    document.getElementById("search-input").value = "";
    currentPage = 1;
    loadData();
  });
}

// ----- Detail Popup -----

async function openDetail(id) {
  const overlay = document.getElementById("detail-overlay");
  const body = document.getElementById("detail-body");
  overlay.removeAttribute("hidden");
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";
  body.innerHTML = `<div class="flex items-center justify-center py-16 text-[#94a3b8]"><div class="spinner"></div></div>`;

  try {
    const { registration } = await getRegistrationById(id);
    body.innerHTML = buildDetailHTML(registration);
  } catch {
    body.innerHTML = `<p class="text-center text-[#ef4444] py-10">Failed to load details</p>`;
  }
}

function buildDetailHTML(reg) {
  const user = reg.submittedBy || {};
  const reviewedBy = reg.reviewedBy || {};
  const cccdImage = reg.cccdImage
    ? `<img src="${reg.cccdImage}" class="max-w-[280px] rounded-xl border border-[#ecedfa]" />`
    : `<span class="text-[#94a3b8] text-sm">${t("admin_host.not_provided", "Not provided")}</span>`;

  const credibilityHTML = (reg.credibilityEvidence || []).map(ev =>
    ev.type === "image"
      ? `<a href="${ev.url}" target="_blank"><img src="${ev.url}" class="evidence-img" /></a>`
      : `<a href="${ev.url}" target="_blank" class="text-primary underline text-sm">${ev.url}</a>`
  ).join("") || `<span class="text-[#94a3b8] text-sm">${t("admin_host.none", "None")}</span>`;

  const thirdParty = reg.thirdPartyContact || {};

  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Organization Info -->
      <div class="md:col-span-2">
        <h3 class="text-sm font-semibold text-[#64748b] uppercase tracking-wide mb-3">${t("admin_host.org_info", "Organization Info")}</h3>
        <div class="bg-[#f8f9fc] rounded-2xl p-5 space-y-3">
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.org_name", "Name")}</span><span class="font-semibold text-right">${reg.orgName}</span></div>
          <div class="flex justify-between items-center"><span class="text-[#64748b]">${t("admin_host.university", "University")}</span><span class="font-semibold text-right ${reg.university ? 'text-primary' : 'text-slate-600'}">${reg.university ? (reg.university.shortName ? `${reg.university.name} (${reg.university.shortName})` : (reg.university.name || reg.university)) : t("admin_host.independent_full", "Independent / No University Affiliation")}</span></div>
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.rep_name", "Representative")}</span><span class="font-semibold text-right">${reg.representativeName}</span></div>
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.phone", "Phone")}</span><span class="font-semibold text-right">${reg.phoneNo}</span></div>
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.status", "Status")}</span><span class="text-right">${reg.status === "pending" ? `<span class="badge-pending">${t("admin_host.tab_pending", "Pending")}</span>` : reg.status === "approved" ? `<span class="badge-approved">${t("admin_host.tab_approved", "Approved")}</span>` : `<span class="badge-rejected">${t("admin_host.tab_rejected", "Rejected")}</span>`}</span></div>
          ${reg.reviewNote ? `<div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.review_note", "Review Note")}</span><span class="text-right text-[#dc2626]">${reg.reviewNote}</span></div>` : ""}
        </div>
      </div>

      <!-- CCCD -->
      <div>
        <h3 class="text-sm font-semibold text-[#64748b] uppercase tracking-wide mb-3">${t("admin_host.cccd_card", "CCCD / ID Card")}</h3>
        <div class="bg-[#f8f9fc] rounded-2xl p-5 space-y-3">
          <div>
            <p class="text-[13px] text-[#64748b] mb-2">${t("admin_host.image", "Image")}</p>
            ${cccdImage}
          </div>
          <div>
            <p class="text-[13px] text-[#64748b] mb-1">${t("admin_host.number", "Number")}</p>
            <p class="font-semibold font-mono">${reg.cccdNumber || t("admin_host.not_provided", "Not provided")}</p>
          </div>
        </div>
      </div>

      <!-- Third Party -->
      <div>
        <h3 class="text-sm font-semibold text-[#64748b] uppercase tracking-wide mb-3">${t("admin_host.third_party_ref", "Third Party Reference")}</h3>
        <div class="bg-[#f8f9fc] rounded-2xl p-5 space-y-3">
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.org_name", "Name")}</span><span class="font-semibold text-right">${thirdParty.name || "—"}</span></div>
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.phone", "Phone")}</span><span class="font-semibold text-right">${thirdParty.phoneNo || "—"}</span></div>
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.relation", "Relation")}</span><span class="font-semibold text-right">${thirdParty.relation || "—"}</span></div>
        </div>
      </div>

      <!-- Credibility Evidence -->
      <div class="md:col-span-2">
        <h3 class="text-sm font-semibold text-[#64748b] uppercase tracking-wide mb-3">${t("admin_host.credibility_evidence", "Credibility Evidence")}</h3>
        <div class="bg-[#f8f9fc] rounded-2xl p-5 flex flex-wrap gap-3">
          ${credibilityHTML}
        </div>
      </div>

      <!-- Submitter Info -->
      <div>
        <h3 class="text-sm font-semibold text-[#64748b] uppercase tracking-wide mb-3">${t("admin_host.submitted_by", "Submitted By")}</h3>
        <div class="bg-[#f8f9fc] rounded-2xl p-5 space-y-3">
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.org_name", "Name")}</span><span class="font-semibold text-right">${user.fullname || "—"}</span></div>
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.email", "Email")}</span><span class="font-semibold text-right">${user.email || "—"}</span></div>
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.username", "Username")}</span><span class="font-semibold text-right">${user.username || "—"}</span></div>
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.phone", "Phone")}</span><span class="font-semibold text-right">${user.phoneNo || "—"}</span></div>
          ${user.school ? `<div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.school", "School")}</span><span class="font-semibold text-right">${user.school}</span></div>` : ""}
          ${user.createdAt ? `<div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.joined", "Joined")}</span><span class="font-semibold text-right">${formatDate(user.createdAt)}</span></div>` : ""}
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.email_verified", "Email Verified")}</span><span class="font-semibold text-right">${user.emailVerified ? `<span class="text-[#059669]">${t("admin_host.yes", "Yes")}</span>` : `<span class="text-[#dc2626]">${t("admin_host.no", "No")}</span>`}</span></div>
        </div>
      </div>

      <!-- Review Info -->
      <div>
        <h3 class="text-sm font-semibold text-[#64748b] uppercase tracking-wide mb-3">${t("admin_host.review_info", "Review")}</h3>
        <div class="bg-[#f8f9fc] rounded-2xl p-5 space-y-3">
          <div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.submitted_date", "Submitted")}</span><span class="font-semibold text-right">${formatDate(reg.createdAt)}</span></div>
          ${reviewedBy.fullname ? `<div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.reviewed_by", "Reviewed By")}</span><span class="font-semibold text-right">${reviewedBy.fullname}</span></div>` : ""}
          ${reg.updatedAt ? `<div class="flex justify-between"><span class="text-[#64748b]">${t("admin_host.reviewed_date", "Last Updated")}</span><span class="font-semibold text-right">${formatDate(reg.updatedAt)}</span></div>` : ""}
        </div>
      </div>
    </div>
  `;
}

// ----- Approve / Reject Popups -----

function openApprove(id, name) {
  actionTarget = id;
  document.getElementById("approve-org-name").textContent = name;
  const overlay = document.getElementById("approve-overlay");
  overlay.removeAttribute("hidden");
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function openReject(id, name) {
  actionTarget = id;
  document.getElementById("reject-org-name").textContent = name;
  document.getElementById("reject-note").value = "";
  const overlay = document.getElementById("reject-overlay");
  overlay.removeAttribute("hidden");
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function initPopups() {
  // Detail popup
  const detailOverlay = document.getElementById("detail-overlay");
  document.getElementById("detail-close").addEventListener("click", closeDetail);
  document.getElementById("detail-backdrop").addEventListener("click", closeDetail);
  function closeDetail() {
    detailOverlay.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(() => detailOverlay.setAttribute("hidden", ""), 300);
  }

  // Approve
  initPopup("approve", async id => {
    await approveRegistration(id);
    closeDetail();
    loadData();
  });

  // Reject
  initPopup("reject", async id => {
    const note = document.getElementById("reject-note").value.trim();
    await rejectRegistration(id, note);
    closeDetail();
    loadData();
  });

  // Pagination
  initPagination();
}

function initPopup(name, onConfirm) {
  const overlay = document.getElementById(`${name}-overlay`);
  const backdrop = document.getElementById(`${name}-backdrop`);
  const cancel = document.getElementById(`${name}-cancel`);
  const confirm = document.getElementById(`${name}-confirm`);

  function close() {
    overlay.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(() => {
      overlay.setAttribute("hidden", "");
      actionTarget = null;
    }, 300);
  }

  backdrop?.addEventListener("click", close);
  cancel?.addEventListener("click", close);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !overlay.hasAttribute("hidden")) close();
  });
  confirm?.addEventListener("click", async () => {
    if (!actionTarget) return;
    try {
      await onConfirm(actionTarget);
      close();
    } catch (err) {
      alert(err.message || "Action failed");
      close();
    }
  });
}
