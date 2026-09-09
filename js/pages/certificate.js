import "../../src/style.css";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { API_BASE_URL, CDN_DOMAIN, TURNSTILE_SITE_KEY } from "../config.js";
import { verifyCertificate } from "../api/certificates.js";
import { initI18n, t, getLang, setLang, applyTranslation } from "../lib/i18n.js";
import { formatDate, toTitleCase } from "../lib/utils.js";
import { drawStyledQR } from "../lib/qr-styler.js";
import { getUser, isAuthenticated } from "../lib/session.js";
import { createDiscussionWithScope } from "../api/forum.js";

export function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }
  if (trimmed.startsWith("/uploads/")) {
    return `${API_BASE_URL}${trimmed}`;
  }
  return `${CDN_DOMAIN}/${trimmed.replace(/^\/+/, "")}`;
}

let cachedBgResult = null;

async function loadCrossOriginImage(url) {
  if (!url) return null;
  const resolved = resolveMediaUrl(url);

  // 0. If already blob: or data:, load into Image directly
  if (resolved.startsWith("blob:") || resolved.startsWith("data:")) {
    try {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = resolved;
      });
      return { img, objectUrl: null };
    } catch (e) {
      return null;
    }
  }

  // Strategy 1: Local / Vite / Vercel proxy (/cdn-proxy) for CDN assets
  if (resolved.includes("cdn.springwave.io.vn") || (CDN_DOMAIN && resolved.startsWith(CDN_DOMAIN))) {
    try {
      let pathPart = "";
      if (CDN_DOMAIN && resolved.startsWith(CDN_DOMAIN)) {
        pathPart = resolved.slice(CDN_DOMAIN.length).replace(/^\/+/, "");
      } else {
        const idx = resolved.indexOf("cdn.springwave.io.vn");
        pathPart = resolved.slice(idx + "cdn.springwave.io.vn".length).replace(/^\/+/, "");
      }
      const proxyUrl = `/cdn-proxy/${pathPart}`;
      const resp = await fetch(proxyUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = objectUrl;
        });
        return { img, objectUrl };
      }
    } catch (err) {
      console.warn("Local /cdn-proxy fetch failed, trying next strategy:", err);
    }
  }

  // Strategy 2: High-speed global image cache & proxy (images.weserv.nl)
  // Strips CORS restrictions and returns Access-Control-Allow-Origin: *
  try {
    const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(resolved)}`;
    const resp = await fetch(weservUrl);
    if (resp.ok) {
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = objectUrl;
      });
      return { img, objectUrl };
    }
  } catch (err) {
    console.warn("Public weserv proxy failed, trying next strategy:", err);
  }

  // Strategy 3: Direct CORS fetch as blob -> ObjectURL
  try {
    const resp = await fetch(resolved, { mode: "cors" });
    if (resp.ok) {
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = objectUrl;
      });
      return { img, objectUrl };
    }
  } catch (err) {
    console.warn("Direct CORS fetch failed:", err);
  }

  // Strategy 4: allorigins.win CORS proxy
  try {
    const allOriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(resolved)}`;
    const resp = await fetch(allOriginsUrl);
    if (resp.ok) {
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = objectUrl;
      });
      return { img, objectUrl };
    }
  } catch (err) {
    console.warn("AllOrigins proxy failed:", err);
  }

  // Strategy 5: Image with crossOrigin = 'anonymous' and cache buster
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const cacheBusted = resolved.includes("?") ? `${resolved}&_cb=${Date.now()}` : `${resolved}?_cb=${Date.now()}`;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = cacheBusted;
    });
    return { img, objectUrl: null };
  } catch (err) {
    console.warn("Cache-busted Image load failed:", err);
  }

  // Strategy 6: Image with crossOrigin without cache buster
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = resolved;
    });
    return { img, objectUrl: null };
  } catch (err) {
    console.error("All image load attempts failed for background:", err);
    return null;
  }
}


let currentCertData = null;
let currentCertStatus = 'active';

export function checkCertificateOwnership(cert) {
  const currentUser = getUser();
  const certUser = cert?.user;
  const certUserId = certUser?._id ? String(certUser._id) : (certUser ? String(certUser) : null);
  const currentUserId = currentUser?._id ? String(currentUser._id) : (currentUser?.id ? String(currentUser.id) : null);

  const isLoggedIn = isAuthenticated() && Boolean(currentUser);
  const isOwner = Boolean(isLoggedIn && currentUserId && certUserId && currentUserId === certUserId);

  return {
    isOwner,
    isLoggedIn,
    currentUser,
    certUser,
    certUserId,
    currentUserId,
  };
}

let certToastTimer = null;
export function showCertToast(msg, isError = false) {
  const toast = document.getElementById("cert-toast");
  const msgEl = document.getElementById("cert-toast-msg");
  const iconEl = document.getElementById("cert-toast-icon");
  if (!toast || !msgEl) return;

  if (certToastTimer) clearTimeout(certToastTimer);

  msgEl.textContent = msg;
  if (isError) {
    if (iconEl) {
      iconEl.className = "w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0";
      iconEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
    }
  } else {
    if (iconEl) {
      iconEl.className = "w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0";
      iconEl.innerHTML = `<i class="fa-solid fa-check"></i>`;
    }
  }

  toast.classList.remove("opacity-0", "translate-y-10", "pointer-events-none");
  toast.classList.add("opacity-100", "translate-y-0");

  certToastTimer = setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "translate-y-10", "pointer-events-none");
  }, 3500);
}

function openModalElement(overlay, content) {
  if (!overlay || !content) return;
  overlay.classList.remove("hidden");
  requestAnimationFrame(() => {
    overlay.classList.remove("opacity-0");
    overlay.classList.add("opacity-100");
    content.classList.remove("scale-95", "opacity-0");
    content.classList.add("scale-100", "opacity-100");
  });
  document.body.style.overflow = "hidden";
}

function closeModalElement(overlay, content) {
  if (!overlay || !content) return;
  content.classList.remove("scale-100", "opacity-100");
  content.classList.add("scale-95", "opacity-0");
  overlay.classList.remove("opacity-100");
  overlay.classList.add("opacity-0");
  setTimeout(() => {
    overlay.classList.add("hidden");
    document.body.style.overflow = "";
  }, 200);
}

function generateShareDraft(cert, lang = getLang()) {
  const eventTitle = cert?.metadata?.eventTitle || cert?.event?.title || "Sự kiện";
  const orgName = cert?.metadata?.orgName || cert?.organization?.name || "SpringWave";
  const certCode = cert?.certificateCode || "SW-CODE";
  const verifyUrl = `${window.location.origin}/certificate.html?code=${encodeURIComponent(certCode)}`;

  if (lang === "vi") {
    return {
      title: `🎉 Mình vừa nhận được Chứng chỉ hoàn thành sự kiện: ${eventTitle}!`,
      content: `Rất tự hào chia sẻ cùng mọi người: Mình đã hoàn thành xuất sắc sự kiện "${eventTitle}" do ${orgName} tổ chức và vinh dự được cấp Giấy chứng nhận hoàn thành! 🏆\n\n📜 Mã chứng nhận: ${certCode}\n🔗 Tra cứu & Xác thực trực tiếp: ${verifyUrl}\n\nCảm ơn Ban tổ chức và các bạn đã đồng hành cùng mình trong suốt hoạt động! 🚀`,
      tags: "Certificate, Achievement, SpringWave",
    };
  } else {
    return {
      title: `🎉 I just received my Certificate of Completion for: ${eventTitle}!`,
      content: `Proud to share with everyone: I have successfully completed "${eventTitle}" organized by ${orgName} and received my official Certificate of Completion! 🏆\n\n📜 Certificate ID: ${certCode}\n🔗 Verify online at: ${verifyUrl}\n\nThank you to the organizing committee and fellow participants for an amazing journey! 🚀`,
      tags: "Certificate, Achievement, SpringWave",
    };
  }
}

