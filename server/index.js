import express from "express";
import { fileURLToPath } from "node:url";
import { accountRouter } from "./accounts.js";
import { DB_FILE } from "./db.js";

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3001", 10);
const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";

// Alpha Vantage's free tier is rate-limited, so keep successful responses in
// memory for a short period and avoid making the same request repeatedly.
const CACHE_TTLS_MS = {
  quote: 60 * 1000,
  history: 5 * 60 * 1000,
  overview: 30 * 60 * 1000,
};
const responseCache = new Map();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

function normalizeSymbol(value) {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  return /^[A-Z0-9._-]{1,32}$/.test(symbol) ? symbol : null;
}

function readCachedResponse(cacheKey) {
  const cached = responseCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function cacheResponse(cacheKey, value, ttlMs) {
  responseCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function getAlphaVantageError(payload) {
  if (!payload || typeof payload !== "object") {
    return "Alpha Vantage returned an invalid response.";
  }

  const message = payload.Note || payload.Information || payload["Error Message"] || payload.error;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  if (Object.keys(payload).length === 0) {
    return "Alpha Vantage returned no data for this symbol.";
  }

  return null;
}

function demoData(type, symbol) {
  const today = new Date().toISOString().slice(0, 10);

  if (type === "quote") {
    return {
      "Global Quote": {
        "01. symbol": symbol,
        "02. open": "0.00",
        "03. high": "0.00",
        "04. low": "0.00",
        "05. price": "0.00",
        "06. volume": "0",
        "07. latest trading day": today,
        "08. previous close": "0.00",
        "09. change": "0.00",
        "10. change percent": "0.00%",
      },
    };
  }

  if (type === "history") {
    return {
      "Meta Data": {
        "1. Information": "Demo historical data",
        "2. Symbol": symbol,
        "3. Last Refreshed": today,
      },
      "Time Series (Daily)": {
        [today]: {
          "1. open": "0.00",
          "2. high": "0.00",
          "3. low": "0.00",
          "4. close": "0.00",
          "5. volume": "0",
        },
      },
    };
  }

  return {
    Symbol: symbol,
    AssetType: "Common Stock",
    Name: `${symbol} (demo)`,
    Description: "Demo overview data because live market data is unavailable.",
    Currency: "USD",
    Country: "US",
    Exchange: "DEMO",
  };
}

function demoResponse(type, symbol, error) {
  const message = error || "Live market data is unavailable.";
  const rateLimited = /limit|frequency|premium/i.test(message);
  return {
    symbol,
    demo: true,
    source: "demo",
    cached: false,
    error: message,
    reason: rateLimited ? "rate-limit" : "unavailable",
    rateLimited,
    data: demoData(type, symbol),
  };
}

function alphaUrl(type, symbol, apiKey) {
  const params = new URLSearchParams({ function: "", symbol, apikey: apiKey });
  if (type === "quote") {
    params.set("function", "GLOBAL_QUOTE");
  } else if (type === "history") {
    params.set("function", "TIME_SERIES_DAILY");
    params.set("outputsize", "compact");
  } else {
    params.set("function", "OVERVIEW");
  }
  return `${ALPHA_VANTAGE_URL}?${params.toString()}`;
}

async function fetchAlphaVantage(type, symbol, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(alphaUrl(type, symbol, apiKey), {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Alpha Vantage request failed with status ${response.status}.`);
    }

    const payload = await response.json();
    const alphaError = getAlphaVantageError(payload);
    if (alphaError) throw new Error(alphaError);
    return payload;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Alpha Vantage request timed out.");
    }
    throw error instanceof Error ? error : new Error("Unable to retrieve market data.");
  } finally {
    clearTimeout(timeout);
  }
}

function marketHandler(type) {
  return async (req, res) => {
    const symbol = normalizeSymbol(req.query.symbol);
    if (!symbol) {
      return res.status(400).json({
        demo: false,
        error: "A valid symbol query parameter is required.",
      });
    }

    const cacheKey = `${type}:${symbol}`;
    const cached = readCachedResponse(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    const apiKey = typeof process.env.ALPHA_VANTAGE_API_KEY === "string"
      ? process.env.ALPHA_VANTAGE_API_KEY.trim()
      : "";

    if (!apiKey) {
      return res.json(demoResponse(type, symbol, "ALPHA_VANTAGE_API_KEY is not configured."));
    }

    try {
      const data = await fetchAlphaVantage(type, symbol, apiKey);
      const result = {
        symbol,
        demo: false,
        source: "alpha-vantage",
        cached: false,
        data,
      };
      cacheResponse(cacheKey, result, CACHE_TTLS_MS[type]);
      return res.json(result);
    } catch (error) {
      return res.json(demoResponse(
        type,
        symbol,
        error && error.message ? error.message : "Live market data is unavailable.",
      ));
    }
  };
}

app.get("/api/market/quote", marketHandler("quote"));
app.get("/api/market/history", marketHandler("history"));
app.get("/api/market/overview", marketHandler("overview"));

// Accounts talk to SQLite. The browser reaches these through the Vite proxy, so
// they stay same-origin and the session cookie needs no cross-origin access.
app.use("/api", accountRouter);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Stockmark API listening on port ${PORT}`);
    console.log(`Account database: ${DB_FILE}`);
  });
}

export {
  app,
  responseCache,
};
