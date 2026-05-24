/**
 * NSE Stock Alert Backend
 * ========================
 * WhatsApp : CallMeBot        (FREE forever, no account needed)
 * SMS      : Android Gateway  (FREE forever, uses your own SIM)
 * Prices   : Simulated        (realistic NSE price movement)
 */

require("dotenv").config();

const express        = require("express");
const cors           = require("cors");
const cron           = require("node-cron");
const { v4: uuidv4 } = require("uuid");
const axios          = require("axios");

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// ─── In-Memory Store ──────────────────────────────────────────────────────────
let alerts          = [];
let triggeredLog    = [];
let stockPrices     = {};
let lastPriceUpdate = null;

// ─── NSE Stocks ───────────────────────────────────────────────────────────────
const NSE_STOCKS = [
  { symbol: "RELIANCE",   name: "Reliance Industries",       basePrice: 2847.35 },
  { symbol: "TCS",        name: "Tata Consultancy Services", basePrice: 3912.10 },
  { symbol: "INFY",       name: "Infosys",                   basePrice: 1743.55 },
  { symbol: "HDFCBANK",   name: "HDFC Bank",                 basePrice: 1628.90 },
  { symbol: "WIPRO",      name: "Wipro",                     basePrice: 498.20  },
  { symbol: "ICICIBANK",  name: "ICICI Bank",                basePrice: 1284.70 },
  { symbol: "BAJFINANCE", name: "Bajaj Finance",             basePrice: 7134.45 },
  { symbol: "SBIN",       name: "State Bank of India",       basePrice: 812.30  },
  { symbol: "ADANIENT",   name: "Adani Enterprises",         basePrice: 2541.00 },
  { symbol: "TATAMOTORS", name: "Tata Motors",               basePrice: 976.55  },
  { symbol: "MARUTI",     name: "Maruti Suzuki",             basePrice: 12340.00},
  { symbol: "SUNPHARMA",  name: "Sun Pharmaceutical",        basePrice: 1623.85 },
  { symbol: "LTIM",       name: "LTIMindtree",               basePrice: 5210.00 },
  { symbol: "HCLTECH",    name: "HCL Technologies",          basePrice: 1489.30 },
  { symbol: "AXISBANK",   name: "Axis Bank",                 basePrice: 1058.45 },
  { symbol: "KOTAKBANK",  name: "Kotak Mahindra Bank",       basePrice: 1812.60 },
  { symbol: "ITC",        name: "ITC Ltd",                   basePrice: 461.90  },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever",        basePrice: 2341.75 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel",             basePrice: 1621.50 },
  { symbol: "POWERGRID",  name: "Power Grid Corporation",    basePrice: 322.40  },
];

