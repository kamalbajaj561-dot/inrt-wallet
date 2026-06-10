/**
 * INRT WALLET — KYCPage.tsx (Fixed)
 * - Better polling with timeout
 * - Clear status messages
 * - Retry on warning/failure
 * - Shows what documents are needed
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation }     from 'react-router-dom';
import { useAuth }                      from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || '';

type Screen = 'intro' | 'waiting' | 'success' | 'failed' | 'timeout';

export default function KYCPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [screen,   setScreen]   = useState<Screen>('intro');
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');
  const [elapsed,  setElapsed]  = useState(0);
  const [attempts, setAttempts] = useState(0);

  const pollRef    = useRef<any>(null);
  const timerRef   = useRef<any>(null);
  const MAX_WAIT   = 300; // 5 minutes max

  const kycStatus = userProfile?.kycStatus || 'not_started';

  // ── Auto-start polling if returning from Didit ──────────────
  useEffect(() => {
    const params   = new URLSearchParams(location.search);
    const returned = location.pathname.includes('kyc-complete') || params.get('session_id');
    if (returned && user && kycStatus !== 'verified') {
      setScreen('waiting');
      startPolling();
    }
    return () => stopAll();
  }, []);

  // ── If user was already in_progress when they open KYC ──────
  useEffect(() => {
    if (kycStatus === 'in_progress' && screen === 'intro') {
      setScreen('waiting');
      startPolling();
    }
    if (kycStatus === 'verified') setScreen('success');
    if (kycStatus === 'rejected') setScreen('failed');
  }, [kycStatus]);

  const stopAll = () => {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
  };

  // ── Countdown timer ──────────────────────────────────────────
  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(e => {
        if (e >= MAX_WAIT) {
          stopAll();
          setScreen('timeout');
          return e;
        }
        return e + 1;
      });
    }, 1000);
  };

  // ── Poll every 8 seconds ─────────────────────────────────────
  const startPolling = () => {
    stopAll();
    startTimer();
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setAttempts(count);
      try {
        const r = await fetch(`${API}/kyc/didit-status/${user!.uid}`);
        const d = await r.json();

        if (d.status === 'verified') {
          stopAll();
          await refreshProfile();
          setScreen('success');
        } else if (d.status === 'rejected') {
          stopAll();
          await refreshProfile();
          setScreen('failed');
        } else if (count >= 37) {
          // 37 × 8s = ~5 minutes
          stopAll();
          setScreen('timeout');
        }
      } catch { /* keep polling */ }
    }, 8000);
  };

  // ── Start KYC ────────────────────────────────────────────────
  const handleStart = async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`${API}/kyc/didit-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.uid }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to start KYC');
      window.location.href = d.url;
    } catch (e: any) {
      setErr(e.message || 'Failed to start verification. Please try again.');
      setLoading(false);
    }
  };

  const fmt = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

  // ── Already verified ─────────────────────────────────────────
  if (kycStatus === 'verified' || screen === 'success') return (
    <div style={S.page}>
      <div style={S.centered}>
        <div style={S.icon('#00C853')}>✅</div>
        <h2 style={S.h2}>KYC Verified!</h2>
        <p style={S.sub}>Your identity is verified. Daily limit increased to ₹1,00,000.</p>
        <div style={{ display:'flex', gap:10, width:'100%', marginBottom:24 }}>
          {[['Daily Limit','₹1,00,000'],['Reward','+500 INRT'],['Status','Verified ✓']].map(([k,v])=>(
            <div key={k} style={S.statBox}>
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:10, fontWeight:600, margin:'0 0 4px' }}>{k}</p>
              <p style={{ color:'#00e5cc', fontSize:12, fontWeight:700, margin:0 }}>{v}</p>
            </div>
          ))}
        </div>
        <button style={S.btnTeal} onClick={()=>navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  // ── Waiting / Polling ─────────────────────────────────────────
  if (screen === 'waiting') return (
    <div style={S.page}>
      <div style={S.centered}>
        {/* Spinner */}
        <div style={{ width:72, height:72, border:'5px solid rgba(0,229,204,0.1)', borderTopColor:'#00e5cc', borderRadius:'50%', animation:'spin 0.9s linear infinite', marginBottom:24 }}/>
        <h2 style={S.h2}>Verifying Identity…</h2>
        <p style={S.sub}>Please wait while Didit processes your documents.</p>

        {/* Progress */}
        <div style={{ width:'100%', marginBottom:20 }}>
          <div style={{ height:4, background:'rgba(255,255,255,0.08)', borderRadius:4, overflow:'hidden', marginBottom:8 }}>
            <div style={{ height:'100%', width:`${Math.min((elapsed/MAX_WAIT)*100,95)}%`, background:'linear-gradient(90deg,#00e5cc,#0070F3)', borderRadius:4, transition:'width 1s linear' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ color:'rgba(255,255,255,0.3)', fontSize:11 }}>
              {elapsed < 30  ? '🔍 Scanning document…'
              :elapsed < 60  ? '📋 Reading document data…'
              :elapsed < 120 ? '🤳 Matching face…'
              :elapsed < 180 ? '✅ Running final checks…'
              :                '⏳ Almost done…'}
            </span>
            <span style={{ color:'rgba(255,255,255,0.3)', fontSize:11 }}>{fmt(elapsed)}</span>
          </div>
        </div>

        {/* Steps */}
        <div style={{ width:'100%', marginBottom:24 }}>
          {[
            { label:'Document scan',   done: elapsed > 20  },
            { label:'PAN verification',done: elapsed > 45  },
            { label:'Face match',      done: elapsed > 70  },
            { label:'Final approval',  done: elapsed > 120 },
          ].map((s,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:s.done?'rgba(0,200,83,0.15)':'rgba(255,255,255,0.05)', border:`1px solid ${s.done?'#00C853':'rgba(255,255,255,0.1)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>
                {s.done ? '✓' : <span style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.1)', display:'block' }}/>}
              </div>
              <span style={{ color:s.done?'#fff':'rgba(255,255,255,0.3)', fontSize:13, fontWeight:s.done?600:400 }}>{s.label}</span>
              {!s.done && elapsed > i*25 && <span style={{ marginLeft:'auto', width:14, height:14, border:'2px solid rgba(0,229,204,0.3)', borderTopColor:'#00e5cc', borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'block', flexShrink:0 }}/>}
            </div>
          ))}
        </div>

        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'12px 16px', width:'100%', marginBottom:16 }}>
  <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, margin:0, textAlign:'center', lineHeight:1.6 }}>
    Do not close this page. You will be notified automatically when verification is complete.
  </p>
