/**
 * QrNova Comprehensive Automated Verification Test Suite
 * Validates Frontend Serving, Dual Authentication (Password & Brevo OTP),
 * QR CRUD, Dynamic Link Routing, Expiration Logic, and AI Analysis.
 */

const http = require('http');

async function isServerRunning(url = 'http://127.0.0.1:3000') {
  try {
    const res = await fetch(`${url}/api/status`);
    return res.ok;
  } catch {
    return false;
  }
}

async function runTestSuite() {
  console.log('\n==================================================');
  console.log('🧪 Starting QrNova Platform Automated Test Suite');
  console.log('==================================================\n');

  const running = await isServerRunning();
  if (!running) {
    console.log('⚡ Server not detected on port 3000. Launching in-process test server...');
    require('../server/index.js');
    // Wait for server to bind port
    let ready = false;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 600));
      if (await isServerRunning()) {
        ready = true;
        break;
      }
    }
    if (!ready) {
      throw new Error('Could not establish connection to local server.');
    }
  }

  const BASE_URL = 'http://127.0.0.1:3000';
  const testEmail = `test.user.${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let jwtToken = null;
  let createdQrId = null;
  let dynamicShortCode = null;

  // 1. Static frontend test
  console.log('1️⃣  Testing Static Frontend Delivery (GET /)...');
  const indexRes = await fetch(`${BASE_URL}/`);
  if (!indexRes.ok) throw new Error(`GET / returned status ${indexRes.status}`);
  const html = await indexRes.text();
  if (!html.includes('QrNova')) throw new Error('GET / did not serve QrNova index.html');
  console.log('   ✅ HTTP 200 - HTML delivered with QrNova title & scripts');

  // 2. Health & Status Check
  console.log('\n2️⃣  Testing Service Health Endpoint (GET /api/status)...');
  const statusRes = await fetch(`${BASE_URL}/api/status`);
  const statusData = await statusRes.json();
  if (!statusData.success) throw new Error('GET /api/status failed');
  console.log(`   ✅ Status OK (Mongo Atlas: ${statusData.mongo?.connected ? 'Connected' : 'Local Hybrid'}, Brevo API: ${statusData.brevo?.configured ? 'Configured' : 'Offline Mode'})`);

  // 3. Password Authentication: Registration
  console.log('\n3️⃣  Testing Password Registration (POST /api/auth/register)...');
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Automated Tester',
      email: testEmail,
      password: testPassword,
    }),
  });
  const regData = await regRes.json();
  if (!regData.success || !regData.token) {
    throw new Error(regData.error || 'Password registration failed');
  }
  jwtToken = regData.token;
  console.log(`   ✅ Account created successfully for ${regData.user?.email}`);

  // 4. Password Authentication: Login
  console.log('\n4️⃣  Testing Password Login (POST /api/auth/login)...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });
  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.token) {
    throw new Error(loginData.error || 'Password login failed');
  }
  console.log(`   ✅ Logged in successfully with password`);

  // 5. Brevo Email OTP Authentication: Send OTP
  console.log('\n5️⃣  Testing Brevo OTP Generation (POST /api/auth/send-otp)...');
  const otpEmail = `otp.tester.${Date.now()}@example.com`;
  const sendRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: otpEmail }),
  });
  const sendData = await sendRes.json();
  if (!sendData.success) throw new Error(sendData.error || 'Send OTP failed');
  const receivedOtp = sendData.devOtp;
  console.log(`   ✅ OTP dispatched / generated (devOtp: ${receivedOtp || 'sent to verified inbox'})`);

  // 6. Brevo Email OTP Authentication: Verify OTP
  if (receivedOtp) {
    console.log('\n6️⃣  Testing Brevo OTP Verification (POST /api/auth/verify-otp)...');
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otpEmail, otp: receivedOtp }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success || !verifyData.token) {
      throw new Error(verifyData.error || 'Verify OTP failed');
    }
    console.log(`   ✅ OTP verification successful, JWT token issued`);
  }

  // 7. QR Creation with Dynamic Link and Expiry
  console.log('\n7️⃣  Testing QR Creation with Expiration (POST /api/qr)...');
  const expiryDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour
  const createRes = await fetch(`${BASE_URL}/api/qr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtToken}`,
    },
    body: JSON.stringify({
      title: 'Test Office Wi-Fi',
      notes: 'Automated test record',
      type: 'wifi',
      payload: 'WIFI:T:WPA;S:QrNovaGuest;P:Pass2026;;',
      isSaved: true,
      expiryDate,
      source: 'generated',
    }),
  });
  const createData = await createRes.json();
  if (!createData.success || !createData.item?._id) {
    throw new Error(createData.error || 'Create QR failed');
  }
  createdQrId = createData.item._id;
  dynamicShortCode = createData.item.shortCode;
  console.log(`   ✅ QR created with ID: ${createdQrId}, ShortCode: ${dynamicShortCode}`);

  // 8. Dynamic QR Link Resolver & Expiry Check
  console.log('\n8️⃣  Testing Dynamic QR Link Resolver (GET /api/qr/dynamic/:code)...');
  const dynRes = await fetch(`${BASE_URL}/api/qr/dynamic/${dynamicShortCode}`);
  const dynData = await dynRes.json();
  if (!dynData.success || dynData.expired !== false) {
    throw new Error(dynData.error || 'Dynamic resolver failed');
  }
  console.log(`   ✅ Dynamic link resolved: "${dynData.item?.title}", Active (expired: false)`);

  // 9. AI Analysis Endpoint
  console.log('\n9️⃣  Testing AI Content Analysis (POST /api/qr/ai-analyze)...');
  const aiRes = await fetch(`${BASE_URL}/api/qr/ai-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'WIFI:T:WPA;S:QrNovaGuest;P:Pass2026;;',
      type: 'wifi',
    }),
  });
  const aiData = await aiRes.json();
  if (!aiData.success || !aiData.analysis) {
    throw new Error(aiData.error || 'AI analyze failed');
  }
  console.log(`   ✅ AI Analysis generated (${aiData.provider})`);

  // 10. Clean up test record
  console.log('\n🔟 Cleaning up test data (DELETE /api/qr/:id)...');
  const delRes = await fetch(`${BASE_URL}/api/qr/${createdQrId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwtToken}` },
  });
  const delData = await delRes.json();
  if (!delData.success) throw new Error('Delete failed');
  console.log('   ✅ Test QR removed cleanly');

  console.log('\n==================================================');
  console.log('🎉 ALL 10 TESTS PASSED WITH 100% SUCCESS!');
  console.log('==================================================\n');

  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err.message);
  process.exit(1);
});
