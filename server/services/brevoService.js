/**
 * QrNova Brevo Transactional Email Service
 * Directly interacts with Brevo v3 Transactional REST API (https://api.brevo.com/v3/smtp/email)
 */

/**
 * Send 6-digit OTP verification email via Brevo Transactional Email API
 * @param {string} toEmail - Recipient email address
 * @param {string} otp - 6-digit one-time password
 * @returns {Promise<{success: boolean, messageId?: string, devOtp?: string}>}
 */
async function sendOtpEmail(toEmail, otp) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@qrnova.com';
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

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
        .container { max-width: 520px; margin: 0 auto; background: #161b22; border-radius: 12px; border: 1px solid #30363d; padding: 32px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .logo { font-size: 24px; font-weight: 800; color: #58a6ff; letter-spacing: -0.5px; margin-bottom: 24px; display: inline-block; }
        .logo span { color: #2ea043; }
        h2 { color: #f0f6fc; margin: 0 0 12px 0; font-size: 20px; }
        p { font-size: 14px; line-height: 1.6; color: #8b949e; margin: 8px 0; }
        .otp-box { background: #0d1117; border: 2px dashed #388bfd; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }
        .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #58a6ff; font-family: monospace; }
        .footer { font-size: 12px; color: #484f58; margin-top: 32px; border-top: 1px solid #21262d; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Qr<span>Nova</span></div>
        <h2>Sign in to QrNova</h2>
        <p>Please enter the following one-time passcode to verify your email and sign in to your QrNova account:</p>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
        </div>
        <p><strong>This code will expire in 5 minutes.</strong> If you did not request this code, you can safely ignore this email.</p>
        <div class="footer">
          <p>Sent securely via QrNova • Advanced QR & Security Engine</p>
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
        message: 'Brevo send failed; fell back to Dev OTP',
        devOtp: otp,
      };
    }
    throw new Error('Failed to dispatch verification email via Brevo API.');
  }
}

module.exports = {
  sendOtpEmail,
};
