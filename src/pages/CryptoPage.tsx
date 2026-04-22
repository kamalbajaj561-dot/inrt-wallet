import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import '../styles/theme.css';

// PLACEHOLDER: get from openexchangerates.org
const OER_KEY = import.meta.env.VITE_OER_KEY || 'YOUR_OER_KEY';

const COINS = [
  { id:'BTC', name:'Bitcoin',   sym:'BTCUSDT',  color:'#f7931a', icon:'₿' },
  { id:'ETH', name:'Ethereum',  sym:'ETHUSDT',  color:'#627eea', icon:'Ξ' },
  { id:'BNB', name:'BNB',       sym:'BNBUSDT',  color:'#f3ba2f', icon:'B' },
  { id:'SOL', name:'Solana',    sym:'SOLUSDT',  color:'#9945ff', icon:'◎' },
  { id:'XRP', name:'XRP',       sym:'XRPUSDT',  color:'#346aa9', icon:'✕' },
  { id:'DOGE',name:'Dogecoin',  sym:'DOGEUSDT', color:'#c2a633', icon:'Ð' },
  { id:'ADA', name:'Cardano',   sym:'ADAUSDT',  color:'#0d1e2d', icon:'₳' },
  { id:'MATIC',name:'Polygon',  sym:'MATICUSDT',color:'#8247e5', icon:'⬡' },
  { id:'AVAX',name:'Avalanche', sym:'AVAXUSDT', color:'#e84142', icon:'▲' },
  { id:'DOT', name:'Polkadot',  sym:'DOTUSDT',  color:'#e6007a', icon:'●' },
];

