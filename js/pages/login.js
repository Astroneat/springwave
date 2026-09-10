import "../../src/style.css";
import { login, googleLogin, microsoftLogin, forgotPassword, resetPassword } from "../api/auth.js";
import { createSession, setSigningKey, isAuthenticated } from "../lib/session.js";
import { ensureSession } from "../api/client.js";
import { GOOGLE_CLIENT_ID, MICROSOFT_CLIENT_ID, API_BASE_URL, TURNSTILE_SITE_KEY } from "../config.js";
import { initI18n, getLang, setLang, t, applyTranslation } from "../lib/i18n.js";
import { canPerformAction, markActionPerformed, withSubmitLock } from "../lib/throttle.js";
import { isSchoolEmail } from "../lib/utils.js";

let turnstileWidgetId = null;

document.addEventListener("DOMContentLoaded", async () => {
    if (isAuthenticated()) {
        await ensureSession();
    }
    await initI18n();
    initLanguageSwitcher();
    initLoginForm();
    initGoogleLogin();
    initMicrosoftLogin();
    initTurnstile();
    initPasswordToggles();
    initPasswordResetModals();
});

function initLanguageSwitcher() {
    const btn = document.getElementById("authLangToggleBtn");
    const text = document.getElementById("authLangText");
    if (text) text.textContent = getLang().toUpperCase();

    btn?.addEventListener("click", async () => {
        const nextLang = getLang() === "en" ? "vi" : "en";
        await setLang(nextLang);
        if (text) text.textContent = nextLang.toUpperCase();
    });

    window.addEventListener("language-changed", (e) => {
        const lang = (e.detail?.lang || getLang()).toUpperCase();
        if (text) text.textContent = lang;
        applyTranslation(document);
        document.querySelectorAll(".auth-toggle-btn[data-toggle-target]").forEach((toggleBtn) => {
            const input = document.getElementById(toggleBtn.dataset.toggleTarget);
            if (!input) return;
            const isHidden = input.type === "password";
            toggleBtn.textContent = isHidden ? t("auth.show") : t("auth.hide");
        });
    });
}

function initPasswordToggles() {
    document.querySelectorAll(".auth-toggle-btn[data-toggle-target]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.toggleTarget);
            if (!input) return;
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            btn.setAttribute("aria-pressed", String(isHidden));
            btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
            btn.textContent = isHidden ? t("auth.hide") : t("auth.show");
        });
    });
}

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

async function fetchSigningKey(token) {
    try {
        const resp = await fetch(`${API_BASE_URL}/auth/session/init`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data.signingKey) setSigningKey(data.signingKey);
        }
    } catch (err) {
        console.error("Failed to fetch signing key:", err);
    }
}

