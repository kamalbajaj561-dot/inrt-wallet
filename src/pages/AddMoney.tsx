/**
 * AddMoney.tsx — Custom Payment System
 * 
 * Two ways to add money:
 *   1. UPI QR Code — user shows QR, someone scans with any UPI app
 *   2. Bank Transfer — manual NEFT/IMPS to INRT bank account
 *      (admin credits wallet after receiving payment)
 * 
 * No Razorpay needed at all!
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';

const API = import.meta.env.VITE_API_URL || '';

type Tab = 'qr' | 'bank';

export default function AddMoney() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [tab,       setTab]      = useState<Tab>('qr');
  const [amount,    setAmount]   = useState('');
  const [note,      setNote]     = useState('');
  const [qrData,    setQrData]   = useState<any>(null);
  const [loading,   setLoading]  = useState(false);
  const [polling,   setPolling]  = useState(false);
  const [paid,      setPaid]     = useState(false);
  const [err,       setErr]      = useState('');
  const [timeLeft,  setTimeLeft] = useState(600); // 10 min countdown

  const bal   = userProfile?.balance || 0;
  const QUICK = [100, 200, 500, 1000, 2000, 5000];

  // ── Countdown timer ───────────────────────────────────────
  useEffect(() => {
    if (!qrData || paid) return;
    if (timeLeft <= 0) { setQrData(null); setErr('QR expired. Generate a new one.'); return; }
    const t = setInterval(() => setTimeLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [qrData, timeLeft, paid]);

  // ── Poll for payment status every 3 seconds ───────────────
  useEffect(() => {
    if (!qrData?.txnId || paid) return;
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`${API}/payment/check-upi/${qrData.txnId}`);
        const d = await r.json();
        if (d.status === 'success') {
          clearInterval(interval);
          setPolling(false);
          setPaid(true);
          await refreshProfile();
        } else if (d.status === 'expired') {
          clearInterval(interval);
          setPolling(false);
          setQrData(null);
          setErr('QR expired. Generate a new one.');
        }
      } catch { /* network blip, keep polling */ }
    }, 3000);
    return () => { clearInterval(interval); setPolling(false); };
  }, [qrData, paid]);

  // ── Generate QR ───────────────────────────────────────────
  const generateQR = async () => {
    const amt = parseFloat(amount);
    if (amt && amt < 1) return setErr('Minimum ₹1');
    setLoading(true); setErr(''); setQrData(null); setPaid(false); setTimeLeft(600);
    try {
      const r = await fetch(`${API}/payment/generate-upi-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.uid, amount: amt || undefined, note }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to generate QR');
      setQrData(d);
    } catch (e: any) {
      setErr(e.message || 'Failed to generate QR');
    }
    setLoading(false);
  };

  const fmt = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;

  // ── Success screen ─────────────────────────────────────────
  if (paid && qrData) return (
    <div style={S.page}>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 24px',textAlign:'center' }}>
        <div style={{ width:84,height:84,borderRadius:'50%',background:'rgba(0,214,143,0.1)',border:'2px solid var(--green)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:40,marginBottom:20 }}>✅</div>
        <h2 style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:26,color:'var(--t1)',marginBottom:8 }}>Money Added!</h2>
        <p style={{ color:'var(--t2)',fontSize:15,marginBottom:24 }}>
          {qrData.amount ? `₹${qrData.amount.toLocaleString('en-IN')} added to your wallet` : 'Payment received and credited to your wallet'}
        </p>
        <p style={{ color:'var(--teal)',fontWeight:600,fontSize:14,marginBottom:24 }}>
          New balance: ₹{(userProfile?.balance || 0).toLocaleString('en-IN')}
        </p>
        <button className="btn-primary" onClick={() => navigate('/dashboard')}>Back to Home</button>
        <button className="btn-outline" style={{ marginTop:10 }}
          onClick={() => { setPaid(false); setQrData(null); setAmount(''); }}>
          Add More Money
        </button>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate('/dashboard')} className="back-btn">←</button>
        <h1 className="page-title">Add Money</h1>
      </div>

      {/* Balance */}
      <div style={{ padding:'0 16px 16px',background:'linear-gradient(160deg,#050914,#0a1428)' }}>
        <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid var(--b1)',borderRadius:'var(--r2)',padding:'14px 18px' }}>
          <p style={{ color:'var(--t3)',fontSize:10,letterSpacing:1,marginBottom:4 }}>WALLET BALANCE</p>
          <p style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:28,color:'var(--t1)' }}>
            ₹{bal.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex',gap:8,padding:'14px 16px 0' }}>
        {(['qr','bank'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setQrData(null); setErr(''); setPaid(false); }}
            style={{ flex:1,padding:'10px 0',borderRadius:'var(--r1)',fontSize:13,fontWeight:700,cursor:'pointer',
                     background:tab===t?'var(--teal)':'var(--bg-card)',
                     border:`1px solid ${tab===t?'var(--teal)':'var(--b1)'}`,
                     color:tab===t?'#000':'var(--t2)' }}>
            {t==='qr'?'📱 UPI QR Code':'🏦 Bank Transfer'}
          </button>
        ))}
      </div>

      <div style={{ padding:'16px 16px 90px' }}>

        {/* ── UPI QR TAB ── */}
        {tab === 'qr' && (
          <>
            {!qrData ? (
              <>
                <div className="card" style={{ marginBottom:14 }}>
                  <p className="s-label">AMOUNT (OPTIONAL)</p>
                  <div className="amount-box" style={{ marginBottom:12 }}>
                    <span style={{ color:'var(--teal)',fontSize:22,fontWeight:700 }}>₹</span>
                    <input className="amount-input" type="number" placeholder="0 (any amount)"
                      value={amount} onChange={e => { setAmount(e.target.value); setErr(''); }} />
                  </div>
                  {/* Quick amounts */}
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14 }}>
                    {QUICK.map(a => (
                      <button key={a} onClick={() => setAmount(String(a))}
                        style={{ padding:'10px 0',borderRadius:'var(--r1)',fontSize:13,fontWeight:700,cursor:'pointer',
                                  background:amount===String(a)?'var(--teal-dim)':'var(--bg-elevated)',
                                  border:`1px solid ${amount===String(a)?'var(--teal)':'var(--b1)'}`,
                                  color:amount===String(a)?'var(--teal)':'var(--t2)' }}>
                        ₹{a}
                      </button>
                    ))}
                  </div>
                  <p className="s-label">NOTE (OPTIONAL)</p>
                  <input className="inp" style={{ marginBottom:16 }} placeholder="e.g. Monthly savings"
                    value={note} onChange={e => setNote(e.target.value)} />
                  {err && <p className="err-box" style={{ marginBottom:12 }}>⚠️ {err}</p>}
                  <button className="btn-primary" onClick={generateQR} disabled={loading}
                    style={{ opacity:loading?0.6:1 }}>
                    {loading ? '⏳ Generating QR…' : 'Generate UPI QR Code →'}
                  </button>
                </div>

                {/* How it works */}
                <div className="card" style={{ background:'rgba(0,229,204,0.04)',border:'1px solid rgba(0,229,204,0.12)' }}>
                  <p style={{ color:'var(--teal)',fontWeight:700,fontSize:14,marginBottom:12 }}>
                    💡 How it works
                  </p>
                  {[
                    ['1','Set amount (optional) → Generate QR'],
                    ['2','Show QR to person who is paying you'],
                    ['3','They scan with GPay / PhonePe / Paytm'],
                    ['4','Money instantly added to your wallet'],
                  ].map(([n,t]) => (
                    <div key={n} style={{ display:'flex',gap:12,padding:'7px 0',borderBottom:'1px solid var(--b1)' }}>
                      <div style={{ width:22,height:22,borderRadius:'50%',background:'var(--teal-dim)',border:'1px solid var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--teal)',fontSize:11,fontWeight:700,flexShrink:0 }}>{n}</div>
                      <p style={{ color:'var(--t2)',fontSize:13 }}>{t}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* QR displayed */
              <div>
                <div className="card" style={{ textAlign:'center',marginBottom:14 }}>
                  {/* QR Image */}
                  <div style={{ display:'inline-block',padding:16,background:'#fff',borderRadius:'var(--r2)',marginBottom:14 }}>
                    <img
                      src={qrData.qrImageUrl}
                      alt="UPI QR Code"
                      style={{ width:220,height:220,display:'block' }}
                    />
                  </div>

                  <p style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:18,color:'var(--t1)',marginBottom:4 }}>
                    {userProfile?.name}
                  </p>
                  <p style={{ color:'var(--teal)',fontSize:14,fontWeight:600,marginBottom:4 }}>
                    {qrData.upiId}
                  </p>
                  {qrData.amount && (
                    <p style={{ color:'var(--gold)',fontFamily:'var(--f-display)',fontWeight:700,fontSize:22,marginBottom:4 }}>
                      ₹{parseFloat(qrData.amount).toLocaleString('en-IN')}
                    </p>
                  )}

                  {/* Countdown */}
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:16 }}>
                    <div style={{ width:8,height:8,borderRadius:'50%',background:polling?'var(--green)':'var(--t3)',animation:polling?'pulse 1s infinite':undefined }} />
                    <span style={{ color:polling?'var(--green)':'var(--t3)',fontSize:12,fontWeight:600 }}>
                      {polling ? 'Waiting for payment…' : 'Not yet paid'}
                    </span>
                    <span style={{ color:'var(--t3)',fontSize:12 }}>({fmt(timeLeft)})</span>
                  </div>

                  {/* Accepted apps */}
                  <div style={{ display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginBottom:16 }}>
                    {['GPay','PhonePe','Paytm','BHIM','Amazon Pay'].map(app => (
                      <span key={app} className="badge-teal">{app}</span>
                    ))}
                  </div>

                  <div style={{ display:'flex',gap:10 }}>
                    <button className="btn-outline" style={{ flex:1 }}
                      onClick={() => { setQrData(null); setAmount(''); }}>
                      ← Back
                    </button>
                    <button className="btn-primary" style={{ flex:2 }}
                      onClick={() => {
                        const shareData = { title:'Pay via INRT', text:qrData.upiId, url:qrData.upiString };
                        if (navigator.share) navigator.share(shareData);
                        else navigator.clipboard.writeText(qrData.upiId).then(() => alert('UPI ID copied!'));
                      }}>
                      📤 Share QR
                    </button>
                  </div>
                </div>

                <div style={{ background:'rgba(244,185,66,0.06)',border:'1px solid rgba(244,185,66,0.15)',borderRadius:'var(--r2)',padding:'12px 16px' }}>
                  <p style={{ color:'var(--gold)',fontWeight:600,fontSize:13,marginBottom:4 }}>
                    ⚡ Payment detected automatically
                  </p>
                  <p style={{ color:'var(--t2)',fontSize:12 }}>
                    Your wallet will be credited instantly when the payer scans and pays.
                    This page auto-updates every 3 seconds.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── BANK TRANSFER TAB ── */}
        {tab === 'bank' && (
          <>
            <div className="card" style={{ marginBottom:14 }}>
              <p className="s-title">Bank Transfer Details</p>
              <p style={{ color:'var(--t2)',fontSize:13,marginBottom:16,lineHeight:1.6 }}>
                Transfer money to this bank account via NEFT/IMPS/RTGS.
                Your wallet is credited within 30 minutes.
              </p>
              {[
                ['Bank Name',    'HDFC Bank'],
                ['Account Name', 'INRT Technologies Pvt Ltd'],
                ['Account No',   '50200012345678'],
                ['IFSC Code',    'HDFC0001234'],
                ['Account Type', 'Current Account'],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid var(--b1)' }}>
                  <span style={{ color:'var(--t2)',fontSize:13 }}>{k}</span>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <span style={{ color:'var(--t1)',fontWeight:600,fontSize:14,fontFamily:'var(--f-display)' }}>{v}</span>
                    <button onClick={() => navigator.clipboard.writeText(v)}
                      style={{ background:'var(--teal-dim)',border:'none',borderRadius:6,padding:'3px 8px',color:'var(--teal)',fontSize:10,fontWeight:700,cursor:'pointer' }}>
                      COPY
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:'rgba(244,185,66,0.06)',border:'1px solid rgba(244,185,66,0.15)',borderRadius:'var(--r2)',padding:'14px 16px',marginBottom:14 }}>
              <p style={{ color:'var(--gold)',fontWeight:700,fontSize:13,marginBottom:8 }}>⚠️ Important</p>
              {[
                'Add your registered mobile number in the transfer remarks',
                'Minimum transfer: ₹100',
                'Credited within 30 minutes (banking hours)',
                'Keep your UTR / reference number for tracking',
              ].map(t => (
                <p key={t} style={{ color:'var(--t2)',fontSize:12,padding:'4px 0' }}>• {t}</p>
              ))}
            </div>

            <button className="btn-outline"
              onClick={() => alert('Contact support@inrtwallet.app with your UTR number')}>
              🎧 Track My Transfer
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:   { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' },
  header: { background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 16px',display:'flex',alignItems:'center',gap:14 },
};
