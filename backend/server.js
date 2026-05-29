/**
 * NSE Stock Alert Backend
 * ========================
 * WhatsApp : Meta WhatsApp Cloud API (FREE 1000 conversations/month)
 * SMS      : Android Phone Gateway   (FREE forever, uses your own SIM)
 * Prices   : Simulated realistic NSE movement
 */

require("dotenv").config();

const express        = require("express");
const cors           = require("cors");
const cron           = require("node-cron");
const { v4: uuidv4 } = require("uuid");
const axios          = require("axios");
const fs = require("fs-extra");
const path = require("path");

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ─── In-Memory Store ──────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "data.json");

let alerts = [];
let triggeredLog = [];

async function loadData() {
  try {
    const data = await fs.readJson(DATA_FILE);

    alerts = data.alerts || [];
    triggeredLog = data.triggeredLog || [];

    console.log("Data loaded");
  } catch {
    alerts = [];
    triggeredLog = [];

    await saveData();
  }
}

async function saveData() {
  await fs.writeJson(DATA_FILE, {
    alerts,
    triggeredLog
  });
}
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
  return "Rs." + Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function normalizePhone(phone) {
  return String(phone)
    .replace(/\s/g, "")
    .replace(/^\+/, "");
}

// ─── Price Simulation ─────────────────────────────────────────────────────────
async function simulatePrices() {
  try {
    const results = await Promise.all(
      NSE_STOCKS.map(async (s) => {
        try {
          const { data } = await axios.get(
            `https://query2.finance.yahoo.com/v8/finance/chart/${s.symbol}.NS`,
            {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
              },
              timeout: 10000,
            }
          );
          const meta      = data?.chart?.result?.[0]?.meta;
          if (!meta) return null;
          const price     = meta.regularMarketPrice;
          const prevClose = meta.chartPreviousClose || meta.previousClose || price;
          return { symbol: s.symbol, price, prevClose };
        } catch {
          return null;
        }
      })
    );

    let updated = 0;
    results.forEach((r) => {
      if (!r) return;
      const { symbol, price, prevClose } = r;
      stockPrices[symbol] = {
        ...stockPrices[symbol],
        price:     +price.toFixed(2),
        prevClose: +prevClose.toFixed(2),
        change:    +(price - prevClose).toFixed(2),
        changePct: +(((price - prevClose) / prevClose) * 100).toFixed(2),
        high:      Math.max(stockPrices[symbol].high, +price.toFixed(2)),
        low:       Math.min(stockPrices[symbol].low,  +price.toFixed(2)),
        updatedAt: new Date().toISOString(),
      };
      updated++;
    });

    lastPriceUpdate = new Date().toISOString();
    console.log(`[${new Date().toLocaleTimeString("en-IN")}] Real prices updated for ${updated}/${NSE_STOCKS.length} stocks`);
  } catch (err) {
    console.error("Price fetch failed:", err.message);
  }
}

// ─── META WHATSAPP CLOUD API ──────────────────────────────────────────────────
// Endpoint: https://graph.facebook.com/v19.0/PHONE_NUMBER_ID/messages
// Free tier: 1000 conversations per month from Meta
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

