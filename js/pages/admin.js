import "../../src/style.css";
import { isAuthenticated, getUser } from "../lib/session.js";
import { getEvents, getPendingEvents, approveEvent, rejectEvent, deleteEvent, scrapeEvents, updateEvent } from "../api/admin.js";
import { getEmailSettings, updateEmailSettings, sendTestEmail } from "../api/emailSettings.js";
import { loadNavbar } from "../components/navbar.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent, formatDate, capitalize, toLocalISODate } from "../lib/utils.js";
import { t, applyTranslation, getCategoryName } from "../lib/i18n.js";
import { showToast } from "../components/toast.js";
import { 
    initThumbnailPreview, 
    initFileUpload, 
    initMapPicker, 
    initDateValidation, 
    initFormSubmit, 
    initAttachmentLinks, 
    initOrgSelector, 
    initCheckinRulesToggle,
    initCertificateOptionsToggle,
    initTimePicker,
    initEventModeSelector,
    initEditMode,
    initTurnstile
} from "../lib/hostForm.js";

let currentTab = "pending";
let pendingEvents = [];
let publishedEvents = [];
let actionTarget = null;
let selectedIds = new Set();
let showExpiredPublished = false;

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

    document.getElementById("admin-main").classList.remove("hidden");

    await loadNavbar({ activeSection: "admin" });
    await fetchContent("./components/footer.html").then(html => {
        document.getElementById("footer-container").innerHTML = html;
    });
    await initChatbot();

    window.addEventListener("language-changed", () => {
        applyTranslation();
        renderStats();
        renderTable();
    });

    initAdminModules();
    initTabs();
    initSearch();
    initRefresh();
    initScrape();
    initPopups();
    initBulkActions();
    initManualAdd();
    await loadData();
    startAutoRefresh();
});

function startAutoRefresh() {
    setInterval(async () => {
        if (document.hidden) return;
        try {
            const [pubData, pendData] = await Promise.all([
                getEvents().catch(() => null),
                getPendingEvents().catch(() => null)
            ]);
            if (pubData) publishedEvents = pubData.events || [];
            if (pendData) pendingEvents = pendData.events || [];
            renderStats();
            if (!document.querySelector(".tab-btn.active")) return;
            renderTable();
        } catch {}
    }, 10000);
}

async function loadData() {
    try {
        const [pubData, pendData] = await Promise.all([
            getEvents().catch(() => ({ events: [] })),
            getPendingEvents().catch(() => ({ events: [], total: 0 }))
        ]);
        publishedEvents = pubData?.events || [];
        pendingEvents = pendData?.events || [];
        renderStats();
        renderTable();
    } catch {
        showEmpty();
    }
}

function renderStats() {
    const total = publishedEvents.length + pendingEvents.length;
    document.getElementById("stat-total").textContent = total;
    document.getElementById("stat-published").textContent = publishedEvents.length;
    document.getElementById("stat-pending").textContent = pendingEvents.length;
    const views = publishedEvents.reduce((sum, e) => sum + (e.viewCount || 0), 0);
    document.getElementById("stat-views").textContent = views;
}

function getActiveEvents() {
    return currentTab === "pending" ? pendingEvents : publishedEvents;
}