</div>
<button style={{ ...S.btnOutline, marginBottom:10 }}
  onClick={async () => {
    stopAll();
    await fetch(`${API}/kyc/reset-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user!.uid }),
    });
    await refreshProfile();
    setScreen('intro');
    setElapsed(0);
  }}>
  ← I haven't started yet — Go Back
</button>

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // ── Timeout ───────────────────────────────────────────────────
  if (screen === 'timeout') return (
    <div style={S.page}>
      <div style={S.centered}>
        <div style={S.icon('#FF9500')}>⏱️</div>
        <h2 style={S.h2}>Taking Longer Than Usual</h2>
        <p style={S.sub}>Verification is still processing. This can happen with complex documents.</p>

        <div style={{ background:'rgba(255,149,0,0.06)', border:'1px solid rgba(255,149,0,0.15)', borderRadius:14, padding:'16px', width:'100%', marginBottom:24 }}>
          <p style={{ color:'#FF9500', fontWeight:700, fontSize:13, margin:'0 0 8px' }}>What to do:</p>
          {[
            'Wait a few minutes and check again',
            'Make sure your documents were clear and readable',
            'Check that both Aadhaar AND PAN were submitted',
            'Try again with better lighting',
          ].map(t=>(
            <p key={t} style={{ color:'rgba(255,255,255,0.5)', fontSize:12, margin:'4px 0' }}>• {t}</p>
          ))}
        </div>

        <button style={{ ...S.btnTeal, marginBottom:10 }}
          onClick={()=>{ setScreen('waiting'); setElapsed(0); startPolling(); }}>
          🔄 Check Status Again
        </button>
        <button style={{ ...S.btnPrimary, marginBottom:10 }} onClick={handleStart} disabled={loading}>
          {loading?'Starting…':'↩️ Restart Verification'}
        </button>
        <button style={S.btnOutline} onClick={()=>navigate('/dashboard')}>
          Back to Home
        </button>
      </div>
    </div>
  );

  // ── Failed / Rejected ─────────────────────────────────────────
  if (screen === 'failed' || kycStatus === 'rejected') return (
    <div style={S.page}>
      <div style={S.centered}>
        <div style={S.icon('#FF3B30')}>❌</div>
        <h2 style={S.h2}>Verification Failed</h2>
        <p style={S.sub}>
          {userProfile?.kycRejectionReason || 'Your documents could not be verified.'}
        </p>

        <div style={{ background:'rgba(255,59,48,0.06)', border:'1px solid rgba(255,59,48,0.15)', borderRadius:14, padding:'16px', width:'100%', marginBottom:24 }}>
          <p style={{ color:'#FF3B30', fontWeight:700, fontSize:13, margin:'0 0 8px' }}>Common reasons:</p>
          {[
            'Document photo was blurry or unclear',
            'OCR could not read the document text',
            'Face did not match the document photo',
            'Document was expired or damaged',
          ].map(t=>(
            <p key={t} style={{ color:'rgba(255,255,255,0.5)', fontSize:12, margin:'4px 0' }}>• {t}</p>
          ))}
        </div>

        <button style={{ ...S.btnTeal, marginBottom:10 }} onClick={handleStart} disabled={loading}>
          {loading?'Starting…':'🔄 Try Again'}
        </button>
        <button style={S.btnOutline} onClick={()=>navigate('/dashboard')}>
          Back to Home
        </button>
        {err&&<p style={{ color:'#FF3B30', fontSize:13, marginTop:12 }}>{err}</p>}
      </div>
    </div>
  );

  // ── Intro / Main page ─────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.header}>
        <button onClick={()=>navigate('/dashboard')} style={S.backBtn}>←</button>
        <h1 style={S.title}>KYC Verification</h1>
      </div>

      <div style={{ padding:'16px 16px 90px' }}>

        {/* Limit banner */}
        <div style={{ background:'rgba(255,149,0,0.08)', border:'1px solid rgba(255,149,0,0.2)', borderRadius:14, padding:'14px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ color:'#FF9500', fontWeight:700, fontSize:13, margin:'0 0 2px' }}>⚠️ Unverified Account</p>
            <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:0 }}>Daily limit: ₹10,000</p>
          </div>
          <div style={{ textAlign:'right' as const }}>
            <p style={{ color:'#00e5cc', fontWeight:700, fontSize:13, margin:'0 0 2px' }}>After KYC</p>
            <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:0 }}>₹1,00,000/day</p>
          </div>
        </div>

        {/* Benefits */}
        <div style={S.card}>
          <p style={S.cardTitle}>🎯 What you unlock</p>
          {[
            { icon:'💰', t:'₹1,00,000/day limit',   s:'10x higher transfer limit'      },
            { icon:'🪙', t:'+500 INRT Reward',       s:'Bonus on verification'           },
            { icon:'🌍', t:'Global Payments',        s:'Pay worldwide, zero forex'       },
            { icon:'🏦', t:'Bank Withdrawals',       s:'Withdraw to your bank account'   },
          ].map(b=>(
            <div key={b.t} style={S.benefitRow}>
              <div style={S.benefitIcon}>{b.icon}</div>
              <div>
                <p style={{ fontWeight:700, fontSize:14, color:'#fff', margin:0 }}>{b.t}</p>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', margin:'2px 0 0' }}>{b.s}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Documents needed */}
        <div style={S.card}>
          <p style={S.cardTitle}>📋 Documents required</p>
          {[
            
            { icon:'🪪', t:'PAN Card',      s:'Clear photo — text must be readable'},
            { icon:'🤳', t:'Live Selfie',   s:'Face match with your Aadhaar photo' },
          ].map(d=>(
            <div key={d.t} style={S.benefitRow}>
              <div style={{ ...S.benefitIcon, background:'rgba(0,112,243,0.1)', border:'1px solid rgba(0,112,243,0.2)' }}>{d.icon}</div>
              <div>
                <p style={{ fontWeight:700, fontSize:14, color:'#fff', margin:0 }}>{d.t}</p>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', margin:'2px 0 0' }}>{d.s}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tips */}
        <div style={{ background:'rgba(255,214,10,0.04)', border:'1px solid rgba(255,214,10,0.1)', borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
          <p style={{ color:'#FFD60A', fontWeight:700, fontSize:13, margin:'0 0 8px' }}>💡 Tips for fast approval</p>
          {[
            'Use good lighting — avoid shadows on documents',
            'Keep documents flat, all 4 corners visible',
            'Remove any covering (sleeve, hand) from documents',
            'Look directly at camera for selfie',
          ].map(t=>(
            <p key={t} style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:'4px 0' }}>• {t}</p>
          ))}
        </div>

        {/* How it works */}
        <div style={S.card}>
          <p style={S.cardTitle}>⚡ How it works</p>
          {[
            ['1','Tap Start — you\'ll go to our verification page'],
            ['2','Show Aadhaar card to camera (front + back)'],
            ['3','Show PAN card to camera'],
            ['4','Take a selfie for face match'],
            ['5','Return here — auto-approved instantly'],
          ].map(([n,t])=>(
            <div key={n} style={{ display:'flex', gap:12, padding:'7px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(0,229,204,0.1)', border:'1px solid #00e5cc', display:'flex', alignItems:'center', justifyContent:'center', color:'#00e5cc', fontSize:11, fontWeight:800, flexShrink:0 }}>{n}</div>
              <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, margin:0, lineHeight:1.5 }}>{t}</p>
            </div>
          ))}
        </div>

        {/* Powered by */}
        <div style={{ textAlign:'center' as const, marginBottom:16 }}>
          <span style={{ color:'rgba(255,255,255,0.2)', fontSize:11 }}>🔒 Identity verification powered by </span>
          <span style={{ color:'rgba(255,255,255,0.4)', fontSize:11, fontWeight:700 }}>Didit</span>
          <span style={{ color:'rgba(255,255,255,0.2)', fontSize:11 }}> · 500 free verifications/month</span>
        </div>

        {err&&<p style={{ color:'#FF3B30', fontSize:13, marginBottom:12, textAlign:'center' as const }}>{err}</p>}

        <button style={{ ...S.btnTeal, width:'100%', opacity:loading?0.6:1, fontSize:16, padding:'18px 0' }}
          onClick={handleStart} disabled={loading}>
          {loading
            ?<span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
               <span style={{ width:20, height:20, border:'2px solid #000', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/>
               Starting verification…
             </span>
            :'🚀 Start KYC Verification →'
          }
        </button>

        <p style={{ textAlign:'center' as const, color:'rgba(255,255,255,0.2)', fontSize:11, marginTop:12, lineHeight:1.6 }}>
          Takes 2-5 minutes · Data encrypted · By proceeding you agree to our Privacy Policy
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        *{-webkit-tap-highlight-color:transparent}
      `}</style>
    </div>
  );
}

