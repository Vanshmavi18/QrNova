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

// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /api/auth/send-otp
 * Body: { email }
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
      // Remove any existing active OTP for this email
      await Otp.deleteMany({ email: cleanEmail });
      // Create new OTP
      await Otp.create({
        email: cleanEmail,
        otpHash,
        attempts: 0,
        expiresAt,
      });
    } else {
      // Resilient in-memory store
      memoryOtps.set(cleanEmail, {
        otpHash,
        attempts: 0,
        expiresAt,
      });
    }

    const result = await sendOtpEmail(cleanEmail, otp);

    return res.json({
      success: true,
      message: `A 6-digit verification code has been dispatched to ${cleanEmail}`,
      devOtp: result.devOtp, // Returned only in development / when Brevo key is unset
    });
  } catch (error) {
    console.error('Send OTP Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to send verification code.' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Body: { email, otp }
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and 6-digit code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    let otpRecord = null;
    if (isDbConnected()) {
      otpRecord = await Otp.findOne({ email: cleanEmail });
    } else {
      otpRecord = memoryOtps.get(cleanEmail);
    }

    if (!otpRecord) {
      return res.status(400).json({ success: false, error: 'No active OTP request found or code has expired. Please request a new code.' });
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      if (isDbConnected()) await Otp.deleteOne({ _id: otpRecord._id });
      else memoryOtps.delete(cleanEmail);
      return res.status(400).json({ success: false, error: 'The verification code has expired. Please request a new one.' });
    }

    if (otpRecord.attempts >= 5) {
      if (isDbConnected()) await Otp.deleteOne({ _id: otpRecord._id });
      else memoryOtps.delete(cleanEmail);
      return res.status(429).json({ success: false, error: 'Too many failed attempts. Please request a new verification code.' });
    }

    const isMatch = await bcrypt.compare(cleanOtp, otpRecord.otpHash);
    if (!isMatch) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      if (isDbConnected()) {
        await otpRecord.save();
      }
      const remaining = 5 - otpRecord.attempts;
      return res.status(400).json({
        success: false,
        error: `Incorrect verification code. ${remaining} attempt(s) remaining.`,
      });
    }

    // OTP is valid! Clean up OTP record
    if (isDbConnected()) {
      await Otp.deleteOne({ _id: otpRecord._id });
    } else {
      memoryOtps.delete(cleanEmail);
    }

    // Find or create user
    let user = null;
    if (isDbConnected()) {
      user = await User.findOne({ email: cleanEmail });
      if (!user) {
        user = await User.create({
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          lastLogin: new Date(),
        });
      } else {
        user.lastLogin = new Date();
        await user.save();
      }
    } else {
      if (!memoryUsers.has(cleanEmail)) {
        memoryUsers.set(cleanEmail, {
          _id: 'usr_' + Date.now(),
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          preferences: { theme: 'dark', a11yLargeText: false, a11yHighContrast: false, soundEnabled: true },
          createdAt: new Date(),
          lastLogin: new Date(),
        });
      }
      user = memoryUsers.get(cleanEmail);
      user.lastLogin = new Date();
    }

    // Sign JWT
    const secret = process.env.JWT_SECRET || 'qrnova_jwt_secret_dev_key_849204928402';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      secret,
      { expiresIn }
    );

    return res.json({
      success: true,
      message: 'Authentication successful',
      token,
      user: {
        id: user._id,
        email: user.email,
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
 * Sign up a new user with Name, Email, and Password
 * Body: { name, email, password }
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
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
    const cleanName = (name || '').trim() || cleanEmail.split('@')[0];

    let user = null;
    if (isDbConnected()) {
      if (existingUser) {
        existingUser.name = cleanName;
        existingUser.password = hashedPassword;
        existingUser.lastLogin = new Date();
        user = await existingUser.save();
      } else {
        user = await User.create({
          email: cleanEmail,
          name: cleanName,
          password: hashedPassword,
          lastLogin: new Date(),
        });
      }
    } else {
      if (existingUser) {
        existingUser.name = cleanName;
        existingUser.password = hashedPassword;
        existingUser.lastLogin = new Date();
        user = existingUser;
      } else {
        user = {
          _id: 'usr_' + Date.now(),
          email: cleanEmail,
          name: cleanName,
          password: hashedPassword,
          preferences: { theme: 'dark', a11yLargeText: false, a11yHighContrast: false, soundEnabled: true },
          createdAt: new Date(),
          lastLogin: new Date(),
        };
        memoryUsers.set(cleanEmail, user);
      }
    }

    const secret = process.env.JWT_SECRET || 'qrnova_jwt_secret_dev_key_849204928402';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ id: user._id, email: user.email }, secret, { expiresIn });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: user._id,
        email: user.email,
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
 * POST /api/auth/login
 * Log in an existing user with Email and Password
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = null;
    if (isDbConnected()) {
      user = await User.findOne({ email: cleanEmail });
    } else {
      user = memoryUsers.get(cleanEmail);
    }

    if (!user) {
      return res.status(400).json({ success: false, error: 'No account found with this email. Please sign up.' });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        error: 'This account was created via Brevo Email OTP. Please sign in with email verification code or register a password.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect email or password.' });
    }

    user.lastLogin = new Date();
    if (isDbConnected()) {
      await user.save();
    }

    const secret = process.env.JWT_SECRET || 'qrnova_jwt_secret_dev_key_849204928402';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ id: user._id, email: user.email }, secret, { expiresIn });

    return res.json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: {
        id: user._id,
        email: user.email,
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
