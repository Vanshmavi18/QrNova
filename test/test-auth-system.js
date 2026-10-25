/**
 * Comprehensive Test for QrNova Auth System:
 * 1. New user registration with Brevo OTP Gmail verification & password setting
 * 2. Old user login directly using Username or Gmail and password
 * 3. Password reset via Brevo OTP
 */

require('dotenv').config();
const http = require('http');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

async function runTests() {
  console.log('🧪 Starting QrNova Auth System Verification...\n');

  const timestamp = Date.now().toString().slice(-6);
  const testUsername = `user_${timestamp}`;
  const testEmail = `testuser_${timestamp}@gmail.com`;
  const initialPassword = 'InitialSecurePass123!';
  const updatedPassword = 'UpdatedSecurePass456!';

  // --- Step 1: Register Request OTP ---
  console.log('1️⃣  Testing Sign Up: Request Brevo OTP...');
  const reqOtpRes = await fetch(`${BASE_URL}/api/auth/register-request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUsername,
      name: 'New Test User',
      email: testEmail,
      password: initialPassword,
    }),
  });

  const reqOtpData = await reqOtpRes.json();
  console.log('   Response:', reqOtpData);
  if (!reqOtpData.success) {
    throw new Error(`Register request OTP failed: ${reqOtpData.error}`);
  }
  console.log('   ✅ Brevo OTP registration request succeeded!');

  const otp = reqOtpData.devOtp;
  if (!otp) {
    console.log('   ℹ️ Real email sent via Brevo (devOtp not exposed). Looking up DB record for test...');
  }

  // If devOtp is present, use it. Otherwise, query OTP from database directly for automated test:
  let testOtp = otp;
  if (!testOtp) {
    const mongoose = require('mongoose');
    const Otp = require('../server/models/Otp');
    const bcrypt = require('bcryptjs');
    const record = await Otp.findOne({ email: testEmail, purpose: 'signup' });
    if (!record) throw new Error('No OTP record found in DB');
    // For test purposes, we will test with a sample or mock if needed
  }

  // --- Step 2: Register Verify OTP & Activate Account ---
  console.log('\n2️⃣  Testing Sign Up: Verify Gmail OTP & Activate Account...');
  const verifyRes = await fetch(`${BASE_URL}/api/auth/register-verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      otp: testOtp,
    }),
  });

  const verifyData = await verifyRes.json();
  console.log('   Response status:', verifyRes.status, 'Message:', verifyData.message);
  if (!verifyData.success || !verifyData.token) {
    throw new Error(`Register verification failed: ${verifyData.error}`);
  }
  console.log('   ✅ Account created & Gmail verified successfully!');
  console.log('   User ID:', verifyData.user.id, '| Username:', verifyData.user.username);

  // --- Step 3: Direct Login with USERNAME + Password ---
  console.log('\n3️⃣  Testing Direct Login: Username + Password...');
  const loginUserRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: testUsername,
      password: initialPassword,
    }),
  });

  const loginUserData = await loginUserRes.json();
  console.log('   Response status:', loginUserRes.status, 'Message:', loginUserData.message);
  if (!loginUserData.success || !loginUserData.token) {
    throw new Error(`Username login failed: ${loginUserData.error}`);
  }
  console.log('   ✅ Login with Username succeeded!');

  // --- Step 4: Direct Login with GMAIL + Password ---
  console.log('\n4️⃣  Testing Direct Login: Gmail + Password...');
  const loginEmailRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: testEmail,
      password: initialPassword,
    }),
  });

  const loginEmailData = await loginEmailRes.json();
  console.log('   Response status:', loginEmailRes.status, 'Message:', loginEmailData.message);
  if (!loginEmailData.success || !loginEmailData.token) {
    throw new Error(`Gmail login failed: ${loginEmailData.error}`);
  }
  console.log('   ✅ Login with Gmail address succeeded!');

  // --- Step 5: Test Invalid Password Login ---
  console.log('\n5️⃣  Testing Invalid Password Protection...');
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: testUsername,
      password: 'IncorrectPassword999!',
    }),
  });

  const badLoginData = await badLoginRes.json();
  if (badLoginRes.status === 400 && !badLoginData.success) {
    console.log('   ✅ Correctly rejected invalid password:', badLoginData.error);
  } else {
    throw new Error('Should have rejected bad password!');
  }

  // --- Step 6: Forgot Password Request (by Username or Email) ---
  console.log('\n6️⃣  Testing Forgot Password: Request Reset Code...');
  const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: testUsername,
    }),
  });

  const forgotData = await forgotRes.json();
  console.log('   Response:', forgotData);
  if (!forgotData.success || !forgotData.email) {
    throw new Error(`Forgot password request failed: ${forgotData.error}`);
  }
  console.log('   ✅ Password reset code dispatched to:', forgotData.email, `(${forgotData.maskedEmail})`);

  const resetOtp = forgotData.devOtp;

  // --- Step 7: Reset Password (Verify Code & Set New Password) ---
  console.log('\n7️⃣  Testing Reset Password: Verify Code & Set New Password...');
  const resetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      otp: resetOtp,
      newPassword: updatedPassword,
    }),
  });

  const resetData = await resetRes.json();
  console.log('   Response status:', resetRes.status, 'Message:', resetData.message);
  if (!resetData.success || !resetData.token) {
    throw new Error(`Reset password failed: ${resetData.error}`);
  }
  console.log('   ✅ Password reset successfully and user logged in!');

  // --- Step 8: Verify Old Password No Longer Works ---
  console.log('\n8️⃣  Testing Old Password Rejection...');
  const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: testUsername,
      password: initialPassword,
    }),
  });
  if (oldLoginRes.status === 400) {
    console.log('   ✅ Old password is now invalid as expected.');
  } else {
    throw new Error('Old password should not work after reset!');
  }

  // --- Step 9: Verify New Password Works for Login ---
  console.log('\n9️⃣  Testing Direct Login with New Password...');
  const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: testUsername,
      password: updatedPassword,
    }),
  });
  const newLoginData = await newLoginRes.json();
  if (!newLoginData.success) {
    throw new Error(`New password login failed: ${newLoginData.error}`);
  }
  console.log('   ✅ Login with new password succeeded!');

  console.log('\n🎉 ALL AUTHENTICATION SYSTEM TESTS PASSED SUCCESSFULLY! 💯\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
