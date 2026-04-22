import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';
// PLACEHOLDER: get key from alphavantage.co
const AV_KEY = import.meta.env.VITE_ALPHA_VANTAGE_KEY || 'YOUR_ALPHA_VANTAGE_KEY';
const STOCKS = [
  {symbol:'RELIANCE.NS',name:'Reliance',sector:'Energy'},
  {symbol:'TCS.NS',name:'TCS',sector:'IT'},
  {symbol:'INFY.NS',name:'Infosys',sector:'IT'},
  {symbol:'HDFCBANK.NS',name:'HDFC Bank',sector:'Banking'},
  {symbol:'ICICIBANK.NS',name:'ICICI Bank',sector:'Banking'},
  {symbol:'SBIN.NS',name:'SBI',sector:'Banking'},
  {symbol:'WIPRO.NS',name:'Wipro',sector:'IT'},
  {symbol:'BAJFINANCE.NS',name:'Bajaj Fin',sector:'Finance'},
];
const INDICES = [{symbol:'^NSEI',name:'NIFTY 50'},{symbol:'^BSESN',name:'SENSEX'}];
async function fetchQuote(symbol:string) {
  try {
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const r=await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,{signal:AbortSignal.timeout(7000)});
    const d=await r.json();
    const meta=d?.chart?.result?.[0]?.meta;
    if(!meta)return null;
    const price=meta.regularMarketPrice||0,prev=meta.chartPreviousClose||price;
    const change=price-prev,pct=prev>0?(change/prev)*100:0;
    return {price,change,pct,high:meta.regularMarketDayHigh,low:meta.regularMarketDayLow};
  }catch{return null;}
}
export default function ShareMarket() {
  const navigate = useNavigate();
  const [quotes,setQuotes]=useState<Record<string,any>>({});
  const [indices,setIndices]=useState<Record<string,any>>({});
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<'market'|'watchlist'>('market');
  const [watch,setWatch]=useState<string[]>(['RELIANCE.NS','TCS.NS']);
  const [search,setSearch]=useState('');
  useEffect(()=>{
    (async()=>{
      const [sq,si]=await Promise.all([
        Promise.all(STOCKS.map(async s=>[s.symbol,await fetchQuote(s.symbol)])),
        Promise.all(INDICES.map(async i=>[i.symbol,await fetchQuote(i.symbol)])),
      ]);
      setQuotes(Object.fromEntries(sq.filter(([,v])=>v)));
      setIndices(Object.fromEntries(si.filter(([,v])=>v)));
      setLoading(false);
    })();
  },[]);
  const clr=(n:number)=>n>=0?'#00d68f':'#ff4d6a';
  const fmt=(n:number)=>n?.toFixed(2)||'—';
  const filtered=STOCKS.filter(s=>!search||s.name.toLowerCase().includes(search.toLowerCase())||s.symbol.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)'}}>
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Share Market</h1>
          <span style={{background:'rgba(0,214,143,0.12)',border:'1px solid rgba(0,214,143,0.25)',borderRadius:8,padding:'4px 10px',color:'var(--green)',fontSize:10,fontWeight:700}}>● LIVE</span>
        </div>
        <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:8}}>
          {INDICES.map(idx=>{const q=indices[idx.symbol];return(
            <div key={idx.symbol} style={{flexShrink:0,background:'var(--bg-elevated)',border:'1px solid var(--b1)',borderRadius:'var(--r2)',padding:'10px 16px',minWidth:130}}>
              <p style={{color:'var(--t3)',fontSize:10,fontWeight:700,marginBottom:4}}>{idx.name}</p>
              {q?<><p style={{color:'var(--t1)',fontWeight:800,fontSize:16}}>{q.price.toLocaleString('en-IN',{maximumFractionDigits:0})}</p><p style={{color:clr(q.pct),fontSize:11,fontWeight:600,marginTop:2}}>{q.pct>=0?'+':''}{fmt(q.pct)}%</p></>:<p style={{color:'var(--t3)',fontSize:12}}>Loading…</p>}
            </div>
          );})}
        </div>
      </div>
      <div style={{display:'flex',gap:8,padding:'10px 16px 0'}}>
        {(['market','watchlist']as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'9px 0',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',background:tab===t?'var(--teal)':'var(--bg-card)',border:`1px solid ${tab===t?'var(--teal)':'var(--b1)'}`,color:tab===t?'#000':'var(--t2)'}}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>
      <div style={{padding:'12px 16px 90px'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search stocks…"
          style={{width:'100%',background:'var(--bg-elevated)',border:'1px solid var(--b1)',borderRadius:'var(--r1)',padding:'11px 14px',fontSize:14,color:'var(--t1)',outline:'none',fontFamily:'inherit',boxSizing:'border-box',marginBottom:12}}/>
        {(tab==='market'?filtered:STOCKS.filter(s=>watch.includes(s.symbol))).map(stock=>{
          const q=quotes[stock.symbol],inW=watch.includes(stock.symbol);
          return(
            <div key={stock.symbol} style={{background:inW?'rgba(0,229,204,0.04)':'var(--bg-card)',border:`1px solid ${inW?'rgba(0,229,204,0.15)':'var(--b1)'}`,borderRadius:'var(--r2)',padding:'14px',display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
              <div style={{width:44,height:44,borderRadius:'var(--r1)',background:'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:13,color:'var(--teal)',flexShrink:0}}>
                {stock.name.slice(0,2).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <p style={{color:'var(--t1)',fontWeight:700,fontSize:14}}>{stock.name}</p>
                    <p style={{color:'var(--t3)',fontSize:10,marginTop:2}}>{stock.sector} · NSE</p>
                  </div>
                  {q?(<div style={{textAlign:'right'}}>
                    <p style={{color:'var(--t1)',fontWeight:800,fontSize:14}}>₹{q.price.toLocaleString('en-IN',{maximumFractionDigits:2})}</p>
                    <p style={{color:clr(q.pct),fontSize:11,fontWeight:600,marginTop:2}}>{q.pct>=0?'+':''}{fmt(q.pct)}%</p>
                  </div>):<p style={{color:'var(--t3)',fontSize:12}}>…</p>}
                </div>
              </div>
              <button onClick={()=>setWatch(w=>inW?w.filter(x=>x!==stock.symbol):[...w,stock.symbol])}
                style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:inW?'var(--gold)':'var(--t3)',paddingLeft:6}}>★</button>
            </div>
          );
        })}
        {loading&&[1,2,3,4].map(i=><div key={i} className="shimmer" style={{height:70,borderRadius:'var(--r2)',marginBottom:10}}/>)}
      </div>
    </div>
  );
}