// Initialize stock prices
NSE_STOCKS.forEach((s) => {
  stockPrices[s.symbol] = {
    symbol: s.symbol, name: s.name,
    price: s.basePrice, prevClose: s.basePrice,
    change: 0, changePct: 0,
    high: s.basePrice, low: s.basePrice,
    volume: Math.floor(Math.random() * 5000000) + 500000,
    updatedAt: new Date().toISOString(),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(n) {
  return "₹" + Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

// ─── Price Simulation (realistic NSE movement) ────────────────────────────────
function simulatePrices() {
  NSE_STOCKS.forEach((s) => {
    const c     = stockPrices[s.symbol];
    const drift = (Math.random() - 0.492) * 0.8;
    const newPrice = Math.max(1, +(c.price * (1 + drift / 100)).toFixed(2));
    stockPrices[s.symbol] = {
      ...c,
      price:     newPrice,
      change:    +(newPrice - c.prevClose).toFixed(2),
      changePct: +((newPrice - c.prevClose) / c.prevClose * 100).toFixed(2),
      high:      Math.max(c.high, newPrice),
      low:       Math.min(c.low,  newPrice),
      volume:    c.volume + Math.floor(Math.random() * 10000),
      updatedAt: new Date().toISOString(),
    };
  });
  lastPriceUpdate = new Date().toISOString();
  console.log(`[${new Date().toLocaleTimeString("en-IN")}] 📊 Prices updated`);
}

// ─── 💬 CALLMEBOT — Free WhatsApp (forever) ───────────────────────────────────
// How it works: calls CallMeBot's free API which forwards message to your WhatsApp
async function sendWhatsApp(phone, message) {
  const apiKey = process.env.CALLMEBOT_API_KEY;

  if (!apiKey || apiKey === "YOUR_CALLMEBOT_KEY") {
    console.log(`\n[WhatsApp MOCK - not configured]\nTo: ${phone}\n${message}\n`);
    return { success: true, mock: true };
  }

  try {
    // CallMeBot needs phone without + sign
    const cleanPhone = phone.replace(/^\+/, "");
    const encoded    = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encoded}&apikey=${apiKey}`;

    const { data } = await axios.get(url, { timeout: 15000 });
    console.log(`✅ WhatsApp sent to ${phone}`);
    return { success: true, response: String(data).substring(0, 100) };
  } catch (err) {
    console.error(`❌ WhatsApp error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── 📱 ANDROID SMS GATEWAY — Free SMS (uses your own SIM) ───────────────────
// How it works: Android app on your phone exposes a local API
// Your server calls that API → app sends SMS using your SIM for free
async function sendSMS(phone, message) {
  const gatewayUrl  = process.env.SMS_GATEWAY_URL;
  const gatewayUser = process.env.SMS_GATEWAY_USER || "admin";
  const gatewayPass = process.env.SMS_GATEWAY_PASS || "admin";

  if (!gatewayUrl || gatewayUrl === "http://YOUR_PHONE_IP:8080") {
    console.log(`\n[SMS MOCK - not configured]\nTo: ${phone}\n${message}\n`);
    return { success: true, mock: true };
  }

  try {
    // Android SMS Gateway API format
    const { data } = await axios.post(
      `${gatewayUrl}/message`,
      {
        phone_number: phone,
        message:      message.substring(0, 160), // SMS limit
      },
      {
        auth:    { username: gatewayUser, password: gatewayPass },
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }
    );
    console.log(`✅ SMS sent to ${phone} via Android Gateway`);
    return { success: true, data };
  } catch (err) {
    console.error(`❌ SMS Gateway error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Message Builder ──────────────────────────────────────────────────────────
function buildMessages(alert, stock) {
  const conditionText = {
    above:       `📈 Price crossed ABOVE ${formatINR(alert.value)}`,
    below:       `📉 Price dropped BELOW ${formatINR(alert.value)}`,
    change_up:   `🚀 Gained more than +${alert.value}%`,
    change_down: `💥 Fell more than -${Math.abs(alert.value)}%`,
  }[alert.type] || "";

  // WhatsApp message (supports emoji and formatting)
  const whatsapp =
    `🚨 *NSE STOCK ALERT*\n\n` +
    `*${stock.symbol}* — ${stock.name}\n` +
    `${conditionText}\n\n` +
    `💰 Current Price: *${formatINR(stock.price)}*\n` +
    `📊 Change: ${stock.changePct >= 0 ? "+" : ""}${stock.changePct}% ` +
    `(${formatINR(stock.change)})\n` +
    `📅 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n\n` +
    `_Sent by NSE AlertBot_`;

  // SMS message (plain text, max 160 chars)
  const sms =
    `NSE ALERT: ${stock.symbol} | ` +
    `${alert.type === "above" ? "Above" : alert.type === "below" ? "Below" : alert.type === "change_up" ? "Up" : "Down"} ` +
    `${alert.type.includes("change") ? alert.value + "%" : formatINR(alert.value)} | ` +
    `Now: ${formatINR(stock.price)} (${stock.changePct >= 0 ? "+" : ""}${stock.changePct}%)`;

  return { whatsapp, sms };
}

// ─── Fire Alert ───────────────────────────────────────────────────────────────
async function fireAlert(alert, stock) {
  const { whatsapp: waMsg, sms: smsMsg } = buildMessages(alert, stock);
  const results = {};

  if (alert.channel === "whatsapp" || alert.channel === "both") {
    results.whatsapp = await sendWhatsApp(alert.phone, waMsg);
  }
  if (alert.channel === "sms" || alert.channel === "both") {
    results.sms = await sendSMS(alert.phone, smsMsg);
  }

  // Mark as fired
  alerts = alerts.map((a) =>
    a.id === alert.id
      ? { ...a, fired: true, firedAt: new Date().toISOString() }
      : a
  );

  // Add to triggered history
  const entry = {
    id:        uuidv4(),
    alertId:   alert.id,
    symbol:    stock.symbol,
    name:      stock.name,
    price:     stock.price,
    changePct: stock.changePct,
    whatsappMessage: waMsg,
    smsMessage:      smsMsg,
    channel:   alert.channel,
    phone:     alert.phone,
    results,
    firedAt:   new Date().toISOString(),
  };
  triggeredLog.unshift(entry);

  console.log(`\n🔔 ALERT FIRED: ${alert.symbol} | ${alert.type} | target: ${alert.value}`);
  return entry;
}

// ─── Alert Engine (checks every 60 seconds) ───────────────────────────────────
async function checkAlerts() {
  const active = alerts.filter((a) => !a.fired);
  if (!active.length) return;

  await Promise.all(
    active.map(async (alert) => {
      const stock = stockPrices[alert.symbol];
      if (!stock) return;

      let shouldFire = false;
      if (alert.type === "above"       && stock.price    >=  alert.value)             shouldFire = true;
      if (alert.type === "below"       && stock.price    <=  alert.value)             shouldFire = true;
      if (alert.type === "change_up"   && stock.changePct >=  alert.value)            shouldFire = true;
      if (alert.type === "change_down" && stock.changePct <= -Math.abs(alert.value))  shouldFire = true;

      if (shouldFire) await fireAlert(alert, stock);
    })
  );
}

// ─── Cron: runs every 60 seconds ─────────────────────────────────────────────
cron.schedule("* * * * *", async () => {
  simulatePrices();
  await checkAlerts();
});

// Run once on startup
simulatePrices();
checkAlerts();

// ─── REST API ROUTES ──────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status:              "ok",
    uptime:              Math.floor(process.uptime()),
    lastPriceUpdate,
    activeAlerts:        alerts.filter((a) => !a.fired).length,
    totalAlerts:         alerts.length,
    triggeredCount:      triggeredLog.length,
    whatsappConfigured:  !!(process.env.CALLMEBOT_API_KEY && process.env.CALLMEBOT_API_KEY !== "YOUR_CALLMEBOT_KEY"),
    smsConfigured:       !!(process.env.SMS_GATEWAY_URL   && process.env.SMS_GATEWAY_URL   !== "http://YOUR_PHONE_IP:8080"),
    timestamp:           new Date().toISOString(),
  });
});

// All stock prices
app.get("/api/stocks", (req, res) => {
  res.json({ stocks: Object.values(stockPrices), updatedAt: lastPriceUpdate });
});

// Single stock
app.get("/api/stocks/:symbol", (req, res) => {
  const stock = stockPrices[req.params.symbol.toUpperCase()];
  if (!stock) return res.status(404).json({ error: "Stock not found" });
  res.json(stock);
});

// List alerts
app.get("/api/alerts", (req, res) => {
  const list = req.query.phone
    ? alerts.filter((a) => a.phone === req.query.phone)
    : alerts;
  res.json({ alerts: list });
});

// Create alert
app.post("/api/alerts", (req, res) => {
  const { symbol, type, value, channel, phone } = req.body;

  if (!symbol || !type || value === undefined || !channel || !phone)
    return res.status(400).json({ error: "Required: symbol, type, value, channel, phone" });
  if (!stockPrices[symbol.toUpperCase()])
    return res.status(400).json({ error: `Unknown symbol: ${symbol}` });
  if (!["above","below","change_up","change_down"].includes(type))
    return res.status(400).json({ error: "type must be: above, below, change_up, change_down" });
  if (!["whatsapp","sms","both"].includes(channel))
    return res.status(400).json({ error: "channel must be: whatsapp, sms, both" });

  const alert = {
    id:        uuidv4(),
    symbol:    symbol.toUpperCase(),
    type,
    value:     parseFloat(value),
    channel,
    phone,
    fired:     false,
    createdAt: new Date().toISOString(),
    firedAt:   null,
  };

  alerts.push(alert);
  console.log(`➕ Alert created: ${alert.symbol} | ${alert.type} | ${alert.value} → ${phone}`);
  res.status(201).json({ alert, message: "Alert created successfully" });
});

// Delete alert
app.delete("/api/alerts/:id", (req, res) => {
  const before = alerts.length;
  alerts = alerts.filter((a) => a.id !== req.params.id);
  if (alerts.length === before) return res.status(404).json({ error: "Alert not found" });
  res.json({ message: "Alert deleted" });
});

// Triggered history
app.get("/api/triggered", (req, res) => {
  const list = req.query.phone
    ? triggeredLog.filter((t) => t.phone === req.query.phone)
    : triggeredLog;
  res.json({ triggered: list });
});

// Send test notification
app.post("/api/test-notification", async (req, res) => {
  const { phone, channel } = req.body;
  if (!phone || !channel)
    return res.status(400).json({ error: "phone and channel required" });

  const time   = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const waMsg  = `✅ *NSE AlertBot — Test Message*\n\nYour WhatsApp alerts are working! 🎉\nYou will receive real NSE stock alerts on this number.\n\n_${time}_`;
  const smsMsg = `NSE AlertBot Test: Your SMS alerts are working! You will receive real NSE stock price alerts here.`;

  const results = {};
  if (channel === "whatsapp" || channel === "both") results.whatsapp = await sendWhatsApp(phone, waMsg);
  if (channel === "sms"      || channel === "both") results.sms      = await sendSMS(phone, smsMsg);

  res.json({ success: true, results });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const waOk  = process.env.CALLMEBOT_API_KEY && process.env.CALLMEBOT_API_KEY !== "YOUR_CALLMEBOT_KEY";
  const smsOk = process.env.SMS_GATEWAY_URL   && process.env.SMS_GATEWAY_URL   !== "http://YOUR_PHONE_IP:8080";
  console.log(`\n🚀 NSE Alert Backend  →  http://localhost:${PORT}`);
  console.log(`📊 Tracking ${NSE_STOCKS.length} NSE stocks  |  checks every 60 seconds`);
  console.log(`💬 WhatsApp (CallMeBot): ${waOk  ? "✅ Ready" : "⚠️  Mock mode — set CALLMEBOT_API_KEY in .env"}`);
  console.log(`📱 SMS (Android GW):     ${smsOk ? "✅ Ready" : "⚠️  Mock mode — set SMS_GATEWAY_URL in .env"}\n`);
});
