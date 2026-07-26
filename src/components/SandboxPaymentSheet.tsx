/**
 * INRT WALLET — SandboxPaymentSheet.tsx
 * Drop-in payment method sheet used across recharge/bills/gold/etc.
 * Simulates method selection → bank processing → receipt, Paytm-style.
 *
 * ⚠️ NO REAL MONEY MOVES. No bank, UPI switch, or card network is
 * contacted. This exists purely to give the payment UX a realistic
 * feel for demos while real PA integrations are still in progress.
 * Marked with a small "TEST MODE" badge — never hidden.
 *
 * Usage:
 *   {showPay && (
 *     <SandboxPaymentSheet
 *       amount={amt}
 *       itemLabel="Airtel Prepaid — 9876543210"
 *       onCancel={() => setShowPay(false)}
 *       onDone={(success, refId) => {
 *         setShowPay(false);
 *         if (success) doInternalDebitAndShowSuccess(refId);
 *         else showToast('Payment failed — try again');
 *       }}
 *     />
 *   )}
 */
import { useState } from 'react';
import type { PaymentSheetProps } from '../lib/payments/types';

const T = {
  bg:'#0A2540', card:'#0D2A4A', border:'rgba(255,255,255,0.1)',
  inrt:'#7B2FBE', teal:'#00e5cc',
  green:'#00C853', red:'#FF3B30', gold:'#FFD60A',
  text:'#fff', muted:'#8B9DB3',
};

type Step = 'method' | 'details' | 'processing' | 'result';
type Method = 'upi' | 'card' | 'netbanking';

const BANKS = ['Test Bank of India', 'Sandbox National Bank', 'Fake Federal Bank', 'Mock HDFC'];

