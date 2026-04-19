import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Free API: Yahoo Finance via allorigins proxy (no key needed)
const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const POPULAR_STOCKS = [
  { symbol: 'RELIANCE.NS', name: 'Reliance', sector: 'Energy' },
  { symbol: 'TCS.NS',      name: 'TCS',      sector: 'IT' },
  { symbol: 'INFY.NS',     name: 'Infosys',  sector: 'IT' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank',sector: 'Banking' },
  { symbol: 'ICICIBANK.NS',name: 'ICICI Bank',sector:'Banking' },
  { symbol: 'SBIN.NS',     name: 'SBI',      sector: 'Banking' },
  { symbol: 'WIPRO.NS',    name: 'Wipro',    sector: 'IT' },
  { symbol: 'BAJFINANCE.NS',name:'Bajaj Fin',sector:'Finance' },
  { symbol: 'TATAMOTORS.NS',name:'Tata Motors',sector:'Auto'},
  { symbol: 'ADANIPORTS.NS',name:'Adani Ports',sector:'Infra'},
  { symbol: 'AXISBANK.NS',  name:'Axis Bank', sector:'Banking'},
  { symbol: 'MARUTI.NS',    name:'Maruti',    sector:'Auto'},
];

const INDICES = [
  { symbol: '^NSEI',  name: 'NIFTY 50' },
  { symbol: '^BSESN', name: 'SENSEX' },
  { symbol: '^NSMIDCP',name:'NIFTY MidCap'},
];

async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price   = meta.regularMarketPrice || 0;
    const prev    = meta.chartPreviousClose || meta.previousClose || price;
    const change  = price - prev;
    const changePct = prev > 0 ? (change / prev) * 100 : 0;
    return { price, change, changePct, high: meta.regularMarketDayHigh, low: meta.regularMarketDayLow, volume: meta.regularMarketVolume };
  } catch { return null; }
}