async function sendWhatsApp(toPhone, message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log(`[MOCK]\nTo: ${toPhone}\n${message}`);
    return { success: true, mock: true };
  }
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message
    });
    console.log(`Telegram sent to ${chatId}`);
    return { success: true };
  } catch (err) {
    console.error(`Telegram failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}
// ─── ANDROID SMS GATEWAY ──────────────────────────────────────────────────────
// Free forever — your Android phone sends SMS using your own SIM card
// App: "SMS Gateway for Android" by Igor Polishchuk (Play Store)

async function sendSMS(toPhone, message) {
  const gatewayUrl  = process.env.SMS_GATEWAY_URL;
  const gatewayUser = process.env.SMS_GATEWAY_USER || "admin";
  const gatewayPass = process.env.SMS_GATEWAY_PASS || "admin";

  if (!gatewayUrl || gatewayUrl === "http://YOUR_PHONE_IP:8080") {
    console.log(`\n[SMS MOCK - configure SMS_GATEWAY_URL in .env]\nTo: ${toPhone}\n${message}\n`);
    return { success: true, mock: true };
  }

  try {
    const { data } = await axios.post(
      `${gatewayUrl}/message`,
      { phone_number: toPhone, message: message.substring(0, 160) },
      {
        auth:    { username: gatewayUser, password: gatewayPass },
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }
    );
    console.log(`SMS sent to ${toPhone} via Android Gateway`);
    return { success: true, data };
  } catch (err) {
    console.error(`SMS failed to ${toPhone}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─── Message Builder ──────────────────────────────────────────────────────────
function buildMessages(alert, stock) {
  const ist = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const conditionMap = {
    above:       `Price crossed ABOVE ${formatINR(alert.value)}`,
    below:       `Price dropped BELOW ${formatINR(alert.value)}`,
    change_up:   `Gained more than +${alert.value}%`,
    change_down: `Fell more than -${Math.abs(alert.value)}%`,
  };
  const cond = conditionMap[alert.type] || "";

  // WhatsApp message (plain text, Meta API doesn't support markdown in free tier)
  const whatsapp =
    `🚨 NSE STOCK ALERT\n\n` +
    `Stock: ${stock.symbol} (${stock.name})\n` +
    `Alert: ${cond}\n\n` +
    `Current Price: ${formatINR(stock.price)}\n` +
    `Change: ${stock.changePct >= 0 ? "+" : ""}${stock.changePct}% ` +
    `(${formatINR(stock.change)})\n` +
    `High: ${formatINR(stock.high)} | Low: ${formatINR(stock.low)}\n\n` +
    `Time (IST): ${ist}\n` +
    `-- NSE AlertBot`;

  // SMS (max 160 chars)
  const sms =
    `NSE ALERT: ${stock.symbol} | ${cond} | ` +
    `Price: ${formatINR(stock.price)} | ` +
    `${stock.changePct >= 0 ? "+" : ""}${stock.changePct}%`;

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

  alerts = alerts.map((a) =>
    a.id === alert.id
      ? { ...a, fired: true, firedAt: new Date().toISOString() }
      : a
  );

  const entry = {
    id:              uuidv4(),
    alertId:         alert.id,
    symbol:          stock.symbol,
    name:            stock.name,
    price:           stock.price,
    changePct:       stock.changePct,
    whatsappMessage: waMsg,
    smsMessage:      smsMsg,
    channel:         alert.channel,
    phone: normalizePhone(alert.phone),
    results,
    firedAt:         new Date().toISOString(),
  };
  triggeredLog.unshift(entry);
  await saveData();
  console.log(`ALERT FIRED: ${alert.symbol} | ${alert.type} | target: ${alert.value}`);
  return entry;
}

// ─── Alert Engine ─────────────────────────────────────────────────────────────
async function checkAlerts() {
  const active = alerts.filter((a) => !a.fired);
  if (!active.length) return;

  await Promise.all(active.map(async (alert) => {
    const stock = stockPrices[alert.symbol];
    if (!stock) return;

    let shouldFire = false;
    if (alert.type === "above"       && stock.price     >=  alert.value)            shouldFire = true;
    if (alert.type === "below"       && stock.price     <=  alert.value)            shouldFire = true;
    if (alert.type === "change_up"   && stock.changePct >=  alert.value)            shouldFire = true;
    if (alert.type === "change_down" && stock.changePct <= -Math.abs(alert.value))  shouldFire = true;

    if (shouldFire) await fireAlert(alert, stock);
  }));
}

// ─── Cron: every 60 seconds ───────────────────────────────────────────────────
cron.schedule("* * * * *", async () => {
  await simulatePrices();
  await checkAlerts();
});
(async () => {
  await loadData();
  await simulatePrices();
  await checkAlerts();
})();
// ─── REST API ─────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({
  status:             "ok",
  uptime:             Math.floor(process.uptime()),
  lastPriceUpdate,
  activeAlerts:       alerts.filter((a) => !a.fired).length,
  totalAlerts:        alerts.length,
  triggeredCount:     triggeredLog.length,
  whatsappConfigured: !!(process.env.META_WHATSAPP_TOKEN     && process.env.META_WHATSAPP_TOKEN     !== "YOUR_META_TOKEN"),
  smsConfigured:      !!(process.env.SMS_GATEWAY_URL         && process.env.SMS_GATEWAY_URL         !== "http://YOUR_PHONE_IP:8080"),
  phoneNumberId:      process.env.META_PHONE_NUMBER_ID       || "not set",
  timestamp:          new Date().toISOString(),
}));

app.get("/api/stocks", (req, res) =>
  res.json({ stocks: Object.values(stockPrices), updatedAt: lastPriceUpdate })
);

