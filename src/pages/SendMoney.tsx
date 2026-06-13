/**
 * INRT WALLET — SendMoney.tsx
 * Three payment methods: UPI ID, Bank Account, INRT Address
 * Replace: src/pages/SendMoney.tsx
 */

import { useState, useEffect } from 'react';
import { useNavigate }          from 'react-router-dom';
import { useAuth }              from '../context/AuthContext';
import { doc, onSnapshot }      from 'firebase/firestore';
import { db as firestoreDb }    from '../lib/firebase';

const API = import.meta.env.VITE_API_URL || '';

const T = {
  navy:'#0A2540', accent:'#0070F3', inrt:'#7B2FBE', green:'#00C853', greenL:'#E8FAF0',
  red:'#FF3B30', border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8', text:'#0A2540', card:'#FFFFFF',
};

type Method = 'upi' | 'bank' | 'inrt';
type Step   = 'form' | 'review' | 'pin' | 'success' | 'failed';

function PinPad({ onComplete }: { onComplete: () => void }) {
  const [pin, setPin] = useState<string[]>([]);
  const tap = (d: string) => {
    if (pin.length >= 6) return;
    const next = [...pin, d];
    setPin(next);
    if (next.length === 6) setTimeout(onComplete, 200);
  };
  return (
    <div style={{ textAlign:'center' }}>
      <p style={{ color:T.muted, fontSize:14, marginBottom:20 }}>Enter your 6-digit UPI PIN</p>
      <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:28 }}>
        {Array.from({length:6},(_,i)=><div key={i} style={{ width:14, height:14, borderRadius:'50%', background:i<pin.length?T.navy:T.border, transition:'background 0.15s' }}/>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:240, margin:'0 auto' }}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i)=>(
          <button key={i} onClick={()=>k==='⌫'?setPin(p=>p.slice(0,-1)):k!==''&&tap(String(k))}
            style={{ height:56, borderRadius:14, border:`1.5px solid ${T.border}`, background:k===''?'transparent':T.card, fontSize:k==='⌫'?20:22, fontWeight:700, color:T.text, cursor:k===''?'default':'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", boxShadow:k!==''&&k!=='⌫'?'0 2px 8px rgba(10,37,64,0.06)':'none' }}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SendMoney() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<any>(null);
  const [method,  setMethod]  = useState<Method>('upi');
  const [step,    setStep]    = useState<Step>('form');

  // Form fields
  const [upiId,       setUpiId]       = useState('');
  const [accNo,       setAccNo]       = useState('');
  const [ifsc,        setIfsc]        = useState('');
  const [accName,     setAccName]     = useState('');
  const [inrtAddress, setInrtAddress] = useState('');
  const [amount,      setAmount]      = useState('');
  const [note,        setNote]        = useState('');
  const [err,         setErr]         = useState('');
  const [loading,     setLoading]     = useState(false);

  // INRT lookup
  const [recipient, setRecipient]   = useState<{ name:string; verified:boolean } | null>(null);
  const [lookupErr, setLookupErr]   = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  // Result
  const [resultRef, setResultRef] = useState('');
  const [resultMs,  setResultMs]  = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user?.uid]);

  const bal     = Number(profile?.balance ?? 0);
  const inrtBal = Number(profile?.rewardPoints ?? 0);

  // ── INRT address lookup ──────────────────────────────────────
  useEffect(() => {
    if (method !== 'inrt') return;
    const addr = inrtAddress.toUpperCase().trim();
    if (addr.length < 15) { setRecipient(null); setLookupErr(''); return; }
    setLookupLoading(true); setLookupErr(''); setRecipient(null);
    const t = setTimeout(() => {
      fetch(`${API}/inrt/lookup/${addr}`)
        .then(r => r.json())
        .then(d => {
          if (d.success) setRecipient({ name: d.name, verified: d.verified });
          else setLookupErr(d.error || 'Address not found');
        })
        .catch(()=>setLookupErr('Lookup failed'))
        .finally(()=>setLookupLoading(false));
    }, 500);
    return () => clearTimeout(t);
  }, [inrtAddress, method]);

  const reset = () => {
    setStep('form'); setAmount(''); setNote(''); setErr('');
    setUpiId(''); setAccNo(''); setIfsc(''); setAccName('');
    setInrtAddress(''); setRecipient(null); setLookupErr('');
    setResultRef(''); setResultMs(0);
  };

  const canContinue = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return false;
    if (method === 'upi')  return !!upiId && amt <= bal;
    if (method === 'bank') return !!accNo && !!ifsc && !!accName && amt <= bal;
    if (method === 'inrt') return !!recipient && amt <= inrtBal;
    return false;
  };

  // ── Send handler ─────────────────────────────────────────────
  const handleSend = async () => {
    setLoading(true); setErr('');
    try {
      if (method === 'upi') {
        const r = await fetch(`${API}/payout/send-upi`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ fromUid: user!.uid, toUpiId: upiId, amount: parseFloat(amount), note }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Transfer failed');
        setResultRef(d.transferId);
        setStep('success');

      } else if (method === 'bank') {
        const r = await fetch(`${API}/payout/send-bank`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ fromUid: user!.uid, accountNo: accNo, ifsc, accountName: accName, amount: parseFloat(amount), note }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Transfer failed');
        setResultRef(d.transferId);
        setStep('success');

      } else if (method === 'inrt') {
        const r = await fetch(`${API}/inrt/send`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ fromUserId: user!.uid, toAddress: inrtAddress, amount: parseFloat(amount), note }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Transfer failed');
        setResultRef(d.ref);

        // Poll for completion to show delivery time
        const start = Date.now();
        const poll = setInterval(async () => {
          const sr = await fetch(`${API}/inrt/transfer/${d.ref}`);
          const sd = await sr.json();
          if (sd.status === 'completed') {
            clearInterval(poll);
            setResultMs(sd.durationMs);
            setStep('success');
          } else if (sd.status === 'failed') {
            clearInterval(poll);
            setStep('failed');
          }
        }, 200);
      }
    } catch (e: any) {
      setErr(e.message || 'Transfer failed');
      setStep('review');
    }
    setLoading(false);
  };

  const fmtMs = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(2)}s`;

  // ══════════════════════════════════════════════════════════════
  //  SUCCESS
  // ══════════════════════════════════════════════════════════════
  if (step === 'success') return (
    <div style={S.page}>
      <div style={{ padding:'60px 24px', textAlign:'center' as const }}>
        <div style={{ width:84, height:84, borderRadius:'50%', background:T.greenL, border:`3px solid ${T.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, margin:'0 auto 24px' }}>✓</div>
        <h2 style={S.h2}>Money Sent! 🎉</h2>
        <p style={{ color:T.muted, fontSize:15, margin:'0 0 24px' }}>
          {method==='inrt' ? `${parseFloat(amount).toLocaleString()} INRT sent to ${recipient?.name}` : `₹${parseFloat(amount).toLocaleString()} sent successfully`}
        </p>

        {method==='inrt' && resultMs>0 && (
          <div style={{ background:'rgba(0,229,204,0.08)', border:'1px solid rgba(0,229,204,0.25)', borderRadius:14, padding:'16px', marginBottom:20 }}>
            <p style={{ color:T.muted, fontSize:11, margin:'0 0 6px', letterSpacing:1 }}>⚡ DELIVERED IN</p>
            <p style={{ color:'#00b4a0', fontSize:28, fontWeight:800, margin:0, fontFamily:'monospace' }}>{fmtMs(resultMs)}</p>
          </div>
        )}

        <div style={{ background:T.light, borderRadius:14, padding:'16px', marginBottom:24, textAlign:'left' as const }}>
          {[['Reference', resultRef],['Amount', method==='inrt'?`${parseFloat(amount).toLocaleString()} INRT`:`₹${parseFloat(amount).toLocaleString()}`],['Status','✅ Success']].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0' }}>
              <span style={{ color:T.muted, fontSize:13 }}>{k}</span>
              <span style={{ fontWeight:700, fontSize:13, color:T.text, fontFamily:k==='Reference'?'monospace':'inherit', fontSize:k==='Reference'?11:13 }}>{v}</span>
            </div>
          ))}
        </div>

        <button style={S.btnPrimary} onClick={()=>navigate('/dashboard')}>Back to Home</button>
        <button style={{ ...S.btnOutline, marginTop:10 }} onClick={reset}>Send Again</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  FAILED (INRT only)
  // ══════════════════════════════════════════════════════════════
  if (step === 'failed') return (
    <div style={S.page}>
      <div style={{ padding:'60px 24px', textAlign:'center' as const }}>
        <div style={{ width:84, height:84, borderRadius:'50%', background:'#FFEBEE', border:`3px solid ${T.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, margin:'0 auto 24px' }}>✕</div>
        <h2 style={S.h2}>Transfer Failed</h2>
        <p style={{ color:T.muted, fontSize:15, margin:'0 0 24px' }}>Your INRT has been refunded to your wallet.</p>
        <button style={S.btnPrimary} onClick={reset}>Try Again</button>
        <button style={{ ...S.btnOutline, marginTop:10 }} onClick={()=>navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  PIN
  // ══════════════════════════════════════════════════════════════
  if (step === 'pin') return (
    <div style={S.page}>
      <div style={{ padding:'24px' }}>
        <button onClick={()=>setStep('review')} style={S.backBtn}>← Back</button>
        <div style={{ textAlign:'center' as const, marginBottom:32 }}>
          <p style={{ fontSize:32, fontWeight:800, color:T.text, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {method==='inrt' ? `${parseFloat(amount||'0').toLocaleString()} INRT` : `₹${parseFloat(amount||'0').toLocaleString()}`}
          </p>
          <p style={{ color:T.muted, fontSize:13, margin:'4px 0 0' }}>
            to {method==='upi'?upiId:method==='bank'?accName:recipient?.name}
          </p>
        </div>
        <PinPad onComplete={handleSend}/>
        {loading && <p style={{ textAlign:'center' as const, color:T.muted, fontSize:13, marginTop:16 }}>⏳ Processing…</p>}
        {err && <p style={{ textAlign:'center' as const, color:T.red, fontSize:13, marginTop:16 }}>{err}</p>}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  REVIEW
  // ══════════════════════════════════════════════════════════════
  if (step === 'review') return (
    <div style={S.page}>
      <div style={{ padding:'24px' }}>
        <button onClick={()=>setStep('form')} style={S.backBtn}>← Back</button>
        <h2 style={{ ...S.h2, marginBottom:20 }}>Confirm Payment</h2>

        <div style={S.card}>
          {[
            ...(method==='upi'  ? [['Send to', upiId], ['Method','UPI']] : []),
            ...(method==='bank' ? [['Account Holder', accName], ['Account No', accNo], ['IFSC', ifsc], ['Method','Bank Transfer']] : []),
            ...(method==='inrt' ? [['Send to', recipient?.name||''], ['INRT Address', inrtAddress], ['Method','INRT Global Transfer']] : []),
            ['Amount', method==='inrt' ? `${parseFloat(amount).toLocaleString()} INRT` : `₹${parseFloat(amount).toLocaleString()}`],
            ['From', method==='inrt' ? `${inrtBal.toLocaleString()} INRT available` : `₹${bal.toLocaleString()} available`],
            ...(note ? [['Note', note]] : []),
            ['Fee', '₹0.00 (Free)'],
            ...(method==='inrt' ? [['Est. Delivery','2-4 seconds']] : []),
          ].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ color:T.muted, fontSize:14 }}>{k}</span>
              <span style={{ fontWeight:700, fontSize:14, color:k==='Fee'?T.green:T.text, fontFamily:k==='INRT Address'?'monospace':'inherit', maxWidth:'60%', textAlign:'right' as const, wordBreak:'break-all' as const }}>{v}</span>
            </div>
          ))}
        </div>

        {err && <p style={{ color:T.red, fontSize:13, marginTop:12 }}>{err}</p>}

        <button style={{ ...S.btnPrimary, marginTop:20 }} onClick={()=>setStep('pin')}>
          Continue to PIN →
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  FORM (default)
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={S.page}>
      <div style={{ padding:'24px' }}>
        <button onClick={()=>navigate('/dashboard')} style={S.backBtn}>← Back</button>
        <h2 style={{ ...S.h2, marginBottom:16 }}>Send Money</h2>

        {/* Method tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          {([['upi','💳','UPI ID'],['bank','🏦','Bank'],['inrt','🪙','INRT Global']] as [Method,string,string][]).map(([m,icon,l])=>(
            <button key={m} onClick={()=>{ setMethod(m); setErr(''); }}
              style={{ flex:1, padding:'12px 4px', borderRadius:12, border:`1.5px solid ${method===m?(m==='inrt'?T.inrt:T.navy):T.border}`, background:method===m?(m==='inrt'?'rgba(123,47,190,0.06)':T.navy+'08'):'transparent', color:method===m?(m==='inrt'?T.inrt:T.navy):T.muted, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", display:'flex', flexDirection:'column' as const, alignItems:'center', gap:4 }}>
              <span style={{ fontSize:18 }}>{icon}</span>
              {l}
            </button>
          ))}
        </div>

        {/* Balance display */}
        <div style={{ background:method==='inrt'?'rgba(123,47,190,0.06)':T.light, border:`1px solid ${method==='inrt'?'rgba(123,47,190,0.15)':T.border}`, borderRadius:12, padding:'12px 16px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:T.muted, fontSize:12 }}>{method==='inrt'?'INRT Balance':'Wallet Balance'}</span>
          <span style={{ fontWeight:800, fontSize:16, color:method==='inrt'?T.inrt:T.text, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {method==='inrt' ? `${inrtBal.toLocaleString()} INRT` : `₹${bal.toLocaleString('en-IN')}`}
          </span>
        </div>

        {/* UPI form */}
        {method==='upi'&&(
          <div style={{ marginBottom:16 }}>
            <p style={S.label}>RECIPIENT UPI ID</p>
            <input value={upiId} onChange={e=>setUpiId(e.target.value)} placeholder="name@upi"
              style={S.input}/>
          </div>
        )}

        {/* Bank form */}
        {method==='bank'&&(
          <div style={{ marginBottom:16 }}>
            <p style={S.label}>ACCOUNT HOLDER NAME</p>
            <input value={accName} onChange={e=>setAccName(e.target.value)} placeholder="Full name" style={S.input}/>
            <p style={S.label}>ACCOUNT NUMBER</p>
            <input value={accNo} onChange={e=>setAccNo(e.target.value.replace(/\D/g,''))} placeholder="Account number" style={S.input}/>
            <p style={S.label}>IFSC CODE</p>
            <input value={ifsc} onChange={e=>setIfsc(e.target.value.toUpperCase())} placeholder="e.g. HDFC0001234" maxLength={11}
              style={{ ...S.input, marginBottom:0, fontFamily:'monospace' }}/>
          </div>
        )}

        {/* INRT form */}
        {method==='inrt'&&(
          <div style={{ marginBottom:16 }}>
            <div style={{ background:'rgba(123,47,190,0.05)', border:'1px solid rgba(123,47,190,0.15)', borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
              <p style={{ color:T.inrt, fontWeight:700, fontSize:12, margin:'0 0 4px' }}>🌍 Send INRT Anywhere in the World</p>
              <p style={{ color:T.muted, fontSize:12, margin:0, lineHeight:1.6 }}>1 INRT = ₹1 always · Zero fees · Delivered in 2-4 seconds</p>
            </div>
            <p style={S.label}>RECIPIENT INRT ADDRESS</p>
            <input value={inrtAddress} onChange={e=>setInrtAddress(e.target.value.toUpperCase())}
              placeholder="INRT-XXXX-XXXX-XXXX" maxLength={20}
              style={{ ...S.input, fontFamily:'monospace', letterSpacing:1, marginBottom:8 }}/>
            {lookupLoading && <p style={{ color:T.muted, fontSize:12, margin:'0 0 12px' }}>🔍 Looking up address…</p>}
            {lookupErr && <p style={{ color:T.red, fontSize:12, margin:'0 0 12px' }}>{lookupErr}</p>}
            {recipient && (
              <div style={{ background:T.greenL, border:`1px solid ${T.green}30`, borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:16 }}>✅</span>
                <div>
                  <p style={{ fontWeight:700, fontSize:13, margin:0, color:T.text }}>{recipient.name}</p>
                  <p style={{ color:T.green, fontSize:11, margin:0 }}>{recipient.verified?'KYC Verified ✓':'Address confirmed'}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Amount */}
        <p style={S.label}>AMOUNT {method==='inrt'?'(INRT)':''}</p>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:T.light, borderRadius:14, padding:'12px 16px', marginBottom:8, border:`1.5px solid ${amount?(method==='inrt'?T.inrt:T.navy):T.border}` }}>
          <span style={{ color:method==='inrt'?T.inrt:T.navy, fontSize:22, fontWeight:800 }}>{method==='inrt'?'🪙':'₹'}</span>
          <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0"
            style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:T.text }}/>
        </div>

        {/* Quick amounts */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {[100,200,500,1000].map(v=>(
            <button key={v} onClick={()=>setAmount(String(v))} style={{ flex:1, padding:'9px 0', borderRadius:10, border:`1px solid ${T.border}`, background:'transparent', cursor:'pointer', fontSize:13, fontWeight:700, color:T.navy, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {method==='inrt'?'':'₹'}{v}
            </button>
          ))}
        </div>

        {/* Note */}
        <p style={S.label}>NOTE (OPTIONAL)</p>
        <input value={note} onChange={e=>setNote(e.target.value)} placeholder="What's this for?"
          style={{ ...S.input, marginBottom:20 }}/>

        {amount && parseFloat(amount) > (method==='inrt'?inrtBal:bal) && (
          <p style={{ color:T.red, fontSize:12, marginBottom:12, textAlign:'center' as const }}>
            Insufficient {method==='inrt'?'INRT':'wallet'} balance
          </p>
        )}

        <button style={{ ...S.btnPrimary, opacity:canContinue()?1:0.5 }} disabled={!canContinue()} onClick={()=>setStep('review')}>
          Continue →
        </button>
      </div>
    </div>
  );
}

const S: Record<string,any> = {
  page:     { maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.card, fontFamily:"'Plus Jakarta Sans',sans-serif" },
  backBtn:  { background:'none', border:'none', color:T.accent, cursor:'pointer', fontSize:14, fontWeight:700, padding:'0 0 20px', display:'block' },
  h2:       { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:22, color:T.text, margin:0 },
  card:     { background:T.card, borderRadius:18, border:`1px solid ${T.border}`, padding:'16px 18px', boxShadow:'0 2px 12px rgba(10,37,64,0.06)' },
  label:    { fontSize:11, color:T.muted, fontWeight:700, letterSpacing:0.5, margin:'0 0 8px' },
  input:    { width:'100%', padding:'13px 14px', borderRadius:12, border:`1.5px solid ${T.border}`, fontSize:15, outline:'none', boxSizing:'border-box' as const, fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:16, color:T.text },
  btnPrimary:{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:T.navy, color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", boxShadow:'0 4px 16px rgba(10,37,64,0.2)' },
  btnOutline:{ width:'100%', padding:'14px', borderRadius:14, border:`1.5px solid ${T.accent}`, background:'transparent', color:T.accent, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" },
};