function initLoginForm() {
    const form = document.getElementById("login-form");
    const statusMsg = document.getElementById("status-msg");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const check = canPerformAction('login');
        if (!check.allowed) {
            setStatus(t("login.please_wait_throttle", { remaining: check.remaining }, `Please wait ${check.remaining} seconds before trying again.`), true);
            return;
        }
        markActionPerformed('login');
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        setStatus(t("login.logging_in", "Logging in..."), false);
        
        let cfTurnstileResponse = undefined;
        if (typeof turnstile !== "undefined" && turnstileWidgetId !== null) {
            cfTurnstileResponse = turnstile.getResponse(turnstileWidgetId);
        }

        if (!cfTurnstileResponse) {
            setStatus(t("login.complete_captcha", "Please complete the captcha."), true);
            if (typeof turnstile !== "undefined" && turnstileWidgetId !== null) {
                turnstile.reset(turnstileWidgetId);
            }
            return;
        }

        try {
            const data = await login(username, password, cfTurnstileResponse);
            if (!data) return;
            createSession(data.token, data.user);
            if (data.signingKey) {
                setSigningKey(data.signingKey);
            } else {
                await fetchSigningKey(data.token);
            }

            // Check verification status
            if (data.user && !data.user.emailVerified) {
                showVerificationWarning(data.user.email);
            } else {
                setStatus(t("login.login_success", "Logged in successfully! Redirecting..."), false);
                setTimeout(() => { window.location.href = "/index.html"; }, 600);
            }
        } catch(err) {
            if (typeof turnstile !== "undefined" && turnstileWidgetId !== null) {
                turnstile.reset(turnstileWidgetId);
            }
            if(err.status === 401) {
                setStatus(t("login.invalid_credentials", "Invalid credentials"), true);
                return;
            }
            setStatus(err.message, true);
        }
    });

    function setStatus(msg, isError) {
        statusMsg.textContent = msg;
        if(isError) {
            statusMsg.classList.remove("success-msg");
            statusMsg.classList.add("error-msg");
        } else {
            statusMsg.classList.remove("error-msg");
            statusMsg.classList.add("success-msg");
        }
    }

    async function showVerificationWarning(email) {
        const form = document.getElementById("login-form");
        form.innerHTML = `
            <div class="auth-status-panel">
                <div class="auth-status-icon pending">
                    <span class="material-symbols-outlined">mark_email_unread</span>
                </div>
                <h2 class="text-xl font-bold mb-2" style="color: var(--brand);">${t("login.email_not_verified", "Email Not Verified")}</h2>
                <p class="text-sm mb-6" style="color: var(--color-text-secondary);">${t("login.check_email_desc", { email }, `Please check your email (${email}) and click the verification link.`)}</p>
                <button id="resend-btn" type="button" class="auth-submit-btn mb-3">
                    ${t("login.resend_verification", "Resend Verification Email")}
                </button>
                <a href="index.html" class="text-sm font-bold text-center block" style="color: var(--brand);">
                    ${t("login.home", "Back to home")}
                </a>
                <p id="resend-status" class="text-sm mt-3" style="color: var(--color-text-secondary);"></p>
            </div>
        `;
        const baseUrl = API_BASE_URL;
        document.getElementById("resend-btn")?.addEventListener("click", async () => {
            const status = document.getElementById("resend-status");
            const btn = document.getElementById("resend-btn");
            btn.disabled = true;
            btn.textContent = t("login.saving", "Sending...");
            status.textContent = "";
            try {
                const resp = await fetch(baseUrl + "/auth/resend-verification", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                });
                const data = await resp.json();
                if (resp.ok) {
                    status.textContent = data.message || t("login.verification_sent", "Verification email sent!");
                    status.className = "text-sm mt-3 " + (data.emailSent === false ? "text-yellow-600" : "text-green-600");
                } else {
                    status.textContent = data.error || t("login.resend_failed", "Failed to resend.");
                    status.className = "text-sm mt-3 text-red-500";
                }
            } catch {
                status.textContent = t("login.network_error", "Network error. Try again.");
                status.className = "text-sm mt-3 text-red-500";
            }
            btn.disabled = false;
            btn.textContent = t("login.resend_verification", "Resend Verification Email");
        });
    }
}

