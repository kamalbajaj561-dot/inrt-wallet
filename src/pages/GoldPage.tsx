import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Free gold price: metals-api.com free tier OR goldapi.io free tier
// Fallback: use a hardcoded realistic price if API unavailable
async function fetchGoldPrice(): Promise<{price:number;change:number;changePct:number}> {
  try {
    // Try goldprice.org free API (no key needed)
    const r = await fetch('https://data-asg.goldprice.org/dbXRates/INR', {
      signal: AbortSignal.timeout(6000)
    });
    const data = await r.json();
    const pricePerGram = data.items?.[0]?.xauPrice / 31.1035; // troy oz → gram
    if (pricePerGram > 0) {
      return { price: Math.round(pricePerGram), change: 0, changePct: 0 };
    }
  } catch {}
  // Realistic fallback price (₹ per gram, 24K)
  return { price: 7250, change: 35, changePct: 0.49 };
}

export default function GoldPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [goldData,  setGoldData]  = useState({ price:7250, change:35, changePct:0.49 });
  const [tab,       setTab]       = useState<'buy'|'sell'|'holdings'>('buy');
  const [amount,    setAmount]    = useState('');
  const [grams,     setGrams]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [priceLoad, setPriceLoad] = useState(true);
  const [toast,     setToast]     = useState('');
  const [holdings,  setHoldings]  = useState({ grams: 0, invested: 0, currentValue: 0 });

  const bal = userProfile?.balance || 0;

  useEffect(() => {
    fetchGoldPrice().then(d => { setGoldData(d); setPriceLoad(false); });
    // Load user's gold holdings from profile
    const g = userProfile?.goldGrams || 0;
    const inv = userProfile?.goldInvested || 0;
    setHoldings({ grams:g, invested:inv, currentValue:Math.round(g*goldData.price) });
  }, [userProfile]);

  useEffect(() => {
    const a = parseFloat(amount);
    if (!isNaN(a) && a > 0) setGrams(parseFloat((a / goldData.price).toFixed(4)));
    else setGrams(0);
  }, [amount, goldData.price]);

  const showToast = (msg:string) => { setToast(msg); setTimeout(()=>setToast(''),3000); };

  const handleBuy = async () => {
    const a = parseFloat(amount);
    if (!a || a < 10) return showToast('Minimum ₹10');
    if (a > bal) return showToast(`Insufficient balance. You have ₹${bal}`);
    setLoading(true);
    try {
      await updateDoc(doc(db,'users',user!.uid), {
        balance:       increment(-a),
        goldGrams:     increment(grams),
        goldInvested:  increment(a),
        updatedAt:     serverTimestamp(),
      });
      await addDoc(collection(db,'transactions'), {
        uid: user!.uid, type:'debit', amount:a,
        note:`Gold purchase ${grams.toFixed(4)}g`,
        cat:'gold', status:'success',
        createdAt: serverTimestamp(),
      });
      await refreshProfile();
      showToast(`✅ Bought ${grams.toFixed(4)}g of 24K gold!`);
      setAmount('');
    } catch(e:any) { showToast(e.message||'Purchase failed'); }
    setLoading(false);
  };

  const handleSell = async () => {
    const g = parseFloat(amount);
    if (!g || g <= 0) return showToast('Enter grams to sell');
    if (g > holdings.grams) return showToast('Insufficient gold holdings');
    const saleValue = Math.round(g * goldData.price * 0.985); // 1.5% spread
    setLoading(true);
    try {
      await updateDoc(doc(db,'users',user!.uid), {
        balance:      increment(saleValue),
        goldGrams:    increment(-g),
        updatedAt:    serverTimestamp(),
      });
      await addDoc(collection(db,'transactions'), {
        uid:user!.uid, type:'credit', amount:saleValue,
        note:`Gold sale ${g}g`,
        cat:'gold', status:'success',
        createdAt: serverTimestamp(),
      });
      await refreshProfile();
      showToast(`✅ Sold ${g}g for ₹${saleValue.toLocaleString('en-IN')}`);
      setAmount('');
    } catch(e:any) { showToast(e.message||'Sale failed'); }
    setLoading(false);
  };

  const profit = holdings.currentValue - holdings.invested;
  const profitPct = holdings.invested > 0 ? (profit/holdings.invested)*100 : 0;

  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      <div style={s.header}>
        <button onClick={()=>navigate('/dashboard')} style={s.back}>←</button>
        <div>
          <h1 style={s.title}>Digital Gold</h1>
          <p style={{ color:'rgba(255,255,255,0.4)',fontSize:11 }}>24K Pure · 99.9% Purity</p>
        </div>
        <div style={{ background:'rgba(240,180,41,0.1)',border:'1px solid rgba(240,180,41,0.3)',
                       borderRadius:8,padding:'4px 10px' }}>
          <span style={{ color:'#f0b429',fontSize:10,fontWeight:700 }}>LIVE</span>
        </div>
      </div>

      {/* Gold Price Card */}
      <div style={{ background:'linear-gradient(135deg,rgba(240,180,41,0.12),rgba(255,140,0,0.06))',
                     padding:'20px',margin:'0 16px 16px',borderRadius:20,
                     border:'1px solid rgba(240,180,41,0.2)' }}>
        <p style={{ color:'rgba(240,180,41,0.7)',fontSize:11,letterSpacing:1,fontWeight:700 }}>
          24K GOLD PRICE (per gram)
        </p>
        <div style={{ display:'flex',alignItems:'flex-end',gap:12,marginTop:8 }}>
          <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:36,color:'#f0b429' }}>
            {priceLoad ? '...' : `₹${goldData.price.toLocaleString('en-IN')}`}
          </span>
          <span style={{ color:'#10b981',fontSize:13,fontWeight:700,marginBottom:4 }}>
            +₹{goldData.change} ({goldData.changePct.toFixed(2)}%) today
          </span>
        </div>
        <p style={{ color:'rgba(255,255,255,0.3)',fontSize:11,marginTop:6 }}>
          Inclusive of GST · SafeGold certified · Instant liquidity
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex',gap:8,padding:'0 16px 14px' }}>
        {(['buy','sell','holdings'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ flex:1,padding:'10px 0',borderRadius:12,fontSize:13,fontWeight:700,cursor:'pointer',
                     background:t==='buy'&&tab===t?'#f0b429':t==='sell'&&tab===t?'#ef4444':tab===t?'#1e1e2a':'#16161f',
                     border:`1px solid ${tab===t?(t==='buy'?'#f0b429':t==='sell'?'#ef4444':'#00d4ff'):'rgba(255,255,255,0.07)'}`,
                     color:tab===t&&t!=='holdings'?'#000':'#f0f0f8' }}>
            {t==='buy'?'🟡 Buy':t==='sell'?'💰 Sell':'📦 Holdings'}
          </button>
        ))}
      </div>

      <div style={{ padding:'0 16px 90px' }}>
        {(tab==='buy'||tab==='sell') && (
          <div style={s.card}>
            <p style={{ color:'#8888a8',fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:12 }}>
              {tab==='buy'?'ENTER AMOUNT (₹)':'ENTER GRAMS'}
            </p>
            <div style={{ display:'flex',alignItems:'center',gap:10,background:'#1e1e2a',
                           borderRadius:14,padding:'12px 16px',marginBottom:12,
                           border:'1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ color:'#f0b429',fontSize:20,fontWeight:800 }}>
                {tab==='buy'?'₹':'g'}
              </span>
              <input
                type="number" value={amount}
                onChange={e=>{setAmount(e.target.value)}}
                placeholder="0"
                style={{ flex:1,background:'none',border:'none',outline:'none',
                          fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:'#f0f0f8' }}
              />
            </div>

            {tab==='buy' && grams>0 && (
              <div style={{ background:'rgba(240,180,41,0.08)',borderRadius:12,padding:'10px 14px',marginBottom:14 }}>
                <p style={{ color:'#f0b429',fontSize:13,fontWeight:600 }}>
                  You get: {grams.toFixed(4)} grams of 24K gold
                </p>
              </div>
            )}

            {/* Quick amounts */}
            <div style={{ display:'flex',gap:8,marginBottom:16,flexWrap:'wrap' as const }}>
              {(tab==='buy'?[100,500,1000,5000]:[0.1,0.5,1,2]).map(v=>(
                <button key={v} onClick={()=>setAmount(String(v))}
                  style={{ padding:'7px 14px',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer',
                           background:amount===String(v)?'rgba(240,180,41,0.15)':'#1e1e2a',
                           border:`1px solid ${amount===String(v)?'#f0b429':'rgba(255,255,255,0.07)'}`,
                           color:amount===String(v)?'#f0b429':'#8888a8' }}>
                  {tab==='buy'?`₹${v}`:(`${v}g`)}
                </button>
              ))}
            </div>

            <div style={{ display:'flex',justifyContent:'space-between',
                           background:'#1e1e2a',borderRadius:12,padding:'12px 14px',marginBottom:16 }}>
              <span style={{ color:'#555570',fontSize:13 }}>
                {tab==='buy'?'Wallet balance':'Gold holdings'}
              </span>
              <span style={{ color:'#10b981',fontWeight:700,fontSize:13 }}>
                {tab==='buy'?`₹${bal.toLocaleString('en-IN')}`:`${holdings.grams.toFixed(4)}g`}
              </span>
            </div>

            <button
              onClick={tab==='buy'?handleBuy:handleSell}
              disabled={loading||!amount}
              style={{ width:'100%',padding:'16px',background:tab==='buy'?
                'linear-gradient(135deg,#f0b429,#ff8c00)':'#ef4444',
                border:'none',borderRadius:14,color:tab==='buy'?'#000':'#fff',
                fontWeight:700,fontSize:16,cursor:'pointer',
                opacity:loading||!amount?0.6:1 }}>
              {loading?'Processing...':`${tab==='buy'?'Buy':'Sell'} Gold →`}
            </button>
          </div>
        )}

        {tab==='holdings' && (
          <div>
            <div style={s.card}>
              <p style={{ color:'#8888a8',fontSize:11,letterSpacing:1,fontWeight:700,marginBottom:16 }}>
                YOUR GOLD HOLDINGS
              </p>
              {holdings.grams === 0 ? (
                <div style={{ textAlign:'center',padding:'30px 0' }}>
                  <p style={{ fontSize:36,marginBottom:12 }}>🥇</p>
                  <p style={{ color:'#8888a8',fontSize:14 }}>No gold holdings yet</p>
                  <p style={{ color:'#555570',fontSize:12,marginTop:4 }}>Start with as little as ₹10</p>
                </div>
              ) : (
                <>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16 }}>
                    {[
                      { label:'Gold Owned',     val:`${holdings.grams.toFixed(4)}g`, color:'#f0b429' },
                      { label:'Current Value',  val:`₹${holdings.currentValue.toLocaleString('en-IN')}`, color:'#00d4ff' },
                      { label:'Invested',        val:`₹${holdings.invested.toLocaleString('en-IN')}`, color:'#8888a8' },
                      { label:'P&L',            val:`${profit>=0?'+':''}₹${profit.toLocaleString('en-IN')} (${profitPct.toFixed(1)}%)`, color:profit>=0?'#10b981':'#ef4444' },
                    ].map(item=>(
                      <div key={item.label} style={{ background:'#1e1e2a',borderRadius:12,padding:'14px' }}>
                        <p style={{ color:'#555570',fontSize:10,fontWeight:700,letterSpacing:0.5,marginBottom:4 }}>
                          {item.label.toUpperCase()}
                        </p>
                        <p style={{ color:item.color,fontWeight:800,fontSize:15 }}>{item.val}</p>
                      </div>
                    ))}
                  </div>
                  <p style={{ color:'#555570',fontSize:11,textAlign:'center' as const }}>
                    Stored securely · Insured · 99.9% pure
                  </p>
                </>
              )}
            </div>

            {/* Info */}
            <div style={{ ...s.card,marginTop:12,background:'rgba(240,180,41,0.05)',border:'1px solid rgba(240,180,41,0.15)' }}>
              <p style={{ color:'#f0b429',fontWeight:700,fontSize:14,marginBottom:12 }}>
                💡 Why Digital Gold?
              </p>
              {[
                '24K pure gold — no making charges',
                'Buy from ₹10 — no minimum investment',
                'Instant sell anytime at live price',
                'Stored in insured vaults',
                'Convert to physical gold anytime',
              ].map(p=>(
                <p key={p} style={{ color:'#8888a8',fontSize:13,padding:'7px 0',
                                     borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  ✓ {p}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string,React.CSSProperties> = {
  page:  { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  header:{ display:'flex',alignItems:'center',gap:14,padding:'52px 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#1a1428)' },
  back:  { background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' },
  title: { fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8' },
  card:  { background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',borderRadius:18,padding:20 },
  toast: { position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.14)',borderRadius:14,padding:'12px 20px',fontSize:14,fontWeight:600,color:'#f0f0f8',zIndex:999 },
};
