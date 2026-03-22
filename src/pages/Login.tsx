import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!phone || phone.length !== 10) return setError('Enter valid 10-digit number');
    if (!password || password.length < 6) return setError('Password must be at least 6 characters');
    setLoading(true); setError('');
    try {
      await signIn(phone, password);
      navigate('/dashboard');
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') setError('No account found. Please register first.');
      else if (e.code === 'auth/wrong-password') setError('Wrong password. Please try again.');
      else if (e.code === 'auth/invalid-credential') setError('Wrong phone or password.');
      else setError(e.message || 'Login failed');
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!name.trim()) return setError('Enter your name');
    if (!phone || phone.length !== 10) return setError('Enter valid 10-digit number');
    if (!password || password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirmPassword) return setError('Passwords do not match');
    setLoading(true); setError('');
    try {
      await signUp(phone, name, password);
      navigate('/dashboard');
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') setError('Account already exists. Please login.');
      else setError(e.message || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logoRow}>
          <div style={s.logoIcon}>IN</div>
          <span style={s.logoText}>INRT Wallet</span>
        </div>
        <p style={s.tagline}>India's Smartest Payment App</p>

        {/* Tabs */}
        <div style={s.tabs}>
          <button onClick={() => { setTab('login'); setError(''); }} style={{ ...s.tab, ...(tab === 'login' ? s.tabActive : {}) }}>Login</button>
          <button onClick={() => { setTab('register'); setError(''); }} style={{ ...s.tab, ...(tab === 'register' ? s.tabActive : {}) }}>Create Account</button>
        </div>

        {tab === 'login' ? (
          <>
            <Label text="Mobile Number" />
            <div style={s.phoneRow}>
              <span style={s.flag}>🇮🇳 +91</span>
              <input style={s.phoneInput} type="tel" maxLength={10} placeholder="10-digit mobile" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
            </div>
            <Label text="Password" />
            <input style={s.input} type="password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            {error && <p style={s.error}>{error}</p>}
            <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={handleLogin} disabled={loading}>
              {loading ? '⏳ Logging in...' : 'Login →'}
            </button>
            <button style={s.switchBtn} onClick={() => { setTab('register'); setError(''); }}>
              Don't have an account? <span style={{ color: '#00b9f1' }}>Create one</span>
            </button>
          </>
        ) : (
          <>
            <Label text="Full Name" />
            <input style={s.input} placeholder="Enter your full name" value={name} onChange={e => setName(e.target.value)} />
            <Label text="Mobile Number" />
            <div style={s.phoneRow}>
              <span style={s.flag}>🇮🇳 +91</span>
              <input style={s.phoneInput} type="tel" maxLength={10} placeholder="10-digit mobile" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
            </div>
            <Label text="Create Password" />
            <input style={s.input} type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
            <Label text="Confirm Password" />
            <input style={s.input} type="password" placeholder="Re-enter password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} />
            {error && <p style={s.error}>{error}</p>}
            <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={handleRegister} disabled={loading}>
              {loading ? '⏳ Creating account...' : 'Create Account →'}
            </button>
            <button style={s.switchBtn} onClick={() => { setTab('login'); setError(''); }}>
              Already have an account? <span style={{ color: '#00b9f1' }}>Login</span>
            </button>
          </>
        )}

        <p style={s.terms}>By continuing, you agree to INRT's Terms of Service & Privacy Policy</p>
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <p style={{ color: '#374151', fontSize: 12, fontWeight: 700, marginBottom: 6, marginTop: 14, letterSpacing: 0.5 }}>{text.toUpperCase()}</p>;
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #001a2e 0%, #002a45 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: "'DM Sans', sans-serif" },
  card: { background: '#fff', borderRadius: 24, padding: '36px 28px', width: '100%', maxWidth: 400, boxShadow: '0 40px 80px rgba(0,0,0,0.4)' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  logoIcon: { width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #00b9f1, #0090c0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 16 },
  logoText: { fontWeight: 800, fontSize: 22, color: '#001a2e' },
  tagline: { color: '#6b7280', fontSize: 14, marginBottom: 24 },
  tabs: { display: 'flex', background: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 20 },
  tab: { flex: 1, padding: '10px 0', background: 'none', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#6b7280' },
  tabActive: { background: '#fff', color: '#001a2e', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  phoneRow: { display: 'flex', border: '2px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 0 },
  flag: { padding: '13px 12px', background: '#f9fafb', fontSize: 13, borderRight: '2px solid #e5e7eb', whiteSpace: 'nowrap' },
  phoneInput: { flex: 1, border: 'none', outline: 'none', padding: '13px 14px', fontSize: 15, color: '#111', fontFamily: 'inherit' },
  input: { width: '100%', border: '2px solid #e5e7eb', borderRadius: 12, padding: '13px 14px', fontSize: 15, outline: 'none', color: '#111', fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '15px 0', background: 'linear-gradient(135deg, #00b9f1, #0090c0)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', marginTop: 20, fontFamily: 'inherit' },
  error: { color: '#ef4444', fontSize: 13, marginTop: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 8 },
  switchBtn: { width: '100%', background: 'none', border: 'none', padding: '12px 0 0', fontSize: 13, color: '#6b7280', cursor: 'pointer', textAlign: 'center' },
  terms: { color: '#9ca3af', fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 1.5 },
};
