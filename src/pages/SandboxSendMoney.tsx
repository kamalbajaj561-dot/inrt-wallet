/**
 * INRT WALLET — SandboxSendMoney.tsx
 * A fully fake "pay anyone" simulator — UPI ID, mobile number, or card,
 * styled after the standard UPI-app send-money confirmation pattern.
 *
 * ⚠️ NO REAL MONEY EVER MOVES HERE. No bank, UPI switch, or card network
 * is contacted. Balance changes are internal test ledger entries only.
 *
 * Route: /sandbox-send
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { recordSandboxSend } from '../lib/db';

const T = {
  bg:'#0A2540', card:'#0D2A4A', border:'rgba(255,255,255,0.1)',
  inrt:'#7B2FBE', teal:'#00e5cc',
  green:'#00C853', red:'#FF3B30', gold:'#FFD60A',
  text:'#fff', muted:'#8B9DB3',
};

type Step = 'recipient' | 'amount' | 'method' | 'processing' | 'result';
type Method = 'upi' | 'card' | 'netbanking';

const QUICK_AMOUNTS = [50, 100, 250, 500, 1000];
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
        SANDBOX MODE — this simulates sending money to anyone via UPI, card, or
        netbanking. No real bank or network is contacted, and no real money moves.
      </span>
    </div>
  );
}

export default function SandboxSendMoney() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep]           = useState<Step>('recipient');
  const [recipientId, setRecipientId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [amount, setAmount]       = useState('');
  const [method, setMethod]       = useState<Method | null>(null);
  const [cardNum, setCardNum]     = useState('');
  const [cardExp, setCardExp]     = useState('');
  const [cardCvv, setCardCvv]     = useState('');
  const [bank, setBank]           = useState('');
  const [forceFail, setForceFail] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult]       = useState<{ success: boolean; refId: string; time: string } | null>(null);

  const amt = Number(amount);
  const validAmount = amt > 0 && amt <= 100000;
  const recipientValid = /^[\w.-]+@[\w.-]+$/.test(recipientId.trim()) || /^\d{10}$/.test(recipientId.trim());

  const methodDetailsValid = () => {
    if (method === 'upi') return true; // recipient ID already doubles as UPI collect target in this sim
    if (method === 'card') return /^\d{16}$/.test(cardNum.replace(/\s/g,'')) && /^\d{2}\/\d{2}$/.test(cardExp) && /^\d{3}$/.test(cardCvv);
    if (method === 'netbanking') return !!bank;
    return false;
  };

  const runProcessing = async () => {
    setStep('processing');
    const stages = [
      'Connecting to sandbox UPI switch…',
      'Verifying recipient (test)…',
      'Simulating bank debit…',
      'Confirming test transfer…',
    ];
    for (const s of stages) {
      setProgressMsg(s);
      await new Promise(r => setTimeout(r, 500));
    }

    const success = forceFail ? false : Math.random() > 0.08;
    const refId = String(Math.floor(100000000000 + Math.random() * 899999999999));
    const time = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

    if (user?.uid) {
      await recordSandboxSend(user.uid, {
        amount: amt,
        method: method === 'upi' ? 'UPI' : method === 'card' ? 'Card' : 'Netbanking',
        recipient: recipientName || recipientId,
        success,
        refId,
      });
    }
    setResult({ success, refId, time });
    setStep('result');
  };

  const reset = () => {
    setStep('recipient'); setRecipientId(''); setRecipientName(''); setAmount('');
    setMethod(null); setCardNum(''); setCardExp(''); setCardCvv('');
    setBank(''); setForceFail(false); setResult(null);
  };

  return (
    <div style={{
      width: '100%', minHeight: '100vh', background: T.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 20px 40px', fontFamily: "'Plus Jakarta Sans',sans-serif",
      boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <button onClick={() => step === 'recipient' ? navigate(-1) : reset()}
          style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: 'none', color: T.text, fontSize: 16, cursor: 'pointer' }}>←</button>
        <h1 style={{ fontSize: 19, fontWeight: 800, color: T.text, margin: 0 }}>Sandbox Send Money</h1>
      </div>

      <div style={{ width: '100%', maxWidth: 460 }}>
        <SandboxBanner />

        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 20,
          padding: 24, boxShadow: '0 8px 32px rgba(123,47,190,0.12)',
        }}>

          {step === 'recipient' && (
            <>
              <p style={{ color: T.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 10px' }}>PAY TO — UPI ID OR MOBILE NUMBER</p>
              <input
                value={recipientId} onChange={e => setRecipientId(e.target.value)}
                placeholder="name@sandboxbank or 10-digit mobile"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:15, outline:'none', boxSizing:'border-box', marginBottom:12 }}
              />
              <input
                value={recipientName} onChange={e => setRecipientName(e.target.value)}
                placeholder="Recipient name (optional, for display)"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:20 }}
              />
              <button disabled={!recipientValid} onClick={() => setStep('amount')}
                style={{ width:'100%', background: recipientValid ? T.inrt : 'rgba(255,255,255,0.08)', color:'#fff', border:'none', borderRadius:12, padding:'15px', fontSize:15, fontWeight:700, cursor: recipientValid ? 'pointer' : 'not-allowed' }}>
                Continue
              </button>
            </>
          )}

          {step === 'amount' && (
            <>
              <p style={{ color: T.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 10px' }}>
                SENDING TO {recipientName || recipientId}
              </p>
              <input
                type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'14px 16px', color:T.text, fontSize:20, fontWeight:700, outline:'none', boxSizing:'border-box', marginBottom:14 }}
              />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:20 }}>
                {QUICK_AMOUNTS.map(a => (
                  <button key={a} onClick={() => setAmount(String(a))}
                    style={{ background:'rgba(255,255,255,0.05)', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 0', color:T.text, fontSize:12, fontWeight:600, cursor:'pointer' }}>
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
                PAY ₹{amt} VIA
              </p>
              {([
                ['upi', '📱', 'UPI'],
                ['card', '💳', 'Debit Card'],
                ['netbanking', '🏦', 'Netbanking'],
              ] as [Method, string, string][]).map(([m, icon, label]) => (
                <button key={m} onClick={() => setMethod(m)}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:12, background: method===m ? 'rgba(123,47,190,0.2)' : 'rgba(255,255,255,0.04)', border:`1.5px solid ${method===m ? T.inrt : T.border}`, borderRadius:12, padding:'16px', marginBottom:10, cursor:'pointer', color:T.text, fontSize:15, fontWeight:600, textAlign:'left' }}>
                  <span style={{ fontSize:20 }}>{icon}</span> {label}
                </button>
              ))}

              {method === 'card' && (
                <div style={{ marginTop:14 }}>
                  <input placeholder="4111 1111 1111 1111 (any 16 digits)" value={cardNum}
                    onChange={e => setCardNum(e.target.value.replace(/[^\d ]/g,''))}
                    style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:10, fontFamily:'monospace' }} />
                  <div style={{ display:'flex', gap:10 }}>
                    <input placeholder="MM/YY" value={cardExp} onChange={e => setCardExp(e.target.value)}
                      style={{ flex:1, background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' }} />
                    <input placeholder="CVV" value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g,''))}
                      style={{ width:90, background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' }} />
                  </div>
                </div>
              )}

              {method === 'netbanking' && (
                <div style={{ marginTop:14 }}>
                  {BANKS.map(b => (
                    <button key={b} onClick={() => setBank(b)}
                      style={{ width:'100%', textAlign:'left', background: bank===b ? 'rgba(123,47,190,0.2)' : 'rgba(255,255,255,0.04)', border:`1.5px solid ${bank===b ? T.inrt : T.border}`, borderRadius:10, padding:'12px 14px', marginBottom:8, color:T.text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                      🏦 {b}
                    </button>
                  ))}
                </div>
              )}

              {method && (
                <>
                  <label style={{ display:'flex', alignItems:'center', gap:8, margin:'16px 0', cursor:'pointer' }}>
                    <input type="checkbox" checked={forceFail} onChange={e => setForceFail(e.target.checked)} />
                    <span style={{ color:T.muted, fontSize:12 }}>Simulate a failed transfer (for testing error handling)</span>
                  </label>
                  <button disabled={!methodDetailsValid()} onClick={runProcessing}
                    style={{ width:'100%', background: methodDetailsValid() ? T.inrt : 'rgba(255,255,255,0.08)', color:'#fff', border:'none', borderRadius:12, padding:'15px', fontSize:15, fontWeight:700, cursor: methodDetailsValid() ? 'pointer' : 'not-allowed' }}>
                    Pay ₹{amt} (test)
                  </button>
                </>
              )}
            </>
          )}

          {step === 'processing' && (
            <div style={{ textAlign:'center', padding:'30px 0' }}>
              <div style={{
                width:56, height:56, borderRadius:'50%', margin:'0 auto 20px',
                border:`4px solid ${T.border}`, borderTopColor:T.teal,
                animation:'sandboxSendSpin 0.8s linear infinite',
              }} />
              <style>{`@keyframes sandboxSendSpin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ color:T.text, fontSize:14, fontWeight:600 }}>{progressMsg}</p>
              <p style={{ color:T.muted, fontSize:11, marginTop:8 }}>This is simulated — no real network call is happening.</p>
            </div>
          )}

          {step === 'result' && result && (
            <div style={{ textAlign:'center', padding:'10px 0' }}>
              {/* Paytm-style confirmation card */}
              <div style={{
                background: result.success ? 'rgba(0,200,83,0.08)' : 'rgba(255,59,48,0.08)',
                border: `1px solid ${result.success ? 'rgba(0,200,83,0.3)' : 'rgba(255,59,48,0.3)'}`,
                borderRadius: 18, padding: '28px 20px', marginBottom: 20,
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:14 }}>
                  <span style={{ fontSize:30, fontWeight:800, color:T.text }}>₹{amt}</span>
                  <span style={{ fontSize:22 }}>{result.success ? '✅' : '❌'}</span>
                </div>
                <p style={{ color: result.success ? T.green : T.red, fontSize:16, fontWeight:800, margin:'0 0 18px' }}>
                  {result.success ? 'Paid Successfully (Sandbox)' : 'Payment Failed (Sandbox)'}
                </p>
                <p style={{ color:T.text, fontSize:14, fontWeight:700, margin:'0 0 4px' }}>
                  To {recipientName || recipientId}
                </p>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 4px' }}>{result.time}</p>
                <p style={{ color:T.muted, fontSize:12, margin:0 }}>Sandbox Ref No. {result.refId}</p>
              </div>

              <button onClick={reset}
                style={{ width:'100%', background:T.inrt, color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:10 }}>
                Send Another Test Payment
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
