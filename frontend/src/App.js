import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import "./App.css";

const ALERT_TYPES = [
  { id: "above",       label: "Price Above ↑",   color: "#00e5a0" },
  { id: "below",       label: "Price Below ↓",   color: "#ff4d6d" },
  { id: "change_up",   label: "% Change Up ↑",   color: "#00cfff" },
  { id: "change_down", label: "% Change Down ↓", color: "#ff9a3c" },
];
const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "sms",      label: "SMS",      icon: "📱" },
  { id: "both",     label: "Both",     icon: "🔔" },
];

function formatINR(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Ticker({ stocks }) {
  const items = stocks.slice(0, 15);
  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {[...items, ...items].map((s, i) => (
          <span key={i} className={`ticker-item ${s.changePct >= 0 ? "up" : "down"}`}>
            <span className="t-sym">{s.symbol}</span>
            <span className="t-price">{formatINR(s.price)}</span>
            <span className="t-chg">{s.changePct >= 0 ? "▲" : "▼"}{Math.abs(s.changePct).toFixed(2)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.icon}</span><span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [stocks,    setStocks]    = useState([]);
  const [alerts,    setAlerts]    = useState([]);
  const [triggered, setTriggered] = useState([]);
  const [toasts,    setToasts]    = useState([]);
  const [health,    setHealth]    = useState(null);
  const [tab,       setTab]       = useState("dashboard");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [connected, setConnected] = useState(false);
  const [phone,     setPhone]     = useState(() => localStorage.getItem("nse_phone") || "");
  const [form,      setForm]      = useState({ symbol: "RELIANCE", type: "above", value: "", channel: "whatsapp" });
  const toastRef = useRef(0);

  const addToast = useCallback((icon, msg, type = "info") => {
    const id = ++toastRef.current;
    setToasts((p) => [...p, { id, icon, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4500);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [s, a, tr, h] = await Promise.all([
        api.getStocks(),
        api.getAlerts(phone || undefined),
        api.getTriggered(phone || undefined),
        api.getHealth(),
      ]);
      setStocks(s.stocks || []);
      setAlerts(a.alerts || []);
      setTriggered(tr.triggered || []);
      setHealth(h);
      setConnected(true);
    } catch { setConnected(false); }
  }, [phone]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { const iv = setInterval(loadAll, 30000); return () => clearInterval(iv); }, [loadAll]);
  useEffect(() => { if (phone) localStorage.setItem("nse_phone", phone); }, [phone]);

  const handleAddAlert = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      addToast("⚠️", "Enter mobile number with country code e.g. +91XXXXXXXXXX", "warn"); return;
    }
    if (!form.value || isNaN(form.value)) {
      addToast("⚠️", "Enter a valid price or % value", "warn"); return;
    }
    setLoading(true);
    try {
      const { alert } = await api.createAlert({ ...form, value: parseFloat(form.value), phone });
      setAlerts((p) => [...p, alert]);
      addToast("✅", `Alert set for ${form.symbol} via ${form.channel}`, "success");
      setForm((f) => ({ ...f, value: "" }));
    } catch (e) { addToast("❌", e.message, "warn"); }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteAlert(id);
      setAlerts((p) => p.filter((a) => a.id !== id));
      addToast("🗑️", "Alert removed", "info");
    } catch (e) { addToast("❌", e.message, "warn"); }
  };

  const handleTest = async () => {
    if (!phone) { addToast("⚠️", "Enter mobile number first", "warn"); return; }
    try {
      const res = await api.testNotification(phone, form.channel);
      const waMock  = res.results?.whatsapp?.mock;
      const smsMock = res.results?.sms?.mock;
      if ((form.channel === "whatsapp" || form.channel === "both") && waMock)
        addToast("⚠️", "WhatsApp in mock mode — complete Meta API setup in Setup Guide", "warn");
      else if ((form.channel === "sms" || form.channel === "both") && smsMock)
        addToast("⚠️", "SMS in mock mode — set SMS_GATEWAY_URL in backend .env", "warn");
      else
        addToast("📲", `Test sent! Check your ${form.channel === "both" ? "WhatsApp & SMS" : form.channel}`, "success");
    } catch (e) { addToast("❌", e.message, "warn"); }
  };

  const filtered    = stocks.filter((s) =>
    s.symbol.includes(search.toUpperCase()) || s.name?.toLowerCase().includes(search.toLowerCase())
  );
  const activeCount  = alerts.filter((a) => !a.fired).length;
  const currentStock = stocks.find((s) => s.symbol === form.symbol);

  return (
    <div className="app">
      {stocks.length > 0 && <Ticker stocks={stocks} />}

      {/* ── HEADER ──────────────────────────────────── */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">📈</div>
          <div>
            <div className="logo-title">NSE AlertBot</div>
            <div className="logo-sub">Meta WhatsApp + SMS Alerts</div>
          </div>
        </div>
        <div className="header-right">
          <span className={`status-dot ${connected ? "online" : "offline"}`}>
            {connected ? "● LIVE" : "● OFFLINE"}
          </span>
          <div className="phone-row">
            <span>📲</span>
            <input className="phone-input" placeholder="+91XXXXXXXXXX"
              value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={14} />
          </div>
        </div>
      </header>

      {/* ── TABS ────────────────────────────────────── */}
      <nav className="tabs">
        {[
          ["dashboard", "📊 Dashboard"],
          ["alerts",    `🔔 Alerts (${activeCount} active)`],
          ["triggered", `🚨 Triggered (${triggered.length})`],
          ["setup",     "⚙️ Setup Guide"],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main className="main">

        {/* ── DASHBOARD ─────────────────────────────── */}
        {tab === "dashboard" && (<>
          <div className="stat-row">
            <div className="stat-box"><div className="sl">Active Alerts</div><div className="sv blue">{activeCount}</div></div>
            <div className="stat-box"><div className="sl">Triggered</div><div className="sv green">{triggered.length}</div></div>
            <div className="stat-box"><div className="sl">Live Stocks</div><div className="sv">{stocks.length}</div></div>
            <div className="stat-box">
              <div className="sl">Services</div>
              <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
                <span className={`svc-tag ${health?.whatsappConfigured ? "ok" : "warn"}`}>
                  💬 {health?.whatsappConfigured ? "WA Ready" : "WA Mock"}
                </span>
                <span className={`svc-tag ${health?.smsConfigured ? "ok" : "warn"}`}>
                  📱 {health?.smsConfigured ? "SMS Ready" : "SMS Mock"}
                </span>
              </div>
              {(!health?.whatsappConfigured || !health?.smsConfigured) && (
                <button className="link-btn" style={{marginTop:6}} onClick={() => setTab("setup")}>
                  Complete setup →
                </button>
              )}
            </div>
          </div>

          <div className="two-col">
            {/* Stock table */}
            <div className="card">
              <div className="card-hdr">
                <div className="card-title">📊 NSE Live Prices</div>
                <span className="live-badge">● LIVE</span>
              </div>
              <input className="search-input" placeholder="Search symbol or company…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
              {!connected ? (
                <div className="empty">
                  ⚠️ Cannot reach backend.<br/>
                  Run: <code>cd backend &amp;&amp; npm start</code>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="stock-table">
                    <thead>
                      <tr><th>Symbol</th><th>Company</th><th>Price</th><th>Change</th><th>High</th><th>Low</th></tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.symbol} className={`stock-row ${form.symbol === s.symbol ? "selected" : ""}`}
                          onClick={() => setForm((f) => ({ ...f, symbol: s.symbol }))}>
                          <td><span className="sym-badge">{s.symbol}</span></td>
                          <td className="name-cell">{s.name}</td>
                          <td className="price-cell">{formatINR(s.price)}</td>
                          <td className={s.changePct >= 0 ? "chg-up" : "chg-down"}>
                            {s.changePct >= 0 ? "▲" : "▼"}{Math.abs(s.changePct).toFixed(2)}%
                          </td>
                          <td className="muted">{formatINR(s.high)}</td>
                          <td className="muted">{formatINR(s.low)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Alert form */}
            <div className="card" id="alert-form">
              <div className="card-title">➕ Create Alert</div>
              <div className="fg">
                <label className="fl">Stock Symbol</label>
                <select className="fi" value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}>
                  {stocks.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>)}
                </select>
                {currentStock && (
                  <div className="cur-price">
                    Now: <strong>{formatINR(currentStock.price)}</strong>
                    <span className={currentStock.changePct >= 0 ? "chg-up" : "chg-down"}>
                      {" "}{currentStock.changePct >= 0 ? "▲" : "▼"}{Math.abs(currentStock.changePct).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
              <div className="fg">
                <label className="fl">Alert Type</label>
                <div className="type-grid">
                  {ALERT_TYPES.map((t) => (
                    <button key={t.id}
                      className={`type-btn ${form.type === t.id ? "active" : ""}`}
                      style={form.type === t.id ? { borderColor:t.color, color:t.color, background:t.color+"18" } : {}}
                      onClick={() => setForm((f) => ({ ...f, type: t.id }))}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fg">
                <label className="fl">{form.type.includes("change") ? "% Threshold" : "Target Price (₹)"}</label>
                <input className="fi" type="number" min="0" step="0.01"
                  placeholder={form.type.includes("change") ? "e.g. 2.5" : "e.g. 2900"}
                  value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="fg">
                <label className="fl">Send Alert Via</label>
                <div className="ch-row">
                  {CHANNELS.map((c) => (
                    <button key={c.id} className={`ch-btn ${form.channel === c.id ? "active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, channel: c.id }))}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <button className="submit-btn" onClick={handleAddAlert} disabled={loading}>
                {loading ? "Setting…" : "🔔 Set Alert"}
              </button>
              <button className="test-btn" onClick={handleTest}>
                📲 Send Test Message
              </button>
              {!phone && <p className="warn-text">⚠️ Enter mobile number at the top first</p>}
            </div>
          </div>
        </>)}

        {/* ── ALERTS ────────────────────────────────── */}
        {tab === "alerts" && (
          <div className="card">
            <div className="card-hdr">
              <div className="card-title">🔔 My Alerts</div>
              <span className="badge">{alerts.length} total · {activeCount} active</span>
            </div>
            {alerts.length === 0 ? (
              <div className="empty">No alerts yet. Go to Dashboard to create one.</div>
            ) : (
              <div className="alert-list">
                {alerts.map((a) => {
                  const ti = ALERT_TYPES.find((t) => t.id === a.type);
                  return (
                    <div key={a.id} className={`alert-card ${a.fired ? "fired" : ""}`}>
                      <div className="ai">
                        <div className="a-sym">
                          {a.symbol}
                          {a.fired && <span className="fired-tag">✅ Triggered</span>}
                        </div>
                        <div className="a-cond" style={{ color: ti?.color }}>
                          {ti?.label}: {a.type.includes("change") ? a.value + "%" : formatINR(a.value)}
                        </div>
                        <div className="a-meta">
                          via {a.channel === "both" ? "WhatsApp & SMS" : a.channel} · {a.phone}
                          {" · "}{new Date(a.createdAt).toLocaleString("en-IN")}
                          {a.firedAt && <> · Fired: {new Date(a.firedAt).toLocaleString("en-IN")}</>}
                        </div>
                      </div>
                      <button className="del-btn" onClick={() => handleDelete(a.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TRIGGERED ─────────────────────────────── */}
        {tab === "triggered" && (
          <div className="card">
            <div className="card-hdr">
              <div className="card-title">🚨 Triggered Alerts</div>
              <span className="badge green">{triggered.length} sent</span>
            </div>
            {triggered.length === 0 ? (
              <div className="empty">No alerts triggered yet. Set alerts and watch this space!</div>
            ) : (
              <div className="trig-list">
                {triggered.map((t) => (
                  <div key={t.id} className="trig-card">
                    <div className="trig-top">
                      <span className="trig-sym">{t.symbol}</span>
                      <span className="trig-price">{formatINR(t.price)}</span>
                      <span className={t.changePct >= 0 ? "chg-up" : "chg-down"}>
                        {t.changePct >= 0 ? "▲" : "▼"}{Math.abs(t.changePct).toFixed(2)}%
                      </span>
                    </div>
                    <div className="trig-msg">{t.whatsappMessage}</div>
                    <div className="trig-meta">
                      <span>🕐 {new Date(t.firedAt).toLocaleString("en-IN")}</span>
                      <span className="ch-tag">
                        {t.channel === "whatsapp" ? "💬 WhatsApp" : t.channel === "sms" ? "📱 SMS" : "🔔 Both"}
                      </span>
                      {(t.results?.whatsapp?.mock || t.results?.sms?.mock) && (
                        <span className="mock-tag">⚠️ Mock mode — configure .env</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SETUP GUIDE ───────────────────────────── */}
        {tab === "setup" && (
          <div className="setup-wrap">

            {/* Status */}
            <div className="card">
              <div className="card-title">📡 Current Status</div>
              <div className="status-grid">
                {[
                  ["Backend",   connected ? "✅ Connected" : "❌ Offline",                   connected ? "ok":"err"],
                  ["WhatsApp",  health?.whatsappConfigured ? "✅ Ready" : "⚠️ Not configured", health?.whatsappConfigured ? "ok":"warn"],
                  ["SMS",       health?.smsConfigured      ? "✅ Ready" : "⚠️ Not configured", health?.smsConfigured      ? "ok":"warn"],
                  ["Uptime",    health ? Math.floor(health.uptime/60)+" min" : "—",           ""],
                ].map(([k,v,cls]) => (
                  <div key={k} className="stat-row-item">
                    <span className="sk">{k}</span>
                    <span className={`sv2 ${cls}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* META WHATSAPP SETUP */}
            <div className="card">
              <div className="card-title">💬 Setup — Meta WhatsApp Cloud API (Free 1000 msgs/month)</div>
              <div className="info-box">
                This is the official WhatsApp API by Meta (Facebook). Free tier gives you 1000 conversations per month — enough for personal use and testing.
              </div>

              <div className="phase-title">PHASE 1 — Create Meta Developer Account</div>
              <div className="steps">
                <div className="step"><span className="sn">1</span>
                  <div>Go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer">developers.facebook.com</a> and log in with your Facebook account</div>
                </div>
                <div className="step"><span className="sn">2</span>
                  <div>Click <strong>My Apps</strong> → <strong>Create App</strong></div>
                </div>
                <div className="step"><span className="sn">3</span>
                  <div>Choose <strong>"Business"</strong> as app type → Click Next</div>
                </div>
                <div className="step"><span className="sn">4</span>
                  <div>Enter App name: <code>NSE Alert Bot</code> → Click <strong>Create App</strong></div>
                </div>
              </div>

              <div className="phase-title">PHASE 2 — Add WhatsApp to Your App</div>
              <div className="steps">
                <div className="step"><span className="sn">5</span>
                  <div>In your app dashboard, scroll down to find <strong>WhatsApp</strong> → Click <strong>Set Up</strong></div>
                </div>
                <div className="step"><span className="sn">6</span>
                  <div>It asks to connect a Meta Business Account → Click <strong>Create new account</strong> if you don't have one → Fill basic details → Submit</div>
                </div>
                <div className="step"><span className="sn">7</span>
                  <div>You will land on the <strong>WhatsApp Getting Started</strong> page — keep this open</div>
                </div>
              </div>

              <div className="phase-title">PHASE 3 — Get Your API Keys</div>
              <div className="steps">
                <div className="step"><span className="sn">8</span>
                  <div>On the Getting Started page, you will see:
                    <ul className="bullet-list">
                      <li><strong>Temporary access token</strong> (valid 24 hours) — copy this</li>
                      <li><strong>Phone number ID</strong> — copy this</li>
                      <li><strong>WhatsApp Business Account ID</strong> — copy this</li>
                    </ul>
                  </div>
                </div>
                <div className="step"><span className="sn">9</span>
                  <div>Open <code>backend/.env</code> and paste:
                    <pre className="code">{`META_WHATSAPP_TOKEN=paste_token_here\nMETA_PHONE_NUMBER_ID=paste_phone_number_id_here\nMETA_WHATSAPP_BUSINESS_ACCOUNT_ID=paste_waba_id_here`}</pre>
                  </div>
                </div>
              </div>

              <div className="phase-title">PHASE 4 — Add Your Mobile Number as Test Recipient</div>
              <div className="steps">
                <div className="step"><span className="sn">10</span>
                  <div>On the Getting Started page, find <strong>"To"</strong> field → Click <strong>Manage phone number list</strong></div>
                </div>
                <div className="step"><span className="sn">11</span>
                  <div>Click <strong>Add phone number</strong> → Enter your Indian mobile number with country code: <code>+91XXXXXXXXXX</code></div>
                </div>
                <div className="step"><span className="sn">12</span>
                  <div>You receive a <strong>WhatsApp OTP</strong> → Enter it to verify your number</div>
                </div>
                <div className="step"><span className="sn">13</span>
                  <div>Your number is now approved to receive messages from your app ✅</div>
                </div>
              </div>

              <div className="phase-title">PHASE 5 — Test It</div>
              <div className="steps">
                <div className="step"><span className="sn">14</span>
                  <div>Restart backend:
                    <pre className="code">npm start</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">15</span>
                  <div>Enter your number in the field at top of this app → Click <strong>Send Test Message</strong> → Receive WhatsApp ✅</div>
                </div>
              </div>

              <div className="phase-title">PHASE 6 — Get Permanent Token (stops expiring every 24hrs)</div>
              <div className="steps">
                <div className="step"><span className="sn">16</span>
                  <div>Go to your app → <strong>Settings → Basic</strong> → scroll down → click <strong>Generate permanent token</strong> (or go to System Users in Business Manager)</div>
                </div>
                <div className="step"><span className="sn">17</span>
                  <div>In Business Manager → <strong>System Users</strong> → Add System User → Generate Token → Select your app → Give <strong>whatsapp_business_messaging</strong> permission → Generate → Copy token</div>
                </div>
                <div className="step"><span className="sn">18</span>
                  <div>Replace the temporary token in <code>.env</code> with this permanent token — it never expires ✅</div>
                </div>
              </div>
            </div>

            {/* SMS SETUP */}
            <div className="card">
              <div className="card-title">📱 Setup — Android SMS Gateway (Free Forever)</div>
              <div className="info-box">Uses your own Android phone + SIM card to send SMS. 100% free, no limits, no expiry.</div>
              <div className="steps">
                <div className="step"><span className="sn">1</span>
                  <div>On any Android phone, open Play Store → search <strong>"SMS Gateway for Android"</strong> by Igor Polishchuk → Install</div>
                </div>
                <div className="step"><span className="sn">2</span>
                  <div>Open the app → note the <strong>IP address</strong> shown on screen (e.g. <code>192.168.1.5:8080</code>). Your computer and phone must be on the same WiFi.</div>
                </div>
                <div className="step"><span className="sn">3</span>
                  <div>In app → tap menu → <strong>Settings</strong> → set Username and Password → enable <strong>"Start on Boot"</strong></div>
                </div>
                <div className="step"><span className="sn">4</span>
                  <div>Keep the app open and keep the phone plugged in to charger</div>
                </div>
                <div className="step"><span className="sn">5</span>
                  <div>Open <code>backend/.env</code> and set:
                    <pre className="code">{`SMS_GATEWAY_URL=http://192.168.1.5:8080\nSMS_GATEWAY_USER=admin\nSMS_GATEWAY_PASS=yourpassword`}</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">6</span>
                  <div>Restart backend → click <strong>Send Test Message</strong> → receive real SMS ✅</div>
                </div>
              </div>
            </div>

            {/* GITHUB */}
            <div className="card">
              <div className="card-title">🔒 Upload to GitHub (API Keys Stay Hidden)</div>
              <div className="info-box">
                ⚠️ Your <code>.env</code> file contains secret API keys. The <code>.gitignore</code> file already blocks it from being uploaded. Only <code>.env.example</code> (with no real keys) goes to GitHub.
              </div>
              <div className="steps">
                <div className="step"><span className="sn">1</span>
                  <div>Go to <a href="https://github.com/new" target="_blank" rel="noreferrer">github.com/new</a> → create a new repository named <code>nse-alert-app</code></div>
                </div>
                <div className="step"><span className="sn">2</span>
                  <div>In your project folder, open terminal and run:
                    <pre className="code">{`git init\ngit add .\ngit status   # .env must NOT appear in this list\ngit commit -m "Initial commit — NSE Alert App"`}</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">3</span>
                  <div>Connect to GitHub and push:
                    <pre className="code">{`git remote add origin https://github.com/YOUR_USERNAME/nse-alert-app.git\ngit branch -M main\ngit push -u origin main`}</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">4</span>
                  <div>✅ Code is on GitHub. Keys are safe on your computer only in <code>.env</code>.</div>
                </div>
                <div className="step"><span className="sn">5</span>
                  <div>When deploying to Railway or Render, add each variable from <code>.env</code> manually in their dashboard under <strong>Environment Variables</strong>. Never upload the file itself.</div>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>
      <Toast toasts={toasts} />
    </div>
  );
}
