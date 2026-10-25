require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');

const authRoutes = require('./routes/auth');
const qrRoutes = require('./routes/qr');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/qr', qrRoutes);

// Status endpoint
const { isDbConnected } = require('./config/db');
const { checkBrevoStatus } = require('./services/brevoService');

app.get('/api/status', async (req, res) => {
  const brevo = await checkBrevoStatus();
  res.json({
    success: true,
    mongo: {
      connected: isDbConnected(),
      uriConfigured: Boolean(process.env.MONGODB_URI),
    },
    brevo,
  });
});

const QrCode = require('./models/QrCode');

// Dynamic QR Link Direct Resolver (/d/:shortCode & /r/:shortCode)
app.get(['/d/:shortCode', '/r/:shortCode'], async (req, res) => {
  try {
    const { shortCode } = req.params;
    let item = null;

    if (isDbConnected()) {
      item = await QrCode.findOne({ shortCode });
    }

    if (!item) {
      // Memory store fallback
      try {
        const { memoryQrCodes } = require('./routes/qr');
        if (memoryQrCodes) {
          item = Array.from(memoryQrCodes.values()).find((q) => q.shortCode === shortCode);
        }
      } catch (e) {}
    }

    if (!item) {
      return res.redirect(`/#/view/${shortCode}?error=not_found`);
    }

    // Expiration check
    if (item.expiryDate && new Date() > new Date(item.expiryDate)) {
      return res.redirect(`/#/view/${shortCode}?error=expired`);
    }

    // Increment scan metrics
    if (isDbConnected()) {
      item.scanCount = (item.scanCount || 0) + 1;
      item.lastScannedAt = new Date();
      await item.save();
    }

    // If payload is a direct URL and not password protected, direct 302 redirect!
    const payload = (item.payload || '').trim();
    if (!item.isPasswordProtected && /^https?:\/\//i.test(payload)) {
      return res.redirect(payload);
    }

    // Otherwise open the in-app view modal
    return res.redirect(`/#/view/${shortCode}`);
  } catch (err) {
    return res.redirect(`/#/view/${req.params.shortCode}`);
  }
});

// Fallback to index.html for SPA client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 QrNova Platform Server running on http://localhost:${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`==================================================\n`);
});