function initGoogleLogin() {
    const googleBtn = document.getElementById("google-signin-btn");
    if (!googleBtn) return;

    let tokenClient = null;

    const getGoogleTokenClient = () => {
        if (!tokenClient && window.google?.accounts?.oauth2 && GOOGLE_CLIENT_ID) {
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: "openid email profile",
                callback: async (tokenResponse) => {
                    const statusMsg = document.getElementById("status-msg");
                    if (tokenResponse.error) {
                        console.error("Google login error:", tokenResponse);
                        if (tokenResponse.error !== "popup_closed_by_user" && tokenResponse.error !== "access_denied") {
                            statusMsg.textContent = tokenResponse.error_description || "Google sign-in failed";
                            statusMsg.classList.remove("success-msg");
                            statusMsg.classList.add("error-msg");
                        }
                        return;
                    }

                    try {
                        statusMsg.textContent = t("login.signing_in_google", "Signing in with Google...");
                        statusMsg.classList.remove("error-msg");
                        statusMsg.classList.add("success-msg");

                        const data = await googleLogin(undefined, tokenResponse.access_token);

                        createSession(data.token, data.user);
                        if (data.signingKey) {
                            setSigningKey(data.signingKey);
                        } else {
                            await fetchSigningKey(data.token);
                        }

                        if (data.needsProfile) {
                            window.location.href = "/complete-profile.html";
                        } else {
                            window.location.href = "/index.html";
                        }
                    } catch (err) {
                        console.error("Google login failed:", err);
                        statusMsg.textContent = err.message || "Google sign-in failed";
                        statusMsg.classList.remove("success-msg");
                        statusMsg.classList.add("error-msg");
                    }
                },
            });
        }
        return tokenClient;
    };

    googleBtn.addEventListener("click", () => {
        const client = getGoogleTokenClient();
        if (!client) {
            const statusMsg = document.getElementById("status-msg");
            statusMsg.textContent = t("login.loading_sdk", "Loading Google SDK, please try again...");
            statusMsg.classList.remove("success-msg");
            statusMsg.classList.add("error-msg");
            return;
        }
        client.requestAccessToken({ prompt: "select_account" });
    });
}

function initMicrosoftLogin() {
    const msBtn = document.getElementById("microsoft-signin-btn");
    if (!msBtn) return;

    let msalInstance = null;

    const getMsalInstance = () => {
        if (!msalInstance && window.msal && MICROSOFT_CLIENT_ID) {
            const msalConfig = {
                auth: {
                    clientId: MICROSOFT_CLIENT_ID,
                    authority: "https://login.microsoftonline.com/common",
                    redirectUri: window.location.origin,
                },
                cache: {
                    cacheLocation: "sessionStorage",
                    storeAuthStateInCookie: false,
                }
            };
            msalInstance = new window.msal.PublicClientApplication(msalConfig);
        }
        return msalInstance;
    };

    msBtn.addEventListener("click", async () => {
        const statusMsg = document.getElementById("status-msg");
        if (!MICROSOFT_CLIENT_ID) {
            statusMsg.textContent = t("login.ms_no_client_id", "Microsoft Login is not configured with a Client ID.");
            statusMsg.classList.remove("success-msg");
            statusMsg.classList.add("error-msg");
            return;
        }

        const instance = getMsalInstance();
        if (!instance) {
            statusMsg.textContent = t("login.ms_loading_sdk", "Loading Microsoft SDK, please try again in a moment...");
            statusMsg.classList.remove("success-msg");
            statusMsg.classList.add("error-msg");
            return;
        }

        try {
            statusMsg.textContent = "Signing in with Microsoft...";
            statusMsg.classList.remove("error-msg");
            statusMsg.classList.add("success-msg");

            const loginResponse = await instance.loginPopup({
                scopes: ["openid", "profile", "email", "User.Read"],
                prompt: "select_account"
            });

            const accessToken = loginResponse.accessToken;
            if (!accessToken) {
                throw new Error(t("login.ms_no_token", "Did not receive Access Token from Microsoft."));
            }

            const data = await microsoftLogin(accessToken);

            createSession(data.token, data.user);
            if (data.signingKey) {
                setSigningKey(data.signingKey);
            } else {
                await fetchSigningKey(data.token);
            }

            if (data.needsProfile) {
                window.location.href = "/complete-profile.html";
            } else {
                window.location.href = "/index.html";
            }
        } catch (err) {
            console.error("Microsoft login failed:", err);
            if (err?.errorCode === "user_cancelled" || err?.message?.includes("user_cancelled")) {
                statusMsg.textContent = "";
                statusMsg.classList.remove("error-msg", "success-msg");
                return;
            }
            statusMsg.textContent = err.message || "Microsoft sign-in failed";
            statusMsg.classList.remove("success-msg");
            statusMsg.classList.add("error-msg");
        }
    });
}

