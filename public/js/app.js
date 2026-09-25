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
  requestOtp,
  verifyOtp,
  loginWithPassword,
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

/* ==================================================
   FEATURE 1: QR GENERATOR LOGIC
================================================== */
function setupGeneratorEvents() {
  // QR Type Buttons
  const typeButtons = document.querySelectorAll('.type-btn');
  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      typeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeQrType = btn.getAttribute('data-type');

      // Switch form pane
      document.querySelectorAll('.type-form-pane').forEach((p) => p.classList.remove('active'));
      const activePane = document.getElementById(`form-${activeQrType}`);
      if (activePane) activePane.classList.add('active');

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

  // Record to history cache seamlessly
  recordHistoryItem(
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

  if (resultCard) resultCard.style.display = 'flex';
  if (aiContainer) aiContainer.style.display = 'none';

  const type = detectContentType(content);
  if (typeBadge) typeBadge.textContent = type.toUpperCase();
  if (timeBadge) timeBadge.textContent = new Date().toLocaleTimeString();

  // Raw Content Display (sanitized)
  if (contentDisplay) contentDisplay.textContent = content;

  // Feature 7: Human Readable View
  if (readableContainer) {
    readableContainer.innerHTML = formatReadableContent(content);
  }

  // Security Check for URLs
  const security = evaluateUrlSecurity(content);
  if (security.isUrl) {
    if (openUrlBtn) {
      openUrlBtn.style.display = 'inline-flex';
      openUrlBtn.onclick = () => handleSafeUrlOpen(security);
    }
    if (urlWarningBox) {
      if (!security.isSafe) {
        urlWarningBox.style.display = 'flex';
        urlWarningBox.innerHTML = `⚠️ <strong>Security Advisory:</strong><br>${security.warnings.join('<br>')}`;
      } else {
        urlWarningBox.style.display = 'none';
      }
    }
  } else {
    if (openUrlBtn) openUrlBtn.style.display = 'none';
    if (urlWarningBox) urlWarningBox.style.display = 'none';
  }

  showToast(`Successfully decoded ${type.toUpperCase()} QR code!`, 'success');
}

function handleSafeUrlOpen(security) {
  if (!security.isSafe) {
    // Show destination confirmation modal before proceeding
    const proceed = confirm(
      `⚠️ Potential Security Risk Detected!\n\nDestination: ${security.fullUrl}\nWarnings:\n- ${security.warnings.join('\n- ')}\n\nDo you still wish to open this external link?`
    );
    if (!proceed) return;
  }
  window.open(security.fullUrl, '_blank', 'noopener,noreferrer');
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

  const search = document.getElementById('saved-search-input')?.value?.toLowerCase() || '';
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
  activeQrType = item.type || 'text';
  switchTab('generate');

  // Activate type button
  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-type') === activeQrType);
  });
  document.querySelectorAll('.type-form-pane').forEach((p) => p.classList.remove('active'));
  document.getElementById(`form-${activeQrType}`)?.classList.add('active');

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
      activeQrType = 'text';
      switchTab('generate');
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
   BREVO GMAIL OTP AUTHENTICATION
