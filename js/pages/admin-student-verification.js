import "../../src/style.css";
import { isAuthenticated, getUser } from "../lib/session.js";
import { loadNavbar } from "../components/navbar.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent, formatDate } from "../lib/utils.js";
import { getVerifications, getVerificationById, approveVerification, rejectVerification, batchApproveVerifications, batchRejectVerifications } from "../api/studentVerification.js";
import { populateUniversitySelect } from "../api/universities.js";
import { t, applyTranslation } from "../lib/i18n.js";
import { showToast as globalShowToast } from "../components/toast.js";

let currentTab = "all";
let currentPage = 1;
let totalPages = 1;
let totalItems = 0;
let actionTarget = null;
let searchTimer = null;
let isLoading = false;
let selectedItems = new Set();
let batchMode = false;

/* =========================
   POPUP HELPERS
   ========================= */

function openPopup(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closePopup(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("active");
  document.body.style.overflow = "";
}

/* =========================
   INIT
   ========================= */

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
  initPagination();
  initPopups();
  initBatchActions();
  await loadSchools();
  await loadData();

  window.addEventListener("language-changed", () => {
    applyTranslation();
    renderStats();
    loadData();
  });
});

async function loadSchools() {
  try {
    await populateUniversitySelect("school-filter");
  } catch (e) {
    console.error("Failed to populate school filter:", e);
  }
}

/* =========================
   DATA LOADING
   ========================= */

async function loadData() {
  if (isLoading) return;
  isLoading = true;
  showTableLoading();

  try {
    const params = { page: currentPage, pageSize: 10 };
    if (currentTab !== "all") params.status = currentTab;
    const sd = document.getElementById("search-input")?.value.trim();
    if (sd) params.search = sd;
    const school = document.getElementById("school-filter")?.value;
    if (school) params.school = school;

    const data = await getVerifications(params);
    renderTable(data.data || []);
    renderPagination(data.pagination);
    renderStats();
  } catch (err) {
    console.error("Load data error:", err);
    showEmpty();
    showToast(t("admin_student_verify.no_requests", "Failed to load data"), "error");
  } finally {
    isLoading = false;
    hideTableLoading();
  }
}

