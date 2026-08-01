/**
 * INRT WALLET — LinkBank.tsx
 *
 * National mode has NO wallet balance — payments go directly from the
 * user's own linked bank account, the way real UPI apps (GPay/PhonePe/
 * Paytm) work: your mobile number (the one registered with your bank)
 * is used to discover which bank accounts are linked to it, you pick
 * one, set a UPI PIN, and that account becomes the funding source for
 * all National-mode payments.
 *
 * ⚠️ TEST MODE — this simulates the discovery/linking flow. No real
 * bank or NPCI system is contacted; the "discovered accounts" are
 * mocked so the product experience can be built and tested.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { setLinkedBankAccount } from '../lib/db';

const T = {
  navy:'#0A2540', accent:'#0070F3', bg:'#F5F7FA', card:'#FFFFFF',
  border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8', green:'#00C853',
  headerGrad:'linear-gradient(135deg,#002E6E 0%,#00BAF2 100%)',
};

type Step = 'mobile' | 'searching' | 'accounts' | 'pin' | 'confirmPin' | 'done';

interface DiscoveredAccount {
  bankName: string;
  accountType: string;
  accountNumberMasked: string;
  ifsc: string;
}

// In test mode we simulate 1-2 accounts being found for any mobile
// number entered, matching the real experience of a mobile-number
// bank lookup.
const MOCK_BANKS = [
  { bankName:'HDFC Bank',      accountType:'Savings',  ifsc:'HDFC0001234' },
  { bankName:'State Bank of India', accountType:'Savings', ifsc:'SBIN0004567' },
];

export default function LinkBank() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('mobile');
  const [mobile, setMobile] = useState(userProfile?.phone || '');
  const [accounts, setAccounts] = useState<DiscoveredAccount[]>([]);
  const [selected, setSelected] = useState<DiscoveredAccount | null>(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const mobileValid = /^\d{10}$/.test(mobile.trim());

  const searchAccounts = async () => {
    if (!mobileValid) return setErr('Enter a valid 10-digit mobile number');
    setErr('');
    setStep('searching');
    await new Promise(r => setTimeout(r, 1600));
    // Simulate discovering accounts linked to this mobile number.
    const found = MOCK_BANKS.map((b, i) => ({
      ...b,
      accountNumberMasked: `••••••${1000 + Math.floor(Math.random()*9000) + i}`,
    }));
    setAccounts(found);
    setStep('accounts');
  };

  const chooseAccount = (acc: DiscoveredAccount) => {
    setSelected(acc);
    setStep('pin');
  };

  const submitPin = () => {
    if (!/^\d{4}$/.test(pin)) return setErr('Enter a 4-digit PIN');
    setErr('');
    setStep('confirmPin');
  };

  const confirmPin = async () => {
    if (pinConfirm !== pin) return setErr("PINs don't match — try again");
    if (!selected || !user?.uid) return;
    setErr('');
    setLoading(true);
    try {
      await setLinkedBankAccount(user.uid, {
        bankName: selected.bankName,
        accountNumberMasked: selected.accountNumberMasked,
        accountType: selected.accountType,
        ifsc: selected.ifsc,
        mobileNumber: mobile,
      });
      await refreshProfile();
      setStep('done');
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong linking your account');
      setStep('pin'); setPin(''); setPinConfirm('');
    }
    setLoading(false);
  };

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ background:T.headerGrad, padding:'20px 20px 26px', display:'flex', alignItems:'center', gap:14 }}>
        <button onClick={() => step==='mobile' ? navigate(-1) : setStep('mobile')}
          style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', fontSize:16, cursor:'pointer' }}>←</button>
        <div>
          <h1 style={{ color:'#fff', fontSize:20, fontWeight:800, margin:0 }}>Link Bank Account</h1>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:11, margin:'2px 0 0' }}>Payments go straight from your bank — no wallet needed</p>
        </div>
      </div>

      <div style={{ padding:'20px 18px', maxWidth:460, margin:'0 auto' }}>
        <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:24, boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>

          {step === 'mobile' && (
            <>
              <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 4px' }}>YOUR MOBILE NUMBER</p>
              <p style={{ color:T.muted, fontSize:12, margin:'0 0 16px', lineHeight:1.6 }}>
                Use the mobile number registered with your bank — we'll look up which accounts are linked to it.
              </p>
              <div style={{ display:'flex', alignItems:'center', gap:8, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', marginBottom:16 }}>
                <span style={{ color:T.navy, fontWeight:700, fontSize:14 }}>+91</span>
                <input value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g,'').slice(0,10))}
                  placeholder="10-digit mobile number"
                  style={{ border:'none', outline:'none', fontSize:14, flex:1, fontFamily:'inherit' }} />
              </div>
              {err && <p style={{ color:'#FF3B30', fontSize:12, marginBottom:12 }}>{err}</p>}
              <button disabled={!mobileValid} onClick={searchAccounts}
                style={{ width:'100%', background: mobileValid ? T.headerGrad : T.light, color: mobileValid ? '#fff' : T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: mobileValid ? 'pointer':'not-allowed' }}>
                Find My Bank Accounts
              </button>
            </>
          )}

          {step === 'searching' && (
            <div style={{ textAlign:'center', padding:'30px 0' }}>
              <div style={{ width:52, height:52, border:`4px solid ${T.light}`, borderTopColor:T.accent, borderRadius:'50%', animation:'linkSpin 0.8s linear infinite', margin:'0 auto 18px' }} />
              <style>{`@keyframes linkSpin{to{transform:rotate(360deg)}}`}</style>
              <p style={{ color:T.navy, fontWeight:700, fontSize:14 }}>Looking up accounts linked to +91 {mobile}…</p>
              <p style={{ color:T.muted, fontSize:11, marginTop:8 }}>🧪 Test mode — no real bank is being contacted</p>
            </div>
          )}

          {step === 'accounts' && (
            <>
              <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 14px' }}>
                {accounts.length} ACCOUNT{accounts.length!==1?'S':''} FOUND
              </p>
              {accounts.map((acc, i) => (
                <button key={i} onClick={() => chooseAccount(acc)}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:14, background:T.light, border:`1.5px solid ${T.border}`, borderRadius:14, padding:14, marginBottom:10, cursor:'pointer', textAlign:'left' }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:T.headerGrad, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:15, flexShrink:0 }}>
                    {acc.bankName.split(' ').map(w=>w[0]).slice(0,2).join('')}
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:T.navy, margin:0 }}>{acc.bankName}</p>
                    <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0' }}>{acc.accountType} · {acc.accountNumberMasked}</p>
                  </div>
                  <span style={{ color:T.accent, fontSize:16 }}>→</span>
                </button>
              ))}
              <p style={{ color:T.muted, fontSize:11, textAlign:'center', marginTop:8 }}>
                Don't see your account? Try a different mobile number.
              </p>
            </>
          )}

          {step === 'pin' && selected && (
            <>
              <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 4px' }}>SET YOUR UPI PIN</p>
              <p style={{ color:T.muted, fontSize:12, margin:'0 0 20px', lineHeight:1.6 }}>
                This 4-digit PIN authorizes payments from {selected.bankName} {selected.accountNumberMasked}.
              </p>
              <input type="password" inputMode="numeric" maxLength={4} value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g,''))}
                placeholder="••••"
                style={{ width:'100%', textAlign:'center', letterSpacing:12, fontSize:24, fontWeight:800, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'16px 14px', marginBottom:16, boxSizing:'border-box', fontFamily:'inherit', color:T.navy }} />
              {err && <p style={{ color:'#FF3B30', fontSize:12, marginBottom:12, textAlign:'center' }}>{err}</p>}
              <button disabled={pin.length!==4} onClick={submitPin}
                style={{ width:'100%', background: pin.length===4 ? T.headerGrad : T.light, color: pin.length===4 ? '#fff':T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: pin.length===4 ? 'pointer':'not-allowed' }}>
                Continue
              </button>
            </>
          )}

          {step === 'confirmPin' && (
            <>
              <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 16px' }}>CONFIRM YOUR PIN</p>
              <input type="password" inputMode="numeric" maxLength={4} value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g,''))}
                placeholder="••••"
                style={{ width:'100%', textAlign:'center', letterSpacing:12, fontSize:24, fontWeight:800, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'16px 14px', marginBottom:16, boxSizing:'border-box', fontFamily:'inherit', color:T.navy }} />
              {err && <p style={{ color:'#FF3B30', fontSize:12, marginBottom:12, textAlign:'center' }}>{err}</p>}
              <button disabled={pinConfirm.length!==4 || loading} onClick={confirmPin}
                style={{ width:'100%', background: pinConfirm.length===4 ? T.headerGrad : T.light, color: pinConfirm.length===4 ? '#fff':T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: pinConfirm.length===4 ? 'pointer':'not-allowed' }}>
                {loading ? 'Linking…' : 'Confirm & Link Account'}
              </button>
            </>
          )}

          {step === 'done' && selected && (
            <div style={{ textAlign:'center', padding:'10px 0' }}>
              <div style={{ width:60, height:60, borderRadius:'50%', background:'rgba(0,200,83,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 16px' }}>✅</div>
              <p style={{ fontWeight:800, fontSize:17, color:T.navy, margin:'0 0 6px' }}>Account Linked!</p>
              <p style={{ color:T.muted, fontSize:13, margin:'0 0 20px' }}>
                {selected.bankName} {selected.accountNumberMasked} is now your funding source for payments.
              </p>
              <button onClick={() => navigate('/dashboard')}
                style={{ width:'100%', background:T.headerGrad, color:'#fff', border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor:'pointer' }}>
                Go to Dashboard
              </button>
            </div>
          )}

        </div>

        {step === 'mobile' && (
          <div style={{ background:'rgba(255,214,10,0.12)', border:'1px solid rgba(255,214,10,0.3)', borderRadius:12, padding:'10px 14px', marginTop:16 }}>
            <p style={{ color:'#B8860B', fontSize:11, fontWeight:700, margin:0, lineHeight:1.5 }}>
              🧪 Test mode — this simulates bank account discovery. No real bank or NPCI system is contacted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
