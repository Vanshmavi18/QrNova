const mongoose = require('mongoose');

const qrCodeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  shortCode: {
    type: String,
    unique: true,
    index: true,
    required: true,
  },
  title: {
    type: String,
    trim: true,
    default: 'Untitled QR',
  },
  notes: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    required: true,
    enum: [
      'text',
      'url',
      'wifi',
      'email',
      'phone',
      'sms',
      'vcard',
      'geo',
      'social',
      'file',
      'encrypted',
    ],
    default: 'text',
  },
  payload: {
    type: String,
    required: true,
  },
  styleConfig: {
    foreground: { type: String, default: '#000000' },
    background: { type: String, default: '#ffffff' },
    ecc: { type: String, default: 'M', enum: ['L', 'M', 'Q', 'H'] },
    size: { type: Number, default: 512 },
    preset: { type: String, default: 'classic' },
    hasLogo: { type: Boolean, default: false },
  },
  isPasswordProtected: {
    type: Boolean,
    default: false,
  },
  isFavorite: {
    type: Boolean,
    default: false,
    index: true,
  },
  isSaved: {
    type: Boolean,
    default: false,
    index: true,
  },
  source: {
    type: String,
    enum: ['generated', 'scanned'],
    default: 'generated',
    index: true,
  },
  expiryDate: {
    type: Date,
    default: null,
    index: true,
  },
  scanCount: {
    type: Number,
    default: 0,
  },
  lastScannedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

qrCodeSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('QrCode', qrCodeSchema);
