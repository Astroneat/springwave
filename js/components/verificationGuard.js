import { getUser, isAuthenticated, isProfileComplete } from '../lib/session.js';
import { isUserVerifiedOrExempt } from '../lib/utils.js';
import { t } from '../lib/i18n.js';

let verificationModalOpen = false;

/**
 * Initialize verification guard for read-only mode and action blurring
 */
export async function initVerificationGuard() {
    if (!isAuthenticated()) return;

    // Reset dismissed states on landing page loads
    const path = window.location.pathname.toLowerCase();
    const isLandingPage = path === "/" || path === "/index.html" || path.endsWith("/index.html");
    if (isLandingPage) {
        sessionStorage.removeItem('springwave_read_only_banner_dismissed');
        sessionStorage.removeItem('springwave_profile_banner_dismissed');
    }

    let user = getUser();

    // Double-check with backend (/auth/me) if local state claims unverified, in case verification was recently completed
    try {
        const { getCurrentUser } = await import('../api/auth.js');
        const { setUser } = await import('../lib/session.js');
        const res = await getCurrentUser();
        if (res?.user) {
            setUser(res.user);
            user = res.user;
        }
    } catch (e) {}

    const needsVerification = !isUserVerifiedOrExempt(user);
    const needsProfileComplete = !isProfileComplete(user);

    if (!needsVerification && !needsProfileComplete) return;

    // Show floating notifications in the bottom-left corner
    showFloatingWarnings(needsVerification, needsProfileComplete);

    // Apply blur and click handlers to elements requiring verification (only if verification is missing)
    if (needsVerification) {
        applyVerificationBlur();

        // Observe DOM mutations to blur dynamically added elements (e.g. popups, list items)
        const observer = new MutationObserver(() => {
            applyVerificationBlur();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }
}

/**
 * Render floating glassmorphism popups at bottom-left corner
 */
export function showFloatingWarnings(needsVerification, needsProfileComplete) {
    const verificationDismissed = sessionStorage.getItem('springwave_read_only_banner_dismissed');
    const profileDismissed = sessionStorage.getItem('springwave_profile_banner_dismissed');

    if ((!needsVerification || verificationDismissed) && (!needsProfileComplete || profileDismissed)) {
        return;
    }

    // Get or create floating container in the bottom-left corner
    let container = document.getElementById('floating-notice-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'floating-notice-container';
        container.className = 'fixed bottom-6 left-6 z-[60] flex flex-col gap-3 max-w-sm w-[calc(100vw-96px)] sm:w-[360px] pointer-events-none';
        document.body.appendChild(container);
    }

    // 1. Profile Completion Warning Card
    if (needsProfileComplete && !profileDismissed && !document.getElementById('profile-complete-banner')) {
        const profileTitle = t('verification.profile_banner_title', 'Profile Incomplete');
        const profileDesc = t('verification.profile_banner_desc', 'Complete your profile (DOB, class, major, phone) to register.');
        const profileBtn = t('verification.profile_btn', 'Complete Now');

        const card = document.createElement('div');
        card.id = 'profile-complete-banner';
        card.className = 'pointer-events-auto relative p-4 rounded-2xl bg-white/95 border border-indigo-500/30 backdrop-blur-md shadow-xl flex gap-3 transform translate-y-0 opacity-100 transition-all duration-300';
        
        card.innerHTML = `
            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[24px]">contact_page</span>
            </div>
            <div class="pr-6 text-left">
                <h4 class="text-sm font-bold text-indigo-950 leading-tight">${profileTitle}</h4>
                <p class="text-xs text-indigo-800/80 font-medium leading-relaxed mt-1">${profileDesc}</p>
                <div class="mt-3 flex gap-2">
                    <a href="/profile.html" class="py-1.5 px-3 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white font-bold text-[11px] shadow-sm transition-all whitespace-nowrap">
                        ${profileBtn}
                    </a>
                </div>
            </div>
            <button type="button" id="dismiss-profile-banner" class="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" aria-label="Dismiss">
                <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
        `;

        card.querySelector('#dismiss-profile-banner').addEventListener('click', () => {
            sessionStorage.setItem('springwave_profile_banner_dismissed', 'true');
            card.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => {
                card.remove();
                checkEmptyContainer(container);
            }, 300);
        });

        container.appendChild(card);
    }

    // 2. Student Verification Warning Card
    if (needsVerification && !verificationDismissed && !document.getElementById('read-only-banner')) {
        const verifyTitle = t('verification.readonly_banner_title', 'Read-Only Mode Active');
        const verifyDesc = t('verification.readonly_banner_desc', 'Verify student status to unlock full access.');
        const verifyBtn = t('verification.modal_verify_btn', 'Verify Now');

        const card = document.createElement('div');
        card.id = 'read-only-banner';
        card.className = 'pointer-events-auto relative p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xl flex gap-3 transform translate-y-0 opacity-100 transition-all duration-300';
        
        card.innerHTML = `
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[24px]">shield_person</span>
            </div>
            <div class="pr-6 text-left">
                <h4 class="text-sm font-bold text-slate-900 leading-tight">${verifyTitle}</h4>
                <p class="text-xs text-slate-600 font-medium leading-relaxed mt-1">${verifyDesc}</p>
                <div class="mt-3 flex gap-2">
                    <a href="/student-verify.html" class="py-1.5 px-3.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-[11px] shadow-sm transition-all whitespace-nowrap">
                        ${verifyBtn}
                    </a>
                </div>
            </div>
            <button type="button" id="dismiss-readonly-banner" class="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" aria-label="Dismiss">
                <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
        `;

        card.querySelector('#dismiss-readonly-banner').addEventListener('click', () => {
            sessionStorage.setItem('springwave_read_only_banner_dismissed', 'true');
            card.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => {
                card.remove();
                checkEmptyContainer(container);
            }, 300);
        });

        container.appendChild(card);
    }
}