function initPasswordResetModals() {
    const openForgotBtn = document.getElementById("open-forgot-modal");
    const closeForgotBtn = document.getElementById("close-forgot-modal");
    const forgotModal = document.getElementById("forgot-password-modal");
    const forgotForm = document.getElementById("forgot-password-form");
    const forgotStatus = document.getElementById("forgot-status-msg");
    const forgotSubmitBtn = document.getElementById("forgot-submit-btn");

    const closeResetBtn = document.getElementById("close-reset-modal");
    const resetModal = document.getElementById("reset-password-modal");
    const resetForm = document.getElementById("reset-password-form");
    const resetStatus = document.getElementById("reset-status-msg");
    const resetSubmitBtn = document.getElementById("reset-submit-btn");

    if (openForgotBtn && forgotModal) {
        openForgotBtn.addEventListener("click", () => {
            forgotModal.classList.remove("hidden");
            if (forgotStatus) forgotStatus.classList.add("hidden");
        });
    }

    if (closeForgotBtn && forgotModal) {
        closeForgotBtn.addEventListener("click", () => {
            forgotModal.classList.add("hidden");
        });
    }

    if (closeResetBtn && resetModal) {
        closeResetBtn.addEventListener("click", () => {
            resetModal.classList.add("hidden");
        });
    }

    if (forgotForm) {
        forgotForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = document.getElementById("forgot-email")?.value.trim();
            if (!email) return;

            if (forgotSubmitBtn) forgotSubmitBtn.disabled = true;
            if (forgotStatus) {
                forgotStatus.textContent = t("login.sending_request", "Sending request...");
                forgotStatus.className = "text-xs rounded-xl p-3 bg-blue-50 text-blue-700 block";
            }

            try {
                const res = await forgotPassword(email);
                if (forgotStatus) {
                    forgotStatus.textContent = res.message || t("login.reset_link_sent", "Password reset link has been sent to your email.");
                    forgotStatus.className = "text-xs rounded-xl p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 block";
                }
            } catch (err) {
                if (forgotStatus) {
                    forgotStatus.textContent = err.message || t("login.request_failed", "Request failed. Please try again.");
                    forgotStatus.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
                }
            } finally {
                if (forgotSubmitBtn) forgotSubmitBtn.disabled = false;
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get("action");
    const token = urlParams.get("token");

    if (action === "reset-password" && token && resetModal) {
        resetModal.classList.remove("hidden");
        if (resetForm) {
            resetForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                const newPass = document.getElementById("reset-new-password")?.value;
                const confirmPass = document.getElementById("reset-confirm-password")?.value;

                if (!newPass || !confirmPass) return;
                if (newPass !== confirmPass) {
                    if (resetStatus) {
                        resetStatus.textContent = t("login.passwords_dont_match", "Passwords do not match.");
                        resetStatus.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
                    }
                    return;
                }

                if (resetSubmitBtn) resetSubmitBtn.disabled = true;
                if (resetStatus) {
                    resetStatus.textContent = t("login.password_updating", "Updating new password...");
                    resetStatus.className = "text-xs rounded-xl p-3 bg-blue-50 text-blue-700 block";
                }

                try {
                    const res = await resetPassword(token, newPass, confirmPass);
                    if (resetStatus) {
                        resetStatus.textContent = res.message || t("login.password_updated_success", "Password updated successfully!");
                        resetStatus.className = "text-xs rounded-xl p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 block";
                    }
                    setTimeout(() => {
                        window.location.href = "/login.html";
                    }, 1500);
                } catch (err) {
                    if (resetStatus) {
                        resetStatus.textContent = err.message || t("login.password_reset_failed", "Password reset failed. The link or token may have expired.");
                        resetStatus.className = "text-xs rounded-xl p-3 bg-rose-50 text-rose-700 border border-rose-200 block";
                    }
                } finally {
                    if (resetSubmitBtn) resetSubmitBtn.disabled = false;
                }
            });
        }
    }
}
