import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  { id: 'electricity', icon: '⚡', label: 'Electricity', providers: ['MSEDCL', 'TPDDL', 'BESCOM', 'CESC', 'BSES'] },
  { id: 'water', icon: '💧', label: 'Water', providers: ['BMC', 'NDMC', 'BWSSB', 'HMWSSB'] },
  { id: 'gas', icon: '🔥', label: 'Gas', providers: ['MGL', 'IGL', 'GAIL Gas', 'BGL'] },
  { id: 'broadband', icon: '🌐', label: 'Broadband', providers: ['Jio Fiber', 'Airtel Xstream', 'BSNL', 'ACT Fibernet'] },
  { id: 'postpaid', icon: '📱', label: 'Postpaid', providers: ['Airtel', 'Jio', 'Vi', 'BSNL'] },
  { id: 'creditcard', icon: '💳', label: 'Credit Card', providers: ['HDFC', 'SBI Card', 'ICICI', 'Axis Bank', 'Kotak'] },
  { id: 'insurance', icon: '🛡️', label: 'Insurance', providers: ['LIC', 'HDFC Life', 'SBI Life', 'ICICI Pru'] },
  { id: 'loan', icon: '🏠', label: 'Loan / EMI', providers: ['SBI', 'HDFC', 'LIC HFL', 'Bajaj Finance'] },
];

export default function BillPaymentsPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<any>(null);
  const [provider, setProvider] = useState('');
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async () => {
    if (!account.trim()) return setError('Enter account / consumer number');
    if (!amount || parseFloat(amount) <= 0) return setError('Enter valid amount');
    if ((userProfile?.balance || 0) < parseFloat(amount)) return setError('Insufficient wallet balance');
    setLoading(true); setError('');
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    setSuccess(true);
  };

  if (success) return (
    <div style={s.page}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontWeight: 800, fontSize: 24, color: '#111', marginBottom: 8 }}>Bill Paid!</h2>
        <p style={{ color: '#666', fontSize: 16, marginBottom: 4 }}>{selected?.label} bill of ₹{amount}</p>
        <p style={{ color: '#00b9f1', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{provider}</p>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 24 }}>Account: {account}</p>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '12px 20px', marginBottom: 24 }}>
          <p style={{ color: '#16a34a', fontSize: 14, fontWeight: 600 }}>🎁 ₹{Math.floor(parseFloat(amount) * 0.02)} cashback will be credited!</p>
        </div>
        <button style={s.btn} onClick={() => navigate('/dashboard')}>Back to Home</button>
        <button style={{ ...s.btn, background: '#fff', color: '#00b9f1', border: '2px solid #00b9f1', marginTop: 10 }} onClick={() => { setSuccess(false); setSelected(null); setAccount(''); setAmount(''); }}>Pay Another Bill</button>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => selected ? setSelected(null) : navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>{selected ? selected.label : 'Pay Bills'}</h1>
      </div>

      {!selected ? (
        <div style={{ padding: '16px' }}>
          {/* Upcoming Bills Banner */}
          <div style={s.banner}>
            <p style={{ fontWeight: 700, color: '#92400e', fontSize: 14, marginBottom: 8 }}>📅 Upcoming Bills</p>
            {[['Electricity - MSEDCL', 'Due in 3 days', '₹1,200'], ['Jio Postpaid', 'Due in 7 days', '₹599']].map(([n, d, a]) => (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(146,64,14,0.1)' }}>
                <div><p style={{ color: '#92400e', fontSize: 13, fontWeight: 600 }}>{n}</p><p style={{ color: '#b45309', fontSize: 11 }}>{d}</p></div>
                <span style={{ color: '#dc2626', fontWeight: 700 }}>{a}</span>
              </div>
            ))}
          </div>

          <p style={{ fontWeight: 700, fontSize: 16, color: '#111', margin: '16px 0 12px' }}>Select Category</p>
          <div style={s.grid}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => { setSelected(cat); setProvider(cat.providers[0]); }} style={s.catBtn}>
                <span style={{ fontSize: 28 }}>{cat.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginTop: 4 }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: '16px' }}>
          <div style={s.card}>
            <p style={s.label}>SELECT PROVIDER</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {selected.providers.map((p: string) => (
                <button key={p} onClick={() => setProvider(p)} style={{ ...s.provBtn, background: provider === p ? '#dbeafe' : '#f8fafc', border: `2px solid ${provider === p ? '#00b9f1' : '#e5e7eb'}`, color: provider === p ? '#0369a1' : '#374151' }}>
                  {p}
                </button>
              ))}
            </div>

            <p style={s.label}>ACCOUNT / CONSUMER NUMBER</p>
            <input style={s.input} placeholder="Enter account number" value={account} onChange={e => setAccount(e.target.value)} />

            <p style={s.label}>BILL AMOUNT (₹)</p>
            <input style={s.input} type="number" placeholder="Enter amount" value={amount} onChange={e => setAmount(e.target.value)} />

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[500, 1000, 2000, 5000].map(a => (
                <button key={a} onClick={() => setAmount(String(a))} style={{ flex: 1, background: amount === String(a) ? '#dbeafe' : '#f8fafc', border: `1px solid ${amount === String(a) ? '#00b9f1' : '#e5e7eb'}`, borderRadius: 10, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: amount === String(a) ? '#0369a1' : '#374151' }}>
                  ₹{a}
                </button>
              ))}
            </div>

            {amount && parseFloat(amount) > 0 && (
              <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                <p style={{ color: '#16a34a', fontSize: 13 }}>🎁 You'll get ₹{Math.floor(parseFloat(amount) * 0.02)} cashback (2%)</p>
              </div>
            )}

            {error && <p style={s.error}>{error}</p>}

            <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={handlePay} disabled={loading}>
              {loading ? '⏳ Processing...' : `Pay ${selected.label} Bill →`}
            </button>
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
              💰 Balance: ₹{(userProfile?.balance || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif", paddingBottom: 40 },
  header: { display: 'flex', alignItems: 'center', gap: 14, padding: '52px 16px 16px', background: 'linear-gradient(160deg,#001a2e,#002a45)' },
  back: { background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer', color: '#fff' },
  title: { fontWeight: 800, fontSize: 20, color: '#fff' },
  banner: { background: '#fef3c7', borderRadius: 16, padding: 16, marginBottom: 8 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 },
  catBtn: { background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  card: { background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  label: { color: '#9ca3af', fontSize: 11, letterSpacing: 1, fontWeight: 700, marginBottom: 8 },
  provBtn: { borderRadius: 20, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  input: { width: '100%', border: '2px solid #e5e7eb', borderRadius: 12, padding: '13px 14px', fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 14 },
  btn: { width: '100%', padding: '16px 0', background: '#00b9f1', border: 'none', borderRadius: 16, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '10px 14px', borderRadius: 10, marginBottom: 12 },
};