function renderTable() {
    const tbody = document.getElementById("admin-table-body");
    const empty = document.getElementById("table-empty");
    const count = document.getElementById("table-count");
    const title = document.getElementById("table-title");
    const expiredToggle = document.getElementById("toggle-expired-admin");

    let events = getActiveEvents();
    if (currentTab === "published") {
        const hasExpired = events.some(e => e.heldDate && new Date(e.heldDate) < new Date());
        if (expiredToggle) {
            expiredToggle.classList.toggle("hidden", !hasExpired);
        }
        if (!showExpiredPublished) {
            events = events.filter(e => !e.heldDate || new Date(e.heldDate) >= new Date());
        }
    } else {
        if (expiredToggle) expiredToggle.classList.add("hidden");
    }

    title.textContent = currentTab === "pending" ? t("admin.pending_review") : t("admin.published_events");

    if (events.length === 0) {
        tbody.innerHTML = "";
        empty.classList.remove("hidden");
        count.textContent = t("admin.events_count", { n: 0 });
        return;
    }

    empty.classList.add("hidden");
    count.textContent = events.length === 1
        ? t("admin.events_count_one", { n: 1 })
        : t("admin.events_count", { n: events.length });

    tbody.innerHTML = events.map((e, i) => {
        const sourceSchool = e.source?.school || e.createdByName || "—";
        const checked = selectedIds.has(e._id) ? "checked" : "";
        const statusBadge = e.status === "draft"
            ? `<span class="inline-block text-xs font-semibold py-1 px-2.5 rounded-full bg-[#fef3c7] text-[#d97706]">${t("common.draft", "Draft")}</span>`
            : `<span class="inline-block text-xs font-semibold py-1 px-2.5 rounded-full bg-[#d1fae5] text-[#059669]">${t("common.published", "Published")}</span>`;

        let actionsHTML;
        if (currentTab === "pending") {
            actionsHTML = `
                <button class="approve-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#059669] hover:bg-green-50 hover:border-green-200 transition-all spring-ease" title="${t("admin.approve")}">
                    <i class="fa-solid fa-check text-sm"></i>
                </button>
                <button class="reject-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#ef4444] hover:bg-red-50 hover:border-red-200 transition-all spring-ease" title="${t("admin.reject")}">
                    <i class="fa-solid fa-ban text-sm"></i>
                </button>
            `;
        } else {
            const canEdit = !e.heldDate || (new Date(e.heldDate).getTime() - Date.now() >= 30 * 60 * 1000);
            const isExpired = e.heldDate && new Date(e.heldDate) < new Date();
            const editDisabled = !canEdit && !isExpired;
            const editTitle = editDisabled ? t('admin.cannot_edit_30min', 'Không thể chỉnh sửa sự kiện trước thời gian diễn ra 30 phút') : t('common.edit', 'Edit');
            actionsHTML = `
                <button class="view-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#64748b] hover:bg-[#dae1ff] hover:text-primary hover:border-primary/30 transition-all spring-ease" title="${t("common.view", "View")}">
                    <i class="fa-regular fa-eye text-sm"></i>
                </button>
                <button class="edit-event-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center transition-all spring-ease ${editDisabled ? 'opacity-40 cursor-not-allowed' : 'text-[#1755ba] hover:bg-[#dae1ff] hover:text-primary'}" title="${editTitle}" ${editDisabled ? 'disabled' : ''}>
                    <i class="fa-solid fa-pen text-sm"></i>
                </button>
                <button class="delete-btn w-9 h-9 rounded-lg border border-[#e2e2eb] bg-white flex items-center justify-center text-[#ef4444] hover:bg-red-50 hover:border-red-200 transition-all spring-ease" title="${t("admin.delete")}">
                    <i class="fa-solid fa-trash-can text-sm"></i>
                </button>
            `;
        }

        return `
            <tr class="border-b border-[#ecedfa] hover:bg-[#f8f9fc] transition-colors ${checked ? 'bg-blue-50/40' : ''}" data-id="${e._id}">
                <td class="py-3.5 px-4">
                    <input type="checkbox" class="row-checkbox w-4 h-4 rounded border-[#c3c6d5] text-primary cursor-pointer accent-primary" ${checked} />
                </td>
                <td class="py-3.5 px-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-[#ecedfa] overflow-hidden shrink-0">
                            ${e.thumbnail
                                ? `<img src="${e.thumbnail}" class="w-full h-full object-cover" />`
                                : `<div class="w-full h-full flex items-center justify-center text-[#94a3b8]"><i class="fa-regular fa-image text-sm"></i></div>`
                            }
                        </div>
                        <div class="min-w-0">
                            <p class="font-semibold text-[#191b22] truncate max-w-[220px]">${e.title}</p>
                            <p class="text-[12px] text-[#64748b] mt-0.5">${statusBadge}</p>
                        </div>
                    </div>
                </td>
                <td class="py-3.5 px-4 hidden md:table-cell">
                    <span class="inline-block text-xs font-semibold py-1 px-2.5 rounded-full bg-[#dae1ff] text-primary">${getCategoryName(e.category || e.type || "Event")}</span>
                </td>
                <td class="py-3.5 px-4 text-[#64748b] hidden lg:table-cell">${sourceSchool}</td>
                <td class="py-3.5 px-4 text-[#64748b] hidden sm:table-cell">${formatDate(e.heldDate)}</td>
                <td class="py-3.5 px-4 text-center hidden md:table-cell">
                    <span class="font-semibold text-[#191b22]">${e.viewCount || 0}</span>
                </td>
                <td class="py-3.5 px-4 text-right">
                    <div class="flex items-center justify-end gap-1.5">${actionsHTML}</div>
                </td>
            </tr>
        `;
    }).join("");

    initRowActions();
    initCheckboxes();
    updateBulkBar();
}

function initCheckboxes() {
    document.querySelectorAll(".row-checkbox").forEach(cb => {
        cb.addEventListener("change", () => {
            const id = cb.closest("tr").dataset.id;
            if (cb.checked) selectedIds.add(id);
            else selectedIds.delete(id);
            updateBulkBar();
        });
    });

    const selectAll = document.getElementById("select-all");
    selectAll.addEventListener("change", () => {
        const rows = document.querySelectorAll("#admin-table-body tr");
        rows.forEach(tr => {
            const cb = tr.querySelector(".row-checkbox");
            if (cb) {
                cb.checked = selectAll.checked;
                const id = tr.dataset.id;
                if (selectAll.checked) selectedIds.add(id);
                else selectedIds.delete(id);
            }
        });
        updateBulkBar();
    });
}

