/**
 * INRT WALLET — SandboxGateway.tsx
 * A fully fake, self-contained payment gateway simulator.
 *
 * ⚠️ NO REAL MONEY EVER MOVES HERE. This does not talk to Razorpay,
 * Cashfree, Setu, any bank, or any card network. It exists purely so
 * the product/UX of a payment flow can be tested and demoed while
 * real payment-aggregator integrations are still being sorted out.
 *
 * Route: /sandbox-pay
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { recordSandboxPayment } from '../lib/db';

const T = {
  bg:'#0A2540', card:'#0D2A4A', border:'rgba(255,255,255,0.1)',
  inrt:'#7B2FBE', teal:'#00e5cc', tealD:'#00b4a0',
  green:'#00C853', red:'#FF3B30', gold:'#FFD60A',
  text:'#fff', muted:'#8B9DB3',
};

type Step = 'amount' | 'method' | 'details' | 'processing' | 'result';
type Method = 'upi' | 'card' | 'netbanking';

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000, 5000];
const BANKS = ['Test Bank of India', 'Sandbox National Bank', 'Fake Federal Bank', 'Mock HDFC'];

function SandboxBanner() {
  return (
    <div style={{
      background: 'rgba(255,214,10,0.12)', border: '1px solid rgba(255,214,10,0.35)',
      borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 20,
    }}>
      <span style={{ fontSize: 16 }}>🧪</span>
      <span style={{ color: T.gold, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
        SANDBOX MODE — this is a test payment simulator. No real bank, card, or UPI network is
        contacted, and no real money moves.
      </span>
    </div>
  );
}

export default function SandboxGateway() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep]         = useState<Step>('amount');
  const [amount, setAmount]     = useState('');
  const [method, setMethod]     = useState<Method | null>(null);
  const [upiId, setUpiId]       = useState('');
  const [cardNum, setCardNum]   = useState('');
  const [cardExp, setCardExp]   = useState('');
  const [cardCvv, setCardCvv]   = useState('');
  const [bank, setBank]         = useState('');
  const [forceFail, setForceFail] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult]     = useState<{ success: boolean; refId: string } | null>(null);
  const [err, setErr]           = useState('');

  const amt = Number(amount);
  const validAmount = amt > 0 && amt <= 200000;

  const detailsValid = () => {
    if (method === 'upi')  return /^[\w.-]+@[\w.-]+$/.test(upiId.trim());
    if (method === 'card') return /^\d{16}$/.test(cardNum.replace(/\s/g,'')) && /^\d{2}\/\d{2}$/.test(cardExp) && /^\d{3}$/.test(cardCvv);
    if (method === 'netbanking') return !!bank;
    return false;
  };

  const runProcessing = async () => {
    setStep('processing');
    setErr('');
    const stages = [
      'Connecting to sandbox gateway…',
      'Simulating bank authentication…',
      'Waiting for mock confirmation…',
      'Finalising test transaction…',
    ];
    for (const s of stages) {
      setProgressMsg(s);
      await new Promise(r => setTimeout(r, 550));
    }

    // 90% success unless the tester explicitly wants to see a failure
    const success = forceFail ? false : Math.random() > 0.1;
    const refId = 'SANDBOX-' + Math.random().toString(36).slice(2, 10).toUpperCase();

    try {
      if (user?.uid) {
        await recordSandboxPayment(user.uid, {
          amount: amt,
          method: method === 'upi' ? 'UPI' : method === 'card' ? 'Card' : 'Netbanking',
          success,
          refId,
        });
      }
      setResult({ success, refId });
      setStep('result');
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong recording the sandbox transaction.');
      setResult({ success: false, refId });
      setStep('result');
    }
  };

  const reset = () => {
    setStep('amount'); setAmount(''); setMethod(null);
    setUpiId(''); setCardNum(''); setCardExp(''); setCardCvv('');
    setBank(''); setForceFail(false); setResult(null); setErr('');
  };

  return (
    <div style={{
      width: '100%', minHeight: '100vh', background: T.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 20px 40px', fontFamily: "'Plus Jakarta Sans',sans-serif",
      boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <button onClick={() => step === 'amount' ? navigate(-1) : reset()}
          style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: 'none', color: T.text, fontSize: 16, cursor: 'pointer' }}>←</button>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: T.text, margin: 0 }}>Sandbox Payment Gateway</h1>
      </div>

      <div style={{ width: '100%', maxWidth: 460 }}>
        <SandboxBanner />

        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 20,
          padding: 24, boxShadow: '0 8px 32px rgba(123,47,190,0.12)',
        }}>

          {step === 'amount' && (
            <>
              <p style={{ color: T.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 10px' }}>TEST AMOUNT (₹)</p>
              <input
                type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'14px 16px', color:T.text, fontSize:20, fontWeight:700, outline:'none', boxSizing:'border-box', marginBottom:14 }}
              />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:20 }}>
                {QUICK_AMOUNTS.map(a => (
                  <button key={a} onClick={() => setAmount(String(a))}
                    style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 0', color:T.text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    ₹{a}
                  </button>
                ))}
              </div>
              <button disabled={!validAmount} onClick={() => setStep('method')}
                style={{ width:'100%', background: validAmount ? T.inrt : 'rgba(255,255,255,0.08)', color:'#fff', border:'none', borderRadius:12, padding:'15px', fontSize:15, fontWeight:700, cursor: validAmount ? 'pointer' : 'not-allowed' }}>
                Continue
              </button>
            </>
          )}

          {step === 'method' && (
            <>
              <p style={{ color: T.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 14px' }}>
                PAYING ₹{amt} · CHOOSE TEST METHOD
              </p>
              {([
                ['upi', '📱', 'UPI (test)'],
                ['card', '💳', 'Card (test)'],
                ['netbanking', '🏦', 'Netbanking (test)'],
              ] as [Method, string, string][]).map(([m, icon, label]) => (
                <button key={m} onClick={() => { setMethod(m); setStep('details'); }}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:12, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:12, padding:'16px', marginBottom:10, cursor:'pointer', color:T.text, fontSize:15, fontWeight:600, textAlign:'left' }}>
                  <span style={{ fontSize:20 }}>{icon}</span> {label}
                  <span style={{ marginLeft:'auto', color:T.muted }}>→</span>
                </button>
              ))}
            </>
          )}

          {step === 'details' && method && (
            <>
              <p style={{ color: T.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 14px' }}>
                TEST {method.toUpperCase()} DETAILS — fake data only, nothing is verified
              </p>

              {method === 'upi' && (
                <input placeholder="any-name@sandboxbank" value={upiId} onChange={e => setUpiId(e.target.value)}
                  style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:14 }} />
              )}

              {method === 'card' && (
                <>
                  <input placeholder="4111 1111 1111 1111 (any 16 digits)" value={cardNum}
                    onChange={e => setCardNum(e.target.value.replace(/[^\d ]/g,''))}
                    style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:10, fontFamily:'monospace' }} />
                  <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                    <input placeholder="MM/YY" value={cardExp} onChange={e => setCardExp(e.target.value)}
                      style={{ flex:1, background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' }} />
                    <input placeholder="CVV" value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g,''))}
                      style={{ width:90, background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' }} />
                  </div>
                </>
              )}

              {method === 'netbanking' && (
                <div style={{ marginBottom:14 }}>
                  {BANKS.map(b => (
                    <button key={b} onClick={() => setBank(b)}
                      style={{ width:'100%', textAlign:'left', background: bank===b ? 'rgba(123,47,190,0.2)' : 'rgba(255,255,255,0.04)', border:`1.5px solid ${bank===b ? T.inrt : T.border}`, borderRadius:10, padding:'12px 14px', marginBottom:8, color:T.text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                      🏦 {b}
                    </button>
                  ))}
                </div>
              )}

              <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, cursor:'pointer' }}>
                <input type="checkbox" checked={forceFail} onChange={e => setForceFail(e.target.checked)} />
                <span style={{ color:T.muted, fontSize:12 }}>Simulate a failed payment (for testing error handling)</span>
              </label>

              <button disabled={!detailsValid()} onClick={runProcessing}
                style={{ width:'100%', background: detailsValid() ? T.inrt : 'rgba(255,255,255,0.08)', color:'#fff', border:'none', borderRadius:12, padding:'15px', fontSize:15, fontWeight:700, cursor: detailsValid() ? 'pointer' : 'not-allowed' }}>
                Pay ₹{amt} (test)
              </button>
            </>
          )}

          {step === 'processing' && (
            <div style={{ textAlign:'center', padding:'30px 0' }}>
              <div style={{
                width:56, height:56, borderRadius:'50%', margin:'0 auto 20px',
                border:`4px solid ${T.border}`, borderTopColor:T.teal,
                animation:'sandboxSpin 0.8s linear infinite',
              }} />
              <style>{`@keyframes sandboxSpin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ color:T.text, fontSize:14, fontWeight:600 }}>{progressMsg}</p>
              <p style={{ color:T.muted, fontSize:11, marginTop:8 }}>This is simulated — no real network call is happening.</p>
            </div>
          )}

          {step === 'result' && result && (
            <div style={{ textAlign:'center', padding:'10px 0' }}>
              <div style={{
                width:64, height:64, borderRadius:'50%', margin:'0 auto 16px',
                background: result.success ? 'rgba(0,200,83,0.15)' : 'rgba(255,59,48,0.15)',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:30,
              }}>
                {result.success ? '✅' : '❌'}
              </div>
              <p style={{ color:T.text, fontSize:18, fontWeight:800, margin:'0 0 6px' }}>
                {result.success ? 'Test Payment Successful' : 'Test Payment Failed'}
              </p>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 20px' }}>
                {result.success
                  ? `₹${amt} was added to your sandbox balance.`
                  : 'This was a simulated failure — no balance change occurred.'}
              </p>
              {err && <p style={{ color:T.red, fontSize:12, marginBottom:12 }}>{err}</p>}
              <div style={{
                background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:12,
                padding:'14px', marginBottom:20, textAlign:'left',
              }}>
                <p style={{ color:T.muted, fontSize:11, margin:'0 0 4px' }}>REFERENCE ID</p>
                <p style={{ color:T.teal, fontSize:13, fontFamily:'monospace', margin:0, wordBreak:'break-all' }}>{result.refId}</p>
              </div>
              <button onClick={reset}
                style={{ width:'100%', background:T.inrt, color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:10 }}>
                Run Another Test Payment
              </button>
              <button onClick={() => navigate('/dashboard')}
                style={{ width:'100%', background:'transparent', color:T.muted, border:'none', padding:'10px', fontSize:13, cursor:'pointer' }}>
                Back to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
