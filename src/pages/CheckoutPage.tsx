/**
 * INRT WALLET — CheckoutPage.tsx
 * Buy INRT with ₹ (via Razorpay) or sell INRT back to ₹
 * Route: /checkout
 *
 * Buy flow:
 *  User selects amount → Razorpay payment page opens
 *  → On success, backend credits INRT to wallet
 *
 * Sell flow:
 *  User selects INRT amount → instant convert to ₹ wallet balance
 *  → Can then withdraw via UPI (when Cashfree is set up)
 *
 * Replace: src/pages/CheckoutPage.tsx
 * Add route in App.tsx: <Route path="/checkout" element={<CheckoutPage/>}/>
 */

import { useState, useEffect } from 'react';
import { useNavigate }          from 'react-router-dom';
import { useAuth }              from '../context/AuthContext';
import { doc, onSnapshot }      from 'firebase/firestore';
import { db as firestoreDb }    from '../lib/firebase';

const API = import.meta.env.VITE_API_URL || '';

const T = {
  bg:'#050914', card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.08)',
  inrt:'#7B2FBE', inrtL:'#E0B0FF', teal:'#00e5cc', tealD:'#00b4a0',
  green:'#00C853', orange:'#FF9500', red:'#FF3B30',
  text:'#fff', muted:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.2)',
};

type Mode = 'buy' | 'sell';

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000, 5000];

declare global {
  interface Window { Razorpay: any; }
}

