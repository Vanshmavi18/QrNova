/**
 * QrNova Application Master Coordinator
 * Connects UI, Web APIs, Generator, Scanner, History, Vault, Crypto, Voice, and Auth
 */

import {
  currentQrData,
  PRESETS,
  buildPayloadFromInputs,
  renderQrToCanvas,
  generateQrSvg,
  calculateExpiryDate,
  applyPreset,
} from './modules/qrGenerator.js';

import {
  getCameras,
  startCameraScanner,
  stopCameraScanner,
  scanImageFile,
  evaluateUrlSecurity,
  isCameraActive,
} from './modules/qrScanner.js';

import {
  encryptData,
  decryptData,
  isEncryptedPayload,
  calculatePasswordStrength,
} from './modules/cryptoEngine.js';

import {
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  startVoiceRecognition,
  stopVoiceRecognition,
  isCurrentlyRecording,
  speakText,
  pauseSpeech,
  resumeSpeech,
  stopSpeech,
  getVoices,
} from './modules/voiceEngine.js';

import {
  detectContentType,
  formatReadableContent,
  fetchAiAnalysis,
} from './modules/aiEngine.js';

import {
  loadHistory,
  recordHistoryItem,
  updateHistoryItem,
  deleteHistoryItem,
  clearAllHistory,
  isItemExpired,
  isItemExpiringSoon,
  migrateGuestItemsToUser,
} from './modules/historyManager.js';

import {
  getSavedQrs,
  saveQrToVault,
  removeFromVault,
} from './modules/savedManager.js';

import {
  initAuth,
  getCurrentUser,
  getAuthToken,
  isAuthenticated,
  loginUser,
  loginWithPassword,
  requestSignupOtp,
  verifySignupOtp,
  requestPasswordReset,
  confirmPasswordReset,
  requestOtp,
  verifyOtp,
  registerWithPassword,
  signOut,
} from './modules/authModal.js';

import {
  initA11y,
  setTheme,
  setLargeText,
  setSoundEnabled,
  isSoundOn,
  announceToScreenReader,
  playChime,
} from './modules/a11yManager.js';

/* ==================================================
   STATE & DOM ELEMENTS
================================================== */
let activeTab = 'generate';
let activeQrType = 'url';
let currentScannedPayload = '';
let scanHistoryItems = [];
let genHistoryItems = [];
let savedQrItems = [];
let pendingEmailForOtp = '';

// DOM Elements
const canvas = document.getElementById('qr-canvas');
const toastContainer = document.getElementById('toast-container');

/* ==================================================
   INITIALIZATION
================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initA11y();
  initAuth();
  updateAuthUI();

  setupNavigation();
  setupGeneratorEvents();
  setupScannerEvents();
  setupHistoryEvents();
  setupSavedEvents();
  setupVoiceEvents();
  setupAuthModalEvents();
  setupSettingsEvents();
  setupDynamicRouteHandler();

  // Initial QR code generation
  await refreshGeneratorPreview();
});

/* ==================================================
   TOAST SYSTEM
================================================== */
export function showToast(message, type = 'info', duration = 4000) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️',
  };

  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> <div>${escapeHtml(message)}</div>`;
  toastContainer.appendChild(toast);

  announceToScreenReader(message);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

/* ==================================================
   NAVIGATION & TAB ROUTING
================================================== */
function setupNavigation() {
  const navLinks = document.querySelectorAll('[data-target-tab]');
  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-target-tab');
      switchTab(target);
    });
  });

  // Quick Action cards on top
  document.querySelectorAll('.quick-action-card').forEach((card) => {
    card.addEventListener('click', () => {
      const target = card.getAttribute('data-action');
      if (target === 'voice-qr') {
        switchTab('generate');
        openVoiceToQrModal();
      } else {
        switchTab(target);
      }
    });
  });
}

function switchTab(tabId) {
  activeTab = tabId;

  // Stop camera if moving away from scanner
  if (tabId !== 'scan' && isCameraActive()) {
    stopCameraScanner();
    const btn = document.getElementById('btn-toggle-camera');
    if (btn) btn.textContent = '📷 Start Camera';
  }

  // Update nav links
  document.querySelectorAll('[data-target-tab]').forEach((el) => {
    if (el.getAttribute('data-target-tab') === tabId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Show active tab pane
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    if (pane.id === `tab-${tabId}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  playChime('click');

  // Trigger tab-specific refresh
  if (tabId === 'history') refreshHistoryView();
  if (tabId === 'saved') refreshSavedView();
}

export function switchQrType(type) {
  activeQrType = type;
  document.querySelectorAll('.qr-type-selector .type-btn').forEach((btn) => {
    const isTarget = btn.getAttribute('data-type') === type;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });
  document.querySelectorAll('.type-form-pane').forEach((p) => p.classList.remove('active'));
  const activePane = document.getElementById(`form-${type}`);
  if (activePane) activePane.classList.add('active');
}

