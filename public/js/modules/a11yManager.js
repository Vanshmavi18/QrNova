/**
 * QrNova Accessibility & Audio Chime Manager
 */

let soundEnabled = true;
let audioCtx = null;

export function initA11y() {
  const savedTheme = localStorage.getItem('qrnova_theme') || 'dark';
  setTheme(savedTheme);

  const isLargeText = localStorage.getItem('qrnova_large_text') === 'true';
  setLargeText(isLargeText);

  soundEnabled = localStorage.getItem('qrnova_sound') !== 'false';
}

export function setTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('qrnova_theme', themeName);
}

export function setLargeText(enabled) {
  if (enabled) {
    document.body.classList.add('a11y-large-text');
  } else {
    document.body.classList.remove('a11y-large-text');
  }
  localStorage.setItem('qrnova_large_text', enabled ? 'true' : 'false');
}

export function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  localStorage.setItem('qrnova_sound', soundEnabled ? 'true' : 'false');
}

export function isSoundOn() {
  return soundEnabled;
}

/**
 * Screen reader live announcement
 */
export function announceToScreenReader(message) {
  const liveRegion = document.getElementById('sr-announcer');
  if (liveRegion) {
    liveRegion.textContent = '';
    setTimeout(() => {
      liveRegion.textContent = message;
    }, 50);
  }
}

/**
 * Synthetic Web Audio API Chimes (Zero external sound files needed!)
 */
export function playChime(type = 'success') {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'success') {
      // Pleasant two-tone chime (880Hz -> 1320Hz)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'error') {
      // Soft low buzzer
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'click') {
      // Subtle crisp click
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch (e) {
    // AudioContext blocked or unsupported
  }
}
