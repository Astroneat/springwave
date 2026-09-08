import "../../src/style.css";
import { isAuthenticated, getUser } from "../lib/session.js";
import { loadNavbar } from "../components/navbar.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent } from "../lib/utils.js";
import { t, applyTranslation } from "../lib/i18n.js";
import { listCategories, createCategory, updateCategory, deleteCategory } from "../api/categories.js";

let categories = [];
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

    initSearch();
    initRefresh();
    initForm();
    initDelete();
    await loadData();

    window.addEventListener("language-changed", () => {
        applyTranslation();
        renderTable();
    });
});

async function loadData() {
    try {
        const data = await listCategories(false);
        categories = data.categories || [];
        renderTable();
    } catch (err) {
        console.error("Failed to load categories:", err);
        showEmpty();
    }
}

function renderTable() {
    const tbody = document.getElementById("table-body");
    const empty = document.getElementById("table-empty");
    const count = document.getElementById("table-count");

    if (categories.length === 0) {
        tbody.innerHTML = "";
        empty.classList.remove("hidden");
        count.textContent = t("admin_categories.categories_count", { n: 0 });
        return;
    }

    empty.classList.add("hidden");
    count.textContent = t("admin_categories.categories_count", { n: categories.length });

    const q = document.getElementById("search-input").value.trim().toLowerCase();

    tbody.innerHTML = categories
        .filter(c => !q || c.name.toLowerCase().includes(q) || (c.slug || "").toLowerCase().includes(q))
        .map(c => {
            const statusBadge = c.isActive !== false
                ? `<span class="inline-block text-xs font-semibold py-1 px-2.5 rounded-full bg-[#d1fae5] text-[#059669]">${t("admin_categories.active", "Active")}</span>`
                : `<span class="inline-block text-xs font-semibold py-1 px-2.5 rounded-full bg-[#fee2e2] text-[#dc2626]">${t("admin_categories.inactive", "Inactive")}</span>`;

            return `
            <tr class="border-b border-[#ecedfa] hover:bg-[#f8f9fc] transition-colors" data-id="${c._id}">
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0" style="background:${c.color || '#64748b'}">
                            <i class="${c.icon || 'fa-solid fa-tag'} text-sm"></i>
                        </div>
                    </div>
                </td>
                <td class="py-3.5 px-4">
                    <span class="font-semibold text-[#191b22]">${c.name}</span>
                </td>
                <td class="py-3.5 px-4 text-[#64748b] hidden sm:table-cell">${c.slug || "—"}</td>
                <td class="py-3.5 px-4 hidden md:table-cell">
                    <div class="flex items-center gap-2">
                        <span class="color-preview" style="background:${c.color || '#64748b'}"></span>
                        <span class="text-[13px] text-[#64748b] font-mono">${c.color || "—"}</span>
                    </div>
                </td>
                <td class="py-3.5 px-4 text-[#64748b] hidden lg:table-cell">${c.sortOrder ?? 0}</td>
                <td class="py-3.5 px-4">${statusBadge}</td>
                <td class="py-3.5 px-4 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <button class="edit-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#64748b] hover:bg-[#dae1ff] hover:text-primary hover:border-primary/30 transition-all spring-ease" title="${t("admin_categories.edit", "Edit")}">
                            <i class="fa-regular fa-pen-to-square text-sm"></i>
                        </button>
                        <button class="delete-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#ef4444] hover:bg-red-50 hover:border-red-200 transition-all spring-ease" title="${t("admin_categories.delete", "Delete")}">
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
            const cat = categories.find(c => c._id === id);
            if (cat) openForm(cat);
        });
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            const cat = categories.find(c => c._id === id);
            if (cat) openDelete(cat);
        });
    });
}

function showEmpty() {
    document.getElementById("table-body").innerHTML = "";
    document.getElementById("table-empty").classList.remove("hidden");
    document.getElementById("table-count").textContent = t("admin_categories.categories_count", { n: 0 });
}

function initSearch() {
    const input = document.getElementById("search-input");
    input.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderTable, 250);
    });
}

function initRefresh() {
    document.getElementById("refresh-btn").addEventListener("click", () => {
        document.getElementById("search-input").value = "";
        loadData();
    });
}

/* =========================
   FORM POPUP (Create / Edit)
========================= */

function openForm(cat) {
    const overlay = document.getElementById("form-overlay");
    const title = document.getElementById("form-title");
    const nameField = document.getElementById("field-name");
    const iconField = document.getElementById("field-icon");
    const colorField = document.getElementById("field-color");
    const colorTextField = document.getElementById("field-color-text");
    const sortField = document.getElementById("field-sort");
    const activeField = document.getElementById("field-active");

    if (cat) {
        title.textContent = t("admin_categories.edit", "Edit Category");
        actionTarget = cat._id;
        nameField.value = cat.name || "";
        iconField.value = cat.icon || "";
        const color = cat.color || "#10b981";
        colorField.value = color;
        colorTextField.value = color;
        sortField.value = cat.sortOrder ?? 0;
        activeField.checked = cat.isActive !== false;
    } else {
        title.textContent = t("admin_categories.add_category", "Add Category");
        actionTarget = null;
        nameField.value = "";
        iconField.value = "";
        colorField.value = "#10b981";
        colorTextField.value = "#10b981";
        sortField.value = 0;
        activeField.checked = true;
    }

    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeForm() {
    const overlay = document.getElementById("form-overlay");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(() => {
        overlay.setAttribute("hidden", "");
        actionTarget = null;
    }, 300);
}

function initForm() {
    const overlay = document.getElementById("form-overlay");
    const backdrop = document.getElementById("form-backdrop");
    const closeBtn = document.getElementById("form-close");
    const cancelBtn = document.getElementById("form-cancel");
    const saveBtn = document.getElementById("form-save");
    const colorField = document.getElementById("field-color");
    const colorTextField = document.getElementById("field-color-text");

    document.getElementById("add-category-btn").addEventListener("click", () => openForm(null));

    colorField.addEventListener("input", () => { colorTextField.value = colorField.value; });
    colorTextField.addEventListener("input", () => {
        if (/^#[0-9a-f]{6}$/i.test(colorTextField.value)) colorField.value = colorTextField.value;
    });

    function close() { closeForm(); }
    backdrop?.addEventListener("click", close);
    closeBtn?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !overlay.hasAttribute("hidden")) close();
    });

    saveBtn.addEventListener("click", async () => {
        const name = document.getElementById("field-name").value.trim();
        if (!name) { alert("Name is required"); return; }

        const data = {
            name,
            icon: document.getElementById("field-icon").value.trim() || undefined,
            color: document.getElementById("field-color-text").value.trim() || undefined,
            sortOrder: parseInt(document.getElementById("field-sort").value) || 0,
            isActive: document.getElementById("field-active").checked,
        };

        try {
            if (actionTarget) {
                await updateCategory(actionTarget, data);
            } else {
                await createCategory(data);
            }
            close();
            await loadData();
        } catch (err) {
            alert(err.message || "Failed to save category");
        }
    });
}

/* =========================
   DELETE POPUP
========================= */

function openDelete(cat) {
    actionTarget = cat._id;
    document.getElementById("delete-name").textContent = cat.name;
    const overlay = document.getElementById("delete-overlay");
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeDelete() {
    const overlay = document.getElementById("delete-overlay");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
    setTimeout(() => {
        overlay.setAttribute("hidden", "");
        actionTarget = null;
    }, 300);
}

function initDelete() {
    const overlay = document.getElementById("delete-overlay");
    const backdrop = document.getElementById("delete-backdrop");
    const cancelBtn = document.getElementById("delete-cancel");
    const confirmBtn = document.getElementById("delete-confirm");

    function close() { closeDelete(); }
    backdrop?.addEventListener("click", close);
    cancelBtn?.addEventListener("click", close);
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !overlay.hasAttribute("hidden")) close();
    });

    confirmBtn.addEventListener("click", async () => {
        if (!actionTarget) return;
        try {
            await deleteCategory(actionTarget);
            close();
            await loadData();
        } catch (err) {
            alert(err.message || "Failed to delete category");
            close();
        }
    });
}
