import "../../src/style.css";
import QRCode from "qrcode";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { API_BASE_URL, CDN_DOMAIN } from "../config.js";
import { verifyCertificate } from "../api/certificates.js";
import { initI18n, t, getLang, setLang, applyTranslation } from "../lib/i18n.js";
import { formatDate, toTitleCase } from "../lib/utils.js";
import { drawStyledQR } from "../lib/qr-styler.js";

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

async function loadCrossOriginImage(url) {
  if (!url) return null;
  const resolved = resolveMediaUrl(url);

  // 1. Try fetch as blob -> ObjectURL (bypasses canvas tainting and CORS cache issues)
  try {
    const resp = await fetch(resolved, { mode: 'cors' });
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
    console.warn("fetch blob for background image failed, trying cache-busted Image:", err);
  }

  // 2. Try Image with crossOrigin = 'anonymous' and cache buster
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const cacheBusted = resolved.includes('?') ? `${resolved}&_cb=${Date.now()}` : `${resolved}?_cb=${Date.now()}`;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = cacheBusted;
    });
    return { img, objectUrl: null };
  } catch (err) {
    console.warn("Cache-busted Image load failed:", err);
  }

  // 3. Fallback: Image with crossOrigin without cache buster
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

    setupCertificateDOM(cert, currentCertStatus);
    renderDynamicTexts();

    loadingEl.classList.add("hidden");
    containerEl.classList.remove("hidden");
  } catch (err) {
    console.error("Certificate verify error:", err);
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
    if (errorMsgEl) errorMsgEl.textContent = err.message || t("certificate_view.not_found_desc");
  }

  initActionButtons();
});

// Listen for global language changes
window.addEventListener("language-changed", () => {
  renderDynamicTexts();
});

// Calculate perceived luminance of custom background to automatically switch text contrast
function detectBackgroundTheme(imageUrl) {
  return new Promise((resolve) => {
    if (!imageUrl || imageUrl.trim() === '') {
      return resolve('light');
    }

    // Safety timeout: default to 'dark' high-contrast theme if image hangs or CORS blocks
    const safetyTimer = setTimeout(() => {
      resolve('dark');
    }, 1500);

    const img = new Image();
    // Only set crossOrigin if not a local data URI
    if (!imageUrl.startsWith('data:') && !imageUrl.startsWith(window.location.origin)) {
      img.crossOrigin = "Anonymous";
    }

    img.onload = () => {
      clearTimeout(safetyTimer);
      try {
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
        // Any custom artwork/color/scenery (< 215) switches to vibrant dark theme (white & gold text with deep shadow)
        // Only pure bright white/ivory paper (> 215) stays light
        resolve(avgLum < 215 ? 'dark' : 'light');
      } catch (err) {
        console.warn("Canvas read error on custom background, adopting high-contrast dark theme:", err);
        resolve('dark');
      }
    };

    img.onerror = () => {
      clearTimeout(safetyTimer);
      console.warn("Image load error on custom background, defaulting to high-contrast dark theme");
      resolve('dark');
    };

    img.src = imageUrl;
  });
}

async function setupCertificateDOM(cert, status) {
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
    if (bgUrl && bgUrl.trim() !== "") {
      const resolvedBg = resolveMediaUrl(bgUrl);
      certNode.style.backgroundImage = `url('${resolvedBg}')`;
      certNode.style.backgroundColor = "#0f172a";
    } else {
      certNode.style.backgroundImage = "none";
      certNode.style.backgroundColor = "#faf9f6";
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
          fieldWrapper.style.transform = `translate(${translateX}, -50%)`;
          fieldWrapper.style.fontFamily = `'${field.fontFamily || "Playfair Display"}', sans-serif`;
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

    certNode.style.border = "16px solid #0f172a";
    certNode.style.padding = "3.5rem";

    // 1. Populate fixed info
    document.getElementById("cert-user-name").textContent = userName;
    document.getElementById("cert-event-title").textContent = eventTitle;
    document.getElementById("cert-issued-by-org").textContent = orgName;
    document.getElementById("cert-code-text").textContent = certCode;

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
    revokedBanner.classList.remove("hidden");
    revokedStamp.classList.remove("hidden");
    if (downloadPdfBtn) {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
    if (downloadPngBtn) {
      downloadPngBtn.disabled = true;
      downloadPngBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
  } else {
    revokedBanner.classList.add("hidden");
    revokedStamp.classList.add("hidden");
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
  const height = 850;
  const scale = 3;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  await document.fonts.ready;

  const isDark = certNode?.classList?.contains("cert-theme-dark") || false;
  const bgUrl = cert.metadata?.customBackground || cert.event?.certificateBackground;

  // 1. Draw Background
  const rawBgUrl = cert.metadata?.customBackground || cert.event?.certificateBackground;
  if (rawBgUrl && rawBgUrl.trim() !== "") {
    const bgResult = await loadCrossOriginImage(rawBgUrl);
    if (bgResult && bgResult.img) {
      try {
        ctx.drawImage(bgResult.img, 0, 0, width, height);
      } catch (err) {
        console.warn("ctx.drawImage background error:", err);
        ctx.fillStyle = isDark ? "#0f172a" : "#faf9f6";
        ctx.fillRect(0, 0, width, height);
      } finally {
        if (bgResult.objectUrl) URL.revokeObjectURL(bgResult.objectUrl);
      }
    } else {
      ctx.fillStyle = isDark ? "#0f172a" : "#faf9f6";
      ctx.fillRect(0, 0, width, height);
    }
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
          const family = field.fontFamily || "Playfair Display";
          let fallback = "sans-serif";
          if (family === "Playfair Display" || family === "Cinzel") fallback = "Georgia, serif";
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
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      // Initialize A4 Landscape PDF (297 x 210 mm)
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
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

      // Fit image to full A4 page (297 x 210 mm)
      doc.addImage(imgData, "JPEG", 0, 0, 297, 210, undefined, "FAST");

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
}