function updateBulkBar() {
    const bar = document.getElementById("bulk-bar");
    const count = document.getElementById("bulk-count");
    const approveBtn = document.getElementById("bulk-approve");
    const deleteBtn = document.getElementById("bulk-delete");

    selectedIds.forEach(id => {
        const exists = currentTab === "pending"
            ? pendingEvents.some(e => e._id === id)
            : publishedEvents.some(e => e._id === id);
        if (!exists) selectedIds.delete(id);
    });

    const n = selectedIds.size;
    if (n === 0) {
        bar.classList.add("hidden");
        return;
    }

    bar.classList.remove("hidden");
    count.textContent = t("admin.selected", { n });

    approveBtn.classList.toggle("hidden", currentTab !== "pending");
    deleteBtn.classList.toggle("hidden", currentTab !== "published");
}

function openViewPopup(id) {
    const overlay = document.getElementById("popup-overlay");
    const body = document.getElementById("popup-body");
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    const ev = [...pendingEvents, ...publishedEvents].find(e => e._id === id) || null;
    if (ev) {
        body.innerHTML = buildViewHTML(ev);
        body.dataset.eventId = id;
        if (ev.status === "published") {
            document.getElementById("edit-btn")?.removeAttribute("hidden");
        } else {
            document.getElementById("edit-btn")?.setAttribute("hidden", "");
        }
    } else {
        body.innerHTML = `<p class="text-center text-[#94a3b8] py-10">Event not found</p>`;
        document.getElementById("edit-btn")?.setAttribute("hidden", "");
    }
    document.getElementById("save-btn")?.setAttribute("hidden", "");
    document.getElementById("cancel-btn")?.setAttribute("hidden", "");
}

function buildViewHTML(e) {
    const heldDate = formatDate(e.heldDate);
    const type = getCategoryName(e.category || e.type || "Event");
    const source = e.createdByName || "—";
    return `
    <div class="flex flex-col md:flex-row gap-8">
        <div class="md:w-[380px] shrink-0">
            ${e.thumbnail
                ? `<img src="${e.thumbnail}" class="w-full h-[260px] object-cover rounded-2xl" />`
                : `<div class="w-full h-[260px] rounded-2xl bg-[#ecedfa] flex items-center justify-center text-[#94a3b8]"><i class="fa-regular fa-image text-4xl"></i></div>`
            }
            <div class="mt-5 space-y-3">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-[#dae1ff] flex items-center justify-center text-primary shrink-0"><i class="fa-regular fa-calendar"></i></div>
                    <div><p class="text-[13px] text-[#64748b]">Date</p><p class="font-semibold text-[#191b22]">${heldDate}</p></div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-[#dae1ff] flex items-center justify-center text-primary shrink-0"><i class="fa-regular fa-user"></i></div>
                    <div><p class="text-[13px] text-[#64748b]">Host</p><p class="font-semibold text-[#191b22]">${source}</p></div>
                </div>
            </div>
        </div>
        <div class="flex-1 min-w-0">
            <h2 class="font-headline-md text-2xl font-bold text-[#191b22] mb-2">${e.title}</h2>
            ${e.location ? `<p class="text-sm text-primary mb-4"><i class="fa-solid fa-location-dot mr-1.5"></i><a href="${e.locationLat && e.locationLng ? `https://www.google.com/maps?q=${e.locationLat},${e.locationLng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`}" target="_blank" class="hover:underline">${e.location}</a></p>` : ""}
            <div class="bg-[#f8f9fc] rounded-2xl p-5 max-h-[400px] overflow-y-auto text-sm leading-relaxed text-[#475569] whitespace-pre-wrap">
                ${e.description || "No description"}
            </div>
            ${e.classificationReason ? `
            <div class="mt-4 p-4 rounded-xl bg-[#fef3c7] border border-[#fde68a]">
                <p class="text-[13px] font-semibold text-[#d97706] mb-1">${t("admin.classification", "Phân loại")}</p>
                <p class="text-sm text-[#92400e]">${e.classificationReason}</p>
            </div>` : ""}
            ${e.source?.url ? `
            <div class="mt-4">
                <a href="${e.source.url}" target="_blank" class="text-sm text-primary underline">${t("admin.view_original", "Xem bài gốc")}</a>
            </div>` : ""}
        </div>
    </div>`;
}