function checkEmptyContainer(container) {
    if (container && container.children.length === 0) {
        container.remove();
    }
}

/**
 * Legacy compatibility stub
 */
export function showReadOnlyNoticeBanner() {
    showFloatingWarnings(true, false);
}

/**
 * Apply blur class and click interceptor to protected elements
 */
export function applyVerificationBlur() {
    const selector = '[data-requires-verified], .requires-verification, #participate-btn, .participate-btn';
    const protectedElements = document.querySelectorAll(selector);

    protectedElements.forEach(el => {
        if (el.dataset.guardApplied) return;
        el.dataset.guardApplied = 'true';

        // Add blur style class
        el.classList.add('verification-blur-target');

        // Capture click event to prevent action and show modal
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const action = el.dataset.actionName || 'perform this action';
            showVerificationModal(action);
            return false;
        }, true);
    });
}

/**
 * Display the glassmorphism verification prompt modal
 * @param {string} [actionName] - Action description
 */
export function showVerificationModal(actionName) {
    if (verificationModalOpen) return;
    verificationModalOpen = true;

    let overlay = document.getElementById('verification-guard-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'verification-guard-modal';
        overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-opacity duration-300 opacity-0';
        
        const titleText = t('verification.modal_title', 'Student Verification Required');
        const descText = t('verification.modal_desc', 'You are currently in Read-Only mode. Please verify your student status to participate in events and join communities.');
        const verifyBtnText = t('verification.modal_verify_btn', 'Verify Now');
        const cancelBtnText = t('verification.modal_cancel_btn', 'Explore More');

        overlay.innerHTML = `
            <div class="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-3xl shadow-2xl p-8 max-w-md w-full text-center relative overflow-hidden transform scale-95 transition-transform duration-300">
                <!-- Background ambient glow -->
                <div class="absolute -top-20 -left-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div class="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div class="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-5 shadow-inner">
                    <span class="material-symbols-outlined text-[36px]">shield_person</span>
                </div>

                <h3 class="text-2xl font-bold text-slate-900 mb-2 font-headline">${titleText}</h3>
                <p class="text-sm text-slate-600 mb-6 leading-relaxed">${descText}</p>

                <div class="flex flex-col gap-3">
                    <a href="/student-verify.html" class="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-[20px]">verified</span>
                        <span>${verifyBtnText}</span>
                    </a>
                    <button type="button" id="close-verification-modal-btn" class="w-full py-3 px-6 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-colors cursor-pointer">
                        ${cancelBtnText}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('#close-verification-modal-btn');
        closeBtn.addEventListener('click', closeVerificationModal);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeVerificationModal();
        });

        const onEsc = (e) => {
            if (e.key === 'Escape') {
                closeVerificationModal();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    // Trigger animation
    requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        const inner = overlay.firstElementChild;
        if (inner) inner.classList.remove('scale-95');
    });
}

export function closeVerificationModal() {
    const overlay = document.getElementById('verification-guard-modal');
    if (!overlay) return;

    overlay.classList.add('opacity-0');
    const inner = overlay.firstElementChild;
    if (inner) inner.classList.add('scale-95');

    setTimeout(() => {
        overlay.remove();
        verificationModalOpen = false;
    }, 300);
}

if (typeof window !== "undefined") {
    window.addEventListener("language-changed", () => {
        const profileCard = document.getElementById("profile-complete-banner");
        if (profileCard) {
            const h4 = profileCard.querySelector("h4");
            const p = profileCard.querySelector("p");
            const btn = profileCard.querySelector("a");
            if (h4) h4.textContent = t('verification.profile_banner_title', 'Profile Incomplete');
            if (p) p.textContent = t('verification.profile_banner_desc', 'Complete your profile (DOB, class, major, phone) to register.');
            if (btn) btn.textContent = t('verification.profile_btn', 'Complete Now');
        }
        const readonlyCard = document.getElementById("read-only-banner");
        if (readonlyCard) {
            const h4 = readonlyCard.querySelector("h4");
            const p = readonlyCard.querySelector("p");
            const btn = readonlyCard.querySelector("a");
            if (h4) h4.textContent = t('verification.readonly_banner_title', 'Student Verification Required');
            if (p) p.textContent = t('verification.readonly_banner_desc', 'Verify your student status to participate in activities.');
            if (btn) btn.textContent = t('verification.modal_verify_btn', 'Verify Now');
        }
        const modal = document.getElementById("verification-guard-modal");
        if (modal) {
            const h3 = modal.querySelector("h3");
            const p = modal.querySelector("p");
            const verifyLink = modal.querySelector("a span:last-child");
            const cancelBtn = modal.querySelector("#close-verification-modal-btn");
            if (h3) h3.textContent = t('verification.modal_title', 'Student Verification Required');
            if (p) p.textContent = t('verification.modal_desc', 'You are currently in Read-Only mode. Please verify your student status to participate in events and join communities.');
            if (verifyLink) verifyLink.textContent = t('verification.modal_verify_btn', 'Verify Now');
            if (cancelBtn) cancelBtn.textContent = t('verification.modal_cancel_btn', 'Explore More');
        }
    });
}
