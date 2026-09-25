/**
 * QrNova Brevo Transactional Email Service
 * Directly interacts with Brevo v3 Transactional REST API (https://api.brevo.com/v3/smtp/email)
 */

/**
 * Check Brevo service connectivity and verified senders
 */
async function checkBrevoStatus() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_brevo_api_key_here')) {
    return { configured: false, reason: 'API key not configured in .env' };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey }
    });
    const data = await res.json();
    if (res.ok) {
      return { configured: true, connected: true, email: data.email, credits: data.plan?.[0]?.credits };
    }
    return { configured: true, connected: false, error: data.message };
  } catch (err) {
    return { configured: true, connected: false, error: err.message };
  }
}

/**
 * Send 6-digit OTP verification email via Brevo Transactional Email API
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit one-time password
 * @returns {Promise<{success: boolean, messageId?: string, devOtp?: string}>}
 */
async function sendOtpEmail(toEmail, otp) {
  const apiKey = process.env.BREVO_API_KEY;
  // Ensure we use the verified Brevo sender email
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'vanshmavi018@gmail.com';
  const senderName = process.env.BREVO_SENDER_NAME || 'QrNova Security';

  // Check if API key is configured and valid
  const isKeyConfigured = apiKey && apiKey.trim() !== '' && !apiKey.includes('your_brevo_api_key_here');

  if (!isKeyConfigured) {
    console.log(`\n==================================================`);
    console.log(`🔑 [DEV MODE - BREVO API KEY NOT CONFIGURED]`);
    console.log(`📧 Target Email: ${toEmail}`);
    console.log(`⚡ Login OTP:   >>> ${otp} <<< (Valid for 5 minutes)`);
    console.log(`ℹ️ Add your Brevo API key in .env to deliver real emails.`);
    console.log(`==================================================\n`);
    return {
      success: true,
      message: 'Dev OTP generated (Brevo API key not set)',
      devOtp: process.env.NODE_ENV === 'development' ? otp : undefined,
    };
  }

  // Styled with the requested Color Hunt palette (#FFFAD3, #FFDBB0, #FFCCB8, #FFB1B1)
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #140E12; color: #FFFDF8; margin: 0; padding: 24px; }
        .container { max-width: 520px; margin: 0 auto; background: #1F151C; border-radius: 16px; border: 1px solid rgba(255, 204, 184, 0.25); padding: 36px; box-shadow: 0 12px 36px rgba(0,0,0,0.6); }
        .brand-badge { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px; }
        .brand-icon { width: 36px; height: 36px; background: linear-gradient(135deg, #FFB1B1 0%, #FFCCB8 50%, #FFDBB0 100%); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-weight: 900; color: #140E12; font-size: 16px; line-height: 36px; text-align: center; }
        .brand-text { font-size: 24px; font-weight: 800; color: #FFFAD3; margin-left: 10px; letter-spacing: -0.5px; }
        .brand-text span { color: #FFB1B1; }
        h2 { color: #FFFDF8; margin: 0 0 12px 0; font-size: 22px; font-weight: 700; }
        p { font-size: 15px; line-height: 1.6; color: #D6C5BE; margin: 10px 0; }
        .otp-box { background: linear-gradient(135deg, rgba(255, 177, 177, 0.08) 0%, rgba(255, 219, 176, 0.08) 100%); border: 2px dashed #FFB1B1; border-radius: 12px; padding: 22px; text-align: center; margin: 28px 0; }
        .otp-code { font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #FFB1B1; font-family: monospace; }
        .badge-timer { display: inline-block; background: rgba(255, 250, 211, 0.15); color: #FFFAD3; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-top: 10px; }
        .footer { font-size: 12px; color: #8F7D77; margin-top: 32px; border-top: 1px solid rgba(255, 204, 184, 0.15); padding-top: 18px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="brand-badge">
          <div class="brand-icon">QR</div>
          <span class="brand-text">Qr<span>Nova</span></span>
        </div>
        <h2>Verify Your Email</h2>
        <p>You requested a one-time passcode to sign in to your QrNova account. Enter the 6-digit code below:</p>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
          <div class="badge-timer">⏳ Valid for 5 minutes</div>
        </div>
        <p>If you didn't request this code, you can safely ignore this email. No password is required.</p>
        <div class="footer">
          <p>Sent securely via Brevo Transactional Engine • QrNova QR Platform & Security Engine</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject: `Your QrNova Verification Code: ${otp}`,
        htmlContent: htmlContent,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Brevo API Error Response:', data);
      throw new Error(data.message || 'Brevo API rejected the request.');
    }

    console.log(`📧 Brevo email successfully dispatched to ${toEmail}. Message ID:`, data.messageId || 'sent');
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error('❌ Brevo Email Dispatch Error:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.log(`⚡ Fallback Dev OTP for ${toEmail}: >>> ${otp} <<<`);
      return {
        success: true,
        message: `Verification code generated (${error.message})`,
        devOtp: otp,
      };
    }
    throw new Error(error.message || 'Failed to dispatch verification email via Brevo API.');
  }
}

module.exports = {
  sendOtpEmail,
  checkBrevoStatus,
};