document.getElementById("popup-actions")?.addEventListener("click", async e => {
    const id = document.getElementById("popup-body")?.dataset?.eventId;
    if (!id) return;

    if (e.target.id === "edit-btn" || e.target.closest("#edit-btn")) {
        const ev = [...pendingEvents, ...publishedEvents].find(ev => ev._id === id);
        if (!ev) return;
        if (ev?.heldDate) {
            const diffMs = new Date(ev.heldDate).getTime() - Date.now();
            if (diffMs > 0 && diffMs < 30 * 60 * 1000) {
                showToast(t('admin.cannot_edit_30min', 'Không thể chỉnh sửa sự kiện trước thời gian diễn ra 30 phút'), "warning");
                return;
            }
        }
        // Close view popup
        const overlay = document.getElementById("popup-overlay");
        overlay.classList.remove("active");
        overlay.setAttribute("hidden", "");
        document.body.style.overflow = "";
        // Open modern modal in Edit Mode
        openEventModal(id);
    }
});

function initRowActions() {
    document.querySelectorAll("#admin-table-body tr").forEach(tr => {
        tr.addEventListener("click", e => {
            if (e.target.closest("button") || e.target.closest("input[type=checkbox]") || e.target.closest("a")) return;
            openViewPopup(tr.dataset.id);
        });
    });

    document.querySelectorAll(".view-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            openViewPopup(id);
        });
    });

    document.querySelectorAll(".edit-event-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            const ev = publishedEvents.find(e => e._id === id);
            if (ev?.heldDate) {
                const diffMs = new Date(ev.heldDate).getTime() - Date.now();
                if (diffMs > 0 && diffMs < 30 * 60 * 1000) {
                    showToast(t('admin.cannot_edit_30min', 'Không thể chỉnh sửa sự kiện trước thời gian diễn ra 30 phút'), "warning");
                    return;
                }
            }
            openEventModal(id);
        });
    });

    document.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            const ev = publishedEvents.find(e => e._id === id);
            openDeletePopup(id, ev?.title || "this event");
        });
    });

    document.querySelectorAll(".approve-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            const ev = pendingEvents.find(e => e._id === id);
            openApprovePopup(id, ev?.title || "this event");
        });
    });

    document.querySelectorAll(".reject-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const id = btn.closest("tr").dataset.id;
            const ev = pendingEvents.find(e => e._id === id);
            openRejectPopup(id, ev?.title || "this event");
        });
    });
}

function initBulkActions() {
    document.getElementById("bulk-approve").addEventListener("click", async () => {
        const ids = [...selectedIds];
        let failCount = 0;
        for (const id of ids) {
            try {
                await approveEvent(id);
            } catch (err) {
                console.error(`Failed to approve event ${id}:`, err);
                failCount++;
            }
        }
        if (failCount > 0) {
            showToast(t("admin.bulk_fail", `Failed to process ${failCount} event(s)`).replace("{{n}}", failCount), "error");
        } else if (ids.length > 0) {
            showToast(t("admin.bulk_approve_success", "Selected events approved successfully"), "success");
        }
        selectedIds.clear();
        await loadData();
    });

    document.getElementById("bulk-delete").addEventListener("click", async () => {
        const ids = [...selectedIds];
        let failCount = 0;
        for (const id of ids) {
            try {
                await deleteEvent(id);
            } catch (err) {
                console.error(`Failed to delete event ${id}:`, err);
                failCount++;
            }
        }
        if (failCount > 0) {
            showToast(t("admin.bulk_fail", `Failed to process ${failCount} event(s)`).replace("{{n}}", failCount), "error");
        } else if (ids.length > 0) {
            showToast(t("admin.bulk_delete_success", "Selected events deleted successfully"), "success");
        }
        selectedIds.clear();
        await loadData();
    });

    document.getElementById("bulk-clear").addEventListener("click", () => {
        selectedIds.clear();
        renderTable();
    });
}

function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentTab = btn.dataset.tab;
            selectedIds.clear();
            renderTable();
            renderSearch();
        });
    });
}

let searchTimer;

function initSearch() {
    const input = document.getElementById("admin-search");
    input.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderSearch, 250);
    });
}

function renderSearch() {
    const q = document.getElementById("admin-search").value.trim().toLowerCase();
    if (!q) {
        document.querySelectorAll("#admin-table-body tr").forEach(tr => tr.style.display = "");
        return;
    }
    document.querySelectorAll("#admin-table-body tr").forEach(tr => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = text.includes(q) ? "" : "none";
    });
}

function initRefresh() {
    document.getElementById("refresh-admin-btn").addEventListener("click", async () => {
        document.getElementById("admin-search").value = "";
        await loadData();
    });
}

function showEmpty() {
    document.getElementById("admin-table-body").innerHTML = "";
    document.getElementById("table-empty").classList.remove("hidden");
    document.getElementById("table-count").textContent = t("admin.events_count", { n: 0 });
}

