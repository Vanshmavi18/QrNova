/**
 * QrNova Voice Engine
 * Web Speech API: Speech Recognition (Voice -> QR) & Speech Synthesis (QR -> Voice)
 */

let recognitionInstance = null;
let isRecording = false;

/**
 * Check if browser supports Web Speech Recognition
 */
export function isSpeechRecognitionSupported() {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * Check if browser supports Speech Synthesis
 */
export function isSpeechSynthesisSupported() {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Start Voice-to-Text Recognition
 */
export function startVoiceRecognition({ onInterim, onFinal, onError, onStart, onEnd }) {
  if (!isSpeechRecognitionSupported()) {
    onError?.('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognitionInstance = new SpeechRecognition();
  recognitionInstance.continuous = true;
  recognitionInstance.interimResults = true;
  recognitionInstance.lang = navigator.language || 'en-US';

  recognitionInstance.onstart = () => {
    isRecording = true;
    onStart?.();
  };

  recognitionInstance.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript) onFinal?.(finalTranscript);
    if (interimTranscript) onInterim?.(interimTranscript);
  };

  recognitionInstance.onerror = (event) => {
    isRecording = false;
    let msg = 'Microphone speech recognition error: ' + event.error;
    if (event.error === 'not-allowed') {
      msg = 'Microphone permission denied. Please allow microphone access in your browser settings.';
    }
    onError?.(msg);
  };

  recognitionInstance.onend = () => {
    isRecording = false;
    onEnd?.();
  };

  try {
    recognitionInstance.start();
  } catch (err) {
    onError?.(err.message);
  }
}

/**
 * Stop Voice-to-Text Recognition
 */
export function stopVoiceRecognition() {
  if (recognitionInstance && isRecording) {
    recognitionInstance.stop();
    isRecording = false;
  }
}

export function isCurrentlyRecording() {
  return isRecording;
}

/* ==================================================
   QR -> VOICE (SPEECH SYNTHESIS)
================================================== */

let currentUtterance = null;

export function getVoices() {
  if (!isSpeechSynthesisSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Humanize structured payload for natural listening
 */
export function humanizePayloadForSpeech(content) {
  if (!content) return 'Empty content.';
  const str = content.trim();

  if (str.startsWith('WIFI:')) {
    const ssid = str.match(/S:([^;]+);/)?.[1] || 'Unknown network';
    const pass = str.match(/P:([^;]+);/)?.[1];
    return `Wi-Fi network connection details. Network name: ${ssid}. ${pass ? `Password is ${pass}.` : 'No password required.'}`;
  }

  if (str.startsWith('BEGIN:VCARD')) {
    const fn = str.match(/FN:([^\r\n]+)/)?.[1] || 'Unknown contact';
    const tel = str.match(/TEL.*:([^\r\n]+)/)?.[1];
    const email = str.match(/EMAIL.*:([^\r\n]+)/)?.[1];
    return `Contact card for ${fn}. ${tel ? `Phone number: ${tel}.` : ''} ${email ? `Email address: ${email}.` : ''}`;
  }

  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const url = new URL(str);
      return `Website link to ${url.hostname}. Full address is ${url.protocol} ${url.host} ${url.pathname}`;
    } catch {
      return `Web link: ${str}`;
    }
  }

  if (str.startsWith('geo:')) {
    const coords = str.replace('geo:', '').split('?')[0];
    return `Geographic coordinates location at: ${coords}`;
  }

  if (str.startsWith('tel:')) {
    return `Telephone call to ${str.replace('tel:', '')}`;
  }

  if (str.startsWith('mailto:')) {
    return `Email message to ${str.replace('mailto:', '')}`;
  }

  return str;
}

/**
 * Speak text aloud with playback controls
 */
export function speakText(text, { rate = 1.0, pitch = 1.0, voiceIndex = 0, onStart, onEnd, onError } = {}) {
  if (!isSpeechSynthesisSupported()) {
    onError?.('Speech synthesis is not supported in this browser.');
    return;
  }

  window.speechSynthesis.cancel(); // Stop any currently playing audio

  const humanized = humanizePayloadForSpeech(text);
  currentUtterance = new SpeechSynthesisUtterance(humanized);
  currentUtterance.rate = rate;
  currentUtterance.pitch = pitch;

  const voices = getVoices();
  if (voices.length > 0 && voices[voiceIndex]) {
    currentUtterance.voice = voices[voiceIndex];
  }

  currentUtterance.onstart = () => onStart?.();
  currentUtterance.onend = () => onEnd?.();
  currentUtterance.onerror = (e) => onError?.(e.error);

  window.speechSynthesis.speak(currentUtterance);
}

export function pauseSpeech() {
  if (isSpeechSynthesisSupported() && window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
  }
}

export function resumeSpeech() {
  if (isSpeechSynthesisSupported() && window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }
}

export function stopSpeech() {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}