/* ==================================================
   FEATURE 1: QR GENERATOR LOGIC
================================================== */
function setupGeneratorEvents() {
  // QR Type Buttons
  const typeButtons = document.querySelectorAll('.type-btn');
  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      switchQrType(type);
      refreshGeneratorPreview();
    });
  });

  // Live input change listeners (Instantaneous 30ms debounce)
  const formInputs = document.querySelectorAll('.generator-studio input, .generator-studio textarea, .generator-studio select');
  formInputs.forEach((input) => {
    input.addEventListener('input', debounce(refreshGeneratorPreview, 30));
    input.addEventListener('change', refreshGeneratorPreview);
  });

  // Style Presets
  document.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.preset-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const presetName = chip.getAttribute('data-preset');
      const styles = applyPreset(presetName);

      // Update color input pickers
      const fgPicker = document.getElementById('gen-fg-color');
      const bgPicker = document.getElementById('gen-bg-color');
      if (fgPicker) fgPicker.value = styles.foreground;
      if (bgPicker) bgPicker.value = styles.background;

      refreshGeneratorPreview();
    });
  });

  // Custom Color Pickers
  const fgColor = document.getElementById('gen-fg-color');
  const bgColor = document.getElementById('gen-bg-color');
  if (fgColor) {
    fgColor.addEventListener('input', (e) => {
      currentQrData.style.foreground = e.target.value;
      refreshGeneratorPreview();
    });
  }
  if (bgColor) {
    bgColor.addEventListener('input', (e) => {
      currentQrData.style.background = e.target.value;
      refreshGeneratorPreview();
    });
  }

  // ECC & Resolution
  const eccSelect = document.getElementById('gen-ecc-level');
  if (eccSelect) {
    eccSelect.addEventListener('change', (e) => {
      currentQrData.style.ecc = e.target.value;
      refreshGeneratorPreview();
    });
  }

  const resSelect = document.getElementById('gen-size-res');
  if (resSelect) {
    resSelect.addEventListener('change', (e) => {
      currentQrData.style.size = parseInt(e.target.value, 10) || 512;
      refreshGeneratorPreview();
    });
  }

  // Logo Embedding
  const logoInput = document.getElementById('gen-logo-file');
  const removeLogoBtn = document.getElementById('btn-remove-logo');
  if (logoInput) {
    logoInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          currentQrData.style.hasLogo = true;
          currentQrData.style.logoData = event.target.result;
          if (removeLogoBtn) removeLogoBtn.style.display = 'inline-flex';
          showToast('Logo embedded! Auto-elevated error correction to High (H).', 'info');
          refreshGeneratorPreview();
        };
        reader.readAsDataURL(file);
      }
    });
  }
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener('click', () => {
      currentQrData.style.hasLogo = false;
      currentQrData.style.logoData = null;
      if (logoInput) logoInput.value = '';
      removeLogoBtn.style.display = 'none';
      refreshGeneratorPreview();
    });
  }

  // Accordion Toggle
  const accHeader = document.getElementById('accordion-advanced-header');
  const accBody = document.getElementById('accordion-advanced-body');
  if (accHeader && accBody) {
    accHeader.addEventListener('click', () => {
      accBody.classList.toggle('open');
      const icon = accHeader.querySelector('.accordion-icon');
      if (icon) icon.textContent = accBody.classList.contains('open') ? '▲' : '▼';
    });
  }

  // Password Protection Toggle
  const protectToggle = document.getElementById('gen-password-protect-toggle');
  const passwordContainer = document.getElementById('gen-password-input-container');
  const passwordInput = document.getElementById('gen-password-input');
  const passwordMeterFill = document.getElementById('password-meter-fill');
  const passwordMeterLabel = document.getElementById('password-meter-label');

  if (protectToggle && passwordContainer) {
    protectToggle.addEventListener('change', (e) => {
      currentQrData.isProtected = e.target.checked;
      passwordContainer.style.display = e.target.checked ? 'block' : 'none';
      refreshGeneratorPreview();
    });
  }

  if (passwordInput && passwordMeterFill) {
    passwordInput.addEventListener('input', (e) => {
      currentQrData.password = e.target.value;
      const strength = calculatePasswordStrength(e.target.value);
      passwordMeterFill.style.width = `${(strength.score / 4) * 100}%`;
      passwordMeterFill.style.backgroundColor = strength.color;
      if (passwordMeterLabel) passwordMeterLabel.textContent = `Strength: ${strength.label}`;
      refreshGeneratorPreview();
    });
  }

  // Expiration Preset Selector
  const expirySelect = document.getElementById('gen-expiry-preset');
  const customExpiryInput = document.getElementById('gen-custom-expiry-date');
  if (expirySelect) {
    expirySelect.addEventListener('change', (e) => {
      currentQrData.expiry = e.target.value;
      if (customExpiryInput) {
        customExpiryInput.style.display = e.target.value === 'custom' ? 'block' : 'none';
      }
      refreshGeneratorPreview();
    });
  }
  if (customExpiryInput) {
    customExpiryInput.addEventListener('change', (e) => {
      currentQrData.customExpiryDate = e.target.value;
      refreshGeneratorPreview();
    });
  }

  // Action: Download PNG
  document.getElementById('btn-download-png')?.addEventListener('click', () => {
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `QrNova-${activeQrType}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    playChime('success');
    showToast('Downloaded high-resolution PNG image.', 'success');
  });

  // Action: Download SVG
  document.getElementById('btn-download-svg')?.addEventListener('click', () => {
    const svgString = generateQrSvg(currentQrData.payload, currentQrData.style);
    if (!svgString) return;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `QrNova-${activeQrType}-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    playChime('success');
    showToast('Downloaded scalable vector graphic (SVG).', 'success');
  });

  // Action: Copy Raw Payload
  document.getElementById('btn-copy-payload')?.addEventListener('click', async () => {
    if (!currentQrData.payload) return;
    try {
      await navigator.clipboard.writeText(currentQrData.payload);
      playChime('success');
      showToast('Copied QR code payload to clipboard.', 'success');
    } catch {
      showToast('Clipboard access denied.', 'error');
    }
  });

  // Action: Copy Image to Clipboard
  document.getElementById('btn-copy-image')?.addEventListener('click', async () => {
    if (!canvas || !navigator.clipboard?.write) {
      showToast('Copying images directly is not supported in this browser.', 'warning');
      return;
    }
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        playChime('success');
        showToast('QR code image copied directly to clipboard!', 'success');
      });
    } catch (err) {
      showToast('Could not copy image to clipboard.', 'error');
    }
  });

  // Action: Web Share API
  document.getElementById('btn-share-qr')?.addEventListener('click', async () => {
    if (!canvas) return;
    if (navigator.share) {
      try {
        canvas.toBlob(async (blob) => {
          const file = new File([blob], 'qrnova-code.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'QrNova QR Code',
              text: 'Check out this QR code generated with QrNova',
              files: [file],
            });
          } else {
            await navigator.share({
              title: 'QrNova QR Code',
              text: currentQrData.payload,
            });
          }
          playChime('success');
        });
      } catch (e) {
        if (e.name !== 'AbortError') showToast('Share error: ' + e.message, 'error');
      }
    } else {
      showToast('Web Share API is not available on this device.', 'warning');
    }
  });

  // Action: Print Friendly Preview
  document.getElementById('btn-print-qr')?.addEventListener('click', () => {
    window.print();
  });

  // Action: Save to "My QR"
  document.getElementById('btn-save-generated-qr')?.addEventListener('click', async () => {
    openSaveModal({
      title: `${activeQrType.toUpperCase()} QR - ${new Date().toLocaleDateString()}`,
      notes: '',
      type: activeQrType,
      payload: currentQrData.payload,
      styleConfig: currentQrData.style,
      isPasswordProtected: currentQrData.isProtected,
      expiryDate: calculateExpiryDate(currentQrData.expiry, currentQrData.customExpiryDate),
      source: 'generated',
    });
  });

  // Action: Clear / Reset Form
  document.getElementById('btn-reset-generator')?.addEventListener('click', () => {
    const activePane = document.getElementById(`form-${activeQrType}`);
    if (activePane) {
      activePane.querySelectorAll('input, textarea').forEach((i) => (i.value = ''));
    }
    refreshGeneratorPreview();
    showToast('Generator inputs cleared.', 'info');
  });
}

let lastRecordedPayload = '';
const debouncedRecordHistory = debounce((item, token) => {
  if (item.payload && item.payload !== lastRecordedPayload) {
    lastRecordedPayload = item.payload;
    recordHistoryItem(item, token);
  }
}, 1500);

/**
 * Regenerate canvas preview from current inputs
 */
async function refreshGeneratorPreview() {
  const inputs = getActiveFormInputs();
  let payload = buildPayloadFromInputs(activeQrType, inputs);

  // If password protected, encrypt the payload
  if (currentQrData.isProtected && currentQrData.password) {
    try {
      payload = await encryptData(payload, currentQrData.password);
    } catch (e) {
      console.warn('Encryption pending valid password:', e.message);
    }
  }

  currentQrData.payload = payload;

  if (canvas) {
    await renderQrToCanvas(canvas, payload, currentQrData.style);
  }

  // Record to history cache when typing settles
  debouncedRecordHistory(
    {
      title: `${activeQrType.toUpperCase()} QR`,
      type: activeQrType,
      payload: payload,
      styleConfig: currentQrData.style,
      isPasswordProtected: currentQrData.isProtected,
      expiryDate: calculateExpiryDate(currentQrData.expiry, currentQrData.customExpiryDate),
      source: 'generated',
    },
    getAuthToken()
  );
}

function getActiveFormInputs() {
  const inputs = {};
  const activePane = document.getElementById(`form-${activeQrType}`);
  if (activePane) {
    activePane.querySelectorAll('input, textarea, select').forEach((field) => {
      const name = field.getAttribute('name') || field.id;
      if (field.type === 'checkbox') {
        inputs[name] = field.checked;
      } else {
        inputs[name] = field.value;
      }
    });
  }
  return inputs;
}