function initScrape() {
    const btn = document.getElementById("scrape-btn");
    const overlay = document.getElementById("scrape-overlay");
    const backdrop = document.getElementById("scrape-backdrop");

    btn.addEventListener("click", async () => {
        overlay.removeAttribute("hidden");
        overlay.classList.add("active");
        document.body.style.overflow = "hidden";

        document.getElementById("scrape-loading").classList.remove("hidden");
        document.getElementById("scrape-result").classList.add("hidden");

        try {
            console.log("Scraping...");
            const data = await scrapeEvents();
            console.log("Scrape result:", data);
            document.getElementById("scrape-loading").classList.add("hidden");
            document.getElementById("scrape-result").classList.remove("hidden");
            document.getElementById("scrape-total").textContent = (data?.total ?? 0).toString();
            document.getElementById("scrape-inserted").textContent = (data?.inserted ?? 0).toString();
            document.getElementById("scrape-errors").textContent = (data?.errors?.length ?? 0).toString();
        } catch (err) {
            console.error("Scrape error:", err);
            document.getElementById("scrape-loading").classList.add("hidden");
            document.getElementById("scrape-result").classList.remove("hidden");
            const status = err?.status ? `HTTP ${err.status}: ` : "";
            document.getElementById("scrape-stats").innerHTML = `
                <div class="text-center">
                    <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                        <i class="fa-solid fa-circle-exclamation text-red-500 text-xl"></i>
                    </div>
                    <p class="text-sm font-semibold text-red-600">${status}${err?.message || "Request failed"}</p>
                </div>
            `;
        }
    });

    function close() {
        overlay.classList.remove("active");
        document.body.style.overflow = "";
        setTimeout(() => {
            overlay.setAttribute("hidden", "");
            document.getElementById("scrape-stats").innerHTML = `
                <div class="flex justify-center gap-6 my-6" id="scrape-stats">
                    <div class="text-center">
                        <p class="text-[32px] font-extrabold text-[#191b22]" id="scrape-total">0</p>
                        <p class="text-[13px] text-[#64748b] font-semibold uppercase">${t("admin.found")}</p>
                    </div>
                    <div class="text-center">
                        <p class="text-[32px] font-extrabold text-[#059669]" id="scrape-inserted">0</p>
                        <p class="text-[13px] text-[#64748b] font-semibold uppercase">${t("admin.new")}</p>
                    </div>
                    <div class="text-center">
                        <p class="text-[32px] font-extrabold text-[#db2777]" id="scrape-errors">0</p>
                        <p class="text-[13px] text-[#64748b] font-semibold uppercase">${t("admin.errors")}</p>
                    </div>
                </div>
            `;
        }, 300);
        loadData();
    }

    backdrop.addEventListener("click", close);
    document.getElementById("scrape-done").addEventListener("click", close);
}

function initPopups() {
    initPopup("approve", async id => {
        await approveEvent(id);
        pendingEvents = pendingEvents.filter(e => e._id !== id);
        renderStats();
        renderTable();
    });
    initPopup("reject", async id => {
        await rejectEvent(id);
        pendingEvents = pendingEvents.filter(e => e._id !== id);
        renderStats();
        renderTable();
    });
    initPopup("delete", async id => {
        await deleteEvent(id);
        publishedEvents = publishedEvents.filter(e => e._id !== id);
        renderStats();
        renderTable();
    });
    initSharedPopup();
}

function initSharedPopup() {
    const overlay = document.getElementById("popup-overlay");
    const backdrop = document.getElementById("popup-backdrop");
    const back = document.getElementById("popup-back");

    function close() {
        overlay.classList.remove("active");
        document.body.style.overflow = "";
        document.getElementById("edit-btn")?.setAttribute("hidden", "");
        document.getElementById("save-btn")?.setAttribute("hidden", "");
        document.getElementById("cancel-btn")?.setAttribute("hidden", "");
        delete document.getElementById("popup-body")?.dataset?.eventId;
        setTimeout(() => overlay.setAttribute("hidden", ""), 300);
    }

    backdrop?.addEventListener("click", close);
    back?.addEventListener("click", close);
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !overlay.hasAttribute("hidden")) close();
    });
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
        if (e.key === "Escape") close();
    });
    confirm?.addEventListener("click", async () => {
        if (!actionTarget) return;
        try {
            await onConfirm(actionTarget);
            close();
        } catch (err) {
            console.error(`Error performing action for ${actionTarget}:`, err);
            showToast(t("admin.action_failed", "Action could not be completed"), "error");
            close();
        }
    });
}

