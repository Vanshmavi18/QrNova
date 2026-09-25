/**
 * QrNova Authentication Module
 * Brevo Gmail OTP Modal & JWT Session Handling
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

/**
 * Send 6-digit OTP code to email via backend & Brevo
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
 * Verify 6-digit OTP code and receive JWT
 */
export async function verifyOtp(email, otp) {
  const res = await fetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Incorrect or expired verification code.');
  }

  currentToken = data.token;
  currentUser = data.user;

  try {
    localStorage.setItem(TOKEN_KEY, currentToken);
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  } catch (e) {
    console.error('Failed to store auth tokens:', e);
  }

  return data;
}

/**
 * Log in with email and password
 */
export async function loginWithPassword(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Login failed.');
  }

  currentToken = data.token;
  currentUser = data.user;

  try {
    localStorage.setItem(TOKEN_KEY, currentToken);
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  } catch (e) {
    console.error('Failed to store auth tokens:', e);
  }

  return data;
}

/**
 * Sign up / register with Name, Email, Password
 */
export async function registerWithPassword(name, email, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Registration failed.');
  }

  currentToken = data.token;
  currentUser = data.user;

  try {
    localStorage.setItem(TOKEN_KEY, currentToken);
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  } catch (e) {
    console.error('Failed to store auth tokens:', e);
  }

  return data;
}

/**
 * Sign out
 */
export function signOut() {
  currentToken = null;
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