export default function SandboxPaymentSheet({ amount, itemLabel, onCancel, onDone }: PaymentSheetProps) {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<Method | null>(null);
  const [upiId, setUpiId] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [bank, setBank] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<{ success: boolean; refId: string } | null>(null);

  const detailsValid = () => {
    if (method === 'upi') return /^[\w.-]+@[\w.-]+$/.test(upiId.trim());
    if (method === 'card') return /^\d{16}$/.test(cardNum.replace(/\s/g,'')) && /^\d{2}\/\d{2}$/.test(cardExp) && /^\d{3}$/.test(cardCvv);
    if (method === 'netbanking') return !!bank;
    return false;
  };

  const runProcessing = async () => {
    setStep('processing');
    const stages = ['Connecting to payment gateway…', 'Authenticating…', 'Confirming payment…'];
    for (const s of stages) {
      setProgressMsg(s);
      await new Promise(r => setTimeout(r, 500));
    }
    const success = Math.random() > 0.06;
    const refId = 'TXN' + Math.random().toString(36).slice(2, 11).toUpperCase();
    setResult({ success, refId });
    setStep('result');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 460, background: T.card,
        borderRadius: '24px 24px 0 0', padding: '20px 20px 28px',
        boxSizing: 'border-box', position: 'relative',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        maxHeight: '88vh', overflowY: 'auto',
      }}>
        {/* Small, unobtrusive test-mode badge — always visible, never hidden */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.4)',
          borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ fontSize: 10 }}>🧪</span>
          <span style={{ color: T.gold, fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>TEST MODE</span>
        </div>

        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 4, background: T.border, margin: '0 auto 18px' }} />

        {step === 'method' && (
          <>
            <p style={{ color: T.muted, fontSize: 12, margin: '0 0 2px' }}>{itemLabel}</p>
            <p style={{ color: T.text, fontSize: 24, fontWeight: 800, margin: '0 0 20px' }}>₹{amount}</p>
            <p style={{ color: T.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 12px' }}>CHOOSE PAYMENT METHOD</p>
            {([
              ['upi', '📱', 'UPI'],
              ['card', '💳', 'Debit / Credit Card'],
              ['netbanking', '🏦', 'Netbanking'],
            ] as [Method, string, string][]).map(([m, icon, label]) => (
              <button key={m} onClick={() => { setMethod(m); setStep('details'); }}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:12, background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:12, padding:'15px', marginBottom:10, cursor:'pointer', color:T.text, fontSize:14, fontWeight:600, textAlign:'left' }}>
                <span style={{ fontSize:18 }}>{icon}</span> {label}
                <span style={{ marginLeft:'auto', color:T.muted }}>→</span>
              </button>
            ))}
            <button onClick={onCancel} style={{ width:'100%', background:'transparent', color:T.muted, border:'none', padding:'12px', fontSize:13, cursor:'pointer', marginTop:6 }}>
              Cancel
            </button>
          </>
        )}

        {step === 'details' && method && (
          <>
            <p style={{ color: T.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 14px' }}>
              TEST {method.toUpperCase()} DETAILS — nothing here is verified
            </p>
            {method === 'upi' && (
              <input placeholder="any-name@sandboxbank" value={upiId} onChange={e => setUpiId(e.target.value)}
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:16 }} />
            )}
            {method === 'card' && (
              <>
                <input placeholder="4111 1111 1111 1111" value={cardNum}
                  onChange={e => setCardNum(e.target.value.replace(/[^\d ]/g,''))}
                  style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box', marginBottom:10, fontFamily:'monospace' }} />
                <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                  <input placeholder="MM/YY" value={cardExp} onChange={e => setCardExp(e.target.value)}
                    style={{ flex:1, background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' }} />
                  <input placeholder="CVV" value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g,''))}
                    style={{ width:90, background:'rgba(255,255,255,0.05)', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', color:T.text, fontSize:14, outline:'none', boxSizing:'border-box' }} />
                </div>
              </>
            )}
            {method === 'netbanking' && (
              <div style={{ marginBottom:16 }}>
                {BANKS.map(b => (
                  <button key={b} onClick={() => setBank(b)}
                    style={{ width:'100%', textAlign:'left', background: bank===b ? 'rgba(123,47,190,0.2)' : 'rgba(255,255,255,0.04)', border:`1.5px solid ${bank===b ? T.inrt : T.border}`, borderRadius:10, padding:'12px 14px', marginBottom:8, color:T.text, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                    🏦 {b}
                  </button>
                ))}
              </div>
            )}
            <button disabled={!detailsValid()} onClick={runProcessing}
              style={{ width:'100%', background: detailsValid() ? T.inrt : 'rgba(255,255,255,0.08)', color:'#fff', border:'none', borderRadius:12, padding:'15px', fontSize:15, fontWeight:700, cursor: detailsValid() ? 'pointer' : 'not-allowed' }}>
              Pay ₹{amount}
            </button>
          </>
        )}

        {step === 'processing' && (
          <div style={{ textAlign:'center', padding:'30px 0' }}>
            <div style={{
              width:52, height:52, borderRadius:'50%', margin:'0 auto 18px',
              border:`4px solid ${T.border}`, borderTopColor:T.teal,
              animation:'sandboxSheetSpin 0.8s linear infinite',
            }} />
            <style>{`@keyframes sandboxSheetSpin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color:T.text, fontSize:14, fontWeight:600 }}>{progressMsg}</p>
          </div>
        )}

        {step === 'result' && result && (
          <div style={{ textAlign:'center', padding:'6px 0' }}>
            <div style={{
              width:56, height:56, borderRadius:'50%', margin:'0 auto 14px',
              background: result.success ? 'rgba(0,200,83,0.15)' : 'rgba(255,59,48,0.15)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:26,
            }}>
              {result.success ? '✅' : '❌'}
            </div>
            <p style={{ color:T.text, fontSize:16, fontWeight:800, margin:'0 0 4px' }}>
              {result.success ? 'Payment Successful' : 'Payment Failed'}
            </p>
            <p style={{ color:T.muted, fontSize:12, margin:'0 0 18px' }}>Ref: {result.refId}</p>
            <button onClick={() => onDone(result.success, result.refId)}
              style={{ width:'100%', background:T.inrt, color:'#fff', border:'none', borderRadius:12, padding:'14px', fontSize:14, fontWeight:700, cursor:'pointer' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