function openApprovePopup(id, title) {
    actionTarget = id;
    document.getElementById("approve-title").textContent = `"${title}"`;
    const overlay = document.getElementById("approve-overlay");
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

function openRejectPopup(id, title) {
    actionTarget = id;
    document.getElementById("reject-title").textContent = `"${title}"`;
    const overlay = document.getElementById("reject-overlay");
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

function openDeletePopup(id, title) {
    actionTarget = id;
    document.getElementById("delete-title").textContent = `"${title}"`;
    const overlay = document.getElementById("delete-overlay");
    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

/* =========================
   EVENT CREATE / EDIT MODAL
========================= */

let mapInstance = null;

export async function openEventModal(eventId = null) {
    const overlay = document.getElementById("add-event-overlay");
    const body = document.getElementById("add-event-body");
    const modalTitle = document.getElementById("event-modal-title");
    const modalIcon = document.getElementById("event-modal-icon");

    if (eventId) {
        sessionStorage.setItem("__editEventId", eventId);
        if (modalTitle) modalTitle.textContent = t("admin.edit_event_title") || "Edit Event";
        if (modalIcon) modalIcon.innerHTML = `<i class="fa-solid fa-pen-to-square text-base"></i>`;
    } else {
        sessionStorage.removeItem("__editEventId");
        if (modalTitle) modalTitle.textContent = t("admin.create_event_title") || "Create New Event";
        if (modalIcon) modalIcon.innerHTML = `<i class="fa-solid fa-calendar-plus text-base"></i>`;
    }

    overlay.removeAttribute("hidden");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    const html = await fetchContent("./components/hostActivityDetails.html");
    body.innerHTML = html;
    applyTranslation(body);

    const internalTitle = body.querySelector(".page-title");
    if (internalTitle) internalTitle.style.display = "none";

    initThumbnailPreview();
    initFileUpload();
    initAttachmentLinks();
    initTimePicker();
    initDateValidation();
    initEventModeSelector();
    initCheckinRulesToggle();
    initCertificateOptionsToggle();
    await initOrgSelector();
    initTurnstile();

    setTimeout(() => {
        mapInstance = initMapPicker();
        if (mapInstance?.map) {
            setTimeout(() => mapInstance.map.resize(), 150);
        }
    }, 250);

    initFormSubmit(null, async () => {
        closeEventModal();
        await loadData();
    });

    if (eventId) {
        await initEditMode(eventId);
    }
}

export function closeEventModal() {
    const overlay = document.getElementById("add-event-overlay");
    const body = document.getElementById("add-event-body");
    sessionStorage.removeItem("__editEventId");
    overlay.classList.remove("active");
    document.body.style.overflow = "";
    if (mapInstance?.map) {
        try { mapInstance.map.remove(); } catch {}
    }
    setTimeout(() => {
        overlay.setAttribute("hidden", "");
        body.innerHTML = `<div class="flex items-center justify-center py-16 text-[#94a3b8]"><div class="spinner"></div></div>`;
        mapInstance = null;
    }, 300);
}

function initManualAdd() {
    const overlay = document.getElementById("add-event-overlay");
    const backdrop = document.getElementById("add-event-backdrop");
    const closeBtn = document.getElementById("add-event-close");

    document.getElementById("add-event-btn")?.addEventListener("click", () => openEventModal(null));
    backdrop?.addEventListener("click", closeEventModal);
    closeBtn?.addEventListener("click", closeEventModal);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !overlay?.hasAttribute("hidden")) closeEventModal();
    });
}

// ─── Expired Events Toggle ───

document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("toggle-expired-admin");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            showExpiredPublished = !showExpiredPublished;
            toggleBtn.classList.toggle("bg-[#dae1ff]", showExpiredPublished);
            const icon = toggleBtn.querySelector(".material-symbols-outlined");
            const text = toggleBtn.querySelector("span:last-child");
            if (icon) icon.textContent = showExpiredPublished ? "visibility_off" : "visibility";
            if (text) text.textContent = showExpiredPublished ? t("admin.hide_expired", "Hide Expired") : t("admin.show_expired", "Show Expired");
            renderTable();
        });
    }
});

// ─── Admin Module Switcher & Email Settings ───

let currentAdminModule = "events";

export function switchAdminModule(moduleName) {
    currentAdminModule = moduleName;
    const eventsSec = document.getElementById("section-events");
    const emailSec = document.getElementById("section-email");
    const eventsNavBtn = document.getElementById("admin-nav-events");
    const emailNavBtn = document.getElementById("admin-nav-email");

    if (moduleName === "email") {
        eventsSec?.classList.add("hidden");
        emailSec?.classList.remove("hidden");

        eventsNavBtn?.classList.remove("bg-primary", "text-white", "shadow-md");
        eventsNavBtn?.classList.add("bg-white", "border", "border-[#e2e2eb]", "text-[#64748b]", "hover:bg-[#f1f5f9]");

        emailNavBtn?.classList.remove("bg-white", "border", "border-[#e2e2eb]", "text-[#64748b]", "hover:bg-[#f1f5f9]");
        emailNavBtn?.classList.add("bg-primary", "text-white", "shadow-md");

        if (window.location.hash !== "#email") {
            history.replaceState(null, "", "#email");
        }
        loadEmailSettings();
    } else {
        emailSec?.classList.add("hidden");
        eventsSec?.classList.remove("hidden");

        emailNavBtn?.classList.remove("bg-primary", "text-white", "shadow-md");
        emailNavBtn?.classList.add("bg-white", "border", "border-[#e2e2eb]", "text-[#64748b]", "hover:bg-[#f1f5f9]");

        eventsNavBtn?.classList.remove("bg-white", "border", "border-[#e2e2eb]", "text-[#64748b]", "hover:bg-[#f1f5f9]");
        eventsNavBtn?.classList.add("bg-primary", "text-white", "shadow-md");

        if (window.location.hash === "#email") {
            history.replaceState(null, "", window.location.pathname);
        }
    }
}

