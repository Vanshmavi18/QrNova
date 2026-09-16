/**
 * QrNova Web Crypto Engine
 * Standard Authenticated Encryption using AES-256-GCM + PBKDF2
 */

// Helper functions for ArrayBuffer <-> Base64
function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derive an AES-GCM CryptoKey from a password and salt using PBKDF2
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext using a password with AES-256-GCM
 * @returns {Promise<string>} Format: QREncrypted:v1:<salt_b64>:<iv_b64>:<ciphertext_b64>
 */
export async function encryptData(plaintext, password) {
  if (!plaintext) throw new Error('No content to encrypt.');
  if (!password || password.length < 4) throw new Error('Password must be at least 4 characters.');

  const enc = new TextEncoder();
  const data = enc.encode(plaintext);

  // Generate cryptographically secure random 16-byte salt and 12-byte IV
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(password, salt);

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    data
  );

  const saltB64 = bufferToBase64(salt);
  const ivB64 = bufferToBase64(iv);
  const cipherB64 = bufferToBase64(ciphertextBuffer);

  return `QREncrypted:v1:${saltB64}:${ivB64}:${cipherB64}`;
}

/**
 * Decrypt an envelope using the password
 * @returns {Promise<string>} Plaintext
 */
export async function decryptData(envelope, password) {
  if (!isEncryptedPayload(envelope)) {
    throw new Error('Not a valid QrNova encrypted payload.');
  }

  const parts = envelope.split(':');
  if (parts.length < 5) {
    throw new Error('Malformed encrypted payload format.');
  }

  const saltB64 = parts[2];
  const ivB64 = parts[3];
  const cipherB64 = parts[4];

  const salt = new Uint8Array(base64ToBuffer(saltB64));
  const iv = new Uint8Array(base64ToBuffer(ivB64));
  const ciphertext = base64ToBuffer(cipherB64);

  const key = await deriveKey(password, salt);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (err) {
    throw new Error('Incorrect password or corrupted data. Decryption failed.');
  }
}

/**
 * Check if string matches QrNova encrypted payload format
 */
export function isEncryptedPayload(text) {
  return typeof text === 'string' && text.startsWith('QREncrypted:v1:');
}

/**
 * Check password strength (returns 0 - 4 score and label)
 */
export function calculatePasswordStrength(password) {
  if (!password) return { score: 0, label: 'Empty', color: '#64748b' };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  switch (score) {
    case 1:
      return { score: 1, label: 'Weak', color: '#f43f5e' };
    case 2:
      return { score: 2, label: 'Fair', color: '#f59e0b' };
    case 3:
      return { score: 3, label: 'Good', color: '#38bdf8' };
    case 4:
      return { score: 4, label: 'Strong', color: '#10b981' };
    default:
      return { score: 0, label: 'Very Weak', color: '#64748b' };
  }
}
