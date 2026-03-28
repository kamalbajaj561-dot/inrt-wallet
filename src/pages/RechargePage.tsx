import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PLANS = {
  Airtel: [
    { id: 1, price: 149, validity: '28 days', data: '1GB/day', calls: 'Unlimited', tag: '' },
    { id: 2, price: 299, validity: '28 days', data: '2GB/day', calls: 'Unlimited', tag: 'Popular' },
    { id: 3, price: 449, validity: '56 days', data: '1.5GB/day', calls: 'Unlimited', tag: '' },
    { id: 4, price: 719, validity: '84 days', data: '1.5GB/day', calls: 'Unlimited', tag: 'Best Value' },
    { id: 5, price: 999, validity: '84 days', data: '3GB/day', calls: 'Unlimited', tag: '' },
  ],
  Jio: [
    { id: 1, price: 189, validity: '28 days', data: '1.5GB/day', calls: 'Unlimited', tag: '' },
    { id: 2, price: 299, validity: '28 days', data: '2GB/day', calls: 'Unlimited', tag: 'Popular' },
    { id: 3, price: 533, validity: '84 days', data: '1.5GB/day', calls: 'Unlimited', tag: 'Best Value' },
    { id: 4, price: 779, validity: '84 days', data: '2GB/day', calls: 'Unlimited', tag: '' },
  ],
  Vi: [
    { id: 1, price: 199, validity: '28 days', data: '1.5GB/day', calls: 'Unlimited', tag: '' },
    { id: 2, price: 299, validity: '28 days', data: '2GB/day', calls: 'Unlimited', tag: 'Popular' },
    { id: 3, price: 479, validity: '56 days', data: '1.5GB/day', calls: 'Unlimited', tag: '' },
  ],
  BSNL: [
    { id: 1, price: 107, validity: '22 days', data: '1GB/day', calls: 'Unlimited', tag: '' },
    { id: 2, price: 187, validity: '28 days', data: '2GB/day', calls: 'Unlimited', tag: 'Popular' },
    { id: 3, price: 397, validity: '80 days', data: '2GB/day', calls: 'Unlimited', tag: 'Best Value' },
  ],
};

export default function RechargePage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'mobile' | 'dth' | 'fastag'>('mobile');
  const [number, setNumber] = useState('');
  const [operator, setOperator] = useState('Airtel');
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const plans = PLANS[operator as keyof typeof PLANS] || [];

  const handleRecharge = async () => {
    if (!number || number.length !== 10) return setError('Enter valid 10-digit number');
    if (!selectedPlan) return setError('Select a recharge plan');
    if ((userProfile?.balance || 0) < selectedPlan.price) return setError('Insufficient wallet balance');
    setLoading(true); setError('');
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    setSuccess(true);
  };

  if (success) return (
    <div style={s.page}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 24 }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontWeight: 800, fontSize: 24, color: '#111', marginBottom: 8 }}>Recharge Successful!</h2>
        <p style={{ color: '#666', fontSize: 16, marginBottom: 4 }}>₹{selectedPlan.price} recharged for</p>
        <p style={{ color: '#00b9f1', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>+91 {number}</p>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>{operator} · {selectedPlan.data} · {selectedPlan.validity}</p>
        <button style={s.btn} onClick={() => navigate('/dashboard')}>Back to Home</button>
        <button style={{ ...s.btn, background: '#fff', color: '#00b9f1', border: '2px solid #00b9f1', marginTop: 10 }} onClick={() => { setSuccess(false); setSelectedPlan(null); setNumber(''); }}>Recharge Again</button>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>Recharge</h1>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {(['mobile', 'dth', 'fastag'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, background: tab === t ? '#00b9f1' : '#f1f5f9', color: tab === t ? '#fff' : '#374151' }}>
            {t === 'mobile' ? '📱 Mobile' : t === 'dth' ? '📺 DTH' : '🚗 FASTag'}
          </button>
        ))}
      </div>

      {tab === 'mobile' ? (
        <div style={{ padding: '0 16px' }}>
          {/* Number Input */}
          <div style={s.card}>
            <p style={s.label}>MOBILE NUMBER</p>
            <div style={s.phoneRow}>
              <span style={s.flag}>🇮🇳 +91</span>
              <input style={s.phoneInput} type="tel" maxLength={10} placeholder="10-digit number" value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, ''))} />
            </div>

            <p style={{ ...s.label, marginTop: 16 }}>SELECT OPERATOR</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Airtel', 'Jio', 'Vi', 'BSNL'].map(op => (
                <button key={op} onClick={() => { setOperator(op); setSelectedPlan(null); }} style={{ ...s.opBtn, background: operator === op ? '#dbeafe' : '#f8fafc', border: `2px solid ${operator === op ? '#00b9f1' : '#e5e7eb'}`, color: operator === op ? '#0369a1' : '#374151' }}>
                  {op}
                </button>
              ))}
            </div>
          </div>

          {/* Plans */}
          <p style={{ fontWeight: 700, fontSize: 16, color: '#111', margin: '16px 0 10px' }}>Popular Plans</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {plans.map(plan => (
              <button key={plan.id} onClick={() => setSelectedPlan(plan)} style={{ ...s.planCard, background: selectedPlan?.id === plan.id ? '#f0f9ff' : '#fff', border: `2px solid ${selectedPlan?.id === plan.id ? '#00b9f1' : '#e5e7eb'}` }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontWeight: 800, fontSize: 18, color: '#111' }}>₹{plan.price}</p>
                    {plan.tag && <span style={{ background: '#fef9c3', color: '#92400e', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{plan.tag}</span>}
                  </div>
                  <p style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>{plan.data} · {plan.calls} · {plan.validity}</p>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selectedPlan?.id === plan.id ? '#00b9f1' : '#d1d5db'}`, background: selectedPlan?.id === plan.id ? '#00b9f1' : '#fff', flexShrink: 0 }} />
              </button>
            ))}
          </div>

          {error && <p style={s.error}>{error}</p>}

          <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={handleRecharge} disabled={loading}>
            {loading ? '⏳ Processing...' : selectedPlan ? `Recharge ₹${selectedPlan.price} →` : 'Select a Plan'}
          </button>
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
            💰 Wallet Balance: ₹{(userProfile?.balance || 0).toLocaleString('en-IN')}
          </p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <span style={{ fontSize: 64 }}>{tab === 'dth' ? '📺' : '🚗'}</span>
          <p style={{ fontWeight: 700, fontSize: 18, color: '#111', marginTop: 16 }}>Coming Soon!</p>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 8 }}>{tab === 'dth' ? 'DTH' : 'FASTag'} recharge launching soon</p>
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
  tabs: { display: 'flex', padding: '12px 16px', gap: 8, background: '#fff', marginBottom: 8 },
  tab: { flex: 1, border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  card: { background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 8 },
  label: { color: '#9ca3af', fontSize: 11, letterSpacing: 1, fontWeight: 700, marginBottom: 8 },
  phoneRow: { display: 'flex', border: '2px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' },
  flag: { padding: '13px 12px', background: '#f9fafb', fontSize: 13, borderRight: '2px solid #e5e7eb' },
  phoneInput: { flex: 1, border: 'none', outline: 'none', padding: '13px 14px', fontSize: 16, fontFamily: 'inherit' },
  opBtn: { borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  planCard: { borderRadius: 16, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' },
  btn: { width: '100%', padding: '16px 0', background: '#00b9f1', border: 'none', borderRadius: 16, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', padding: '10px 14px', borderRadius: 10, marginBottom: 12 },
};
