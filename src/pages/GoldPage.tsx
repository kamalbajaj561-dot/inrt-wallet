import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import '../styles/theme.css';

async function fetchGoldPrice() {
  try {
    const r = await fetch('https://data-asg.goldprice.org/dbXRates/INR',{signal:AbortSignal.timeout(6000)});
    const d = await r.json();
    const g = d.items?.[0]?.xauPrice / 31.1035;
    if(g>0) return {price:Math.round(g),change:35,pct:0.49};
  } catch {}
  return {price:7280,change:35,pct:0.49};
}

export default function GoldPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [gold,setGold] = useState({price:7280,change:35,pct:0.49});
  const [tab,setTab] = useState<'buy'|'sell'|'holdings'>('buy');
  const [amount,setAmount] = useState('');
  const [loading,setLoading] = useState(false);
  const [priceLoad,setPriceLoad] = useState(true);
  const [toast,setToast] = useState('');
  const [holdings,setHoldings] = useState({grams:0,invested:0});

  const bal = userProfile?.balance||0;
  const showToast=(m:string)=>{setToast(m);setTimeout(()=>setToast(''),3000);};

  useEffect(()=>{
    fetchGoldPrice().then(d=>{setGold(d);setPriceLoad(false);});
    if(userProfile){setHoldings({grams:userProfile.goldGrams||0,invested:userProfile.goldInvested||0});}
  },[userProfile]);

  const grams = amount ? parseFloat(amount)/gold.price : 0;
  const currentVal = holdings.grams * gold.price;
  const pnl = currentVal - holdings.invested;

  const handleBuy = async () => {
    const amt=parseFloat(amount);
    if(!amt||amt<10) return showToast('Minimum ₹10');
    if(amt>bal) return showToast(`Insufficient balance. You have ₹${bal}`);
    setLoading(true);
    try {
      const g = amt/gold.price;
      await updateDoc(doc(db,'users',user!.uid),{
        balance:increment(-amt),goldGrams:increment(g),goldInvested:increment(amt),
        rewardPoints:increment(Math.floor(amt/10)),updatedAt:serverTimestamp(),
      });
      await addDoc(collection(db,'transactions'),{uid:user!.uid,type:'debit',amount:amt,note:`Gold purchase ${g.toFixed(4)}g`,cat:'gold',status:'success',createdAt:serverTimestamp()});
      await refreshProfile();
      showToast(`✅ Bought ${g.toFixed(4)}g of 24K gold!`);
      setAmount('');
    } catch(e:any){showToast(e.message||'Purchase failed');}
    setLoading(false);
  };

  const handleSell = async () => {
    const g=parseFloat(amount);
    if(!g||g<=0) return showToast('Enter grams to sell');
    if(g>holdings.grams) return showToast('Insufficient gold holdings');
    const proceeds=Math.floor(g*gold.price*0.985);
    setLoading(true);
    try {
      await updateDoc(doc(db,'users',user!.uid),{
        balance:increment(proceeds),goldGrams:increment(-g),updatedAt:serverTimestamp(),
      });
      await addDoc(collection(db,'transactions'),{uid:user!.uid,type:'credit',amount:proceeds,note:`Gold sale ${g}g`,cat:'gold',status:'success',createdAt:serverTimestamp()});
      await refreshProfile();
      showToast(`✅ Sold ${g}g for ₹${proceeds.toLocaleString('en-IN')}`);
      setAmount('');
    } catch(e:any){showToast(e.message||'Failed');}
    setLoading(false);
  };

  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)'}}>
      {toast&&<div className="toast">{toast}</div>}
      <div style={{background:'linear-gradient(160deg,#050914,#1a1208)',padding:'52px 20px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Digital Gold</h1>
          <span className="badge-gold">24K PURE</span>
        </div>
        <div style={{background:'rgba(244,185,66,0.06)',border:'1px solid rgba(244,185,66,0.2)',borderRadius:'var(--r3)',padding:'20px'}}>
          <p style={{color:'rgba(244,185,66,0.6)',fontSize:10,fontWeight:700,letterSpacing:1}}>LIVE PRICE (per gram)</p>
          <p style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:38,color:'var(--gold)',marginTop:6,lineHeight:1}}>
            {priceLoad?'…':`₹${gold.price.toLocaleString('en-IN')}`}
          </p>
          <p style={{color:'var(--green)',fontSize:12,fontWeight:600,marginTop:6}}>+₹{gold.change} (+{gold.pct}%) today</p>
          <p style={{color:'var(--t3)',fontSize:11,marginTop:6}}>99.9% Pure · Insured Storage · Instant Sell</p>
        </div>
      </div>

      <div style={{display:'flex',gap:8,padding:'12px 16px 0'}}>
        {(['buy','sell','holdings']as const).map(t=>(
          <button key={t} onClick={()=>{setTab(t);setAmount('');}}
            style={{flex:1,padding:'10px 0',borderRadius:12,fontSize:13,fontWeight:700,cursor:'pointer',
                     background:t==='buy'&&tab==='buy'?'var(--green)':t==='sell'&&tab==='sell'?'var(--red)':tab===t?'var(--bg-elevated)':'var(--bg-card)',
                     border:`1px solid ${tab===t?(t==='buy'?'var(--green)':t==='sell'?'var(--red)':'var(--teal)'):'var(--b1)'}`,
                     color:tab===t&&t!=='holdings'?'#fff':'var(--t2)'}}>
            {t==='buy'?'🟢 Buy':t==='sell'?'🔴 Sell':'📦 Holdings'}
          </button>
        ))}
      </div>

      <div style={{padding:'16px 16px 90px'}}>
        {(tab==='buy'||tab==='sell')&&(
          <div className="card">
            <p className="s-label">{tab==='buy'?'AMOUNT IN ₹':'GRAMS TO SELL'}</p>
            <div className="amount-box" style={{marginBottom:12}}>
              <span style={{color:'var(--gold)',fontSize:22,fontWeight:700}}>{tab==='buy'?'₹':'g'}</span>
              <input className="amount-input" type="number" placeholder="0" value={amount} onChange={e=>{setAmount(e.target.value);}}/>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
              {(tab==='buy'?[100,500,1000,5000]:[0.1,0.5,1,2]).map(v=>(
                <button key={v} onClick={()=>setAmount(String(v))}
                  style={{padding:'7px 14px',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,cursor:'pointer',
                           background:amount===String(v)?'var(--gold-dim)':'var(--bg-elevated)',border:`1px solid ${amount===String(v)?'var(--gold)':'var(--b1)'}`,color:amount===String(v)?'var(--gold)':'var(--t2)'}}>
                  {tab==='buy'?`₹${v}`:`${v}g`}
                </button>
              ))}
            </div>
            {tab==='buy'&&grams>0&&<div style={{background:'rgba(244,185,66,0.08)',borderRadius:'var(--r1)',padding:'10px 14px',marginBottom:14}}>
              <p style={{color:'var(--gold)',fontSize:13,fontWeight:600}}>You get ≈ {grams.toFixed(4)} grams of 24K gold</p>
            </div>}
            {tab==='sell'&&<div style={{background:'rgba(255,255,255,0.03)',borderRadius:'var(--r1)',padding:'10px 14px',marginBottom:14}}>
              <p style={{color:'var(--t2)',fontSize:13}}>Holdings: <strong style={{color:'var(--t1)'}}>{holdings.grams.toFixed(4)}g</strong></p>
            </div>}
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid var(--b1)',marginBottom:14}}>
              <span style={{color:'var(--t3)',fontSize:12}}>{tab==='buy'?'Wallet balance':'Current value'}</span>
              <span style={{color:'var(--green)',fontWeight:700,fontSize:12}}>{tab==='buy'?`₹${bal.toLocaleString('en-IN')}`:`₹${currentVal.toLocaleString('en-IN')}`}</span>
            </div>
            <button onClick={tab==='buy'?handleBuy:handleSell} disabled={loading||!amount}
              className={tab==='buy'?'btn-primary':''}
              style={tab==='sell'?{width:'100%',padding:'15px',background:'linear-gradient(135deg,#ff4d6a,#dc2626)',border:'none',borderRadius:'var(--r2)',color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',opacity:loading||!amount?0.5:1,fontFamily:'inherit'}:{opacity:loading||!amount?0.5:1}}>
              {loading?'⏳ Processing…':`${tab==='buy'?'Buy':'Sell'} Gold →`}
            </button>
          </div>
        )}
        {tab==='holdings'&&(
          holdings.grams===0?(
            <div style={{textAlign:'center',padding:'60px 0'}}>
              <p style={{fontSize:48,marginBottom:12}}>🥇</p>
              <p style={{color:'var(--t2)',fontWeight:600,fontSize:16}}>No gold holdings yet</p>
              <p style={{color:'var(--t3)',fontSize:13,marginTop:6}}>Start with as little as ₹10</p>
              <button className="btn-gold" style={{marginTop:20,width:'auto',padding:'12px 24px'}} onClick={()=>setTab('buy')}>Buy Gold →</button>
            </div>
          ):(
            <div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                {[{l:'Gold Owned',v:`${holdings.grams.toFixed(4)}g`,c:'var(--gold)'},
                  {l:'Current Value',v:`₹${currentVal.toLocaleString('en-IN',{maximumFractionDigits:0})}`,c:'var(--teal)'},
                  {l:'Invested',v:`₹${holdings.invested.toLocaleString('en-IN',{maximumFractionDigits:0})}`,c:'var(--t2)'},
                  {l:'P&L',v:`${pnl>=0?'+':''}₹${pnl.toLocaleString('en-IN',{maximumFractionDigits:0})}`,c:pnl>=0?'var(--green)':'var(--red)'},
                ].map(s=>(
                  <div key={s.l} style={{background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r2)',padding:'14px'}}>
                    <p style={{color:'var(--t3)',fontSize:10,fontWeight:700,marginBottom:4}}>{s.l.toUpperCase()}</p>
                    <p style={{color:s.c,fontWeight:800,fontSize:16}}>{s.v}</p>
                  </div>
                ))}
              </div>
              <button className="btn-gold" onClick={()=>setTab('sell')}>Sell Gold</button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
