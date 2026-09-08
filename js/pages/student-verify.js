import "../../src/style.css";
import { isAuthenticated, getUser, setUser } from "../lib/session.js";
import { getCurrentUser } from "../api/auth.js";
import { loadNavbar } from "../components/navbar.js";
import { initChatbot } from "../components/chatbot.js";
import { fetchContent } from "../lib/utils.js";
import { uploadFormData } from "../api/client.js";
import { getMyVerificationStatus, autoVerifyStudent } from "../api/studentVerification.js";
import { checkSchoolEmail } from "../api/universities.js";
import { TURNSTILE_SITE_KEY } from "../config.js";
import { isSchoolEmail } from "../lib/utils.js";
import { t, applyTranslation } from "../lib/i18n.js";

let turnstileWidgetId = null;

document.addEventListener("DOMContentLoaded", async () => {
    if (!isAuthenticated()) {
        window.location.href = "/login.html";
        return;
    }

    await loadNavbar();
    await fetchContent("./components/footer.html").then(html => {
        const c = document.getElementById("footer-container");
        if (c) c.innerHTML = html;
    });
    await initChatbot();

    // Check if user has a school email AND university has autoVerify enabled
    const user = getUser();
    let isSchoolEmailUser = false;
    let cachedStatusData = null;

    function renderAutoVerifyBanner() {
        const banner = document.getElementById("status-banner");
        if (banner) {
            banner.classList.remove("hidden");
            banner.innerHTML = `
                <div class="rounded-xl bg-emerald-50 border border-emerald-200 p-5 flex items-start gap-4 mb-2">
                    <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span class="material-symbols-outlined text-emerald-600 text-xl">verified</span>
                    </div>
                    <div>
                        <h3 class="font-semibold text-emerald-800 text-sm">${t("student_verify.auto_verify_title")}</h3>
                        <p class="text-sm text-emerald-700 mt-1">${t("student_verify.auto_verify_desc", { email: user?.email || '' })}</p>
                    </div>
                </div>
            `;
        }
    }

    if (user && user.email) {
        try {
            const schoolCheck = await checkSchoolEmail(user.email);
            isSchoolEmailUser = Boolean(schoolCheck.isSchool && schoolCheck.university && schoolCheck.university.autoVerify !== false);
        } catch (e) {}
    }

    if (isSchoolEmailUser) {
        renderAutoVerifyBanner();
    }

    initTurnstile();
    await checkExistingStatus();

    // UI customizations for school email auto-verify flow
    if (isSchoolEmailUser) {
        // Hide Turnstile widget (not required for auto-verify)
        const turnstileContainer = document.getElementById('turnstile-container');
        if (turnstileContainer) turnstileContainer.classList.add('hidden');

        // Update submit button
        const submitText = document.getElementById('verify-submit-text');
        const submitIcon = document.getElementById('verify-submit-icon');
        if (submitText) submitText.textContent = t("student_verify.submit_auto");
        if (submitIcon) submitIcon.textContent = 'verified';

        // Update page subtitle
        const subtitle = document.getElementById('verify-page-subtitle');
        if (subtitle) subtitle.textContent = t("student_verify.subtitle_auto");
    }

    const form = document.querySelector('form');
    if (!form) return;

    function bindCardInput(inputId, { icon, label, hint, preview, defaultLabel }) {
        const input = document.getElementById(inputId);
        const iconEl = document.getElementById(icon);
        const labelEl = document.getElementById(label);
        const hintEl = document.getElementById(hint);
        const previewEl = document.getElementById(preview);
        if (!input || !previewEl) return;

        input.addEventListener("change", () => {
            if (input.files.length > 0) {
                const file = input.files[0];

                // Validate file type
                const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                if (!validTypes.includes(file.type)) {
                    alert(t("student_verify.alert_large_file")); // Or format error
                    input.value = '';
                    return;
                }

                // Validate file size (max 10MB)
                const maxSize = 10 * 1024 * 1024; // 10MB
                if (file.size > maxSize) {
                    alert(t("student_verify.alert_large_file"));
                    input.value = '';
                    return;
                }

                labelEl.textContent = file.name;
                iconEl.textContent = "description";
                hintEl.textContent = (file.size / 1024 / 1024).toFixed(1) + " MB";
                previewEl.classList.remove("hidden");
                if (file.type.startsWith("image/")) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        previewEl.innerHTML = `
                            <div class="relative">
                                <img src="${e.target.result}" class="max-h-40 rounded-lg border border-outline-variant shadow-sm"/>
                                <button type="button" class="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors" onclick="this.parentElement.parentElement.classList.add('hidden'); document.getElementById('${inputId}').value = '';">
                                    <span class="material-symbols-outlined text-[14px]">close</span>
                                </button>
                            </div>
                        `;
                    };
                    reader.readAsDataURL(file);
                }
            } else {
                labelEl.textContent = defaultLabel;
                iconEl.textContent = "cloud_upload";
                hintEl.textContent = t("student_verify.upload_hint");
                previewEl.classList.add("hidden");
            }
        });
    }

    const frontInput = document.getElementById("studentCardFront");
    const backInput = document.getElementById("studentCardBack");
    bindCardInput("studentCardFront", { icon: "frontIcon", label: "frontLabel", hint: "frontHint", preview: "frontPreview", defaultLabel: t("student_verify.upload_front") });
    bindCardInput("studentCardBack", { icon: "backIcon", label: "backLabel", hint: "backHint", preview: "backPreview", defaultLabel: t("student_verify.upload_back") });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const studentId = document.getElementById("studentId").value.trim();
        if (!studentId) {
            alert(t("student_verify.alert_req_id"));
            return;
        }

        // Validate student ID format
        if (!/^[a-zA-Z0-9]{6,15}$/.test(studentId)) {
            alert(t("student_verify.alert_invalid_id"));
            return;
        }

        if (!frontInput?.files?.length || !backInput?.files?.length) {
            alert(t("student_verify.alert_req_cards"));
            return;
        }

        // Validate file sizes
        const frontFile = frontInput.files[0];
        const backFile = backInput.files[0];
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (frontFile.size > maxSize || backFile.size > maxSize) {
            alert(t("student_verify.alert_large_file"));
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;

        btn.innerHTML = '<span class="material-symbols-outlined animate-spin">refresh</span> <span>Processing...</span>';
        btn.classList.add('opacity-80', 'pointer-events-none');

        const formData = new FormData(form);

        // Auto-verify path: school email users are verified immediately (no admin review)
        if (isSchoolEmailUser) {
            try {
                const res = await autoVerifyStudent(formData);
                if (res?.user) {
                    setUser(res.user);
                } else {
                    try {
                        const meRes = await getCurrentUser();
                        if (meRes?.user) setUser(meRes.user);
                    } catch {}
                }

                if (res?.requiresManualReview) {
                    btn.innerHTML = `<span class="material-symbols-outlined">schedule</span> <span>Pending Review</span>`;
                    btn.classList.remove('bg-gradient-to-r', 'from-primary-container', 'to-secondary');
                    btn.classList.add('bg-amber-600');

                    setTimeout(() => {
                        alert(res.message || "Hồ sơ của bạn đã được gửi và đang chờ Admin duyệt.");
                        window.location.href = "/profile.html";
                    }, 1200);
                    return;
                }

                btn.innerHTML = `<span class="material-symbols-outlined">verified</span> <span>${t("student_verify.status_approved")}!</span>`;
                btn.classList.remove('bg-gradient-to-r', 'from-primary-container', 'to-secondary');
                btn.classList.add('bg-emerald-600');

                setTimeout(() => {
                    alert(t("student_verify.alert_success_auto"));
                    window.location.href = "/profile.html";
                }, 1200);
            } catch (error) {
                const msg = error?.message || "An unexpected error occurred. Please try again.";
                let userMsg = msg;
                if (msg.includes("already verified")) {
                    userMsg = t("student_verify.err_already_verified");
                } else if (msg.includes("student ID has already been")) {
                    userMsg = t("student_verify.err_taken");
                } else if (msg.includes("school email")) {
                    userMsg = t("student_verify.err_not_school_email");
                } else {
                    userMsg = msg;
                }
                alert(`${t("common.error")}: ${userMsg}`);
                btn.innerHTML = originalText;
                btn.classList.remove('opacity-80', 'pointer-events-none');
            }
            return;
        }

        // Standard path: non-school email → submit for admin review
        if (typeof turnstile !== "undefined" && turnstileWidgetId !== null) {
            formData.append("cfTurnstileResponse", turnstile.getResponse(turnstileWidgetId));
        }

        try {
            await uploadFormData("/student-verification/register", formData);

            btn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> <span>${t("common.success")}!</span>`;
            btn.classList.remove('bg-gradient-to-r', 'from-primary-container', 'to-secondary');
            btn.classList.add('bg-green-600');

            setTimeout(() => {
                alert(t("student_verify.alert_success_std"));
                window.location.href = "/";
            }, 1500);
        } catch (error) {
            if (typeof turnstile !== "undefined" && turnstileWidgetId !== null) {
                turnstile.reset(turnstileWidgetId);
            }
            const msg = error?.message || "An unexpected error occurred. Please try again.";
            let userMsg = msg;
            if (msg.includes("already verified")) {
                userMsg = t("student_verify.err_already_verified");
            } else if (msg.includes("pending")) {
                userMsg = t("student_verify.err_pending");
            } else if (msg.includes("taken") || msg.includes("student ID has already been")) {
                userMsg = t("student_verify.err_taken");
            } else if (msg.includes("upload")) {
                userMsg = t("student_verify.err_upload");
            } else {
                userMsg = msg;
            }
            alert(`${t("common.error")}: ${userMsg}`);
            btn.innerHTML = originalText;
            btn.classList.remove('opacity-80', 'pointer-events-none');
        }
    });

    function initTurnstile() {
        const container = document.getElementById("turnstile-container");
        if (!container) return;
        if (typeof turnstile === "undefined") {
            setTimeout(initTurnstile, 300);
            return;
        }
        if (turnstileWidgetId !== null) {
            turnstile.remove(turnstileWidgetId);
        }
        turnstileWidgetId = turnstile.render(container, {
            sitekey: TURNSTILE_SITE_KEY,
        });
    }

    function renderStatusBanner(data) {
        const banner = document.getElementById("status-banner");
        if (!banner || !data) return;

        if (data.status === 'approved') {
            banner.classList.remove("hidden");
            banner.innerHTML = `
                <div class="rounded-xl bg-green-50 border border-green-200 p-6 flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-green-600 text-2xl">verified</span>
                    </div>
                    <div>
                        <h3 class="font-headline-md text-headline-md text-green-800">${t("student_verify.status_approved")}</h3>
                        <p class="text-sm text-green-700">${t("student_verify.status_approved_desc", { id: data.verifiedStudentId || '' })}</p>
                    </div>
                </div>
            `;
            document.querySelector('form')?.classList.add('hidden');
        } else if (data.status === 'pending') {
            banner.classList.remove("hidden");
            banner.innerHTML = `
                <div class="rounded-xl bg-yellow-50 border border-yellow-200 p-6 flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-yellow-600 text-2xl">hourglass_top</span>
                    </div>
                    <div>
                        <h3 class="font-headline-md text-headline-md text-yellow-800">${t("student_verify.status_pending")}</h3>
                        <p class="text-sm text-yellow-700">${t("student_verify.status_pending_desc")}</p>
                    </div>
                </div>
            `;
            document.querySelector('form')?.classList.add('hidden');
        } else if (data.status === 'rejected') {
            banner.classList.remove("hidden");
            banner.innerHTML = `
                <div class="rounded-xl bg-red-50 border border-red-200 p-6 flex items-center gap-4">
                    <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-red-600 text-2xl">gpp_bad</span>
                    </div>
                    <div>
                        <h3 class="font-headline-md text-headline-md text-red-800">${t("student_verify.status_rejected")}</h3>
                        <p class="text-sm text-red-700">${data.reviewNote ? t("student_verify.status_rejected_desc", { note: data.reviewNote }) : t("student_verify.status_rejected_fallback")}</p>
                    </div>
                </div>
            `;
        }
    }

    async function checkExistingStatus() {
        try {
            const data = await getMyVerificationStatus();
            cachedStatusData = data;
            if (data?.status === 'approved') {
                try {
                    const meRes = await getCurrentUser();
                    if (meRes?.user) setUser(meRes.user);
                } catch {}
            }
            renderStatusBanner(data);
        } catch (err) {
            console.warn("Check status error:", err);
        }
    }

    window.addEventListener("language-changed", () => {
        applyTranslation();
        if (isSchoolEmailUser) {
            const submitText = document.getElementById('verify-submit-text');
            if (submitText) submitText.textContent = t("student_verify.submit_auto");
            const subtitle = document.getElementById('verify-page-subtitle');
            if (subtitle) subtitle.textContent = t("student_verify.subtitle_auto");
            if (!cachedStatusData || !cachedStatusData.status) {
                renderAutoVerifyBanner();
            }
        }
        if (cachedStatusData) {
            renderStatusBanner(cachedStatusData);
        }
        const frontInput = document.getElementById("studentCardFront");
        const backInput = document.getElementById("studentCardBack");
        if (frontInput && (!frontInput.files || frontInput.files.length === 0)) {
            const frontLabel = document.getElementById("frontLabel");
            if (frontLabel) frontLabel.textContent = t("student_verify.upload_front");
        }
        if (backInput && (!backInput.files || backInput.files.length === 0)) {
            const backLabel = document.getElementById("backLabel");
            if (backLabel) backLabel.textContent = t("student_verify.upload_back");
        }
    });
});