async function fetchPrice(sym: string) {
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`,{signal:AbortSignal.timeout(6000)});
    const d = await r.json();
    if(d.code) return null;
    return { price:parseFloat(d.lastPrice), change:parseFloat(d.priceChange), pct:parseFloat(d.priceChangePercent), high:parseFloat(d.highPrice), low:parseFloat(d.lowPrice), vol:parseFloat(d.quoteVolume) };
  } catch { return null; }
}

export default function CryptoPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [tab,      setTab]      = useState<'market'|'buy'|'sell'|'portfolio'>('market');
  const [prices,   setPrices]   = useState<Record<string,any>>({});
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(COINS[0]);
  const [buyAmt,   setBuyAmt]   = useState('');
  const [sellAmt,  setSellAmt]  = useState('');
  const [holdings, setHoldings] = useState<Record<string,any>>({});
  const [txLoad,   setTxLoad]   = useState(false);
  const [toast,    setToast]    = useState('');
  const [usdInr,   setUsdInr]   = useState(83.5);
  const [search,   setSearch]   = useState('');

  const bal = userProfile?.balance || 0;
  const showToast = (m: string) => { setToast(m); setTimeout(()=>setToast(''),3000); };

  useEffect(() => {
    if(OER_KEY !== 'YOUR_OER_KEY') {
      fetch(`https://openexchangerates.org/api/latest.json?app_id=${OER_KEY}&symbols=INR`)
        .then(r=>r.json()).then(d=>{ if(d.rates?.INR) setUsdInr(d.rates.INR); }).catch(()=>{});
    }
  },[]);

  useEffect(() => {
    if(!user) return;
    getDoc(doc(db,'users',user.uid)).then(snap=>{
      if(snap.exists()) setHoldings(snap.data()?.cryptoHoldings||{});
    });
  },[user]);

  const loadPrices = useCallback(async () => {
    const results = await Promise.all(COINS.map(async c => [c.id, await fetchPrice(c.sym)]));
    setPrices(Object.fromEntries(results.filter(([,v])=>v)));
    setLoading(false);
  },[]);

  useEffect(() => {
    loadPrices();
    const t = setInterval(loadPrices, 30000);
    return () => clearInterval(t);
  },[loadPrices]);

  const fmtUSD = (n:number) => n<0.01?`$${n.toFixed(6)}`:n<1?`$${n.toFixed(4)}`:`$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtINR = (n:number) => `₹${(n*usdInr).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
  const clr    = (n:number) => n>=0?'#00d68f':'#ff4d6a';

  const handleBuy = async () => {
    const amt = parseFloat(buyAmt);
    if(!amt||amt<10) return showToast('Minimum ₹10');
    if(amt>bal) return showToast(`Insufficient balance`);
    const p = prices[selected.id];
    if(!p) return showToast('Price unavailable');
    const priceINR = p.price * usdInr;
    const coinsGet = amt / priceINR;
    const existing = holdings[selected.id];
    const newAmt   = (existing?.amount||0)+coinsGet;
    const newInv   = (existing?.totalInvested||0)+amt;
    const newH     = { ...holdings, [selected.id]:{ coinId:selected.id, amount:newAmt, avgBuyPrice:newInv/newAmt, totalInvested:newInv } };
    setTxLoad(true);
    try {
      await updateDoc(doc(db,'users',user!.uid),{ balance:increment(-amt), cryptoHoldings:newH, rewardPoints:increment(Math.floor(amt/10)), updatedAt:serverTimestamp() });
      await addDoc(collection(db,'transactions'),{ uid:user!.uid,type:'debit',amount:amt,note:`Bought ${coinsGet.toFixed(6)} ${selected.id}`,cat:'crypto',status:'success',createdAt:serverTimestamp() });
      setHoldings(newH); await refreshProfile();
      showToast(`✅ Bought ${coinsGet.toFixed(6)} ${selected.id}`);
      setBuyAmt('');
    } catch(e:any){ showToast(e.message||'Failed'); }
    setTxLoad(false);
  };

  const handleSell = async () => {
    const g = parseFloat(sellAmt);
    const h = holdings[selected.id];
    if(!g||!h||g>h.amount) return showToast(`Insufficient ${selected.id}`);
    const p = prices[selected.id];
    if(!p) return showToast('Price unavailable');
    const proceeds = Math.floor(g * p.price * usdInr * 0.99);
    const newAmt   = h.amount - g;
    const newH     = { ...holdings };
    if(newAmt < 0.000001) delete newH[selected.id];
    else newH[selected.id] = { ...h, amount:newAmt, totalInvested:h.totalInvested*(newAmt/h.amount) };
    setTxLoad(true);
    try {
      await updateDoc(doc(db,'users',user!.uid),{ balance:increment(proceeds), cryptoHoldings:newH, updatedAt:serverTimestamp() });
      await addDoc(collection(db,'transactions'),{ uid:user!.uid,type:'credit',amount:proceeds,note:`Sold ${g} ${selected.id}`,cat:'crypto',status:'success',createdAt:serverTimestamp() });
      setHoldings(newH); await refreshProfile();
      showToast(`✅ Sold for ₹${proceeds.toLocaleString('en-IN')}`);
      setSellAmt('');
    } catch(e:any){ showToast(e.message||'Failed'); }
    setTxLoad(false);
  };

  const portTotals = Object.entries(holdings).reduce((acc,[id,h]:any)=>{
    const p=prices[id]; if(!p) return acc;
    acc.val+=h.amount*p.price*usdInr; acc.inv+=h.totalInvested; return acc;
  },{val:0,inv:0});
  const portPnL    = portTotals.val - portTotals.inv;
  const portPnLPct = portTotals.inv>0?(portPnL/portTotals.inv)*100:0;

  const filtered = COINS.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase())||c.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)'}}>
      {toast&&<div className="toast">{toast}</div>}

      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:10}}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <div style={{flex:1}}>
            <h1 className="page-title">Crypto</h1>
            <p style={{color:'var(--t3)',fontSize:11,marginTop:1}}>1 USD = ₹{usdInr.toFixed(1)}</p>
          </div>
          <span style={{background:'rgba(0,214,143,0.12)',border:'1px solid rgba(0,214,143,0.25)',borderRadius:8,padding:'4px 10px',color:'var(--green)',fontSize:10,fontWeight:700}}>● LIVE</span>
        </div>

        {portTotals.val > 0 && (
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid var(--b1)',borderRadius:'var(--r2)',padding:'12px 16px',marginBottom:10,cursor:'pointer',display:'flex',justifyContent:'space-between'}} onClick={()=>setTab('portfolio')}>
            <div>
              <p style={{color:'var(--t3)',fontSize:10,fontWeight:700,letterSpacing:1}}>PORTFOLIO</p>
              <p style={{color:'var(--gold)',fontWeight:800,fontSize:18,marginTop:3,fontFamily:'var(--f-display)'}}>₹{portTotals.val.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
            </div>
            <div style={{textAlign:'right'}}>
              <p style={{color:clr(portPnL),fontWeight:700,fontSize:14}}>{portPnL>=0?'+':''}₹{portPnL.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
              <p style={{color:clr(portPnLPct),fontSize:12}}>{portPnLPct>=0?'+':''}{portPnLPct.toFixed(2)}%</p>
            </div>
          </div>
        )}
      </div>

      <div style={{display:'flex',gap:6,padding:'10px 16px 0',position:'sticky',top:0,background:'var(--bg)',zIndex:10}}>
        {(['market','buy','sell','portfolio']as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{flex:1,padding:'8px 0',borderRadius:10,fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',
                     background:tab===t?'var(--teal)':'var(--bg-card)',border:`1px solid ${tab===t?'var(--teal)':'var(--b1)'}`,
                     color:tab===t?'#000':'var(--t3)'}}>
            {t==='market'?'📊 Market':t==='buy'?'🟢 Buy':t==='sell'?'🔴 Sell':'💼 Portfolio'}
          </button>
        ))}
      </div>

      <div style={{padding:'12px 16px 90px'}}>

        {/* ── MARKET ── */}
        {tab==='market'&&(
          <>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search coins…"
              style={{width:'100%',background:'var(--bg-elevated)',border:'1px solid var(--b1)',borderRadius:'var(--r1)',padding:'11px 14px',fontSize:14,color:'var(--t1)',outline:'none',fontFamily:'inherit',boxSizing:'border-box',marginBottom:12}}/>
            {loading?[1,2,3,4,5,6].map(i=><div key={i} className="shimmer" style={{height:68,borderRadius:'var(--r2)',marginBottom:10}}/>):
              filtered.map(coin=>{
                const p=prices[coin.id];
                return(
                  <div key={coin.id} onClick={()=>{setSelected(coin);setTab('buy');}}
                    style={{background:holdings[coin.id]?'rgba(0,229,204,0.04)':'var(--bg-card)',border:`1px solid ${holdings[coin.id]?'rgba(0,229,204,0.15)':'var(--b1)'}`,borderRadius:'var(--r2)',padding:'14px',display:'flex',alignItems:'center',gap:12,marginBottom:10,cursor:'pointer'}}>
                    <div style={{width:44,height:44,borderRadius:'var(--r1)',background:`${coin.color}22`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:18,color:coin.color,flexShrink:0}}>{coin.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div>
                          <p style={{color:'var(--t1)',fontWeight:700,fontSize:14}}>{coin.name}</p>
                          <p style={{color:'var(--t3)',fontSize:10,marginTop:2}}>{coin.id}{holdings[coin.id]&&<span style={{color:'var(--teal)',marginLeft:6}}>· In portfolio</span>}</p>
                        </div>
                        {p?<div style={{textAlign:'right'}}>
                          <p style={{color:'var(--t1)',fontWeight:800,fontSize:14}}>{fmtUSD(p.price)}</p>
                          <p style={{color:clr(p.pct),fontSize:12,fontWeight:600,marginTop:2}}>{p.pct>=0?'+':''}{p.pct.toFixed(2)}%</p>
                        </div>:<p style={{color:'var(--t3)',fontSize:12}}>…</p>}
                      </div>
                    </div>
                  </div>
                );
              })
            }
          </>
        )}

        {/* ── BUY ── */}
        {tab==='buy'&&(
          <div className="card">
            <p className="s-label">SELECT COIN</p>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
              {COINS.slice(0,6).map(c=>(
                <button key={c.id} onClick={()=>setSelected(c)}
                  style={{padding:'7px 12px',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,cursor:'pointer',background:selected.id===c.id?`${c.color}22`:'var(--bg-elevated)',border:`1px solid ${selected.id===c.id?c.color:'var(--b1)'}`,color:selected.id===c.id?c.color:'var(--t2)'}}>
                  {c.id}
                </button>
              ))}
            </div>
            {prices[selected.id]&&(
              <div style={{background:'var(--bg-elevated)',borderRadius:'var(--r1)',padding:'12px 14px',marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <p style={{color:'var(--t3)',fontSize:11}}>{selected.name}</p>
                    <p style={{color:'var(--t1)',fontWeight:800,fontSize:18,marginTop:2}}>{fmtUSD(prices[selected.id].price)}</p>
                    <p style={{color:'var(--t3)',fontSize:11,marginTop:2}}>≈ {fmtINR(prices[selected.id].price)}</p>
                  </div>
                  <span style={{color:clr(prices[selected.id].pct),fontWeight:700,fontSize:14}}>{prices[selected.id].pct>=0?'+':''}{prices[selected.id].pct.toFixed(2)}%</span>
                </div>
              </div>
            )}
            <p className="s-label">AMOUNT IN ₹</p>
            <div className="amount-box" style={{marginBottom:12}}>
              <span style={{color:'var(--teal)',fontSize:22,fontWeight:700}}>₹</span>
              <input className="amount-input" type="number" placeholder="0" value={buyAmt} onChange={e=>setBuyAmt(e.target.value)}/>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
              {[100,500,1000,5000].map(a=>(
                <button key={a} onClick={()=>setBuyAmt(String(a))}
                  style={{padding:'7px 12px',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,cursor:'pointer',background:buyAmt===String(a)?'var(--teal-dim)':'var(--bg-elevated)',border:`1px solid ${buyAmt===String(a)?'var(--teal)':'var(--b1)'}`,color:buyAmt===String(a)?'var(--teal)':'var(--t2)'}}>
                  ₹{a}
                </button>
              ))}
            </div>
            {buyAmt&&prices[selected.id]&&(
              <div style={{background:'rgba(0,214,143,0.08)',borderRadius:'var(--r1)',padding:'10px 14px',marginBottom:14}}>
                <p style={{color:'var(--green)',fontSize:13}}>You get ≈ {(parseFloat(buyAmt)/(prices[selected.id].price*usdInr)).toFixed(6)} {selected.id}</p>
              </div>
            )}
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid var(--b1)',marginBottom:14}}>
              <span style={{color:'var(--t3)',fontSize:12}}>Wallet balance</span>
              <span style={{color:parseFloat(buyAmt)>bal?'var(--red)':'var(--green)',fontWeight:700,fontSize:12}}>₹{bal.toLocaleString('en-IN')}</span>
            </div>
            <button className="btn-primary" onClick={handleBuy} disabled={txLoad||!buyAmt} style={{opacity:txLoad||!buyAmt?0.5:1,background:'linear-gradient(135deg,#00d68f,#059669)'}}>
              {txLoad?'⏳ Processing…':`Buy ${selected.id} →`}
            </button>
          </div>
        )}

        {/* ── SELL ── */}
        {tab==='sell'&&(
          <div className="card">
            <p className="s-label">COIN TO SELL</p>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
              {COINS.filter(c=>holdings[c.id]).map(c=>(
                <button key={c.id} onClick={()=>setSelected(c)}
                  style={{padding:'7px 12px',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,cursor:'pointer',background:selected.id===c.id?`${c.color}22`:'var(--bg-elevated)',border:`1px solid ${selected.id===c.id?c.color:'var(--b1)'}`,color:selected.id===c.id?c.color:'var(--t2)'}}>
                  {c.id}
                </button>
              ))}
              {Object.keys(holdings).length===0&&<p style={{color:'var(--t3)',fontSize:13}}>No holdings. Buy first!</p>}
            </div>
            {holdings[selected.id]&&(
              <>
                <div style={{background:'var(--bg-elevated)',borderRadius:'var(--r1)',padding:'12px 14px',marginBottom:14}}>
                  <p style={{color:'var(--t3)',fontSize:11,marginBottom:4}}>Holdings</p>
                  <p style={{color:'var(--t1)',fontWeight:800,fontSize:16}}>{holdings[selected.id].amount.toFixed(6)} {selected.id}</p>
                  <p style={{color:'var(--t3)',fontSize:11,marginTop:2}}>Avg buy: {fmtUSD(holdings[selected.id].avgBuyPrice/usdInr)}</p>
                </div>
                <p className="s-label">AMOUNT TO SELL ({selected.id})</p>
                <div className="amount-box" style={{marginBottom:12}}>
                  <input className="amount-input" type="number" placeholder="0.000000" value={sellAmt} onChange={e=>setSellAmt(e.target.value)} style={{fontSize:22}}/>
                  <button onClick={()=>setSellAmt(holdings[selected.id].amount.toFixed(6))}
                    style={{background:'rgba(255,77,106,0.12)',border:'1px solid rgba(255,77,106,0.25)',borderRadius:'var(--r1)',padding:'6px 10px',color:'var(--red)',fontSize:11,fontWeight:700,cursor:'pointer'}}>MAX</button>
                </div>
                {sellAmt&&prices[selected.id]&&(
                  <div style={{background:'rgba(255,77,106,0.08)',borderRadius:'var(--r1)',padding:'10px 14px',marginBottom:14}}>
                    <p style={{color:'var(--red)',fontSize:13}}>You receive ≈ ₹{(parseFloat(sellAmt)*prices[selected.id].price*usdInr*0.99).toLocaleString('en-IN',{maximumFractionDigits:0})} <span style={{color:'var(--t3)',fontSize:11}}>(after 1% spread)</span></p>
                  </div>
                )}
                <button onClick={handleSell} disabled={txLoad||!sellAmt}
                  style={{width:'100%',padding:'15px',background:'linear-gradient(135deg,#ff4d6a,#dc2626)',border:'none',borderRadius:'var(--r2)',color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:txLoad||!sellAmt?0.5:1,fontFamily:'inherit'}}>
                  {txLoad?'⏳ Processing…':`Sell ${selected.id} →`}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── PORTFOLIO ── */}
        {tab==='portfolio'&&(
          <>
            <div className="card" style={{background:'rgba(244,185,66,0.05)',border:'1px solid rgba(244,185,66,0.15)',marginBottom:14}}>
              <p style={{color:'rgba(244,185,66,0.6)',fontSize:10,fontWeight:700,letterSpacing:1}}>TOTAL PORTFOLIO</p>
              <p style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:32,color:'var(--gold)',marginTop:6}}>₹{portTotals.val.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
              <div style={{display:'flex',gap:16,marginTop:12,paddingTop:12,borderTop:'1px solid rgba(244,185,66,0.1)'}}>
                {[{l:'INVESTED',v:`₹${portTotals.inv.toLocaleString('en-IN',{maximumFractionDigits:0})}`,c:'var(--t2)'},
                  {l:'P&L',v:`${portPnL>=0?'+':''}₹${portPnL.toLocaleString('en-IN',{maximumFractionDigits:0})}`,c:clr(portPnL)},
                  {l:'RETURN',v:`${portPnLPct>=0?'+':''}${portPnLPct.toFixed(1)}%`,c:clr(portPnLPct)},
                ].map(s=>(
                  <div key={s.l}>
                    <p style={{color:'var(--t3)',fontSize:10,fontWeight:700}}>{s.l}</p>
                    <p style={{color:s.c,fontWeight:700,fontSize:14,marginTop:2}}>{s.v}</p>
                  </div>
                ))}
              </div>
            </div>
            {Object.keys(holdings).length===0?(
              <div style={{textAlign:'center',padding:'60px 0'}}>
                <p style={{fontSize:48,marginBottom:12}}>💼</p>
                <p style={{color:'var(--t2)',fontWeight:600,fontSize:16}}>Empty Portfolio</p>
                <button className="btn-primary" style={{marginTop:20,background:'linear-gradient(135deg,#00d68f,#059669)'}} onClick={()=>setTab('buy')}>Buy Crypto →</button>
              </div>
            ):(
              COINS.filter(c=>holdings[c.id]).map(coin=>{
                const h=holdings[coin.id],p=prices[coin.id];
                if(!p) return null;
                const cv=h.amount*p.price*usdInr,pnl=cv-h.totalInvested,pnlPct=h.totalInvested>0?(pnl/h.totalInvested)*100:0;
                return(
                  <div key={coin.id} style={{background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r2)',padding:'14px',display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                    <div style={{width:44,height:44,borderRadius:'var(--r1)',background:`${coin.color}22`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:18,color:coin.color,flexShrink:0}}>{coin.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',justifyContent:'space-between'}}>
                        <div>
                          <p style={{color:'var(--t1)',fontWeight:700,fontSize:14}}>{coin.name}</p>
                          <p style={{color:'var(--t3)',fontSize:11,marginTop:2}}>{h.amount.toFixed(6)} {coin.id}</p>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <p style={{color:'var(--t1)',fontWeight:800,fontSize:14}}>₹{cv.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>
                          <p style={{color:clr(pnlPct),fontSize:12,fontWeight:600,marginTop:2}}>{pnl>=0?'+':''}₹{pnl.toLocaleString('en-IN',{maximumFractionDigits:0})} ({pnlPct>=0?'+':''}{pnlPct.toFixed(1)}%)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
