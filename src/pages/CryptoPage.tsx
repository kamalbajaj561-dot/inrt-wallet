import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  doc, updateDoc, increment, serverTimestamp,
  collection, addDoc, getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ── API CONFIG ─────────────────────────────────────────────────
const AV_KEY    = import.meta.env.VITE_ALPHA_VANTAGE_KEY || 'demo';
const BINANCE   = 'https://api.binance.com/api/v3';
const AV_BASE   = 'https://www.alphavantage.co/query';

// ── COIN CATALOGUE ─────────────────────────────────────────────
const COINS = [
  { id:'BTC',  name:'Bitcoin',       binance:'BTCUSDT',  av:'BTCUSD',  icon:'₿',  color:'#f7931a' },
  { id:'ETH',  name:'Ethereum',      binance:'ETHUSDT',  av:'ETHUSD',  icon:'Ξ',  color:'#627eea' },
  { id:'BNB',  name:'BNB',           binance:'BNBUSDT',  av:'BNBUSD',  icon:'B',  color:'#f3ba2f' },
  { id:'SOL',  name:'Solana',        binance:'SOLUSDT',  av:'SOLUSD',  icon:'◎',  color:'#9945ff' },
  { id:'XRP',  name:'XRP',           binance:'XRPUSDT',  av:'XRPUSD',  icon:'✕',  color:'#346aa9' },
  { id:'DOGE', name:'Dogecoin',      binance:'DOGEUSDT', av:'DOGEUSD', icon:'Ð',  color:'#c2a633' },
  { id:'ADA',  name:'Cardano',       binance:'ADAUSDT',  av:'ADAUSD',  icon:'₳',  color:'#0d1e2d' },
  { id:'MATIC',name:'Polygon',       binance:'MATICUSDT',av:'MATICUSD',icon:'⬡',  color:'#8247e5' },
  { id:'AVAX', name:'Avalanche',     binance:'AVAXUSDT', av:'AVAXUSD', icon:'▲',  color:'#e84142' },
  { id:'DOT',  name:'Polkadot',      binance:'DOTUSDT',  av:'DOTUSD',  icon:'●',  color:'#e6007a' },
  { id:'LTC',  name:'Litecoin',      binance:'LTCUSDT',  av:'LTCUSD',  icon:'Ł',  color:'#bfbbbb' },
  { id:'LINK', name:'Chainlink',     binance:'LINKUSDT', av:'LINKUSD', icon:'⬡',  color:'#2a5ada' },
];

interface PriceData {
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
  lastUpdated: number;
}

interface Holding {
  coinId: string;
  amount: number;
  avgBuyPrice: number;
  totalInvested: number;
}

// ── FETCH via Binance (primary, free) ──────────────────────────
async function fetchBinancePrice(symbol: string): Promise<PriceData | null> {
  try {
    const r = await fetch(`${BINANCE}/ticker/24hr?symbol=${symbol}`, {
      signal: AbortSignal.timeout(6000)
    });
    const d = await r.json();
    if (d.code) return null;
    return {
      price:      parseFloat(d.lastPrice),
      change:     parseFloat(d.priceChange),
      changePct:  parseFloat(d.priceChangePercent),
      high:       parseFloat(d.highPrice),
      low:        parseFloat(d.lowPrice),
      volume:     parseFloat(d.quoteVolume),
      lastUpdated: Date.now(),
    };
  } catch { return null; }
}