// Format date according to active language
function formatCertDate(dateValue, lang = getLang()) {
  const d = new Date(dateValue || Date.now());
  if (isNaN(d.getTime())) return String(dateValue || '');

  const day = String(d.getDate()).padStart(2, '0');
  const monthNum = d.getMonth() + 1;
  const year = d.getFullYear();

  if (lang === 'vi') {
    return `Cấp ngày: ${day} tháng ${String(monthNum).padStart(2, '0')} năm ${year}`;
  } else {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `Issued on: ${monthNames[d.getMonth()]} ${d.getDate()}, ${year}`;
  }
}

// Update text according to active language and data
function renderDynamicTexts() {
  if (!currentCertData) return;

  const lang = getLang();
  const cert = currentCertData;
  const isRevoked = currentCertStatus === 'revoked' || cert.status === 'revoked';

  // Language Toggle Button Text
  const langTextEl = document.getElementById("current-lang-text");
  if (langTextEl) langTextEl.textContent = lang.toUpperCase();

  // Date formatting
  const eventDate = cert.metadata?.eventDate || cert.event?.heldDate || cert.createdAt;
  const dateEl = document.getElementById("cert-date");
  if (dateEl) {
    dateEl.textContent = formatCertDate(eventDate, lang);
  }
  const customDateEl = document.getElementById("cert-custom-date");
  if (customDateEl) {
    customDateEl.textContent = formatCertDate(eventDate, lang);
  }

  // Revocation text
  if (isRevoked) {
    const revokedDetails = document.getElementById("cert-revoked-details");
    const dateFormatted = cert.revokedAt ? formatCertDate(cert.revokedAt, lang) : "";
    const reasonText = cert.revocationReason || (lang === 'vi' ? 'Thu hồi bởi Ban tổ chức' : 'Revoked by organizer');
    
    if (revokedDetails) {
      revokedDetails.textContent = t("certificate_view.revoked_desc", {
        date: dateFormatted,
        reason: reasonText,
      });
    }

    const badgeStatus = document.getElementById("cert-badge-status");
    if (badgeStatus) {
      badgeStatus.className = "flex items-center gap-1.5 text-[11px] text-red-600 font-bold mt-1";
      badgeStatus.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="display: inline-block; vertical-align: middle; width: 14px; height: 14px; min-width: 14px; min-height: 14px; flex-shrink: 0;">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
        </svg>
        <span id="cert-badge-status-text">${t("certificate_view.revoked_badge")}</span>
      `;
    }
  } else {
    const badgeStatus = document.getElementById("cert-badge-status");
    if (badgeStatus) {
      badgeStatus.className = "flex items-center gap-1.5 text-[11px] text-emerald-600 font-semibold mt-1";
      badgeStatus.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="display: inline-block; vertical-align: middle; width: 14px; height: 14px; min-width: 14px; min-height: 14px; flex-shrink: 0;">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
        </svg>
        <span id="cert-badge-status-text">${t("certificate_view.verified_badge")}</span>
      `;
    }
  }

  applyTranslation();
}

// Responsive scale calculation for certificate viewport (fits both width and height)
function updateCertScale() {
  const wrapper = document.querySelector(".cert-scale-wrapper");
  const certNode = document.getElementById("certificate-node");
  const container = document.getElementById("cert-container");
  if (!wrapper || !certNode) return;

  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  const headerH = header ? header.offsetHeight : 60;
  const footerH = footer ? footer.offsetHeight : 32;

  // Compute available space inside the viewport
  const padX = 32;
  const padY = 24;
  const availW = Math.max(320, window.innerWidth - padX);
  const availH = Math.max(260, window.innerHeight - headerH - footerH - padY);

  const certW = 1200;
  const certH = certNode.offsetHeight || 750;

  // Optimal scale: fit both width and height cleanly
  const scaleW = availW / certW;
  const scaleH = availH / certH;
  // Allow proportional scaling to fit screen beautifully (up to 1.35x on wide screens)
  const maxScale = Math.min(1.35, Math.max(1, (window.innerWidth - 64) / 1200));
  const scale = Math.min(scaleW, scaleH, maxScale);

  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.transformOrigin = "center center";

  const scaledWidth = Math.round(certW * scale);
  const scaledHeight = Math.round(certH * scale);

  wrapper.style.width = `${certW}px`;
  wrapper.style.height = `${certH}px`;
  wrapper.style.marginBottom = "0px";

  if (container) {
    container.style.width = `${scaledWidth}px`;
    container.style.height = `${scaledHeight}px`;
  }
}

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("code")?.trim();

  const loadingEl = document.getElementById("cert-loading");
  const errorEl = document.getElementById("cert-error");
  const errorMsgEl = document.getElementById("cert-error-msg");
  const containerEl = document.getElementById("cert-container");

  if (!code) {
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
    if (errorMsgEl) errorMsgEl.textContent = t("certificate_view.not_found_desc");
    return;
  }

  try {
    const res = await verifyCertificate(code);
    const cert = res.certificate;

    if (!cert) {
      loadingEl.classList.add("hidden");
      errorEl.classList.remove("hidden");
      return;
    }

    currentCertData = cert;
    currentCertStatus = res.status || cert.status;

    await setupCertificateDOM(cert, currentCertStatus);
    renderDynamicTexts();
    updateCertScale();

    loadingEl.classList.add("hidden");
    containerEl.classList.remove("hidden");
  } catch (err) {
    console.error("Certificate verify error:", err);
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
    if (errorMsgEl) errorMsgEl.textContent = err.message || t("certificate_view.not_found_desc");
  }

  initActionButtons();
  window.addEventListener("resize", updateCertScale);
  window.addEventListener("orientationchange", updateCertScale);
});

// Listen for global language changes
window.addEventListener("language-changed", () => {
  renderDynamicTexts();
});

// Calculate perceived luminance of custom background to automatically switch text contrast
async function detectBackgroundTheme(imageUrl) {
  if (!imageUrl || imageUrl.trim() === '') {
    return 'light';
  }

  try {
    const bgRes = cachedBgResult || await loadCrossOriginImage(imageUrl);
    if (bgRes && bgRes.img) {
      const img = bgRes.img;
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 64, 64);
      const imageData = ctx.getImageData(0, 0, 64, 64);
      const data = imageData.data;
      let totalLuminance = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a > 40) {
          // Perceived luminance formula (ITU-R BT.709 standard)
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          totalLuminance += lum;
          count++;
        }
      }
      const avgLum = count > 0 ? totalLuminance / count : 128;
      return avgLum < 215 ? 'dark' : 'light';
    }
  } catch (err) {
    console.warn("Theme detection error:", err);
  }

  return 'dark';
}