/* ==================================================
   FEATURE 2: QR SCANNER LOGIC
================================================== */
function setupScannerEvents() {
  const toggleCamBtn = document.getElementById('btn-toggle-camera');
  const fileInput = document.getElementById('scanner-file-input');
  const dropzone = document.getElementById('scanner-dropzone');

  // Camera Toggle
  if (toggleCamBtn) {
    toggleCamBtn.addEventListener('click', async () => {
      if (isCameraActive()) {
        await stopCameraScanner();
        toggleCamBtn.textContent = '📷 Start Camera';
        toggleCamBtn.classList.remove('btn-danger');
        toggleCamBtn.classList.add('btn-primary');
        showToast('Camera stopped.', 'info');
      } else {
        try {
          toggleCamBtn.textContent = '⏳ Starting Camera...';
          await startCameraScanner('scanner-viewfinder', onScanSuccess, onScanError);
          toggleCamBtn.textContent = '⏹️ Stop Camera';
          toggleCamBtn.classList.remove('btn-primary');
          toggleCamBtn.classList.add('btn-danger');
          playChime('click');
        } catch (err) {
          toggleCamBtn.textContent = '📷 Start Camera';
          showToast(err.message, 'error', 6000);
          playChime('error');
        }
      }
    });
  }

  // Image Upload File Input
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        handleImageScan(file);
      }
    });
  }

  // Drag and Drop
  if (dropzone) {
    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleImageScan(file);
    });

    dropzone.addEventListener('click', () => fileInput?.click());
  }

  // Auto-open toggle
  const autoOpenToggle = document.getElementById('scan-auto-open-toggle');
  if (autoOpenToggle) {
    autoOpenToggle.checked = localStorage.getItem('qrnova_auto_open') === 'true';
    autoOpenToggle.addEventListener('change', (e) => {
      localStorage.setItem('qrnova_auto_open', e.target.checked ? 'true' : 'false');
      showToast(e.target.checked ? '⚡ Auto-open enabled: links will open immediately on scan' : 'Auto-open disabled', 'info');
    });
  }

  // Copy Direct Link button
  document.getElementById('btn-scan-copy-link')?.addEventListener('click', async () => {
    const anchor = document.getElementById('scan-direct-link-anchor');
    if (anchor?.href) {
      await navigator.clipboard.writeText(anchor.href);
      playChime('success');
      showToast('Direct link copied to clipboard!', 'success');
    }
  });

  // Result Actions
  document.getElementById('btn-scan-copy')?.addEventListener('click', async () => {
    if (!currentScannedPayload) return;
    await navigator.clipboard.writeText(currentScannedPayload);
    playChime('success');
    showToast('Decoded content copied to clipboard!', 'success');
  });

  document.getElementById('btn-scan-again')?.addEventListener('click', () => {
    currentScannedPayload = '';
    const resultCard = document.getElementById('scan-result-card');
    if (resultCard) resultCard.style.display = 'none';
    if (!isCameraActive()) toggleCamBtn?.click();
  });

  document.getElementById('btn-scan-save')?.addEventListener('click', () => {
    if (!currentScannedPayload) return;
    openSaveModal({
      title: `Scanned QR - ${new Date().toLocaleTimeString()}`,
      notes: '',
      type: detectContentType(currentScannedPayload),
      payload: currentScannedPayload,
      source: 'scanned',
    });
  });

  // Feature 7: AI Readable Button
  document.getElementById('btn-scan-ai-readable')?.addEventListener('click', async () => {
    if (!currentScannedPayload) return;
    const aiContainer = document.getElementById('ai-readable-container');
    if (!aiContainer) return;

    aiContainer.innerHTML = '<div class="ai-summary-card"><p>🤖 <em>Analyzing QR structure with AI intelligence...</em></p></div>';
    aiContainer.style.display = 'block';

    const aiRes = await fetchAiAnalysis(currentScannedPayload);
    if (aiRes.success) {
      aiContainer.innerHTML = `
        <div class="ai-summary-card">
          <div class="ai-header">
            <strong>${escapeHtml(aiRes.provider || 'AI Analysis')}</strong>
            <span class="ai-badge">AI Verified</span>
          </div>
          <div class="ai-body">${markdownToHtml(aiRes.analysis)}</div>
          <div class="ai-disclaimer">⚠️ ${escapeHtml(aiRes.disclaimer)}</div>
        </div>
      `;
      playChime('success');
    } else {
      aiContainer.innerHTML = `<div class="ai-summary-card"><p class="text-danger">Could not analyze: ${escapeHtml(aiRes.error || 'Service unavailable')}</p></div>`;
    }
  });

  // Feature 8: Read Aloud Button
  document.getElementById('btn-scan-speak')?.addEventListener('click', () => {
    if (!currentScannedPayload) return;
    const ttsPlayer = document.getElementById('tts-player-container');
    if (ttsPlayer) ttsPlayer.style.display = 'flex';

    speakText(currentScannedPayload, {
      rate: parseFloat(document.getElementById('tts-speed-select')?.value || '1.0'),
      onStart: () => {
        document.getElementById('btn-tts-pause')?.removeAttribute('disabled');
      },
      onEnd: () => {
        playChime('success');
      },
    });
  });

  // TTS Player Bar controls
  document.getElementById('btn-tts-pause')?.addEventListener('click', pauseSpeech);
  document.getElementById('btn-tts-resume')?.addEventListener('click', resumeSpeech);
  document.getElementById('btn-tts-stop')?.addEventListener('click', () => {
    stopSpeech();
    const ttsPlayer = document.getElementById('tts-player-container');
    if (ttsPlayer) ttsPlayer.style.display = 'none';
  });
}

async function handleImageScan(file) {
  try {
    showToast('Decoding image...', 'info');
    const decodedText = await scanImageFile(file);
    onScanSuccess(decodedText);
  } catch (err) {
    playChime('error');
    showToast(err.message, 'error', 5000);
  }
}

function onScanSuccess(decodedText) {
  playChime('success');
  currentScannedPayload = decodedText;

  // Record to history
  recordHistoryItem(
    {
      title: `Scanned QR - ${new Date().toLocaleTimeString()}`,
      type: detectContentType(decodedText),
      payload: decodedText,
      source: 'scanned',
    },
    getAuthToken()
  );

  // Check if encrypted
  if (isEncryptedPayload(decodedText)) {
    openDecryptModal(decodedText);
    return;
  }

  displayScanResult(decodedText);
}

function onScanError(err) {
  // Silent frame tick
}

function displayScanResult(content) {
  const resultCard = document.getElementById('scan-result-card');
  const typeBadge = document.getElementById('scan-result-type-badge');
  const timeBadge = document.getElementById('scan-result-timestamp');
  const contentDisplay = document.getElementById('scan-decoded-content');
  const readableContainer = document.getElementById('scan-readable-view');
  const urlWarningBox = document.getElementById('scan-url-warning-box');
  const openUrlBtn = document.getElementById('btn-scan-open-url');
  const aiContainer = document.getElementById('ai-readable-container');

  // Direct accessible link elements
  const directBanner = document.getElementById('scan-direct-link-banner');
  const directAnchor = document.getElementById('scan-direct-link-anchor');
  const directOpenBtn = document.getElementById('scan-direct-open-btn');
  const directDomain = document.getElementById('scan-direct-domain');

  if (resultCard) resultCard.style.display = 'flex';
  if (aiContainer) aiContainer.style.display = 'none';

  const type = detectContentType(content);
  if (typeBadge) typeBadge.textContent = type.toUpperCase();
  if (timeBadge) timeBadge.textContent = new Date().toLocaleTimeString();

  // Security Check for URLs & Direct Link Banner
  const security = evaluateUrlSecurity(content);
  if (security.isUrl) {
    if (directBanner) {
      directBanner.style.display = 'flex';
      if (directDomain) directDomain.textContent = security.hostname || 'Web Destination';
      if (directAnchor) {
        directAnchor.href = security.fullUrl;
        directAnchor.target = '_blank';
        directAnchor.rel = 'noopener noreferrer';
        directAnchor.textContent = security.fullUrl;
      }
      if (directOpenBtn) {
        directOpenBtn.href = security.fullUrl;
        directOpenBtn.target = '_blank';
        directOpenBtn.rel = 'noopener noreferrer';
        directOpenBtn.onclick = null; // Native navigation works 100% reliably on all mobile & desktop browsers
      }
    }

    if (contentDisplay) {
      contentDisplay.innerHTML = `<a href="${escapeHtml(security.fullUrl)}" target="_blank" rel="noopener noreferrer" class="clickable-decoded-link" title="Click to open link directly">${escapeHtml(content)} ↗</a>`;
    }

    if (openUrlBtn) {
      openUrlBtn.style.display = 'inline-flex';
      openUrlBtn.onclick = (e) => {
        e.preventDefault();
        openUrlDirectly(security.fullUrl);
      };
    }

    if (urlWarningBox) {
      if (!security.isSafe) {
        urlWarningBox.style.display = 'flex';
        urlWarningBox.innerHTML = `⚠️ <strong>Security Advisory:</strong><br>${security.warnings.join('<br>')}`;
      } else {
        urlWarningBox.style.display = 'none';
      }
    }

    // Auto-open if configured by user
    if (localStorage.getItem('qrnova_auto_open') === 'true') {
      let opened = false;
      try {
        const win = window.open(security.fullUrl, '_blank', 'noopener,noreferrer');
        if (win && !win.closed && typeof win.closed !== 'undefined') {
          opened = true;
        }
      } catch {}

      if (opened) {
        showToast('🚀 Opening scanned link in new tab...', 'success');
      } else {
        showToast('⚡ Link ready! Tap "Open Link" below.', 'info');
        directOpenBtn?.focus();
      }
    }
  } else {
    if (directBanner) directBanner.style.display = 'none';
    if (contentDisplay) contentDisplay.textContent = content;
    if (openUrlBtn) openUrlBtn.style.display = 'none';
    if (urlWarningBox) urlWarningBox.style.display = 'none';
  }

  // Feature 7: Human Readable View
  if (readableContainer) {
    readableContainer.innerHTML = formatReadableContent(content);
  }

  showToast(`Successfully decoded ${type.toUpperCase()} QR code!`, 'success');
}

