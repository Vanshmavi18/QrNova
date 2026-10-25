const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { sendOtpEmail } = require('../services/brevoService');
const authMiddleware = require('../middleware/authMiddleware');
const { isDbConnected } = require('../config/db');

// In-memory fallback stores when MongoDB is in offline/disconnected mode
const memoryUsers = new Map();
const memoryOtps = new Map();

// Helper: Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: Sign JWT
function signUserToken(user) {
  const secret = process.env.JWT_SECRET || 'qrnova_jwt_secret_dev_key_849204928402';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      username: user.username,
    },
    secret,
    { expiresIn }
  );
}

// Helper: Mask email for privacy display
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}${'*'.repeat(Math.max(1, name.length - 2))}${name.slice(-1)}@${domain}`;
}

/**
 * POST /api/auth/register-request-otp
 * Step 1 of Sign Up: Validate user details and send verification code via Brevo
 * Body: { username, name, email, password }
 */
router.post('/register-request-otp', async (req, res) => {
  try {
    const { username, name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const cleanUsername = (username || cleanEmail.split('@')[0])
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9_.-]/g, '');

    if (cleanUsername.length < 3) {
      return res.status(400).json({ success: false, error: 'Username must be at least 3 characters long.' });
    }

    if (cleanUsername.length > 35) {
      return res.status(400).json({ success: false, error: 'Username must be at most 35 characters long.' });
    }

    const cleanName = (name || cleanUsername).trim();

    // Check if user already exists
    if (isDbConnected()) {
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser && existingUser.password) {
        return res.status(400).json({
          success: false,
          error: 'An account with this email already exists. Please log in directly with your password.',
        });
      }

      const existingUsername = await User.findOne({ username: cleanUsername });
      if (existingUsername && existingUsername.email !== cleanEmail) {
        return res.status(400).json({
          success: false,
          error: `Username "${cleanUsername}" is already taken. Please choose another username.`,
        });
      }
    } else {
      const existingUser = memoryUsers.get(cleanEmail);
      if (existingUser && existingUser.password) {
        return res.status(400).json({
          success: false,
          error: 'An account with this email already exists. Please log in.',
        });
      }
    }

    // Hash the requested password safely before storing pending registration
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate and hash OTP
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, salt);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (isDbConnected()) {
      await Otp.deleteMany({ email: cleanEmail, purpose: 'signup' });
      await Otp.create({
        email: cleanEmail,
        otpHash,
        purpose: 'signup',
        username: cleanUsername,
        name: cleanName,
        passwordHash,
        attempts: 0,
        expiresAt,
      });
    } else {
      memoryOtps.set(`${cleanEmail}_signup`, {
        otpHash,
        purpose: 'signup',
        username: cleanUsername,
        name: cleanName,
        passwordHash,
        attempts: 0,
        expiresAt,
      });
    }

    // Send email via Brevo
    const result = await sendOtpEmail(cleanEmail, otp, 'signup');

    const message = result.devOtp
      ? (result.message || `Verification code: ${result.devOtp}`)
      : `A 6-digit verification code has been dispatched to ${cleanEmail}`;

    return res.json({
      success: true,
      message,
      email: cleanEmail,
      username: cleanUsername,
      devOtp: result.devOtp,
    });
  } catch (error) {
    console.error('Register Request OTP Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to dispatch verification code.' });
  }
});

/**
 * POST /api/auth/register-verify-otp
 * Step 2 of Sign Up: Verify Brevo OTP, activate account in MongoDB, and set password
 * Body: { email, otp }
 */
router.post('/register-verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit verification code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    let otpRecord = null;
    if (isDbConnected()) {
      otpRecord = await Otp.findOne({ email: cleanEmail, purpose: 'signup' });
    } else {
      otpRecord = memoryOtps.get(`${cleanEmail}_signup`);
    }

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        error: 'No active signup verification request found or code has expired. Please try signing up again.',
      });
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      if (isDbConnected()) await Otp.deleteOne({ _id: otpRecord._id });
      else memoryOtps.delete(`${cleanEmail}_signup`);
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new code.' });
    }

    if (otpRecord.attempts >= 5) {
      if (isDbConnected()) await Otp.deleteOne({ _id: otpRecord._id });
      else memoryOtps.delete(`${cleanEmail}_signup`);
      return res.status(429).json({ success: false, error: 'Too many incorrect attempts. Please request a new code.' });
    }

    const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otpHash);
    if (!isMatch) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      if (isDbConnected()) await otpRecord.save();
      const remaining = 5 - otpRecord.attempts;
      return res.status(400).json({ success: false, error: `Incorrect verification code. ${remaining} attempt(s) remaining.` });
    }

    // OTP verified! Clean up OTP record
    if (isDbConnected()) {
      await Otp.deleteOne({ _id: otpRecord._id });
    } else {
      memoryOtps.delete(`${cleanEmail}_signup`);
    }

    // Create or update user in MongoDB
    let user = null;
    if (isDbConnected()) {
      user = await User.findOne({ email: cleanEmail });
      if (!user) {
        user = await User.create({
          email: cleanEmail,
          username: otpRecord.username || cleanEmail.split('@')[0],
          name: otpRecord.name || otpRecord.username || cleanEmail.split('@')[0],
          password: otpRecord.passwordHash,
          isEmailVerified: true,
          lastLogin: new Date(),
        });
      } else {
        user.username = otpRecord.username || user.username || cleanEmail.split('@')[0];
        user.name = otpRecord.name || user.name || user.username;
        user.password = otpRecord.passwordHash;
        user.isEmailVerified = true;
        user.lastLogin = new Date();
        await user.save();
      }
    } else {
      user = {
        _id: 'usr_' + Date.now(),
        email: cleanEmail,
        username: otpRecord.username || cleanEmail.split('@')[0],
        name: otpRecord.name || cleanEmail.split('@')[0],
        password: otpRecord.passwordHash,
        isEmailVerified: true,
        preferences: { theme: 'dark', a11yLargeText: false, a11yHighContrast: false, soundEnabled: true },
        createdAt: new Date(),
        lastLogin: new Date(),
      };
      memoryUsers.set(cleanEmail, user);
    }

    const token = signUserToken(user);

    return res.status(201).json({
      success: true,
      message: 'Gmail verified and account created successfully!',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        name: user.name,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error('Register Verify OTP Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Verification failed. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 * Log in directly using Username OR Email and Password
 * Body: { identifier, password } or { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const loginTarget = (identifier || email || '').trim().toLowerCase();

    if (!loginTarget || !password) {
      return res.status(400).json({ success: false, error: 'Please enter your username/email and password.' });
    }

    let user = null;
    if (isDbConnected()) {
      user = await User.findOne({
        $or: [
          { email: loginTarget },
          { username: loginTarget },
        ],
      });
    } else {
      user = memoryUsers.get(loginTarget);
      if (!user) {
        for (const u of memoryUsers.values()) {
          if (u.username === loginTarget) {
            user = u;
            break;
          }
        }
      }
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'No account found with this username or email. Please check your spelling or sign up.',
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        error: 'This account does not have a password set yet. Please click "Forgot Password" or sign in with Brevo OTP.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect password. Please try again or click Forgot Password.' });
    }

    user.lastLogin = new Date();
    if (isDbConnected()) {
      await user.save();
    }

    const token = signUserToken(user);

    return res.json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        name: user.name,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error('Password Login Error:', error);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request a 6-digit password reset code sent via Brevo to user's verified Gmail
 * Body: { identifier } (Username or Email)
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;
    const target = (identifier || '').trim().toLowerCase();

    if (!target) {
      return res.status(400).json({ success: false, error: 'Please enter your registered username or email address.' });
    }

    let user = null;
    if (isDbConnected()) {
      user = await User.findOne({
        $or: [
          { email: target },
          { username: target },
        ],
      });
    } else {
      user = memoryUsers.get(target);
      if (!user) {
        for (const u of memoryUsers.values()) {
          if (u.username === target) {
            user = u;
            break;
          }
        }
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'No registered account found with that username or email address.',
      });
    }

    const otp = generateOtp();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (isDbConnected()) {
      await Otp.deleteMany({ email: user.email, purpose: 'reset' });
      await Otp.create({
        email: user.email,
        otpHash,
        purpose: 'reset',
        attempts: 0,
        expiresAt,
      });
    } else {
      memoryOtps.set(`${user.email}_reset`, {
        otpHash,
        purpose: 'reset',
        attempts: 0,
        expiresAt,
      });
    }

    const result = await sendOtpEmail(user.email, otp, 'reset');

    const message = result.devOtp
      ? (result.message || `Password reset code is ${result.devOtp}`)
      : `A 6-digit password reset code has been sent to ${user.email}`;

    return res.json({
      success: true,
      message,
      email: user.email,
      maskedEmail: maskEmail(user.email),
      devOtp: result.devOtp,
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to dispatch password reset code.' });
  }
});

/**
 * POST /api/auth/reset-password
 * Verify Brevo reset OTP and set new password
 * Body: { email, otp, newPassword }
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, verification code, and new password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long.' });
    }

    let otpRecord = null;
    if (isDbConnected()) {
      otpRecord = await Otp.findOne({ email: cleanEmail, purpose: 'reset' });
    } else {
      otpRecord = memoryOtps.get(`${cleanEmail}_reset`);
    }

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        error: 'No active password reset request found or code has expired. Please request a new code.',
      });
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      if (isDbConnected()) await Otp.deleteOne({ _id: otpRecord._id });
      else memoryOtps.delete(`${cleanEmail}_reset`);
      return res.status(400).json({ success: false, error: 'Password reset code has expired. Please request a new one.' });
    }

    if (otpRecord.attempts >= 5) {
      if (isDbConnected()) await Otp.deleteOne({ _id: otpRecord._id });
      else memoryOtps.delete(`${cleanEmail}_reset`);
      return res.status(429).json({ success: false, error: 'Too many incorrect attempts. Please request a new code.' });
    }

    const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otpHash);
    if (!isMatch) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      if (isDbConnected()) await otpRecord.save();
      const remaining = 5 - otpRecord.attempts;
      return res.status(400).json({ success: false, error: `Incorrect code. ${remaining} attempt(s) remaining.` });
    }

    // Clean up OTP
    if (isDbConnected()) {
      await Otp.deleteOne({ _id: otpRecord._id });
    } else {
      memoryOtps.delete(`${cleanEmail}_reset`);
    }

    // Update password in User document
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    let user = null;
    if (isDbConnected()) {
      user = await User.findOne({ email: cleanEmail });
      if (!user) {
        return res.status(404).json({ success: false, error: 'User account not found.' });
      }
      user.password = hashedPassword;
      user.isEmailVerified = true;
      user.lastLogin = new Date();
      await user.save();
    } else {
      user = memoryUsers.get(cleanEmail);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User account not found.' });
      }
      user.password = hashedPassword;
      user.isEmailVerified = true;
      user.lastLogin = new Date();
    }

    const token = signUserToken(user);

    return res.json({
      success: true,
      message: 'Your password has been reset successfully! You are now logged in.',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        name: user.name,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Password reset failed.' });
  }
});

/**
 * POST /api/auth/send-otp
 * Passwordless Brevo OTP dispatch
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const otp = generateOtp();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (isDbConnected()) {
      await Otp.deleteMany({ email: cleanEmail, purpose: 'login' });
      await Otp.create({
        email: cleanEmail,
        otpHash,
        purpose: 'login',
        attempts: 0,
        expiresAt,
      });
    } else {
      memoryOtps.set(`${cleanEmail}_login`, {
        otpHash,
        purpose: 'login',
        attempts: 0,
        expiresAt,
      });
    }

    const result = await sendOtpEmail(cleanEmail, otp, 'login');

    const message = result.devOtp
      ? (result.message || `Verification code: ${result.devOtp}`)
      : `A 6-digit verification code has been dispatched to ${cleanEmail}`;

    return res.json({
      success: true,
      message,
      devOtp: result.devOtp,
    });
  } catch (error) {
    console.error('Send OTP Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to send verification code.' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Passwordless Brevo OTP verification
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, name } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();
    const cleanName = (name || '').trim();

    let otpRecord = null;
    if (isDbConnected()) {
      otpRecord = await Otp.findOne({ email: cleanEmail, purpose: { $in: ['login', 'verify'] } });
    } else {
      otpRecord = memoryOtps.get(`${cleanEmail}_login`) || memoryOtps.get(cleanEmail);
    }

    if (!otpRecord) {
      return res.status(400).json({ success: false, error: 'No active OTP request found or code has expired. Please request a new code.' });
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      if (isDbConnected()) await Otp.deleteOne({ _id: otpRecord._id });
      else memoryOtps.delete(`${cleanEmail}_login`);
      return res.status(400).json({ success: false, error: 'The verification code has expired. Please request a new one.' });
    }

    if (otpRecord.attempts >= 5) {
      if (isDbConnected()) await Otp.deleteOne({ _id: otpRecord._id });
      else memoryOtps.delete(`${cleanEmail}_login`);
      return res.status(429).json({ success: false, error: 'Too many failed attempts. Please request a new verification code.' });
    }

    const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otpHash);
    if (!isMatch) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      if (isDbConnected()) await otpRecord.save();
      const remaining = 5 - otpRecord.attempts;
      return res.status(400).json({
        success: false,
        error: `Incorrect verification code. ${remaining} attempt(s) remaining.`,
      });
    }

    if (isDbConnected()) {
      await Otp.deleteOne({ _id: otpRecord._id });
    } else {
      memoryOtps.delete(`${cleanEmail}_login`);
      memoryOtps.delete(cleanEmail);
    }

    // Find or create user
    let user = null;
    if (isDbConnected()) {
      user = await User.findOne({ email: cleanEmail });
      if (!user) {
        user = await User.create({
          email: cleanEmail,
          username: cleanEmail.split('@')[0],
          name: cleanName || cleanEmail.split('@')[0],
          isEmailVerified: true,
          lastLogin: new Date(),
        });
      } else {
        if (cleanName && (!user.name || user.name === cleanEmail.split('@')[0])) {
          user.name = cleanName;
        }
        user.isEmailVerified = true;
        user.lastLogin = new Date();
        await user.save();
      }
    } else {
      if (!memoryUsers.has(cleanEmail)) {
        memoryUsers.set(cleanEmail, {
          _id: 'usr_' + Date.now(),
          email: cleanEmail,
          username: cleanEmail.split('@')[0],
          name: cleanName || cleanEmail.split('@')[0],
          isEmailVerified: true,
          preferences: { theme: 'dark', a11yLargeText: false, a11yHighContrast: false, soundEnabled: true },
          createdAt: new Date(),
          lastLogin: new Date(),
        });
      }
      user = memoryUsers.get(cleanEmail);
      if (cleanName && (!user.name || user.name === cleanEmail.split('@')[0])) {
        user.name = cleanName;
      }
      user.lastLogin = new Date();
    }

    const token = signUserToken(user);

    return res.json({
      success: true,
      message: 'Authentication successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        name: user.name,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({ success: false, error: 'Verification failed. Please try again.' });
  }
});

/**
 * POST /api/auth/register
 * Direct password registration (supports username and legacy calls)
 */
router.post('/register', async (req, res) => {
  try {
    const { username, name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const cleanUsername = (username || cleanEmail.split('@')[0]).trim().toLowerCase().replace(/[^a-zA-Z0-9_.-]/g, '');
    const cleanName = (name || cleanUsername).trim();

    let existingUser = null;
    if (isDbConnected()) {
      existingUser = await User.findOne({ email: cleanEmail });
    } else {
      existingUser = memoryUsers.get(cleanEmail);
    }

    if (existingUser && existingUser.password) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists. Please log in.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let user = null;
    if (isDbConnected()) {
      if (existingUser) {
        existingUser.username = cleanUsername || existingUser.username;
        existingUser.name = cleanName;
        existingUser.password = hashedPassword;
        existingUser.isEmailVerified = true;
        existingUser.lastLogin = new Date();
        user = await existingUser.save();
      } else {
        user = await User.create({
          email: cleanEmail,
          username: cleanUsername,
          name: cleanName,
          password: hashedPassword,
          isEmailVerified: true,
          lastLogin: new Date(),
        });
      }
    } else {
      user = {
        _id: 'usr_' + Date.now(),
        email: cleanEmail,
        username: cleanUsername,
        name: cleanName,
        password: hashedPassword,
        isEmailVerified: true,
        preferences: { theme: 'dark', a11yLargeText: false, a11yHighContrast: false, soundEnabled: true },
        createdAt: new Date(),
        lastLogin: new Date(),
      };
      memoryUsers.set(cleanEmail, user);
    }

    const token = signUserToken(user);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        name: user.name,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Registration failed.' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authMiddleware(true), async (req, res) => {
  try {
    let user = null;
    if (isDbConnected()) {
      user = await User.findById(req.user.id);
    } else {
      user = memoryUsers.get(req.user.email);
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'User profile not found.' });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username || user.email.split('@')[0],
        name: user.name,
        preferences: user.preferences,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/auth/preferences
 */
router.put('/preferences', authMiddleware(true), async (req, res) => {
  try {
    const { preferences } = req.body;
    let user = null;
    if (isDbConnected()) {
      user = await User.findById(req.user.id);
      if (user && preferences) {
        user.preferences = { ...user.preferences.toObject(), ...preferences };
        await user.save();
      }
    } else {
      user = memoryUsers.get(req.user.email);
      if (user && preferences) {
        user.preferences = { ...user.preferences, ...preferences };
      }
    }

    return res.json({ success: true, preferences: user ? user.preferences : preferences });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