================================================== */
function setupAuthModalEvents() {
  const authModal = document.getElementById('modal-auth');
  const loginHeaderBtn = document.getElementById('btn-header-login');
  const signupHeaderBtn = document.getElementById('btn-header-signup');
  const logoutHeaderBtn = document.getElementById('btn-header-logout');

  // Modal Navigation & Panels
  const tabBtnLogin = document.getElementById('tab-btn-auth-login');
  const tabBtnSignup = document.getElementById('tab-btn-auth-signup');
  const panelLogin = document.getElementById('auth-panel-login');
  const panelSignup = document.getElementById('auth-panel-signup');
  const linkSwitchToSignup = document.getElementById('link-switch-to-signup');
  const linkSwitchToLogin = document.getElementById('link-switch-to-login');

  // Log In Method Toggles
  const loginMethodOtp = document.getElementById('login-method-otp');
  const loginMethodPwd = document.getElementById('login-method-pwd');
  const loginOtpView = document.getElementById('login-otp-view');
  const loginPwdView = document.getElementById('login-password-view');

  // Sign Up Method Toggles
  const signupMethodPwd = document.getElementById('signup-method-pwd');
  const signupMethodOtp = document.getElementById('signup-method-otp');
  const signupPwdView = document.getElementById('signup-password-view');
  const signupOtpView = document.getElementById('signup-otp-view');

  // Form Controls (Brevo OTP Log In)
  const stepEmail = document.getElementById('auth-step-email');
  const stepOtp = document.getElementById('auth-step-otp');
  const emailInput = document.getElementById('auth-email-input');
  const sendOtpBtn = document.getElementById('btn-auth-send-otp');
  const verifyOtpBtn = document.getElementById('btn-auth-verify-otp');
  const backToEmailBtn = document.getElementById('btn-auth-back');
  const otpDigits = document.querySelectorAll('.otp-digit');
  const devOtpNotice = document.getElementById('auth-dev-otp-notice');

  // Password Log In Controls
  const loginPwdEmail = document.getElementById('login-pwd-email');
  const loginPwdPass = document.getElementById('login-pwd-pass');
  const btnLoginWithPwd = document.getElementById('btn-login-with-pwd');

  // Password Sign Up Controls
  const signupName = document.getElementById('signup-name');
  const signupEmail = document.getElementById('signup-email');
  const signupPassword = document.getElementById('signup-password');
  const btnSignupSubmit = document.getElementById('btn-signup-submit');

  // Brevo OTP Sign Up Controls
  const signupOtpEmail = document.getElementById('signup-otp-email');
  const btnSignupSendOtp = document.getElementById('btn-signup-send-otp');

  function openAuthModal(mode = 'login') {
    if (mode === 'signup') {
      showSignupPanel();
    } else {
      showLoginPanel();
    }
    authModal?.classList.add('active');
  }

  function showLoginPanel() {
    if (panelLogin && panelSignup) {
      panelLogin.style.display = 'block';
      panelSignup.style.display = 'none';
      tabBtnLogin?.classList.add('btn-primary');
      tabBtnLogin?.classList.remove('btn-secondary');
      tabBtnSignup?.classList.add('btn-secondary');
      tabBtnSignup?.classList.remove('btn-primary');
    }
  }

  function showSignupPanel() {
    if (panelLogin && panelSignup) {
      panelLogin.style.display = 'none';
      panelSignup.style.display = 'block';
      tabBtnSignup?.classList.add('btn-primary');
      tabBtnSignup?.classList.remove('btn-secondary');
      tabBtnLogin?.classList.add('btn-secondary');
      tabBtnLogin?.classList.remove('btn-primary');
    }
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

  // Modal Tab switching
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

  // Log In Method Toggles
  loginMethodOtp?.addEventListener('click', () => {
    loginMethodOtp.classList.add('active');
    loginMethodPwd.classList.remove('active');
    if (loginOtpView && loginPwdView) {
      loginOtpView.style.display = 'block';
      loginPwdView.style.display = 'none';
    }
  });

  loginMethodPwd?.addEventListener('click', () => {
    loginMethodPwd.classList.add('active');
    loginMethodOtp.classList.remove('active');
    if (loginOtpView && loginPwdView) {
      loginOtpView.style.display = 'none';
      loginPwdView.style.display = 'block';
    }
  });

  // Sign Up Method Toggles
  signupMethodPwd?.addEventListener('click', () => {
    signupMethodPwd.classList.add('active');
    signupMethodOtp.classList.remove('active');
    if (signupPwdView && signupOtpView) {
      signupPwdView.style.display = 'block';
      signupOtpView.style.display = 'none';
    }
  });

  signupMethodOtp?.addEventListener('click', () => {
    signupMethodOtp.classList.add('active');
    signupMethodPwd.classList.remove('active');
    if (signupPwdView && signupOtpView) {
      signupPwdView.style.display = 'none';
      signupOtpView.style.display = 'block';
    }
  });

  // Log In with Password
  btnLoginWithPwd?.addEventListener('click', async () => {
    const email = loginPwdEmail?.value.trim();
    const password = loginPwdPass?.value;

    if (!email || !password) {
      showToast('Please enter both email and password.', 'warning');
      return;
    }

    try {
      btnLoginWithPwd.textContent = 'Logging In...';
      btnLoginWithPwd.setAttribute('disabled', 'true');
      const res = await loginWithPassword(email, password);
      btnLoginWithPwd.textContent = '🔑 Log In with Password';
      btnLoginWithPwd.removeAttribute('disabled');

      authModal?.classList.remove('active');
      updateAuthUI();
      playChime('success');
      showToast(`Welcome back, ${res.user?.name || res.user?.email}!`, 'success');

      refreshHistoryView();
      refreshSavedView();
    } catch (err) {
      btnLoginWithPwd.textContent = '🔑 Log In with Password';
      btnLoginWithPwd.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });

  // Sign Up with Password
  btnSignupSubmit?.addEventListener('click', async () => {
    const name = signupName?.value.trim();
    const email = signupEmail?.value.trim();
    const password = signupPassword?.value;

    if (!email || !password) {
      showToast('Please enter both email and password.', 'warning');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters long.', 'warning');
      return;
    }

    try {
      btnSignupSubmit.textContent = 'Creating Account...';
      btnSignupSubmit.setAttribute('disabled', 'true');
      const res = await registerWithPassword(name, email, password);
      btnSignupSubmit.textContent = '✨ Create Account & Sign In';
      btnSignupSubmit.removeAttribute('disabled');

      authModal?.classList.remove('active');
      updateAuthUI();
      playChime('success');
      showToast(`Account created! Welcome, ${res.user?.name || res.user?.email}!`, 'success');

      refreshHistoryView();
      refreshSavedView();
    } catch (err) {
      btnSignupSubmit.textContent = '✨ Create Account & Sign In';
      btnSignupSubmit.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });

  // Fast Sign Up via Brevo OTP
  btnSignupSendOtp?.addEventListener('click', async () => {
    const email = signupOtpEmail?.value.trim();
    if (!email) {
      showToast('Please enter your email address.', 'warning');
      return;
    }

    try {
      btnSignupSendOtp.textContent = 'Sending Code...';
      btnSignupSendOtp.setAttribute('disabled', 'true');
      const res = await requestOtp(email);
      pendingEmailForOtp = email;
      btnSignupSendOtp.textContent = '✉️ Send Verification Code';
      btnSignupSendOtp.removeAttribute('disabled');

      // Switch to OTP code entry view
      showLoginPanel();
      loginMethodOtp?.click();
      if (stepEmail && stepOtp) {
        stepEmail.style.display = 'none';
        stepOtp.style.display = 'block';
        document.getElementById('auth-target-email-label').textContent = email;
      }
      otpDigits[0]?.focus();

      if (res.devOtp && devOtpNotice) {
        devOtpNotice.style.display = 'block';
        devOtpNotice.innerHTML = `🔑 <strong>Dev Test Mode:</strong> Your OTP is <code>${res.devOtp}</code>`;
      }

      playChime('success');
      showToast(res.message || 'Verification code sent via Brevo!', 'success');
    } catch (err) {
      btnSignupSendOtp.textContent = '✉️ Send Verification Code';
      btnSignupSendOtp.removeAttribute('disabled');
      playChime('error');
      showToast(err.message, 'error');
    }
  });

  // Request OTP via Brevo API (in Log In view)
  if (sendOtpBtn && emailInput) {
    sendOtpBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (!email) {
        showToast('Please enter your email address.', 'warning');
        return;
      }

      try {
        sendOtpBtn.textContent = 'Sending...';
        sendOtpBtn.setAttribute('disabled', 'true');
        const res = await requestOtp(email);
        pendingEmailForOtp = email;

        sendOtpBtn.textContent = 'Send Verification Code';
        sendOtpBtn.removeAttribute('disabled');

        if (stepEmail && stepOtp) {
          stepEmail.style.display = 'none';
          stepOtp.style.display = 'block';
          document.getElementById('auth-target-email-label').textContent = email;
        }

        otpDigits[0]?.focus();

        if (res.devOtp && devOtpNotice) {
          devOtpNotice.style.display = 'block';
          devOtpNotice.innerHTML = `🔑 <strong>Dev Test Mode:</strong> Your OTP is <code>${res.devOtp}</code>`;
        }

        playChime('success');
        showToast(res.message || 'Verification code sent via Brevo!', 'success');
      } catch (err) {
        sendOtpBtn.textContent = 'Send Verification Code';
        sendOtpBtn.removeAttribute('disabled');
        playChime('error');
        showToast(err.message, 'error');
      }
    });
  }

  // Auto-advance OTP digit input boxes
  otpDigits.forEach((digit, index) => {
    digit.addEventListener('input', () => {
      if (digit.value.length >= 1) {
        digit.value = digit.value.slice(-1);
        if (index < otpDigits.length - 1) {
          otpDigits[index + 1].focus();
        }
      }
    });

    digit.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !digit.value && index > 0) {
        otpDigits[index - 1].focus();
      }
    });
  });

  // Verify OTP Code
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
      let enteredOtp = '';
      otpDigits.forEach((d) => (enteredOtp += d.value));

      if (enteredOtp.length < 6) {
        showToast('Please enter all 6 digits of your verification code.', 'warning');
        return;
      }

      try {
        verifyOtpBtn.textContent = 'Verifying...';
        verifyOtpBtn.setAttribute('disabled', 'true');

        const res = await verifyOtp(pendingEmailForOtp, enteredOtp);

        verifyOtpBtn.textContent = 'Verify & Log In';
        verifyOtpBtn.removeAttribute('disabled');

        authModal?.classList.remove('active');
        updateAuthUI();
        playChime('success');
        showToast(`Welcome, ${res.user?.name || res.user?.email || 'User'}!`, 'success');

        refreshHistoryView();
        refreshSavedView();
      } catch (err) {
        verifyOtpBtn.textContent = 'Verify & Log In';
        verifyOtpBtn.removeAttribute('disabled');
        playChime('error');
        showToast(err.message, 'error');
      }
    });
  }

  if (backToEmailBtn) {
    backToEmailBtn.addEventListener('click', () => {
      if (stepEmail && stepOtp) {
        stepEmail.style.display = 'block';
        stepOtp.style.display = 'none';
      }
    });
  }
}

function updateAuthUI() {
  const loginBtn = document.getElementById('btn-header-login');
  const signupBtn = document.getElementById('btn-header-signup');
  const logoutBtn = document.getElementById('btn-header-logout');
  const user = getCurrentUser();

  if (user) {
    if (loginBtn) {
      loginBtn.innerHTML = `👤 ${escapeHtml(user.name || user.email.split('@')[0])} <span style="font-size:0.7em; color:var(--accent-emerald);">●</span>`;
      loginBtn.title = `Signed in as ${user.email}`;
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
  const hash = window.location.hash;
  if (hash.startsWith('#/view/')) {
    const shortCode = hash.replace('#/view/', '');
    handleDynamicQrLookup(shortCode);
  }
}

async function handleDynamicQrLookup(shortCode) {
  try {
    const res = await fetch(`/api/qr/dynamic/${shortCode}`);
    const data = await res.json();

    if (res.status === 410 || data.expired) {
      alert(`🔴 This QR code has expired on ${new Date(data.expiryDate).toLocaleString()} and is no longer active.`);
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