// ── FETCH via Alpha Vantage (fallback / extra data) ────────────
async function fetchAVPrice(symbol: string): Promise<PriceData | null> {
  if (AV_KEY === 'demo') return null;
  try {
    const url = `${AV_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol.replace('USD','')}&to_currency=USD&apikey=${AV_KEY}`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d   = await r.json();
    const rate = d['Realtime Currency Exchange Rate'];
    if (!rate) return null;
    const price = parseFloat(rate['5. Exchange Rate']);
    return { price, change:0, changePct:0, high:0, low:0, volume:0, lastUpdated:Date.now() };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════
export default function CryptoPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [tab,       setTab]       = useState<'market'|'buy'|'sell'|'portfolio'>('market');
  const [prices,    setPrices]    = useState<Record<string, PriceData>>({});
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(COINS[0]);
  const [buyAmount, setBuyAmount] = useState('');  // in INR
  const [sellCoins, setSellCoins] = useState('');  // in crypto
  const [holdings,  setHoldings]  = useState<Record<string, Holding>>({});
  const [txLoading, setTxLoading] = useState(false);
  const [toast,     setToast]     = useState('');
  const [usdToInr,  setUsdToInr]  = useState(83.5); // fallback rate

  const bal = userProfile?.balance || 0;

  // ── Load USD→INR rate ────────────────────────────────────────
  useEffect(() => {
    const oerKey = import.meta.env.VITE_OER_KEY;
    if (oerKey) {
      fetch(`https://openexchangerates.org/api/latest.json?app_id=${oerKey}&symbols=INR`)
        .then(r => r.json())
        .then(d => { if (d.rates?.INR) setUsdToInr(d.rates.INR); })
        .catch(() => {});
    }
  }, []);

  // ── Load holdings from Firebase ─────────────────────────────
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) {
        setHoldings(snap.data()?.cryptoHoldings || {});
      }
    });
  }, [user]);

  // ── Load prices ──────────────────────────────────────────────
  const loadPrices = useCallback(async () => {
    const results: Record<string, PriceData> = {};
    await Promise.all(
      COINS.map(async coin => {
        const p = await fetchBinancePrice(coin.binance);
        if (p) results[coin.id] = p;
      })
    );
    setPrices(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPrices();
    const t = setInterval(loadPrices, 30000); // refresh every 30s
    return () => clearInterval(t);
  }, [loadPrices]);

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(''), 3000);
  };

  // ── Format helpers ───────────────────────────────────────────
  const fmtUSD  = (n: number) => n < 0.01 ? `$${n.toFixed(6)}` : n < 1 ? `$${n.toFixed(4)}` : `$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtINR  = (n: number) => `₹${(n * usdToInr).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
  const fmtPct  = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const clr     = (n: number) => n >= 0 ? '#10b981' : '#ef4444';

  // ── BUY ──────────────────────────────────────────────────────
  const handleBuy = async () => {
    const inrAmount = parseFloat(buyAmount);
    if (!inrAmount || inrAmount < 10) return showToast('Minimum ₹10');
    if (inrAmount > bal) return showToast(`Insufficient balance. You have ₹${bal}`);

    const p = prices[selected.id];
    if (!p) return showToast('Price data unavailable');

    const priceInINR   = p.price * usdToInr;
    const coinsToGet   = inrAmount / priceInINR;
    const existing     = holdings[selected.id];
    const newTotal     = (existing?.amount || 0) + coinsToGet;
    const newInvested  = (existing?.totalInvested || 0) + inrAmount;
    const newAvgPrice  = newInvested / newTotal;

    setTxLoading(true);
    try {
      const newHoldings = {
        ...holdings,
        [selected.id]: {
          coinId:        selected.id,
          amount:        newTotal,
          avgBuyPrice:   newAvgPrice,
          totalInvested: newInvested,
        },
      };

      await updateDoc(doc(db, 'users', user!.uid), {
        balance:         increment(-inrAmount),
        cryptoHoldings:  newHoldings,
        updatedAt:       serverTimestamp(),
      });
      await addDoc(collection(db, 'transactions'), {
        uid: user!.uid, type: 'debit',
        amount: inrAmount, cat: 'crypto',
        note: `Bought ${coinsToGet.toFixed(6)} ${selected.id}`,
        status: 'success', createdAt: serverTimestamp(),
      });

      setHoldings(newHoldings);
      await refreshProfile();
      showToast(`✅ Bought ${coinsToGet.toFixed(6)} ${selected.id} for ₹${inrAmount}`);
      setBuyAmount('');
    } catch (e: any) {
      showToast(e.message || 'Purchase failed');
    }
    setTxLoading(false);
  };

  // ── SELL ──────────────────────────────────────────────────────
  const handleSell = async () => {
    const coinAmount = parseFloat(sellCoins);
    const holding    = holdings[selected.id];
    if (!coinAmount || coinAmount <= 0) return showToast('Enter amount to sell');
    if (!holding || coinAmount > holding.amount)
      return showToast(`You only have ${holding?.amount?.toFixed(6) || 0} ${selected.id}`);

    const p          = prices[selected.id];
    if (!p)          return showToast('Price data unavailable');
    const priceInINR = p.price * usdToInr;
    const inrReceive = Math.floor(coinAmount * priceInINR * 0.99); // 1% spread

    setTxLoading(true);
    try {
      const newAmount   = holding.amount - coinAmount;
      const newInvested = newAmount > 0
        ? holding.totalInvested * (newAmount / holding.amount)
        : 0;

      const newHoldings = { ...holdings };
      if (newAmount < 0.000001) delete newHoldings[selected.id];
      else newHoldings[selected.id] = { ...holding, amount: newAmount, totalInvested: newInvested };

      await updateDoc(doc(db, 'users', user!.uid), {
        balance:        increment(inrReceive),
        cryptoHoldings: newHoldings,
        updatedAt:      serverTimestamp(),
      });
      await addDoc(collection(db, 'transactions'), {
        uid: user!.uid, type: 'credit',
        amount: inrReceive, cat: 'crypto',
        note: `Sold ${coinAmount} ${selected.id}`,
        status: 'success', createdAt: serverTimestamp(),
      });

      setHoldings(newHoldings);
      await refreshProfile();
      showToast(`✅ Sold ${coinAmount} ${selected.id} for ₹${inrReceive.toLocaleString('en-IN')}`);
      setSellCoins('');
    } catch (e: any) {
      showToast(e.message || 'Sale failed');
    }
    setTxLoading(false);
  };

  // ── Portfolio totals ─────────────────────────────────────────
  const portfolioStats = Object.entries(holdings).reduce((acc, [coinId, h]) => {
    const p = prices[coinId];
    if (!p) return acc;
    const currentVal = h.amount * p.price * usdToInr;
    acc.currentValue  += currentVal;
    acc.totalInvested += h.totalInvested;
    return acc;
  }, { currentValue: 0, totalInvested: 0 });

  const portfolioPnL    = portfolioStats.currentValue - portfolioStats.totalInvested;
  const portfolioPnLPct = portfolioStats.totalInvested > 0
    ? (portfolioPnL / portfolioStats.totalInvested) * 100 : 0;

  const filtered = COINS.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}

      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate('/dashboard')} style={S.back}>←</button>
        <div style={{ flex:1 }}>
          <h1 style={S.title}>Crypto</h1>
          <p style={{ color:'rgba(255,255,255,0.4)',fontSize:11,marginTop:1 }}>
            Live prices · Binance + Alpha Vantage · 1$ = ₹{usdToInr.toFixed(1)}
          </p>
        </div>
        <div style={S.liveBadge}>● LIVE</div>
      </div>

      {/* Portfolio Mini Banner */}
      {portfolioStats.currentValue > 0 && (
        <div style={S.portfolioBanner} onClick={() => setTab('portfolio')}>
          <div>
            <p style={{ color:'rgba(255,255,255,0.5)',fontSize:10,fontWeight:700,letterSpacing:1 }}>PORTFOLIO VALUE</p>
            <p style={{ color:'#f0b429',fontWeight:900,fontSize:20,fontFamily:"'Syne',sans-serif" }}>
              ₹{portfolioStats.currentValue.toLocaleString('en-IN',{maximumFractionDigits:0})}
            </p>
          </div>
          <div style={{ textAlign:'right' }}>
            <p style={{ color:clr(portfolioPnLPct),fontWeight:700,fontSize:14 }}>
              {portfolioPnL >= 0 ? '+' : ''}₹{portfolioPnL.toLocaleString('en-IN',{maximumFractionDigits:0})}
            </p>
            <p style={{ color:clr(portfolioPnLPct),fontSize:12 }}>{fmtPct(portfolioPnLPct)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {(['market','buy','sell','portfolio'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...S.tab, ...(tab===t ? S.tabOn : {}) }}>
            {t==='market'?'📊':t==='buy'?'🟢':t==='sell'?'🔴':'💼'} {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ padding:'0 16px 90px' }}>

        {/* ── MARKET TAB ── */}
        {tab === 'market' && (
          <>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search coins..."
              style={S.searchInput} />
            {loading ? (
              [1,2,3,4,5,6].map(i => (
                <div key={i} style={{ ...S.coinRow, opacity:0.4 }}>
                  <div style={{ width:42,height:42,borderRadius:12,background:'#1e1e2a' }} />
                  <div style={{ flex:1 }}>
                    <div style={{ height:14,width:80,background:'#1e1e2a',borderRadius:4,marginBottom:6 }} />
                    <div style={{ height:10,width:50,background:'#16161f',borderRadius:4 }} />
                  </div>
                </div>
              ))
            ) : (
              filtered.map(coin => {
                const p = prices[coin.id];
                const inPortfolio = !!holdings[coin.id];
                return (
                  <div key={coin.id}
                    onClick={() => { setSelected(coin); setTab('buy'); }}
                    style={{ ...S.coinRow, cursor:'pointer',
                      background: inPortfolio ? 'rgba(240,180,41,0.06)' : '#16161f',
                      border: inPortfolio ? '1px solid rgba(240,180,41,0.2)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ ...S.coinIcon, background:`${coin.color}22`, color:coin.color }}>
                      {coin.icon}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
                        <div>
                          <p style={{ color:'#f0f0f8',fontWeight:700,fontSize:14 }}>{coin.name}</p>
                          <p style={{ color:'#555570',fontSize:11,marginTop:2 }}>
                            {coin.id} {inPortfolio && <span style={{ color:'#f0b429',fontSize:10 }}>· In portfolio</span>}
                          </p>
                        </div>
                        {p ? (
                          <div style={{ textAlign:'right' }}>
                            <p style={{ color:'#f0f0f8',fontWeight:800,fontSize:14 }}>{fmtUSD(p.price)}</p>
                            <p style={{ color:clr(p.changePct),fontSize:12,fontWeight:600,marginTop:2 }}>
                              {fmtPct(p.changePct)}
                            </p>
                          </div>
                        ) : (
                          <p style={{ color:'#555570',fontSize:12 }}>Loading...</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ── BUY TAB ── */}
        {tab === 'buy' && (
          <div>
            {/* Coin selector */}
            <div style={S.card}>
              <p style={S.cardLabel}>SELECT COIN</p>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:16 }}>
                {COINS.slice(0,6).map(c => (
                  <button key={c.id} onClick={() => setSelected(c)}
                    style={{ padding:'7px 12px',borderRadius:10,fontSize:12,fontWeight:700,
                             cursor:'pointer',
                             background:selected.id===c.id?`${c.color}22`:'#1e1e2a',
                             border:`1px solid ${selected.id===c.id?c.color:'rgba(255,255,255,0.07)'}`,
                             color:selected.id===c.id?c.color:'#8888a8' }}>
                    {c.id}
                  </button>
                ))}
              </div>

              {/* Selected coin price */}
              {prices[selected.id] && (
                <div style={{ background:'#1e1e2a',borderRadius:12,padding:'12px 14px',marginBottom:16 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                    <div>
                      <p style={{ color:'#8888a8',fontSize:11 }}>{selected.name} price</p>
                      <p style={{ color:'#f0f0f8',fontWeight:800,fontSize:18,marginTop:2 }}>
                        {fmtUSD(prices[selected.id].price)}
                        <span style={{ color:'#8888a8',fontSize:12,fontWeight:400,marginLeft:6 }}>
                          ≈ {fmtINR(prices[selected.id].price)}
                        </span>
                      </p>
                    </div>
                    <span style={{ color:clr(prices[selected.id].changePct),fontWeight:700 }}>
                      {fmtPct(prices[selected.id].changePct)}
                    </span>
                  </div>
                </div>
              )}

              <p style={S.cardLabel}>AMOUNT IN ₹</p>
              <div style={S.amtRow}>
                <span style={{ color:'#f0b429',fontSize:20,fontWeight:800 }}>₹</span>
                <input type="number" value={buyAmount}
                  onChange={e => setBuyAmount(e.target.value)}
                  placeholder="0"
                  style={{ flex:1,background:'none',border:'none',outline:'none',
                           fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:'#f0f0f8' }} />
              </div>

              {/* Quick amounts */}
              <div style={{ display:'flex',gap:8,marginBottom:14,flexWrap:'wrap' as const }}>
                {[100,500,1000,5000].map(a => (
                  <button key={a} onClick={() => setBuyAmount(String(a))}
                    style={{ padding:'7px 12px',borderRadius:10,fontSize:12,fontWeight:700,
                             cursor:'pointer',
                             background:buyAmount===String(a)?'rgba(240,180,41,0.15)':'#1e1e2a',
                             border:`1px solid ${buyAmount===String(a)?'#f0b429':'rgba(255,255,255,0.07)'}`,
                             color:buyAmount===String(a)?'#f0b429':'#8888a8' }}>
                    ₹{a}
                  </button>
                ))}
              </div>

              {buyAmount && prices[selected.id] && (
                <div style={{ background:'rgba(16,185,129,0.08)',borderRadius:10,
                               padding:'10px 14px',marginBottom:14 }}>
                  <p style={{ color:'#10b981',fontSize:13 }}>
                    You get ≈ {(parseFloat(buyAmount) / (prices[selected.id].price * usdToInr)).toFixed(6)} {selected.id}
                  </p>
                </div>
              )}

              <div style={{ display:'flex',justifyContent:'space-between',
                             padding:'8px 0',borderTop:'1px solid rgba(255,255,255,0.06)',marginBottom:14 }}>
                <span style={{ color:'#555570',fontSize:12 }}>Wallet balance</span>
                <span style={{ color:parseFloat(buyAmount)>bal?'#ef4444':'#10b981',fontWeight:700,fontSize:12 }}>
                  ₹{bal.toLocaleString('en-IN')}
                </span>
              </div>

              <button onClick={handleBuy} disabled={txLoading||!buyAmount}
                style={{ ...S.buyBtn, opacity:txLoading||!buyAmount?0.5:1 }}>
                {txLoading ? '⏳ Processing...' : `Buy ${selected.id} →`}
              </button>
            </div>
          </div>
        )}

        {/* ── SELL TAB ── */}
        {tab === 'sell' && (
          <div>
            <div style={S.card}>
              <p style={S.cardLabel}>SELECT COIN TO SELL</p>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:16 }}>
                {COINS.filter(c => holdings[c.id]).map(c => (
                  <button key={c.id} onClick={() => setSelected(c)}
                    style={{ padding:'7px 12px',borderRadius:10,fontSize:12,fontWeight:700,
                             cursor:'pointer',
                             background:selected.id===c.id?`${c.color}22`:'#1e1e2a',
                             border:`1px solid ${selected.id===c.id?c.color:'rgba(255,255,255,0.07)'}`,
                             color:selected.id===c.id?c.color:'#8888a8' }}>
                    {c.id}
                  </button>
                ))}
                {Object.keys(holdings).length === 0 && (
                  <p style={{ color:'#555570',fontSize:13 }}>No holdings to sell. Buy some crypto first!</p>
                )}
              </div>

              {holdings[selected.id] && (
                <>
                  <div style={{ background:'#1e1e2a',borderRadius:12,padding:'12px 14px',marginBottom:16 }}>
                    <p style={{ color:'#8888a8',fontSize:11,marginBottom:4 }}>Your holdings</p>
                    <p style={{ color:'#f0f0f8',fontWeight:800,fontSize:16 }}>
                      {holdings[selected.id].amount.toFixed(6)} {selected.id}
                    </p>
                    <p style={{ color:'#555570',fontSize:11,marginTop:2 }}>
                      Avg buy price: {fmtUSD(holdings[selected.id].avgBuyPrice / usdToInr)}
                    </p>
                  </div>

                  <p style={S.cardLabel}>AMOUNT TO SELL ({selected.id})</p>
                  <div style={S.amtRow}>
                    <input type="number" value={sellCoins}
                      onChange={e => setSellCoins(e.target.value)}
                      placeholder="0.000000"
                      style={{ flex:1,background:'none',border:'none',outline:'none',
                               fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:'#f0f0f8' }} />
                    <button onClick={() => setSellCoins(holdings[selected.id].amount.toFixed(6))}
                      style={{ background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.3)',
                               borderRadius:8,padding:'6px 10px',color:'#ef4444',
                               fontSize:11,fontWeight:700,cursor:'pointer' }}>
                      MAX
                    </button>
                  </div>

                  {sellCoins && prices[selected.id] && (
                    <div style={{ background:'rgba(239,68,68,0.08)',borderRadius:10,
                                   padding:'10px 14px',marginBottom:14,marginTop:10 }}>
                      <p style={{ color:'#ef4444',fontSize:13 }}>
                        You receive ≈ ₹{(parseFloat(sellCoins) * prices[selected.id].price * usdToInr * 0.99).toLocaleString('en-IN',{maximumFractionDigits:0})}
                        <span style={{ color:'#555570',fontSize:11 }}> (after 1% spread)</span>
                      </p>
                    </div>
                  )}

                  <button onClick={handleSell} disabled={txLoading||!sellCoins}
                    style={{ ...S.sellBtn, opacity:txLoading||!sellCoins?0.5:1 }}>
                    {txLoading ? '⏳ Processing...' : `Sell ${selected.id} →`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── PORTFOLIO TAB ── */}
        {tab === 'portfolio' && (
          <div>
            {/* Summary */}
            <div style={{ ...S.card,marginBottom:14,
                           background:'linear-gradient(135deg,rgba(240,180,41,0.08),rgba(240,180,41,0.03))',
                           border:'1px solid rgba(240,180,41,0.2)' }}>
              <p style={{ color:'rgba(240,180,41,0.7)',fontSize:10,fontWeight:700,letterSpacing:1 }}>
                TOTAL PORTFOLIO VALUE
              </p>
              <p style={{ fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:32,
                           color:'#f0b429',marginTop:6 }}>
                ₹{portfolioStats.currentValue.toLocaleString('en-IN',{maximumFractionDigits:0})}
              </p>
              <div style={{ display:'flex',gap:16,marginTop:12,paddingTop:12,
                             borderTop:'1px solid rgba(240,180,41,0.15)' }}>
                <div>
                  <p style={{ color:'#555570',fontSize:10 }}>INVESTED</p>
                  <p style={{ color:'#f0f0f8',fontWeight:700,fontSize:14,marginTop:2 }}>
                    ₹{portfolioStats.totalInvested.toLocaleString('en-IN',{maximumFractionDigits:0})}
                  </p>
                </div>
                <div>
                  <p style={{ color:'#555570',fontSize:10 }}>P&L</p>
                  <p style={{ color:clr(portfolioPnL),fontWeight:700,fontSize:14,marginTop:2 }}>
                    {portfolioPnL>=0?'+':''}₹{portfolioPnL.toLocaleString('en-IN',{maximumFractionDigits:0})}
                  </p>
                </div>
                <div>
                  <p style={{ color:'#555570',fontSize:10 }}>RETURN</p>
                  <p style={{ color:clr(portfolioPnLPct),fontWeight:700,fontSize:14,marginTop:2 }}>
                    {fmtPct(portfolioPnLPct)}
                  </p>
                </div>
              </div>
            </div>

            {/* Holdings list */}
            {Object.keys(holdings).length === 0 ? (
              <div style={{ textAlign:'center',padding:'60px 0',color:'#555570' }}>
                <p style={{ fontSize:48,marginBottom:12 }}>💼</p>
                <p style={{ color:'#8888a8',fontWeight:600,fontSize:16 }}>Empty Portfolio</p>
                <p style={{ fontSize:13,marginTop:6 }}>Go to the Buy tab to get started</p>
                <button onClick={() => setTab('buy')}
                  style={{ ...S.buyBtn,marginTop:20,width:'auto',padding:'12px 24px' }}>
                  Buy Crypto →
                </button>
              </div>
            ) : (
              COINS.filter(c => holdings[c.id]).map(coin => {
                const h = holdings[coin.id];
                const p = prices[coin.id];
                if (!p) return null;
                const currentVal = h.amount * p.price * usdToInr;
                const pnl        = currentVal - h.totalInvested;
                const pnlPct     = h.totalInvested > 0 ? (pnl/h.totalInvested)*100 : 0;
                return (
                  <div key={coin.id} style={S.coinRow}>
                    <div style={{ ...S.coinIcon, background:`${coin.color}22`, color:coin.color }}>
                      {coin.icon}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex',justifyContent:'space-between' }}>
                        <div>
                          <p style={{ color:'#f0f0f8',fontWeight:700,fontSize:14 }}>{coin.name}</p>
                          <p style={{ color:'#555570',fontSize:11,marginTop:2 }}>
                            {h.amount.toFixed(6)} {coin.id}
                          </p>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <p style={{ color:'#f0f0f8',fontWeight:800,fontSize:14 }}>
                            ₹{currentVal.toLocaleString('en-IN',{maximumFractionDigits:0})}
                          </p>
                          <p style={{ color:clr(pnlPct),fontSize:12,fontWeight:600,marginTop:2 }}>
                            {pnl>=0?'+':''}₹{pnl.toLocaleString('en-IN',{maximumFractionDigits:0})} ({fmtPct(pnlPct)})
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:          { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  header:        { display:'flex',alignItems:'center',gap:14,padding:'52px 16px 12px',background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)' },
  back:          { background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' },
  title:         { fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8' },
  liveBadge:     { background:'rgba(16,185,129,0.12)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:8,padding:'4px 10px',color:'#10b981',fontSize:10,fontWeight:700 },
  portfolioBanner:{ background:'rgba(240,180,41,0.06)',borderTop:'1px solid rgba(240,180,41,0.12)',padding:'12px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer' },
  tabs:          { display:'flex',gap:6,padding:'10px 16px',background:'#0a0a0f',position:'sticky' as const,top:0,zIndex:10 },
  tab:           { flex:1,padding:'8px 0',borderRadius:10,fontSize:11,fontWeight:600,cursor:'pointer',background:'#16161f',border:'1px solid rgba(255,255,255,0.06)',color:'#555570',whiteSpace:'nowrap' as const },
  tabOn:         { background:'#f0b429',border:'1px solid #f0b429',color:'#000' },
  searchInput:   { width:'100%',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px',fontSize:14,color:'#f0f0f8',outline:'none',marginBottom:12,fontFamily:'inherit',boxSizing:'border-box' as const },
  coinRow:       { background:'#16161f',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'14px',display:'flex',alignItems:'center',gap:12,marginBottom:10 },
  coinIcon:      { width:44,height:44,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:18,flexShrink:0 },
  card:          { background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',borderRadius:18,padding:20,marginBottom:14 },
  cardLabel:     { color:'#555570',fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:10 },
  amtRow:        { display:'flex',alignItems:'center',gap:8,background:'#1e1e2a',borderRadius:14,padding:'12px 16px',marginBottom:12,border:'1px solid rgba(255,255,255,0.07)' },
  buyBtn:        { width:'100%',padding:'15px',background:'linear-gradient(135deg,#10b981,#059669)',border:'none',borderRadius:14,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',fontFamily:'inherit' },
  sellBtn:       { width:'100%',padding:'15px',background:'linear-gradient(135deg,#ef4444,#dc2626)',border:'none',borderRadius:14,color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',fontFamily:'inherit' },
  toast:         { position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.14)',borderRadius:14,padding:'12px 20px',fontSize:14,fontWeight:600,color:'#f0f0f8',zIndex:999,whiteSpace:'nowrap' as const },
};
