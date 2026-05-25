/**
 * API Service — All calls to the NSE Alert Backend
 */

const BASE = process.env.REACT_APP_API_URL;

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getHealth:          ()               => request("GET",  "/api/health"),
  getStocks:          ()               => request("GET",  "/api/stocks"),
  getAlerts:          (phone)          => request("GET",  `/api/alerts${phone ? `?phone=${phone}` : ""}`),
  createAlert:        (data)           => request("POST", "/api/alerts", data),
  deleteAlert:        (id)             => request("DELETE", `/api/alerts/${id}`),
  getTriggered:       (phone)          => request("GET",  `/api/triggered${phone ? `?phone=${phone}` : ""}`),
  testNotification:   (phone, channel) => request("POST", "/api/test-notification", { phone, channel }),
};
