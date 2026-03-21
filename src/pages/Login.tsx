import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { sendOTP, verifyOTP } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOTP = async () => {
    if (phone.length !== 10) return setError('Enter valid 10-digit number');
    setLoading(true); setError('');
    try {
      await sendOTP(phone);
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Failed to send OTP');
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    if (otp.length !== 6) return setError('Enter 6-digit OTP');
    if (!name.trim()) return setError('Enter your name');
    setLoading(true); setError('');
    try {
      await verifyOTP(otp, name);
      navigate('/dashboard');
    } catch (e: any) {
      setError(e.message || 'Invalid OTP');
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <div style={styles.logoIcon}>IN</div>
          <span style={styles.logoText}>INRT Wallet</span>
        </div>
        <p style={styles.tagline}>India's Smartest Payment App</p>

        {step === 'phone' ? (
          <>
            <p style={styles.label}>Mobile Number</p>
            <div style={styles.phoneRow}>
              <span style={styles.flag}>🇮🇳 +91</span>
              <input
                style={styles.input}
                type="tel"
                maxLength={10}
                placeholder="10-digit mobile number"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.btn} onClick={handleSendOTP} disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP →'}
            </button>
            <p style={styles.terms}>
              By continuing, you agree to INRT's Terms of Service & Privacy Policy
            </p>
          </>
        ) : (
          <>
            <p style={styles.label}>Your Name</p>
            <input
              style={{ ...styles.input, marginBottom: 16 }}
              placeholder="Enter your full name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <p style={styles.label}>OTP sent to +91{phone}</p>
            <input
              style={{ ...styles.input, fontSize: 24, letterSpacing: 12, textAlign: 'center' }}
              type="tel"
              maxLength={6}
              placeholder="• • • • • •"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.btn} onClick={handleVerify} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Login ✓'}
            </button>
            <button style={styles.link} onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>
              ← Change Number
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #001a2e 0%, #002a45 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    fontFamily: "'DM Sans', sans-serif",
  },
  card: {
    background: '#fff',
    borderRadius: 24,
    padding: '40px 32px',
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 40px 80px rgba(0,0,0,0.3)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #00b9f1, #0090c0)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 900,
    fontSize: 16,
  },
  logoText: {
    fontWeight: 800,
    fontSize: 22,
    color: '#001a2e',
  },
  tagline: {
    color: '#666',
    fontSize: 14,
    marginBottom: 32,
  },
  label: {
    color: '#333',
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  phoneRow: {
    display: 'flex',
    alignItems: 'center',
    border: '2px solid #e5e7eb',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  flag: {
    padding: '14px 12px',
    background: '#f9fafb',
    fontSize: 14,
    borderRight: '2px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  input: {
    flex: 1,
    border: '2px solid #e5e7eb',
    borderRadius: 14,
    padding: '14px 16px',
    fontSize: 16,
    outline: 'none',
    width: '100%',
    color: '#111',
    fontFamily: 'inherit',
  },
  btn: {
    width: '100%',
    padding: '16px 0',
    background: 'linear-gradient(135deg, #00b9f1, #0090c0)',
    border: 'none',
    borderRadius: 14,
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    marginTop: 8,
    fontFamily: 'inherit',
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 8,
  },
  terms: {
    color: '#9ca3af',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 1.5,
  },
  link: {
    background: 'none',
    border: 'none',
    color: '#00b9f1',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    padding: '8px 0',
    display: 'block',
    width: '100%',
    textAlign: 'center',
    marginTop: 8,
  },
};