export default function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<any>(null);
  const [mode, setMode]       = useState<Mode>('buy');
  const [amount, setAmount]   = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ amount:number; mode:Mode } | null>(null);
  const [err, setErr]         = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user?.uid]);

  // Load Razorpay SDK
  useEffect(() => {
    if (window.Razorpay) return;
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    document.head.appendChild(s);
  }, []);

  const inrtBal = Number(profile?.rewardPoints ?? 0);
  const inrBal  = Number(profile?.balance ?? 0);
  const amt     = parseFloat(amount) || 0;

  // ── BUY INRT — open Razorpay ─────────────────────────────────
  const handleBuy = async () => {
    if (amt < 10) return setErr('Minimum purchase ₹10');
    setErr(''); setLoading(true);
    try {
      // Create Razorpay order
      const r = await fetch(`${API}/create-order`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ amount: amt, userId: user!.uid }),
      });
      const order = await r.json();
      if (!r.ok) throw new Error(order.error || 'Failed to create order');

      const options = {
        key:         order.keyId,
        amount:      order.amount,
        currency:    'INR',
        name:        'INRT Wallet',
        description: `Buy ${amt} INRT`,
        image:       '/android-chrome-192x192.png',
        order_id:    order.orderId,
        prefill: {
          name:    profile?.name || '',
          contact: profile?.phone ? `+91${profile.phone}` : '',
        },
        theme: { color: '#7B2FBE' },
        handler: async (response: any) => {
          // Payment success — verify and credit INRT
          setLoading(true);
          try {
            const vr = await fetch(`${API}/checkout/verify-inrt-purchase`, {
              method: 'POST', headers: { 'Content-Type':'application/json' },
              body: JSON.stringify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
                userId: user!.uid,
                amount: amt,
              }),
            });
            const vd = await vr.json();
            if (!vr.ok) throw new Error(vd.error || 'Verification failed');
            setSuccess({ amount: amt, mode: 'buy' });
            setAmount('');
          } catch (e: any) {
            setErr(`Payment received but credit failed: ${e.message}. Contact support.`);
          }
          setLoading(false);
        },
        modal: {
          ondismiss: () => { setLoading(false); },
        },
      };

      if (!window.Razorpay) throw new Error('Razorpay not loaded. Check internet connection.');
      const rp = new window.Razorpay(options);
      rp.on('payment.failed', (resp: any) => {
        setErr(`Payment failed: ${resp.error.description}`);
        setLoading(false);
      });
      rp.open();
    } catch (e: any) {
      setErr(e.message || 'Payment failed');
      setLoading(false);
    }
  };

  // ── SELL INRT → ₹ wallet (instant convert) ──────────────────
  const handleSell = async () => {
    if (amt < 1)         return setErr('Minimum 1 INRT');
    if (amt > inrtBal)   return setErr('Insufficient INRT balance');
    setErr(''); setLoading(true);
    try {
      const r = await fetch(`${API}/inrt/convert`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ userId: user!.uid, direction: 'inrt_to_inr', amount: amt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Conversion failed');
      setSuccess({ amount: amt, mode: 'sell' });
      setAmount('');
    } catch (e: any) {
      setErr(e.message || 'Sell failed');
    }
    setLoading(false);
  };

  // ── Success screen ───────────────────────────────────────────
  if (success) return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ padding:'40px 24px', textAlign:'center' as const, width:'100%' }}>
        <div style={{ width:84, height:84, borderRadius:'50%', background:'rgba(0,200,83,0.12)', border:`2px solid ${T.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, margin:'0 auto 24px' }}>
          {success.mode==='buy' ? '🪙' : '💸'}
        </div>
        <h2 style={{ color:T.text, fontWeight:800, fontSize:24, margin:'0 0 8px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
          {success.mode==='buy' ? 'INRT Purchased!' : 'INRT Sold!'}
        </h2>
        <p style={{ color:T.muted, fontSize:15, margin:'0 0 24px', lineHeight:1.6 }}>
          {success.mode==='buy'
            ? `${success.amount.toLocaleString()} INRT has been credited to your wallet.`
            : `${success.amount.toLocaleString()} INRT converted to ₹${success.amount.toLocaleString()} in your wallet.`}
        </p>

        {success.mode==='buy' && (
          <div style={{ background:'rgba(0,229,204,0.08)', border:`1px solid ${T.teal}30`, borderRadius:14, padding:'16px', marginBottom:20 }}>
            <p style={{ color:T.teal, fontWeight:700, fontSize:13, margin:'0 0 6px' }}>🌍 Now you can:</p>
            <p style={{ color:T.muted, fontSize:13, margin:0, lineHeight:1.7 }}>
              • Send INRT to anyone in the world instantly{'\n'}
              • Use INRT for zero-forex global payments{'\n'}
              • Hold as a ₹1 stable digital asset
            </p>
          </div>
        )}

        <button onClick={()=>setSuccess(null)} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:10 }}>
          {success.mode==='buy' ? 'Buy More INRT' : 'Sell More INRT'}
        </button>
        <button onClick={()=>navigate('/dashboard')} style={{ width:'100%', padding:'14px', borderRadius:14, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
          Back to Home
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif", paddingBottom:40 }}>

      {/* Header */}
      <div style={{ background:`linear-gradient(160deg,${T.inrt} 0%,#3D0D7B 60%,${T.bg} 100%)`, padding:'52px 20px 30px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          <button onClick={()=>navigate('/dashboard')} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:18 }}>←</button>
          <div>
            <p style={{ color:'rgba(255,255,255,0.6)', fontSize:12, margin:0 }}>INRT Exchange</p>
            <h1 style={{ color:'#fff', fontSize:20, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Buy & Sell INRT</h1>
          </div>
        </div>

        {/* Balance cards */}
        <div style={{ display:'flex', gap:10 }}>
          <div style={{ flex:1, background:'rgba(255,255,255,0.1)', borderRadius:14, padding:'14px', border:'1px solid rgba(255,255,255,0.15)' }}>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:10, margin:'0 0 4px', letterSpacing:0.5 }}>₹ WALLET</p>
            <p style={{ color:'#fff', fontSize:20, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>₹{inrBal.toLocaleString('en-IN')}</p>
          </div>
          <div style={{ flex:1, background:'rgba(123,47,190,0.3)', borderRadius:14, padding:'14px', border:'1px solid rgba(200,150,255,0.2)' }}>
            <p style={{ color:'rgba(224,176,255,0.6)', fontSize:10, margin:'0 0 4px', letterSpacing:0.5 }}>🪙 INRT</p>
            <p style={{ color:'#E0B0FF', fontSize:20, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{inrtBal.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      <div style={{ padding:'16px' }}>

        {/* Rate card */}
        <div style={{ background:'rgba(0,229,204,0.06)', border:`1px solid ${T.teal}25`, borderRadius:14, padding:'14px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ color:T.teal, fontWeight:800, fontSize:15, margin:0 }}>1 INRT = ₹1.00</p>
            <p style={{ color:T.muted, fontSize:12, margin:'2px 0 0' }}>Pegged to Indian Rupee · No slippage</p>
          </div>
          <div style={{ background:'rgba(0,200,83,0.1)', border:`1px solid ${T.green}30`, borderRadius:8, padding:'4px 10px' }}>
            <p style={{ color:T.green, fontWeight:700, fontSize:11, margin:0 }}>🔒 STABLE</p>
          </div>
        </div>

        {/* Buy / Sell tabs */}
        <div style={{ display:'flex', gap:0, marginBottom:20, background:'rgba(255,255,255,0.04)', borderRadius:14, padding:4, border:`1px solid ${T.border}` }}>
          {([['buy','🪙 Buy INRT'],['sell','💸 Sell INRT']] as [Mode,string][]).map(([m,l])=>(
            <button key={m} onClick={()=>{ setMode(m); setAmount(''); setErr(''); }}
              style={{ flex:1, padding:'12px', borderRadius:11, border:'none', cursor:'pointer', fontWeight:700, fontSize:14, fontFamily:"'Plus Jakarta Sans',sans-serif", transition:'all 0.15s',
                background: mode===m ? (m==='buy'?`linear-gradient(135deg,${T.inrt},#5B17A3)`:`linear-gradient(135deg,#00897B,#00695C)`) : 'transparent',
                color: mode===m ? '#fff' : T.muted,
                boxShadow: mode===m ? '0 4px 16px rgba(0,0,0,0.2)' : 'none',
              }}>
              {l}
            </button>
          ))}
        </div>

        {/* Main card */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'20px 16px', marginBottom:16 }}>

          {mode==='buy' && (
            <>
              <p style={{ color:T.muted, fontSize:12, margin:'0 0 4px' }}>You pay</p>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ color:'#fff', fontSize:32, fontWeight:800 }}>₹</span>
                <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
                  style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:36, fontWeight:800, color:'#fff', fontFamily:"'Plus Jakarta Sans',sans-serif" }}/>
              </div>
              {amt>0 && <p style={{ color:T.teal, fontSize:13, margin:'0 0 4px' }}>= {amt.toLocaleString()} INRT you receive</p>}
              <p style={{ color:T.dim, fontSize:11, margin:0 }}>No fees · 1:1 rate · Instant credit</p>
            </>
          )}

          {mode==='sell' && (
            <>
              <p style={{ color:T.muted, fontSize:12, margin:'0 0 4px' }}>You sell</p>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ color:'#E0B0FF', fontSize:28 }}>🪙</span>
                <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
                  style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:36, fontWeight:800, color:'#fff', fontFamily:"'Plus Jakarta Sans',sans-serif" }}/>
              </div>
              {amt>0 && <p style={{ color:T.teal, fontSize:13, margin:'0 0 4px' }}>= ₹{amt.toLocaleString()} added to your ₹ wallet</p>}
              <p style={{ color:T.dim, fontSize:11, margin:0 }}>Available: {inrtBal.toLocaleString()} INRT · No fees</p>
            </>
          )}
        </div>

        {/* Quick amount buttons */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
          {QUICK_AMOUNTS.map(v=>(
            <button key={v} onClick={()=>setAmount(String(v))}
              style={{ padding:'12px 0', borderRadius:12, border:`1px solid ${T.border}`, background:amount===String(v)?`rgba(123,47,190,0.2)`:'transparent', cursor:'pointer', fontSize:13, fontWeight:700, color:amount===String(v)?T.inrtL:T.muted, fontFamily:"'Plus Jakarta Sans',sans-serif", transition:'all 0.15s' }}>
              {mode==='buy'?'₹':''}{v}{mode==='sell'?' INRT':''}
            </button>
          ))}
        </div>

        {err && (
          <div style={{ background:'rgba(255,59,48,0.08)', border:`1px solid rgba(255,59,48,0.2)`, borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
            <p style={{ color:T.red, fontSize:13, margin:0, fontWeight:600 }}>{err}</p>
          </div>
        )}

        {/* CTA button */}
        <button
          onClick={mode==='buy' ? handleBuy : handleSell}
          disabled={loading || amt<=0 || (mode==='sell' && amt>inrtBal) || (mode==='buy' && amt<10)}
          style={{ width:'100%', padding:'18px', borderRadius:14, border:'none', fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", transition:'all 0.15s',
            background: loading||amt<=0 ? 'rgba(255,255,255,0.08)' : mode==='buy' ? `linear-gradient(135deg,${T.inrt},#5B17A3)` : `linear-gradient(135deg,#00897B,#00695C)`,
            color: loading||amt<=0 ? T.dim : '#fff',
            boxShadow: loading||amt<=0 ? 'none' : `0 8px 24px ${mode==='buy'?'rgba(123,47,190,0.4)':'rgba(0,137,123,0.4)'}`,
          }}>
          {loading ? '⏳ Processing…'
          : mode==='buy'
            ? amt>=10 ? `Buy ${amt.toLocaleString()} INRT for ₹${amt.toLocaleString()} →` : 'Enter amount (min ₹10)'
            : amt>=1  ? `Sell ${amt.toLocaleString()} INRT → ₹${amt.toLocaleString()} →` : 'Enter INRT amount'}
        </button>

        {mode==='buy' && amt>=10 && (
          <p style={{ textAlign:'center' as const, color:T.dim, fontSize:12, marginTop:12 }}>
            🔒 Secured by Razorpay · UPI, Cards, Net Banking accepted
          </p>
        )}

        {/* Info section */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px', marginTop:16 }}>
          <h3 style={{ color:T.text, fontWeight:800, fontSize:14, margin:'0 0 12px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {mode==='buy' ? '🪙 Why buy INRT?' : '💸 Why sell INRT?'}
          </h3>
          {mode==='buy' ? [
            ['🌍','Send money globally','Zero forex fees — pay anyone worldwide with INRT'],
            ['🔒','Always ₹1','No crypto volatility — INRT is always worth exactly ₹1'],
            ['⚡','Instant transfer','2-4 second delivery — faster than any bank or UPI'],
            ['🎁','Earn rewards','Receive INRT bonuses on KYC, referrals, and transactions'],
          ].map(([icon,title,desc])=>(
            <div key={title as string} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{icon}</span>
              <div>
                <p style={{ color:T.text, fontWeight:700, fontSize:13, margin:0 }}>{title as string}</p>
                <p style={{ color:T.muted, fontSize:12, margin:'2px 0 0' }}>{desc as string}</p>
              </div>
            </div>
          )) : [
            ['💰','Get ₹ instantly','INRT converts to ₹ in your wallet immediately'],
            ['🏦','Withdraw anytime','Transfer ₹ to your bank account or UPI'],
            ['0️⃣','Zero fees','No conversion fee — always 1:1'],
          ].map(([icon,title,desc])=>(
            <div key={title as string} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{icon}</span>
              <div>
                <p style={{ color:T.text, fontWeight:700, fontSize:13, margin:0 }}>{title as string}</p>
                <p style={{ color:T.muted, fontSize:12, margin:'2px 0 0' }}>{desc as string}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