function openUrlDirectly(url) {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ==================================================
   FEATURE 6: PASSWORD PROTECTION DECRYPT MODAL
================================================== */
function openDecryptModal(encryptedPayload) {
  const modal = document.getElementById('modal-decrypt');
  const pwdInput = document.getElementById('decrypt-password-input');
  const errBox = document.getElementById('decrypt-error-box');
  if (!modal || !pwdInput) return;

  pwdInput.value = '';
  if (errBox) errBox.style.display = 'none';
  modal.classList.add('active');

  const submitBtn = document.getElementById('btn-decrypt-submit');
  const newSubmitBtn = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

  newSubmitBtn.addEventListener('click', async () => {
    const password = pwdInput.value;
    if (!password) {
      if (errBox) {
        errBox.textContent = 'Please enter the decryption password.';
        errBox.style.display = 'block';
      }
      return;
    }

    try {
      const plaintext = await decryptData(encryptedPayload, password);
      modal.classList.remove('active');
      playChime('success');
      showToast('Payload unlocked and decrypted successfully!', 'success');
      displayScanResult(plaintext);
    } catch (err) {
      playChime('error');
      if (errBox) {
        errBox.textContent = err.message || 'Incorrect password.';
        errBox.style.display = 'block';
      }
    }
  });

  document.getElementById('btn-decrypt-cancel')?.addEventListener('click', () => {
    modal.classList.remove('active');
  });
}

/* ==================================================
   FEATURE 3: HISTORY SYSTEM
================================================== */
function setupHistoryEvents() {
  const searchInput = document.getElementById('history-search-input');
  const typeFilter = document.getElementById('history-type-filter');
  const sourceTabs = document.querySelectorAll('.history-source-tab');
  const clearBtn = document.getElementById('btn-history-clear-all');

  let activeSource = 'all';

  sourceTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      sourceTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeSource = tab.getAttribute('data-source');
      refreshHistoryView();
    });
  });

  if (searchInput) searchInput.addEventListener('input', debounce(refreshHistoryView, 200));
  if (typeFilter) typeFilter.addEventListener('change', refreshHistoryView);

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear your QR history? Saved items in "My QR" will be preserved.')) {
        await clearAllHistory(activeSource === 'all' ? null : activeSource, getAuthToken());
        refreshHistoryView();
        playChime('success');
        showToast('History cleared.', 'info');
      }
    });
  }
}

async function refreshHistoryView() {
  const container = document.getElementById('history-cards-container');
  if (!container) return;

  const search = document.getElementById('history-search-input')?.value?.toLowerCase() || '';
  const type = document.getElementById('history-type-filter')?.value || 'all';
  const activeSourceTab = document.querySelector('.history-source-tab.active')?.getAttribute('data-source') || 'all';

  container.innerHTML = '<p class="text-muted">Loading history...</p>';

  const items = await loadHistory({
    source: activeSourceTab === 'all' ? null : activeSourceTab,
    token: getAuthToken(),
  });

  // Client-side filter
  const filtered = items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false;
    if (search) {
      const matchTitle = (item.title || '').toLowerCase().includes(search);
      const matchPayload = (item.payload || '').toLowerCase().includes(search);
      if (!matchTitle && !matchPayload) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
        <h3>No History Records Found</h3>
        <p>Generate or scan QR codes to see them archived here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach((item) => {
    const card = createQrCardElement(item, {
      onRegenerate: () => loadItemIntoGenerator(item),
      onDelete: async () => {
        if (confirm(`Delete "${item.title || 'this QR'}" from history?`)) {
          await deleteHistoryItem(item._id || item.id, getAuthToken());
          refreshHistoryView();
          showToast('History item deleted.', 'info');
        }
      },
      onSaveVault: () => openSaveModal(item),
      onToggleFavorite: async () => {
        const newFav = !item.isFavorite;
        await updateHistoryItem(item._id || item.id, { isFavorite: newFav }, getAuthToken());
        refreshHistoryView();
      },
    });
    container.appendChild(card);
  });
}

/* ==================================================
   FEATURE 4: SAVED QR ("MY QR") VAULT
================================================== */
function setupSavedEvents() {
  const searchInput = document.getElementById('saved-search-input');
  if (searchInput) searchInput.addEventListener('input', debounce(refreshSavedView, 200));
}

async function refreshSavedView() {
  const container = document.getElementById('saved-cards-container');
  if (!container) return;

  const userBadge = document.getElementById('saved-vault-user-badge');
  const user = getCurrentUser();
  if (userBadge) {
    if (user) {
      userBadge.textContent = `☁️ Cloud Vault (${user.name || user.email})`;
      userBadge.className = 'badge badge-active';
    } else {
      userBadge.textContent = '💾 Local Device Storage';
      userBadge.className = 'badge badge-expiring';
    }
  }

  const items = await getSavedQrs(getAuthToken());

  const filtered = items.filter((item) => {
    if (search) {
      const matchTitle = (item.title || '').toLowerCase().includes(search);
      const matchNotes = (item.notes || '').toLowerCase().includes(search);
      if (!matchTitle && !matchNotes) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
        <h3>Your Saved Vault is Empty</h3>
        <p>Save important QR codes with custom labels, notes, and expiration limits from the Generator or Scanner.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach((item) => {
    const card = createQrCardElement(item, {
      isVaultView: true,
      onRegenerate: () => loadItemIntoGenerator(item),
      onDelete: async () => {
        if (confirm(`Remove "${item.title}" from Saved QR?`)) {
          await removeFromVault(item._id || item.id, getAuthToken());
          refreshSavedView();
          showToast('Removed from My QR vault.', 'info');
        }
      },
      onEdit: () => openSaveModal(item),
      onToggleFavorite: async () => {
        const newFav = !item.isFavorite;
        await updateHistoryItem(item._id || item.id, { isFavorite: newFav }, getAuthToken());
        refreshSavedView();
      },
    });
    container.appendChild(card);
  });
}

/* ==================================================
   SHARED QR CARD COMPONENT
================================================== */
function createQrCardElement(item, { isVaultView = false, onRegenerate, onDelete, onSaveVault, onEdit, onToggleFavorite } = {}) {
  const card = document.createElement('div');
  card.className = 'glass-panel qr-item-card';

  const expired = isItemExpired(item);
  const expiringSoon = isItemExpiringSoon(item);

  let expiryBadge = '';
  if (item.expiryDate) {
    if (expired) expiryBadge = '<span class="badge badge-expired">🔴 Expired</span>';
    else if (expiringSoon) expiryBadge = '<span class="badge badge-expiring">🟡 Expiring Soon</span>';
    else expiryBadge = `<span class="badge badge-active">🟢 Active until ${new Date(item.expiryDate).toLocaleDateString()}</span>`;
  }

  card.innerHTML = `
    <div class="qr-card-header">
      <div>
        <div class="qr-card-title">${escapeHtml(item.title || 'Untitled QR')}</div>
        <div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">
          <span class="badge badge-type">${escapeHtml(item.type)}</span>
          ${item.isPasswordProtected ? '<span class="badge badge-protected">🔒 Protected</span>' : ''}
          ${expiryBadge}
        </div>
      </div>
      <button class="btn btn-icon btn-secondary btn-fav" title="Toggle Favorite">
        ${item.isFavorite ? '⭐' : '☆'}
      </button>
    </div>

    <div class="qr-card-preview-thumb">
      <canvas id="thumb-${item._id || item.id}" width="160" height="160"></canvas>
    </div>

    ${item.notes ? `<p style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.notes)}</p>` : ''}
    <p style="font-size: 0.75rem; color: var(--text-faint);">
      ${new Date(item.createdAt).toLocaleString()} • ${item.source || 'generated'}
    </p>

    <div class="qr-card-actions">
      <button class="btn btn-secondary btn-sm btn-regen" title="Load into Generator">✏️ Open</button>
      <button class="btn btn-secondary btn-sm btn-copy" title="Copy Content">📋 Copy</button>
      ${!isVaultView ? '<button class="btn btn-secondary btn-sm btn-save" title="Save to My QR">💾 Save</button>' : ''}
      ${isVaultView ? '<button class="btn btn-secondary btn-sm btn-edit" title="Edit Metadata">📝 Edit</button>' : ''}
      <button class="btn btn-danger btn-sm btn-del" title="Delete" style="margin-left: auto;">🗑️</button>
    </div>
  `;

  // Render thumbnail canvas asynchronously
  setTimeout(() => {
    const thumbCanvas = card.querySelector(`#thumb-${item._id || item.id}`);
    if (thumbCanvas) {
      renderQrToCanvas(thumbCanvas, item.payload, {
        size: 160,
        foreground: '#000000',
        background: '#ffffff',
        ecc: 'M',
      });
    }
  }, 10);

  // Attach event handlers
  card.querySelector('.btn-fav')?.addEventListener('click', onToggleFavorite);
  card.querySelector('.btn-regen')?.addEventListener('click', onRegenerate);
  card.querySelector('.btn-copy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(item.payload);
    playChime('success');
    showToast('Payload copied to clipboard.', 'success');
  });
  card.querySelector('.btn-del')?.addEventListener('click', onDelete);
  card.querySelector('.btn-save')?.addEventListener('click', onSaveVault);
  card.querySelector('.btn-edit')?.addEventListener('click', onEdit);

  return card;
}

function loadItemIntoGenerator(item) {
  switchTab('generate');
  switchQrType(item.type || 'text');

  // Fill raw text or url
  if (activeQrType === 'url') {
    const urlInput = document.querySelector('#form-url input[name="url"]');
    if (urlInput) urlInput.value = item.payload;
  } else if (activeQrType === 'text') {
    const textInput = document.querySelector('#form-text textarea[name="text"]');
    if (textInput) textInput.value = item.payload;
  }

  refreshGeneratorPreview();
  playChime('click');
  showToast(`Loaded "${item.title || 'QR'}" into Generator.`, 'info');
}

/* ==================================================
   FEATURE 4: SAVE MODAL ("MY QR")
================================================== */
function openSaveModal(item) {
  const modal = document.getElementById('modal-save-qr');
  const titleInput = document.getElementById('save-modal-title');
  const notesInput = document.getElementById('save-modal-notes');
  const expiryInput = document.getElementById('save-modal-expiry');
  if (!modal || !titleInput) return;

  titleInput.value = item.title || `${item.type?.toUpperCase() || 'QR'} Code`;
  if (notesInput) notesInput.value = item.notes || '';
  if (expiryInput) {
    if (item.expiryDate) {
      const d = new Date(item.expiryDate);
      expiryInput.value = d.toISOString().slice(0, 16);
    } else {
      expiryInput.value = '';
    }
  }

  const authBanner = document.getElementById('save-modal-auth-banner');
  const user = getCurrentUser();
  if (authBanner) {
    if (user) {
      authBanner.innerHTML = `
        <div style="background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.35); border-radius: 8px; padding: 9px 12px; font-size: 0.82rem; color: #4ade80; display: flex; align-items: center; gap: 8px;">
          <span>☁️ Storing into <strong>${escapeHtml(user.name || user.email)}</strong>'s MongoDB account</span>
        </div>
      `;
    } else {
      authBanner.innerHTML = `
        <div style="background: rgba(255, 177, 177, 0.12); border: 1px solid rgba(255, 177, 177, 0.35); border-radius: 8px; padding: 9px 12px; font-size: 0.82rem; color: var(--accent); display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <span>💡 Saving locally. <a href="#" id="link-save-modal-auth" style="color: var(--primary); font-weight: 700; text-decoration: underline;">Sign In or Register</a> to sync to MongoDB Cloud.</span>
        </div>
      `;
      document.getElementById('link-save-modal-auth')?.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.remove('active');
        openAuthModal('signup');
      });
    }
  }

  modal.classList.add('active');

  const saveBtn = document.getElementById('btn-save-modal-confirm');
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  newSaveBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const notes = notesInput.value.trim();
    const expiry = expiryInput.value ? new Date(expiryInput.value).toISOString() : null;

    if (!title) {
      showToast('Please provide a title for your QR code.', 'warning');
      return;
    }

    await saveQrToVault(item, { title, notes, expiryDate: expiry }, getAuthToken());
    modal.classList.remove('active');
    playChime('success');
    showToast(`Saved "${title}" to My QR vault!`, 'success');

    if (activeTab === 'saved') refreshSavedView();
  });

  document.getElementById('btn-save-modal-cancel')?.addEventListener('click', () => {
    modal.classList.remove('active');
  });
}

