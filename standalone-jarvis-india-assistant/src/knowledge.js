const knowledgeBase = [
  {
    title: 'NSE, BSE & SEBI',
    keywords: ['nse', 'bse', 'sebi', 'regulator', 'exchange'],
    answer:
      'NSE and BSE are India\'s primary exchanges. SEBI regulates market conduct, disclosures, insider trading, and investor protection. Equity settlement is generally T+1 with holdings in NSDL/CDSL demat accounts.'
  },
  {
    title: 'NIFTY and SENSEX',
    keywords: ['nifty', 'sensex', 'index', 'bank nifty', 'midcap', 'smallcap'],
    answer:
      'NIFTY 50 tracks 50 large NSE companies. SENSEX tracks 30 major BSE companies. Broader indices like midcap/smallcap are more volatile but can offer higher growth with higher risk.'
  },
  {
    title: 'Fundamental Analysis',
    keywords: ['pe', 'p/e', 'eps', 'roe', 'roce', 'debt', 'valuation', 'cash flow', 'fundamental'],
    answer:
      'Key checks: revenue/profit growth consistency, ROE/ROCE quality, debt levels, free cash flow, promoter holding trend, and valuation versus sector peers.'
  },
  {
    title: 'Technical Analysis',
    keywords: ['rsi', 'macd', 'moving average', 'support', 'resistance', 'candlestick', 'chart'],
    answer:
      'Technical analysis uses price and volume behavior. Popular tools: 20/50/200 DMA, RSI momentum, MACD trend shift, support/resistance zones, and volume breakout confirmation.'
  },
  {
    title: 'Options and Futures',
    keywords: ['options', 'futures', 'delta', 'theta', 'vega', 'gamma', 'expiry', 'lot size', 'straddle'],
    answer:
      'Futures are linear contracts; options have asymmetric payoff. Greeks matter: Delta (price), Theta (time decay), Vega (volatility). Always define max loss and avoid oversized leverage.'
  },
  {
    title: 'Risk Management',
    keywords: ['risk', 'stop loss', 'position sizing', 'drawdown', 'capital'],
    answer:
      'Risk 0.5–1.5% capital per trade, place stop-loss before entry, diversify across sectors, and avoid revenge trading. Capital protection comes first.'
  },
  {
    title: 'India Stock Tax Basics',
    keywords: ['tax', 'stcg', 'ltcg', 'stt', 'itr', 'fo turnover'],
    answer:
      'Delivery equity gains are usually treated as capital gains (STCG/LTCG as per prevailing rules). Intraday equity is commonly speculative business income; F&O is generally non-speculative business income. Keep contract notes and broker P&L for filing.'
  }
];

function resolveKnowledge(query) {
  const normalized = String(query || '').toLowerCase();
  const scored = knowledgeBase
    .map(topic => ({
      topic,
      score: topic.keywords.reduce((sum, k) => sum + (normalized.includes(k) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);

  if (!scored[0] || scored[0].score === 0) return null;

  const best = scored[0].topic;
  return `📘 ${best.title}\n\n${best.answer}`;
}

module.exports = { knowledgeBase, resolveKnowledge };
