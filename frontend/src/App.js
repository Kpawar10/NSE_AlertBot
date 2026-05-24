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

  const [phone, setPhone] = useState(() => localStorage.getItem("nse_phone") || "");
  const [form, setForm]   = useState({ symbol: "RELIANCE", type: "above", value: "", channel: "whatsapp" });

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
    } catch {
      setConnected(false);
    }
  }, [phone]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const iv = setInterval(loadAll, 30000);
    return () => clearInterval(iv);
  }, [loadAll]);
  useEffect(() => { if (phone) localStorage.setItem("nse_phone", phone); }, [phone]);

  const handleAddAlert = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      addToast("⚠️", "Enter mobile number with country code (e.g. +91XXXXXXXXXX)", "warn"); return;
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
      const waOk  = res.results?.whatsapp?.mock === false;
      const smsOk = res.results?.sms?.mock === false;
      if (form.channel === "whatsapp" && res.results?.whatsapp?.mock)
        addToast("⚠️", "WhatsApp in mock mode — set CALLMEBOT_API_KEY in backend .env", "warn");
      else if (form.channel === "sms" && res.results?.sms?.mock)
        addToast("⚠️", "SMS in mock mode — set SMS_GATEWAY_URL in backend .env", "warn");
      else
        addToast("📲", `Test sent! Check your ${form.channel === "both" ? "WhatsApp & SMS" : form.channel}`, "success");
    } catch (e) { addToast("❌", e.message, "warn"); }
  };

  const filtered    = stocks.filter((s) =>
    s.symbol.includes(search.toUpperCase()) || s.name?.toLowerCase().includes(search.toLowerCase())
  );
  const activeCount = alerts.filter((a) => !a.fired).length;
  const currentStock = stocks.find((s) => s.symbol === form.symbol);

  return (
    <div className="app">
      {stocks.length > 0 && <Ticker stocks={stocks} />}

      {/* HEADER */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">📈</div>
          <div>
            <div className="logo-title">NSE AlertBot</div>
            <div className="logo-sub">Free WhatsApp &amp; SMS Alerts</div>
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

      {/* TABS */}
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
        {tab === "dashboard" && (
          <>
            <div className="stat-row">
              <div className="stat-box"><div className="sl">Active Alerts</div><div className="sv blue">{activeCount}</div></div>
              <div className="stat-box"><div className="sl">Triggered</div><div className="sv green">{triggered.length}</div></div>
              <div className="stat-box"><div className="sl">Live Stocks</div><div className="sv">{stocks.length}</div></div>
              <div className="stat-box">
                <div className="sl">Services</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <span className={`svc-tag ${health?.whatsappConfigured ? "ok" : "warn"}`}>
                    💬 {health?.whatsappConfigured ? "WA Ready" : "WA Mock"}
                  </span>
                  <span className={`svc-tag ${health?.smsConfigured ? "ok" : "warn"}`}>
                    📱 {health?.smsConfigured ? "SMS Ready" : "SMS Mock"}
                  </span>
                </div>
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
                  <div className="empty">⚠️ Cannot reach backend. Run: <code>cd backend && npm start</code></div>
                ) : (
                  <div className="table-wrap">
                    <table className="stock-table">
                      <thead>
                        <tr><th>Symbol</th><th>Company</th><th>Price</th><th>Change</th><th>High</th><th>Low</th></tr>
                      </thead>
                      <tbody>
                        {filtered.map((s) => (
                          <tr key={s.symbol} className="stock-row" onClick={() => setForm((f) => ({ ...f, symbol: s.symbol }))}>
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
                        style={form.type === t.id ? { borderColor: t.color, color: t.color, background: t.color + "18" } : {}}
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
                  <label className="fl">Send Via</label>
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
                {!phone && <p className="warn-text">⚠️ Enter mobile number at top to receive alerts</p>}
                {(!health?.whatsappConfigured || !health?.smsConfigured) && (
                  <p className="warn-text">
                    ⚙️ {!health?.whatsappConfigured ? "WhatsApp" : "SMS"} not configured.{" "}
                    <button className="link-btn" onClick={() => setTab("setup")}>See Setup Guide →</button>
                  </p>
                )}
              </div>
            </div>
          </>
        )}

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
                    <div className="trig-msg">{t.whatsappMessage?.replace(/\*/g, "").replace(/_/g, "")}</div>
                    <div className="trig-meta">
                      <span>🕐 {new Date(t.firedAt).toLocaleString("en-IN")}</span>
                      <span className="ch-tag">
                        {t.channel === "whatsapp" ? "💬 WhatsApp" : t.channel === "sms" ? "📱 SMS" : "🔔 Both"}
                      </span>
                      {(t.results?.whatsapp?.mock || t.results?.sms?.mock) && (
                        <span className="mock-tag">⚠️ Mock (configure .env)</span>
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

            {/* Status panel */}
            <div className="card status-card">
              <div className="card-title">📡 Current Status</div>
              <div className="status-grid">
                {[
                  ["Backend",   connected ? "✅ Connected" : "❌ Offline",    connected ? "ok" : "err"],
                  ["WhatsApp",  health?.whatsappConfigured ? "✅ Ready" : "⚠️ Not configured", health?.whatsappConfigured ? "ok" : "warn"],
                  ["SMS",       health?.smsConfigured      ? "✅ Ready" : "⚠️ Not configured", health?.smsConfigured      ? "ok" : "warn"],
                  ["Uptime",    health ? Math.floor(health.uptime / 60) + " minutes" : "—", ""],
                ].map(([k, v, cls]) => (
                  <div key={k} className="stat-row-item">
                    <span className="sk">{k}</span>
                    <span className={`sv2 ${cls}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* WhatsApp setup */}
            <div className="card">
              <div className="card-title">💬 Step 1 — Free WhatsApp Setup (CallMeBot)</div>
              <div className="steps">
                <div className="step"><span className="sn">1</span><div>Open WhatsApp on your phone</div></div>
                <div className="step"><span className="sn">2</span><div>Save this number as a contact: <strong>+34 644 59 77 58</strong></div></div>
                <div className="step"><span className="sn">3</span>
                  <div>Send this exact message to that contact:
                    <pre className="code">I allow callmebot to send me messages</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">4</span><div>You receive an API key (e.g. <code>1234567</code>) back instantly</div></div>
                <div className="step"><span className="sn">5</span>
                  <div>Open <code>backend/.env</code> and set:
                    <pre className="code">CALLMEBOT_API_KEY=1234567</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">6</span><div>Restart backend → <code>npm start</code></div></div>
                <div className="step"><span className="sn">7</span><div>Click "Send Test Message" in Dashboard → receive WhatsApp ✅</div></div>
              </div>
            </div>

            {/* SMS setup */}
            <div className="card">
              <div className="card-title">📱 Step 2 — Free SMS Setup (Android Phone Gateway)</div>
              <div className="info-box">Uses your own Android phone + SIM card. Completely free forever.</div>
              <div className="steps">
                <div className="step"><span className="sn">1</span>
                  <div>On your Android phone, install <strong>"SMS Gateway for Android"</strong> from Play Store (by Igor Polishchuk)</div>
                </div>
                <div className="step"><span className="sn">2</span><div>Open the app → note the <strong>IP address</strong> shown (e.g. <code>192.168.1.5:8080</code>)</div></div>
                <div className="step"><span className="sn">3</span><div>In app Settings → set a username and password → enable <strong>"Start on Boot"</strong></div></div>
                <div className="step"><span className="sn">4</span><div>Keep the app running. Keep phone plugged in to charger.</div></div>
                <div className="step"><span className="sn">5</span>
                  <div>Open <code>backend/.env</code> and set:
                    <pre className="code">{`SMS_GATEWAY_URL=http://192.168.1.5:8080\nSMS_GATEWAY_USER=admin\nSMS_GATEWAY_PASS=yourpassword`}</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">6</span><div>Restart backend → <code>npm start</code></div></div>
                <div className="step"><span className="sn">7</span><div>Click "Send Test Message" → receive real SMS ✅</div></div>
              </div>
            </div>

            {/* GitHub setup */}
            <div className="card">
              <div className="card-title">🔒 Step 3 — Upload to GitHub (Keys Stay Hidden)</div>
              <div className="info-box">⚠️ Your .env file has secret keys. The .gitignore file already protects it — it will never be uploaded.</div>
              <div className="steps">
                <div className="step"><span className="sn">1</span>
                  <div>Go to <a href="https://github.com/new" target="_blank" rel="noreferrer">github.com/new</a> → create a new repository</div>
                </div>
                <div className="step"><span className="sn">2</span>
                  <div>In your project folder, run:
                    <pre className="code">{`git init\ngit add .\ngit status   # ← .env should NOT appear here\ngit commit -m "Initial commit"`}</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">3</span>
                  <div>Connect and push:
                    <pre className="code">{`git remote add origin https://github.com/YOUR_USERNAME/nse-alert-app.git\ngit branch -M main\ngit push -u origin main`}</pre>
                  </div>
                </div>
                <div className="step"><span className="sn">4</span>
                  <div>✅ Your code is on GitHub. Your secret keys are safe on your computer only.</div>
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
