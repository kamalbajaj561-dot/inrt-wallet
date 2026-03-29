const express = require('express');
const cors = require('cors');
const path = require('path');
const { resolveKnowledge } = require('./knowledge');

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function normalizeIndianSymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.endsWith('.NS') || raw.endsWith('.BO')) return raw;
  return `${raw}.NS`;
}

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Market API failed with status ${response.status}`);
  }
  const data = await response.json();
  return data?.quoteResponse?.result?.[0] || null;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'Jarvis India Assistant', time: new Date().toISOString() });
});

app.get('/api/quote', async (req, res) => {
  try {
    const symbol = normalizeIndianSymbol(req.query.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'symbol query param is required. Example: RELIANCE' });
    }

    const quote = await fetchYahooQuote(symbol);
    if (!quote) return res.status(404).json({ error: `No quote found for ${symbol}` });

    res.json({
      symbol: quote.symbol,
      shortName: quote.shortName,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      open: quote.regularMarketOpen,
      high: quote.regularMarketDayHigh,
      low: quote.regularMarketDayLow,
      previousClose: quote.regularMarketPreviousClose,
      volume: quote.regularMarketVolume,
      marketState: quote.marketState,
      exchange: quote.fullExchangeName,
      currency: quote.currency
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch quote' });
  }
});

app.post('/api/ask', async (req, res) => {
  const { message } = req.body || {};
  const text = String(message || '').trim();

  if (!text) {
    return res.status(400).json({ error: 'message is required' });
  }

  const local = resolveKnowledge(text);
  if (local) {
    return res.json({
      source: 'knowledge-base',
      answer: `${local}\n\n⚠️ Educational use only. This is not investment advice.`
    });
  }

  res.json({
    source: 'fallback',
    answer:
      'I can answer Indian market topics, risk management, tax basics, and fetch live-like quotes by symbol. Try: "Explain options Greeks" or "Get quote for TCS".'
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Jarvis India Assistant running on http://localhost:${PORT}`);
});
