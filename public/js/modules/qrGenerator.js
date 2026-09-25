/**
 * QrNova QR Generator Engine
 * Multi-format Generator with Live Canvas & SVG Rendering
 */

import { encryptData } from './cryptoEngine.js';

let currentQrData = {
  type: 'url',
  payload: 'https://qrnova.dev',
  rawInput: {},
  style: {
    foreground: '#FFB1B1',
    background: '#140D12',
    ecc: 'M',
    size: 512,
    preset: 'rose',
    hasLogo: false,
    logoData: null,
  },
  expiry: 'none',
  customExpiryDate: null,
  isProtected: false,
  password: '',
};

const PRESETS = {
  rose: { foreground: '#FFB1B1', background: '#140D12' },
  peach: { foreground: '#FFDBB0', background: '#170F15' },
  coral: { foreground: '#FFCCB8', background: '#1E131B' },
  cream: { foreground: '#FFFAD3', background: '#261922' },
  warmPaper: { foreground: '#1F0D12', background: '#FFFAD3' },
  cyber: { foreground: '#FFB1B1', background: '#140D12' },
  aurora: { foreground: '#FFCCB8', background: '#1E131B' },
  emerald: { foreground: '#34d399', background: '#0d1a14' },
  sunset: { foreground: '#FFDBB0', background: '#170F15' },
  monochrome: { foreground: '#1F0D12', background: '#FFFAD3' },
};

let lastRenderedHash = '';

/**
 * Construct raw string payload from active form inputs
 */
export function buildPayloadFromInputs(type, inputs) {
  switch (type) {
    case 'url': {
      let url = (inputs.url || '').trim();
      if (url && !/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      return url || 'https://qrnova.dev';
    }
    case 'wifi': {
      const ssid = (inputs.ssid || '').trim();
      const pass = (inputs.password || '').trim();
      const enc = inputs.encryption || 'WPA';
      const hidden = Boolean(inputs.hidden);
      return `WIFI:T:${enc};S:${ssid};P:${pass};H:${hidden ? 'true' : 'false'};;`;
    }
    case 'vcard': {
      const fn = (inputs.fullName || '').trim();
      const org = (inputs.org || '').trim();
      const title = (inputs.title || '').trim();
      const tel = (inputs.phone || '').trim();
      const email = (inputs.email || '').trim();
      const url = (inputs.website || '').trim();
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${fn}\nORG:${org}\nTITLE:${title}\nTEL:${tel}\nEMAIL:${email}\nURL:${url}\nEND:VCARD`;
    }
    case 'email': {
      const to = (inputs.emailTo || '').trim();
      const subj = encodeURIComponent((inputs.emailSubj || '').trim());
      const body = encodeURIComponent((inputs.emailBody || '').trim());
      return `mailto:${to}?subject=${subj}&body=${body}`;
    }
    case 'phone': {
      const tel = (inputs.phoneNum || '').trim();
      return `tel:${tel}`;
    }
    case 'sms': {
      const num = (inputs.smsNum || '').trim();
      const msg = (inputs.smsMsg || '').trim();
      return `smsto:${num}:${msg}`;
    }
    case 'geo': {
      const lat = (inputs.geoLat || '0').trim();
      const lng = (inputs.geoLng || '0').trim();
      return `geo:${lat},${lng}`;
    }
    case 'social': {
      const platform = inputs.socialPlatform || 'twitter';
      const user = (inputs.socialUser || '').trim().replace('@', '');
      const map = {
        twitter: `https://x.com/${user}`,
        instagram: `https://instagram.com/${user}`,
        linkedin: `https://linkedin.com/in/${user}`,
        github: `https://github.com/${user}`,
        youtube: `https://youtube.com/@${user}`,
      };
      return map[platform] || `https://${platform}.com/${user}`;
    }
    case 'file': {
      return (inputs.fileBase64 || '').trim() || 'data:text/plain;charset=utf-8,QrNovaEmptyFile';
    }
    case 'text':
    default: {
      return (inputs.text || '').trim() || 'Welcome to QrNova';
    }
  }
}

/**
 * Render QR code on an HTML5 Canvas element
 */
export async function renderQrToCanvas(canvas, payload, style = currentQrData.style) {
  if (!canvas) return;
  if (typeof qrcode === 'undefined') {
    console.error('qrcode-generator library not loaded.');
    return;
  }

  // TypeNumber 0 = auto sizing, ECC level L/M/Q/H
  const ecc = style.hasLogo ? 'H' : (style.ecc || 'M');
  const qr = qrcode(0, ecc);
  qr.addData(payload);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const targetSize = style.size || 512;
  const margin = Math.round(targetSize * 0.08); // 8% quiet zone
  const usableSize = targetSize - margin * 2;
  const cellSize = usableSize / moduleCount;

  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');

  // Draw background
  ctx.fillStyle = style.background || '#ffffff';
  ctx.fillRect(0, 0, targetSize, targetSize);

  // Draw QR Modules
  ctx.fillStyle = style.foreground || '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        const x = margin + col * cellSize;
        const y = margin + row * cellSize;
        ctx.fillRect(x, y, cellSize + 0.5, cellSize + 0.5);
      }
    }
  }

  // Optional: Center Logo Embedding
  if (style.hasLogo && style.logoData) {
    await drawCenterLogo(ctx, style.logoData, targetSize);
  }
}

/**
 * Overlay center logo with clean circular/rounded white border
 */
function drawCenterLogo(ctx, logoDataUrl, qrSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const logoSize = Math.round(qrSize * 0.22); // 22% size
      const center = qrSize / 2;
      const x = center - logoSize / 2;
      const y = center - logoSize / 2;
      const pad = 6;

      // Draw white badge background behind logo for contrast
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(center, center, (logoSize / 2) + pad, 0, 2 * Math.PI);
      ctx.fill();

      // Clip logo in circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, logoSize / 2, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(img, x, y, logoSize, logoSize);
      ctx.restore();
      resolve();
    };
    img.onerror = () => resolve();
    img.src = logoDataUrl;
  });
}

/**
 * Generate SVG Tag string
 */
export function generateQrSvg(payload, style = currentQrData.style) {
  if (typeof qrcode === 'undefined') return '';
  const ecc = style.hasLogo ? 'H' : (style.ecc || 'M');
  const qr = qrcode(0, ecc);
  qr.addData(payload);
  qr.make();
  return qr.createSvgTag({
    cellSize: 8,
    margin: 4,
    scalable: true,
  });
}

/**
 * Calculate Expiry Date from preset
 */
export function calculateExpiryDate(preset, customDateStr) {
  if (preset === 'none' || !preset) return null;
  const now = new Date();

  switch (preset) {
    case '5m': return new Date(now.getTime() + 5 * 60 * 1000);
    case '15m': return new Date(now.getTime() + 15 * 60 * 1000);
    case '30m': return new Date(now.getTime() + 30 * 60 * 1000);
    case '1h': return new Date(now.getTime() + 60 * 60 * 1000);
    case '6h': return new Date(now.getTime() + 6 * 60 * 60 * 1000);
    case '12h': return new Date(now.getTime() + 12 * 60 * 60 * 1000);
    case '24h': return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '7d': return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'custom': return customDateStr ? new Date(customDateStr) : null;
    default: return null;
  }
}

/**
 * Apply a preset style
 */
export function applyPreset(presetName) {
  if (PRESETS[presetName]) {
    currentQrData.style.preset = presetName;
    currentQrData.style.foreground = PRESETS[presetName].foreground;
    currentQrData.style.background = PRESETS[presetName].background;
  }
  return currentQrData.style;
}

export { currentQrData, PRESETS };