/* ==================================================
   FEATURE 8: VOICE ENGINE (STT MODAL)
================================================== */
function setupVoiceEvents() {
  const micBtn = document.getElementById('btn-voice-stt-toggle');
  const transcriptArea = document.getElementById('voice-transcript-input');
  const generateFromVoiceBtn = document.getElementById('btn-voice-to-qr-submit');
  const clearVoiceBtn = document.getElementById('btn-voice-clear');

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (isCurrentlyRecording()) {
        stopVoiceRecognition();
        micBtn.classList.remove('btn-danger');
        micBtn.classList.add('btn-primary');
        micBtn.textContent = '🎙️ Start Dictation';
        document.getElementById('voice-bars-container')?.classList.remove('recording');
      } else {
        startVoiceRecognition({
          onStart: () => {
            micBtn.classList.remove('btn-primary');
            micBtn.classList.add('btn-danger');
            micBtn.textContent = '⏹️ Stop Dictation';
            document.getElementById('voice-bars-container')?.classList.add('recording');
            playChime('click');
          },
          onInterim: (text) => {
            if (transcriptArea) transcriptArea.value = text;
          },
          onFinal: (text) => {
            if (transcriptArea) transcriptArea.value = text;
          },
          onError: (err) => {
            micBtn.classList.remove('btn-danger');
            micBtn.classList.add('btn-primary');
            micBtn.textContent = '🎙️ Start Dictation';
            document.getElementById('voice-bars-container')?.classList.remove('recording');
            showToast(err, 'error', 6000);
            playChime('error');
          },
          onEnd: () => {
            micBtn.classList.remove('btn-danger');
            micBtn.classList.add('btn-primary');
            micBtn.textContent = '🎙️ Start Dictation';
            document.getElementById('voice-bars-container')?.classList.remove('recording');
          },
        });
      }
    });
  }

  if (clearVoiceBtn && transcriptArea) {
    clearVoiceBtn.addEventListener('click', () => {
      transcriptArea.value = '';
    });
  }

  if (generateFromVoiceBtn && transcriptArea) {
    generateFromVoiceBtn.addEventListener('click', () => {
      const text = transcriptArea.value.trim();
      if (!text) {
        showToast('Please speak or enter text first.', 'warning');
        return;
      }
      switchTab('generate');
      switchQrType('text');
      const textInput = document.querySelector('#form-text textarea[name="text"]');
      if (textInput) textInput.value = text;
      refreshGeneratorPreview();
      closeModal('modal-voice-qr');
      playChime('success');
      showToast('Generated QR code from voice dictation!', 'success');
    });
  }
}

function openVoiceToQrModal() {
  const modal = document.getElementById('modal-voice-qr');
  if (modal) modal.classList.add('active');
}

