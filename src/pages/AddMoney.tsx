/**
 * INRT WALLET — AddMoney.tsx
 * Two methods to add money:
 *   1. Instamojo (cards, UPI, netbanking) — when approved
 *   2. UPI QR Code — works right now, no gateway needed
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || '';

type Tab  = 'instamojo' | 'upi';
type Step = 'form' | 'paying' | 'success' | 'failed';

const QUICK = [100, 200, 500, 1000, 2000, 5000];

export default function AddMoney() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [tab,      setTab]      = useState<Tab>('instamojo');
  const [amount,   setAmount]   = useState('');
  const [step,     setStep]     = useState<Step>('form');
  const [err,      setErr]      = useState('');
  const [loading,  setLoading]  = useState(false);

  // Instamojo state
  const [payUrl,   setPayUrl]   = useState('');
  const [payRef,   setPayRef]   = useState('');
  const [polling,  setPolling]  = useState(false);
  const pollRef = useRef<any>(null);

  // UPI QR state
  const [qrData,   setQrData]   = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(600);
  const [qrPaid,   setQrPaid]   = useState(false);
  const qrPollRef = useRef<any>(null);

  const bal = userProfile?.balance || 0;

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => () => {
    clearInterval(pollRef.current);
    clearInterval(qrPollRef.current);
  }, []);

  // ── QR countdown timer ──────────────────────────────────────
  useEffect(() => {
    if (!qrData || qrPaid) return;
    if (timeLeft <= 0) { setQrData(null); setErr('QR expired. Generate a new one.'); return; }
    const t = setInterval(() => setTimeLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [qrData, timeLeft, qrPaid]);

  // ── Poll Instamojo payment status ───────────────────────────
  const startPolling = (ref: string) => {
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API}/instamojo/verify/${ref}`);
        const d = await r.json();
        if (d.status === 'success') {
          clearInterval(pollRef.current);
          setPolling(false);
          await refreshProfile();
          setStep('success');
        } else if (d.status === 'expired') {
          clearInterval(pollRef.current);
          setPolling(false);
          setStep('failed');
        }
      } catch { /* keep polling */ }
    }, 4000);
  };

  // ── Poll UPI QR status ──────────────────────────────────────
  const startQrPolling = (txnId: string) => {
    qrPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API}/payment/check-upi/${txnId}`);
        const d = await r.json();
        if (d.status === 'success') {
          clearInterval(qrPollRef.current);
          await refreshProfile();
          setQrPaid(true);
          setStep('success');
        } else if (d.status === 'expired') {
          clearInterval(qrPollRef.current);
          setQrData(null);
          setErr('QR expired. Generate a new one.');
        }
      } catch { /* keep polling */ }
    }, 3000);
  };

  // ── Create Instamojo payment ────────────────────────────────
  const handleInstamojo = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 10) return setErr('Minimum ₹10');
    setLoading(true); setErr('');
    try {
      const r = await fetch(`${API}/instamojo/create-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.uid, amount: amt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Payment creation failed');
      setPayUrl(d.paymentUrl);
      setPayRef(d.paymentRef);
      setStep('paying');
      // Open Instamojo payment page
      window.open(d.paymentUrl, '_blank');
      // Start polling for payment confirmation
      startPolling(d.paymentRef);
    } catch (e: any) {
      setErr(e.message || 'Failed to create payment');
    }
    setLoading(false);
  };

  // ── Generate UPI QR ─────────────────────────────────────────
  const handleUpiQr = async () => {
    const amt = parseFloat(amount);
    setLoading(true); setErr(''); setQrData(null); setQrPaid(false); setTimeLeft(600);
    try {
      const r = await fetch(`${API}/payment/generate-upi-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user!.uid,
          amount: amt || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to generate QR');
      setQrData(d);
      startQrPolling(d.txnId);
    } catch (e: any) {
      setErr(e.message || 'Failed to generate QR');
    }
    setLoading(false);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const reset = () => {
    setStep('form'); setAmount(''); setErr('');
    setPayUrl(''); setPayRef(''); setPolling(false);
    setQrData(null); setQrPaid(false); setTimeLeft(600);
    clearInterval(pollRef.current);
    clearInterval(qrPollRef.current);
  };

  // ── SUCCESS ─────────────────────────────────────────────────
  if (step === 'success') return (
    <div style={S.page}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={S.successIcon}>✅</div>
        <h2 style={S.h2}>Money Added!</h2>
        <p style={{ color: '#6B7C93', fontSize: 15, marginBottom: 8 }}>
          ₹{parseFloat(amount || '0').toLocaleString('en-IN')} added to your INRT wallet
        </p>
        <p style={{ color: '#00e5cc', fontWeight: 700, fontSize: 15, marginBottom: 28 }}>
          New balance: ₹{(userProfile?.balance || 0).toLocaleString('en-IN')}
        </p>
        <button style={S.btnPrimary} onClick={() => navigate('/dashboard')}>Back to Home</button>
        <button style={{ ...S.btnOutline, marginTop: 10 }} onClick={reset}>Add More Money</button>
      </div>
    </div>
  );

  // ── FAILED ──────────────────────────────────────────────────
  if (step === 'failed') return (
    <div style={S.page}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ ...S.successIcon, background: 'rgba(255,59,48,0.1)', border: '2px solid #FF3B30' }}>❌</div>
        <h2 style={S.h2}>Payment Failed</h2>
        <p style={{ color: '#6B7C93', fontSize: 14, marginBottom: 28, lineHeight: 1.7 }}>
          Your payment could not be completed. No money was deducted.
        </p>
        <button style={S.btnPrimary} onClick={reset}>Try Again</button>
        <button style={{ ...S.btnOutline, marginTop: 10 }} onClick={() => navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  // ── WAITING FOR PAYMENT ─────────────────────────────────────
  if (step === 'paying') return (
    <div style={S.page}>
      <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '60px 24px', textAlign: 'center' }}>
        {/* Spinner */}
        <div style={{ width: 80, height: 80, border: '5px solid rgba(0,112,243,0.15)', borderTopColor: '#0070F3', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 24 }}/>
        <h2 style={S.h2}>Waiting for Payment…</h2>
        <p style={{ color: '#6B7C93', fontSize: 14, lineHeight: 1.7, maxWidth: 300, marginBottom: 28 }}>
          Complete your payment of ₹{parseFloat(amount).toLocaleString('en-IN')} on the Instamojo page that opened.
          This page will update automatically.
        </p>

        {/* Re-open link */}
        <div style={{ background: 'rgba(0,112,243,0.06)', border: '1px solid rgba(0,112,243,0.15)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, width: '100%' }}>
          <p style={{ color: '#0070F3', fontWeight: 600, fontSize: 13, margin: '0 0 8px' }}>
            Payment page not opened?
          </p>
          <button
            onClick={() => window.open(payUrl, '_blank')}
            style={{ ...S.btnPrimary, padding: '10px 20px', fontSize: 13 }}>
            Open Payment Page →
          </button>
        </div>

        <p style={{ color: '#6B7C93', fontSize: 12, marginBottom: 16 }}>
          {polling ? '🟢 Waiting for confirmation…' : '⏳ Checking payment status…'}
        </p>

        <button style={S.btnOutline} onClick={reset}>Cancel</button>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // ── MAIN FORM ────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate('/dashboard')} style={S.backBtn}>←</button>
        <h1 style={S.title}>Add Money</h1>
      </div>

      {/* Balance */}
      <div style={{ padding: '0 16px 16px', background: 'linear-gradient(160deg,#050914,#0a1428)' }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Wallet balance</span>
          <span style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 18, color: '#fff' }}>
            ₹{bal.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      <div style={{ padding: '16px 16px 90px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {([['instamojo', '💳 Instamojo'], ['upi', '📱 UPI QR']] as [Tab, string][]).map(([t, l]) => (
            <button key={t} onClick={() => { setTab(t); setErr(''); setQrData(null); }}
              style={{ flex: 1, padding: '12px 0', borderRadius: 14, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: tab === t ? '#0070F3' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tab === t ? '#0070F3' : 'rgba(255,255,255,0.08)'}`,
                color: tab === t ? '#fff' : 'rgba(255,255,255,0.5)',
                fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── INSTAMOJO TAB ── */}
        {tab === 'instamojo' && (
          <>
            <div style={S.card}>
              <p style={S.label}>AMOUNT</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px 16px', marginBottom: 12, border: `1.5px solid ${amount ? '#0070F3' : 'rgba(255,255,255,0.08)'}` }}>
                <span style={{ color: '#0070F3', fontSize: 24, fontWeight: 800 }}>₹</span>
                <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setErr(''); }}
                  placeholder="0" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 28, color: '#fff' }}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
                {QUICK.map(a => (
                  <button key={a} onClick={() => setAmount(String(a))}
                    style={{ padding: '10px 0', borderRadius: 10, border: `1.5px solid ${amount === String(a) ? '#0070F3' : 'rgba(255,255,255,0.08)'}`,
                      background: amount === String(a) ? 'rgba(0,112,243,0.12)' : 'transparent',
                      cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      color: amount === String(a) ? '#0070F3' : 'rgba(255,255,255,0.5)',
                      fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                    ₹{a}
                  </button>
                ))}
              </div>
              {err && <p style={S.err}>{err}</p>}
              <button style={{ ...S.btnPrimary, opacity: loading || !amount || parseFloat(amount) < 10 ? 0.5 : 1, width: '100%' }}
                onClick={handleInstamojo}
                disabled={loading || !amount || parseFloat(amount) < 10}>
                {loading ? '⏳ Creating payment…' : `Pay ₹${parseFloat(amount || '0').toLocaleString('en-IN')} via Instamojo →`}
              </button>
            </div>

            {/* Instamojo info */}
            <div style={{ background: 'rgba(0,112,243,0.06)', border: '1px solid rgba(0,112,243,0.12)', borderRadius: 14, padding: '14px 16px', marginTop: 12 }}>
              <p style={{ color: '#0070F3', fontWeight: 700, fontSize: 13, margin: '0 0 8px' }}>💳 Accepted payment methods</p>
              {['UPI (GPay, PhonePe, BHIM)', 'Debit & Credit Cards', 'Net Banking', 'Wallets (Paytm etc)'].map(m => (
                <p key={m} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '4px 0' }}>• {m}</p>
              ))}
            </div>

            {/* Not approved yet notice */}
            <div style={{ background: 'rgba(255,149,0,0.06)', border: '1px solid rgba(255,149,0,0.15)', borderRadius: 14, padding: '14px 16px', marginTop: 12 }}>
              <p style={{ color: '#FF9500', fontWeight: 700, fontSize: 13, margin: '0 0 4px' }}>⚠️ Instamojo account pending?</p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
                If Instamojo hasn't approved your account yet, use the UPI QR tab instead — it works immediately with no approval needed.
              </p>
            </div>
          </>
        )}

        {/* ── UPI QR TAB ── */}
        {tab === 'upi' && (
          <>
            {!qrData ? (
              <>
                <div style={S.card}>
                  <p style={S.label}>AMOUNT (OPTIONAL)</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px 16px', marginBottom: 12, border: `1.5px solid ${amount ? '#00e5cc' : 'rgba(255,255,255,0.08)'}` }}>
                    <span style={{ color: '#00e5cc', fontSize: 24, fontWeight: 800 }}>₹</span>
                    <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setErr(''); }}
                      placeholder="0 (any amount)" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 28, color: '#fff' }}/>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
                    {QUICK.map(a => (
                      <button key={a} onClick={() => setAmount(String(a))}
                        style={{ padding: '10px 0', borderRadius: 10, border: `1.5px solid ${amount === String(a) ? '#00e5cc' : 'rgba(255,255,255,0.08)'}`,
                          background: amount === String(a) ? 'rgba(0,229,204,0.1)' : 'transparent',
                          cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          color: amount === String(a) ? '#00e5cc' : 'rgba(255,255,255,0.5)',
                          fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                        ₹{a}
                      </button>
                    ))}
                  </div>
                  {err && <p style={S.err}>{err}</p>}
                  <button style={{ ...S.btnTeal, opacity: loading ? 0.5 : 1, width: '100%' }}
                    onClick={handleUpiQr} disabled={loading}>
                    {loading ? '⏳ Generating QR…' : 'Generate UPI QR Code →'}
                  </button>
                </div>

                <div style={{ background: 'rgba(0,229,204,0.04)', border: '1px solid rgba(0,229,204,0.12)', borderRadius: 14, padding: '14px 16px', marginTop: 12 }}>
                  <p style={{ color: '#00e5cc', fontWeight: 700, fontSize: 13, margin: '0 0 10px' }}>💡 How it works</p>
                  {[['1','Generate QR → show to payer'],['2','They scan with GPay / PhonePe / Paytm'],['3','Money instantly added to your wallet']].map(([n,t]) => (
                    <div key={n} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,229,204,0.15)', border: '1px solid #00e5cc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00e5cc', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{n}</div>
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>{t}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* QR displayed */
              <div>
                <div style={S.card}>
                  <div style={{ textAlign: 'center' }}>
                    {/* QR Image */}
                    <div style={{ display: 'inline-block', padding: 16, background: '#fff', borderRadius: 16, marginBottom: 14 }}>
                      <img src={qrData.qrImageUrl} alt="UPI QR" style={{ width: 220, height: 220, display: 'block' }}/>
                    </div>
                    <p style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 700, fontSize: 16, color: '#fff', margin: '0 0 4px' }}>
                      {userProfile?.name || 'INRT Wallet'}
                    </p>
                    <p style={{ color: '#00e5cc', fontSize: 13, margin: '0 0 4px' }}>{qrData.upiId}</p>
                    {qrData.amount && (
                      <p style={{ color: '#FFD60A', fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 22, margin: '0 0 8px' }}>
                        ₹{parseFloat(qrData.amount).toLocaleString('en-IN')}
                      </p>
                    )}

                    {/* Status */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00C853', animation: 'pulse 1s infinite' }}/>
                      <span style={{ color: '#00C853', fontSize: 12, fontWeight: 600 }}>Waiting for payment…</span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>({fmt(timeLeft)})</span>
                    </div>

                    {/* Accepted apps */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 14 }}>
                      {['GPay', 'PhonePe', 'Paytm', 'BHIM', 'Amazon Pay'].map(a => (
                        <span key={a} style={{ background: 'rgba(0,229,204,0.1)', border: '1px solid rgba(0,229,204,0.2)', borderRadius: 20, padding: '3px 10px', color: '#00e5cc', fontSize: 11, fontWeight: 600 }}>{a}</span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button style={{ ...S.btnOutline, flex: 1 }} onClick={() => { setQrData(null); clearInterval(qrPollRef.current); }}>← Back</button>
                      <button style={{ ...S.btnTeal, flex: 2 }}
                        onClick={() => {
                          if (navigator.share) navigator.share({ title: 'Pay via INRT', url: qrData.upiString });
                          else navigator.clipboard.writeText(qrData.upiId).then(() => alert('UPI ID copied!'));
                        }}>
                        📤 Share QR
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page:        { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#050914', fontFamily: "'Plus Jakarta Sans',sans-serif" },
  header:      { background: 'linear-gradient(160deg,#050914,#0a1428)', padding: '52px 20px 16px', display: 'flex', alignItems: 'center', gap: 14 },
  title:       { fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 22, color: '#fff', margin: 0 },
  backBtn:     { background: 'none', border: 'none', color: '#00e5cc', fontSize: 22, cursor: 'pointer', lineHeight: 1 },
  card:        { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: '18px 16px', marginBottom: 14 },
  label:       { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8, margin: '0 0 10px' },
  err:         { color: '#FF3B30', fontSize: 13, margin: '0 0 12px', fontWeight: 600 },
  btnPrimary:  { background: '#0070F3', color: '#fff', border: 'none', borderRadius: 14, padding: '16px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", boxShadow: '0 4px 16px rgba(0,112,243,0.3)' },
  btnTeal:     { background: 'linear-gradient(135deg,#00e5cc,#00b4a0)', color: '#000', border: 'none', borderRadius: 14, padding: '16px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif", boxShadow: '0 4px 16px rgba(0,229,204,0.3)' },
  btnOutline:  { background: 'transparent', color: '#00e5cc', border: '1px solid rgba(0,229,204,0.3)', borderRadius: 14, padding: '14px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" },
  successIcon: { width: 84, height: 84, borderRadius: '50%', background: 'rgba(0,200,83,0.1)', border: '2px solid #00C853', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, marginBottom: 20 },
  h2:          { fontFamily: "'Plus Jakarta Sans',sans-serif", fontWeight: 800, fontSize: 26, color: '#fff', margin: '0 0 8px' },
};
