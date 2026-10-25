# QrNova 🚀
> **Production QR Code Platform, Secure Vault, Dynamic Routing & Voice Intelligence**

QrNova is a modern, high-performance web platform built with Vanilla HTML5/CSS3/JavaScript, Node.js/Express, MongoDB Atlas, Brevo Transactional Email, and Web Crypto AES-256-GCM.

---

## ✨ Features

1. **⚡ Multi-Format QR Generator Studio**
   - 10 distinct QR formats: Website URL, Plain Text, Wi-Fi configuration, vCard Contact, Email (`mailto`), Phone (`tel`), SMS (`smsto`), Geo coordinates (`geo`), Social media, and Base64 file embeddings.
   - Real-time preview rendering with 4 error correction levels (`L`, `M`, `Q`, `H`).
   - 5 curated Color Hunt palettes (*Pastel Rose, Warm Peach, Coral Blush, Chiffon Cream, Warm Paper*) + custom HEX color pickers.
   - Center logo image overlay with automatic error correction elevation.
   - Export to high-resolution PNG (256px to 2048px 300 DPI) and scalable SVG.

2. **📷 Camera & Drag-and-Drop Scanner**
   - Live camera scanner with automatic rear/environment camera selection.
   - Drag-and-drop file dropzone with support for PNG, JPG, and WEBP.
   - Instant decoded payload inspection with security checks (warning on unencrypted HTTP / dangerous schemes).

3. **🔒 Client-Side AES-256-GCM Encrypted Vault**
   - End-to-end client-side encryption using the standard Web Crypto API with PBKDF2 key derivation (100,000 SHA-256 rounds).
   - Generates encrypted envelopes (`QREncrypted:v1:...`) that require the author's password to decrypt.
   - Built-in real-time password strength meter.

4. **⏳ Dynamic QR Links & Hard Server-Side Expiration**
   - Server-enforced expiration limits (5m, 15m, 30m, 1h, 6h, 12h, 24h, 7d, or custom timestamp).
   - Dynamic short links (`/d/:shortCode`) redirect to active content or return HTTP 410 Gone when expired.

5. **🎙️ Voice Intelligence (Speech-to-Text & Text-to-Speech)**
   - **Voice → QR**: Speech dictation using the Web Speech API with live continuous transcript accumulation.
   - **QR → Voice**: Humanized speech synthesis with playback controls (pause, resume, speed adjustment).

6. **🤖 AI-Readable Content & Smart Summarizer**
   - Structured parsing of Wi-Fi credentials, vCard contacts, web links, geographic locations, and encrypted envelopes.
   - Click-to-reveal password obfuscation for Wi-Fi QR cards.
   - Integrated with Google Gemini API with fallback to built-in intelligent heuristic engine.

7. **🔑 Dual Authentication System**
   - **Password Authentication**: Standard sign up and sign in with bcrypt password hashing and JWT sessions.
   - **Brevo Email OTP**: Fast passwordless login and registration via transactional email with 6-digit verification codes.
   - Resilient hybrid storage: seamless operation with MongoDB Atlas or automatic in-memory/local fallback when offline.

8. **♿ Accessibility & Aesthetics**
   - WCAG-compliant design with high-contrast warm obsidian and velvet light themes.
   - Synthetic Web Audio API feedback chimes (no external audio assets required).
   - Screen reader ARIA live regions and full keyboard navigation.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, Vanilla CSS3 (custom design system), Modern JavaScript (ES Modules).
- **Backend**: Node.js, Express.js.
- **Database**: MongoDB Atlas via Mongoose with hybrid local JSON resilience.
- **Authentication**: Dual Auth (bcryptjs + JWT + Brevo Transactional Email OTP).
- **Security**: Web Crypto API (AES-256-GCM + PBKDF2).
- **QR Engines**: `qrcode` / `qrcode-generator` (Canvas/SVG), `html5-qrcode` & `jsQR` (Scanning).
- **Voice**: Web Speech API (`SpeechRecognition` & `SpeechSynthesis`).

---

## 📦 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or later)
- MongoDB instance (MongoDB Atlas cluster or local MongoDB)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Vanshmavi18/QrNova.git
cd QrNova

# Install dependencies
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/qrnova
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
BREVO_API_KEY=your_brevo_api_key_here
BREVO_SENDER_EMAIL=your_verified_sender@gmail.com
BREVO_SENDER_NAME=QrNova Security
GEMINI_API_KEY=
```

> **Note:** If `BREVO_API_KEY` is unset or IP restricted, QrNova automatically enters dev test mode and returns the verification code directly in the response and UI notice for frictionless testing.

### 4. Running the Platform
```bash
# Start server in production mode
npm start

# Or run in development watch mode
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Running the Automated Test Suite
```bash
npm test
```
The test suite validates:
- Static frontend delivery
- Service health & status
- Password registration & login
- Brevo OTP generation & verification
- QR creation with expiration
- Dynamic link routing
- AI content analysis
- Database clean-up

---

## 📡 API Reference

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/status` | Server health, MongoDB, and Brevo status | No |
| `POST` | `/api/auth/register` | Register new user with Name, Email, Password | No |
| `POST` | `/api/auth/login` | Log in with Email and Password | No |
| `POST` | `/api/auth/send-otp` | Dispatch 6-digit OTP via Brevo Email API | No |
| `POST` | `/api/auth/verify-otp` | Verify 6-digit OTP and obtain JWT | No |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Yes (JWT) |
| `GET` | `/api/qr` | List QR codes (filtered by source, saved, favorite) | Optional |
| `POST` | `/api/qr` | Create and store a new QR code | Optional |
| `PUT` | `/api/qr/:id` | Update title, notes, favorite, or expiration | Optional |
| `DELETE` | `/api/qr/:id` | Delete a specific QR code | Optional |
| `DELETE` | `/api/qr/actions/clear`| Clear history archive | Optional |
| `GET` | `/api/qr/dynamic/:code` | Dynamic link resolver with server-side expiration | No |
| `POST` | `/api/qr/ai-analyze` | Analyze QR payload with AI / heuristics | No |
| `GET` | `/d/:shortCode` | Dynamic QR redirect to web viewer | No |

---

## 📄 License
This project is licensed under the MIT License.