const S: Record<string,any> = {
  page:       { maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#050914', fontFamily:"'Plus Jakarta Sans',sans-serif" },
  header:     { background:'linear-gradient(160deg,#050914,#0a1428)', padding:'52px 20px 16px', display:'flex', alignItems:'center', gap:14, borderBottom:'1px solid rgba(255,255,255,0.06)' },
  backBtn:    { background:'none', border:'none', color:'#00e5cc', fontSize:22, cursor:'pointer', lineHeight:1, flexShrink:0 },
  title:      { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:20, color:'#fff', margin:0 },
  centered:   { display:'flex', flexDirection:'column', alignItems:'center', padding:'60px 24px', textAlign:'center' },
  card:       { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'18px 16px', marginBottom:14 },
  cardTitle:  { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:15, color:'#fff', margin:'0 0 14px' },
  benefitRow: { display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' },
  benefitIcon:{ width:42, height:42, borderRadius:12, background:'rgba(0,229,204,0.08)', border:'1px solid rgba(0,229,204,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 },
  statBox:    { flex:1, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 8px', textAlign:'center' },
  icon:       (c:string) => ({ width:84, height:84, borderRadius:'50%', background:`${c}18`, border:`2px solid ${c}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, marginBottom:20 }),
  h2:         { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:26, color:'#fff', margin:'0 0 8px' },
  sub:        { color:'rgba(255,255,255,0.5)', fontSize:14, marginBottom:24, lineHeight:1.7, maxWidth:320 },
  btnTeal:    { background:'linear-gradient(135deg,#00e5cc,#00b4a0)', color:'#000', border:'none', borderRadius:14, padding:'16px 24px', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", boxShadow:'0 4px 16px rgba(0,229,204,0.3)', width:'100%' },
  btnPrimary: { background:'#0A2540', color:'#fff', border:'none', borderRadius:14, padding:'14px 20px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", width:'100%' },
  btnOutline: { background:'transparent', color:'#00e5cc', border:'1px solid rgba(0,229,204,0.3)', borderRadius:14, padding:'14px 20px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", width:'100%', marginBottom:10 },
};
