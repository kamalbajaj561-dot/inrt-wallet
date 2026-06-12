/**
 * INRT WALLET — CryptoPage.tsx
 * Complete INRT Stablecoin Payment System
 *
 * - Convert ₹ <-> INRT (1:1, instant)
 * - Send INRT to any wallet address worldwide
 * - Real-time delivery tracking with elapsed time
 * - Receive — show your global INRT address + QR
 * - Full INRT transaction history
 *
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
  bg: '#050914', card: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)',
  text: '#fff', muted: 'rgba(255,255,255,0.45)', dim: 'rgba(255,255,255,0.25)',
  inrt: '#7B2FBE', inrtL: '#E0B0FF', teal: '#00e5cc', tealD: '#00b4a0',
  green: '#00C853', orange: '#FF9500', red: '#FF3B30',
};

function PinPad({ onComplete, onCancel }: { onComplete: () => void; onCancel: () => void }) {
  const [pin, setPin] = useState<string[]>([]);
  const tap = (d: string) => {
    if (pin.length >= 6) return;
    const next = [...pin, d];
    setPin(next);
    if (next.length === 6) setTimeout(onComplete, 200);
  };
  return (
    <div style={{ textAlign:'center', padding:'20px 0' }}>
      <p style={{ color:T.muted, fontSize:14, marginBottom:20 }}>Enter your 6-digit UPI PIN to confirm</p>
      <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:28 }}>
        {Array.from({length:6},(_,i)=><div key={i} style={{ width:14, height:14, borderRadius:'50%', background:i<pin.length?T.inrt:'rgba(255,255,255,0.1)', transition:'background 0.15s' }}/>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:240, margin:'0 auto' }}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i)=>(
          <button key={i} onClick={()=>k==='⌫'?setPin(p=>p.slice(0,-1)):k!==''&&tap(String(k))}
            style={{ height:54, borderRadius:14, border:`1.5px solid ${T.border}`, background:k===''?'transparent':'rgba(255,255,255,0.04)', fontSize:k==='⌫'?20:22, fontWeight:700, color:T.text, cursor:k===''?'default':'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {k}
          </button>
        ))}
      </div>
      <button onClick={onCancel} style={{ marginTop:20, background:'none', border:'none', color:T.muted, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Cancel</button>
    </div>
  );
}

export default function CryptoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('overview');
  const [profile, setProfile] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [wallet, setWallet] = useState<{ inrtAddress: string; name: string } | null>(null);

  // Convert state
  const [convDir, setConvDir]   = useState<'inr_to_inrt'|'inrt_to_inr'>('inr_to_inrt');
  const [convAmt, setConvAmt]   = useState('');
  const [convLoading, setConvLoading] = useState(false);
  const [convDone, setConvDone] = useState(false);

  // Send state
  type SendStep = 'form' | 'review' | 'pin' | 'processing' | 'done' | 'failed';
  const [sendStep, setSendStep] = useState<SendStep>('form');
  const [toAddress, setToAddress] = useState('');
  const [recipient, setRecipient] = useState<{ name:string; verified:boolean } | null>(null);
  const [lookupErr, setLookupErr] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [sendAmt, setSendAmt] = useState('');
  const [sendNote, setSendNote] = useState('');
  const [sendErr, setSendErr] = useState('');
  const [txRef, setTxRef] = useState('');
  const [txStatus, setTxStatus] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // History state
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Subscribe to user profile ───────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', user.uid), (snap) => {
      if (snap.exists()) { setProfile(snap.data()); setReady(true); }
    });
    return () => unsub();
  }, [user?.uid]);

  // ── Load / create wallet address ────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    fetch(`${API}/inrt/wallet/${user.uid}`)
      .then(r => r.json())
      .then(d => { if (d.success) setWallet({ inrtAddress: d.inrtAddress, name: d.name }); })
      .catch(()=>{});
  }, [user?.uid]);

  // ── Load history when tab opens ─────────────────────────────
  useEffect(() => {
    if (tab !== 'history' || !user?.uid) return;
    setHistoryLoading(true);
    fetch(`${API}/inrt/history/${user.uid}`)
      .then(r => r.json())
      .then(d => setHistory(d.transactions || []))
      .catch(()=>{})
      .finally(()=>setHistoryLoading(false));
  }, [tab, user?.uid]);

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }, []);

  const inrtBal = Number(profile?.rewardPoints ?? 0);
  const inrBal  = Number(profile?.balance ?? 0);

  // ── Lookup recipient address ────────────────────────────────
  useEffect(() => {
    const addr = toAddress.toUpperCase().trim();
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
  }, [toAddress]);

  // ── Convert ──────────────────────────────────────────────────
  const handleConvert = async () => {
    const amt = parseFloat(convAmt);
    if (!amt || amt <= 0) return;
    setConvLoading(true);
    try {
      const r = await fetch(`${API}/inrt/convert`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ userId: user!.uid, direction: convDir, amount: amt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setConvDone(true);
      setTimeout(() => { setConvDone(false); setConvAmt(''); }, 2500);
    } catch (e: any) {
      alert(e.message || 'Conversion failed');
    }
    setConvLoading(false);
  };

  // ── Send flow ────────────────────────────────────────────────
  const startSendPolling = (ref: string) => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 100), 100);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API}/inrt/transfer/${ref}`);
        const d = await r.json();
        setTxStatus(d);
        if (d.status === 'completed') {
          clearInterval(pollRef.current); clearInterval(timerRef.current);
          setElapsed(d.durationMs);
          setSendStep('done');
        } else if (d.status === 'failed') {
          clearInterval(pollRef.current); clearInterval(timerRef.current);
          setSendStep('failed');
        }
      } catch {}
    }, 200);
  };

  const handleSend = async () => {
    setSendErr('');
    try {
      const r = await fetch(`${API}/inrt/send`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ fromUserId: user!.uid, toAddress, amount: parseFloat(sendAmt), note: sendNote }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setTxRef(d.ref);
      setSendStep('processing');
      startSendPolling(d.ref);
    } catch (e: any) {
      setSendErr(e.message || 'Send failed');
      setSendStep('review');
    }
  };

  const resetSend = () => {
    setSendStep('form'); setToAddress(''); setSendAmt(''); setSendNote('');
    setRecipient(null); setTxRef(''); setTxStatus(null); setSendErr(''); setElapsed(0);
    clearInterval(pollRef.current); clearInterval(timerRef.current);
  };

  const fmtMs = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(2)}s`;

  if (!ready) return (
    <div style={{ minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:40, height:40, border:'3px solid rgba(123,47,190,0.2)', borderTopColor:T.inrt, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif", paddingBottom:40 }}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{ background:`linear-gradient(160deg,${T.inrt} 0%,#3D0D7B 60%,${T.bg} 100%)`, padding:'52px 20px 30px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
          <button onClick={()=>navigate('/dashboard')} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:18 }}>←</button>
          <div>
            <p style={{ color:'rgba(255,255,255,0.6)', fontSize:12, margin:0 }}>INRT Pay</p>
            <h1 style={{ color:'#fff', fontSize:18, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Global Stablecoin Wallet</h1>
          </div>
        </div>

        {/* Balance */}
        <div style={{ textAlign:'center', marginBottom:8 }}>
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:12, margin:'0 0 6px', letterSpacing:1 }}>TOTAL BALANCE</p>
          <p style={{ color:'#fff', fontSize:42, fontWeight:800, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {inrtBal.toLocaleString('en-IN')} <span style={{ fontSize:22, color:T.inrtL }}>INRT</span>
          </p>
          <p style={{ color:'rgba(224,176,255,0.6)', fontSize:13, margin:0 }}>= ₹{inrtBal.toLocaleString('en-IN')} · 1 INRT = ₹1 🔒</p>
        </div>

        {/* Quick actions */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:20 }}>
          {[
            { t:'overview', icon:'🏠', l:'Overview' },
            { t:'convert',  icon:'🔁', l:'Convert'  },
            { t:'send',     icon:'📤', l:'Send'     },
          ].map(b=>(
            <button key={b.t} onClick={()=>setTab(b.t as Tab)}
              style={{ background:tab===b.t?'rgba(255,255,255,0.18)':'rgba(255,255,255,0.08)', border:`1px solid ${tab===b.t?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.1)'}`, borderRadius:12, padding:'10px 0', cursor:'pointer', color:'#fff', fontSize:12, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {b.icon} {b.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB BAR ─────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:6, padding:'14px 16px 0', overflowX:'auto' as const }}>
        {([['overview','Overview'],['convert','Convert'],['send','Send'],['receive','Receive'],['history','History']] as [Tab,string][]).map(([t,l])=>(
          <button key={t} onClick={()=>{ setTab(t); if(t==='send') resetSend(); }}
            style={{ padding:'8px 16px', borderRadius:20, border:`1.5px solid ${tab===t?T.inrt:T.border}`, background:tab===t?T.inrt:'transparent', color:tab===t?'#fff':T.muted, fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' as const, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding:'16px' }}>

        {/* ══════════════ OVERVIEW TAB ══════════════ */}
        {tab==='overview'&&(
          <div>
            {/* Dual balance cards */}
            <div style={{ display:'flex', gap:10, marginBottom:16 }}>
              <div style={{ flex:1, background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'16px' }}>
                <p style={{ color:T.muted, fontSize:11, margin:'0 0 6px', letterSpacing:0.5 }}>₹ WALLET</p>
                <p style={{ color:'#fff', fontSize:22, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>₹{inrBal.toLocaleString('en-IN')}</p>
              </div>
              <div style={{ flex:1, background:'rgba(123,47,190,0.12)', border:`1px solid ${T.inrt}33`, borderRadius:16, padding:'16px' }}>
                <p style={{ color:T.inrtL, fontSize:11, margin:'0 0 6px', letterSpacing:0.5 }}>🪙 INRT</p>
                <p style={{ color:'#fff', fontSize:22, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{inrtBal.toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* What is INRT */}
            <div style={{ background:'linear-gradient(135deg,rgba(123,47,190,0.12),rgba(0,229,204,0.06))', border:`1px solid ${T.inrt}25`, borderRadius:18, padding:'18px 16px', marginBottom:16 }}>
              <h3 style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 10px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>🪙 What is INRT?</h3>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 12px', lineHeight:1.7 }}>
                INRT is a Rupee-pegged stablecoin. 1 INRT always equals ₹1 — no volatility, no speculation. Send INRT to anyone, anywhere in the world, instantly and with zero forex markup.
              </p>
              <div style={{ display:'flex', flexWrap:'wrap' as const, gap:8 }}>
                {['1 INRT = ₹1 Always','Zero Forex Fees','Global Transfers','2-4 sec Settlement'].map(t=>(
                  <span key={t} style={{ background:'rgba(0,229,204,0.1)', border:`1px solid ${T.teal}33`, borderRadius:20, padding:'4px 12px', color:T.teal, fontSize:11, fontWeight:700 }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Your address quick view */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'14px 16px', marginBottom:16, cursor:'pointer' }} onClick={()=>setTab('receive')}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <p style={{ color:T.muted, fontSize:11, margin:'0 0 4px', letterSpacing:0.5 }}>YOUR INRT ADDRESS</p>
                  <p style={{ color:'#fff', fontSize:14, fontWeight:700, margin:0, fontFamily:'monospace' }}>{wallet?.inrtAddress || 'Generating…'}</p>
                </div>
                <span style={{ color:T.teal, fontSize:20 }}>›</span>
              </div>
            </div>

            {/* How global send works */}
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px' }}>
              <h3 style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 14px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>⚡ How global transfers work</h3>
              {[
                ['1','Enter recipient\'s INRT address (e.g. INRT-XXXX-XXXX-XXXX)'],
                ['2','Enter amount in INRT — confirm with UPI PIN'],
                ['3','Transaction broadcasts to the network'],
                ['4','Live timer shows exact delivery time (~2-4 sec)'],
                ['5','Recipient instantly sees INRT in their wallet'],
              ].map(([n,t])=>(
                <div key={n} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(123,47,190,0.15)', border:`1px solid ${T.inrt}`, display:'flex', alignItems:'center', justifyContent:'center', color:T.inrtL, fontSize:11, fontWeight:800, flexShrink:0 }}>{n}</div>
                  <p style={{ color:T.muted, fontSize:13, margin:0, lineHeight:1.6 }}>{t}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ CONVERT TAB ══════════════ */}
        {tab==='convert'&&(
          <div>
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px', marginBottom:16 }}>
              <h3 style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 16px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>🔁 Convert — Always 1:1</h3>

              {/* From */}
              <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'0 0 8px' }}>FROM</p>
              <div style={{ background:'rgba(255,255,255,0.04)', border:`1.5px solid ${T.border}`, borderRadius:14, padding:'14px 16px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'#fff', fontWeight:700, fontSize:15 }}>{convDir==='inr_to_inrt' ? '₹ INR Wallet' : '🪙 INRT'}</span>
                <span style={{ color:T.muted, fontSize:12 }}>Balance: {convDir==='inr_to_inrt'?`₹${inrBal.toLocaleString()}`:`${inrtBal.toLocaleString()} INRT`}</span>
              </div>

              {/* Swap button */}
              <div style={{ textAlign:'center', padding:'4px 0' }}>
                <button onClick={()=>{ setConvDir(d=>d==='inr_to_inrt'?'inrt_to_inr':'inr_to_inrt'); setConvAmt(''); }}
                  style={{ background:'rgba(123,47,190,0.15)', border:`1px solid ${T.inrt}40`, borderRadius:'50%', width:40, height:40, cursor:'pointer', fontSize:18, color:T.inrtL }}>
                  ⇅
                </button>
              </div>

              {/* To */}
              <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'8px 0 8px' }}>TO</p>
              <div style={{ background:'rgba(255,255,255,0.04)', border:`1.5px solid ${T.border}`, borderRadius:14, padding:'14px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'#fff', fontWeight:700, fontSize:15 }}>{convDir==='inr_to_inrt' ? '🪙 INRT' : '₹ INR Wallet'}</span>
                <span style={{ color:T.muted, fontSize:12 }}>Balance: {convDir==='inr_to_inrt'?`${inrtBal.toLocaleString()} INRT`:`₹${inrBal.toLocaleString()}`}</span>
              </div>

              {/* Amount */}
              <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'0 0 8px' }}>AMOUNT</p>
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.04)', borderRadius:14, padding:'14px 16px', border:`1.5px solid ${convAmt?T.inrt:T.border}`, marginBottom:8 }}>
                <span style={{ color:T.inrtL, fontSize:22, fontWeight:800 }}>{convDir==='inr_to_inrt'?'₹':'🪙'}</span>
                <input type="number" value={convAmt} onChange={e=>setConvAmt(e.target.value)} placeholder="0"
                  style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:'#fff' }}/>
              </div>
              {convAmt && parseFloat(convAmt)>0 && (
                <p style={{ color:T.teal, fontSize:13, fontWeight:600, margin:'0 0 16px' }}>
                  = {convDir==='inr_to_inrt' ? `${parseFloat(convAmt).toLocaleString()} INRT` : `₹${parseFloat(convAmt).toLocaleString()}`} · No fees
                </p>
              )}

              {/* Quick amounts */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
                {[100,500,1000,'Max'].map(a=>(
                  <button key={a} onClick={()=>setConvAmt(a==='Max' ? String(convDir==='inr_to_inrt'?inrBal:inrtBal) : String(a))}
                    style={{ padding:'9px 0', borderRadius:10, border:`1px solid ${T.border}`, background:'transparent', cursor:'pointer', fontSize:13, fontWeight:700, color:T.inrtL, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                    {a===  'Max' ? 'Max' : `${convDir==='inr_to_inrt'?'₹':''}${a}`}
                  </button>
                ))}
              </div>

              {convDone ? (
                <div style={{ background:'rgba(0,200,83,0.1)', border:`1px solid ${T.green}40`, borderRadius:14, padding:'16px', textAlign:'center' }}>
                  <p style={{ color:T.green, fontWeight:700, fontSize:15, margin:0 }}>✅ Converted successfully!</p>
                </div>
              ) : (
                <button onClick={handleConvert} disabled={convLoading || !convAmt || parseFloat(convAmt)<=0}
                  style={{ width:'100%', padding:'16px', borderRadius:14, background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, border:'none', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:(!convAmt||parseFloat(convAmt)<=0)?0.5:1 }}>
                  {convLoading ? '⏳ Converting…' : 'Convert Now — Instant'}
                </button>
              )}
            </div>

            <div style={{ background:'rgba(0,229,204,0.04)', border:`1px solid ${T.teal}20`, borderRadius:14, padding:'12px 16px' }}>
              <p style={{ color:T.teal, fontSize:12, margin:0, lineHeight:1.6 }}>
                💡 Conversion is always 1:1 and instant. Your ₹ wallet and INRT balance are both backed 1-for-1 — convert anytime with zero fees.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════ SEND TAB ══════════════ */}
        {tab==='send'&&(
          <div>
            {/* FORM */}
            {sendStep==='form'&&(
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px' }}>
                <h3 style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 16px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>📤 Send INRT Globally</h3>

                <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'0 0 8px' }}>RECIPIENT INRT ADDRESS</p>
                <input value={toAddress} onChange={e=>setToAddress(e.target.value.toUpperCase())}
                  placeholder="INRT-XXXX-XXXX-XXXX" maxLength={20}
                  style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:'#fff', fontSize:15, fontFamily:'monospace', outline:'none', boxSizing:'border-box' as const, marginBottom:8, letterSpacing:1 }}/>

                {lookupLoading && <p style={{ color:T.muted, fontSize:12, margin:'0 0 12px' }}>🔍 Looking up address…</p>}
                {lookupErr && <p style={{ color:T.red, fontSize:12, margin:'0 0 12px' }}>{lookupErr}</p>}
                {recipient && (
                  <div style={{ background:'rgba(0,200,83,0.08)', border:`1px solid ${T.green}30`, borderRadius:12, padding:'10px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>✅</span>
                    <div>
                      <p style={{ color:'#fff', fontWeight:700, fontSize:13, margin:0 }}>{recipient.name}</p>
                      <p style={{ color:T.green, fontSize:11, margin:0 }}>{recipient.verified ? 'KYC Verified ✓' : 'Address confirmed'}</p>
                    </div>
                  </div>
                )}

                <p style={{ color:T.muted, fontSize:11, fontWeight:700, letterSpacing:0.5, margin:'0 0 8px' }}>AMOUNT (INRT)</p>
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.04)', borderRadius:14, padding:'14px 16px', border:`1.5px solid ${sendAmt?T.inrt:T.border}`, marginBottom:8 }}>
                  <span style={{ fontSize:22 }}>🪙</span>
                  <input type="number" value={sendAmt} onChange={e=>setSendAmt(e.target.value)} placeholder="0"
                    style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:'#fff' }}/>
                </div>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 16px' }}>Available: {inrtBal.toLocaleString()} INRT · Fee: ₹0</p>

                <input value={sendNote} onChange={e=>setSendNote(e.target.value)} placeholder="Note (optional)"
                  style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'12px 14px', color:'#fff', fontSize:14, outline:'none', boxSizing:'border-box' as const, marginBottom:16, fontFamily:"'Plus Jakarta Sans',sans-serif" }}/>

                <button
                  onClick={()=>setSendStep('review')}
                  disabled={!recipient || !sendAmt || parseFloat(sendAmt)<=0 || parseFloat(sendAmt)>inrtBal}
                  style={{ width:'100%', padding:'16px', borderRadius:14, background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, border:'none', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:(!recipient||!sendAmt||parseFloat(sendAmt)<=0||parseFloat(sendAmt)>inrtBal)?0.5:1 }}>
                  Continue →
                </button>
                {sendAmt && parseFloat(sendAmt)>inrtBal && <p style={{ color:T.red, fontSize:12, marginTop:8, textAlign:'center' as const }}>Insufficient INRT balance</p>}
              </div>
            )}

            {/* REVIEW */}
            {sendStep==='review'&&(
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px' }}>
                <h3 style={{ color:'#fff', fontWeight:800, fontSize:15, margin:'0 0 16px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Confirm Transfer</h3>
                <div style={{ textAlign:'center', marginBottom:20 }}>
                  <p style={{ color:'#fff', fontSize:36, fontWeight:800, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{parseFloat(sendAmt).toLocaleString()} INRT</p>
                  <p style={{ color:T.muted, fontSize:13, margin:0 }}>= ₹{parseFloat(sendAmt).toLocaleString()}</p>
                </div>
                {[
                  ['To', recipient?.name || ''],
                  ['Address', toAddress],
                  ['Network Fee', '₹0 (Free)'],
                  ['Est. Delivery', '2-4 seconds'],
                  ...(sendNote ? [['Note', sendNote]] : []),
                ].map(([k,v])=>(
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color:T.muted, fontSize:13 }}>{k}</span>
                    <span style={{ color:k==='Network Fee'?T.green:'#fff', fontWeight:600, fontSize:13, fontFamily:k==='Address'?'monospace':'inherit', maxWidth:'60%', textAlign:'right' as const, wordBreak:'break-all' as const }}>{v}</span>
                  </div>
                ))}
                {sendErr && <p style={{ color:T.red, fontSize:13, marginTop:12 }}>{sendErr}</p>}
                <div style={{ display:'flex', gap:10, marginTop:16 }}>
                  <button onClick={()=>setSendStep('form')} style={{ flex:1, padding:'14px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Back</button>
                  <button onClick={()=>setSendStep('pin')} style={{ flex:2, padding:'14px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Confirm & Send</button>
                </div>
              </div>
            )}

            {/* PIN */}
            {sendStep==='pin'&&(
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'18px 16px' }}>
                <PinPad onComplete={handleSend} onCancel={()=>setSendStep('review')}/>
              </div>
            )}

            {/* PROCESSING — live timer */}
            {sendStep==='processing'&&(
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'30px 16px', textAlign:'center' }}>
                <div style={{ width:64, height:64, border:`4px solid ${T.inrt}30`, borderTopColor:T.inrt, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 20px' }}/>
                <h3 style={{ color:'#fff', fontWeight:800, fontSize:17, margin:'0 0 6px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Broadcasting to Network…</h3>
                <p style={{ color:T.muted, fontSize:13, margin:'0 0 20px' }}>Sending {parseFloat(sendAmt).toLocaleString()} INRT to {recipient?.name}</p>

                <div style={{ background:'rgba(123,47,190,0.1)', border:`1px solid ${T.inrt}30`, borderRadius:14, padding:'16px', marginBottom:16 }}>
                  <p style={{ color:T.muted, fontSize:11, margin:'0 0 6px', letterSpacing:1 }}>ELAPSED TIME</p>
                  <p style={{ color:T.inrtL, fontSize:32, fontWeight:800, margin:0, fontFamily:'monospace' }}>{fmtMs(elapsed)}</p>
                </div>

                {/* Network steps */}
                {[
                  ['Transaction signed', true],
                  ['Broadcasting to INRT network', elapsed > 300],
                  ['Confirming on ledger', elapsed > 1000],
                  ['Crediting recipient wallet', elapsed > 1800],
                ].map(([label, done], i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', textAlign:'left' as const }}>
                    <span style={{ fontSize:14 }}>{done ? '✅' : '⏳'}</span>
                    <span style={{ color:done?'#fff':T.dim, fontSize:12 }}>{label as string}</span>
                  </div>
                ))}
              </div>
            )}

            {/* DONE */}
            {sendStep==='done'&&(
              <div style={{ background:T.card, border:`1px solid ${T.green}30`, borderRadius:18, padding:'30px 16px', textAlign:'center' }}>
                <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(0,200,83,0.1)', border:`2px solid ${T.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 16px' }}>✅</div>
                <h3 style={{ color:'#fff', fontWeight:800, fontSize:20, margin:'0 0 6px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Transfer Complete!</h3>
                <p style={{ color:T.muted, fontSize:13, margin:'0 0 20px' }}>{parseFloat(sendAmt).toLocaleString()} INRT delivered to {recipient?.name}</p>

                {/* Delivery time highlight */}
                <div style={{ background:'rgba(0,229,204,0.08)', border:`1px solid ${T.teal}30`, borderRadius:14, padding:'16px', marginBottom:16 }}>
                  <p style={{ color:T.muted, fontSize:11, margin:'0 0 6px', letterSpacing:1 }}>⚡ DELIVERED IN</p>
                  <p style={{ color:T.teal, fontSize:32, fontWeight:800, margin:0, fontFamily:'monospace' }}>{fmtMs(elapsed)}</p>
                </div>

                <div style={{ textAlign:'left' as const, marginBottom:20 }}>
                  {[['Reference', txRef],['To', toAddress],['Amount', `${parseFloat(sendAmt).toLocaleString()} INRT`],['Status','✅ Delivered']].map(([k,v])=>(
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color:T.muted, fontSize:12 }}>{k}</span>
                      <span style={{ color:'#fff', fontWeight:600, fontSize:12, fontFamily:k==='Reference'||k==='To'?'monospace':'inherit', wordBreak:'break-all' as const, maxWidth:'60%', textAlign:'right' as const }}>{v}</span>
                    </div>
                  ))}
                </div>

                <button onClick={resetSend} style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  Send Another
                </button>
              </div>
            )}

            {/* FAILED */}
            {sendStep==='failed'&&(
              <div style={{ background:T.card, border:`1px solid ${T.red}30`, borderRadius:18, padding:'30px 16px', textAlign:'center' }}>
                <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(255,59,48,0.1)', border:`2px solid ${T.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 16px' }}>❌</div>
                <h3 style={{ color:'#fff', fontWeight:800, fontSize:20, margin:'0 0 6px' }}>Transfer Failed</h3>
                <p style={{ color:T.muted, fontSize:13, margin:'0 0 20px' }}>Your INRT has been refunded to your wallet.</p>
                <button onClick={resetSend} style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:T.inrt, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Try Again</button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ RECEIVE TAB ══════════════ */}
        {tab==='receive'&&(
          <div style={{ textAlign:'center' }}>
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'24px 16px', marginBottom:16 }}>
              <p style={{ color:T.muted, fontSize:12, margin:'0 0 16px' }}>Share this address to receive INRT from anywhere in the world</p>

              {/* QR */}
              <div style={{ display:'inline-block', padding:16, background:'#fff', borderRadius:16, marginBottom:16 }}>
                {wallet?.inrtAddress ? (
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(wallet.inrtAddress)}`} alt="INRT QR" style={{ width:220, height:220, display:'block' }}/>
                ) : (
                  <div style={{ width:220, height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'#999' }}>Loading…</div>
                )}
              </div>

              <p style={{ color:'#fff', fontWeight:800, fontSize:18, margin:'0 0 4px', fontFamily:'monospace', letterSpacing:1 }}>{wallet?.inrtAddress || '—'}</p>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 16px' }}>{wallet?.name}</p>

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>{ if(wallet) navigator.clipboard.writeText(wallet.inrtAddress).then(()=>alert('Address copied!')); }}
                  style={{ flex:1, padding:'12px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.teal, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  📋 Copy Address
                </button>
                <button onClick={()=>{ if(navigator.share && wallet) navigator.share({ title:'My INRT Wallet', text:wallet.inrtAddress }); }}
                  style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:`linear-gradient(135deg,${T.inrt},#5B17A3)`, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  📤 Share
                </button>
              </div>
            </div>

            <div style={{ background:'rgba(0,229,204,0.04)', border:`1px solid ${T.teal}20`, borderRadius:14, padding:'14px 16px', textAlign:'left' as const }}>
              <p style={{ color:T.teal, fontWeight:700, fontSize:13, margin:'0 0 6px' }}>🌍 Works Worldwide</p>
              <p style={{ color:T.muted, fontSize:12, margin:0, lineHeight:1.6 }}>
                Anyone with an INRT wallet — anywhere in the world — can send you INRT using this address. No bank details, no SWIFT codes, no forex fees.
              </p>
            </div>
          </div>
        )}

        {/* ══════════════ HISTORY TAB ══════════════ */}
        {tab==='history'&&(
          <div>
            {historyLoading ? (
              <div style={{ textAlign:'center', padding:40, color:T.muted }}>Loading…</div>
            ) : history.length===0 ? (
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:'40px 20px', textAlign:'center' }}>
                <p style={{ fontSize:32, marginBottom:10 }}>🪙</p>
                <p style={{ color:'#fff', fontWeight:700, fontSize:15, margin:'0 0 4px' }}>No INRT activity yet</p>
                <p style={{ color:T.muted, fontSize:13, margin:0 }}>Convert or send INRT to see history here</p>
              </div>
            ) : (
              <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, overflow:'hidden' }}>
                {history.map((tx,i)=>(
                  <div key={tx.id} style={{ padding:'14px 16px', borderBottom:i<history.length-1?'1px solid rgba(255,255,255,0.05)':'none' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ display:'flex', gap:12 }}>
                        <div style={{ width:38, height:38, borderRadius:10, background:tx.type==='credit'?'rgba(0,200,83,0.1)':'rgba(123,47,190,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                          {tx.type==='convert'?'🔁':tx.type==='credit'?'📥':'📤'}
                        </div>
                        <div>
                          <p style={{ color:'#fff', fontWeight:700, fontSize:13, margin:0, maxWidth:180 }}>{tx.note}</p>
                          <p style={{ color:T.dim, fontSize:11, margin:'2px 0 0' }}>{tx.createdAt ? new Date(tx.createdAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</p>
                        </div>
                      </div>
                      <div style={{ textAlign:'right' as const }}>
                        <p style={{ color:tx.type==='credit'?T.green:'#fff', fontWeight:800, fontSize:14, margin:0 }}>
                          {tx.type==='credit'?'+':tx.type==='debit'?'−':''}{tx.amount?.toLocaleString()} {tx.cat==='crypto'&&tx.type!=='convert'?'INRT':''}
                        </p>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:tx.status==='success'?'rgba(0,200,83,0.12)':tx.status==='processing'?'rgba(255,149,0,0.12)':'rgba(255,59,48,0.12)', color:tx.status==='success'?T.green:tx.status==='processing'?T.orange:T.red }}>
                          {tx.status?.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {tx.durationMs && (
                      <p style={{ color:T.dim, fontSize:11, margin:'6px 0 0', paddingLeft:50 }}>⚡ Delivered in {fmtMs(tx.durationMs)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; }
        input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}
