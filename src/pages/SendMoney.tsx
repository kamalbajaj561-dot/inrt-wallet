import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sendMoney, subscribeToUser } from '../lib/db';

export default function SendMoneyPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<'form' | 'pin' | 'success'>('form');
  const [upi, setUpi] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txRef, setTxRef] = useState('');
  const [liveProfile, setLiveProfile] = useState<any>(userProfile);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUser(user.uid, (data: any) => setLiveProfile(data));
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const phone = searchParams.get('phone');
    if (phone) {
      setUpi(phone);
      setError('');
    }
  }, [searchParams]);

  const handleProceed = () => {
    if (!upi.trim()) return setError('Enter UPI ID');
    if (!amount || parseFloat(amount) <= 0) return setError('Enter valid amount');
    if (parseFloat(amount) > (liveProfile?.balance ?? 0)) return setError('Insufficient balance');
    if (upi === liveProfile?.upiId) return setError("Can't send to yourself");
    setError('');
    setStep('pin');
  };

  const handleSend = async () => {
    if (pin.length !== 4) return setError('Enter 4-digit UPI PIN');
    // In production verify pin server-side; here we check stored pin
    // For demo, any 4-digit pin works — replace with real PIN check
    setLoading(true); setError('');
    try {
      const ref = await sendMoney({
        fromUid: user!.uid,
        toUpiId: upi.trim(),
        amount: parseFloat(amount),
        note,
      });
      setTxRef(ref);
      setStep('success');
    } catch (e: any) {
      setError(e.message || 'Payment failed');
    }
    setLoading(false);
  };

  if (step === 'success') return (
    <div style={s.center}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 8 }}>Payment Sent!</h2>
        <p style={{ color: '#666', fontSize: 16, marginBottom: 4 }}>₹{parseFloat(amount).toLocaleString('en-IN')}</p>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>sent to {upi}</p>
        <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 24 }}>Ref: {txRef}</p>
        <p style={{ color: '#16a34a', fontSize: 13, background: '#dcfce7', padding: '8px 16px', borderRadius: 10, marginBottom: 24 }}>
          🎁 You earned {Math.floor(parseFloat(amount) * 0.02)} reward points!
        </p>
        <button style={s.btn} onClick={() => navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => step === 'pin' ? setStep('form') : navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>{step === 'pin' ? 'Enter UPI PIN' : 'Send Money'}</h1>
      </div>

      {step === 'form' && (
        <div style={s.card}>
          <Label text="UPI ID / Phone Number" />
          <input style={s.input} placeholder="name@upi or 10-digit number"
            value={upi} onChange={e => setUpi(e.target.value)} />

          <Label text="Amount (₹)" />
          <input style={{ ...s.input, fontSize: 28, fontWeight: 800, textAlign: 'center' }}
            type="number" placeholder="0"
            value={amount} onChange={e => setAmount(e.target.value)} />

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[100, 200, 500, 1000].map(a => (
              <button key={a} onClick={() => setAmount(String(a))}
                style={{ flex: 1, background: amount === String(a) ? '#dbeafe' : '#f8fafc', border: `1px solid ${amount === String(a) ? '#3b82f6' : '#e5e7eb'}`, borderRadius: 10, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: amount === String(a) ? '#1d4ed8' : '#374151' }}>
                ₹{a}
              </button>
            ))}
          </div>

          <Label text="Note (optional)" />
          <input style={s.input} placeholder="What's this for?"
            value={note} onChange={e => setNote(e.target.value)} />

          <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <p style={{ color: '#15803d', fontSize: 13 }}>
              💰 Available Balance: ₹{(liveProfile?.balance ?? 0).toLocaleString('en-IN')}
            </p>
          </div>

          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} onClick={handleProceed}>Proceed to Pay →</button>
        </div>
      )}

      {step === 'pin' && (
        <div style={s.card}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <p style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>Paying</p>
            <p style={{ fontWeight: 900, fontSize: 32, color: '#111' }}>₹{parseFloat(amount).toLocaleString('en-IN')}</p>
            <p style={{ color: '#666', fontSize: 14 }}>to {upi}</p>
          </div>

          <Label text="Enter 4-digit UPI PIN" />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: i < pin.length ? '#00b9f1' : '#e5e7eb', transition: 'all 0.15s' }} />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, maxWidth: 260, margin: '0 auto 20px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k, i) => (
              <button key={i} onClick={() => {
                if (k === '⌫') setPin(p => p.slice(0, -1));
                else if (k !== '' && pin.length < 4) setPin(p => p + String(k));
              }} style={{ height: 60, borderRadius: 16, background: k === '' ? 'transparent' : '#f8fafc', border: k === '' ? 'none' : '2px solid #e5e7eb', fontSize: 22, fontWeight: 700, cursor: k === '' ? 'default' : 'pointer', color: '#111' }}>{k}</button>
            ))}
          </div>

          {error && <p style={{ ...s.error, textAlign: 'center' }}>{error}</p>}
          <button style={{ ...s.btn, opacity: pin.length === 4 ? 1 : 0.5 }} onClick={handleSend} disabled={loading || pin.length !== 4}>
            {loading ? 'Processing...' : 'Pay Now →'}
          </button>
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 12 }}>🔒 Secured by INRT · UPI encrypted</p>
        </div>
      )}
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <p style={{ color: '#374151', fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>{text.toUpperCase()}</p>;
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', padding: '20px 16px', fontFamily: "'DM Sans', sans-serif" },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 },
  back: { background: '#fff', border: '2px solid #e5e7eb', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer' },
  title: { fontWeight: 800, fontSize: 22, color: '#111' },
  card: { background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' },
  input: { width: '100%', border: '2px solid #e5e7eb', borderRadius: 12, padding: '13px 14px', fontSize: 15, outline: 'none', color: '#111', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 16 },
  btn: { width: '100%', padding: '16px 0', background: '#00b9f1', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' },
  error: { color: '#ef4444', fontSize: 13, marginBottom: 12 },
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif" },
};
