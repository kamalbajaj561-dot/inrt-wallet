/**
 * INRT WALLET — RechargePage.tsx
 * Real recharge via Ezytm API
 * Auto-detects operator, fetches live plans, processes real recharge
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';

const API = import.meta.env.VITE_API_URL || '';

type RType  = 'prepaid' | 'postpaid' | 'dth';
type RStep  = 'form' | 'plans' | 'confirm' | 'processing' | 'success' | 'failed';

const OPERATORS: Record<RType, string[]> = {
  prepaid:  ['JIO', 'AIRTEL', 'VI', 'BSNL'],
  postpaid: ['JIO', 'AIRTEL', 'VI', 'BSNL'],
  dth:      ['TATAPLAY', 'DISHTV', 'AIRTELDTH', 'SUNDIRECT', 'DDFREEDISH'],
};

const OPERATOR_DISPLAY: Record<string, string> = {
  JIO: 'Jio', AIRTEL: 'Airtel', VI: 'Vi', BSNL: 'BSNL',
  TATAPLAY: 'Tata Play', DISHTV: 'Dish TV',
  AIRTELDTH: 'Airtel DTH', SUNDIRECT: 'Sun Direct',
  DDFREEDISH: 'DD Free Dish',
};

const OPERATOR_COLORS: Record<string, string> = {
  JIO: '#1a73e8', AIRTEL: '#e40000', VI: '#f5003b', BSNL: '#2c7be5',
  TATAPLAY: '#e31837', DISHTV: '#ff6b00', AIRTELDTH: '#e40000',
  SUNDIRECT: '#ff9500', DDFREEDISH: '#0070c0',
};

// Fallback plans if API fails
const FALLBACK_PLANS = [
  { id:'p1', amount:179, validity:'28 days', data:'2GB/day',   calls:'Unlimited', popular:false },
  { id:'p2', amount:239, validity:'28 days', data:'2GB/day',   calls:'Unlimited', popular:true  },
  { id:'p3', amount:299, validity:'28 days', data:'3GB/day',   calls:'Unlimited', popular:false },
  { id:'p4', amount:479, validity:'56 days', data:'2.5GB/day', calls:'Unlimited', popular:false },
  { id:'p5', amount:599, validity:'84 days', data:'2GB/day',   calls:'Unlimited', popular:true  },
  { id:'p6', amount:899, validity:'84 days', data:'3GB/day',   calls:'Unlimited', popular:false },
  { id:'p7', amount:1199,validity:'365 days',data:'2.5GB/day', calls:'Unlimited', popular:false },
  { id:'p8', amount:2999,validity:'365 days',data:'3GB/day',   calls:'Unlimited', popular:false },
];

export default function RechargePage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [type,       setType]      = useState<RType>('prepaid');
  const [operator,   setOperator]  = useState('JIO');
  const [mobile,     setMobile]    = useState('');
  const [step,       setStep]      = useState<RStep>('form');
  const [plans,      setPlans]     = useState<any[]>([]);
  const [plansLoad,  setPlansLoad] = useState(false);
  const [plan,       setPlan]      = useState<any>(null);
  const [custom,     setCustom]    = useState('');
  const [loading,    setLoading]   = useState(false);
  const [err,        setErr]       = useState('');
  const [txResult,   setTxResult]  = useState<any>(null);
  const [detecting,  setDetecting] = useState(false);
  const pollRef = useRef<any>(null);

  const bal = userProfile?.balance || 0;

  // ── Auto-detect operator from mobile number ───────────────
  useEffect(() => {
    const m = mobile.replace(/\D/g, '');
    if (m.length !== 10 || type === 'dth') return;
    setDetecting(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/recharge/operator/${m}`);
        const d = await r.json();
        if (d.operator && d.operator !== 'UNKNOWN') {
          setOperator(d.operator);
        }
      } catch { /* keep current operator */ }
      setDetecting(false);
    }, 800);
    return () => clearTimeout(t);
  }, [mobile, type]);

  // ── Fetch live plans ──────────────────────────────────────
  const fetchPlans = async () => {
    setPlansLoad(true);
    try {
      const r = await fetch(`${API}/recharge/plans?operator=${operator}&circle=MAHARASHTRA`);
      const d = await r.json();
      if (d.success && d.plans && Array.isArray(d.plans) && d.plans.length > 0) {
        setPlans(d.plans);
      } else {
        setPlans(FALLBACK_PLANS);
      }
    } catch {
      setPlans(FALLBACK_PLANS);
    }
    setPlansLoad(false);
  };

  const handleNext = () => {
    const m = mobile.replace(/\D/g, '');
    if (type !== 'dth' && m.length !== 10)
      return setErr('Enter valid 10-digit number');
    setErr('');
    fetchPlans();
    setStep('plans');
  };

  const handleSelectPlan = (p: any) => {
    setPlan(p); setCustom(''); setStep('confirm');
  };

  const handleCustom = () => {
    const amt = parseFloat(custom);
    if (!amt || amt < 10) return setErr('Minimum ₹10');
    setPlan({ id: 'custom', amount: amt, validity: '—', data: '—', calls: '—' });
    setStep('confirm');
  };

  // ── Process recharge ──────────────────────────────────────
  const handlePay = async () => {
    if (!plan || !user) return;
    const amt = plan.amount;
    if (amt > bal) return setErr(`Insufficient balance. You have ₹${bal.toLocaleString('en-IN')}`);
    setLoading(true); setErr(''); setStep('processing');

    try {
      const r = await fetch(`${API}/recharge/do`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:       user.uid,
          mobile:       mobile.replace(/\D/g, ''),
          operator,
          amount:       amt,
          rechargeType: type === 'dth' ? 'D' : type === 'postpaid' ? 'T' : 'P',
        }),
      });
      const d = await r.json();

      if (!r.ok) throw new Error(d.error || 'Recharge failed');

      await refreshProfile();

      if (d.success) {
        setTxResult(d); setStep('success');
      } else if (d.pending) {
        setTxResult(d); setStep('processing');
        // Poll for status every 5 seconds
        pollRef.current = setInterval(async () => {
          try {
            const sr = await fetch(`${API}/recharge/status/${d.orderId}`);
            const sd = await sr.json();
            if (sd.status === 'success') {
              clearInterval(pollRef.current);
              await refreshProfile();
              setTxResult({ ...d, ...sd }); setStep('success');
            } else if (sd.status === 'failed') {
              clearInterval(pollRef.current);
              await refreshProfile();
              setTxResult({ ...d, ...sd }); setStep('failed');
            }
          } catch { /* keep polling */ }
        }, 5000);
      } else {
        setTxResult(d); setStep('failed');
      }
    } catch (e: any) {
      await refreshProfile();
      setErr(e.message || 'Recharge failed');
      setStep('confirm');
    }
    setLoading(false);
  };

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const reset = () => {
    setStep('form'); setPlan(null); setMobile('');
    setCustom(''); setErr(''); setTxResult(''); setPlans([]);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const planAmount = plan?.amount || plan?.AMOUNT || 0;
  const planValidity = plan?.validity || plan?.VALIDITY || '—';
  const planData = plan?.data || plan?.DATA || '—';

  // ── SUCCESS ───────────────────────────────────────────────
  if (step === 'success') return (
    <div style={S.page}>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 24px',textAlign:'center' }}>
        <div style={S.bigIcon('#00d68f')}>✅</div>
        <h2 style={S.successTitle}>Recharge Done!</h2>
        <p style={{ color:'var(--t2)',fontSize:15,marginBottom:6 }}>
          {type !== 'dth' ? `+91 ${mobile}` : `${OPERATOR_DISPLAY[operator]} DTH`} recharged with ₹{planAmount}
        </p>
        {txResult?.txnId && (
          <p style={{ color:'var(--teal)',fontSize:13,marginBottom:24 }}>
            Operator Ref: {txResult.operatorRef || txResult.txnId}
          </p>
        )}
        <div className="card" style={{ width:'100%',marginBottom:24,textAlign:'left' }}>
          {[
            ['Number',     type !== 'dth' ? `+91 ${mobile}` : 'DTH Account'],
            ['Operator',   OPERATOR_DISPLAY[operator] || operator],
            ['Amount',     `₹${planAmount}`],
            ['Validity',   planValidity],
            ['Data',       planData],
            ['Points',     `+${Math.floor(planAmount / 10)} pts`],
            ['Order ID',   txResult?.orderId || '—'],
            ['Status',     '✅ Successful'],
          ].map(([k, v]) => (
            <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--b1)' }}>
              <span style={{ color:'var(--t2)',fontSize:13 }}>{k}</span>
              <span style={{ color:'var(--t1)',fontWeight:700,fontSize:13 }}>{v}</span>
            </div>
          ))}
        </div>
        <button className="btn-primary" onClick={reset}>Recharge Again</button>
        <button className="btn-outline" style={{ marginTop:10 }} onClick={() => navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  // ── PROCESSING ────────────────────────────────────────────
  if (step === 'processing') return (
    <div style={S.page}>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 24px',textAlign:'center' }}>
        <div style={{ width:80,height:80,border:'5px solid var(--teal)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',marginBottom:24 }} />
        <h2 style={S.successTitle}>Processing Recharge…</h2>
        <p style={{ color:'var(--t2)',fontSize:14,lineHeight:1.7,maxWidth:300 }}>
          Your recharge is being processed. This usually takes 30-60 seconds. Please wait.
        </p>
        <p style={{ color:'var(--teal)',fontSize:13,marginTop:16,fontWeight:600 }}>
          Do not close this page
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // ── FAILED ────────────────────────────────────────────────
  if (step === 'failed') return (
    <div style={S.page}>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 24px',textAlign:'center' }}>
        <div style={S.bigIcon('#ff4d6a')}>❌</div>
        <h2 style={S.successTitle}>Recharge Failed</h2>
        <p style={{ color:'var(--t2)',fontSize:14,marginBottom:16,lineHeight:1.7 }}>
          Your recharge could not be processed. Your wallet balance has been refunded automatically.
        </p>
        <div style={{ background:'rgba(255,77,106,0.06)',border:'1px solid rgba(255,77,106,0.2)',borderRadius:'var(--r2)',padding:'12px 16px',marginBottom:24,width:'100%' }}>
          <p style={{ color:'var(--red)',fontSize:13 }}>
            ₹{planAmount} refunded to your INRT wallet
          </p>
        </div>
        <button className="btn-primary" onClick={reset}>Try Again</button>
        <button className="btn-outline" style={{ marginTop:10 }} onClick={() => navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button
          onClick={() => {
            if (step === 'form') navigate('/dashboard');
            else if (step === 'plans') setStep('form');
            else if (step === 'confirm') setStep('plans');
          }}
          className="back-btn">←</button>
        <h1 className="page-title">Recharge</h1>
        <span style={{ color:'var(--teal)',fontSize:12,fontWeight:700 }}>
          ₹{bal.toLocaleString('en-IN')}
        </span>
      </div>

      <div style={{ padding:'16px 16px 90px' }}>

        {/* ── FORM ── */}
        {step === 'form' && (
          <>
            {/* Type tabs */}
            <div style={{ display:'flex',gap:8,marginBottom:16 }}>
              {(['prepaid','postpaid','dth'] as RType[]).map(t => (
                <button key={t} onClick={() => { setType(t); setOperator(OPERATORS[t][0]); setErr(''); }}
                  style={{ flex:1,padding:'10px 0',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,cursor:'pointer',
                            background:type===t?'var(--teal)':'var(--bg-card)',
                            border:`1px solid ${type===t?'var(--teal)':'var(--b1)'}`,
                            color:type===t?'#000':'var(--t2)' }}>
                  {t==='prepaid'?'📱 Prepaid':t==='postpaid'?'📋 Postpaid':'📡 DTH'}
                </button>
              ))}
            </div>

            <div className="card">
              {/* Mobile number */}
              {type !== 'dth' && (
                <>
                  <p className="s-label">MOBILE NUMBER</p>
                  <div style={{ display:'flex',border:'1px solid var(--b1)',borderRadius:'var(--r2)',overflow:'hidden',marginBottom:16 }}>
                    <span style={{ padding:'14px 12px',background:'var(--bg-elevated)',color:'var(--t2)',fontSize:13,borderRight:'1px solid var(--b1)',whiteSpace:'nowrap' }}>
                      🇮🇳 +91
                    </span>
                    <input style={{ flex:1,background:'none',border:'none',outline:'none',padding:'14px',fontSize:15,color:'var(--t1)',fontFamily:'inherit' }}
                      type="tel" maxLength={10} placeholder="10-digit number"
                      value={mobile}
                      onChange={e => { setMobile(e.target.value.replace(/\D/g,'')); setErr(''); }} />
                  </div>
                  {detecting && (
                    <p style={{ color:'var(--teal)',fontSize:12,marginBottom:12 }}>
                      🔍 Detecting operator…
                    </p>
                  )}
                </>
              )}

              {/* Operator selector */}
              <p className="s-label">SELECT OPERATOR</p>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:16 }}>
                {OPERATORS[type].map(op => (
                  <button key={op} onClick={() => setOperator(op)}
                    style={{ padding:'10px 16px',borderRadius:'var(--r1)',fontSize:13,fontWeight:700,cursor:'pointer',
                              background:operator===op?`${OPERATOR_COLORS[op] || 'var(--teal)'}18`:'var(--bg-elevated)',
                              border:`1px solid ${operator===op?OPERATOR_COLORS[op] || 'var(--teal)':'var(--b1)'}`,
                              color:operator===op?OPERATOR_COLORS[op] || 'var(--teal)':'var(--t2)' }}>
                    {OPERATOR_DISPLAY[op] || op}
                  </button>
                ))}
              </div>

              {err && <p className="err-box" style={{ marginBottom:12 }}>⚠️ {err}</p>}

              <button className="btn-primary"
                onClick={handleNext}
                disabled={type !== 'dth' && mobile.replace(/\D/g,'').length !== 10}
                style={{ opacity:type!=='dth'&&mobile.replace(/\D/g,'').length!==10?0.5:1 }}>
                View Plans →
              </button>
            </div>
          </>
        )}

        {/* ── PLANS ── */}
        {step === 'plans' && (
          <>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
              <p className="s-title" style={{ marginBottom:0 }}>
                {OPERATOR_DISPLAY[operator]} Plans
              </p>
              {type !== 'dth' && (
                <span style={{ color:'var(--t3)',fontSize:12 }}>+91 {mobile}</span>
              )}
            </div>

            {/* Custom amount */}
            <div className="card" style={{ marginBottom:14 }}>
              <p className="s-label">CUSTOM AMOUNT</p>
              <div style={{ display:'flex',gap:10 }}>
                <input className="inp" style={{ flex:1 }} type="number"
                  placeholder="Enter amount (min ₹10)"
                  value={custom}
                  onChange={e => { setCustom(e.target.value); setErr(''); }} />
                <button onClick={handleCustom}
                  style={{ padding:'0 20px',background:'var(--g-teal)',border:'none',borderRadius:'var(--r1)',color:'#000',fontWeight:700,cursor:'pointer',fontSize:14 }}>
                  Pay
                </button>
              </div>
              {err && <p className="err-box" style={{ marginTop:8 }}>⚠️ {err}</p>}
            </div>

            {/* Plans list */}
            {plansLoad ? (
              [1,2,3,4].map(i => (
                <div key={i} className="shimmer" style={{ height:80,borderRadius:'var(--r2)',marginBottom:10 }} />
              ))
            ) : (
              (plans.length > 0 ? plans : FALLBACK_PLANS).map((p: any, i: number) => {
                const amt      = p.amount    || p.AMOUNT    || p.rs    || 0;
                const validity = p.validity  || p.VALIDITY  || p.valid || '—';
                const data     = p.data      || p.DATA      || '—';
                const calls    = p.calls     || p.CALLS     || 'Unlimited';
                const desc     = p.desc      || p.DESC      || p.description || '';
                const popular  = p.popular   || false;

                return (
                  <button key={p.id || i} onClick={() => handleSelectPlan(p)}
                    style={{ width:'100%',background:'var(--bg-card)',
                              border:`1px solid ${popular?'rgba(0,229,204,0.3)':'var(--b1)'}`,
                              borderRadius:'var(--r2)',padding:'16px',marginBottom:10,
                              position:'relative',display:'block',textAlign:'left',cursor:'pointer' }}>
                    {popular && (
                      <span style={{ position:'absolute',top:-8,right:12,background:'var(--teal)',color:'#000',fontSize:9,fontWeight:800,padding:'2px 10px',borderRadius:20 }}>
                        POPULAR
                      </span>
                    )}
                    <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8 }}>
                      <div>
                        <p style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:22,color:'var(--teal)' }}>
                          ₹{amt}
                        </p>
                        {desc && <p style={{ color:'var(--t3)',fontSize:11,marginTop:2 }}>{desc}</p>}
                      </div>
                      <span style={{ background:'var(--bg-elevated)',border:'1px solid var(--b1)',borderRadius:'var(--r1)',padding:'4px 10px',color:'var(--t2)',fontSize:11 }}>
                        {validity}
                      </span>
                    </div>
                    <div style={{ display:'flex',gap:14 }}>
                      {[['📶', data], ['📞', calls]].map(([icon, val]) => (
                        <div key={icon} style={{ display:'flex',alignItems:'center',gap:4 }}>
                          <span style={{ fontSize:12 }}>{icon}</span>
                          <span style={{ color:'var(--t2)',fontSize:12 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </>
        )}

        {/* ── CONFIRM ── */}
        {step === 'confirm' && plan && (
          <div>
            {/* Operator badge */}
            <div style={{ display:'flex',alignItems:'center',gap:14,background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r2)',padding:'16px',marginBottom:14 }}>
              <div style={{ width:52,height:52,borderRadius:'var(--r2)',background:`${OPERATOR_COLORS[operator] || 'var(--teal)'}18`,border:`1px solid ${OPERATOR_COLORS[operator] || 'var(--teal)'}30`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:18,color:OPERATOR_COLORS[operator] || 'var(--teal)',flexShrink:0 }}>
                {(OPERATOR_DISPLAY[operator] || operator).charAt(0)}
              </div>
              <div>
                <p style={{ color:'var(--t1)',fontWeight:700,fontSize:16 }}>
                  {OPERATOR_DISPLAY[operator] || operator}
                </p>
                <p style={{ color:'var(--teal)',fontSize:14,marginTop:2 }}>
                  {type !== 'dth' ? `+91 ${mobile}` : 'DTH Account'}
                </p>
              </div>
            </div>

            {/* Plan details */}
            <div className="card" style={{ marginBottom:14 }}>
              <p className="s-title">Plan Details</p>
              {[
                ['Amount',   `₹${planAmount}`],
                ['Validity', planValidity],
                ['Data',     planData],
                ['Calls',    plan.calls || plan.CALLS || 'Unlimited'],
                ['Points',   `+${Math.floor(planAmount / 10)} pts`],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--b1)' }}>
                  <span style={{ color:'var(--t2)',fontSize:13 }}>{k}</span>
                  <span style={{ color:'var(--t1)',fontWeight:600,fontSize:13 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Balance */}
            <div style={{ display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r1)',marginBottom:14 }}>
              <span style={{ color:'var(--t2)',fontSize:13 }}>Wallet balance</span>
              <span style={{ color:planAmount>bal?'var(--red)':'var(--green)',fontWeight:700,fontSize:13 }}>
                ₹{bal.toLocaleString('en-IN')}
              </span>
            </div>

            {err && <p className="err-box" style={{ marginBottom:12 }}>⚠️ {err}</p>}

            <button className="btn-primary"
              onClick={handlePay}
              disabled={loading || planAmount > bal}
              style={{ opacity:loading||planAmount>bal?0.5:1 }}>
              {loading
                ? <span style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:10 }}>
                    <span style={{ width:18,height:18,border:'2px solid #000',borderTopColor:'transparent',borderRadius:'50%',display:'inline-block',animation:'spin 0.7s linear infinite' }}/>
                    Processing…
                  </span>
                : `Recharge ₹${planAmount} →`
              }
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:        { width:'100%', minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' },
  header:      { background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 16px',display:'flex',alignItems:'center',gap:14 },
  successTitle:{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:26,color:'var(--t1)',marginBottom:8 },
  bigIcon:     (c:string): React.CSSProperties => ({ width:84,height:84,borderRadius:'50%',background:`${c}15`,border:`2px solid ${c}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:40,marginBottom:20 }),
};