app.get("/api/stocks/:symbol", (req, res) => {
  const s = stockPrices[req.params.symbol.toUpperCase()];
  return s ? res.json(s) : res.status(404).json({ error: "Stock not found" });
});

app.get("/api/alerts", (req, res) => {
  const list = req.query.phone
  ? alerts.filter(
      (a) => a.phone === normalizePhone(req.query.phone)
    )
  : alerts;
  res.json({ alerts: list });
});

app.post("/api/alerts", async (req, res) => {
  const { symbol, type, value, channel, phone } = req.body;

  if (!symbol || !type || value === undefined || !channel || !phone)
    return res.status(400).json({ error: "Required fields: symbol, type, value, channel, phone" });
  if (!stockPrices[symbol.toUpperCase()])
    return res.status(400).json({ error: `Unknown symbol: ${symbol}` });
  if (!["above","below","change_up","change_down"].includes(type))
    return res.status(400).json({ error: "type must be: above, below, change_up, change_down" });
  if (!["whatsapp","sms","both"].includes(channel))
    return res.status(400).json({ error: "channel must be: whatsapp, sms, both" });

  const alert = {
    id: uuidv4(), symbol: symbol.toUpperCase(), type,
    value: parseFloat(value), channel, phone: normalizePhone(phone),
    fired: false, createdAt: new Date().toISOString(), firedAt: null,
  };
  alerts.push(alert);
  await saveData();
  console.log(`Alert created: ${alert.symbol} | ${alert.type} | ${alert.value} -> ${phone}`);
  res.status(201).json({ alert, message: "Alert created successfully" });
});

app.delete("/api/alerts/:id", async (req, res) => {
  const before = alerts.length;
  alerts = alerts.filter((a) => a.id !== req.params.id);
  await saveData();
  if (alerts.length === before) return res.status(404).json({ error: "Alert not found" });
  res.json({ message: "Alert deleted" });
});

app.get("/api/triggered", (req, res) => {
  const list = req.query.phone
  ? triggeredLog.filter(
      (t) => t.phone === normalizePhone(req.query.phone)
    )
  : triggeredLog;
  res.json({ triggered: list });
});

app.post("/api/test-notification", async (req, res) => {
  const { phone, channel } = req.body;
  if (!phone || !channel)
    return res.status(400).json({ error: "phone and channel required" });

  const ist    = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const waMsg  = `✅ NSE AlertBot - Test Message\n\nYour WhatsApp alerts are working!\nYou will receive real NSE stock alerts on this number.\n\nTime: ${ist}`;
  const smsMsg = `NSE AlertBot Test: Your SMS alerts are working! Real NSE stock alerts will be sent here.`;

  const results = {};
  if (channel === "whatsapp" || channel === "both") results.whatsapp = await sendWhatsApp(phone, waMsg);
  if (channel === "sms"      || channel === "both") results.sms      = await sendSMS(phone, smsMsg);

  res.json({ success: true, results });
});

// Webhook verification for Meta WhatsApp (required by Meta)
app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("Meta webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook receiver for incoming WhatsApp messages (optional)
app.post("/webhook", (req, res) => {
  const body = req.body;
  if (body.object === "whatsapp_business_account") {
    body.entry?.forEach((entry) => {
      entry.changes?.forEach((change) => {
        const msg = change.value?.messages?.[0];
        if (msg) {
          console.log(`Incoming WhatsApp from ${msg.from}: ${msg.text?.body}`);
        }
      });
    });
  }
  res.sendStatus(200);
});

app.listen(PORT, () => {
  const waOk  = process.env.META_WHATSAPP_TOKEN  && process.env.META_WHATSAPP_TOKEN  !== "YOUR_META_TOKEN";
  const smsOk = process.env.SMS_GATEWAY_URL       && process.env.SMS_GATEWAY_URL      !== "http://YOUR_PHONE_IP:8080";
  console.log(`\nNSE Alert Backend  ->  http://localhost:${PORT}`);
  console.log(`Tracking ${NSE_STOCKS.length} NSE stocks | checks every 60 seconds`);
  console.log(`WhatsApp (Meta API): ${waOk  ? "Ready" : "Mock mode - set META keys in .env"}`);
  console.log(`SMS (Android GW):    ${smsOk ? "Ready" : "Mock mode - set SMS_GATEWAY_URL in .env"}\n`);
});
