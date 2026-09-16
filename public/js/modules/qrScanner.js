/**
 * QrNova QR Scanner Engine
 * Device Camera Scanner & File Drag-and-Drop Parser with Security Checks
 */

let html5QrCodeScanner = null;
let isScannerRunning = false;
let availableCameras = [];
let currentCameraId = null;

/**
 * Initialize camera list and check permissions
 */
export async function getCameras() {
  if (typeof Html5Qrcode === 'undefined') return [];
  try {
    const devices = await Html5Qrcode.getCameras();
    availableCameras = devices;
    return devices;
  } catch (err) {
    console.warn('Could not enumerate cameras:', err.message);
    return [];
  }
}

/**
 * Start live camera scanner
 */
export async function startCameraScanner(elementId, onScanSuccess, onScanError) {
  if (typeof Html5Qrcode === 'undefined') {
    throw new Error('Html5Qrcode library is not loaded.');
  }

  if (isScannerRunning) {
    await stopCameraScanner();
  }

  html5QrCodeScanner = new Html5Qrcode(elementId);

  // Configuration prioritizing mobile rear camera
  const config = {
    fps: 15,
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
  };

  try {
    // Prefer environment/back camera if available
    const cameraSetting = { facingMode: 'environment' };
    await html5QrCodeScanner.start(
      cameraSetting,
      config,
      (decodedText, decodedResult) => {
        onScanSuccess?.(decodedText, decodedResult);
      },
      (errorMessage) => {
        // Continuous scan tick; usually ignored unless debugging
        onScanError?.(errorMessage);
      }
    );
    isScannerRunning = true;
  } catch (err) {
    // Fallback: try default camera if facingMode: environment failed
    try {
      await html5QrCodeScanner.start(
        { facingMode: 'user' },
        config,
        (decodedText, decodedResult) => {
          onScanSuccess?.(decodedText, decodedResult);
        },
        () => {}
      );
      isScannerRunning = true;
    } catch (fallbackErr) {
      isScannerRunning = false;
      let userMsg = fallbackErr.message;
      if (fallbackErr.name === 'NotAllowedError') {
        userMsg = 'Camera permission denied. Please allow camera access in browser permissions.';
      }
      throw new Error(userMsg);
    }
  }
}

/**
 * Stop live camera scanner
 */
export async function stopCameraScanner() {
  if (html5QrCodeScanner && isScannerRunning) {
    try {
      await html5QrCodeScanner.stop();
    } catch (e) {
      console.warn('Error stopping scanner:', e);
    }
    isScannerRunning = false;
  }
}

export function isCameraActive() {
  return isScannerRunning;
}

/**
 * Scan static image file using jsQR / Html5Qrcode
 */
export async function scanImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'));

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0, img.width, img.height);

        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        if (typeof jsQR !== 'undefined') {
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          });
          if (code && code.data) {
            return resolve(code.data);
          }
        }

        // Try with Html5Qrcode file scan
        if (typeof Html5Qrcode !== 'undefined') {
          const scanner = new Html5Qrcode('qr-reader-hidden', { verbose: false });
          scanner
            .scanFile(file, true)
            .then((decodedText) => resolve(decodedText))
            .catch(() => reject(new Error('Could not find a valid QR code in this image.')));
          return;
        }

        reject(new Error('No QR code detected in the uploaded image. Please try a clearer picture.'));
      };
      img.onerror = () => reject(new Error('Failed to load image file.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Error reading file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Evaluate URL security risks before opening
 * @returns {{ isSafe: boolean, warnings: string[], isUrl: boolean }}
 */
export function evaluateUrlSecurity(text) {
  if (!text) return { isSafe: true, warnings: [], isUrl: false };
  const trimmed = text.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    return { isSafe: true, warnings: [], isUrl: false };
  }

  const warnings = [];

  try {
    const url = new URL(trimmed);

    // 1. Unencrypted HTTP warning
    if (url.protocol === 'http:') {
      warnings.push('Connection is unencrypted (HTTP). Data transmitted could be intercepted.');
    }

    // 2. IP Address destination check
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname);
    if (isIp) {
      warnings.push('Destination uses a raw IP address instead of a recognized domain name.');
    }

    // 3. Dangerous file extension
    const dangerousExts = ['.exe', '.scr', '.bat', '.vbs', '.apk', '.msi', '.cmd', '.jar'];
    const pathname = url.pathname.toLowerCase();
    for (const ext of dangerousExts) {
      if (pathname.endsWith(ext)) {
        warnings.push(`Link targets an executable file (${ext}). Opening this could harm your device.`);
        break;
      }
    }

    // 4. Excessive subdomains or deceptive lookalikes
    const subdomains = url.hostname.split('.');
    if (subdomains.length > 4) {
      warnings.push('Domain contains unusually high number of subdomains, which is common in phishing attacks.');
    }

    return {
      isSafe: warnings.length === 0,
      warnings,
      isUrl: true,
      hostname: url.hostname,
      fullUrl: trimmed,
    };
  } catch {
    return { isSafe: false, warnings: ['Malformed URL structure.'], isUrl: true };
  }
}
