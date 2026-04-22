import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';

const API = import.meta.env.VITE_API_URL || '';
// PLACEHOLDER: Replace with rzp_live_XXXXX for production
const RZP_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID';

declare global { interface Window { Razorpay: any; } }

export default function AddMoney() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [amount,  setAmount]  = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [err,     setErr]     = useState('');

  const bal   = userProfile?.balance || 0;
  const QUICK = [100, 200, 500, 1000, 2000, 5000];

  const loadRazorpay = (): Promise<boolean> =>
    new Promise(resolve => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload  = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 10) return setErr('Minimum ₹10');
    setLoading(true); setErr('');
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Razorpay SDK failed to load. Check your internet connection.');

      // Create order
      const r   = await fetch(`${API}/create-order`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ amount: amt, userId: user?.uid }),
      });
      const { orderId, keyId } = await r.json();
      if (!orderId) throw new Error('Order creation failed. Check your backend.');

      // Open payment modal
      await new Promise<void>((res, rej) => {
        const rzp = new window.Razorpay({
          key:         keyId || RZP_KEY,
          amount:      amt * 100,
          currency:    'INR',
          name:        'INRT Wallet',
          description: 'Add Money',
          order_id:    orderId,
          prefill:     { name: userProfile?.name, contact: userProfile?.phone },
          theme:       { color: '#00e5cc' },
          handler: async (response: any) => {
            try {
              const v = await fetch(`${API}/verify-payment`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ ...response, userId: user?.uid, amount: amt }),
              });
              const vd = await v.json();
              if (!vd.success) throw new Error(vd.error || 'Verification failed');
              await refreshProfile();
              setSuccess({ amount: amt, ref: response.razorpay_payment_id });
              setAmount('');
              res();
            } catch (ve) { rej(ve); }
          },
          modal: { ondismiss: () => { setLoading(false); rej(new Error('cancelled')); } },
        });
        rzp.open();
      });
    } catch (e: any) {
      if (e.message !== 'cancelled') setErr(e.message || 'Payment failed');
    }
    setLoading(false);
  };

  if (success) return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',
                   fontFamily:'var(--f-body)',display:'flex',flexDirection:'column',
                   alignItems:'center',padding:'80px 24px',textAlign:'center' }}>
      <div style={{ width:80,height:80,borderRadius:'50%',background:'rgba(0,214,143,0.1)',
                     border:'2px solid var(--green)',display:'flex',alignItems:'center',
                     justifyContent:'center',fontSize:36,marginBottom:20 }}>✅</div>
      <h2 style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:24,
                    color:'var(--t1)',marginBottom:8 }}>Money Added!</h2>
      <p style={{ color:'var(--t2)',fontSize:16,marginBottom:24 }}>
        ₹{success.amount.toLocaleString('en-IN')} added to your wallet
      </p>
      <div style={{ background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r3)',
                     padding:20,width:'100%',marginBottom:24 }}>
        {[['Amount',`₹${success.amount}`],['Reference',success.ref],['Status','✅ Success']].map(([k,v])=>(
          <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'9px 0',
                                  borderBottom:'1px solid var(--b1)' }}>
            <span style={{ color:'var(--t2)',fontSize:13 }}>{k}</span>
            <span style={{ color:'var(--t1)',fontWeight:700,fontSize:13 }}>{v}</span>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={() => navigate('/dashboard')}>Back to Home</button>
      <button className="btn-outline" style={{ marginTop:10 }}
        onClick={() => setSuccess(null)}>Add More Money</button>
    </div>
  );

  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',
                   background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',
                     padding:'52px 20px 24px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:20 }}>
          <button onClick={() => navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Add Money</h1>
        </div>
        {/* Balance */}
        <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid var(--b1)',
                       borderRadius:'var(--r3)',padding:'16px 20px' }}>
          <p style={{ color:'var(--t3)',fontSize:11,letterSpacing:1 }}>WALLET BALANCE</p>
          <p style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:30,
                       color:'var(--t1)',marginTop:6 }}>
            ₹{bal.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      <div style={{ padding:'20px 16px 40px' }}>
        {/* Amount input */}
        <div className="card" style={{ marginBottom:16 }}>
          <p className="s-label">ENTER AMOUNT</p>
          <div className="amount-box" style={{ marginBottom:14 }}>
            <span style={{ color:'var(--teal)',fontSize:24,fontWeight:700 }}>₹</span>
            <input className="amount-input" type="number" min={10}
              placeholder="0" value={amount}
              onChange={e => { setAmount(e.target.value); setErr(''); }} />
          </div>
          {/* Quick amounts */}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
            {QUICK.map(a => (
              <button key={a} onClick={() => setAmount(String(a))}
                style={{ padding:'10px 0',borderRadius:'var(--r1)',fontSize:13,fontWeight:700,
                           cursor:'pointer',
                           background:amount===String(a)?'var(--teal-dim)':'var(--bg-elevated)',
                           border:`1px solid ${amount===String(a)?'var(--teal)':'var(--b1)'}`,
                           color:amount===String(a)?'var(--teal)':'var(--t2)' }}>
                ₹{a}
              </button>
            ))}
          </div>
        </div>

        {/* Methods */}
        <div className="card" style={{ marginBottom:16 }}>
          <p className="s-label">ACCEPTED PAYMENT METHODS</p>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' as const }}>
            {['UPI','Credit Card','Debit Card','Net Banking','Wallet'].map(m => (
              <span key={m} className="badge-teal">{m}</span>
            ))}
          </div>
        </div>

        {/* Info */}
        {amount && parseFloat(amount) >= 10 && (
          <div style={{ background:'rgba(0,229,204,0.06)',border:'1px solid rgba(0,229,204,0.15)',
                         borderRadius:'var(--r2)',padding:'12px 16px',marginBottom:16 }}>
            <p style={{ color:'var(--teal)',fontSize:13,fontWeight:600 }}>
              🎁 Earn {Math.floor(parseFloat(amount)/10)} reward points for this transaction!
            </p>
          </div>
        )}

        {err && <p className="err-box" style={{ marginBottom:14 }}>⚠️ {err}</p>}

        <button className="btn-primary"
          onClick={handlePay}
          disabled={loading || !amount || parseFloat(amount) < 10}
          style={{ opacity:loading||!amount||parseFloat(amount)<10?0.5:1 }}>
          {loading ? '⏳ Processing…' : amount ? `Add ₹${parseFloat(amount).toLocaleString('en-IN')} →` : 'Enter amount'}
        </button>
        <p style={{ textAlign:'center',color:'var(--t3)',fontSize:11,marginTop:12 }}>
          🔒 Secured by Razorpay · RBI Compliant · 256-bit SSL
        </p>
      </div>
    </div>
  );
}
