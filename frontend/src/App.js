import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./api";
import "./App.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALERT_TYPES = [
  { id: "above",       label: "Price Above ↑",    color: "#00e5a0" },
  { id: "below",       label: "Price Below ↓",    color: "#ff4d6d" },
  { id: "change_up",   label: "% Change Up ↑",    color: "#00cfff" },
  { id: "change_down", label: "% Change Down ↓",  color: "#ff9a3c" },
];
const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "sms",      label: "SMS",      icon: "📱" },
  { id: "both",     label: "Both",     icon: "🔔" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Ticker({ stocks }) {
  const items = stocks.slice(0, 14);
  return (
    <div className="ticker-wrap">
      <div className="ticker-track">
        {[...items, ...items].map((s, i) => (
          <span key={i} className={`ticker-item ${s.changePct >= 0 ? "up" : "down"}`}>
            <span className="ticker-sym">{s.symbol}</span>
            <span className="ticker-price">{formatINR(s.price)}</span>
            <span className="ticker-chg">{s.changePct >= 0 ? "▲" : "▼"}{Math.abs(s.changePct)}%</span>
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

function StatusDot({ connected }) {
  return (
    <span className={`status-dot ${connected ? "online" : "offline"}`} title={connected ? "Backend connected" : "Backend offline"}>
      {connected ? "● LIVE" : "● OFFLINE"}
    </span>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [stocks,    setStocks]    = useState([]);
  const [alerts,    setAlerts]    = useState([]);
  const [triggered, setTriggered] = useState([]);
  const [toasts,    setToasts]    = useState([]);
  const [phone,     setPhone]     = useState(() => localStorage.getItem("nse_phone") || "");
  const [tab,       setTab]       = useState("dashboard");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [connected, setConnected] = useState(false);
  const [health,    setHealth]    = useState(null);

  const [form, setForm] = useState({
    symbol: "RELIANCE", type: "above", value: "", channel: "whatsapp",
  });

  const toastRef = useRef(0);

  // ── Toast helper ──
  const addToast = useCallback((icon, msg, type = "info") => {
    const id = ++toastRef.current;
    setToasts((prev) => [...prev, { id, icon, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── Data fetchers ──
  const fetchStocks = useCallback(async () => {
    try {
      const data = await api.getStocks();
      setStocks(data.stocks || []);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await api.getAlerts(phone || undefined);
      setAlerts(data.alerts || []);
    } catch {}
  }, [phone]);

  const fetchTriggered = useCallback(async () => {
    try {
      const data = await api.getTriggered(phone || undefined);
      setTriggered(data.triggered || []);
    } catch {}
  }, [phone]);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.getHealth();
      setHealth(data);
    } catch {}
  }, []);

  // ── Initial load ──
  useEffect(() => {
    fetchStocks();
    fetchAlerts();
    fetchTriggered();
    fetchHealth();
  }, [fetchStocks, fetchAlerts, fetchTriggered, fetchHealth]);

  // ── Poll every 30 seconds ──
  useEffect(() => {
    const iv = setInterval(() => {
      fetchStocks();
      fetchAlerts();
      fetchTriggered();
    }, 30000);
    return () => clearInterval(iv);
  }, [fetchStocks, fetchAlerts, fetchTriggered]);

  // ── Persist phone ──
  useEffect(() => {
    if (phone) localStorage.setItem("nse_phone", phone);
  }, [phone]);

  // ── Select stock from table ──
  const selectStock = (symbol) => {
    setForm((f) => ({ ...f, symbol }));
    if (tab === "dashboard") {
      document.getElementById("alert-form")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  // ── Create alert ──
  const handleAddAlert = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      addToast("⚠️", "Enter a valid mobile number (with country code, e.g. +91XXXXXXXXXX)", "warn");
      return;
    }
    if (!form.value || isNaN(form.value)) {
      addToast("⚠️", "Enter a valid price or % value", "warn");
      return;
    }
    setLoading(true);
    try {
      const data = await api.createAlert({ ...form, value: parseFloat(form.value), phone });
      setAlerts((prev) => [...prev, data.alert]);
      addToast("✅", `Alert set for ${form.symbol} via ${form.channel}`, "success");
      setForm((f) => ({ ...f, value: "" }));
    } catch (e) {
      addToast("❌", e.message, "warn");
    }
    setLoading(false);
  };

  // ── Delete alert ──
  const handleDeleteAlert = async (id) => {
    try {
      await api.deleteAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      addToast("🗑️", "Alert removed", "info");
    } catch (e) {
      addToast("❌", e.message, "warn");
    }
  };

  // ── Test notification ──
  const handleTest = async () => {
    if (!phone) { addToast("⚠️", "Enter mobile number first", "warn"); return; }
    try {
      await api.testNotification(phone, form.channel);
      addToast("📲", `Test ${form.channel} sent to ${phone}!`, "success");
    } catch (e) {
      addToast("❌", e.message, "warn");
    }
  };

  // ── Filtered stocks ──
  const filtered = stocks.filter(
    (s) => s.symbol.includes(search.toUpperCase()) || s.name?.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount    = alerts.filter((a) => !a.fired).length;
  const firedCount     = alerts.filter((a) => a.fired).length;

  return (
    <div className="app">
      {stocks.length > 0 && <Ticker stocks={stocks} />}

      {/* HEADER */}
      <header className="header">
        <div className="logo">
          <div className="logo-icon">📈</div>
          <div>
            <div className="logo-title">NSE AlertBot</div>
            <div className="logo-sub">Real-Time NSE Alerts</div>
          </div>
        </div>
        <div className="header-right">
          <StatusDot connected={connected} />
          <div className="phone-wrap">
            <span className="phone-ico">📲</span>
            <input
              className="phone-input"
              placeholder="+91XXXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={14}
            />
          </div>
        </div>
      </header>

      {/* TABS */}
      <nav className="tabs">
        {[
          ["dashboard", "📊 Dashboard"],
          ["alerts",    `🔔 Alerts ${alerts.length ? `(${activeCount} active)` : ""}`],
          ["triggered", `🚨 Triggered ${triggered.length ? `(${triggered.length})` : ""}`],
          ["settings",  "⚙️ Setup"],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {/* MAIN */}
      <main className="main">

        {/* ─── DASHBOARD ────────────────────────────────────── */}
        {tab === "dashboard" && (
          <>
            {/* Stat row */}
            <div className="stat-row">
              <div className="stat-box"><div className="stat-label">Active Alerts</div><div className="stat-val blue">{activeCount}</div></div>
              <div className="stat-box"><div className="stat-label">Triggered</div><div className="stat-val green">{triggered.length}</div></div>
              <div className="stat-box"><div className="stat-label">Live Stocks</div><div className="stat-val">{stocks.length}</div></div>
              <div className="stat-box"><div className="stat-label">Last Update</div><div className="stat-val small">{health?.lastPriceUpdate ? new Date(health.lastPriceUpdate).toLocaleTimeString("en-IN") : "—"}</div></div>
            </div>

            <div className="two-col">
              {/* Stock table */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">📊 NSE Live Prices</div>
                  <span className="live-badge">● LIVE</span>
                </div>
                <input className="search-input" placeholder="Search symbol or company…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {stocks.length === 0 ? (
                  <div className="empty-state">
                    {connected ? "Loading prices…" : "⚠️ Cannot connect to backend. Is the server running on port 5000?"}
                  </div>
                ) : (
                  <table className="stock-table">
                    <thead>
                      <tr>
                        <th>Symbol</th><th>Company</th><th>Price (₹)</th><th>Chg %</th><th>High</th><th>Low</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.symbol} className="stock-row" onClick={() => selectStock(s.symbol)}>
                          <td><span className="sym-badge">{s.symbol}</span></td>
                          <td className="name-cell">{s.name}</td>
                          <td className="price-cell">{formatINR(s.price)}</td>
                          <td className={s.changePct >= 0 ? "chg-up" : "chg-down"}>
                            {s.changePct >= 0 ? "▲" : "▼"}{Math.abs(s.changePct).toFixed(2)}%
                          </td>
                          <td className="muted-cell">{formatINR(s.high)}</td>
                          <td className="muted-cell">{formatINR(s.low)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Alert form */}
              <div className="card" id="alert-form">
                <div className="card-title">➕ Create Alert</div>

                <div className="form-group">
                  <label className="form-label">Stock Symbol</label>
                  <select className="form-select" value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}>
                    {stocks.map((s) => (
                      <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>
                    ))}
                  </select>
                  {stocks.find((s) => s.symbol === form.symbol) && (
                    <div className="selected-price">
                      Current: <strong>{formatINR(stocks.find((s) => s.symbol === form.symbol)?.price)}</strong>
                      <span className={stocks.find((s) => s.symbol === form.symbol)?.changePct >= 0 ? "chg-up" : "chg-down"}>
                        {" "}{stocks.find((s) => s.symbol === form.symbol)?.changePct >= 0 ? "▲" : "▼"}
                        {Math.abs(stocks.find((s) => s.symbol === form.symbol)?.changePct || 0).toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Alert Type</label>
                  <div className="type-row">
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

                <div className="form-group">
                  <label className="form-label">{form.type.includes("change") ? "% Threshold" : "Target Price (₹)"}</label>
                  <input className="form-input" type="number" min="0" step="0.01"
                    placeholder={form.type.includes("change") ? "e.g. 2.5" : "e.g. 2900"}
                    value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Send Alert Via</label>
                  <div className="channel-row">
                    {CHANNELS.map((c) => (
                      <button key={c.id} className={`channel-btn ${form.channel === c.id ? "active" : ""}`}
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
                  📲 Send Test Notification
                </button>
                {!phone && (
                  <p className="phone-warning">⚠️ Enter your mobile number at the top to receive alerts</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ─── ALERTS ──────────────────────────────────────── */}
        {tab === "alerts" && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">🔔 My Alerts</div>
              <span className="badge">{alerts.length} total · {activeCount} active · {firedCount} fired</span>
            </div>
            {alerts.length === 0 ? (
              <div className="empty-state">No alerts yet. Go to Dashboard to create one.</div>
            ) : (
              <div className="alert-list">
                {alerts.map((a) => {
                  const typeInfo = ALERT_TYPES.find((t) => t.id === a.type);
                  return (
                    <div key={a.id} className={`alert-card ${a.fired ? "fired" : ""}`}>
                      <div className="alert-info">
                        <div className="alert-sym">
                          {a.symbol}
                          {a.fired && <span className="fired-badge">✅ Triggered</span>}
                        </div>
                        <div className="alert-cond" style={{ color: typeInfo?.color }}>
                          {typeInfo?.label}: {a.type.includes("change") ? a.value + "%" : formatINR(a.value)}
                        </div>
                        <div className="alert-meta">
                          via {a.channel === "both" ? "WhatsApp & SMS" : a.channel} · {a.phone} · {new Date(a.createdAt).toLocaleString("en-IN")}
                          {a.firedAt && ` · Fired: ${new Date(a.firedAt).toLocaleString("en-IN")}`}
                        </div>
                      </div>
                      <button className="del-btn" onClick={() => handleDeleteAlert(a.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── TRIGGERED ───────────────────────────────────── */}
        {tab === "triggered" && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">🚨 Triggered Alerts</div>
              <span className="badge green">{triggered.length} notifications sent</span>
            </div>
            {triggered.length === 0 ? (
              <div className="empty-state">No alerts triggered yet. Set alerts and watch this space!</div>
            ) : (
              <div className="triggered-list">
                {triggered.map((t) => (
                  <div key={t.id} className="triggered-card">
                    <div className="t-top">
                      <span className="t-sym">{t.symbol}</span>
                      <span className="t-price">{formatINR(t.price)}</span>
                      <span className={`t-chg ${t.changePct >= 0 ? "chg-up" : "chg-down"}`}>
                        {t.changePct >= 0 ? "▲" : "▼"}{Math.abs(t.changePct).toFixed(2)}%
                      </span>
                    </div>
                    <div className="t-msg">{t.message.replace(/\*/g, "").replace(/_/g, "")}</div>
                    <div className="t-meta">
                      <span>🕐 {new Date(t.firedAt).toLocaleString("en-IN")}</span>
                      <span className="ch-tag">
                        {t.channel === "whatsapp" ? "💬 WhatsApp" : t.channel === "sms" ? "📱 SMS" : "🔔 WhatsApp & SMS"}
                      </span>
                      {t.results?.whatsapp?.mock && <span className="mock-tag">Mock Mode</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── SETTINGS / SETUP ────────────────────────────── */}
        {tab === "settings" && (
          <div className="settings-grid">
            <div className="card">
              <div className="card-title">⚙️ Setup Guide</div>
              <div className="setup-steps">

                <div className="step">
                  <div className="step-num">1</div>
                  <div className="step-body">
                    <div className="step-title">Install & Start Backend</div>
                    <pre className="code-block">{`cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm start`}</pre>
                  </div>
                </div>

                <div className="step">
                  <div className="step-num">2</div>
                  <div className="step-body">
                    <div className="step-title">Configure Twilio (WhatsApp + SMS)</div>
                    <div className="step-desc">
                      Sign up at <a href="https://www.twilio.com" target="_blank" rel="noreferrer">twilio.com</a> → Get Account SID, Auth Token, and Phone Number.
                      <br />For WhatsApp, join the Sandbox at <strong>+1 415 523 8886</strong> (or upgrade to production).
                    </div>
                    <pre className="code-block">{`# In backend/.env:
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=+14155238886`}</pre>
                  </div>
                </div>

                <div className="step">
                  <div className="step-num">3</div>
                  <div className="step-body">
                    <div className="step-title">Start Frontend</div>
                    <pre className="code-block">{`cd frontend
npm install
npm start
# Opens http://localhost:3000`}</pre>
                  </div>
                </div>

                <div className="step">
                  <div className="step-num">4</div>
                  <div className="step-body">
                    <div className="step-title">Deploy to Production</div>
                    <div className="step-desc">
                      <strong>Backend:</strong> Deploy to Railway, Render, or a VPS (Node.js).<br />
                      <strong>Frontend:</strong> Run <code>npm run build</code> → deploy <code>build/</code> to Vercel, Netlify, or Nginx.<br />
                      Set <code>REACT_APP_API_URL=https://your-backend.com</code> in frontend env.
                    </div>
                  </div>
                </div>

                <div className="step">
                  <div className="step-num">5</div>
                  <div className="step-body">
                    <div className="step-title">Real NSE Data (Optional)</div>
                    <div className="step-desc">
                      By default the app uses realistic simulated prices.<br />
                      For live data, get a free API key from <a href="https://www.alphavantage.co" target="_blank" rel="noreferrer">alphavantage.co</a> and add to <code>.env</code>:<br />
                      <code>ALPHA_VANTAGE_API_KEY=your_key</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">📡 Backend Status</div>
              {health ? (
                <div className="health-grid">
                  {[
                    ["Status",         <span className="badge green">✅ Online</span>],
                    ["Twilio",         health.twilioConfigured ? <span className="badge green">✅ Configured</span> : <span className="badge yellow">⚠️ Mock Mode</span>],
                    ["Active Alerts",  health.activeAlerts],
                    ["Total Alerts",   health.totalAlerts],
                    ["Triggered",      health.triggeredCount],
                    ["Uptime",         Math.floor(health.uptime / 60) + " min"],
                    ["Last Price Update", health.lastPriceUpdate ? new Date(health.lastPriceUpdate).toLocaleTimeString("en-IN") : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="health-row">
                      <span className="health-key">{k}</span>
                      <span className="health-val">{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">⚠️ Backend not reachable. Start backend on port 5000.</div>
              )}
            </div>
          </div>
        )}

      </main>

      <Toast toasts={toasts} />
    </div>
  );
}
