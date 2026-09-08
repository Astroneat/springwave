import QRCode from 'qrcode';

/**
 * QR Code Custom Styler & Renderer for SpringWave
 * Supports styles: standard (classic square), dots (artistic circle), smooth (rounded box), 8bit (retro arcade), diamond (luxury rhombus)
 * Supports frames: none (transparent), box (card box), bordered, double (royal double), dots-corner (8-bit brackets)
 */

export function drawStyledQR(canvas, text, options = {}) {
  const {
    size = 80,
    style = 'standard',        // 'standard' | 'dots' | 'smooth' | '8bit' | 'diamond'
    colorDark = '#0f172a',
    colorLight = '#ffffff',
    transparentBg = false,
    frame = 'box',             // 'none' | 'box' | 'bordered' | 'double' | 'dots-corner'
    borderColor = '#cbd5e1',
    borderWidth = 1,
    borderRadius = 8,
  } = options;

  if (!canvas) return;

  const dpr = 2; // high-dpi retina resolution
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  // 1. Draw Frame & Background
  if (frame === 'box') {
    if (!transparentBg) {
      ctx.fillStyle = colorLight || '#ffffff';
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, borderRadius);
      ctx.fill();
    }
    if (borderWidth > 0 && borderColor && borderColor !== 'transparent') {
      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = borderColor;
      ctx.beginPath();
      ctx.roundRect(borderWidth / 2, borderWidth / 2, size - borderWidth, size - borderWidth, borderRadius);
      ctx.stroke();
    }
  } else if (frame === 'bordered') {
    if (!transparentBg) {
      ctx.fillStyle = colorLight || '#ffffff';
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, borderRadius);
      ctx.fill();
    }
    ctx.lineWidth = borderWidth || 1;
    ctx.strokeStyle = borderColor || '#cbd5e1';
    ctx.beginPath();
    ctx.roundRect(borderWidth / 2, borderWidth / 2, size - borderWidth, size - borderWidth, borderRadius);
    ctx.stroke();
  } else if (frame === 'double') {
    if (!transparentBg) {
      ctx.fillStyle = colorLight || '#ffffff';
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, borderRadius);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = borderColor || '#d4af37';
    // Outer border
    ctx.beginPath();
    ctx.roundRect(1, 1, size - 2, size - 2, borderRadius);
    ctx.stroke();
    // Inner border
    const innerPad = 3.5;
    ctx.beginPath();
    ctx.roundRect(innerPad, innerPad, size - innerPad * 2, size - innerPad * 2, Math.max(0, borderRadius - 2));
    ctx.stroke();
  } else if (frame === 'dots-corner') {
    if (!transparentBg) {
      ctx.fillStyle = colorLight || '#ffffff';
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, borderRadius);
      ctx.fill();
    }
    // 8-bit / Sci-fi corner brackets ⌜ ⌝ ⌞ ⌟
    ctx.lineWidth = Math.max(2, borderWidth + 1);
    ctx.strokeStyle = borderColor || colorDark;
    const cornerLen = Math.max(8, size * 0.18);
    const m = 2.5;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(m, m + cornerLen);
    ctx.lineTo(m, m);
    ctx.lineTo(m + cornerLen, m);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(size - m - cornerLen, m);
    ctx.lineTo(size - m, m);
    ctx.lineTo(size - m, m + cornerLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(m, size - m - cornerLen);
    ctx.lineTo(m, size - m);
    ctx.lineTo(m + cornerLen, size - m);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(size - m - cornerLen, size - m);
    ctx.lineTo(size - m, size - m);
    ctx.lineTo(size - m, size - m - cornerLen);
    ctx.stroke();
  } else {
    // frame === 'none' (Transparent / Frameless)
    if (!transparentBg) {
      ctx.fillStyle = colorLight || '#ffffff';
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, borderRadius);
      ctx.fill();
    }
  }

  // 2. Generate QR BitMatrix
  const qrcodeLib = (QRCode && QRCode.create) ? QRCode : ((QRCode && QRCode.default) ? QRCode.default : (typeof window !== 'undefined' ? window.QRCode : null));
  if (!qrcodeLib || typeof qrcodeLib.create !== 'function') {
    console.warn('QRCode library create method not available, qrcodeLib:', qrcodeLib);
    ctx.fillStyle = colorDark;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QR CODE', size / 2, size / 2);
    ctx.restore();
    return;
  }

  let qr;
  try {
    qr = qrcodeLib.create(text || 'https://springwave.io.vn', { errorCorrectionLevel: 'M' });
  } catch (err) {
    console.error('Failed to create QR code BitMatrix:', err);
    ctx.restore();
    return;
  }

  if (!qr || !qr.modules) {
    ctx.restore();
    return;
  }

  const moduleCount = qr.modules.size;
  // Dynamic padding based on frame
  let padding = size * 0.08;
  if (frame === 'none') padding = size * 0.04;
  else if (frame === 'dots-corner') padding = size * 0.12;
  else if (frame === 'double') padding = size * 0.09;

  const innerSize = size - padding * 2;
  const cellSize = innerSize / moduleCount;
  const startX = padding;
  const startY = padding;

  // Function to detect if module (r, c) is part of 3 position detection patterns (7x7 finders)
  function isFinder(r, c) {
    if (r < 7 && c < 7) return true; // Top-Left
    if (r < 7 && c >= moduleCount - 7) return true; // Top-Right
    if (r >= moduleCount - 7 && c < 7) return true; // Bottom-Left
    return false;
  }

  // 3. Draw 3 Position Detection Finder Patterns
  function drawFinderPattern(originR, originC) {
    const fx = startX + originC * cellSize;
    const fy = startY + originR * cellSize;
    const fSize = 7 * cellSize;

    // Outer 7x7 frame
    ctx.fillStyle = colorDark;
    if (style === 'smooth' || style === 'dots') {
      ctx.beginPath();
      ctx.roundRect(fx, fy, fSize, fSize, cellSize * 1.5);
      ctx.fill();
    } else {
      ctx.fillRect(fx, fy, fSize, fSize);
    }

    // Inner 5x5 cutout
    const gap = cellSize;
    const innerX = fx + gap;
    const innerY = fy + gap;
    const innerSize = fSize - gap * 2;

    if (transparentBg) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      if (style === 'smooth' || style === 'dots') {
        ctx.roundRect(innerX, innerY, innerSize, innerSize, cellSize);
      } else {
        ctx.rect(innerX, innerY, innerSize, innerSize);
      }
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = colorLight || '#ffffff';
      if (style === 'smooth' || style === 'dots') {
        ctx.beginPath();
        ctx.roundRect(innerX, innerY, innerSize, innerSize, cellSize);
        ctx.fill();
      } else {
        ctx.fillRect(innerX, innerY, innerSize, innerSize);
      }
    }

    // Center 3x3 core
    ctx.fillStyle = colorDark;
    const coreGap = cellSize * 2;
    const coreX = fx + coreGap;
    const coreY = fy + coreGap;
    const coreSize = fSize - coreGap * 2;

    if (style === 'smooth' || style === 'dots') {
      ctx.beginPath();
      ctx.roundRect(coreX, coreY, coreSize, coreSize, cellSize * 0.8);
      ctx.fill();
    } else if (style === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(coreX + coreSize / 2, coreY);
      ctx.lineTo(coreX + coreSize, coreY + coreSize / 2);
      ctx.lineTo(coreX + coreSize / 2, coreY + coreSize);
      ctx.lineTo(coreX, coreY + coreSize / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(coreX, coreY, coreSize, coreSize);
    }
  }

  // Draw the 3 finder eyes
  drawFinderPattern(0, 0);
  drawFinderPattern(0, moduleCount - 7);
  drawFinderPattern(moduleCount - 7, 0);

  // 4. Draw Data Modules
  ctx.fillStyle = colorDark;

  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (isFinder(r, c)) continue; // Handled by finder pattern drawer

      const isDark = qr.modules.get(r, c);
      if (!isDark) continue;

      const x = startX + c * cellSize;
      const y = startY + r * cellSize;

      if (style === 'dots') {
        ctx.beginPath();
        ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.44, 0, Math.PI * 2);
        ctx.fill();
      } else if (style === 'smooth') {
        ctx.beginPath();
        ctx.roundRect(x + 0.25, y + 0.25, cellSize - 0.5, cellSize - 0.5, cellSize * 0.32);
        ctx.fill();
      } else if (style === '8bit') {
        ctx.fillRect(x + 0.4, y + 0.4, cellSize - 0.8, cellSize - 0.8);
      } else if (style === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(x + cellSize / 2, y);
        ctx.lineTo(x + cellSize, y + cellSize / 2);
        ctx.lineTo(x + cellSize / 2, y + cellSize);
        ctx.lineTo(x, y + cellSize / 2);
        ctx.closePath();
        ctx.fill();
      } else {
        // standard square pixel
        ctx.fillRect(x, y, cellSize + 0.1, cellSize + 0.1);
      }
    }
  }

  ctx.restore();
}
