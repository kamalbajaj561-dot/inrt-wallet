/**
 * INRT WALLET — BankPaySheet.tsx
 *
 * National mode has NO wallet. This is the shared "pay from a linked
 * bank account" bottom sheet used by Recharge, Bill Payments, Gold,
 * and anywhere else money needs to move out in National mode — the
 * same funding model as SendMoney.tsx, just packaged as a drop-in
 * component so every page authorizes payments the same way.
 *
 * ⚠️ TEST MODE — no real bank or UPI switch is contacted. The PIN is
 * never stored or validated against anything real.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { LinkedBankAccount } from '../lib/db';

const T = {
  navy:'#0A2540', accent:'#0070F3', border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8',
  headerGrad:'linear-gradient(135deg,#002E6E 0%,#00BAF2 100%)',
};

type Step = 'account' | 'pin' | 'processing';

interface Props {
  amount: number;
  itemLabel: string;
  onCancel: () => void;
  onDone: (success: boolean, refId: string, account: LinkedBankAccount) => void;
}

export default function BankPaySheet({ amount, itemLabel, onCancel, onDone }: Props) {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const linkedAccounts: LinkedBankAccount[] = userProfile?.linkedBankAccounts || [];

  const [step, setStep] = useState<Step>(linkedAccounts.length > 1 ? 'account' : 'pin');
  const [account, setAccount] = useState<LinkedBankAccount | null>(linkedAccounts[0] || null);
  const [pin, setPin] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [err, setErr] = useState('');

  // No linked account at all — send them to link one instead of
  // getting stuck with a payment sheet that can't actually pay.
  if (linkedAccounts.length === 0) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
        <div style={{ width:'100%', maxWidth:460, background:'#fff', borderRadius:'24px 24px 0 0', padding:'28px 24px', boxSizing:'border-box', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🏦</div>
          <p style={{ fontWeight:800, fontSize:16, color:T.navy, margin:'0 0 6px' }}>Link a bank account first</p>
          <p style={{ fontSize:13, color:T.muted, margin:'0 0 20px' }}>You need a linked bank account to pay for {itemLabel}.</p>
          <button onClick={() => navigate('/link-bank')}
            style={{ width:'100%', background:T.headerGrad, color:'#fff', border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor:'pointer', marginBottom:10 }}>
            Link Bank Account
          </button>
          <button onClick={onCancel} style={{ width:'100%', background:'transparent', border:'none', color:T.muted, padding:10, fontSize:13, cursor:'pointer' }}>Cancel</button>
        </div>
      </div>
    );
  }

  const runPayment = async () => {
    if (!/^\d{4}$/.test(pin)) return setErr('Enter your 4-digit UPI PIN');
    if (!account) return;
    setErr('');
    setStep('processing');
    const stages = ['Connecting to sandbox UPI switch…', 'Authorizing with your bank…', 'Confirming payment…'];
    for (const s of stages) { setProgressMsg(s); await new Promise(r => setTimeout(r, 500)); }
    const success = Math.random() > 0.06;
    const refId = 'TXN' + Math.random().toString(36).slice(2, 11).toUpperCase();
    onDone(success, refId, account);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:460, background:'#fff', borderRadius:'24px 24px 0 0', padding:'20px 20px 28px', boxSizing:'border-box', maxHeight:'88vh', overflowY:'auto' }}>
        <div style={{ width:40, height:4, borderRadius:4, background:T.border, margin:'0 auto 18px' }} />

        {step === 'account' && (
          <>
            <p style={{ color:T.navy, fontSize:16, fontWeight:800, margin:'0 0 2px' }}>{itemLabel}</p>
            <p style={{ color:T.navy, fontSize:24, fontWeight:800, margin:'0 0 20px' }}>₹{amount.toLocaleString('en-IN')}</p>
            <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 12px' }}>PAY FROM</p>
            {linkedAccounts.map(acc => (
              <button key={acc.id} onClick={() => { setAccount(acc); setStep('pin'); }}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:14, background:T.light, border:`1.5px solid ${T.border}`, borderRadius:14, padding:14, marginBottom:10, cursor:'pointer', textAlign:'left' }}>
                <div style={{ width:40, height:40, borderRadius:10, background:T.headerGrad, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:13, flexShrink:0 }}>
                  {acc.bankName.split(' ').map(w=>w[0]).slice(0,2).join('')}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:700, fontSize:13, color:T.navy, margin:0 }}>{acc.bankName}</p>
                  <p style={{ fontSize:11, color:T.muted, margin:'2px 0 0' }}>A/C {acc.accountNumberMasked}</p>
                </div>
                <span style={{ color:T.accent }}>→</span>
              </button>
            ))}
            <button onClick={onCancel} style={{ width:'100%', background:'transparent', border:'none', color:T.muted, padding:12, fontSize:13, cursor:'pointer', marginTop:6 }}>Cancel</button>
          </>
        )}

        {step === 'pin' && account && (
          <>
            <p style={{ color:T.navy, fontSize:16, fontWeight:800, margin:'0 0 2px' }}>{itemLabel}</p>
            <p style={{ color:T.navy, fontSize:24, fontWeight:800, margin:'0 0 16px' }}>₹{amount.toLocaleString('en-IN')}</p>
            <p style={{ color:T.muted, fontSize:12, margin:'0 0 18px' }}>
              Paying from {account.bankName} {account.accountNumberMasked}
            </p>
            <input type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g,''))} placeholder="Enter UPI PIN"
              style={{ width:'100%', textAlign:'center', letterSpacing:12, fontSize:22, fontWeight:800, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'15px 14px', marginBottom:16, boxSizing:'border-box', color:T.navy }} />
            {err && <p style={{ color:'#FF3B30', fontSize:12, marginBottom:12, textAlign:'center' }}>{err}</p>}
            <button disabled={pin.length!==4} onClick={runPayment}
              style={{ width:'100%', background: pin.length===4 ? T.headerGrad : T.light, color: pin.length===4 ? '#fff':T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: pin.length===4 ? 'pointer':'not-allowed' }}>
              Pay ₹{amount.toLocaleString('en-IN')}
            </button>
          </>
        )}

        {step === 'processing' && (
          <div style={{ textAlign:'center', padding:'30px 0' }}>
            <div style={{ width:52, height:52, border:`4px solid ${T.light}`, borderTopColor:T.accent, borderRadius:'50%', animation:'bankPaySpin 0.8s linear infinite', margin:'0 auto 18px' }} />
            <style>{`@keyframes bankPaySpin{to{transform:rotate(360deg)}}`}</style>
            <p style={{ color:T.navy, fontWeight:700, fontSize:14 }}>{progressMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}
