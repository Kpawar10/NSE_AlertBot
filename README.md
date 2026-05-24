# 📈 NSE Stock Alert App

Real-time NSE stock alerts delivered FREE via **WhatsApp** (CallMeBot) and **SMS** (Android Phone Gateway).

```
nse-alert-app/
├── backend/           ← Node.js + Express + Cron + Alert Engine
│   ├── server.js      ← Main server
│   ├── .env.example   ← Copy this to .env and fill your keys
│   └── package.json
├── frontend/          ← React app
│   ├── src/
│   │   ├── App.js     ← Full dashboard UI
│   │   ├── App.css    ← All styles
│   │   ├── api.js     ← Backend API calls
│   │   └── index.js
│   └── package.json
├── .gitignore         ← Protects your .env secrets from GitHub
└── README.md
```

---

## 🚀 STEP 1 — Run the App Locally

### Backend
```bash
cd backend
npm install
cp .env.example .env
# Fill in .env with your keys (see steps below)
npm start
# Runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm start
# Opens http://localhost:3000
```

---

## 💬 STEP 2 — Set Up FREE WhatsApp Alerts (CallMeBot)

**Takes 2 minutes. Completely free forever.**

1. Open WhatsApp on your phone
2. Save this number as a contact: **+34 644 59 77 58**
3. Send this exact message to that contact:
   ```
   I allow callmebot to send me messages
   ```
4. You will receive an API key like `1234567` back instantly
5. Open `backend/.env` and set:
   ```
   CALLMEBOT_API_KEY=1234567
   ```
6. Restart backend → `npm start`
7. Click "Send Test Notification" in the app → you receive a WhatsApp message ✅

---

## 📱 STEP 3 — Set Up FREE SMS Alerts (Android Phone Gateway)

**Uses your own phone SIM — completely free forever.**

### What you need:
- Any Android phone (even an old one)
- Any Indian SIM card (Jio/Airtel/Vi)
- Both phone and computer on same WiFi

### Steps:

**On your Android phone:**
1. Open Play Store → search **"SMS Gateway for Android"** by Igor Polishchuk
2. Install and open the app
3. Note the **IP address** shown on screen (e.g. `http://192.168.1.5:8080`)
4. Tap the menu → **Settings**
5. Set a username (e.g. `admin`) and password (e.g. `mypassword123`)
6. Enable **"Start on Boot"** (so it always runs)
7. Keep the app running in background
8. Keep phone plugged in to charger

**On your computer:**
1. Open `backend/.env` and set:
   ```
   SMS_GATEWAY_URL=http://192.168.1.5:8080
   SMS_GATEWAY_USER=admin
   SMS_GATEWAY_PASS=mypassword123
   ```
2. Restart backend → `npm start`
3. Click "Send Test SMS" in the app → you receive a real SMS ✅

### For sending SMS outside your home network:
Your phone and server need to be on the same WiFi for local setup.
For remote access, enable **port forwarding** on your router:
- Forward external port 8080 → your phone's local IP:8080
- Use your public IP in `SMS_GATEWAY_URL`

---

## 🔒 STEP 4 — Upload to GitHub SAFELY

Your `.env` file contains secret API keys. **Never push it to GitHub.**
The `.gitignore` file already protects you, but follow these steps:

```bash
# Inside nse-alert-app/ folder:

# 1. Initialize git
git init

# 2. Check what will be committed — .env should NOT appear
git status
# You should see .env is NOT listed (it's ignored)

# 3. Add all safe files
git add .

# 4. Commit
git commit -m "Initial commit — NSE Alert App"

# 5. Create repo on github.com (click New Repository)
# Then connect and push:
git remote add origin https://github.com/YOUR_USERNAME/nse-alert-app.git
git branch -M main
git push -u origin main
```

**Your secret keys stay only on your computer in `.env`. GitHub only sees `.env.example` which has no real keys.**

### When deploying on another machine:
```bash
git clone https://github.com/YOUR_USERNAME/nse-alert-app.git
cd nse-alert-app/backend
cp .env.example .env
# Fill in your real keys in .env
npm install && npm start
```

---

## 🌐 STEP 5 — Deploy Online (Free)

### Backend → Railway.app (Free)
1. Go to [railway.app](https://railway.app) → Login with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `nse-alert-app` repo
4. Set **Root Directory** to `backend`
5. Go to **Variables** tab → add all keys from your `.env`:
   ```
   CALLMEBOT_API_KEY = your_key
   SMS_GATEWAY_URL   = your_url
   SMS_GATEWAY_USER  = admin
   SMS_GATEWAY_PASS  = your_pass
   FRONTEND_URL      = https://your-app.vercel.app
   ```
6. Deploy → Railway gives you a URL like `https://nse-alert.up.railway.app`

### Frontend → Vercel (Free)
1. Go to [vercel.com](https://vercel.com) → Login with GitHub
2. Click **New Project** → import your repo
3. Set **Root Directory** to `frontend`
4. Add environment variable:
   ```
   REACT_APP_API_URL = https://nse-alert.up.railway.app
   ```
5. Deploy → Vercel gives you a URL like `https://nse-alert-app.vercel.app`

---

## 📊 Alert Types

| Type | When it fires |
|------|--------------|
| Price Above | Stock price crosses above your target |
| Price Below | Stock price drops below your target |
| % Change Up | Stock gains more than X% today |
| % Change Down | Stock falls more than X% today |

---

## 🔑 All Environment Variables

| Variable | What it is | Required |
|----------|-----------|----------|
| `PORT` | Server port (default 5000) | No |
| `FRONTEND_URL` | Your frontend URL for CORS | Yes (production) |
| `CALLMEBOT_API_KEY` | Your CallMeBot API key | For WhatsApp |
| `SMS_GATEWAY_URL` | Android phone IP:port | For SMS |
| `SMS_GATEWAY_USER` | Android app username | For SMS |
| `SMS_GATEWAY_PASS` | Android app password | For SMS |

---

## 💰 Cost Summary

| Service | Cost |
|---------|------|
| WhatsApp alerts (CallMeBot) | ✅ FREE forever |
| SMS alerts (Android Gateway) | ✅ FREE forever (uses your SIM) |
| Backend hosting (Railway) | ✅ FREE tier |
| Frontend hosting (Vercel) | ✅ FREE tier |
| **Total** | **₹0 per month** |