/* ==================================================
   AUTHENTICATION: NEW REGISTRATION (BREVO OTP), DIRECT LOGIN & PASSWORD RESET
================================================== */
function setupAuthModalEvents() {
  const authModal = document.getElementById('modal-auth');
  const loginHeaderBtn = document.getElementById('btn-header-login');
  const signupHeaderBtn = document.getElementById('btn-header-signup');
  const logoutHeaderBtn = document.getElementById('btn-header-logout');

  // Main Tabs & Top Containers
  const authMainTabs = document.getElementById('auth-main-tabs');
  const tabBtnLogin = document.getElementById('tab-btn-auth-login');
  const tabBtnSignup = document.getElementById('tab-btn-auth-signup');

  // Panels
  const panelLogin = document.getElementById('auth-panel-login');
  const panelSignup = document.getElementById('auth-panel-signup');
  const panelReset = document.getElementById('auth-panel-reset');
  const panelOtpLogin = document.getElementById('auth-panel-otp-login');

  // Switch Links
  const linkSwitchToSignup = document.getElementById('link-switch-to-signup');
  const linkSwitchToLogin = document.getElementById('link-switch-to-login');
  const linkForgotPassword = document.getElementById('link-forgot-password');
  const linkResetToLogin = document.getElementById('link-reset-to-login');
  const btnResetCancel = document.getElementById('btn-reset-cancel');
  const btnSwitchToOtpLogin = document.getElementById('btn-switch-to-otp-login');
  const btnOtpLoginBackToPwd = document.getElementById('btn-otp-login-back-to-pwd');

  // 1. Direct Login Controls
  const loginIdentifier = document.getElementById('login-identifier');
  const loginPassword = document.getElementById('login-password');
  const btnLoginSubmit = document.getElementById('btn-login-submit');

  // 2. Sign Up Controls
  const signupStepDetails = document.getElementById('signup-step-details');
  const signupStepOtp = document.getElementById('signup-step-otp');
  const signupName = document.getElementById('signup-name');
  const signupUsername = document.getElementById('signup-username');
  const signupEmail = document.getElementById('signup-email');
  const signupPassword = document.getElementById('signup-password');
  const signupConfirmPassword = document.getElementById('signup-confirm-password');
  const btnSignupRequestOtp = document.getElementById('btn-signup-request-otp');
  const signupTargetEmailLabel = document.getElementById('signup-target-email-label');
  const signupDevOtpNotice = document.getElementById('signup-dev-otp-notice');
  const btnSignupResendOtp = document.getElementById('btn-signup-resend-otp');
  const btnSignupBackToDetails = document.getElementById('btn-signup-back-to-details');
  const btnSignupVerifyOtp = document.getElementById('btn-signup-verify-otp');

  // 3. Reset Password Controls
  const resetStepRequest = document.getElementById('reset-step-request');
  const resetStepVerify = document.getElementById('reset-step-verify');
  const resetIdentifier = document.getElementById('reset-identifier');
  const btnResetSendOtp = document.getElementById('btn-reset-send-otp');
  const resetTargetEmailLabel = document.getElementById('reset-target-email-label');
  const resetDevOtpNotice = document.getElementById('reset-dev-otp-notice');
  const resetNewPassword = document.getElementById('reset-new-password');
  const resetConfirmPassword = document.getElementById('reset-confirm-password');
  const btnResetBackToRequest = document.getElementById('btn-reset-back-to-request');
  const btnResetSubmitNewPass = document.getElementById('btn-reset-submit-new-pass');

  // 4. Fast Brevo OTP Login Controls
  const otpLoginStepEmail = document.getElementById('otp-login-step-email');
  const otpLoginStepVerify = document.getElementById('otp-login-step-verify');
  const otpLoginEmailInput = document.getElementById('otp-login-email-input');
  const btnOtpLoginSend = document.getElementById('btn-otp-login-send');
  const otpLoginTargetEmailLabel = document.getElementById('otp-login-target-email-label');
  const otpLoginDevNotice = document.getElementById('otp-login-dev-notice');
  const btnOtpLoginBackToEmail = document.getElementById('btn-otp-login-back-to-email');
  const btnOtpLoginVerify = document.getElementById('btn-otp-login-verify');

  // Pending State
  let pendingSignupData = null;
  let pendingResetEmail = '';
  let pendingOtpLoginEmail = '';

  // Password Visibility Toggles
  setupPasswordToggle('btn-toggle-login-pass', 'login-password');
  setupPasswordToggle('btn-toggle-signup-pass', 'signup-password');

  function setupPasswordToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.textContent = isPass ? '🙈' : '👁️';
    });
  }

  // OTP Group Helper: Auto-advance, backspace, and paste support
  function setupOtpDigits(digitsSelector, onComplete) {
    const digits = document.querySelectorAll(digitsSelector);
    digits.forEach((digit, index) => {
      digit.addEventListener('input', (e) => {
        if (digit.value.length >= 1) {
          digit.value = digit.value.slice(-1);
          if (index < digits.length - 1) {
            digits[index + 1].focus();
          }
        }
        const full = Array.from(digits).map(d => d.value).join('');
        if (full.length === 6 && onComplete) onComplete(full);
      });

      digit.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !digit.value && index > 0) {
          digits[index - 1].focus();
        }
      });

      digit.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').trim().replace(/\D/g, '');
        if (!text) return;
        digits.forEach((d, i) => {
          d.value = text[i] || '';
        });
        const lastIdx = Math.min(text.length, digits.length) - 1;
        if (lastIdx >= 0) digits[lastIdx].focus();
        if (text.length >= 6 && onComplete) onComplete(text.slice(0, 6));
      });
    });
    return digits;
  }

  const signupOtpDigits = setupOtpDigits('.signup-otp-digit');
  const resetOtpDigits = setupOtpDigits('.reset-otp-digit');
  const fastOtpDigits = setupOtpDigits('.fast-otp-digit');

  function clearOtpDigits(digits) {
    digits.forEach(d => { d.value = ''; });
  }

  function getOtpValue(digits) {
    let code = '';
    digits.forEach(d => { code += d.value.trim(); });
    return code;
  }

  function renderOtpDevNotice(container, otp, message, onAutofill) {
    if (!container) return;
    if (!otp) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    const isIpNotice = message && message.includes('unrecognised IP');
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
          <span style="font-size: 0.88rem; font-weight: 700; color: var(--accent-peach);">🔑 Verification Passcode:</span>
          <span class="otp-badge-code">${otp}</span>
        </div>
        <p style="font-size: 0.76rem; color: var(--text-muted); margin: 0; line-height: 1.4;">
          ${isIpNotice ? 'Brevo security detected an unverified IP. Dev passcode is ready below:' : 'Enter this 6-digit verification code to complete authentication:'}
        </p>
        <button type="button" class="btn btn-primary btn-sm" id="btn-autofill-${container.id}" style="width: 100%; margin-top: 4px; justify-content: center; font-weight: 700;">
          ⚡ Auto-Fill Passcode & Verify
        </button>
      </div>
    `;

    document.getElementById(`btn-autofill-${container.id}`)?.addEventListener('click', () => {
      onAutofill(otp.toString());
    });
  }

  // View Switching
  function showLoginPanel() {
    if (authMainTabs) authMainTabs.style.display = 'flex';
    if (panelLogin) panelLogin.style.display = 'block';
    if (panelSignup) panelSignup.style.display = 'none';
    if (panelReset) panelReset.style.display = 'none';
    if (panelOtpLogin) panelOtpLogin.style.display = 'none';

    tabBtnLogin?.classList.add('btn-primary');
    tabBtnLogin?.classList.remove('btn-secondary');
    tabBtnSignup?.classList.add('btn-secondary');
    tabBtnSignup?.classList.remove('btn-primary');
  }

  function showSignupPanel() {
    if (authMainTabs) authMainTabs.style.display = 'flex';
    if (panelLogin) panelLogin.style.display = 'none';
    if (panelSignup) panelSignup.style.display = 'block';
    if (panelReset) panelReset.style.display = 'none';
    if (panelOtpLogin) panelOtpLogin.style.display = 'none';

    // Show details step by default
    if (signupStepDetails) signupStepDetails.style.display = 'block';
    if (signupStepOtp) signupStepOtp.style.display = 'none';

    tabBtnSignup?.classList.add('btn-primary');
    tabBtnSignup?.classList.remove('btn-secondary');
    tabBtnLogin?.classList.add('btn-secondary');
    tabBtnLogin?.classList.remove('btn-primary');
  }

  function showResetPanel() {
    if (authMainTabs) authMainTabs.style.display = 'none';
    if (panelLogin) panelLogin.style.display = 'none';
    if (panelSignup) panelSignup.style.display = 'none';
    if (panelReset) panelReset.style.display = 'block';
    if (panelOtpLogin) panelOtpLogin.style.display = 'none';

    if (resetStepRequest) resetStepRequest.style.display = 'block';
    if (resetStepVerify) resetStepVerify.style.display = 'none';
    if (resetIdentifier) resetIdentifier.focus();
  }

  function showOtpLoginPanel() {
    if (authMainTabs) authMainTabs.style.display = 'none';
    if (panelLogin) panelLogin.style.display = 'none';
    if (panelSignup) panelSignup.style.display = 'none';
    if (panelReset) panelReset.style.display = 'none';
    if (panelOtpLogin) panelOtpLogin.style.display = 'block';

    if (otpLoginStepEmail) otpLoginStepEmail.style.display = 'block';
    if (otpLoginStepVerify) otpLoginStepVerify.style.display = 'none';
    if (otpLoginEmailInput) otpLoginEmailInput.focus();
  }

  function openAuthModal(mode = 'login') {
    if (mode === 'signup') {
      showSignupPanel();
    } else if (mode === 'reset') {
      showResetPanel();
    } else {
      showLoginPanel();
    }
    authModal?.classList.add('active');
  }

  // Header button triggers
  loginHeaderBtn?.addEventListener('click', () => {
    if (!isAuthenticated()) {
      openAuthModal('login');
    }
  });

  signupHeaderBtn?.addEventListener('click', () => {
    openAuthModal('signup');
  });

  logoutHeaderBtn?.addEventListener('click', () => {
    if (confirm('Do you wish to sign out of your QrNova account?')) {
      signOut();
      updateAuthUI();
      showToast('Signed out successfully.', 'info');
      refreshHistoryView();
      refreshSavedView();
    }
  });

  // Modal Top Tabs Navigation
  tabBtnLogin?.addEventListener('click', showLoginPanel);
  tabBtnSignup?.addEventListener('click', showSignupPanel);
  linkSwitchToSignup?.addEventListener('click', (e) => {
    e.preventDefault();
    showSignupPanel();
  });
  linkSwitchToLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginPanel();
  });
  linkForgotPassword?.addEventListener('click', (e) => {
    e.preventDefault();
    showResetPanel();
  });
  linkResetToLogin?.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginPanel();
  });
  btnResetCancel?.addEventListener('click', showLoginPanel);
  btnSwitchToOtpLogin?.addEventListener('click', showOtpLoginPanel);
  btnOtpLoginBackToPwd?.addEventListener('click', showLoginPanel);

  /* ==================================================
     1. DIRECT LOG IN (Username or Gmail + Password)
  ================================================== */
  async function handleDirectLogin() {
    const identifier = loginIdentifier?.value.trim();
    const password = loginPassword?.value;

    if (!identifier || !password) {
      showToast('Please enter both your Username/Gmail and password.', 'warning');
      return;
    }

    try {
      btnLoginSubmit.textContent = 'Logging In...';
      btnLoginSubmit.setAttribute('disabled', 'true');

      const res = await loginUser(identifier, password);

      btnLoginSubmit.textContent = '🔑 Log In Directly';
      btnLoginSubmit.removeAttribute('disabled');

      authModal?.classList.remove('active');
      updateAuthUI();
      playChime('success');
      showToast(`Welcome back, ${res.user?.name || res.user?.username || res.user?.email}!`, 'success');

      await migrateGuestItemsToUser(getAuthToken());
      refreshHistoryView();
      refreshSavedView();
    } catch (err) {
      btnLoginSubmit.textContent = '🔑 Log In Directly';
      btnLoginSubmit.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  }

  btnLoginSubmit?.addEventListener('click', handleDirectLogin);
  loginPassword?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleDirectLogin();
  });
  loginIdentifier?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleDirectLogin();
  });

  /* ==================================================
     2. SIGN UP: STEP 1 (REQUEST BREVO OTP)
  ================================================== */
  btnSignupRequestOtp?.addEventListener('click', async () => {
    const name = signupName?.value.trim() || '';
    const username = signupUsername?.value.trim().toLowerCase();
    const email = signupEmail?.value.trim().toLowerCase();
    const password = signupPassword?.value;
    const confirmPass = signupConfirmPassword?.value;

    if (!username || !email || !password) {
      showToast('Username, Gmail, and Password are required.', 'warning');
      return;
    }

    if (username.length < 3) {
      showToast('Username must be at least 3 characters.', 'warning');
      return;
    }

    if (username.length > 35) {
      showToast('Username must be 35 characters or less.', 'warning');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast('Please enter a valid Gmail / email address.', 'warning');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters long.', 'warning');
      return;
    }

    if (password !== confirmPass) {
      showToast('Passwords do not match. Please re-check.', 'warning');
      return;
    }

    try {
      btnSignupRequestOtp.textContent = 'Sending Verification Code...';
      btnSignupRequestOtp.setAttribute('disabled', 'true');

      const res = await requestSignupOtp({ username, name, email, password });

      pendingSignupData = { username, name, email, password };

      btnSignupRequestOtp.textContent = '✉️ Verify Gmail via Brevo OTP';
      btnSignupRequestOtp.removeAttribute('disabled');

      // Transition to Step 2 (OTP code input)
      if (signupStepDetails) signupStepDetails.style.display = 'none';
      if (signupStepOtp) signupStepOtp.style.display = 'block';
      if (signupTargetEmailLabel) signupTargetEmailLabel.textContent = email;

      clearOtpDigits(signupOtpDigits);
      signupOtpDigits[0]?.focus();

      if (res.devOtp) {
        renderOtpDevNotice(signupDevOtpNotice, res.devOtp, res.message, (code) => {
          signupOtpDigits.forEach((d, i) => { d.value = code[i] || ''; });
          btnSignupVerifyOtp?.click();
        });
      } else if (signupDevOtpNotice) {
        signupDevOtpNotice.style.display = 'none';
      }

      playChime('success');
      showToast(res.message || 'Verification code sent to your Gmail via Brevo!', 'success');
    } catch (err) {
      btnSignupRequestOtp.textContent = '✉️ Verify Gmail via Brevo OTP';
      btnSignupRequestOtp.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });

  // Resend Sign Up OTP
  btnSignupResendOtp?.addEventListener('click', async () => {
    if (!pendingSignupData) {
      showToast('Please fill the registration form first.', 'warning');
      return;
    }
    try {
      btnSignupResendOtp.textContent = 'Resending...';
      const res = await requestSignupOtp(pendingSignupData);
      btnSignupResendOtp.textContent = 'Resend Code';

      if (res.devOtp) {
        renderOtpDevNotice(signupDevOtpNotice, res.devOtp, res.message, (code) => {
          signupOtpDigits.forEach((d, i) => { d.value = code[i] || ''; });
          btnSignupVerifyOtp?.click();
        });
      }
      playChime('success');
      showToast('New verification code sent via Brevo!', 'success');
    } catch (err) {
      btnSignupResendOtp.textContent = 'Resend Code';
      showToast(err.message, 'error');
    }
  });

  // Back from OTP to registration details
  btnSignupBackToDetails?.addEventListener('click', () => {
    if (signupStepOtp) signupStepOtp.style.display = 'none';
    if (signupStepDetails) signupStepDetails.style.display = 'block';
  });

  /* ==================================================
     2. SIGN UP: STEP 2 (VERIFY BREVO OTP & CREATE ACCOUNT)
  ================================================== */
  btnSignupVerifyOtp?.addEventListener('click', async () => {
    const enteredOtp = getOtpValue(signupOtpDigits);
    if (enteredOtp.length < 6) {
      showToast('Please enter all 6 digits of the verification code sent to your Gmail.', 'warning');
      return;
    }

    if (!pendingSignupData || !pendingSignupData.email) {
      showToast('Signup session expired. Please start registration again.', 'error');
      showSignupPanel();
      return;
    }

    try {
      btnSignupVerifyOtp.textContent = 'Verifying & Setting Up...';
      btnSignupVerifyOtp.setAttribute('disabled', 'true');

      const res = await verifySignupOtp({
        email: pendingSignupData.email,
        otp: enteredOtp,
      });

      btnSignupVerifyOtp.textContent = '✨ Verify & Set Account';
      btnSignupVerifyOtp.removeAttribute('disabled');

      authModal?.classList.remove('active');
      updateAuthUI();
      playChime('success');
      showToast(`Account created and Gmail verified! Welcome, ${res.user?.username || res.user?.name || res.user?.email}!`, 'success');

      await migrateGuestItemsToUser(getAuthToken());
      refreshHistoryView();
      refreshSavedView();
    } catch (err) {
      btnSignupVerifyOtp.textContent = '✨ Verify & Set Account';
      btnSignupVerifyOtp.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });

  /* ==================================================
     3. RESET PASSWORD: STEP 1 (REQUEST BREVO CODE)
  ================================================== */
  btnResetSendOtp?.addEventListener('click', async () => {
    const target = resetIdentifier?.value.trim();
    if (!target) {
      showToast('Please enter your username or registered Gmail address.', 'warning');
      return;
    }

    try {
      btnResetSendOtp.textContent = 'Sending Reset Code...';
      btnResetSendOtp.setAttribute('disabled', 'true');

      const res = await requestPasswordReset(target);
      pendingResetEmail = res.email || target;

      btnResetSendOtp.textContent = '✉️ Send Password Reset Code';
      btnResetSendOtp.removeAttribute('disabled');

      // Transition to Step 2
      if (resetStepRequest) resetStepRequest.style.display = 'none';
      if (resetStepVerify) resetStepVerify.style.display = 'block';
      if (resetTargetEmailLabel) {
        resetTargetEmailLabel.textContent = res.maskedEmail || res.email || target;
      }

      clearOtpDigits(resetOtpDigits);
      resetOtpDigits[0]?.focus();

      if (res.devOtp) {
        renderOtpDevNotice(resetDevOtpNotice, res.devOtp, res.message, (code) => {
          resetOtpDigits.forEach((d, i) => { d.value = code[i] || ''; });
          resetNewPassword?.focus();
        });
      } else if (resetDevOtpNotice) {
        resetDevOtpNotice.style.display = 'none';
      }

      playChime('success');
      showToast(res.message || 'Password reset code sent to your registered Gmail!', 'success');
    } catch (err) {
      btnResetSendOtp.textContent = '✉️ Send Password Reset Code';
      btnResetSendOtp.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });

  btnResetBackToRequest?.addEventListener('click', () => {
    if (resetStepVerify) resetStepVerify.style.display = 'none';
    if (resetStepRequest) resetStepRequest.style.display = 'block';
  });

  /* ==================================================
     3. RESET PASSWORD: STEP 2 (VERIFY CODE & SAVE NEW PASSWORD)
  ================================================== */
  btnResetSubmitNewPass?.addEventListener('click', async () => {
    const enteredOtp = getOtpValue(resetOtpDigits);
    const newPass = resetNewPassword?.value;
    const confirmPass = resetConfirmPassword?.value;

    if (enteredOtp.length < 6) {
      showToast('Please enter the 6-digit reset code from your email.', 'warning');
      return;
    }

    if (!newPass || newPass.length < 6) {
      showToast('New password must be at least 6 characters long.', 'warning');
      return;
    }

    if (newPass !== confirmPass) {
      showToast('New passwords do not match.', 'warning');
      return;
    }

    if (!pendingResetEmail) {
      showToast('Reset request expired. Please request a new code.', 'error');
      showResetPanel();
      return;
    }

    try {
      btnResetSubmitNewPass.textContent = 'Saving Password...';
      btnResetSubmitNewPass.setAttribute('disabled', 'true');

      const res = await confirmPasswordReset({
        email: pendingResetEmail,
        otp: enteredOtp,
        newPassword: newPass,
      });

      btnResetSubmitNewPass.textContent = '🔒 Save Password & Sign In';
      btnResetSubmitNewPass.removeAttribute('disabled');

      authModal?.classList.remove('active');
      updateAuthUI();
      playChime('success');
      showToast('Password updated successfully! Welcome back.', 'success');

      await migrateGuestItemsToUser(getAuthToken());
      refreshHistoryView();
      refreshSavedView();
    } catch (err) {
      btnResetSubmitNewPass.textContent = '🔒 Save Password & Sign In';
      btnResetSubmitNewPass.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });

  /* ==================================================
     4. FAST BREVO OTP (PASSWORDLESS)
  ================================================== */
  btnOtpLoginSend?.addEventListener('click', async () => {
    const email = otpLoginEmailInput?.value.trim().toLowerCase();
    if (!email) {
      showToast('Please enter your email address.', 'warning');
      return;
    }

    try {
      btnOtpLoginSend.textContent = 'Sending Passcode...';
      btnOtpLoginSend.setAttribute('disabled', 'true');

      const res = await requestOtp(email);
      pendingOtpLoginEmail = email;

      btnOtpLoginSend.textContent = '✉️ Send 6-Digit Passcode';
      btnOtpLoginSend.removeAttribute('disabled');

      if (otpLoginStepEmail) otpLoginStepEmail.style.display = 'none';
      if (otpLoginStepVerify) otpLoginStepVerify.style.display = 'block';
      if (otpLoginTargetEmailLabel) otpLoginTargetEmailLabel.textContent = email;

      clearOtpDigits(fastOtpDigits);
      fastOtpDigits[0]?.focus();

      if (res.devOtp) {
        renderOtpDevNotice(otpLoginDevNotice, res.devOtp, res.message, (code) => {
          fastOtpDigits.forEach((d, i) => { d.value = code[i] || ''; });
          btnOtpLoginVerify?.click();
        });
      } else if (otpLoginDevNotice) {
        otpLoginDevNotice.style.display = 'none';
      }

      playChime('success');
      showToast(res.message || 'Passcode dispatched via Brevo!', 'success');
    } catch (err) {
      btnOtpLoginSend.textContent = '✉️ Send 6-Digit Passcode';
      btnOtpLoginSend.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });

  btnOtpLoginBackToEmail?.addEventListener('click', () => {
    if (otpLoginStepVerify) otpLoginStepVerify.style.display = 'none';
    if (otpLoginStepEmail) otpLoginStepEmail.style.display = 'block';
  });

  btnOtpLoginVerify?.addEventListener('click', async () => {
    const enteredOtp = getOtpValue(fastOtpDigits);
    if (enteredOtp.length < 6) {
      showToast('Please enter all 6 digits of your passcode.', 'warning');
      return;
    }

    try {
      btnOtpLoginVerify.textContent = 'Verifying...';
      btnOtpLoginVerify.setAttribute('disabled', 'true');

      const res = await verifyOtp(pendingOtpLoginEmail, enteredOtp);

      btnOtpLoginVerify.textContent = 'Verify & Log In';
      btnOtpLoginVerify.removeAttribute('disabled');

      authModal?.classList.remove('active');
      updateAuthUI();
      playChime('success');
      showToast(`Welcome back, ${res.user?.name || res.user?.username || res.user?.email}!`, 'success');

      await migrateGuestItemsToUser(getAuthToken());
      refreshHistoryView();
      refreshSavedView();
    } catch (err) {
      btnOtpLoginVerify.textContent = 'Verify & Log In';
      btnOtpLoginVerify.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });
}

function updateAuthUI() {
  const loginBtn = document.getElementById('btn-header-login');
  const signupBtn = document.getElementById('btn-header-signup');
  const logoutBtn = document.getElementById('btn-header-logout');
  const user = getCurrentUser();

  if (user) {
    if (loginBtn) {
      const displayName = user.name || (user.username ? `@${user.username}` : user.email.split('@')[0]);
      loginBtn.innerHTML = `👤 ${escapeHtml(displayName)} <span style="font-size:0.7em; color:var(--accent-emerald);">●</span>`;
      loginBtn.title = `Signed in as ${user.email} (${user.username || 'user'})`;
    }
    if (signupBtn) signupBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
  } else {
    if (loginBtn) {
      loginBtn.innerHTML = `🔑 Log In`;
      loginBtn.title = 'Log in to your account';
    }
    if (signupBtn) signupBtn.style.display = 'inline-flex';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

/* ==================================================
   SETTINGS & ACCESSIBILITY
================================================== */
function setupSettingsEvents() {
  const themeSelect = document.getElementById('settings-theme-select');
  const largeTextToggle = document.getElementById('settings-large-text-toggle');
  const soundToggle = document.getElementById('settings-sound-toggle');

  if (themeSelect) {
    themeSelect.value = localStorage.getItem('qrnova_theme') || 'dark';
    themeSelect.addEventListener('change', (e) => {
      setTheme(e.target.value);
    });
  }

  if (largeTextToggle) {
    largeTextToggle.checked = localStorage.getItem('qrnova_large_text') === 'true';
    largeTextToggle.addEventListener('change', (e) => {
      setLargeText(e.target.checked);
    });
  }

  if (soundToggle) {
    soundToggle.checked = isSoundOn();
    soundToggle.addEventListener('change', (e) => {
      setSoundEnabled(e.target.checked);
    });
  }

  refreshServiceStatus();
}

async function refreshServiceStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const mongoBadge = document.getElementById('status-mongo-badge');
    const mongoDesc = document.getElementById('status-mongo-desc');
    const brevoBadge = document.getElementById('status-brevo-badge');
    const brevoDesc = document.getElementById('status-brevo-desc');

    if (mongoBadge) {
      if (data.mongo?.connected) {
        mongoBadge.className = 'badge badge-active';
        mongoBadge.textContent = 'Connected (Atlas)';
        if (mongoDesc) mongoDesc.innerHTML = '🍃 MongoDB Atlas cluster connected and active.';
      } else {
        mongoBadge.className = 'badge badge-expiring';
        mongoBadge.textContent = 'Hybrid Local / Atlas';
        if (mongoDesc) mongoDesc.innerHTML = '⚡ Seamless local storage active. Whitelist your IP in MongoDB Atlas to connect live cluster.';
      }
    }

    if (brevoBadge) {
      if (data.brevo?.connected) {
        brevoBadge.className = 'badge badge-active';
        brevoBadge.textContent = 'Verified Active';
        if (brevoDesc) brevoDesc.textContent = `Brevo verified: ${data.brevo.email || 'Active'} (${data.brevo.credits ?? 300} credits)`;
      } else if (data.brevo?.configured) {
        brevoBadge.className = 'badge badge-active';
        brevoBadge.textContent = 'API Ready';
      }
    }
  } catch (e) {
    console.warn('Status check notice:', e.message);
  }
}

/* ==================================================
   DYNAMIC ROUTE RESOLVER (/d/:shortCode)
================================================== */
function setupDynamicRouteHandler() {
  const checkHash = () => {
    const hash = window.location.hash;
    if (hash.startsWith('#/view/')) {
      const shortCode = hash.replace('#/view/', '').split('?')[0].trim();
      if (shortCode) handleDynamicQrLookup(shortCode);
    }
  };

  checkHash();
  window.addEventListener('hashchange', checkHash);
}

async function handleDynamicQrLookup(shortCode) {
  try {
    const res = await fetch(`/api/qr/dynamic/${shortCode}`);
    const data = await res.json();

    if (res.status === 410 || data.expired || window.location.hash.includes('error=expired')) {
      alert(`🔴 This QR code has expired on ${new Date(data.expiryDate || Date.now()).toLocaleString()} and is no longer active.`);
      return;
    }

    if (data.success && data.item) {
      switchTab('scan');
      displayScanResult(data.item.payload);
      showToast(`Loaded dynamic QR "${data.item.title}"`, 'success');
    }
  } catch (err) {
    console.error('Dynamic lookup error:', err);
  }
}

/* ==================================================
   UTILITIES
================================================== */
function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
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

function markdownToHtml(md) {
  if (!md) return '';
  return md
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n- /g, '<br>• ');
}

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('active');
}
window.closeModal = closeModal;

// Modal Backdrop Click & Escape Key Dismissal
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach((modal) => {
      modal.classList.remove('active');
    });
  }
});