function showTableLoading() {
  const tbody = document.getElementById("table-body");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-16 text-center text-[#94a3b8]">
          <div class="flex flex-col items-center justify-center">
            <div class="spinner"></div>
            <p class="text-base font-semibold mt-4">${t("admin_student_verify.loading", "Loading verification requests...")}</p>
          </div>
        </td>
      </tr>
    `;
  }
}

function hideTableLoading() {
  // Overwritten by renderTable or showEmpty
}

async function renderStats() {
  try {
    const [all, pending, approved, rejected] = await Promise.all([
      getVerifications({ page: 1, pageSize: 1 }).catch(() => ({ pagination: { totalItems: 0 } })),
      getVerifications({ status: "pending", page: 1, pageSize: 1 }).catch(() => ({ pagination: { totalItems: 0 } })),
      getVerifications({ status: "approved", page: 1, pageSize: 1 }).catch(() => ({ pagination: { totalItems: 0 } })),
      getVerifications({ status: "rejected", page: 1, pageSize: 1 }).catch(() => ({ pagination: { totalItems: 0 } })),
    ]);
    document.getElementById("stat-total").textContent = all.pagination?.totalItems ?? 0;
    document.getElementById("stat-pending").textContent = pending.pagination?.totalItems ?? 0;
    document.getElementById("stat-approved").textContent = approved.pagination?.totalItems ?? 0;
    document.getElementById("stat-rejected").textContent = rejected.pagination?.totalItems ?? 0;
  } catch {}
}

/* =========================
   TABLE RENDERING
   ========================= */

function renderTable(verifications) {
  const tbody = document.getElementById("table-body");
  const count = document.getElementById("table-count");

  if (!verifications.length) {
    showEmpty();
    return;
  }

  count.textContent = t("admin_student_verify.requests_count", { n: totalItems || verifications.length });

  tbody.innerHTML = verifications.map(v => `
    <tr class="border-b border-[#e2e8f0] hover:bg-blue-50/40 transition-colors">
      <td class="py-3.5 px-4">
        ${currentTab === 'pending' ? `<input type="checkbox" class="item-checkbox w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary" data-id="${v._id}">` : ''}
        <span class="font-semibold text-[#191b22] text-sm ml-2">${v.studentId}</span>
      </td>
      <td class="py-3.5 px-4 hidden md:table-cell">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 shadow-sm">
            ${(v.submittedBy?.fullname || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <p class="font-medium text-[#191b22] text-sm">${v.submittedBy?.fullname || 'Unknown'}</p>
            <p class="text-[#94a3b8] text-xs">${v.submittedBy?.email || ''}</p>
          </div>
        </div>
      </td>
      <td class="py-3.5 px-4 hidden lg:table-cell text-[#64748b] text-sm">${v.submittedBy?.school || '—'}</td>
      <td class="py-3.5 px-4 hidden sm:table-cell text-[#64748b] text-xs whitespace-nowrap">${formatDate(v.createdAt)}</td>
      <td class="py-3.5 px-4">${statusBadge(v.status)}</td>
      <td class="py-3.5 px-4 text-right">${actionButtons(v)}</td>
    </tr>
  `).join("");

  // Bind checkbox events
  tbody.querySelectorAll(".item-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) {
        selectedItems.add(id);
      } else {
        selectedItems.delete(id);
      }
      updateBatchActions();
    });
  });

  tbody.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => openDetail(btn.dataset.id));
  });
  tbody.querySelectorAll(".approve-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      actionTarget = btn.dataset.id;
      document.getElementById("approve-name").textContent = btn.dataset.name;
      document.getElementById("approve-sid").textContent = btn.dataset.sid;
      openPopup("approve-overlay");
    });
  });
  tbody.querySelectorAll(".reject-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      actionTarget = btn.dataset.id;
      document.getElementById("reject-name").textContent = btn.dataset.name;
      openPopup("reject-overlay");
    });
  });
}

function statusBadge(status) {
  const map = {
    pending: `<span class="badge badge-pending"><i class="fa-regular fa-clock mr-1"></i>${t("admin_student_verify.status_pending", "Pending")}</span>`,
    approved: `<span class="badge badge-approved"><i class="fa-solid fa-check mr-1"></i>${t("admin_student_verify.status_approved", "Approved")}</span>`,
    rejected: `<span class="badge badge-rejected"><i class="fa-solid fa-ban mr-1"></i>${t("admin_student_verify.status_rejected", "Rejected")}</span>`,
  };
  return map[status] || status;
}

function actionButtons(v) {
  if (v.status !== "pending") {
    return `<button class="view-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#e2e8f0] bg-white text-[#64748b] text-xs font-semibold hover:bg-[#f1f5f9] hover:border-[#cbd5e1] spring-ease active:scale-95" data-id="${v._id}">
      <i class="fa-regular fa-eye text-sm"></i> ${t("admin_student_verify.btn_view", "View")}
    </button>`;
  }
  return `
    <div class="flex items-center justify-end gap-1.5">
      <button class="view-btn w-9 h-9 rounded-lg border border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f1f5f9] hover:border-[#cbd5e1] spring-ease active:scale-95 flex items-center justify-center" data-id="${v._id}" title="${t("admin_student_verify.btn_view", "View Details")}">
        <i class="fa-regular fa-eye text-sm"></i>
      </button>
      <button class="approve-btn relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border-none bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 spring-ease active:scale-95 shadow-sm" data-id="${v._id}" data-name="${v.submittedBy?.fullname || ''}" data-sid="${v.studentId}">
        <i class="fa-solid fa-check"></i> ${t("admin_student_verify.btn_approve", "Approve")}
      </button>
      <button class="reject-btn relative inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border-none bg-red-400 text-white text-xs font-semibold hover:bg-red-500 spring-ease active:scale-95 shadow-sm" data-id="${v._id}" data-name="${v.submittedBy?.fullname || ''}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `;
}

/* =========================
   PAGINATION
   ========================= */

function renderPagination(pagination) {
  const el = document.getElementById("pagination");
  if (!pagination || pagination.totalPages <= 1) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  currentPage = pagination.page;
  totalPages = pagination.totalPages;
  totalItems = pagination.totalItems;
  document.getElementById("pagination-info").textContent =
    t("admin_student_verify.page_info", { page: pagination.page, total: pagination.totalPages, count: pagination.totalItems });
  document.getElementById("prev-page").disabled = currentPage <= 1;
  document.getElementById("next-page").disabled = currentPage >= totalPages;
}

function initPagination() {
  document.getElementById("prev-page")?.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; loadData(); window.scrollTo({ top: 200, behavior: "smooth" }); }
  });
  document.getElementById("next-page")?.addEventListener("click", () => {
    if (currentPage < totalPages) { currentPage++; loadData(); window.scrollTo({ top: 200, behavior: "smooth" }); }
  });
}

