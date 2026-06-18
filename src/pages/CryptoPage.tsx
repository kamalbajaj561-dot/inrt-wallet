/**
 * INRT WALLET — CryptoPage.tsx
 * Reads inrtBalance directly from Firestore onSnapshot
 * Replace: src/pages/CryptoPage.tsx
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate }                  from 'react-router-dom';
import { useAuth }                      from '../context/AuthContext';
import { doc, onSnapshot }              from 'firebase/firestore';
import { db as firestoreDb }            from '../lib/firebase';

const API = import.meta.env.VITE_API_URL || '';

type Tab = 'overview' | 'convert' | 'send' | 'receive' | 'history';

const T = {
  bg:'#050914', card:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.08)',
  text:'#fff', muted:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.2)',
  inrt:'#7B2FBE', inrtL:'#E0B0FF', teal:'#00e5cc',
  green:'#00C853', orange:'#FF9500', red:'#FF3B30',
};

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
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>Enter your PIN to confirm</p>
      <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:28 }}>
        {Array.from({length:6},(_,i)=>(
          <div key={i} style={{ width:14, height:14, borderRadius:'50%', background:i<pin.length?T.inrt:'rgba(255,255,255,0.1)', transition:'background 0.15s' }}/>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:240, margin:'0 auto 16px' }}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i)=>(
          <button key={i} onClick={()=>k==='⌫'?setPin(p=>p.slice(0,-1)):k!==''&&tap(String(k))}
            style={{ height:56, borderRadius:14, border:`1px solid ${T.border}`, background:k===''?'transparent':'rgba(255,255,255,0.05)', fontSize:k==='⌫'?20:22, fontWeight:700, color:T.text, cursor:k===''?'default':'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {k}
          </button>
        ))}
      </div>
      <button onClick={onCancel} style={{ background:'none', border:'none', color:T.muted, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Cancel</button>
    </div>
  );
}

export default function CryptoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Direct Firestore subscription — never stale ───────────────
  const [profile, setProfile] = useState<any>(null);
  const [ready,   setReady]   = useState(false);
  const [tab,     setTab]     = useState<Tab>('overview');
  const [wallet,  setWallet]  = useState<{inrtAddress:string;name:string}|null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb,'users',user.uid), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setProfile(data);
        setReady(true);
        if (data.inrtAddress) setWallet({ inrtAddress:data.inrtAddress, name:data.name||'INRT User' });
      }
    });
    return () => unsub();
  }, [user?.uid]);

  // Load wallet address if not in profile
  useEffect(() => {
    if (!user?.uid || wallet) return;
    fetch(`${API}/inrt/wallet/${user.uid}`)
      .then(r=>r.json())
      .then(d=>{ if (d.success) setWallet({ inrtAddress:d.inrtAddress, name:d.name }); })
      .catch(()=>{});
  }, [user?.uid, wallet]);

  // ── Read inrtBalance directly from Firestore snapshot ─────────
  const inrtBal = Number(profile?.inrtBalance ?? 0);
  const inrBal  = Number(profile?.balance ?? 0);

  // ── Convert state ─────────────────────────────────────────────
  const [convDir,     setConvDir]     = useState<'inr_to_inrt'|'inrt_to_inr'>('inr_to_inrt');
  const [convAmt,     setConvAmt]     = useState('');
  const [convLoading, setConvLoading] = useState(false);
  const [convDone,    setConvDone]    = useState(false);
  const [convErr,     setConvErr]     = useState('');

  // ── Send state ────────────────────────────────────────────────
  type SendStep = 'form'|'review'|'pin'|'processing'|'done'|'failed';
  const [sendStep,  setSendStep]  = useState<SendStep>('form');
  const [toAddress, setToAddress] = useState('');
  const [recipient, setRecipient] = useState<{name:string;verified:boolean}|null>(null);
  const [lookupErr, setLookupErr] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [sendAmt,   setSendAmt]   = useState('');
  const [sendNote,  setSendNote]  = useState('');
  const [sendErr,   setSendErr]   = useState('');
  const [txRef,     setTxRef]     = useState('');
  const [elapsed,   setElapsed]   = useState(0);
  const [durationMs,setDurationMs]= useState(0);
  const pollRef  = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // ── History state ─────────────────────────────────────────────
  const [history,        setHistory]        = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'history' || !user?.uid) return;
    setHistoryLoading(true);
    fetch(`${API}/inrt/history/${user.uid}`)
      .then(r=>r.json()).then(d=>setHistory(d.transactions||[]))
      .catch(()=>{}).finally(()=>setHistoryLoading(false));
  }, [tab, user?.uid]);

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }, []);

  // ── Lookup INRT address ───────────────────────────────────────
  useEffect(() => {
    const addr = toAddress.toUpperCase().trim();
    if (addr.length < 15) { setRecipient(null); setLookupErr(''); return; }
    setLookupLoading(true); setLookupErr(''); setRecipient(null);
    const t = setTimeout(() => {
      fetch(`${API}/inrt/lookup/${addr}`)
        .then(r=>r.json())
        .then(d=>{ if (d.success) setRecipient({name:d.name,verified:d.verified}); else setLookupErr(d.error||'Not found'); })
        .catch(()=>setLookupErr('Lookup failed'))
        .finally(()=>setLookupLoading(false));
    }, 500);
    return () => clearTimeout(t);
  }, [toAddress]);

  // ── Convert ───────────────────────────────────────────────────
  const handleConvert = async () => {
    const amt = parseFloat(convAmt);
    if (!amt || amt <= 0) return;
    setConvLoading(true); setConvErr('');
    try {
      const r = await fetch(`${API}/inrt/convert`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ userId:user!.uid, direction:convDir, amount:amt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error||'Failed');
      setConvDone(true); setConvAmt('');
      setTimeout(()=>setConvDone(false), 3000);
    } catch (e:any) { setConvErr(e.message); }
    setConvLoading(false);
  };

  // ── Send ──────────────────────────────────────────────────────
  const startSendPolling = (ref: string) => {
    setElapsed(0);
    timerRef.current = setInterval(()=>setElapsed(e=>e+100), 100);
    pollRef.current  = setInterval(async () => {
      try {
        const r = await fetch(`${API}/inrt/transfer/${ref}`);
        const d = await r.json();
        if (d.status==='completed') {
          clearInterval(pollRef.current); clearInterval(timerRef.current);
          setDurationMs(d.durationMs); setSendStep('done');
        } else if (d.status==='failed') {
          clearInterval(pollRef.current); clearInterval(timerRef.current);
          setSendStep('failed');
        }
      } catch {}
    }, 300);
  };

  const handleSend = async () => {
    setSendErr('');
    try {
      const r = await fetch(`${API}/inrt/send`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fromUserId:user!.uid, toAddress, amount:parseFloat(sendAmt), note:sendNote }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error||'Failed');
      setTxRef(d.ref); setSendStep('processing'); startSendPolling(d.ref);
    } catch (e:any) { setSendErr(e.message); setSendStep('review'); }
  };

  const resetSend = () => {
    setSendStep('form'); setToAddress(''); setSendAmt(''); setSendNote('');
    setRecipient(null); setTxRef(''); setSendErr(''); setElapsed(0); setDurationMs(0);
    clearInterval(pollRef.current); clearInterval(timerRef.current);
  };

  const fmtMs = (ms:number) => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(2)}s`;

  if (!ready) return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:40, height:40, border:`3px solid rgba(123,47,190,0.2)`, borderTopColor:T.inrt, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif", paddingBottom:40 }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{ background:`linear-gradient(160deg,${T.inrt} 0%,#3D0D7B 55%,${T.bg} 100%)`, padding:'52px 20px 28px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          <button onClick={()=>navigate('/dashboard')} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:18 }}>←</button>
          <div>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:12, margin:0 }}>INRT Pay</p>
            <h1 style={{ color:'#fff', fontSize:18, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Global Stablecoin Wallet</h1>
          </div>
        </div>

        {/* Single big balance */}
        <div style={{ textAlign:'center', marginBottom:16 }}>
          <p style={{ color:'rgba(224,176,255,0.5)', fontSize:11, margin:'0 0 6px', letterSpacing:1 }}>INRT BALANCE</p>
          <p style={{ color:'#fff', fontSize:46, fontWeight:800, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif", lineHeight:1 }}>
            {inrtBal.toLocaleString('en-IN')}
          </p>
          <p style={{ color:'rgba(224,176,255,0.5)', fontSize:14, margin:0 }}>INRT · ≈ ₹{inrtBal.toLocaleString('en-IN')} · 1 INRT = ₹1 🔒</p>
        </div>

        {/* Quick action row */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          {[{t:'send' as Tab,icon:'📤',l:'Send'},{t:'convert' as Tab,icon:'🔁',l:'Convert'},{t:'receive' as Tab,icon:'📥',l:'Receive'}].map(b=>(
            <button key={b.t} onClick={()=>{setTab(b.t);if(b.t==='send')resetSend();}}
              style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:12, padding:'10px 0', cursor:'pointer', color:'#fff', fontSize:12, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {b.icon} {b.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB BAR ─────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:6, padding:'12px 16px 0', overflowX:'auto' as const, background:T.bg }}>
        {(['overview','convert','send','receive','history'] as Tab[]).map(t=>(
          <button key={t} onClick={()=>{setTab(t);if(t==='send')resetSend();}}
            style={{ padding:'8px 16px', borderRadius:20, border:`1.5px solid ${tab===t?T.inrt:T.border}`, background:tab===t?T.inrt:'transparent', color:tab===t?'#fff':T.muted, fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' as const, fontFamily:"'Plus Jakarta Sans',sans-serif", flexShrink:0 }}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ padding:'14px 16px' }}>

        {/* ══════════ OVERVIEW ══════════ */}
        {tab==='overview'&&(
          <div>
            {/* Address card */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'14px 16px', marginBottom:12, cursor:'pointer' }} onClick={()=>setTab('receive')}>
              <p style={{ color:T.muted, fontSize:10, fontWeight:700, margin:'0 0 4px', letterSpacing:0.5 }}>YOUR INRT ADDRESS</p>
              <p style={{ color:'#fff', fontSize:14, fontWeight:700, margin:0, fontFamily:'monospace' }}>{wallet?.inrtAddress||'Generating…'}</p>
              <p style={{ color:T.teal, fontSize:11, margin:'4px 0 0' }}>Tap to share or show QR →</p>
            </div>

            {/* Buy more INRT */}
            <div onClick={()=>navigate('/checkout')} style={{ background:`linear-gradient(135deg,${T.inrt}20,rgba(0,229,204,0.08))`, border:`1px solid ${T.inrt}30`, borderRadius:16, padding:'16px', marginBottom:12, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <p style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>🪙 Buy or Sell INRT</p>
                <p style={{ color:T.muted, fontSize:12, margin:0 }}>Convert ₹ to INRT · Pay with UPI or Card</p>
              </div>
              <span style={{ color:T.inrtL, fontSize:22 }}>→</span>
            </div>

            {/* What is INRT */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'16px', marginBottom:12 }}>
              <p style={{ color:'#fff', fontWeight:800, fontSize:14, margin:'0 0 10px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>🪙 What is INRT?</p>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 12px', lineHeight:1.7 }}>
                INRT is a Rupee-pegged digital currency. 1 INRT = ₹1 always. Send INRT to anyone in the world instantly with zero forex fees. Blockchain listing on Polygon coming Q3 2026.
              </p>
              <div style={{ display:'flex', flexWrap:'wrap' as const, gap:8 }}>
                {['1 INRT = ₹1 Always','Zero Forex Fees','Global Transfers','2-4 sec Delivery'].map(t=>(
                  <span key={t} style={{ background:`rgba(0,229,204,0.08)`, border:`1px solid ${T.teal}30`, borderRadius:20, padding:'4px 12px', color:T.teal, fontSize:11, fontWeight:700 }}>{t}</span>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'16px' }}>
              <p style={{ color:'#fff', fontWeight:800, fontSize:14, margin:'0 0 12px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>⚡ How to send INRT globally</p>
              {[
                ['1','Tap Send above — enter recipient\'s INRT address'],
                ['2','Enter amount — 1 INRT = ₹1, no fees'],
                ['3','Confirm with PIN — transaction broadcasts'],
                ['4','Live timer shows delivery time (~2-4 seconds)'],
                ['5','Recipient sees INRT in their wallet instantly'],
              ].map(([n,t])=>(
                <div key={n} style={{ display:'flex', gap:12, padding:'7px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:`rgba(123,47,190,0.2)`, border:`1px solid ${T.inrt}`, display:'flex', alignItems:'center', justifyContent:'center', color:T.inrtL, fontSize:11, fontWeight:800, flexShrink:0 }}>{n}</div>
                  <p style={{ color:T.muted, fontSize:12, margin:0, lineHeight:1.6 }}>{t}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ CONVERT ══════════ */}
        {tab==='convert'&&(
          <div>
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px', marginBottom:12 }}>
              <p style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 16px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>🔁 Convert — Always 1:1, No Fees</p>

              {/* From */}
              <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'0 0 6px' }}>FROM</p>
              <div style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px', marginBottom:6, display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'#fff', fontWeight:700 }}>{convDir==='inr_to_inrt'?'₹ INR Wallet':'🪙 INRT'}</span>
                <span style={{ color:T.muted, fontSize:12 }}>Balance: {convDir==='inr_to_inrt'?`₹${inrBal.toLocaleString()} in wallet`:`${inrtBal.toLocaleString()} INRT`}</span>
              </div>

              <div style={{ textAlign:'center', padding:'6px 0' }}>
                <button onClick={()=>{ setConvDir(d=>d==='inr_to_inrt'?'inrt_to_inr':'inr_to_inrt'); setConvAmt(''); setConvErr(''); }}
                  style={{ background:`rgba(123,47,190,0.15)`, border:`1px solid ${T.inrt}40`, borderRadius:'50%', width:38, height:38, cursor:'pointer', fontSize:18, color:T.inrtL }}>
                  ⇅
                </button>
              </div>

              {/* To */}
              <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'6px 0 6px' }}>TO</p>
              <div style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px', marginBottom:14, display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'#fff', fontWeight:700 }}>{convDir==='inr_to_inrt'?'🪙 INRT':'₹ INR Wallet'}</span>
                <span style={{ color:T.muted, fontSize:12 }}>Balance: {convDir==='inr_to_inrt'?`${inrtBal.toLocaleString()} INRT`:`₹${inrBal.toLocaleString()} in wallet`}</span>
              </div>

              {/* Amount */}
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.04)', borderRadius:14, padding:'14px 16px', border:`1.5px solid ${convAmt?T.inrt:T.border}`, marginBottom:6 }}>
                <span style={{ color:T.inrtL, fontSize:22, fontWeight:800 }}>{convDir==='inr_to_inrt'?'₹':'🪙'}</span>
                <input type="number" value={convAmt} onChange={e=>setConvAmt(e.target.value)} placeholder="0"
                  style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:'#fff' }}/>
              </div>
              {convAmt&&parseFloat(convAmt)>0&&<p style={{ color:T.teal, fontSize:13, margin:'0 0 10px' }}>= {convDir==='inr_to_inrt'?`${parseFloat(convAmt).toLocaleString()} INRT`:`₹${parseFloat(convAmt).toLocaleString()}`} · No fees</p>}

              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
                {[100,500,1000,'Max'].map(a=>(
                  <button key={a} onClick={()=>setConvAmt(a==='Max'?String(convDir==='inr_to_inrt'?inrBal:inrtBal):String(a))}
                    style={{ padding:'9px 0', borderRadius:10, border:`1px solid ${T.border}`, background:'transparent', cursor:'pointer', fontSize:13, fontWeight:700, color:T.inrtL, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                    {a==='Max'?'Max':`${convDir==='inr_to_inrt'?'₹':''}${a}`}
                  </button>
                ))}
              </div>

              {convErr&&<p style={{ color:T.red, fontSize:13, marginBottom:10 }}>{convErr}</p>}

              {convDone ? (
                <div style={{ background:'rgba(0,200,83,0.1)', border:`1px solid ${T.green}40`, borderRadius:12, padding:'14px', textAlign:'center' as const }}>
                  <p style={{ color:T.green, fontWeight:700, fontSize:15, margin:0 }}>✅ Converted successfully!</p>
                </div>
              ) : (
                <button onClick={handleConvert} disabled={convLoading||!convAmt||parseFloat(convAmt)<=0}
                  style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:(!convAmt||parseFloat(convAmt)<=0)?0.5:1 }}>
                  {convLoading?'Converting…':'Convert Now — Instant'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══════════ SEND ══════════ */}
        {tab==='send'&&(
          <div>
            {sendStep==='form'&&(
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px' }}>
                <p style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 6px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>📤 Send INRT Globally</p>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 16px' }}>Balance: {inrtBal.toLocaleString()} INRT</p>

                <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'0 0 8px' }}>RECIPIENT INRT ADDRESS</p>
                <input value={toAddress} onChange={e=>setToAddress(e.target.value.toUpperCase())} placeholder="INRT-XXXX-XXXX-XXXX" maxLength={20}
                  style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:'#fff', fontSize:15, fontFamily:'monospace', outline:'none', boxSizing:'border-box' as const, marginBottom:8, letterSpacing:1 }}/>
                {lookupLoading&&<p style={{ color:T.muted, fontSize:12, margin:'0 0 10px' }}>🔍 Looking up address…</p>}
                {lookupErr&&<p style={{ color:T.red, fontSize:12, margin:'0 0 10px' }}>⚠️ {lookupErr}</p>}
                {recipient&&(
                  <div style={{ background:'rgba(0,200,83,0.08)', border:`1px solid ${T.green}30`, borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', gap:10, alignItems:'center' }}>
                    <span style={{ fontSize:16 }}>✅</span>
                    <div>
                      <p style={{ color:'#fff', fontWeight:700, fontSize:13, margin:0 }}>{recipient.name}</p>
                      <p style={{ color:T.green, fontSize:11, margin:0 }}>{recipient.verified?'KYC Verified ✓':'Address confirmed'}</p>
                    </div>
                  </div>
                )}

                <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'0 0 8px' }}>AMOUNT (INRT)</p>
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.04)', borderRadius:14, padding:'14px 16px', border:`1.5px solid ${sendAmt?T.inrt:T.border}`, marginBottom:6 }}>
                  <span style={{ fontSize:20 }}>🪙</span>
                  <input type="number" value={sendAmt} onChange={e=>setSendAmt(e.target.value)} placeholder="0"
                    style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:'#fff' }}/>
                </div>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 12px' }}>≈ ₹{parseFloat(sendAmt||'0').toLocaleString()} · No fees</p>

                <input value={sendNote} onChange={e=>setSendNote(e.target.value)} placeholder="Note (optional)"
                  style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px', color:'#fff', fontSize:14, outline:'none', boxSizing:'border-box' as const, marginBottom:14, fontFamily:"'Plus Jakarta Sans',sans-serif" }}/>

                {parseFloat(sendAmt||'0') > inrtBal&&<p style={{ color:T.red, fontSize:12, marginBottom:10, textAlign:'center' as const }}>Insufficient INRT. <button onClick={()=>navigate('/checkout')} style={{ background:'none', border:'none', color:T.inrtL, cursor:'pointer', fontWeight:700, fontSize:12 }}>Buy INRT →</button></p>}

                <button onClick={()=>setSendStep('review')} disabled={!recipient||!sendAmt||parseFloat(sendAmt)<=0||parseFloat(sendAmt)>inrtBal}
                  style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:(!recipient||!sendAmt||parseFloat(sendAmt)<=0||parseFloat(sendAmt)>inrtBal)?0.5:1 }}>
                  Continue →
                </button>
              </div>
            )}

            {sendStep==='review'&&(
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px' }}>
                <p style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 16px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Confirm Transfer</p>
                <div style={{ textAlign:'center', marginBottom:16 }}>
                  <p style={{ color:'#fff', fontSize:38, fontWeight:800, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{parseFloat(sendAmt).toLocaleString()} <span style={{ fontSize:18, color:T.inrtL }}>INRT</span></p>
                  <p style={{ color:T.muted, fontSize:13, margin:0 }}>≈ ₹{parseFloat(sendAmt).toLocaleString()}</p>
                </div>
                {[['To',recipient?.name||''],['Address',toAddress],['Fee','₹0 (Free)'],['Est. Delivery','2-4 seconds'],...(sendNote?[['Note',sendNote]]:[])].map(([k,v])=>(
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid rgba(255,255,255,0.05)` }}>
                    <span style={{ color:T.muted, fontSize:13 }}>{k}</span>
                    <span style={{ color:k==='Fee'?T.green:'#fff', fontWeight:600, fontSize:13, fontFamily:k==='Address'?'monospace':'inherit', maxWidth:'60%', textAlign:'right' as const, wordBreak:'break-all' as const }}>{v}</span>
                  </div>
                ))}
                {sendErr&&<p style={{ color:T.red, fontSize:13, marginTop:10 }}>{sendErr}</p>}
                <div style={{ display:'flex', gap:10, marginTop:16 }}>
                  <button onClick={()=>setSendStep('form')} style={{ flex:1, padding:'14px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Back</button>
                  <button onClick={()=>setSendStep('pin')} style={{ flex:2, padding:'14px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Confirm & Send</button>
                </div>
              </div>
            )}

            {sendStep==='pin'&&(
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px' }}>
                <PinPad onComplete={handleSend} onCancel={()=>setSendStep('review')}/>
              </div>
            )}

            {sendStep==='processing'&&(
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'30px 16px', textAlign:'center' as const }}>
                <div style={{ width:60, height:60, border:`4px solid rgba(123,47,190,0.15)`, borderTopColor:T.inrt, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }}/>
                <p style={{ color:'#fff', fontWeight:800, fontSize:17, margin:'0 0 6px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Sending INRT…</p>
                <p style={{ color:T.muted, fontSize:13, margin:'0 0 20px' }}>Delivering to {recipient?.name}</p>
                <div style={{ background:`rgba(123,47,190,0.1)`, border:`1px solid ${T.inrt}30`, borderRadius:12, padding:'14px' }}>
                  <p style={{ color:T.muted, fontSize:10, margin:'0 0 4px', letterSpacing:1 }}>ELAPSED</p>
                  <p style={{ color:T.inrtL, fontSize:30, fontWeight:800, margin:0, fontFamily:'monospace' }}>{fmtMs(elapsed)}</p>
                </div>
              </div>
            )}

            {sendStep==='done'&&(
              <div style={{ background:T.card, border:`1px solid ${T.green}30`, borderRadius:18, padding:'30px 16px', textAlign:'center' as const }}>
                <div style={{ width:72, height:72, borderRadius:'50%', background:`rgba(0,200,83,0.1)`, border:`2px solid ${T.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 16px' }}>✅</div>
                <p style={{ color:'#fff', fontWeight:800, fontSize:20, margin:'0 0 6px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Transfer Complete!</p>
                <p style={{ color:T.muted, fontSize:13, margin:'0 0 18px' }}>{parseFloat(sendAmt).toLocaleString()} INRT delivered to {recipient?.name}</p>
                <div style={{ background:`rgba(0,229,204,0.08)`, border:`1px solid ${T.teal}30`, borderRadius:12, padding:'14px', marginBottom:16 }}>
                  <p style={{ color:T.muted, fontSize:10, margin:'0 0 4px', letterSpacing:1 }}>⚡ DELIVERED IN</p>
                  <p style={{ color:T.teal, fontSize:30, fontWeight:800, margin:0, fontFamily:'monospace' }}>{fmtMs(durationMs)}</p>
                </div>
                <button onClick={resetSend} style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  Send Another
                </button>
              </div>
            )}

            {sendStep==='failed'&&(
              <div style={{ background:T.card, border:`1px solid ${T.red}30`, borderRadius:18, padding:'30px 16px', textAlign:'center' as const }}>
                <div style={{ width:72, height:72, borderRadius:'50%', background:`rgba(255,59,48,0.1)`, border:`2px solid ${T.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 16px' }}>❌</div>
                <p style={{ color:'#fff', fontWeight:800, fontSize:18, margin:'0 0 6px' }}>Transfer Failed</p>
                <p style={{ color:T.muted, fontSize:13, margin:'0 0 20px' }}>Your INRT has been refunded.</p>
                <button onClick={resetSend} style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:T.inrt, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Try Again</button>
              </div>
            )}
          </div>
        )}

        {/* ══════════ RECEIVE ══════════ */}
        {tab==='receive'&&(
          <div style={{ textAlign:'center' as const }}>
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'24px 16px', marginBottom:12 }}>
              <p style={{ color:T.muted, fontSize:12, margin:'0 0 16px' }}>Share this address to receive INRT from anywhere in the world</p>
              <div style={{ display:'inline-block', padding:14, background:'#fff', borderRadius:14, marginBottom:14 }}>
                {wallet?.inrtAddress ? (
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(wallet.inrtAddress)}`} alt="INRT QR" style={{ width:200, height:200, display:'block' }}/>
                ) : (
                  <div style={{ width:200, height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#999' }}>Generating…</div>
                )}
              </div>
              <p style={{ color:'#fff', fontWeight:800, fontSize:16, margin:'0 0 4px', fontFamily:'monospace', letterSpacing:1 }}>{wallet?.inrtAddress||'—'}</p>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 16px' }}>{wallet?.name}</p>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>wallet&&navigator.clipboard.writeText(wallet.inrtAddress).then(()=>alert('Address copied!'))}
                  style={{ flex:1, padding:'12px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.teal, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  📋 Copy Address
                </button>
                <button onClick={()=>wallet&&navigator.share&&navigator.share({title:'My INRT Wallet',text:wallet.inrtAddress})}
                  style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  📤 Share
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ HISTORY ══════════ */}
        {tab==='history'&&(
          <div>
            {historyLoading ? (
              <div style={{ textAlign:'center', padding:40, color:T.muted }}>Loading…</div>
            ) : history.length===0 ? (
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'40px 20px', textAlign:'center' as const }}>
                <p style={{ fontSize:32, marginBottom:10 }}>🪙</p>
                <p style={{ color:'#fff', fontWeight:700, fontSize:15, margin:'0 0 4px' }}>No INRT activity yet</p>
                <p style={{ color:T.muted, fontSize:13, margin:0 }}>Buy or send INRT to see history here</p>
              </div>
            ) : (
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, overflow:'hidden' }}>
                {history.map((tx,i)=>(
                  <div key={tx.id} style={{ padding:'14px 16px', borderBottom:i<history.length-1?`1px solid rgba(255,255,255,0.05)`:'none' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ display:'flex', gap:10 }}>
                        <div style={{ width:38, height:38, borderRadius:10, background:tx.type==='credit'?'rgba(0,200,83,0.1)':'rgba(123,47,190,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                          {tx.type==='convert'?'🔁':tx.type==='credit'?'📥':'📤'}
                        </div>
                        <div>
                          <p style={{ color:'#fff', fontWeight:700, fontSize:13, margin:0, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{tx.note}</p>
                          <p style={{ color:T.dim, fontSize:11, margin:'2px 0 0' }}>{tx.createdAt?new Date(tx.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}</p>
                        </div>
                      </div>
                      <div style={{ textAlign:'right' as const }}>
                        <p style={{ color:tx.type==='credit'?T.green:'#fff', fontWeight:800, fontSize:13, margin:0 }}>
                          {tx.type==='credit'?'+':tx.type==='debit'?'−':''}{tx.amount?.toLocaleString()} INRT
                        </p>
                        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:700, background:tx.status==='success'?'rgba(0,200,83,0.1)':'rgba(255,149,0,0.1)', color:tx.status==='success'?T.green:T.orange }}>
                          {(tx.status||'').toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {tx.durationMs&&<p style={{ color:T.dim, fontSize:11, margin:'5px 0 0', paddingLeft:48 }}>⚡ Delivered in {fmtMs(tx.durationMs)}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        * { -webkit-tap-highlight-color: transparent; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}
