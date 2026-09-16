const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
  },
  name: {
    type: String,
    trim: true,
    default: '',
  },
  preferences: {
    theme: { type: String, default: 'dark', enum: ['dark', 'light', 'high-contrast'] },
    a11yLargeText: { type: Boolean, default: false },
    a11yHighContrast: { type: Boolean, default: false },
    soundEnabled: { type: Boolean, default: true },
    defaultEcc: { type: String, default: 'M', enum: ['L', 'M', 'Q', 'H'] },
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);
