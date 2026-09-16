const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QrCode = require('../models/QrCode');
const authMiddleware = require('../middleware/authMiddleware');
const { isDbConnected } = require('../config/db');

const fs = require('fs');
const path = require('path');
const storeFile = path.join(__dirname, '../data/qrcodes.json');

// In-memory fallback for QR items when MongoDB is disconnected
const memoryQrCodes = new Map();

// Initialize memory from storeFile if exists
try {
  if (fs.existsSync(storeFile)) {
    const raw = fs.readFileSync(storeFile, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.forEach(it => memoryQrCodes.set(it._id, it));
  }
} catch (e) {}

function persistMemoryStore() {
  try {
    fs.writeFileSync(storeFile, JSON.stringify(Array.from(memoryQrCodes.values()), null, 2));
  } catch (e) {}
}

// Sync local items to MongoDB Atlas when connected
async function syncLocalToMongo() {
  if (!isDbConnected() || memoryQrCodes.size === 0) return;
  try {
    for (const [id, item] of memoryQrCodes.entries()) {
      const exists = await QrCode.findOne({ shortCode: item.shortCode });
      if (!exists) {
        await QrCode.create({
          userId: item.userId,
          shortCode: item.shortCode,
          title: item.title,
          notes: item.notes,
          type: item.type,
          payload: item.payload,
          styleConfig: item.styleConfig,
          isPasswordProtected: item.isPasswordProtected,
          isFavorite: item.isFavorite,
          isSaved: item.isSaved,
          source: item.source,
          expiryDate: item.expiryDate,
        });
      }
    }
  } catch (e) {
    console.warn('Sync to MongoDB pending:', e.message);
  }
}

// Helper to generate short random code
function generateShortCode() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * GET /api/qr
 * Fetch QR codes (History and Saved)
 * Query filters: source (generated/scanned), isSaved, isFavorite, type, search
 */
router.get('/', authMiddleware(false), async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { source, isSaved, isFavorite, type, search } = req.query;

    let items = [];

    if (isDbConnected()) {
      const query = {};
      if (userId) {
        query.userId = userId;
      } else {
        // Guest user: returns items created in this guest session or empty
        query.userId = null;
      }

      if (source) query.source = source;
      if (isSaved !== undefined) query.isSaved = isSaved === 'true';
      if (isFavorite !== undefined) query.isFavorite = isFavorite === 'true';
      if (type && type !== 'all') query.type = type;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { payload: { $regex: search, $options: 'i' } },
          { notes: { $regex: search, $options: 'i' } },
        ];
      }

      items = await QrCode.find(query).sort({ createdAt: -1 }).limit(100);
    } else {
      // In-memory store
      items = Array.from(memoryQrCodes.values()).filter((item) => {
        if (userId && item.userId !== userId) return false;
        if (!userId && item.userId !== null) return false;
        if (source && item.source !== source) return false;
        if (isSaved !== undefined && item.isSaved !== (isSaved === 'true')) return false;
        if (isFavorite !== undefined && item.isFavorite !== (isFavorite === 'true')) return false;
        if (type && type !== 'all' && item.type !== type) return false;
        if (search) {
          const s = search.toLowerCase();
          const matchTitle = (item.title || '').toLowerCase().includes(s);
          const matchPayload = (item.payload || '').toLowerCase().includes(s);
          const matchNotes = (item.notes || '').toLowerCase().includes(s);
          if (!matchTitle && !matchPayload && !matchNotes) return false;
        }
        return true;
      });
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return res.json({ success: true, count: items.length, items });
  } catch (error) {
    console.error('Fetch QRs error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/qr
 * Save or record a new QR code (generated or scanned)
 */
router.post('/', authMiddleware(false), async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const {
      title,
      notes,
      type = 'text',
      payload,
      styleConfig = {},
      isPasswordProtected = false,
      isFavorite = false,
      isSaved = false,
      source = 'generated',
      expiryDate = null,
    } = req.body;

    if (!payload || typeof payload !== 'string') {
      return res.status(400).json({ success: false, error: 'QR payload is required.' });
    }

    const shortCode = generateShortCode();

    let qrItem = null;

    if (isDbConnected()) {
      qrItem = await QrCode.create({
        userId,
        shortCode,
        title: title || (type.toUpperCase() + ' QR'),
        notes: notes || '',
        type,
        payload,
        styleConfig,
        isPasswordProtected: Boolean(isPasswordProtected),
        isFavorite: Boolean(isFavorite),
        isSaved: Boolean(isSaved),
        source,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      });
    } else {
      const id = 'qr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      qrItem = {
        _id: id,
        userId,
        shortCode,
        title: title || (type.toUpperCase() + ' QR'),
        notes: notes || '',
        type,
        payload,
        styleConfig,
        isPasswordProtected: Boolean(isPasswordProtected),
        isFavorite: Boolean(isFavorite),
        isSaved: Boolean(isSaved),
        source,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        scanCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memoryQrCodes.set(id, qrItem);
      persistMemoryStore();
    }

    return res.status(201).json({ success: true, item: qrItem });
  } catch (error) {
    console.error('Create QR error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/qr/:id
 * Update an existing QR code (title, notes, favorite, saved, expiry)
 */
router.put('/:id', authMiddleware(false), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, notes, isFavorite, isSaved, expiryDate } = req.body;

    let updatedItem = null;

    if (isDbConnected()) {
      const item = await QrCode.findById(id);
      if (!item) {
        return res.status(404).json({ success: false, error: 'QR code not found.' });
      }

      if (title !== undefined) item.title = title;
      if (notes !== undefined) item.notes = notes;
      if (isFavorite !== undefined) item.isFavorite = Boolean(isFavorite);
      if (isSaved !== undefined) item.isSaved = Boolean(isSaved);
      if (expiryDate !== undefined) item.expiryDate = expiryDate ? new Date(expiryDate) : null;

      updatedItem = await item.save();
    } else {
      if (!memoryQrCodes.has(id)) {
        return res.status(404).json({ success: false, error: 'QR code not found.' });
      }
      const item = memoryQrCodes.get(id);
      if (title !== undefined) item.title = title;
      if (notes !== undefined) item.notes = notes;
      if (isFavorite !== undefined) item.isFavorite = Boolean(isFavorite);
      if (isSaved !== undefined) item.isSaved = Boolean(isSaved);
      if (expiryDate !== undefined) item.expiryDate = expiryDate ? new Date(expiryDate) : null;
      item.updatedAt = new Date();
      updatedItem = item;
    }

    return res.json({ success: true, item: updatedItem });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/qr/:id
 * Delete a specific QR item
 */
router.delete('/:id', authMiddleware(false), async (req, res) => {
  try {
    const { id } = req.params;

    if (isDbConnected()) {
      await QrCode.findByIdAndDelete(id);
    } else {
      memoryQrCodes.delete(id);
    }

    return res.json({ success: true, message: 'QR item deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/qr/clear
 * Clear all history (by source)
 */
router.delete('/actions/clear', authMiddleware(false), async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { source } = req.query;

    if (isDbConnected()) {
      const filter = {};
      if (userId) filter.userId = userId;
      else filter.userId = null;
      if (source) filter.source = source;
      // Don't delete explicitly saved items when clearing history
      filter.isSaved = false;

      await QrCode.deleteMany(filter);
    } else {
      for (const [id, item] of memoryQrCodes.entries()) {
        if (item.userId === userId && (!source || item.source === source) && !item.isSaved) {
          memoryQrCodes.delete(id);
        }
      }
    }

    return res.json({ success: true, message: 'History cleared successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/qr/dynamic/:shortCode
 * Server-Side Expiry Enforcement & Dynamic Redirect Handler
 */
router.get('/dynamic/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;

    let item = null;
    if (isDbConnected()) {
      item = await QrCode.findOne({ shortCode });
    } else {
      item = Array.from(memoryQrCodes.values()).find((q) => q.shortCode === shortCode);
    }

    if (!item) {
      return res.status(404).json({ success: false, error: 'QR code not found or has been removed.' });
    }

    // SERVER-SIDE EXPIRATION CHECK
    const isExpired = item.expiryDate && new Date() > new Date(item.expiryDate);

    if (isExpired) {
      return res.status(410).json({
        success: false,
        expired: true,
        title: item.title,
        expiryDate: item.expiryDate,
        error: 'This QR code has expired and is no longer accessible.',
      });
    }

    // Record scan metrics
    if (isDbConnected()) {
      item.scanCount = (item.scanCount || 0) + 1;
      item.lastScannedAt = new Date();
      await item.save();
    } else {
      item.scanCount = (item.scanCount || 0) + 1;
      item.lastScannedAt = new Date();
    }

    return res.json({
      success: true,
      expired: false,
      item: {
        title: item.title,
        type: item.type,
        payload: item.payload,
        isPasswordProtected: item.isPasswordProtected,
        expiryDate: item.expiryDate,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/qr/ai-analyze
 * AI-Readable Content & Smart Summarizer
 */
router.post('/ai-analyze', async (req, res) => {
  try {
    const { content, type } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required.' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey && geminiKey.trim() !== '') {
      // Call Google Gemini API if configured
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are an AI assistant in QrNova analyzing QR code content.
Analyze the following decoded QR content safely and provide a concise, readable summary:
1. Detected format/type.
2. Structured summary of key fields (e.g. credentials, coordinates, person details, action items).
3. Plain-language explanation for ordinary users.
4. Security/safety assessment (warn if URL or dangerous scheme).

QR Raw Payload:
"""${content.substring(0, 3000)}"""`,
                    },
                  ],
                },
              ],
            }),
          }
        );
        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiText) {
          return res.json({
            success: true,
            provider: 'Gemini AI',
            analysis: aiText,
            disclaimer: 'AI-Generated Explanation — Not original QR payload.',
          });
        }
      } catch (err) {
        console.warn('Gemini API call failed, using heuristic analyzer:', err.message);
      }
    }

    // Built-in intelligent heuristic engine fallback
    let analysis = '';
    const trimmed = content.trim();

    if (trimmed.startsWith('WIFI:')) {
      const ssid = trimmed.match(/S:([^;]+);/)?.[1] || 'Unknown Network';
      const enc = trimmed.match(/T:([^;]+);/)?.[1] || 'None';
      const hidden = trimmed.includes('H:true');
      analysis = `📶 **Wi-Fi Configuration**\n- **Network Name (SSID):** \`${ssid}\`\n- **Security:** ${enc}\n- **Hidden:** ${hidden ? 'Yes' : 'No'}\n- **Guidance:** Allows devices to automatically connect to this local wireless network without manual typing.`;
    } else if (trimmed.startsWith('BEGIN:VCARD')) {
      const fn = trimmed.match(/FN:([^\r\n]+)/)?.[1] || 'Unknown';
      const tel = trimmed.match(/TEL.*:([^\r\n]+)/)?.[1] || 'Not specified';
      const email = trimmed.match(/EMAIL.*:([^\r\n]+)/)?.[1] || 'Not specified';
      const org = trimmed.match(/ORG:([^\r\n]+)/)?.[1] || 'Not specified';
      analysis = `👤 **Digital Contact Card (vCard)**\n- **Name:** ${fn}\n- **Organization:** ${org}\n- **Phone:** ${tel}\n- **Email:** ${email}\n- **Guidance:** Can be saved directly to your phone's address book.`;
    } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const urlObj = new URL(trimmed);
      const isHttps = urlObj.protocol === 'https:';
      analysis = `🔗 **Web Destination**\n- **Domain:** \`${urlObj.hostname}\`\n- **Protocol:** ${urlObj.protocol.toUpperCase()} ${isHttps ? '🔒 (Encrypted)' : '⚠️ (Unencrypted HTTP)'}\n- **Path:** \`${urlObj.pathname}\`\n- **Safety Check:** ${isHttps ? 'Valid HTTPS connection.' : 'Warning: Unencrypted connection. Avoid entering sensitive passwords.'}`;
    } else if (trimmed.startsWith('geo:')) {
      const coords = trimmed.replace('geo:', '').split('?')[0];
      analysis = `📍 **Geographic Location**\n- **Coordinates:** \`${coords}\`\n- **Guidance:** Opens your navigation application (Google Maps, Apple Maps, OpenStreetMap) at this exact pin.`;
    } else if (trimmed.startsWith('QREncrypted:v1:')) {
      analysis = `🔒 **Encrypted Protected Payload**\n- **Standard:** AES-256-GCM authenticated encryption.\n- **Status:** Requires password decryption key to read plaintext content.\n- **Guidance:** Enter the password created by the author to unlock.`;
    } else {
      const words = trimmed.split(/\s+/).length;
      analysis = `📝 **Text Content**\n- **Length:** ${trimmed.length} characters (${words} words)\n- **Overview:** Plain text payload.\n- **Preview:** "${trimmed.substring(0, 140)}${trimmed.length > 140 ? '...' : ''}"`;
    }

    return res.json({
      success: true,
      provider: 'QrNova Smart Heuristics',
      analysis,
      disclaimer: 'AI-Generated Explanation — Not original QR payload.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
