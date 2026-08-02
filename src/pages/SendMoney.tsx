/**
 * INRT WALLET — SendMoney.tsx (National mode)
 *
 * National mode has NO wallet — every payment here debits directly
 * from one of the user's linked bank accounts (see LinkBank.tsx),
 * the way real UPI apps work. This is the Send-3 template selected
 * earlier: segmented method tabs + photo hero + inline form.
 *
 * ⚠️ TEST MODE — no real bank, UPI switch, or card network is
 * contacted. PINs are never stored or validated against anything real.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { addTransaction, type LinkedBankAccount } from '../lib/db';

const T = {
  navy:'#0A2540', accent:'#0070F3', bg:'#F5F7FA', card:'#FFFFFF',
  border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8', green:'#00C853', red:'#FF3B30',
  headerGrad:'linear-gradient(135deg,#002E6E 0%,#00BAF2 100%)',
};

type Method = 'upi' | 'card' | 'bank' | 'cash';
type Step = 'method' | 'recipient' | 'amount' | 'account' | 'pin' | 'processing' | 'result';

const METHOD_INFO: Record<Method, { label:string; photo:string; tagline:string }> = {
  upi:  { label:'UPI',           photo:'https://images.unsplash.com/photo-1571867424488-4565932edb41?w=400&q=80&fit=crop', tagline:'Instant · any UPI ID or number' },
  card: { label:'Send to Card',  photo:'https://images.unsplash.com/photo-1726066012593-3175a0c4e9b8?w=400&q=80&fit=crop', tagline:'Straight to their debit card' },
  bank: { label:'Bank Transfer', photo:'https://images.unsplash.com/photo-1684679674829-fc7b436ec8e8?w=400&q=80&fit=crop', tagline:'NEFT · IMPS · usually 30 min – 2 hrs' },
  cash: { label:'Cash Pickup',   photo:'https://images.unsplash.com/photo-1565514158882-617325fbd873?w=400&q=80&fit=crop', tagline:'Recipient collects in person' },
};

export default function SendMoney() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const linkedAccounts: LinkedBankAccount[] = userProfile?.linkedBankAccounts || [];

  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<Method>('upi');

  // recipient fields (only the relevant ones are used per method)
  const [upiId, setUpiId] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [acctNum, setAcctNum] = useState('');
  const [acctNumConfirm, setAcctNumConfirm] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [cashName, setCashName] = useState('');
  const [cashCity, setCashCity] = useState('');
  const [recipientName, setRecipientName] = useState('');

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fundingAccount, setFundingAccount] = useState<LinkedBankAccount | null>(linkedAccounts[0] || null);
  const [pin, setPin] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<{ success:boolean; refId:string; time:string } | null>(null);
  const [err, setErr] = useState('');

  const amt = Number(amount);
  const validAmount = amt > 0 && amt <= 200000;

  const recipientValid = () => {
    if (method === 'upi')  return /^[\w.-]+@[\w.-]+$/.test(upiId.trim()) || /^\d{10}$/.test(upiId.trim());
    if (method === 'card') return /^\d{16}$/.test(cardNum.replace(/\s/g,''));
    if (method === 'bank') return acctNum.length >= 8 && acctNum === acctNumConfirm && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase());
    if (method === 'cash') return cashName.trim().length > 1 && cashCity.trim().length > 1;
    return false;
  };

  const goAmount = () => { if (!recipientValid()) { setErr('Please fill in valid recipient details'); return; } setErr(''); setStep('amount'); };

  const goAccount = () => {
    if (!validAmount) { setErr('Enter a valid amount (up to ₹2,00,000)'); return; }
    setErr('');
    if (linkedAccounts.length === 0) { navigate('/link-bank'); return; }
    if (linkedAccounts.length === 1) { setFundingAccount(linkedAccounts[0]); setStep('pin'); return; }
    setStep('account');
  };

  const choosePin = (acc: LinkedBankAccount) => { setFundingAccount(acc); setStep('pin'); };

  const runProcessing = async () => {
    if (!/^\d{4}$/.test(pin)) return setErr('Enter your 4-digit UPI PIN');
    setErr('');
    setStep('processing');
    const stages = method === 'bank'
      ? ['Connecting to sandbox NEFT network…', 'Verifying recipient account…', 'Simulating bank debit…', 'Confirming transfer…']
      : ['Connecting to sandbox UPI switch…', 'Verifying recipient…', 'Authorizing with your bank…', 'Confirming payment…'];
    for (const s of stages) { setProgressMsg(s); await new Promise(r => setTimeout(r, 500)); }

    const success = Math.random() > 0.06;
    const refId = String(Math.floor(100000000000 + Math.random() * 899999999999));
    const time = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

    if (user?.uid) {
      const label = method === 'cash' ? cashName : method === 'bank' ? `A/C ${acctNum.slice(-4)}` : method === 'card' ? `Card ••${cardNum.slice(-4)}` : upiId;
      await addTransaction(user.uid, {
        type: 'debit',
        amount: amt,
        note: `Sent to ${recipientName || label} via ${METHOD_INFO[method].label}${fundingAccount ? ` (${fundingAccount.bankName} ••${fundingAccount.accountNumberMasked.slice(-4)})` : ''}${success ? '' : ' — Failed'}`,
        cat: 'transfer',
        ref: refId,
      });
      await refreshProfile();
    }
    setResult({ success, refId, time });
    setStep('result');
  };

  const reset = () => {
    setStep('method'); setUpiId(''); setCardNum(''); setAcctNum(''); setAcctNumConfirm(''); setIfsc('');
    setCashName(''); setCashCity(''); setRecipientName(''); setAmount(''); setNote('');
    setPin(''); setResult(null); setErr('');
  };

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ background:T.headerGrad, padding:'20px 20px 16px', display:'flex', alignItems:'center', gap:14 }}>
        <button onClick={() => step==='method' ? navigate(-1) : reset()}
          style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', fontSize:16, cursor:'pointer' }}>←</button>
        <div>
          <h1 style={{ color:'#fff', fontSize:20, fontWeight:800, margin:0 }}>Send Money</h1>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:11, margin:'2px 0 0' }}>Straight from your bank account</p>
        </div>
      </div>

      <div style={{ padding:'18px', maxWidth:460, margin:'0 auto' }}>
        <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:24, boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>

          {step === 'method' && (
            <>
              <p style={{ fontSize:20, fontWeight:800, color:T.navy, margin:'0 0 4px' }}>Choose how you'd like to pay</p>
              <p style={{ fontSize:12, color:T.muted, margin:'0 0 16px' }}>Pick a method to continue</p>

              <div style={{ display:'flex', background:T.light, borderRadius:14, padding:4, marginBottom:16 }}>
                {(Object.keys(METHOD_INFO) as Method[]).map(m => (
                  <button key={m} onClick={() => setMethod(m)}
                    style={{ flex:1, textAlign:'center', padding:'9px 0', borderRadius:11, fontSize:11, fontWeight:800,
                      color: method===m ? T.navy : T.muted, background: method===m ? '#fff' : 'transparent',
                      border:'none', cursor:'pointer', boxShadow: method===m ? '0 2px 6px rgba(0,0,0,0.1)' : 'none' }}>
                    {METHOD_INFO[m].label}
                  </button>
                ))}
              </div>

              <div style={{ borderRadius:18, height:120, position:'relative', overflow:'hidden', marginBottom:18,
                backgroundImage:`url(${METHOD_INFO[method].photo})`, backgroundSize:'cover', backgroundPosition:'center' }}>
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,rgba(10,20,35,0.2),rgba(10,20,35,0.65))' }} />
                <p style={{ position:'absolute', bottom:10, left:14, color:'#fff', fontWeight:800, fontSize:15, margin:0 }}>{METHOD_INFO[method].label}</p>
                <p style={{ position:'absolute', bottom:34, left:14, right:14, color:'rgba(255,255,255,0.85)', fontSize:11, margin:0 }}>{METHOD_INFO[method].tagline}</p>
              </div>

              <button onClick={() => setStep('recipient')}
                style={{ width:'100%', background:T.headerGrad, color:'#fff', border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor:'pointer' }}>
                Continue →
              </button>
            </>
          )}

          {step === 'recipient' && (
            <>
              <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 14px' }}>
                {METHOD_INFO[method].label.toUpperCase()} — RECIPIENT DETAILS
              </p>

              {method === 'upi' && (
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>UPI ID OR MOBILE NUMBER</label>
                  <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@bank or 10-digit number"
                    style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5 }} />
                </div>
              )}

              {method === 'card' && (
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>RECIPIENT'S CARD NUMBER</label>
                  <input value={cardNum} onChange={e => setCardNum(e.target.value.replace(/[^\d ]/g,''))} placeholder="16-digit card number"
                    style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5, fontFamily:'monospace' }} />
                </div>
              )}

              {method === 'bank' && (
                <>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>RECIPIENT'S ACCOUNT NUMBER</label>
                    <input value={acctNum} onChange={e => setAcctNum(e.target.value.replace(/\D/g,''))} placeholder="Enter account number"
                      style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5 }} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>CONFIRM ACCOUNT NUMBER</label>
                    <input value={acctNumConfirm} onChange={e => setAcctNumConfirm(e.target.value.replace(/\D/g,''))} placeholder="Re-enter account number"
                      style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5 }} />
                  </div>
                  <div style={{ marginBottom:6 }}>
                    <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>IFSC CODE</label>
                    <input value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} placeholder="e.g. HDFC0001234"
                      style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5, textTransform:'uppercase' }} />
                  </div>
                  {acctNum.length >= 8 && acctNum === acctNumConfirm && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim()) && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, background:'#E8FAF0', border:'1px solid #A8E6C1', borderRadius:10, padding:'8px 12px', margin:'10px 0', fontSize:11, color:'#0A7A3E', fontWeight:700 }}>
                      ✓ Verified: {recipientName || 'Account holder'} confirmed
                    </div>
                  )}
                </>
              )}

              {method === 'cash' && (
                <>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>RECIPIENT'S FULL NAME</label>
                    <input value={cashName} onChange={e => setCashName(e.target.value)} placeholder="As on their ID"
                      style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5 }} />
                  </div>
                  <div style={{ marginBottom:6 }}>
                    <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>PICKUP CITY</label>
                    <input value={cashCity} onChange={e => setCashCity(e.target.value)} placeholder="City where they'll collect"
                      style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5 }} />
                  </div>
                </>
              )}

              {method !== 'bank' && (
                <div style={{ marginTop:12 }}>
                  <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>RECIPIENT NAME (OPTIONAL, FOR YOUR RECORDS)</label>
                  <input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="e.g. Rohan Sharma"
                    style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5 }} />
                </div>
              )}

              {err && <p style={{ color:T.red, fontSize:12, margin:'14px 0 0' }}>{err}</p>}
              <button onClick={goAmount}
                style={{ width:'100%', background:T.headerGrad, color:'#fff', border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor:'pointer', marginTop:18 }}>
                Continue →
              </button>
            </>
          )}

          {step === 'amount' && (
            <>
              <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 10px' }}>AMOUNT</p>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₹ 0"
                style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'16px 14px', fontSize:22, fontWeight:800, marginBottom:14, color:T.navy }} />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
                {[100, 500, 1000, 5000].map(a => (
                  <button key={a} onClick={() => setAmount(String(a))}
                    style={{ background:T.light, border:`1px solid ${T.border}`, borderRadius:10, padding:'9px 0', fontSize:12, fontWeight:700, color:T.navy, cursor:'pointer' }}>₹{a}</button>
                ))}
              </div>
              <label style={{ fontSize:10, color:T.muted, fontWeight:700 }}>NOTE (OPTIONAL)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="What's this for?"
                style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.border}`, borderRadius:12, padding:'13px 14px', fontSize:14, marginTop:5, marginBottom:16 }} />
              {err && <p style={{ color:T.red, fontSize:12, marginBottom:12 }}>{err}</p>}
              <button disabled={!validAmount} onClick={goAccount}
                style={{ width:'100%', background: validAmount ? T.headerGrad : T.light, color: validAmount ? '#fff' : T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: validAmount ? 'pointer':'not-allowed' }}>
                Continue →
              </button>
            </>
          )}

          {step === 'account' && (
            <>
              <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 14px' }}>PAY FROM</p>
              {linkedAccounts.map(acc => (
                <button key={acc.id} onClick={() => choosePin(acc)}
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
            </>
          )}

          {step === 'pin' && fundingAccount && (
            <>
              <p style={{ color:T.muted, fontSize:12, fontWeight:700, letterSpacing:0.5, margin:'0 0 4px' }}>ENTER UPI PIN</p>
              <p style={{ color:T.muted, fontSize:12, margin:'0 0 18px' }}>
                Paying ₹{amt.toLocaleString('en-IN')} from {fundingAccount.bankName} {fundingAccount.accountNumberMasked}
              </p>
              <input type="password" inputMode="numeric" maxLength={4} value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g,''))} placeholder="••••"
                style={{ width:'100%', textAlign:'center', letterSpacing:12, fontSize:24, fontWeight:800, border:`1.5px solid ${T.border}`, borderRadius:12, padding:'16px 14px', marginBottom:16, boxSizing:'border-box', color:T.navy }} />
              {err && <p style={{ color:T.red, fontSize:12, marginBottom:12, textAlign:'center' }}>{err}</p>}
              <button disabled={pin.length!==4} onClick={runProcessing}
                style={{ width:'100%', background: pin.length===4 ? T.headerGrad : T.light, color: pin.length===4 ? '#fff':T.muted, border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor: pin.length===4 ? 'pointer':'not-allowed' }}>
                Pay ₹{amt.toLocaleString('en-IN')}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div style={{ textAlign:'center', padding:'30px 0' }}>
              <div style={{ width:52, height:52, border:`4px solid ${T.light}`, borderTopColor:T.accent, borderRadius:'50%', animation:'sendSpin 0.8s linear infinite', margin:'0 auto 18px' }} />
              <style>{`@keyframes sendSpin{to{transform:rotate(360deg)}}`}</style>
              <p style={{ color:T.navy, fontWeight:700, fontSize:14 }}>{progressMsg}</p>
              <p style={{ color:T.muted, fontSize:11, marginTop:8 }}>🧪 Test mode — no real network call is happening</p>
            </div>
          )}

          {step === 'result' && result && (
            <div style={{ textAlign:'center' }}>
              <div style={{ background: result.success ? 'rgba(0,200,83,0.08)' : 'rgba(255,59,48,0.08)', border:`1px solid ${result.success?'rgba(0,200,83,0.3)':'rgba(255,59,48,0.3)'}`, borderRadius:18, padding:'28px 20px', marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:14 }}>
                  <span style={{ fontSize:30, fontWeight:800, color:T.navy }}>₹{amt.toLocaleString('en-IN')}</span>
                  <span style={{ fontSize:22 }}>{result.success ? '✅' : '❌'}</span>
                </div>
                <p style={{ color: result.success ? T.green : T.red, fontSize:16, fontWeight:800, margin:'0 0 18px' }}>
                  {result.success ? 'Paid Successfully' : 'Payment Failed'}
                </p>
                <p style={{ color:T.navy, fontSize:14, fontWeight:700, margin:'0 0 4px' }}>
                  To {recipientName || (method==='cash'?cashName:method==='bank'?`A/C ••${acctNum.slice(-4)}`:method==='card'?`Card ••${cardNum.slice(-4)}`:upiId)}
                </p>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 4px' }}>{result.time}</p>
                <p style={{ color:T.muted, fontSize:12, margin:0 }}>Ref No. {result.refId}</p>
              </div>
              <button onClick={reset}
                style={{ width:'100%', background:T.headerGrad, color:'#fff', border:'none', borderRadius:12, padding:14, fontWeight:700, fontSize:14, cursor:'pointer', marginBottom:10 }}>
                Send Another Payment
              </button>
              <button onClick={() => navigate('/dashboard')}
                style={{ width:'100%', background:'transparent', color:T.muted, border:'none', padding:10, fontSize:13, cursor:'pointer' }}>
                Back to Dashboard
              </button>
            </div>
          )}

        </div>

        {step === 'method' && (
          <div style={{ background:'rgba(255,214,10,0.12)', border:'1px solid rgba(255,214,10,0.3)', borderRadius:12, padding:'10px 14px', marginTop:16 }}>
            <p style={{ color:'#B8860B', fontSize:11, fontWeight:700, margin:0, lineHeight:1.5 }}>
              🧪 Test mode — no real bank, UPI switch, or card network is contacted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
