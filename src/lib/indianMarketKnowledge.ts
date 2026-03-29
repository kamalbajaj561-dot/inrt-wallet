export interface KnowledgeTopic {
  title: string;
  keywords: string[];
  answer: string;
}

const topic = (title: string, keywords: string[], answer: string): KnowledgeTopic => ({
  title,
  keywords,
  answer,
});

export const indianMarketKnowledgeBase: KnowledgeTopic[] = [
  topic(
    'Market Structure (NSE/BSE/SEBI)',
    ['nse', 'bse', 'sebi', 'regulator', 'exchange', 'market structure'],
    'India has two major stock exchanges: NSE and BSE. SEBI is the regulator that frames investor-protection rules, listing norms, insider-trading rules, and broker compliance standards. Most equity stocks settle in T+1 through clearing corporations with demat custody via NSDL/CDSL.'
  ),
  topic(
    'Indices',
    ['nifty', 'sensex', 'index', 'nifty 50', 'bank nifty', 'midcap', 'smallcap'],
    'NIFTY 50 tracks 50 large NSE companies; SENSEX tracks 30 large BSE companies. Sectoral indices include NIFTY Bank, IT, Pharma, Auto, FMCG, etc. Broader indices include NIFTY Midcap 150 and Smallcap 250, which usually carry higher volatility.'
  ),
  topic(
    'Order Types & Trading Basics',
    ['market order', 'limit order', 'stop loss', 'sl', 'intraday', 'delivery', 'cnc', 'mis'],
    'Market order executes immediately at best available price; limit order executes only at your chosen price. Stop-loss and stop-limit orders reduce downside risk. Intraday positions are same-day trades; delivery (CNC) means holding shares beyond the day.'
  ),
  topic(
    'Fundamental Analysis',
    ['pe', 'p/e', 'eps', 'roe', 'roce', 'debt equity', 'fundamental', 'valuation', 'cash flow'],
    'For fundamentals, evaluate revenue growth, operating margin, free cash flow, ROE/ROCE, debt-to-equity, promoter holding trends, and valuation (P/E, P/B, EV/EBITDA) relative to sector peers and growth outlook.'
  ),
  topic(
    'Technical Analysis',
    ['rsi', 'macd', 'moving average', 'support', 'resistance', 'chart', 'candlestick'],
    'Technical analysis focuses on trend, momentum, and price structure. Common tools: moving averages (20/50/200), RSI for momentum, MACD crossovers, volume breakout confirmation, and support/resistance zones for risk-reward entries.'
  ),
  topic(
    'F&O Basics',
    ['futures', 'options', 'ce', 'pe option', 'lot size', 'expiry', 'greeks', 'theta', 'delta'],
    'In derivatives, futures are linear contracts; options provide asymmetric payoff. Key option Greeks: Delta (price sensitivity), Theta (time decay), Vega (IV sensitivity). Risk in short options can be high; position sizing and hedging are critical.'
  ),
  topic(
    'Risk Management',
    ['risk', 'position sizing', 'diversification', 'stoploss', 'drawdown', 'capital protection'],
    'Use a fixed risk-per-trade model (for example 0.5–1.5% of capital), predefined stop-loss, and diversification across sectors/market caps. Avoid averaging losers blindly. Protecting capital is more important than maximizing one trade.'
  ),
  topic(
    'Taxation in India',
    ['stcg', 'ltcg', 'tax', 'stt', 'speculative income', 'itr'],
    'Equity delivery gains are usually taxed as STCG/LTCG under prevailing Income Tax rules; intraday equity is generally speculative business income; F&O is generally non-speculative business income. Keep contract notes, P&L, and turnover records for ITR filing.'
  ),
  topic(
    'Mutual Funds & SIPs',
    ['sip', 'mutual fund', 'index fund', 'etf', 'expense ratio', 'nav'],
    'For long-term investors, index funds/ETFs and SIP discipline can reduce timing risk. Compare expense ratio, tracking error, fund category suitability, and investment horizon before selecting products.'
  ),
  topic(
    'Corporate Actions',
    ['dividend', 'bonus', 'split', 'buyback', 'rights issue', 'record date'],
    'Corporate actions like dividends, stock splits, bonuses, buybacks, and rights issues affect price behavior and holdings. Always check record date and ex-date; adjusted charts and historical data reflect these events.'
  ),
  topic(
    'Investor Safety',
    ['scam', 'fraud', 'tips', 'operator', 'pump', 'telegram', 'whatsapp'],
    'Never follow guaranteed-return tips, operator groups, or unverified Telegram/WhatsApp calls. Verify advisories through SEBI-registered entities, maintain 2FA on broker accounts, and avoid sharing OTP, TPIN, or credentials.'
  ),
];

export const marketQuickActions = [
  'Explain NIFTY vs SENSEX',
  'How to analyze stocks fundamentally?',
  'Teach me options Greeks simply',
  'Best risk management rules',
  'Indian stock market tax basics',
];

export function resolveMarketAnswer(input: string): string | null {
  const normalized = input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

  const matched = indianMarketKnowledgeBase
    .map(item => ({
      item,
      score: item.keywords.reduce((acc, keyword) => (normalized.includes(keyword) ? acc + 1 : acc), 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (!matched[0] || matched[0].score === 0) {
    return null;
  }

  const top = matched[0].item;
  return `📊 ${top.title}\n\n${top.answer}\n\nIf you want, ask for: checklist, examples, or a beginner-to-advanced roadmap on this topic.`;
}