function initAdminModules() {
    document.getElementById("admin-nav-events")?.addEventListener("click", () => switchAdminModule("events"));
    document.getElementById("admin-nav-email")?.addEventListener("click", () => switchAdminModule("email"));

    window.addEventListener("hashchange", () => {
        if (window.location.hash === "#email") {
            switchAdminModule("email");
        } else {
            switchAdminModule("events");
        }
    });

    if (window.location.hash === "#email") {
        switchAdminModule("email");
    }

    initEmailSettingsEvents();
}

let emailSettingsLoaded = false;
async function loadEmailSettings() {
    try {
        const { config, diagnostics } = await getEmailSettings();
        if (!config) return;
        emailSettingsLoaded = true;

        // Prefill test email input if empty
        const testEmailInput = document.getElementById("test-email-to");
        if (testEmailInput && !testEmailInput.value) {
            const user = getUser();
            if (user?.email) testEmailInput.value = user.email;
        }

        // Provider radio & cards
        const activeProvider = config.activeProvider || "gmail";
        const gmailRadio = document.getElementById("provider-gmail-radio");
        const resendRadio = document.getElementById("provider-resend-radio");
        if (activeProvider === "resend") {
            if (resendRadio) resendRadio.checked = true;
            updateProviderCardsUI("resend");
        } else {
            if (gmailRadio) gmailRadio.checked = true;
            updateProviderCardsUI("gmail");
        }

        // Diagnostics
        if (diagnostics) {
            const gmailBadge = document.getElementById("badge-gmail-status");
            const gmailUser = document.getElementById("diag-gmail-user");
            const gmailMode = document.getElementById("diag-gmail-mode");
            if (gmailBadge) {
                if (diagnostics.gmail?.configured) {
                    gmailBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200";
                    gmailBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Configured`;
                } else {
                    gmailBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200";
                    gmailBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Missing .env`;
                }
            }
            if (gmailUser && diagnostics.gmail?.from) gmailUser.textContent = diagnostics.gmail.from;
            if (gmailMode) {
                if (diagnostics.gmail?.mode === 'cloudflare-worker') {
                    gmailMode.textContent = "Cloudflare Worker (OAuth2)";
                } else if (diagnostics.gmail?.mode === 'smtp') {
                    gmailMode.textContent = `SMTP (${diagnostics.gmail.host}:${diagnostics.gmail.port})`;
                } else {
                    gmailMode.textContent = "Not configured";
                }
            }

            const resendBadge = document.getElementById("badge-resend-status");
            const resendKey = document.getElementById("diag-resend-key");
            const resendFrom = document.getElementById("diag-resend-from");
            if (resendBadge) {
                if (diagnostics.resend?.hasApiKey) {
                    resendBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200";
                    resendBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Configured`;
                } else {
                    resendBadge.className = "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200";
                    resendBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Missing API Key`;
                }
            }
            if (resendKey) resendKey.textContent = diagnostics.resend?.hasApiKey ? "API Key Set" : "Not configured";
            if (resendFrom && diagnostics.resend?.from) resendFrom.textContent = diagnostics.resend.from;
        }

        // Master switch
        const masterToggle = document.getElementById("email-master-toggle");
        if (masterToggle) {
            masterToggle.checked = config.masterEnabled !== false;
            syncOptionsContainerDisabled(masterToggle.checked);
        }

        // Sub options
        const opts = config.options || {};
        setCheckbox("opt-verificationEmail", opts.verificationEmail !== false);
        setCheckbox("opt-passwordResetEmail", opts.passwordResetEmail !== false);
        setCheckbox("opt-ticketConfirmationEmail", opts.ticketConfirmationEmail !== false);
        setCheckbox("opt-hostNotificationEmail", opts.hostNotificationEmail !== false);
        setCheckbox("opt-hostApprovalEmail", opts.hostApprovalEmail !== false);
        setCheckbox("opt-studentVerificationEmail", opts.studentVerificationEmail !== false);
        setCheckbox("opt-emailChangeOtpEmail", opts.emailChangeOtpEmail !== false);
    } catch (err) {
        console.error("Failed to load email settings:", err);
        showToast(err.message || "Failed to load email settings", "error");
    }
}