async function setupCertificateDOM(cert, status) {
  cachedBgResult = null;
  const isRevoked = status === 'revoked' || cert.status === 'revoked';
  const userName = toTitleCase(cert.metadata?.userName || cert.user?.fullname || "Attendee");
  const eventTitle = cert.metadata?.eventTitle || cert.event?.title || "Event / Activity";
  const orgName = cert.metadata?.orgName || cert.organization?.name || "SpringWave Organization";
  const certCode = cert.certificateCode || "SW-CODE";
  const bgUrl = cert.metadata?.customBackground || cert.event?.certificateBackground;

  // 1. Check if Certificate has custom Canva config
  const certConfig = cert.metadata?.certificateConfig || cert.event?.certificateConfig;
  const isCustomCanva = certConfig && certConfig.isCustom && certConfig.fields;

  const certNode = document.getElementById("certificate-node");
  const watermark = document.getElementById("cert-watermark");
  const classicDecorations = document.getElementById("cert-classic-decorations");
  const classicBody = document.getElementById("cert-classic-body");
  const customOverlay = document.getElementById("cert-custom-overlay");

  if (isCustomCanva) {
    // Hide classic elements
    if (classicDecorations) classicDecorations.classList.add("hidden");
    if (classicBody) classicBody.classList.add("hidden");
    if (watermark) watermark.style.display = "none";

    // Set full-bleed background without outer border
    certNode.style.border = "none";
    certNode.style.padding = "0";
    const certBgImg = document.getElementById("cert-custom-bg-img");
    if (bgUrl && bgUrl.trim() !== "") {
      const resolvedBg = resolveMediaUrl(bgUrl);

      const applyDimensions = (w, h) => {
        if (w > 0 && h > 0) {
          const aspect = w / h;
          const targetHeight = Math.round(1200 / aspect);
          certNode.style.width = "1200px";
          certNode.style.height = `${targetHeight}px`;
          document.documentElement.style.setProperty("--cert-height", `${targetHeight}px`);
          updateCertScale();
        }
      };

      if (certBgImg) {
        certBgImg.onload = () => {
          applyDimensions(certBgImg.naturalWidth, certBgImg.naturalHeight);
        };
        certBgImg.src = resolvedBg;
        certBgImg.classList.remove("hidden");
        if (certBgImg.complete && certBgImg.naturalWidth > 0) {
          applyDimensions(certBgImg.naturalWidth, certBgImg.naturalHeight);
        }
      }

      // Preload background via 5-layer CORS loader to populate cache and swap certBgImg.src with clean blob URL
      loadCrossOriginImage(bgUrl).then((bgRes) => {
        if (bgRes && bgRes.img) {
          cachedBgResult = bgRes;
          applyDimensions(bgRes.img.naturalWidth, bgRes.img.naturalHeight);
          if (certBgImg && bgRes.objectUrl) {
            certBgImg.src = bgRes.objectUrl;
          }
        }
      });

      // Preload with standard Image object without crossOrigin to wait for dimension resolution
      try {
        const preloader = new Image();
        await new Promise((resolve) => {
          preloader.onload = () => {
            applyDimensions(preloader.naturalWidth, preloader.naturalHeight);
            resolve();
          };
          preloader.onerror = () => resolve();
          preloader.src = resolvedBg;
          if (preloader.complete && preloader.naturalWidth > 0) {
            applyDimensions(preloader.naturalWidth, preloader.naturalHeight);
            resolve();
          }
        });
      } catch (e) {
        console.warn("Preloader error:", e);
      }

      certNode.style.backgroundImage = "none";
      certNode.style.backgroundColor = "#0f172a";
    } else {
      if (certBgImg) certBgImg.classList.add("hidden");
      certNode.style.width = "1200px";
      certNode.style.height = "850px";
      certNode.style.backgroundImage = "none";
      certNode.style.backgroundColor = "#faf9f6";
      document.documentElement.style.setProperty("--cert-height", "850px");
    }

    // Render dynamic custom overlay fields
    if (customOverlay) {
      customOverlay.classList.remove("hidden");
      customOverlay.innerHTML = "";

      const verifyUrl = `${window.location.origin}/certificate.html?code=${encodeURIComponent(certCode)}`;

      Object.entries(certConfig.fields).forEach(([key, field]) => {
        if (!field || field.enabled === false) return;

        const align = field.align || "center";
        let translateX = "-50%";
        if (align === "left") translateX = "0%";
        else if (align === "right") translateX = "-100%";

        const fieldWrapper = document.createElement("div");
        fieldWrapper.className = "absolute";
        fieldWrapper.style.left = `${field.x}%`;
        fieldWrapper.style.top = `${field.y}%`;

        if (key === "qrCode") {
          const sz = field.size || 80;
          fieldWrapper.style.width = `${sz}px`;
          fieldWrapper.style.height = `${sz}px`;
          fieldWrapper.style.transform = "translate(-50%, -50%)";
          fieldWrapper.className += " flex items-center justify-center";

          const qrCanvas = document.createElement("canvas");
          fieldWrapper.appendChild(qrCanvas);

          drawStyledQR(qrCanvas, verifyUrl, {
            size: sz,
            style: field.qrStyle || "standard",
            frame: field.qrFrame || "box",
            colorDark: field.qrColorDark || "#0f172a",
            colorLight: field.qrColorLight || "#ffffff",
            transparentBg: !!field.qrTransparentBg,
            borderColor: field.qrBorderColor || "#cbd5e1",
            borderWidth: field.qrBorderWidth || 1,
            borderRadius: field.qrRadius || 8,
          });
        } else {
          let family = field.fontFamily || "Playfair Display";
          if (family === "Cinzel") family = "Lora";
          fieldWrapper.style.transform = `translate(${translateX}, -50%)`;
          fieldWrapper.style.fontFamily = `'${family}', sans-serif`;
          fieldWrapper.style.fontSize = `${field.fontSize || 16}px`;
          fieldWrapper.style.fontWeight = field.fontWeight || "700";
          fieldWrapper.style.color = field.color || "#0f172a";
          fieldWrapper.style.textAlign = align;
          if (key === "userName" || key === "certCode" || key === "issueDate") {
            fieldWrapper.style.whiteSpace = "nowrap";
          } else {
            fieldWrapper.style.whiteSpace = "pre-line";
            fieldWrapper.style.wordBreak = "break-word";
          }
          fieldWrapper.style.maxWidth = "900px";

          if (field.letterSpacing) {
            fieldWrapper.style.letterSpacing = `${field.letterSpacing}px`;
          }
          if (field.uppercase) {
            fieldWrapper.style.textTransform = "uppercase";
          }

          const eventDate = cert.metadata?.eventDate || cert.event?.heldDate || cert.createdAt;
          const isCustomText = key.startsWith("custom") || field.isCustomText || field.type === "customText";

          if (key === "userName") {
            fieldWrapper.textContent = userName;
          } else if (key === "certCode") {
            fieldWrapper.textContent = certCode;
            fieldWrapper.id = "cert-custom-code";
          } else if (key === "issueDate") {
            fieldWrapper.textContent = formatCertDate(eventDate, getLang());
            fieldWrapper.id = "cert-custom-date";
          } else if (key === "eventTitle") {
            fieldWrapper.textContent = eventTitle;
          } else if (isCustomText) {
            let val = field.text || "";
            val = val
              .replace(/\{\{fullName\}\}/g, userName)
              .replace(/\{\{eventTitle\}\}/g, eventTitle)
              .replace(/\{\{issueDate\}\}/g, formatCertDate(eventDate, getLang()))
              .replace(/\{\{certificateCode\}\}/g, certCode);
            fieldWrapper.textContent = val;
          }
        }

        customOverlay.appendChild(fieldWrapper);
      });
    }
  } else {
    // Classic legacy layout
    if (classicDecorations) classicDecorations.classList.remove("hidden");
    if (classicBody) classicBody.classList.remove("hidden");
    if (customOverlay) customOverlay.classList.add("hidden");

    certNode.style.width = "1200px";
    certNode.style.height = "850px";
    certNode.style.border = "16px solid #0f172a";
    certNode.style.padding = "3.5rem";
    document.documentElement.style.setProperty("--cert-height", "850px");

    // 1. Populate fixed info
    const elUserName = document.getElementById("cert-user-name");
    const elEventTitle = document.getElementById("cert-event-title");
    const elIssuedOrg = document.getElementById("cert-issued-by-org");
    const elCodeText = document.getElementById("cert-code-text");
    if (elUserName) elUserName.textContent = userName;
    if (elEventTitle) elEventTitle.textContent = eventTitle;
    if (elIssuedOrg) elIssuedOrg.textContent = orgName;
    if (elCodeText) elCodeText.textContent = certCode;

    // 2. Custom Background & Contrast Auto-Detection
    if (bgUrl && bgUrl.trim() !== '') {
      certNode.style.backgroundImage = `url('${bgUrl}')`;
      certNode.style.backgroundColor = '#0f172a';
      if (watermark) watermark.style.display = 'none';

      // Auto-detect dark or light background theme
      const theme = await detectBackgroundTheme(bgUrl);
      certNode.classList.remove('cert-theme-light', 'cert-theme-dark');
      certNode.classList.add(`cert-theme-${theme}`);
    } else {
      certNode.style.backgroundImage = 'none';
      certNode.style.backgroundColor = '#faf9f6';
      if (watermark) watermark.style.display = 'flex';
      certNode.classList.remove('cert-theme-light', 'cert-theme-dark');
      certNode.classList.add('cert-theme-light');
    }

    // 3. Render QR Code
    const qrContainer = document.getElementById("cert-qrcode-container");
    if (qrContainer) {
      qrContainer.innerHTML = "";
      const verifyUrl = `${window.location.origin}/certificate.html?code=${encodeURIComponent(certCode)}`;
      
      const qrcodeLib = (QRCode && QRCode.toCanvas) ? QRCode : ((QRCode && QRCode.default) ? QRCode.default : (typeof window !== 'undefined' ? window.QRCode : null));
      if (qrcodeLib && typeof qrcodeLib.toCanvas === 'function') {
        qrcodeLib.toCanvas(verifyUrl, { width: 72, margin: 0 }, (err, canvas) => {
          if (!err && canvas) qrContainer.appendChild(canvas);
        });
      } else {
        const qrImg = document.createElement("img");
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent(verifyUrl)}`;
        qrImg.alt = "QR Code";
        qrImg.className = "w-full h-full object-contain";
        qrContainer.appendChild(qrImg);
      }
    }
  }

  // 4. Revocation visual flags
  const revokedBanner = document.getElementById("cert-revoked-banner");
  const revokedStamp = document.getElementById("cert-revoked-stamp");
  const downloadPdfBtn = document.getElementById("download-pdf-btn");
  const downloadPngBtn = document.getElementById("download-png-btn");

  if (isRevoked) {
    if (revokedBanner) revokedBanner.classList.remove("hidden");
    if (revokedStamp) revokedStamp.classList.remove("hidden");
    if (downloadPdfBtn) {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
    if (downloadPngBtn) {
      downloadPngBtn.disabled = true;
      downloadPngBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
  } else {
    if (revokedBanner) revokedBanner.classList.add("hidden");
    if (revokedStamp) revokedStamp.classList.add("hidden");
  }

}



function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();
}

// Direct Canvas 2D Vector Renderer (100% Offline & Reliable Zero-Dependency Engine)
async function drawCertificateDirectToCanvas(cert, certNode) {
  const width = 1200;
  let height = certNode?.offsetHeight || 850;

  const rawBgUrl = cert.metadata?.customBackground || cert.event?.certificateBackground;
  let bgResult = cachedBgResult;
  if (!bgResult || !bgResult.img) {
    if (rawBgUrl && rawBgUrl.trim() !== "") {
      bgResult = await loadCrossOriginImage(rawBgUrl);
      if (bgResult) cachedBgResult = bgResult;
    }
  }

  if (bgResult && bgResult.img && bgResult.img.naturalWidth > 0 && bgResult.img.naturalHeight > 0) {
    height = Math.round(width / (bgResult.img.naturalWidth / bgResult.img.naturalHeight));
  }

  const scale = 3;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  await document.fonts.ready;

  const isDark = certNode?.classList?.contains("cert-theme-dark") || false;

  // 1. Draw Background
  if (bgResult && bgResult.img) {
    try {
      ctx.drawImage(bgResult.img, 0, 0, width, height);
    } catch (err) {
      console.warn("ctx.drawImage background error:", err);
      ctx.fillStyle = isDark ? "#0f172a" : "#faf9f6";
      ctx.fillRect(0, 0, width, height);
    }
  } else if (rawBgUrl && rawBgUrl.trim() !== "") {
    ctx.fillStyle = isDark ? "#0f172a" : "#faf9f6";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#faf9f6";
    ctx.fillRect(0, 0, width, height);
  }

  // Handle Custom Canva Template in Direct Canvas 2D Vector Renderer
  const certConfig = cert.metadata?.certificateConfig || cert.event?.certificateConfig;
  const isCustomCanva = certConfig && certConfig.isCustom && certConfig.fields;

  if (isCustomCanva) {
    const isRevoked = currentCertStatus === 'revoked' || cert.status === 'revoked';
    const userName = toTitleCase(cert.metadata?.userName || cert.user?.fullname || "Attendee");
    const eventTitle = cert.metadata?.eventTitle || cert.event?.title || "Event / Activity";
    const certCode = cert.certificateCode || "SW";
    const eventDate = cert.metadata?.eventDate || cert.event?.heldDate || cert.createdAt;
    const lang = getLang();

    for (const [key, field] of Object.entries(certConfig.fields)) {
      if (!field || field.enabled === false) continue;

      const px = (field.x / 100) * width;
      const py = (field.y / 100) * height;

      if (key === "qrCode") {
        const sz = field.size || 80;
        const qrCanvas = document.createElement("canvas");
        const verifyUrl = `${window.location.origin}/certificate.html?code=${encodeURIComponent(certCode)}`;
        drawStyledQR(qrCanvas, verifyUrl, {
          size: sz,
          style: field.qrStyle || "standard",
          frame: field.qrFrame || "box",
          colorDark: field.qrColorDark || "#0f172a",
          colorLight: field.qrColorLight || "#ffffff",
          transparentBg: !!field.qrTransparentBg,
          borderColor: field.qrBorderColor || "#cbd5e1",
          borderWidth: field.qrBorderWidth || 1,
          borderRadius: field.qrRadius || 8,
        });
        ctx.drawImage(qrCanvas, px - sz / 2, py - sz / 2, sz, sz);
      } else {
        const isCustomText = key.startsWith("custom") || field.isCustomText || field.type === "customText";
        let text = "";
        if (key === "userName") text = userName;
        else if (key === "certCode") text = certCode;
        else if (key === "issueDate") text = formatCertDate(eventDate, lang);
        else if (key === "eventTitle") text = eventTitle;
        else if (isCustomText) {
          text = (field.text || "")
            .replace(/\{\{fullName\}\}/g, userName)
            .replace(/\{\{eventTitle\}\}/g, eventTitle)
            .replace(/\{\{issueDate\}\}/g, formatCertDate(eventDate, lang))
            .replace(/\{\{certificateCode\}\}/g, certCode);
        }

        if (field.uppercase && text) {
          text = text.toUpperCase();
        }

        if (text) {
          let family = field.fontFamily || "Playfair Display";
          if (family === "Cinzel") family = "Lora";
          let fallback = "sans-serif";
          if (family === "Playfair Display" || family === "Lora" || family === "Cinzel") fallback = "Georgia, serif";
          else if (family === "Great Vibes") fallback = "cursive";

          ctx.font = `${field.fontWeight || "700"} ${field.fontSize || 16}px "${family}", ${fallback}`;
          ctx.fillStyle = field.color || "#0f172a";
          ctx.textAlign = field.align || "center";
          ctx.textBaseline = "middle";

          if (field.letterSpacing && ctx.letterSpacing !== undefined) {
            ctx.letterSpacing = `${field.letterSpacing}px`;
          }

          if (typeof text === "string" && text.includes("\n")) {
            const lines = text.split("\n");
            const fs = field.fontSize || 16;
            const lineHeight = fs * 1.35;
            const totalHeight = (lines.length - 1) * lineHeight;
            const startY = py - totalHeight / 2;
            lines.forEach((line, idx) => {
              ctx.fillText(line, px, startY + idx * lineHeight);
            });
          } else {
            ctx.fillText(text, px, py);
          }

          if (ctx.letterSpacing !== undefined) {
            ctx.letterSpacing = "0px";
          }
        }
      }
    }

    if (isRevoked) {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(-12 * Math.PI / 180);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(220, 38, 38, 0.9)";
      ctx.strokeRect(-250, -45, 500, 90);
      ctx.font = "bold 44px 'Playfair Display', serif";
      ctx.fillStyle = "rgba(220, 38, 38, 0.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("REVOKED / ĐÃ THU HỒI", 0, 0);
      ctx.restore();
    }

    return canvas;
  }

  // Scrim on dark theme
  if (isDark) {
    const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width / 2);
    grad.addColorStop(0, "rgba(15, 23, 42, 0.35)");
    grad.addColorStop(0.75, "rgba(15, 23, 42, 0.15)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // 1.5. Center Award Watermark (Rosette + Ribbon Emblem)
  if (!bgUrl) {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.035)" : "rgba(15, 23, 42, 0.03)";

    // Outer Rosette Disc
    ctx.beginPath();
    ctx.arc(0, -25, 120, 0, Math.PI * 2);
    ctx.fill();

    // Inner Rosette Ring
    ctx.lineWidth = 4;
    ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.025)" : "rgba(15, 23, 42, 0.02)";
    ctx.beginPath();
    ctx.arc(0, -25, 95, 0, Math.PI * 2);
    ctx.stroke();

    // Central Star
    ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.035)";
    drawStar(ctx, 0, -25, 5, 45, 22);

    // Left Ribbon Tail
    ctx.beginPath();
    ctx.moveTo(-45, 65);
    ctx.lineTo(-75, 200);
    ctx.lineTo(-30, 175);
    ctx.lineTo(5, 200);
    ctx.lineTo(-10, 65);
    ctx.closePath();
    ctx.fill();

    // Right Ribbon Tail
    ctx.beginPath();
    ctx.moveTo(45, 65);
    ctx.lineTo(75, 200);
    ctx.lineTo(30, 175);
    ctx.lineTo(-5, 200);
    ctx.lineTo(10, 65);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // 2. Outer Border (16px)
  ctx.lineWidth = 16;
  ctx.strokeStyle = isDark ? "#ffffff" : "#0f172a";
  ctx.strokeRect(8, 8, width - 16, height - 16);

  // 3. Inner Gold Borders
  ctx.lineWidth = 2;
  ctx.strokeStyle = isDark ? "#fde047" : "#d4af37";
  ctx.strokeRect(24, 24, width - 48, height - 48);

  ctx.lineWidth = 1;
  ctx.strokeStyle = isDark ? "rgba(253, 224, 71, 0.5)" : "rgba(212, 175, 55, 0.4)";
  ctx.strokeRect(32, 32, width - 64, height - 64);

  // 4. Corner ✦ Ornaments
  ctx.font = "24px 'Playfair Display', serif";
  ctx.fillStyle = isDark ? "#fde047" : "#d4af37";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✦", 48, 48);
  ctx.fillText("✦", width - 48, 48);
  ctx.fillText("✦", 48, height - 48);
  ctx.fillText("✦", width - 48, height - 48);

  // Colors based on theme
  const titleColor = isDark ? "#ffffff" : "#0f172a";
  const subTitleColor = isDark ? "#fef08a" : "#b45309";
  const labelColor = isDark ? "#f1f5f9" : "#64748b";
  const nameColor = isDark ? "#ffffff" : "#0f172a";
  const descColor = isDark ? "#f8fafc" : "#475569";
  const eventColor = isDark ? "#ffffff" : "#0f172a";

  const lang = getLang();

  // 5. Title Header
  ctx.font = "bold 38px 'Playfair Display', serif";
  ctx.fillStyle = titleColor;
  ctx.textAlign = "center";
  if (isDark) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
  }
  ctx.fillText(t("certificate_view.title_main").toUpperCase(), width / 2, 120);

  ctx.font = "600 13px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = subTitleColor;
  ctx.fillText(t("certificate_view.title_sub").toUpperCase(), width / 2, 155);

  // 6. Recipient Section
  ctx.font = "italic 16px 'Playfair Display', serif";
  ctx.fillStyle = labelColor;
  ctx.fillText(t("certificate_view.presented_to"), width / 2, 280);

  const userName = toTitleCase(cert.metadata?.userName || cert.user?.fullname || "Attendee");
  ctx.font = "bold 50px 'Playfair Display', serif";
  ctx.fillStyle = nameColor;
  ctx.fillText(userName, width / 2, 360);

  // Gold line under name
  const nameWidth = Math.min(600, ctx.measureText(userName).width + 80);
  const lineGrad = ctx.createLinearGradient(width / 2 - nameWidth / 2, 0, width / 2 + nameWidth / 2, 0);
  lineGrad.addColorStop(0, "rgba(212, 175, 55, 0)");
  lineGrad.addColorStop(0.5, "#d4af37");
  lineGrad.addColorStop(1, "rgba(212, 175, 55, 0)");
  ctx.fillStyle = lineGrad;
  ctx.fillRect(width / 2 - nameWidth / 2, 385, nameWidth, 2);

  // 7. Event Details
  if (isDark) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
  }
  ctx.font = "15px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = descColor;
  ctx.fillText(t("certificate_view.completed_desc"), width / 2, 445);

  const eventTitle = cert.metadata?.eventTitle || cert.event?.title || "Event Title";
  ctx.font = "bold 26px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = eventColor;
  ctx.fillText(eventTitle, width / 2, 495);

  // 8. Footer divider
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(203, 213, 225, 0.8)";
  ctx.fillRect(60, 680, width - 120, 1);

  // 9. Footer Left: QR Code & Code Text
  const verifyUrl = `${window.location.origin}/certificate.html?code=${encodeURIComponent(certCode)}`;
  let qrCanvas = document.querySelector("#cert-qrcode-container canvas");
  if (!qrCanvas) {
    qrCanvas = document.createElement("canvas");
    drawStyledQR(qrCanvas, verifyUrl, { size: 72, style: "standard", frame: "none" });
  }
  if (qrCanvas) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(64, 705, 80, 80, 8);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(203, 213, 225, 0.9)";
    ctx.stroke();
    ctx.drawImage(qrCanvas, 68, 709, 72, 72);
  }

  if (isDark) {
    ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
  }

  const certCode = cert.certificateCode || "SW";
  ctx.textAlign = "left";
  ctx.font = "600 10px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = subTitleColor;
  ctx.fillText(t("certificate_view.cert_code_label").toUpperCase(), 158, 725);

  ctx.font = "bold 14px monospace";
  ctx.fillStyle = titleColor;
  ctx.fillText(certCode, 158, 748);

  // Verified Badge with Solid Green Circle + White Checkmark Vector
  const badgeX = 158;
  const badgeY = 770;
  const badgeColor = isDark ? "#4ade80" : "#059669";

  // Solid green circle
  ctx.fillStyle = badgeColor;
  ctx.beginPath();
  ctx.arc(badgeX + 6, badgeY - 3.5, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // White Checkmark
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(badgeX + 3.2, badgeY - 3.5);
  ctx.lineTo(badgeX + 5.2, badgeY - 1.2);
  ctx.lineTo(badgeX + 8.8, badgeY - 5.8);
  ctx.stroke();

  // Verified Badge Text
  ctx.font = "600 11px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = badgeColor;
  ctx.fillText(t("certificate_view.verified_badge"), badgeX + 16, badgeY);

  // 10. Footer Right: Issued By + Date
  const orgName = cert.metadata?.orgName || cert.organization?.name || "SpringWave Organization";
  ctx.textAlign = "right";
  ctx.font = "600 11px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = subTitleColor;
  ctx.fillText(t("certificate_view.issued_by_label").toUpperCase(), width - 64, 712);

  ctx.font = "bold 20px 'Playfair Display', serif";
  ctx.fillStyle = titleColor;
  ctx.fillText(orgName, width - 64, 738);

  ctx.fillStyle = isDark ? "rgba(255, 255, 255, 0.75)" : "#cbd5e1";
  ctx.fillRect(width - 250, 748, 186, 1);

  ctx.font = "500 12px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = labelColor;
  ctx.fillText(t("certificate_view.org_role"), width - 64, 765);

  const eventDate = cert.metadata?.eventDate || cert.event?.heldDate || cert.createdAt;
  ctx.font = "500 11px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = labelColor;
  ctx.fillText(formatCertDate(eventDate, lang), width - 64, 782);

  // 11. If Revoked: Stamp
  const isRevoked = currentCertStatus === 'revoked' || cert.status === 'revoked';
  if (isRevoked) {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-12 * Math.PI / 180);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(220, 38, 38, 0.9)";
    ctx.strokeRect(-250, -45, 500, 90);
    ctx.font = "bold 44px 'Playfair Display', serif";
    ctx.fillStyle = "rgba(220, 38, 38, 0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("REVOKED / ĐÃ THU HỒI", 0, 0);
    ctx.restore();
  }

  return canvas;
}

async function renderCertificateToCanvas(certNode) {
  try {
    await document.fonts.ready;
  } catch (e) {
    console.warn("document.fonts.ready error:", e);
  }

  // 1. Direct Canvas 2D Vector Renderer (100% reliable, zero network/parser dependency, 300 DPI)
  try {
    if (currentCertData) {
      const canvas = await drawCertificateDirectToCanvas(currentCertData, certNode);
      if (canvas && canvas.width > 0) {
        return canvas;
      }
    }
  } catch (err) {
    console.warn("Direct Canvas 2D render failed, falling back to html2canvas:", err);
  }

  // 2. Secondary fallback: html2canvas (bundled npm package)
  try {
    const canvas = await html2canvas(certNode, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#faf9f6",
      logging: false,
    });
    if (canvas && canvas.width > 0) {
      return canvas;
    }
  } catch (err) {
    console.warn("html2canvas fallback failed:", err);
  }

  // Final fallback
  return drawCertificateDirectToCanvas(currentCertData, certNode);
}

function certificateCanvasToPngFile(canvas, certificateCode) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to create the certificate image"));
        return;
      }
      const safeCode = String(certificateCode || "certificate").replace(/[^a-z0-9_-]/gi, "_");
      resolve(new File([blob], `certificate-${safeCode}.png`, { type: "image/png" }));
    }, "image/png", 1);
  });
}

function initActionButtons() {
  // Language Switcher Toggle
  document.getElementById("lang-toggle-btn")?.addEventListener("click", () => {
    const nextLang = getLang() === 'vi' ? 'en' : 'vi';
    setLang(nextLang);
  });

  // Copy Link
  document.getElementById("copy-link-btn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const btn = document.getElementById("copy-link-btn");
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `<i class="fa-solid fa-check text-emerald-600"></i><span class="hidden md:inline text-emerald-600">${t("certificate_view.copied")}</span>`;
      setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
    });
  });

  // Download PNG
  document.getElementById("download-png-btn")?.addEventListener("click", async () => {
    if (!currentCertData || currentCertStatus === 'revoked') return;
    const btn = document.getElementById("download-png-btn");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${getLang() === 'vi' ? 'Đang xuất ảnh...' : 'Exporting...'}</span>`;

    try {
      const certNode = document.getElementById("certificate-node");
      const canvas = await renderCertificateToCanvas(certNode);

      const rawUserName = currentCertData.metadata?.userName || currentCertData.user?.fullname || "User";
      const userName = toTitleCase(rawUserName).replace(/\s+/g, '_');
      const certCode = currentCertData.certificateCode || "SW";
      const link = document.createElement("a");
      link.download = `Certificate_${userName}_${certCode}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
    } catch (err) {
      console.error("PNG export error:", err);
      alert("Failed to export PNG: " + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // Download PDF with Embedded Metadata
  document.getElementById("download-pdf-btn")?.addEventListener("click", async () => {
    if (!currentCertData || currentCertStatus === 'revoked') return;
    const btn = document.getElementById("download-pdf-btn");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${getLang() === 'vi' ? 'Đang tạo PDF...' : 'Generating PDF...'}</span>`;

    try {
      const certNode = document.getElementById("certificate-node");
      const canvas = await renderCertificateToCanvas(certNode);
      const imgData = canvas.toDataURL("image/png");

      const certAspect = canvas.width / canvas.height;
      const pdfPageW = 297;
      const pdfPageH = pdfPageW / certAspect;

      // Initialize PDF with exact matching aspect ratio (100% Full-bleed, Zero White Margins)
      const doc = new jsPDF({
        orientation: pdfPageW >= pdfPageH ? "landscape" : "portrait",
        unit: "mm",
        format: [pdfPageW, pdfPageH],
        compress: true,
      });

      const rawUserName = currentCertData.metadata?.userName || currentCertData.user?.fullname || "Attendee";
      const userName = toTitleCase(rawUserName);
      const eventTitle = currentCertData.metadata?.eventTitle || currentCertData.event?.title || "Event";
      const orgName = currentCertData.metadata?.orgName || currentCertData.organization?.name || "SpringWave Organization";
      const certCode = currentCertData.certificateCode || "SW";
      const lang = getLang();

      // 🛡️ Embed Certificate Code & Verification details directly into PDF Document Properties
      const titlePrefix = lang === 'vi' ? 'Giấy Chứng Nhận' : 'Certificate';
      const subjectPrefix = lang === 'vi' ? 'Giấy chứng nhận xác thực SpringWave' : 'SpringWave Verified Certificate';

      doc.setProperties({
        title: `${titlePrefix} - ${userName} - ${eventTitle}`,
        subject: `${subjectPrefix}: ${certCode}`,
        author: orgName,
        keywords: `springwave, certificate, verified, ${certCode}, ${eventTitle}, lang:${lang}`,
        creator: 'SpringWave Platform (https://springwave.io)',
        producer: 'SpringWave Verification Engine v1.0',
      });

      // Fit image 100% full-bleed onto custom matching page size
      doc.addImage(imgData, "PNG", 0, 0, pdfPageW, pdfPageH, undefined, "FAST");

      const cleanUserName = userName.replace(/\s+/g, '_');
      doc.save(`Certificate_${cleanUserName}_${certCode}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Failed to generate PDF: " + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // --- Share to Community & Ownership Modals ---
  let certTurnstileWidgetId = null;

  function renderCertTurnstile() {
    const container = document.getElementById("cert-turnstile-container");
    if (!container) return;

    const tryRender = () => {
      if (typeof turnstile !== "undefined") {
        if (certTurnstileWidgetId !== null) {
          try {
            turnstile.reset(certTurnstileWidgetId);
          } catch (e) {
            console.warn("Turnstile reset error:", e);
          }
        } else {
          try {
            certTurnstileWidgetId = turnstile.render(container, {
              sitekey: TURNSTILE_SITE_KEY,
              theme: "light",
            });
          } catch (e) {
            console.warn("Turnstile render error:", e);
          }
        }
      } else {
        setTimeout(tryRender, 200);
      }
    };

    tryRender();
  }

  function resetCertTurnstile() {
    if (typeof turnstile !== "undefined" && certTurnstileWidgetId !== null) {
      try {
        turnstile.reset(certTurnstileWidgetId);
      } catch (e) {}
    }
  }

  const handleShareClick = () => {
    if (!currentCertData) return;
    if (currentCertStatus === 'revoked' || currentCertData.status === 'revoked') {
      showCertToast(getLang() === 'vi' ? 'Chứng chỉ đã bị thu hồi, không thể chia sẻ lên Cộng đồng.' : 'Revoked certificate cannot be shared to Community.', true);
      return;
    }

    const ownership = checkCertificateOwnership(currentCertData);
    if (!ownership.isLoggedIn) {
      // Open login required modal
      const modal = document.getElementById("login-required-modal");
      const content = document.getElementById("login-required-modal-content");
      const redirectLink = document.getElementById("login-redirect-link");
      if (redirectLink) {
        redirectLink.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      }
      openModalElement(modal, content);
      return;
    }

    if (!ownership.isOwner) {
      // Open not-owner modal
      const modal = document.getElementById("not-owner-modal");
      const content = document.getElementById("not-owner-modal-content");
      const descEl = document.getElementById("not-owner-modal-desc");
      if (descEl) {
        const recipientName = currentCertData.metadata?.userName || currentCertData.user?.fullname || "Người khác";
        const currentUserName = ownership.currentUser?.fullname || ownership.currentUser?.username || "Tài khoản hiện tại";
        descEl.textContent = t("certificate_view.not_owner_desc", { recipient: recipientName, currentUser: currentUserName });
      }
      openModalElement(modal, content);
      return;
    }

    // Owner verified! Open share brag modal
    const shareModal = document.getElementById("share-community-modal");
    const shareContent = document.getElementById("share-modal-content");
    const previewOrg = document.getElementById("preview-org-name");
    const previewCode = document.getElementById("preview-cert-code");
    const previewEvent = document.getElementById("preview-event-title");
    const previewRecipient = document.getElementById("preview-recipient-name");
    const titleInput = document.getElementById("share-post-title");
    const contentInput = document.getElementById("share-post-content");
    const tagsInput = document.getElementById("share-post-tags");
    const alertBox = document.getElementById("share-alert-box");

    if (alertBox) {
      alertBox.className = "hidden p-3 rounded-xl text-xs flex items-center gap-2";
      alertBox.innerHTML = "";
    }

    const eventTitle = currentCertData.metadata?.eventTitle || currentCertData.event?.title || "Sự kiện";
    const orgName = currentCertData.metadata?.orgName || currentCertData.organization?.name || "SpringWave";
    const certCode = currentCertData.certificateCode || "SW-CODE";
    const recipientName = ownership.currentUser?.fullname || currentCertData.metadata?.userName || "Attendee";

    if (previewOrg) previewOrg.textContent = orgName;
    if (previewCode) previewCode.textContent = certCode;
    if (previewEvent) previewEvent.textContent = eventTitle;
    if (previewRecipient) previewRecipient.textContent = recipientName;

    // Keep title and content empty as requested, so the user can freely type from scratch
    if (titleInput) titleInput.value = "";
    if (contentInput) contentInput.value = "";
    if (tagsInput) tagsInput.value = "Certificate, Achievement, SpringWave";

    openModalElement(shareModal, shareContent);
    renderCertTurnstile();
  };

  document.getElementById("share-community-btn")?.addEventListener("click", handleShareClick);
  document.getElementById("banner-share-btn")?.addEventListener("click", handleShareClick);

  // Close share modal
  const shareModal = document.getElementById("share-community-modal");
  const shareContent = document.getElementById("share-modal-content");
  const handleCloseShareModal = () => {
    closeModalElement(shareModal, shareContent);
    resetCertTurnstile();
  };
  document.getElementById("close-share-modal-btn")?.addEventListener("click", handleCloseShareModal);
  shareModal?.addEventListener("click", (e) => {
    if (e.target === shareModal) handleCloseShareModal();
  });

  // Close not-owner modal
  const notOwnerModal = document.getElementById("not-owner-modal");
  const notOwnerContent = document.getElementById("not-owner-modal-content");
  document.getElementById("close-not-owner-modal-btn")?.addEventListener("click", () => {
    closeModalElement(notOwnerModal, notOwnerContent);
  });
  notOwnerModal?.addEventListener("click", (e) => {
    if (e.target === notOwnerModal) closeModalElement(notOwnerModal, notOwnerContent);
  });

  // Close login-required modal
  const loginModal = document.getElementById("login-required-modal");
  const loginContent = document.getElementById("login-required-modal-content");
  document.getElementById("close-login-required-modal-btn")?.addEventListener("click", () => {
    closeModalElement(loginModal, loginContent);
  });
  loginModal?.addEventListener("click", (e) => {
    if (e.target === loginModal) closeModalElement(loginModal, loginContent);
  });

  // Copy post text
  document.getElementById("copy-post-text-btn")?.addEventListener("click", () => {
    const title = document.getElementById("share-post-title")?.value?.trim() || "";
    const content = document.getElementById("share-post-content")?.value?.trim() || "";
    if (!title && !content) {
      showCertToast(getLang() === 'vi' ? 'Vui lòng nhập tiêu đề hoặc nội dung trước khi sao chép.' : 'Please enter title or content before copying.', true);
      return;
    }
    const fullText = title && content ? `${title}\n\n${content}` : (title || content);
    navigator.clipboard.writeText(fullText).then(() => {
      showCertToast(t("certificate_view.copied_post"));
      const btn = document.getElementById("copy-post-text-btn");
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-check text-emerald-600"></i><span>${t("certificate_view.copied_post")}</span>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      }
    });
  });

  // Open in Community Editor
  document.getElementById("open-community-editor-btn")?.addEventListener("click", () => {
    if (!currentCertData) return;
    const title = document.getElementById("share-post-title")?.value || "";
    const content = document.getElementById("share-post-content")?.value || "";
    const certCode = currentCertData.certificateCode || "";
    const eventId = currentCertData.event?._id || "";
    const eventTitle = currentCertData.metadata?.eventTitle || currentCertData.event?.title || "";
    const orgName = currentCertData.metadata?.orgName || currentCertData.organization?.name || "";

    const params = new URLSearchParams();
    params.set("action", "share-cert");
    if (certCode) params.set("code", certCode);
    if (eventId) params.set("eventId", eventId);
    if (eventTitle) params.set("eventTitle", eventTitle);
    if (orgName) params.set("orgName", orgName);
    if (title) params.set("title", title);
    if (content) params.set("content", content);

    window.location.href = `/community.html?${params.toString()}`;
  });

  // Publish directly to Community
  document.getElementById("publish-to-community-btn")?.addEventListener("click", async () => {
    if (!currentCertData) return;
    const titleInput = document.getElementById("share-post-title");
    const contentInput = document.getElementById("share-post-content");
    const tagsInput = document.getElementById("share-post-tags");
    const publishBtn = document.getElementById("publish-to-community-btn");
    const alertBox = document.getElementById("share-alert-box");

    const title = titleInput?.value?.trim();
    const content = contentInput?.value?.trim();
    if (!title || !content) {
      showCertToast(getLang() === 'vi' ? 'Vui lòng nhập tiêu đề và nội dung bài viết.' : 'Please enter both title and content.', true);
      return;
    }

    const cfTurnstileResponse = (typeof turnstile !== "undefined" && certTurnstileWidgetId !== null)
      ? turnstile.getResponse(certTurnstileWidgetId)
      : undefined;

    if (TURNSTILE_SITE_KEY && !cfTurnstileResponse) {
      showCertToast(getLang() === 'vi' ? 'Vui lòng xác nhận kiểm tra bảo mật (Turnstile) trước khi đăng.' : 'Please complete the security check before posting.', true);
      return;
    }

    const tags = tagsInput?.value ? tagsInput.value.split(",").map(s => s.trim()).filter(Boolean) : ["Certificate", "Achievement", "SpringWave"];

    publishBtn.disabled = true;
    const origHTML = publishBtn.innerHTML;
    publishBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${getLang() === 'vi' ? 'Đang đăng bài...' : 'Posting...'}</span>`;

    try {
      const certNode = document.getElementById("certificate-node");
      const certificateCanvas = await renderCertificateToCanvas(certNode);
      const certificateImage = await certificateCanvasToPngFile(certificateCanvas, currentCertData.certificateCode);
      const payload = {
        title,
        content,
        category: "event",
        relatedEvent: currentCertData.event?._id || undefined,
        certificateCode: currentCertData.certificateCode || undefined,
        images: [certificateImage],
        tags,
        scope: "general",
        cfTurnstileResponse,
      };

      const result = await createDiscussionWithScope(payload);
      if (result) {
        showCertToast(t("certificate_view.share_success_title"));
        resetCertTurnstile();
        if (alertBox) {
          alertBox.className = "p-3.5 rounded-2xl text-xs flex items-center justify-between gap-3 bg-emerald-50 text-emerald-800 border border-emerald-200 mt-2";
          alertBox.innerHTML = `
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-circle-check text-emerald-600 text-base shrink-0"></i>
              <span class="font-medium">${t("certificate_view.share_success_desc")}</span>
            </div>
            <a href="/community.html" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0 text-[11px] transition-colors">
              ${t("certificate_view.view_post")}
            </a>
          `;
        }
        publishBtn.innerHTML = `<i class="fa-solid fa-check"></i><span>${t("certificate_view.share_success_title")}</span>`;
        setTimeout(() => {
          closeModalElement(shareModal, shareContent);
          publishBtn.disabled = false;
          publishBtn.innerHTML = origHTML;
        }, 2500);
      } else {
        throw new Error("Unable to create discussion");
      }
    } catch (err) {
      console.warn("Direct community post failed:", err);
      resetCertTurnstile();
      const errMsg = err?.message || err?.error || (getLang() === 'vi' ? 'Đăng bài không thành công. Bạn có thể mở trực tiếp trong Diễn đàn.' : 'Post failed. You can open directly in Community.');
      showCertToast(errMsg, true);
      if (alertBox) {
        alertBox.className = "p-3.5 rounded-2xl text-xs flex flex-col gap-2 bg-amber-50 text-amber-900 border border-amber-200 mt-2";
        alertBox.innerHTML = `
          <div class="flex items-start gap-2">
            <i class="fa-solid fa-shield-halved text-amber-600 text-sm mt-0.5 shrink-0"></i>
            <span class="leading-relaxed">${errMsg}</span>
          </div>
          <button type="button" id="alert-open-community-btn" class="self-end px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors cursor-pointer">
            ${t("certificate_view.open_in_community")} →
          </button>
        `;
        document.getElementById("alert-open-community-btn")?.addEventListener("click", () => {
          document.getElementById("open-community-editor-btn")?.click();
        });
      }
      publishBtn.disabled = false;
      publishBtn.innerHTML = origHTML;
    }
  });
}
