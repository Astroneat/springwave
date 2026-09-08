import "../../src/style.css";
import { isAuthenticated, getUser } from "../lib/session.js";
import { loadNavbar } from "../components/navbar.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent } from "../lib/utils.js";
import { t, applyTranslation } from "../lib/i18n.js";
import {
  getAllUniversitiesAdmin,
  createUniversity,
  updateUniversity,
  deleteUniversity,
  uploadUniversityLogo,
  getUniversityStudentsAdmin,
  deleteUniversityStudentAdmin
} from "../api/universities.js";

let universities = [];
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

    window.addEventListener("language-changed", () => {
        applyTranslation();
        renderTable();
    });

    initSearch();
    initRefresh();
    initForm();
    initDelete();
    initStudentsModal();
    initColorSync();
    initLogoUpload();
    await loadData();
});

async function loadData() {
    try {
        const searchVal = document.getElementById("search-input")?.value?.trim() || "";
        const data = await getAllUniversitiesAdmin(searchVal);
        universities = data.universities || [];
        renderTable();
    } catch (err) {
        console.error("Failed to load universities:", err);
        showEmpty();
    }
}

function renderTable() {
    const tbody = document.getElementById("table-body");
    const empty = document.getElementById("table-empty");
    const count = document.getElementById("table-count");

    if (!tbody || !empty || !count) return;

    if (universities.length === 0) {
        tbody.innerHTML = "";
        empty.classList.remove("hidden");
        count.textContent = t("admin_universities.universities_count", { n: 0 }) || "0 universities";
        return;
    }

    empty.classList.add("hidden");
    count.textContent = t("admin_universities.universities_count", { n: universities.length }) || `${universities.length} universities`;

    const q = document.getElementById("search-input").value.trim().toLowerCase();

    tbody.innerHTML = universities
        .filter(u => {
            if (!q) return true;
            const nameMatch = u.name.toLowerCase().includes(q);
            const engMatch = (u.englishName || "").toLowerCase().includes(q);
            const shortMatch = (u.shortName || "").toLowerCase().includes(q);
            const domainMatch = (u.domains || []).some(d => d.toLowerCase().includes(q));
            return nameMatch || engMatch || shortMatch || domainMatch;
        })
        .map(u => {
            const statusBadge = u.isActive !== false
                ? `<span class="inline-block text-xs font-semibold py-1 px-2.5 rounded-full bg-[#d1fae5] text-[#059669]">${t("admin_universities.active", "Active")}</span>`
                : `<span class="inline-block text-xs font-semibold py-1 px-2.5 rounded-full bg-[#fee2e2] text-[#dc2626]">${t("admin_universities.inactive", "Inactive")}</span>`;

            const domainTags = (u.domains || []).length > 0
                ? (u.domains || []).map(d => `<span class="domain-tag">${d}</span>`).join(' ')
                : `<span class="text-xs text-[#94a3b8] italic">${t("common.none", "None")}</span>`;

            const logoHtml = u.logo
                ? `<img src="${u.logo}" class="w-8 h-8 rounded-lg object-contain border border-[#e2e2eb]" alt="${u.shortName || u.name}" onerror="this.src='/vite.svg'" />`
                : `<div class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs" style="background:${u.color || '#3B6FD4'}">${(u.shortName || u.name || 'U').slice(0, 3).toUpperCase()}</div>`;

            return `
            <tr class="border-b border-[#ecedfa] hover:bg-[#f8f9fc] transition-colors" data-id="${u._id}">
                <td class="py-3.5 px-4">
                    ${logoHtml}
                </td>
                <td class="py-3.5 px-4">
                    <div class="font-semibold text-[#191b22] line-clamp-1">${u.name}</div>
                    ${u.description ? `<div class="text-xs text-[#64748b] line-clamp-1 mt-0.5">${u.description}</div>` : ''}
                </td>
                <td class="py-3.5 px-4 text-[#64748b] font-medium">
                    ${u.englishName || "—"}
                </td>
                <td class="py-3.5 px-4">
                    <span class="font-semibold text-primary">${u.shortName || "—"}</span>
                </td>
                <td class="py-3.5 px-4 hidden md:table-cell">
                    <div class="flex flex-wrap gap-1 max-w-[280px]">
                        ${domainTags}
                    </div>
                </td>
                <td class="py-3.5 px-4 hidden lg:table-cell">
                    <div class="flex items-center gap-2">
                        <span class="color-preview" style="background:${u.color || '#3B6FD4'}"></span>
                        <span class="text-[13px] text-[#64748b] font-mono">${u.color || "#3B6FD4"}</span>
                    </div>
                </td>
                <td class="py-3.5 px-4">${statusBadge}</td>
                <td class="py-3.5 px-4 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <button class="students-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-primary hover:bg-[#dae1ff] hover:border-primary/30 transition-all spring-ease" title="${t("admin_universities.view_students", "View Students")}">
                            <i class="fa-solid fa-graduation-cap text-sm"></i>
                        </button>
                        <button class="edit-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#64748b] hover:bg-[#dae1ff] hover:text-primary hover:border-primary/30 transition-all spring-ease" title="${t("admin_universities.edit", "Edit")}">
                            <i class="fa-regular fa-pen-to-square text-sm"></i>
                        </button>
                        <button class="delete-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#ef4444] hover:bg-red-50 hover:border-red-200 transition-all spring-ease" title="${t("admin_universities.delete", "Delete")}">
                            <i class="fa-solid fa-trash-can text-sm"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join("");

    initRowActions();
}

function initRowActions() {
    document.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            const uni = universities.find(u => String(u._id) === String(id));
            if (uni) openForm(uni);
        });
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            const uni = universities.find(u => String(u._id) === String(id));
            if (uni) openDelete(uni);
        });
    });

    document.querySelectorAll(".students-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            const uni = universities.find(u => String(u._id) === String(id));
            if (uni) openStudentsModal(uni);
        });
    });
}

function showEmpty() {
    document.getElementById("table-body").innerHTML = "";
    document.getElementById("table-empty").classList.remove("hidden");
    document.getElementById("table-count").textContent = t("admin_universities.universities_count", { n: 0 }) || "0 universities";
}

function initSearch() {
    const input = document.getElementById("search-input");
    if (!input) return;
    input.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderTable, 250);
    });
}

function initRefresh() {
    const btn = document.getElementById("refresh-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        document.getElementById("search-input").value = "";
        loadData();
    });
}

function initColorSync() {
    const colorPicker = document.getElementById("field-color");
    const colorText = document.getElementById("field-color-text");
    if (!colorPicker || !colorText) return;

    colorPicker.addEventListener("input", () => {
        colorText.value = colorPicker.value;
    });
    colorText.addEventListener("input", () => {
        if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(colorText.value)) {
            colorPicker.value = colorText.value;
        }
    });
}

function initLogoUpload() {
    const logoFileInput = document.getElementById("field-logo-file");
    const logoUrlInput = document.getElementById("field-logo-url");
    const imgPreview = document.getElementById("logo-preview-img");
    const fallbackIcon = document.getElementById("logo-fallback-icon");

    if (logoUrlInput) {
        logoUrlInput.addEventListener("input", () => {
            const val = logoUrlInput.value.trim();
            if (val) {
                imgPreview.src = val;
                imgPreview.classList.remove("hidden");
                fallbackIcon.classList.add("hidden");
            } else {
                imgPreview.classList.add("hidden");
                fallbackIcon.classList.remove("hidden");
            }
        });
    }

    if (logoFileInput) {
        logoFileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const { logoUrl } = await uploadUniversityLogo(file);
                if (logoUrlInput) logoUrlInput.value = logoUrl;
                if (imgPreview) {
                    imgPreview.src = logoUrl;
                    imgPreview.classList.remove("hidden");
                }
                if (fallbackIcon) fallbackIcon.classList.add("hidden");
            } catch (err) {
                alert((t("admin_universities.failed_upload") || "Failed to upload logo: ") + err.message);
            }
        });
    }
}

function closeForm() {
    const overlay = document.getElementById("form-overlay");
    if (!overlay) return;
    overlay.classList.remove("active");
    overlay.style.display = "none";
    document.body.style.overflow = "";
    setTimeout(() => {
        overlay.setAttribute("hidden", "");
        actionTarget = null;
    }, 300);
}

function openForm(uni) {
    actionTarget = uni;
    const overlay = document.getElementById("form-overlay");
    const title = document.getElementById("form-title");
    const imgPreview = document.getElementById("logo-preview-img");
    const fallbackIcon = document.getElementById("logo-fallback-icon");

    if (uni) {
        title.textContent = t("admin_universities.edit_title", "Edit University");
        document.getElementById("field-name").value = uni.name || "";
        document.getElementById("field-english-name").value = uni.englishName || "";
        document.getElementById("field-short-name").value = uni.shortName || "";
        document.getElementById("field-domains").value = (uni.domains || []).join(", ");
        document.getElementById("field-logo-url").value = uni.logo || "";
        document.getElementById("field-color").value = uni.color || "#3B6FD4";
        document.getElementById("field-color-text").value = uni.color || "#3B6FD4";
        document.getElementById("field-description").value = uni.description || "";
        document.getElementById("field-autoverify").checked = uni.autoVerify !== false;
        document.getElementById("field-active").checked = uni.isActive !== false;

        if (uni.logo) {
            imgPreview.src = uni.logo;
            imgPreview.classList.remove("hidden");
            fallbackIcon.classList.add("hidden");
        } else {
            imgPreview.classList.add("hidden");
            fallbackIcon.classList.remove("hidden");
        }
    } else {
        title.textContent = t("admin_universities.add_title", "Add University");
        document.getElementById("field-name").value = "";
        document.getElementById("field-english-name").value = "";
        document.getElementById("field-short-name").value = "";
        document.getElementById("field-domains").value = "";
        document.getElementById("field-logo-url").value = "";
        document.getElementById("field-color").value = "#3B6FD4";
        document.getElementById("field-color-text").value = "#3B6FD4";
        document.getElementById("field-description").value = "";
        document.getElementById("field-autoverify").checked = true;
        document.getElementById("field-active").checked = true;

        imgPreview.classList.add("hidden");
        fallbackIcon.classList.remove("hidden");
    }

    overlay.style.display = "flex";
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

function initForm() {
    const overlay = document.getElementById("form-overlay");
    const backdrop = document.getElementById("form-backdrop");
    const closeBtn = document.getElementById("form-close");
    const cancelBtn = document.getElementById("form-cancel");
    const saveBtn = document.getElementById("form-save");
    const addBtn = document.getElementById("add-university-btn");

    if (addBtn) {
        addBtn.addEventListener("click", () => openForm(null));
    }

    if (closeBtn) closeBtn.addEventListener("click", closeForm);
    if (cancelBtn) cancelBtn.addEventListener("click", closeForm);
    if (backdrop) backdrop.addEventListener("click", closeForm);

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && overlay && !overlay.hasAttribute("hidden")) closeForm();
    });

    if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
            const name = document.getElementById("field-name").value.trim();
            const englishName = document.getElementById("field-english-name").value.trim();
            const shortName = document.getElementById("field-short-name").value.trim();
            const domainsRaw = document.getElementById("field-domains").value.trim();
            const logo = document.getElementById("field-logo-url").value.trim();
            const color = document.getElementById("field-color-text").value.trim();
            const description = document.getElementById("field-description").value.trim();
            const autoVerify = document.getElementById("field-autoverify").checked;
            const isActive = document.getElementById("field-active").checked;

            if (!name) {
                alert(t("admin_universities.enter_name_alert", "Please enter the full university name."));
                return;
            }
            if (!shortName) {
                alert(t("admin_universities.enter_short_alert", "Please enter the short name / abbreviation."));
                return;
            }

            const payload = {
                name,
                englishName,
                shortName,
                domains: domainsRaw,
                logo,
                color: color || "#3B6FD4",
                description,
                autoVerify,
                isActive
            };

            saveBtn.disabled = true;
            saveBtn.textContent = t("admin_universities.saving", "Saving...");

            try {
                if (actionTarget) {
                    await updateUniversity(actionTarget._id, payload);
                } else {
                    await createUniversity(payload);
                }
                closeForm();
                await loadData();
            } catch (err) {
                alert(err.message || t("admin_universities.failed_save", "Failed to save university"));
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = t("admin_universities.save", "Save");
            }
        });
    }
}

function closeDelete() {
    const overlay = document.getElementById("delete-overlay");
    if (!overlay) return;
    overlay.classList.remove("active");
    overlay.style.display = "none";
    document.body.style.overflow = "";
    setTimeout(() => {
        overlay.setAttribute("hidden", "");
        actionTarget = null;
    }, 300);
}

function openDelete(uni) {
    actionTarget = uni;
    const overlay = document.getElementById("delete-overlay");
    const nameEl = document.getElementById("delete-uni-name");
    if (nameEl) nameEl.textContent = uni.shortName ? `${uni.name} (${uni.shortName})` : uni.name;

    overlay.style.display = "flex";
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

function initDelete() {
    const overlay = document.getElementById("delete-overlay");
    const backdrop = document.getElementById("delete-backdrop");
    const cancelBtn = document.getElementById("delete-cancel");
    const confirmBtn = document.getElementById("delete-confirm");

    if (cancelBtn) cancelBtn.addEventListener("click", closeDelete);
    if (backdrop) backdrop.addEventListener("click", closeDelete);

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && overlay && !overlay.hasAttribute("hidden")) closeDelete();
    });

    if (confirmBtn) {
        confirmBtn.addEventListener("click", async () => {
            if (!actionTarget) return;

            confirmBtn.disabled = true;
            confirmBtn.textContent = t("admin_universities.deleting", "Deleting...");

            try {
                await deleteUniversity(actionTarget._id);
                closeDelete();
                await loadData();
            } catch (err) {
                alert(err.message || t("admin_universities.failed_delete", "Failed to delete university"));
                closeDelete();
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = t("admin_universities.delete", "Delete");
            }
        });
    }
}

/* ==========================================================================
   STUDENTS MODAL
   ========================================================================== */

function closeStudentsModal() {
    const overlay = document.getElementById("students-overlay");
    if (!overlay) return;
    overlay.classList.remove("active");
    overlay.style.display = "none";
    document.body.style.overflow = "";
    setTimeout(() => {
        overlay.setAttribute("hidden", "");
    }, 300);
}

function initStudentsModal() {
    const overlay = document.getElementById("students-overlay");
    const backdrop = document.getElementById("students-backdrop");
    const closeBtn = document.getElementById("students-close");

    if (closeBtn) closeBtn.addEventListener("click", closeStudentsModal);
    if (backdrop) backdrop.addEventListener("click", closeStudentsModal);

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && overlay && !overlay.hasAttribute("hidden")) closeStudentsModal();
    });
}

async function openStudentsModal(uni) {
    const overlay = document.getElementById("students-overlay");
    const title = document.getElementById("students-title");
    const subtitle = document.getElementById("students-subtitle");
    const body = document.getElementById("students-body");

    title.textContent = t("admin_universities.students_in", { name: uni.shortName || uni.name });
    subtitle.textContent = t("admin_universities.students_desc", { name: uni.name });
    body.innerHTML = `<div class="flex items-center justify-center py-12 text-[#94a3b8]"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>`;

    overlay.style.display = "flex";
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    try {
        const { students } = await getUniversityStudentsAdmin(uni._id);
        renderStudentsList(uni, students);
    } catch (err) {
        body.innerHTML = `<p class="text-center text-[#ef4444] py-8">${t("admin_universities.failed_load_students", "Failed to load students: ")}${err.message}</p>`;
    }
}

function renderStudentsList(uni, students) {
    const body = document.getElementById("students-body");
    if (!students || students.length === 0) {
        body.innerHTML = `
            <div class="text-center py-12">
                <i class="fa-solid fa-user-slash text-4xl text-[#94a3b8] mb-3"></i>
                <p class="text-[#64748b] font-medium">${t("admin_universities.no_students", "No students found in this university.")}</p>
            </div>`;
        return;
    }

    body.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-[#e2e2eb] text-xs font-semibold text-[#64748b] uppercase">
                        <th class="py-3 px-3">${t("admin_universities.col_student", "Student")}</th>
                        <th class="py-3 px-3">${t("admin_universities.col_student_id", "Student ID")}</th>
                        <th class="py-3 px-3">${t("admin_universities.col_status", "Status")}</th>
                        <th class="py-3 px-3 text-right">${t("admin_universities.col_actions", "Actions")}</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map(s => {
                        const verifiedBadge = s.isStudentVerified
                            ? `<span class="inline-block text-xs font-semibold py-0.5 px-2 rounded-full bg-[#d1fae5] text-[#059669]">${t("admin_universities.verified", "Verified")}</span>`
                            : s.studentVerificationStatus === 'pending'
                            ? `<span class="inline-block text-xs font-semibold py-0.5 px-2 rounded-full bg-[#fef3c7] text-[#d97706]">${t("admin_universities.pending", "Pending")}</span>`
                            : `<span class="inline-block text-xs font-semibold py-0.5 px-2 rounded-full bg-[#f1f5f9] text-[#64748b]">${t("admin_universities.unverified", "Unverified")}</span>`;

                        return `
                            <tr class="border-b border-[#ecedfa] hover:bg-[#f8f9fc] text-sm" data-user-id="${s._id}">
                                <td class="py-3 px-3">
                                    <div class="flex items-center gap-2.5">
                                        <img src="${s.avatar || '/vite.svg'}" class="w-8 h-8 rounded-full object-cover border border-[#e2e2eb]" onerror="this.src='/vite.svg'" />
                                        <div>
                                            <p class="font-semibold text-[#191b22] line-clamp-1">${s.fullname || s.username}</p>
                                            <p class="text-xs text-[#64748b]">${s.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td class="py-3 px-3 font-mono font-medium text-[#191b22]">
                                    ${s.studentId || s.verifiedStudentId || '—'}
                                </td>
                                <td class="py-3 px-3">${verifiedBadge}</td>
                                <td class="py-3 px-3 text-right">
                                    <button class="remove-student-btn px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 spring-ease" data-user-id="${s._id}" data-name="${s.fullname || s.username}">
                                        <i class="fa-solid fa-user-minus mr-1"></i> ${t("admin_universities.remove_student", "Remove from university")}
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;

    body.querySelectorAll('.remove-student-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.dataset.userId;
            const name = btn.dataset.name;
            if (confirm(t("admin_universities.remove_student_confirm", { name }) || `Are you sure you want to remove "${name}" from this university?`)) {
                btn.disabled = true;
                btn.textContent = t("admin_universities.removing", "Removing...");
                try {
                    await deleteUniversityStudentAdmin(uni._id, userId);
                    const { students: updated } = await getUniversityStudentsAdmin(uni._id);
                    renderStudentsList(uni, updated);
                } catch (err) {
                    alert((t("admin_universities.failed_remove") || "Failed to remove student: ") + err.message);
                }
            }
        });
    });
}