function setCheckbox(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
}

function syncOptionsContainerDisabled(enabled) {
    const container = document.getElementById("email-options-container");
    if (!container) return;
    if (enabled) {
        container.classList.remove("opacity-50", "pointer-events-none");
    } else {
        container.classList.add("opacity-50", "pointer-events-none");
    }
}

function updateProviderCardsUI(selected) {
    const gmailCard = document.getElementById("card-provider-gmail");
    const resendCard = document.getElementById("card-provider-resend");

    if (selected === "resend") {
        resendCard?.classList.add("border-primary", "bg-blue-50/20");
        resendCard?.classList.remove("border-[#e2e2eb]", "bg-white");
        gmailCard?.classList.remove("border-primary", "bg-blue-50/20");
        gmailCard?.classList.add("border-[#e2e2eb]", "bg-white");
    } else {
        gmailCard?.classList.add("border-primary", "bg-blue-50/20");
        gmailCard?.classList.remove("border-[#e2e2eb]", "bg-white");
        resendCard?.classList.remove("border-primary", "bg-blue-50/20");
        resendCard?.classList.add("border-[#e2e2eb]", "bg-white");
    }
}

function initEmailSettingsEvents() {
    // Provider card clicking
    document.getElementById("card-provider-gmail")?.addEventListener("click", () => {
        const radio = document.getElementById("provider-gmail-radio");
        if (radio) radio.checked = true;
        updateProviderCardsUI("gmail");
    });

    document.getElementById("card-provider-resend")?.addEventListener("click", () => {
        const radio = document.getElementById("provider-resend-radio");
        if (radio) radio.checked = true;
        updateProviderCardsUI("resend");
    });

    // Master toggle change
    document.getElementById("email-master-toggle")?.addEventListener("change", (e) => {
        syncOptionsContainerDisabled(e.target.checked);
    });

    // Save Settings
    document.getElementById("save-email-settings-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("save-email-settings-btn");
        const originalText = btn ? btn.innerHTML : "";
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving...</span>`;
        }

        try {
            const activeProvider = document.querySelector('input[name="email_provider"]:checked')?.value || "gmail";
            const masterEnabled = document.getElementById("email-master-toggle")?.checked ?? true;
            const options = {
                verificationEmail: document.getElementById("opt-verificationEmail")?.checked ?? true,
                passwordResetEmail: document.getElementById("opt-passwordResetEmail")?.checked ?? true,
                ticketConfirmationEmail: document.getElementById("opt-ticketConfirmationEmail")?.checked ?? true,
                hostNotificationEmail: document.getElementById("opt-hostNotificationEmail")?.checked ?? true,
                hostApprovalEmail: document.getElementById("opt-hostApprovalEmail")?.checked ?? true,
                studentVerificationEmail: document.getElementById("opt-studentVerificationEmail")?.checked ?? true,
                emailChangeOtpEmail: document.getElementById("opt-emailChangeOtpEmail")?.checked ?? true,
            };

            await updateEmailSettings({ activeProvider, masterEnabled, options });
            showToast(t("admin.email_save_success", "Email settings saved successfully!"), "success");
            await loadEmailSettings();
        } catch (err) {
            showToast(err.message || "Failed to save email settings", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    });

    // Send Test Email
    document.getElementById("send-test-email-btn")?.addEventListener("click", async () => {
        const toInput = document.getElementById("test-email-to");
        const providerSelect = document.getElementById("test-email-provider");
        const statusEl = document.getElementById("test-email-status");
        const btn = document.getElementById("send-test-email-btn");

        const toEmail = toInput?.value?.trim();
        if (!toEmail || !toEmail.includes("@")) {
            showToast(t("admin.email_invalid_recipient", "Please enter a valid recipient email address"), "error");
            toInput?.focus();
            return;
        }

        const provider = providerSelect?.value || null;
        const originalText = btn ? btn.innerHTML : "";
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Sending...</span>`;
        }

        if (statusEl) {
            statusEl.classList.remove("hidden", "text-emerald-600", "text-red-600");
            statusEl.className = "text-xs font-semibold text-slate-500";
            statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Testing connection and dispatching email...`;
        }

        try {
            const res = await sendTestEmail(toEmail, provider);
            showToast(t("admin.email_test_success", "Test email sent successfully!"), "success");
            if (statusEl) {
                statusEl.className = "text-xs font-semibold text-emerald-600 flex items-center gap-1.5";
                statusEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${res.message || "Test email sent successfully!"}`;
            }
        } catch (err) {
            showToast(err.message || "Failed to send test email", "error");
            if (statusEl) {
                statusEl.className = "text-xs font-semibold text-red-600 flex items-center gap-1.5";
                statusEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${err.message || "Failed to send test email"}`;
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    });
}
