/**
 * INRT WALLET — KYCPage.tsx (Didit Integration)
 * Replace: src/pages/KYCPage.tsx
 *
 * Flow:
 *   1. User taps "Start KYC"
 *   2. App calls /kyc/didit-session → gets Didit URL
 *   3. User redirected to Didit for face + document scan
 *   4. After completing, user returns to /kyc-complete
 *   5. App polls /kyc/didit-status until verified
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation }     from 'react-router-dom';
import { useAuth }                      from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || '';

export default function KYCPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');
  const [polling,  setPolling]  = useState(false);
  const pollRef = useRef<any>(null);

  const kycStatus = userProfile?.kycStatus || 'not_started';

  // ── If user returns from Didit (/kyc-complete?session_id=xxx) ──
  useEffect(() => {
    const params    = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    const returned  = location.pathname === '/kyc-complete' || sessionId;

    if (returned && user && kycStatus !== 'verified') {
      startPolling();
    }
  }, [location, user]);

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => () => clearInterval(pollRef.current), []);

  // ── Poll for verification result ────────────────────────────
  const startPolling = () => {
    if (polling) return;
    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch(`${API}/kyc/didit-status/${user!.uid}`);
        const d = await r.json();
        if (d.status === 'verified') {
          clearInterval(pollRef.current);
          setPolling(false);
          await refreshProfile();
        } else if (d.status === 'rejected') {
          clearInterval(pollRef.current);
          setPolling(false);
          await refreshProfile();
        } else if (attempts >= 30) {
          // Stop after 5 minutes
          clearInterval(pollRef.current);
          setPolling(false);
        }
      } catch { /* keep polling */ }
    }, 10000); // poll every 10 seconds
  };

  // ── Start Didit verification ────────────────────────────────
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

      // Redirect to Didit verification page
      window.location.href = d.url;

    } catch (e: any) {
      setErr(e.message || 'Failed to start verification. Please try again.');
      setLoading(false);
    }
  };

  // ── Already verified ─────────────────────────────────────────
  if (kycStatus === 'verified') return (
    <div style={S.page}>
      <div style={S.centered}>
        <div style={S.iconGreen}>✅</div>
        <h2 style={S.h2}>KYC Verified!</h2>
        <p style={S.sub}>Your identity is verified. Daily limit: ₹1,00,000</p>
        <div style={S.infoRow}>
          {[['Status','Verified ✓'],['Daily Limit','₹1,00,000'],['Reward','500 INRT added']].map(([k,v])=>(
            <div key={k} style={S.infoItem}>
              <p style={S.infoKey}>{k}</p>
              <p style={S.infoVal}>{v}</p>
            </div>
          ))}
        </div>
        <button style={S.btnTeal} onClick={()=>navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  // ── Rejected ─────────────────────────────────────────────────
  if (kycStatus === 'rejected') return (
    <div style={S.page}>
      <div style={S.centered}>
        <div style={{ ...S.iconGreen, background:'rgba(255,59,48,0.1)', border:'2px solid #FF3B30' }}>❌</div>
        <h2 style={S.h2}>Verification Failed</h2>
        <p style={S.sub}>
          {userProfile?.kycRejectionReason || 'Your identity could not be verified. Please try again with clear documents.'}
        </p>
        <button style={{ ...S.btnTeal, marginBottom:10 }} onClick={handleStart} disabled={loading}>
          {loading ? '⏳ Starting…' : 'Try Again →'}
        </button>
        <button style={S.btnOutline} onClick={()=>navigate('/dashboard')}>Back to Home</button>
        {err && <p style={S.err}>{err}</p>}
      </div>
    </div>
  );

  // ── Polling / waiting for result ─────────────────────────────
  if (polling || kycStatus === 'in_progress') return (
    <div style={S.page}>
      <div style={S.centered}>
        <div style={{ width:80, height:80, border:'5px solid rgba(0,229,204,0.15)', borderTopColor:'#00e5cc', borderRadius:'50%', animation:'spin 0.8s linear infinite', marginBottom:24 }}/>
        <h2 style={S.h2}>Verifying Identity…</h2>
        <p style={S.sub}>
          Please wait while we verify your identity. This usually takes 1-2 minutes.
        </p>
        <div style={{ background:'rgba(0,229,204,0.06)', border:'1px solid rgba(0,229,204,0.12)', borderRadius:14, padding:'14px 18px', marginBottom:20, width:'100%' }}>
          <p style={{ color:'#00e5cc', fontWeight:600, fontSize:13, margin:'0 0 6px' }}>
            🔍 Checking your documents…
          </p>
          <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:0, lineHeight:1.6 }}>
            We are processing your identity verification. Do not close this page.
          </p>
        </div>
        <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12 }}>
          Checking every 10 seconds…
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // ── Main KYC page ─────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={()=>navigate('/dashboard')} style={S.backBtn}>←</button>
        <h1 style={S.title}>KYC Verification</h1>
      </div>

      <div style={{ padding:'16px 16px 90px' }}>

        {/* Limit banner */}
        <div style={{ background:'rgba(255,149,0,0.08)', border:'1px solid rgba(255,149,0,0.2)', borderRadius:14, padding:'14px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ color:'#FF9500', fontWeight:700, fontSize:13, margin:'0 0 2px' }}>⚠️ Unverified Account</p>
            <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:0 }}>Current daily limit: ₹10,000</p>
          </div>
          <div style={{ textAlign:'right' as const }}>
            <p style={{ color:'#00e5cc', fontWeight:700, fontSize:13, margin:'0 0 2px' }}>After KYC</p>
            <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:0 }}>₹1,00,000/day</p>
          </div>
        </div>

        {/* What you get */}
        <div style={S.card}>
          <p style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:16, color:'#fff', margin:'0 0 14px' }}>
            🎯 Complete KYC to unlock
          </p>
          {[
            { icon:'💰', title:'₹1,00,000/day limit', sub:'10x higher daily transfer limit' },
            { icon:'🪙', title:'+500 INRT Rewards',   sub:'Bonus points on verification' },
            { icon:'🌍', title:'Global Payments',     sub:'Send INRT worldwide, zero forex' },
            { icon:'🏦', title:'Bank Withdrawals',    sub:'Withdraw wallet balance to bank' },
          ].map(b=>(
            <div key={b.title} style={{ display:'flex', alignItems:'center', gap:14, padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width:42, height:42, borderRadius:12, background:'rgba(0,229,204,0.08)', border:'1px solid rgba(0,229,204,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{b.icon}</div>
              <div>
                <p style={{ fontWeight:700, fontSize:14, color:'#fff', margin:0 }}>{b.title}</p>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', margin:'2px 0 0' }}>{b.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div style={S.card}>
          <p style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:15, color:'#fff', margin:'0 0 14px' }}>
            ⚡ How it works
          </p>
          {[
            ['1','Tap Start Verification below'],
            ['2','Show your ID document to camera'],
            ['3','Take a quick selfie for face match'],
            ['4','Get verified automatically in 2 minutes'],
          ].map(([n,t])=>(
            <div key={n} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(0,229,204,0.12)', border:'1px solid #00e5cc', display:'flex', alignItems:'center', justifyContent:'center', color:'#00e5cc', fontSize:11, fontWeight:800, flexShrink:0 }}>{n}</div>
              <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, margin:0, lineHeight:1.6 }}>{t}</p>
            </div>
          ))}
        </div>

        {/* Documents needed */}
        <div style={{ background:'rgba(0,112,243,0.06)', border:'1px solid rgba(0,112,243,0.12)', borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
          <p style={{ color:'#0070F3', fontWeight:700, fontSize:13, margin:'0 0 8px' }}>📋 What you need</p>
          {['Any government ID — Aadhaar, PAN, Passport, or Driving License','A device with a working camera','Good lighting'].map(t=>(
            <p key={t} style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:'4px 0' }}>• {t}</p>
          ))}
        </div>

        {/* Powered by Didit */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:16 }}>
          <span style={{ color:'rgba(255,255,255,0.2)', fontSize:11 }}>🔒 Secured & verified by</span>
          <span style={{ color:'rgba(255,255,255,0.4)', fontSize:11, fontWeight:700 }}>Didit Identity</span>
        </div>

        {err && <p style={S.err}>{err}</p>}

        <button style={{ ...S.btnTeal, width:'100%', opacity:loading?0.6:1, fontSize:16, padding:'18px 24px' }}
          onClick={handleStart} disabled={loading}>
          {loading
            ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                <span style={{ width:20, height:20, border:'2px solid #000', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/>
                Starting verification…
              </span>
            : '🚀 Start KYC Verification →'
          }
        </button>

        <p style={{ textAlign:'center' as const, color:'rgba(255,255,255,0.2)', fontSize:11, marginTop:12, lineHeight:1.6 }}>
          Your data is encrypted and only used for identity verification.
          By proceeding you agree to our Privacy Policy.
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:     { maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#050914', fontFamily:"'Plus Jakarta Sans',sans-serif" },
  header:   { background:'linear-gradient(160deg,#050914,#0a1428)', padding:'52px 20px 16px', display:'flex', alignItems:'center', gap:14, borderBottom:'1px solid rgba(255,255,255,0.06)' },
  backBtn:  { background:'none', border:'none', color:'#00e5cc', fontSize:22, cursor:'pointer', lineHeight:1, flexShrink:0 },
  title:    { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:20, color:'#fff', margin:0 },
  centered: { display:'flex', flexDirection:'column' as const, alignItems:'center', padding:'80px 24px', textAlign:'center' as const },
  card:     { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'18px 16px', marginBottom:14 },
  iconGreen:{ width:84, height:84, borderRadius:'50%', background:'rgba(0,200,83,0.1)', border:'2px solid #00C853', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, marginBottom:20 },
  h2:       { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:26, color:'#fff', margin:'0 0 8px' },
  sub:      { color:'rgba(255,255,255,0.5)', fontSize:14, marginBottom:24, lineHeight:1.7, maxWidth:320 },
  infoRow:  { display:'flex', gap:10, marginBottom:24, width:'100%' },
  infoItem: { flex:1, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 8px', textAlign:'center' as const },
  infoKey:  { color:'rgba(255,255,255,0.4)', fontSize:10, fontWeight:600, margin:'0 0 4px' },
  infoVal:  { color:'#00e5cc', fontSize:12, fontWeight:700, margin:0 },
  btnTeal:  { background:'linear-gradient(135deg,#00e5cc,#00b4a0)', color:'#000', border:'none', borderRadius:14, padding:'16px 24px', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", boxShadow:'0 4px 16px rgba(0,229,204,0.3)', width:'100%' },
  btnOutline:{ background:'transparent', color:'#00e5cc', border:'1px solid rgba(0,229,204,0.3)', borderRadius:14, padding:'14px 20px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", width:'100%', marginBottom:10 },
  err:      { color:'#FF3B30', fontSize:13, fontWeight:600, marginTop:12, textAlign:'center' as const },
};