export default function ShareMarketPage() {
  const navigate = useNavigate();
  const [tab,      setTab]     = useState<'market'|'watchlist'|'portfolio'>('market');
  const [quotes,   setQuotes]  = useState<Record<string,any>>({});
  const [indices,  setIndices] = useState<Record<string,any>>({});
  const [loading,  setLoading] = useState(true);
  const [search,   setSearch]  = useState('');
  const [watchlist,setWatchlist]=useState<string[]>(['RELIANCE.NS','TCS.NS','INFY.NS']);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [stockResults, indexResults] = await Promise.all([
      Promise.all(POPULAR_STOCKS.slice(0,8).map(async s => {
        const q = await fetchQuote(s.symbol);
        return [s.symbol, q];
      })),
      Promise.all(INDICES.map(async i => {
        const q = await fetchQuote(i.symbol);
        return [i.symbol, q];
      }))
    ]);
    setQuotes(Object.fromEntries(stockResults.filter(([,v])=>v)));
    setIndices(Object.fromEntries(indexResults.filter(([,v])=>v)));
    setLoading(false);
  };

  const filtered = POPULAR_STOCKS.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const fmt  = (n: number) => n?.toFixed(2) || '—';
  const fmtC = (n: number) => (n >= 0 ? '+' : '') + fmt(n);
  const green= (n: number) => n >= 0 ? '#10b981' : '#ef4444';

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <div>
          <h1 style={s.title}>Share Market</h1>
          <p style={{ color:'rgba(255,255,255,0.5)',fontSize:11 }}>NSE · BSE · Live Data</p>
        </div>
        <div style={{ background:'rgba(16,185,129,0.15)',border:'1px solid rgba(16,185,129,0.3)',
                       borderRadius:8,padding:'4px 10px' }}>
          <span style={{ color:'#10b981',fontSize:10,fontWeight:700 }}>● LIVE</span>
        </div>
      </div>

      {/* Indices Banner */}
      <div style={{ background:'#111118',padding:'12px 16px',display:'flex',gap:12,overflowX:'auto' as const }}>
        {INDICES.map(idx => {
          const q = indices[idx.symbol];
          return (
            <div key={idx.symbol} style={{ flexShrink:0,background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',
                                            borderRadius:12,padding:'10px 16px',minWidth:130 }}>
              <p style={{ color:'#8888a8',fontSize:10,fontWeight:700,marginBottom:4 }}>{idx.name}</p>
              {q ? <>
                <p style={{ color:'#f0f0f8',fontWeight:800,fontSize:16 }}>
                  {q.price.toLocaleString('en-IN', {maximumFractionDigits:0})}
                </p>
                <p style={{ color:green(q.changePct),fontSize:11,fontWeight:600,marginTop:2 }}>
                  {fmtC(q.change)} ({fmtC(q.changePct)}%)
                </p>
              </> : <div style={{ color:'#555570',fontSize:12 }}>Loading...</div>}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex',padding:'12px 16px 0',gap:8 }}>
        {(['market','watchlist','portfolio'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ flex:1,padding:'9px 0',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer',
                     background:tab===t?'#f0b429':'#1e1e2a',
                     border:`1px solid ${tab===t?'#f0b429':'rgba(255,255,255,0.07)'}`,
                     color:tab===t?'#000':'#8888a8' }}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ padding:'14px 16px',paddingBottom:90 }}>
        {/* Search */}
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Search stocks..."
          style={{ width:'100%',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',
                   borderRadius:12,padding:'12px 14px',fontSize:14,color:'#f0f0f8',
                   outline:'none',marginBottom:14,fontFamily:'DM Sans, sans-serif',boxSizing:'border-box' as const }}
        />

        {tab === 'market' && (
          <>
            <p style={{ color:'#8888a8',fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:10 }}>
              TOP STOCKS
            </p>
            {loading ? (
              [1,2,3,4,5].map(i=>(
                <div key={i} style={{ background:'#1e1e2a',borderRadius:14,height:68,
                                       marginBottom:10,animation:'shimmer 1.5s infinite' }} />
              ))
            ) : (
              filtered.map(stock => {
                const q = quotes[stock.symbol];
                const inWatch = watchlist.includes(stock.symbol);
                return (
                  <div key={stock.symbol} style={s.stockRow}>
                    <div style={{ ...s.stockIcon,
                      background:`${stock.sector==='IT'?'rgba(0,212,255,0.1)':
                                   stock.sector==='Banking'?'rgba(240,180,41,0.1)':
                                   'rgba(139,92,246,0.1)'}` }}>
                      <span style={{ fontSize:13,fontWeight:800,
                        color:stock.sector==='IT'?'#00d4ff':
                             stock.sector==='Banking'?'#f0b429':'#8b5cf6' }}>
                        {stock.name.slice(0,2).toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
                        <div>
                          <p style={{ color:'#f0f0f8',fontWeight:700,fontSize:14 }}>{stock.name}</p>
                          <p style={{ color:'#555570',fontSize:10,marginTop:2 }}>{stock.sector} · NSE</p>
                        </div>
                        {q && (
                          <div style={{ textAlign:'right' }}>
                            <p style={{ color:'#f0f0f8',fontWeight:800,fontSize:15 }}>
                              ₹{q.price.toLocaleString('en-IN',{maximumFractionDigits:2})}
                            </p>
                            <p style={{ color:green(q.changePct),fontSize:11,fontWeight:600,marginTop:2 }}>
                              {fmtC(q.changePct)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={()=>setWatchlist(w=>inWatch?w.filter(x=>x!==stock.symbol):[...w,stock.symbol])}
                      style={{ background:'none',border:'none',fontSize:18,cursor:'pointer',paddingLeft:8,
                               color:inWatch?'#f0b429':'#333350' }}>
                      ★
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}

        {tab === 'watchlist' && (
          <div>
            {watchlist.length === 0 ? (
              <div style={{ textAlign:'center',padding:'60px 0',color:'#555570' }}>
                <p style={{ fontSize:36 }}>⭐</p>
                <p style={{ marginTop:12,fontWeight:600,color:'#8888a8' }}>No stocks in watchlist</p>
                <p style={{ fontSize:12,marginTop:4 }}>Tap ★ on any stock to add it</p>
              </div>
            ) : (
              POPULAR_STOCKS.filter(s=>watchlist.includes(s.symbol)).map(stock=>{
                const q = quotes[stock.symbol];
                return (
                  <div key={stock.symbol} style={s.stockRow}>
                    <div style={{ flex:1 }}>
                      <p style={{ color:'#f0f0f8',fontWeight:700,fontSize:14 }}>{stock.name}</p>
                      <p style={{ color:'#555570',fontSize:11,marginTop:2 }}>{stock.symbol}</p>
                    </div>
                    {q && (
                      <div style={{ textAlign:'right' }}>
                        <p style={{ color:'#f0f0f8',fontWeight:800,fontSize:15 }}>
                          ₹{q.price.toLocaleString('en-IN',{maximumFractionDigits:2})}
                        </p>
                        <p style={{ color:green(q.changePct),fontSize:11,fontWeight:600 }}>
                          {fmtC(q.changePct)}%
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'portfolio' && (
          <div style={{ textAlign:'center',padding:'60px 0' }}>
            <div style={{ fontSize:48,marginBottom:16 }}>📈</div>
            <p style={{ color:'#f0f0f8',fontWeight:700,fontSize:18,marginBottom:8 }}>
              Portfolio Coming Soon
            </p>
            <p style={{ color:'#8888a8',fontSize:14,lineHeight:1.6 }}>
              Track your stocks, mutual funds and SIPs in one place.
              <br />Connect your demat account to get started.
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background:  #1a1a24; }
          50%{ background:  #222230; }
          100%{ background: #1a1a24; }
        }
      `}</style>
    </div>
  );
}

const s: Record<string,React.CSSProperties> = {
  page:     { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  header:   { display:'flex',alignItems:'center',gap:14,padding:'52px 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#111118)' },
  back:     { background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' },
  title:    { fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8' },
  stockRow: { background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,padding:'14px',display:'flex',alignItems:'center',gap:12,marginBottom:10 },
  stockIcon:{ width:44,height:44,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 },
};
