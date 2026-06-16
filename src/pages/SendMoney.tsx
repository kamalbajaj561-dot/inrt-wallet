/**
 * INRT WALLET — SendMoney.tsx
 *
 * LAUNCH VERSION:
 *  - INRT Global Transfer: ACTIVE ✅
 *  - UPI / Bank Transfer:  HIDDEN (coming soon — pending payout approval)
 *
 * To re-enable UPI/Bank: remove the HIDDEN comments below
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth }             from '../context/AuthContext';
import { doc, onSnapshot }     from 'firebase/firestore';
import { db as firestoreDb }   from '../lib/firebase';

const API = import.meta.env.VITE_API_URL || '';

const T = {
  navy:'#0A2540', accent:'#0070F3', inrt:'#7B2FBE', inrtL:'#E0B0FF',
  green:'#00C853', greenL:'#E8FAF0', teal:'#00e5cc',
  border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8',
  text:'#0A2540', card:'#FFFFFF', red:'#FF3B30',
};

type Step = 'form' | 'review' | 'pin' | 'processing' | 'success' | 'failed';

function PinPad({ onComplete, onCancel }: { onComplete:()=>void; onCancel:()=>void }) {
  const [pin, setPin] = useState<string[]>([]);
  const tap = (d: string) => {
    if (pin.length >= 6) return;
    const next = [...pin, d];
    setPin(next);
    if (next.length === 6) setTimeout(onComplete, 200);
  };
  return (
    <div style={{ textAlign:'center' as const }}>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>Enter your wallet PIN to confirm</p>
      <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:28 }}>
        {Array.from({length:6},(_,i)=><div key={i} style={{ width:14, height:14, borderRadius:'50%', background:i<pin.length?T.inrt:T.border, transition:'background 0.15s' }}/>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:240, margin:'0 auto 16px' }}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i)=>(
          <button key={i} onClick={()=>k==='⌫'?setPin(p=>p.slice(0,-1)):k!==''&&tap(String(k))}
            style={{ height:56, borderRadius:14, border:`1.5px solid ${T.border}`, background:k===''?'transparent':T.card, fontSize:k==='⌫'?20:22, fontWeight:700, color:T.text, cursor:k===''?'default':'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {k}
          </button>
        ))}
      </div>
      <button onClick={onCancel} style={{ background:'none', border:'none', color:T.muted, fontSize:13, cursor:'pointer' }}>Cancel</button>
    </div>
  );
}

export default function SendMoney() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();

  const [profile, setProfile] = useState<any>(null);
  const [step, setStep]       = useState<Step>('form');

  // INRT fields
  const [toAddress,  setToAddress]  = useState('');
  const [recipient,  setRecipient]  = useState<{name:string;verified:boolean}|null>(null);
  const [lookupErr,  setLookupErr]  = useState('');
  const [lookupLoad, setLookupLoad] = useState(false);
  const [amount,     setAmount]     = useState('');
  const [note,       setNote]       = useState('');
  const [err,        setErr]        = useState('');
  const [txRef,      setTxRef]      = useState('');
  const [durationMs, setDurationMs] = useState(0);
  const [elapsed,    setElapsed]    = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb,'users',user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user?.uid]);

  const inrtBal = Number(profile?.rewardPoints ?? 0);
  const amt     = parseFloat(amount) || 0;

  // ── Lookup INRT address ───────────────────────────────────────
  useEffect(() => {
    const addr = toAddress.toUpperCase().trim();
    if (addr.length < 15) { setRecipient(null); setLookupErr(''); return; }
    setLookupLoad(true); setLookupErr(''); setRecipient(null);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/inrt/lookup/${addr}`);
        const d = await r.json();
        if (d.success) setRecipient({ name:d.name, verified:d.verified });
        else setLookupErr(d.error || 'Address not found');
      } catch { setLookupErr('Lookup failed'); }
      setLookupLoad(false);
    }, 600);
    return () => clearTimeout(t);
  }, [toAddress]);

  // ── Poll transfer ─────────────────────────────────────────────
  const pollTransfer = (ref: string, start: number) => {
    let elapsed = 0;
    const timer = setInterval(() => { elapsed += 100; setElapsed(elapsed); }, 100);
    const poll  = setInterval(async () => {
      try {
        const r = await fetch(`${API}/inrt/transfer/${ref}`);
        const d = await r.json();
        if (d.status === 'completed') {
          clearInterval(timer); clearInterval(poll);
          setDurationMs(d.durationMs);
          setStep('success');
        } else if (d.status === 'failed') {
          clearInterval(timer); clearInterval(poll);
          setStep('failed');
        }
      } catch {}
    }, 300);
  };

  // ── Send ──────────────────────────────────────────────────────
  const handleSend = async () => {
    setErr('');
    try {
      const r = await fetch(`${API}/inrt/send`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fromUserId:user!.uid, toAddress, amount:amt, note }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Send failed');
      setTxRef(d.ref);
      setStep('processing');
      pollTransfer(d.ref, Date.now());
    } catch (e: any) { setErr(e.message); setStep('review'); }
  };

  const reset = () => { setStep('form'); setToAddress(''); setAmount(''); setNote(''); setRecipient(null); setTxRef(''); setErr(''); setElapsed(0); };
  const fmtMs = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(2)}s`;

  // ── SUCCESS ───────────────────────────────────────────────────
  if (step === 'success') return (
    <div style={S.page}>
      <div style={{ padding:'60px 24px', textAlign:'center' as const }}>
        <div style={{ width:84, height:84, borderRadius:'50%', background:'rgba(0,200,83,0.1)', border:`3px solid ${T.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, margin:'0 auto 20px' }}>✅</div>
        <h2 style={S.h2}>INRT Sent!</h2>
        <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>{amt.toLocaleString()} INRT delivered to {recipient?.name}</p>
        {durationMs > 0 && (
          <div style={{ background:'rgba(0,229,204,0.08)', border:`1px solid ${T.teal}30`, borderRadius:14, padding:'16px', marginBottom:20 }}>
            <p style={{ color:T.muted, fontSize:11, margin:'0 0 4px', letterSpacing:1 }}>⚡ DELIVERED IN</p>
            <p style={{ color:T.teal, fontSize:30, fontWeight:800, margin:0, fontFamily:'monospace' }}>{fmtMs(durationMs)}</p>
          </div>
        )}
        <div style={{ background:T.light, borderRadius:14, padding:'14px 16px', marginBottom:20, textAlign:'left' as const }}>
          {[['Reference', txRef],['To', toAddress],['Amount', `${amt.toLocaleString()} INRT`],['Status','✅ Delivered']].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:`1px solid ${T.border}` }}>
              <span style={{ color:T.muted, fontSize:12 }}>{k}</span>
              <span style={{ color:T.text, fontWeight:700, fontSize:12, fontFamily:k==='Reference'||k==='To'?'monospace':'inherit', maxWidth:'60%', textAlign:'right' as const, wordBreak:'break-all' as const }}>{v}</span>
            </div>
          ))}
        </div>
        <button onClick={reset} style={S.btnPrimary}>Send More INRT</button>
        <button onClick={()=>navigate('/dashboard')} style={{ ...S.btnOutline, marginTop:10 }}>Back to Home</button>
      </div>
    </div>
  );

  // ── PROCESSING ────────────────────────────────────────────────
  if (step === 'processing') return (
    <div style={S.page}>
      <div style={{ padding:'60px 24px', textAlign:'center' as const }}>
        <div style={{ width:64, height:64, border:`4px solid rgba(123,47,190,0.15)`, borderTopColor:T.inrt, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 20px' }}/>
        <h2 style={S.h2}>Sending INRT…</h2>
        <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>Delivering to {recipient?.name}</p>
        <div style={{ background:'rgba(123,47,190,0.06)', border:`1px solid ${T.inrt}20`, borderRadius:14, padding:'16px' }}>
          <p style={{ color:T.muted, fontSize:11, margin:'0 0 6px', letterSpacing:1 }}>ELAPSED</p>
          <p style={{ color:T.inrt, fontSize:28, fontWeight:800, margin:0, fontFamily:'monospace' }}>{fmtMs(elapsed)}</p>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // ── PIN ───────────────────────────────────────────────────────
  if (step === 'pin') return (
    <div style={S.page}>
      <div style={{ padding:'24px' }}>
        <button onClick={()=>setStep('review')} style={S.backLink}>← Back</button>
        <div style={{ background:'rgba(123,47,190,0.06)', border:`1px solid ${T.inrt}20`, borderRadius:14, padding:'16px', marginBottom:24, textAlign:'center' as const }}>
          <p style={{ color:T.muted, fontSize:12, margin:'0 0 4px' }}>Sending</p>
          <p style={{ color:T.text, fontWeight:800, fontSize:28, margin:'0 0 2px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{amt.toLocaleString()} INRT</p>
          <p style={{ color:T.muted, fontSize:13, margin:0 }}>to {recipient?.name} · ≈ ₹{amt.toLocaleString()}</p>
        </div>
        <PinPad onComplete={handleSend} onCancel={()=>setStep('review')}/>
        {err && <p style={{ color:T.red, fontSize:13, marginTop:12, textAlign:'center' as const }}>{err}</p>}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── REVIEW ────────────────────────────────────────────────────
  if (step === 'review') return (
    <div style={S.page}>
      <div style={{ padding:'24px' }}>
        <button onClick={()=>setStep('form')} style={S.backLink}>← Back</button>
        <h2 style={{ ...S.h2, marginBottom:20 }}>Confirm Transfer</h2>
        <div style={{ textAlign:'center' as const, marginBottom:20 }}>
          <p style={{ color:T.text, fontSize:36, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{amt.toLocaleString()} <span style={{ fontSize:18, color:T.inrt }}>INRT</span></p>
          <p style={{ color:T.muted, fontSize:13, margin:'4px 0 0' }}>≈ ₹{amt.toLocaleString()} · 1 INRT = ₹1</p>
        </div>
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'14px 16px', marginBottom:16 }}>
          {[
            ['To', recipient?.name || ''],
            ['INRT Address', toAddress],
            ['Amount', `${amt.toLocaleString()} INRT`],
            ['Network Fee', '₹0 (Free)'],
            ['Est. Delivery', '2-4 seconds'],
            ...(note ? [['Note', note]] : []),
          ].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${T.border}` }}>
              <span style={{ color:T.muted, fontSize:13 }}>{k}</span>
              <span style={{ color:k==='Network Fee'?T.green:T.text, fontWeight:700, fontSize:13, fontFamily:k==='INRT Address'?'monospace':'inherit', maxWidth:'60%', textAlign:'right' as const, wordBreak:'break-all' as const }}>{v}</span>
            </div>
          ))}
        </div>
        {err && <p style={{ color:T.red, fontSize:13, marginBottom:12 }}>{err}</p>}
        <button onClick={()=>setStep('pin')} style={S.btnInrt}>Confirm & Enter PIN →</button>
      </div>
    </div>
  );

  // ── FAILED ────────────────────────────────────────────────────
  if (step === 'failed') return (
    <div style={S.page}>
      <div style={{ padding:'60px 24px', textAlign:'center' as const }}>
        <div style={{ width:84, height:84, borderRadius:'50%', background:'rgba(255,59,48,0.1)', border:`3px solid ${T.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, margin:'0 auto 20px' }}>❌</div>
        <h2 style={S.h2}>Transfer Failed</h2>
        <p style={{ color:T.muted, fontSize:14, margin:'0 0 24px' }}>Your INRT has been refunded to your wallet.</p>
        <button onClick={reset} style={S.btnPrimary}>Try Again</button>
        <button onClick={()=>navigate('/dashboard')} style={{ ...S.btnOutline, marginTop:10 }}>Back to Home</button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── MAIN FORM ─────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={{ padding:'52px 20px 24px' }}>
        <button onClick={()=>navigate('/dashboard')} style={S.backLink}>← Back</button>
        <h2 style={{ ...S.h2, marginBottom:4 }}>Send Money</h2>
        <p style={{ color:T.muted, fontSize:13, margin:'0 0 20px' }}>Send INRT to anyone in the world instantly</p>

        {/* ── COMING SOON BANNER for UPI/Bank ─────────────── */}
        <div style={{ background:'rgba(255,149,0,0.06)', border:'1px solid rgba(255,149,0,0.2)', borderRadius:14, padding:'14px 16px', marginBottom:20 }}>
          <p style={{ color:'#FF9500', fontWeight:700, fontSize:13, margin:'0 0 4px' }}>🏦 UPI & Bank Transfers — Coming Soon</p>
          <p style={{ color:T.muted, fontSize:12, margin:0, lineHeight:1.6 }}>
            Direct UPI and bank transfers are pending payment gateway approval. For now, use INRT for instant global transfers — same value, zero fees.
          </p>
        </div>

        {/* ── INRT BALANCE ─────────────────────────────────── */}
        <div style={{ background:'rgba(123,47,190,0.06)', border:`1px solid ${T.inrt}25`, borderRadius:14, padding:'14px 16px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ color:T.muted, fontSize:11, fontWeight:700, margin:'0 0 2px', letterSpacing:0.5 }}>YOUR INRT BALANCE</p>
            <p style={{ color:T.inrt, fontSize:22, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{inrtBal.toLocaleString()} INRT</p>
          </div>
          <div style={{ textAlign:'right' as const }}>
            <p style={{ color:T.muted, fontSize:11, margin:'0 0 2px' }}>≈ ₹{inrtBal.toLocaleString()}</p>
            <button onClick={()=>navigate('/checkout')} style={{ background:T.inrt, border:'none', borderRadius:8, padding:'6px 12px', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer' }}>Buy INRT +</button>
          </div>
        </div>

        {/* ── RECIPIENT ADDRESS ─────────────────────────────── */}
        <p style={S.label}>RECIPIENT INRT ADDRESS</p>
        <input
          value={toAddress} onChange={e=>setToAddress(e.target.value.toUpperCase())}
          placeholder="INRT-XXXX-XXXX-XXXX" maxLength={20}
          style={{ ...S.input, fontFamily:'monospace', letterSpacing:1 }}
        />
        {lookupLoad && <p style={{ color:T.muted, fontSize:12, margin:'-10px 0 12px' }}>🔍 Looking up address…</p>}
        {lookupErr  && <p style={{ color:T.red,  fontSize:12, margin:'-10px 0 12px' }}>⚠️ {lookupErr}</p>}
        {recipient  && (
          <div style={{ background:T.greenL, border:`1px solid ${T.green}30`, borderRadius:10, padding:'10px 14px', marginBottom:16, display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:18 }}>✅</span>
            <div>
              <p style={{ fontWeight:700, fontSize:13, color:T.text, margin:0 }}>{recipient.name}</p>
              <p style={{ color:T.green, fontSize:11, margin:0 }}>{recipient.verified ? 'KYC Verified ✓' : 'Address confirmed'}</p>
            </div>
          </div>
        )}

        {/* ── AMOUNT ───────────────────────────────────────── */}
        <p style={S.label}>AMOUNT (INRT)</p>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:T.light, borderRadius:14, padding:'14px 16px', border:`1.5px solid ${amount?T.inrt:T.border}`, marginBottom:8 }}>
          <span style={{ fontSize:22 }}>🪙</span>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
            style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:T.text }}/>
        </div>
        <p style={{ color:T.muted, fontSize:12, margin:'0 0 12px' }}>= ₹{amt ? amt.toLocaleString() : '0'} · No fees</p>

        {/* Quick amounts */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[10, 50, 100, 500].map(v=>(
            <button key={v} onClick={()=>setAmount(String(v))}
              style={{ flex:1, padding:'10px 0', borderRadius:10, border:`1px solid ${T.border}`, background:'transparent', cursor:'pointer', fontSize:13, fontWeight:700, color:T.inrt, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {v}
            </button>
          ))}
        </div>

        {/* Note */}
        <p style={S.label}>NOTE (OPTIONAL)</p>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="What's this for?"
          style={{ ...S.input, marginBottom:20 }}/>

        {amt > inrtBal && <p style={{ color:T.red, fontSize:12, marginBottom:12, textAlign:'center' as const }}>Insufficient INRT. <button onClick={()=>navigate('/checkout')} style={{ background:'none', border:'none', color:T.inrt, cursor:'pointer', fontWeight:700, fontSize:12 }}>Buy INRT →</button></p>}

        <button
          disabled={!recipient || amt <= 0 || amt > inrtBal}
          onClick={()=>setStep('review')}
          style={{ ...S.btnInrt, opacity:(!recipient||amt<=0||amt>inrtBal)?0.5:1 }}>
          Continue →
        </button>

        {/* ── DON'T HAVE INRT? ─────────────────────────────── */}
        <div onClick={()=>navigate('/checkout')} style={{ marginTop:16, background:'rgba(123,47,190,0.04)', border:`1px solid ${T.inrt}20`, borderRadius:14, padding:'14px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ color:T.inrt, fontWeight:700, fontSize:13, margin:0 }}>🪙 Don't have INRT yet?</p>
            <p style={{ color:T.muted, fontSize:12, margin:'2px 0 0' }}>Buy INRT with ₹ via Razorpay — instant</p>
          </div>
          <span style={{ color:T.inrt, fontSize:18 }}>→</span>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}

const S: Record<string,any> = {
  page:    { maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#fff', fontFamily:"'Plus Jakarta Sans',sans-serif" },
  backLink:{ background:'none', border:'none', color:'#0070F3', cursor:'pointer', fontSize:14, fontWeight:700, padding:'0 0 16px', display:'block' },
  h2:      { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:24, color:'#0A2540', margin:0 },
  label:   { fontSize:11, color:'#6B7C93', fontWeight:700, letterSpacing:0.5, margin:'0 0 8px' },
  input:   { width:'100%', padding:'13px 14px', borderRadius:12, border:'1.5px solid #E8ECF0', fontSize:15, outline:'none', boxSizing:'border-box' as const, fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:16, color:'#0A2540' },
  btnPrimary:{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:'#0A2540', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" },
  btnInrt:   { width:'100%', padding:'16px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#7B2FBE,#5B17A3)', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" },
  btnOutline:{ width:'100%', padding:'14px', borderRadius:14, border:'1.5px solid #E8ECF0', background:'transparent', color:'#6B7C93', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" },
};