function showEmpty() {
  const tbody = document.getElementById("table-body");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-16 text-center text-[#94a3b8]">
          <div class="flex flex-col items-center justify-center">
            <i class="fa-solid fa-inbox text-4xl mb-3 block"></i>
            <p class="text-base font-semibold">${t("admin_student_verify.no_requests", "No verification requests found")}</p>
          </div>
        </td>
      </tr>
    `;
  }
  document.getElementById("table-count").textContent = t("admin_student_verify.requests_count", { n: 0 });
}

/* =========================
   TABS
   ========================= */

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      currentPage = 1;
      selectedItems.clear();
      updateBatchActions();
      loadData();
    });
  });
}

function initBatchActions() {
  const batchActions = document.getElementById("batch-actions");
  const selectAll = document.getElementById("select-all");
  const selectedCount = document.getElementById("selected-count");
  const batchApprove = document.getElementById("batch-approve");
  const batchReject = document.getElementById("batch-reject");
  const batchCancel = document.getElementById("batch-cancel");

  // Toggle batch mode
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && batchMode) {
      batchMode = false;
      selectedItems.clear();
      updateBatchActions();
    }
  });

  // Select all checkbox
  selectAll?.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll(".item-checkbox").forEach(checkbox => {
      checkbox.checked = isChecked;
      if (isChecked) selectedItems.add(checkbox.dataset.id);
      else selectedItems.delete(checkbox.dataset.id);
    });
    updateBatchActions();
  });

  // Enable batch mode when clicking on a checkbox
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("item-checkbox")) {
      batchMode = true;
      updateBatchActions();
    }
  });

  // Batch approve
  batchApprove?.addEventListener("click", async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(t("admin_student_verify.batch_approve_confirm", { n: selectedItems.size }))) return;

    batchApprove.disabled = true;
    const origHtml = batchApprove.innerHTML;
    batchApprove.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Processing...';

    try {
      const count = selectedItems.size;
      await batchApproveVerifications(Array.from(selectedItems));
      selectedItems.clear();
      updateBatchActions();
      await loadData();
      showToast(t("admin_student_verify.batch_approved_success", { n: count }), "success");
    } catch (err) {
      showToast(err.message || "Failed to batch approve", "error");
    } finally {
      batchApprove.disabled = false;
      batchApprove.innerHTML = origHtml;
    }
  });

  // Batch reject
  batchReject?.addEventListener("click", async () => {
    if (selectedItems.size === 0) return;
    const note = prompt(t("admin_student_verify.reject_reason_prompt", { n: selectedItems.size }));
    if (note === null) return;

    batchReject.disabled = true;
    const origHtml = batchReject.innerHTML;
    batchReject.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Processing...';

    try {
      const count = selectedItems.size;
      await batchRejectVerifications(Array.from(selectedItems), note);
      selectedItems.clear();
      updateBatchActions();
      await loadData();
      showToast(t("admin_student_verify.batch_rejected_success", { n: count }), "success");
    } catch (err) {
      showToast(err.message || "Failed to batch reject", "error");
    } finally {
      batchReject.disabled = false;
      batchReject.innerHTML = origHtml;
    }
  });

  // Cancel batch mode
  batchCancel?.addEventListener("click", () => {
    batchMode = false;
    selectedItems.clear();
    updateBatchActions();
  });

  // Update batch actions UI
  function updateBatchActions() {
    const batchActions = document.getElementById("batch-actions");
    const selectedCount = document.getElementById("selected-count");
    const selectAll = document.getElementById("select-all");

    const count = selectedItems.size;
    selectedCount.textContent = t("admin_student_verify.n_selected", { n: count });
    batchActions.classList.toggle("hidden", !batchMode || count === 0);

    if (selectAll) {
      selectAll.checked = count > 0 && document.querySelectorAll(".item-checkbox").length === count;
    }
  }
}

/* =========================
   SEARCH
   ========================= */

function initSearch() {
  const input = document.getElementById("search-input");
  const schoolFilter = document.getElementById("school-filter");
  if (!input) return;
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      loadData();
    }, 350);
  });
  schoolFilter?.addEventListener("change", () => {
    currentPage = 1;
    loadData();
  });
}

/* =========================
   REFRESH
   ========================= */

function initRefresh() {
  const btn = document.getElementById("refresh-btn");
  btn?.addEventListener("click", () => {
    btn.classList.add("animate-spin");
    setTimeout(() => btn.classList.remove("animate-spin"), 600);
    currentPage = 1;
    loadData();
  });
}

/* =========================
   TOAST NOTIFICATIONS
   ========================= */

function showToast(message, type = "info") {
  return globalShowToast(message, type);
}

/* =========================
   POPUPS
   ========================= */

function initPopups() {
  // --- Detail popup ---
  const detailOverlay = document.getElementById("detail-overlay");
  document.getElementById("detail-close")?.addEventListener("click", () => closePopup("detail-overlay"));
  document.getElementById("detail-backdrop")?.addEventListener("click", () => closePopup("detail-overlay"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePopup("detail-overlay");
      closePopup("approve-overlay");
      closePopup("reject-overlay");
    }
  });

  // --- Approve popup ---
  document.getElementById("approve-cancel")?.addEventListener("click", () => { closePopup("approve-overlay"); actionTarget = null; });
  document.getElementById("approve-backdrop")?.addEventListener("click", () => { closePopup("approve-overlay"); actionTarget = null; });
  document.getElementById("approve-confirm")?.addEventListener("click", async () => {
    if (!actionTarget) return;
    const btn = document.getElementById("approve-confirm");
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Processing...';
    try {
      await approveVerification(actionTarget);
      closePopup("approve-overlay");
      actionTarget = null;
      await loadData();
      showToast(t("admin_student_verify.approved_success", "Verification approved successfully"), "success");
    } catch (err) {
      showToast(err.message || "Failed to approve", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  });

  // --- Reject popup ---
  document.getElementById("reject-cancel")?.addEventListener("click", () => { closePopup("reject-overlay"); actionTarget = null; });
  document.getElementById("reject-backdrop")?.addEventListener("click", () => { closePopup("reject-overlay"); actionTarget = null; });
  document.getElementById("reject-confirm")?.addEventListener("click", async () => {
    if (!actionTarget) return;
    const note = document.getElementById("reject-note").value.trim();
    const btn = document.getElementById("reject-confirm");
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Processing...';
    try {
      await rejectVerification(actionTarget, note);
      closePopup("reject-overlay");
      actionTarget = null;
      document.getElementById("reject-note").value = "";
      await loadData();
      showToast(t("admin_student_verify.rejected_success", "Verification rejected"), "success");
    } catch (err) {
      showToast(err.message || "Failed to reject", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  });
}

/* =========================
   DETAIL VIEW
   ========================= */

async function openDetail(id) {
  const overlay = document.getElementById("detail-overlay");
  const body = document.getElementById("detail-body");
  body.innerHTML = '<div class="flex items-center justify-center py-20 text-[#94a3b8]"><div class="spinner"></div></div>';
  openPopup("detail-overlay");

  try {
    const data = await getVerificationById(id);
    const v = data.verification;
    const user = v.submittedBy || {};
    const cardSideHtml = (src, caption) => {
      const displayCaption = caption === 'Front Side' ? t("admin_student_verify.modal_front", "Front Side")
        : caption === 'Back Side' ? t("admin_student_verify.modal_back", "Back Side")
        : caption;
      if (!src) {
        return `
          <div class="p-6 text-center text-[#94a3b8] bg-[#f8fafc] rounded-xl border border-[#e2e8f0]">
            <i class="fa-solid fa-image-slash text-xl mb-1 block"></i>
            <p class="text-xs font-semibold">${caption === 'Front Side' ? t("admin_student_verify.no_front_img", "No Front Side Image") : caption === 'Back Side' ? t("admin_student_verify.no_back_img", "No Back Side Image") : t("admin_student_verify.no_card_img", "No Student Card Image")}</p>
          </div>
        `;
      }
      return `
        <div class="space-y-1">
          <p class="text-[10px] font-bold text-[#64748b] uppercase tracking-wider flex items-center justify-between">
            <span>${displayCaption}</span>
            <span class="text-[10px] text-[#3b82f6] hover:underline cursor-pointer" onclick="window.open('${src}', '_blank')"><i class="fa-solid fa-expand mr-1"></i>${t("admin_student_verify.view_full", "View full")}</span>
          </p>
          <div class="bg-[#f8fafc] rounded-xl border border-[#e2e8f0] overflow-hidden group cursor-pointer" onclick="window.open('${src}', '_blank')">
            <img src="${src}" alt="${displayCaption}" class="w-full rounded-xl object-cover max-h-48 group-hover:scale-105 transition-transform duration-200" onerror="this.parentElement.innerHTML='<div class=\\'p-6 text-center text-[#94a3b8]\\'><i class=\\'fa-solid fa-image-slash text-xl mb-1 block\\'></i><p class=\\'text-xs\\'>${t("admin_student_verify.img_unavailable", "Image unavailable")}</p></div>'"/>
          </div>
        </div>
      `;
    };

    const cardImg = (v.studentCardFront || v.studentCardBack)
      ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${cardSideHtml(v.studentCardFront, 'Front Side')}${cardSideHtml(v.studentCardBack, 'Back Side')}</div>`
      : cardSideHtml(v.studentCardImage, 'Student Card');

    // Build info rows with col-span metadata
    const infoFields = [
      { label: t("admin_student_verify.col_name", "Full Name"), value: user.fullname || 'Unknown', icon: 'fa-user', fullWidth: false },
      { label: 'Email', value: user.email || '—', icon: 'fa-envelope', fullWidth: false },
      { label: t("admin_student_verify.col_school", "School"), value: user.school || '—', icon: 'fa-building-columns', fullWidth: true },
      { label: 'Class / Major', value: `${user.class || '—'} ${user.major ? '/ ' + user.major : ''}`, icon: 'fa-graduation-cap', fullWidth: false },
      { label: t("admin_student_verify.col_submitted", "Submitted Date"), value: formatDate(v.createdAt), icon: 'fa-calendar', fullWidth: false },
    ];
    if (v.reviewedBy?.fullname) {
      infoFields.push({ label: t("admin_student_verify.reviewed_by", "Reviewed By"), value: v.reviewedBy.fullname, icon: 'fa-user-check', fullWidth: true });
    }

    body.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <!-- Info column -->
        <div class="lg:col-span-3 space-y-4">
          <div class="flex items-center gap-3.5 pb-4 border-b border-[#e2e8f0]">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1755ba] to-blue-400 flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0">
              ${(user.fullname || '?').charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="font-bold text-xl text-[#191b22] truncate">${user.fullname || 'Student Verification'}</h3>
              <div class="flex flex-wrap items-center gap-2 mt-1">
                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <i class="fa-solid fa-id-card mr-1"></i>${v.studentId || 'N/A'}
                </span>
                ${statusBadge(v.status)}
              </div>
            </div>
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${infoFields.map(f => `
              <div class="bg-[#f8fafc] rounded-xl px-4 py-3 border border-[#e2e8f0] ${f.fullWidth ? 'sm:col-span-2' : ''}">
                <p class="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <i class="fa-regular ${f.icon} text-blue-500"></i>${f.label}
                </p>
                <p class="text-sm font-semibold text-[#191b22] break-words leading-relaxed">${f.value}</p>
              </div>
            `).join('')}
          </div>

          ${v.reviewNote ? `
            <div class="bg-red-50/80 rounded-xl px-4 py-3 border border-red-200 mt-2">
              <p class="text-[11px] font-bold text-red-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <i class="fa-solid fa-pen"></i>${t("admin_student_verify.review_note", "Review Note")}
              </p>
              <p class="text-sm text-red-700 font-medium">${v.reviewNote}</p>
            </div>
          ` : ''}
        </div>

        <!-- Card images column -->
        <div class="lg:col-span-2 border-t lg:border-t-0 lg:border-l border-[#e2e8f0] pt-4 lg:pt-0 lg:pl-6">
          <p class="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <i class="fa-regular fa-id-card text-blue-500"></i> ${t("admin_student_verify.card_photos", "Student Card Photos")}
          </p>
          <div class="space-y-4">
            ${cardImg}
          </div>
        </div>
      </div>

      ${v.status === 'pending' ? `
        <div class="flex gap-3 mt-6 pt-5 border-t border-[#e2e8f0] bg-gradient-to-r from-transparent via-blue-50/30 to-transparent -mx-6 -mb-6 px-6 pb-6">
          <button class="btn btn-success flex-1 py-3 text-sm font-bold shadow-sm" id="detail-approve-btn" data-id="${v._id}" data-name="${user.fullname || ''}" data-sid="${v.studentId}">
            <i class="fa-solid fa-check mr-1.5"></i> ${t("admin_student_verify.btn_approve", "Approve")}
          </button>
          <button class="btn btn-danger flex-1 py-3 text-sm font-bold shadow-sm" id="detail-reject-btn" data-id="${v._id}" data-name="${user.fullname || ''}">
            <i class="fa-solid fa-xmark mr-1.5"></i> ${t("admin_student_verify.btn_reject", "Reject")}
          </button>
        </div>
      ` : ''}
    `;

    document.getElementById("detail-approve-btn")?.addEventListener("click", () => {
      const btn = document.getElementById("detail-approve-btn");
      closePopup("detail-overlay");
      actionTarget = btn.dataset.id;
      document.getElementById("approve-name").textContent = btn.dataset.name;
      document.getElementById("approve-sid").textContent = btn.dataset.sid;
      openPopup("approve-overlay");
    });
    document.getElementById("detail-reject-btn")?.addEventListener("click", () => {
      const btn = document.getElementById("detail-reject-btn");
      closePopup("detail-overlay");
      actionTarget = btn.dataset.id;
      document.getElementById("reject-name").textContent = btn.dataset.name;
      openPopup("reject-overlay");
    });
  } catch (err) {
    body.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-red-500 gap-3"><i class="fa-solid fa-circle-exclamation text-4xl"></i><p class="text-sm font-medium">Failed to load details</p><p class="text-xs text-red-400">${err.message}</p></div>`;
  }
}
