/**
 * QrNova AI-Readable Content & Structured Formatter
 */

/**
 * Detect QR Content Type
 */
export function detectContentType(raw) {
  if (!raw) return 'text';
  const str = raw.trim();

  if (str.startsWith('QREncrypted:v1:')) return 'encrypted';
  if (str.startsWith('WIFI:')) return 'wifi';
  if (str.startsWith('BEGIN:VCARD')) return 'vcard';
  if (str.startsWith('http://') || str.startsWith('https://')) return 'url';
  if (str.startsWith('geo:')) return 'geo';
  if (str.startsWith('tel:')) return 'phone';
  if (str.startsWith('mailto:')) return 'email';
  if (str.startsWith('smsto:') || str.startsWith('sms:')) return 'sms';
  if (str.startsWith('data:image/') || str.startsWith('data:')) return 'file';

  return 'text';
}

/**
 * Format raw content into a clean, human-readable structured layout
 */
export function formatReadableContent(raw) {
  const type = detectContentType(raw);
  const trimmed = raw.trim();

  switch (type) {
    case 'wifi': {
      const ssid = trimmed.match(/S:([^;]+);/)?.[1] || 'Unknown';
      const password = trimmed.match(/P:([^;]+);/)?.[1] || '(None / Open)';
      const typeAuth = trimmed.match(/T:([^;]+);/)?.[1] || 'WPA';
      const hidden = trimmed.includes('H:true');
      return `
        <div class="readable-card readable-wifi">
          <div class="readable-field"><strong>Network Name (SSID):</strong> <span>${escapeHtml(ssid)}</span></div>
          <div class="readable-field"><strong>Password:</strong> <code class="secret-blur" onclick="this.classList.toggle('revealed')">${escapeHtml(password)} (click to reveal)</code></div>
          <div class="readable-field"><strong>Security:</strong> <span>${escapeHtml(typeAuth)}</span></div>
          <div class="readable-field"><strong>Hidden Network:</strong> <span>${hidden ? 'Yes' : 'No'}</span></div>
        </div>
      `;
    }
    case 'vcard': {
      const fn = trimmed.match(/FN:([^\r\n]+)/)?.[1] || 'Unnamed Contact';
      const tel = trimmed.match(/TEL.*:([^\r\n]+)/)?.[1] || 'N/A';
      const email = trimmed.match(/EMAIL.*:([^\r\n]+)/)?.[1] || 'N/A';
      const org = trimmed.match(/ORG:([^\r\n]+)/)?.[1] || 'N/A';
      const title = trimmed.match(/TITLE:([^\r\n]+)/)?.[1] || '';
      return `
        <div class="readable-card readable-vcard">
          <div class="readable-title">👤 ${escapeHtml(fn)}</div>
          ${title ? `<div class="readable-field"><strong>Role:</strong> <span>${escapeHtml(title)}</span></div>` : ''}
          ${org !== 'N/A' ? `<div class="readable-field"><strong>Organization:</strong> <span>${escapeHtml(org)}</span></div>` : ''}
          <div class="readable-field"><strong>Phone:</strong> <a href="tel:${escapeHtml(tel)}">${escapeHtml(tel)}</a></div>
          <div class="readable-field"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></div>
        </div>
      `;
    }
    case 'url': {
      try {
        const urlObj = new URL(trimmed);
        const isHttps = urlObj.protocol === 'https:';
        return `
          <div class="readable-card readable-url">
            <div class="readable-field"><strong>Host Domain:</strong> <span class="host-pill">${escapeHtml(urlObj.hostname)}</span></div>
            <div class="readable-field"><strong>Protocol:</strong> <span>${urlObj.protocol} ${isHttps ? '🔒 Secure' : '⚠️ Not Secure (HTTP)'}</span></div>
            <div class="readable-field"><strong>Full Destination:</strong> <code class="break-all">${escapeHtml(trimmed)}</code></div>
          </div>
        `;
      } catch {
        return `<div class="readable-card"><code class="break-all">${escapeHtml(trimmed)}</code></div>`;
      }
    }
    case 'geo': {
      const coords = trimmed.replace('geo:', '').split('?')[0];
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`;
      return `
        <div class="readable-card readable-geo">
          <div class="readable-field"><strong>Coordinates:</strong> <code>${escapeHtml(coords)}</code></div>
          <div class="readable-field"><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">🗺️ Open in Google Maps</a></div>
        </div>
      `;
    }
    case 'encrypted': {
      return `
        <div class="readable-card readable-encrypted">
          <div class="readable-title">🔒 Password-Protected QR Code</div>
          <p>The payload is securely encrypted using AES-256-GCM. Enter the author's password to decrypt and view.</p>
        </div>
      `;
    }
    default:
      return `<div class="readable-card"><p class="break-all">${escapeHtml(trimmed)}</p></div>`;
  }
}

/**
 * Call AI Analysis endpoint
 */
export async function fetchAiAnalysis(content) {
  try {
    const res = await fetch('/api/qr/ai-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type: detectContentType(content) }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return {
      success: false,
      error: 'Could not connect to AI service.',
    };
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
