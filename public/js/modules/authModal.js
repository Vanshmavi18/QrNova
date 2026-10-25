/**
 * QrNova Authentication Module
 * Brevo Gmail OTP & Password Authentication Service
 */

const TOKEN_KEY = 'qrnova_auth_token';
const USER_KEY = 'qrnova_auth_user';

let currentUser = null;
let currentToken = null;

export function initAuth() {
  try {
    currentToken = localStorage.getItem(TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);
    if (userJson) currentUser = JSON.parse(userJson);
  } catch (e) {
    currentUser = null;
    currentToken = null;
  }
  return { user: currentUser, token: currentToken };
}

export function getCurrentUser() {
  return currentUser;
}

export function getAuthToken() {
  return currentToken;
}

export function isAuthenticated() {
  return Boolean(currentToken && currentUser);
}

export function setSession(token, user) {
  currentToken = token;
  currentUser = user;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);

    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch (e) {
    console.error('Failed to update localStorage session:', e);
  }
}

/**
 * Log in directly using Username OR Gmail/Email and Password
 * @param {string} identifier - Username or Email
 * @param {string} password - User password
 */
export async function loginUser(identifier, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Login failed.');
  }

  setSession(data.token, data.user);
  return data;
}

// Backwards-compatible alias for existing code
export async function loginWithPassword(emailOrIdentifier, password) {
  return loginUser(emailOrIdentifier, password);
}

/**
 * Sign Up Step 1: Send 6-digit Brevo OTP to user's Gmail
 * @param {Object} details - { username, name, email, password }
 */
export async function requestSignupOtp({ username, name, email, password }) {
  const res = await fetch('/api/auth/register-request-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, name, email, password }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to send signup verification code.');
  }

  return data;
}

/**
 * Sign Up Step 2: Verify Brevo OTP and activate account in MongoDB
 * @param {Object} payload - { email, otp }
 */
export async function verifySignupOtp({ email, otp }) {
  const res = await fetch('/api/auth/register-verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Incorrect or expired verification code.');
  }

  setSession(data.token, data.user);
  return data;
}

/**
 * Forgot Password Step 1: Request 6-digit reset code via Brevo
 * @param {string} identifier - Username or Email
 */
export async function requestPasswordReset(identifier) {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to request password reset code.');
  }

  return data;
}

/**
 * Forgot Password Step 2: Verify Brevo OTP and set new password
 * @param {Object} payload - { email, otp, newPassword }
 */
export async function confirmPasswordReset({ email, otp, newPassword }) {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, newPassword }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Password reset failed.');
  }

  setSession(data.token, data.user);
  return data;
}

/**
 * Direct Legacy Password Registration (used by tests or optional direct bypass)
 */
export async function registerWithPassword(name, email, password, username = '') {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, username }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Registration failed.');
  }

  setSession(data.token, data.user);
  return data;
}

/**
 * Send 6-digit OTP code to email via backend & Brevo (passwordless)
 */
export async function requestOtp(email) {
  const res = await fetch('/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to send verification code.');
  }

  return data;
}

/**
 * Verify 6-digit OTP code (passwordless)
 */
export async function verifyOtp(email, otp, name = '') {
  const res = await fetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, name }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Incorrect or expired verification code.');
  }

  setSession(data.token, data.user);
  return data;
}

/**
 * Sign out of QrNova account
 */
export function signOut() {
  setSession(null, null);
}
