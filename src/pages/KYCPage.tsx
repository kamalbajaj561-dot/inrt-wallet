import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { submitKYC } from '../lib/db';
import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';

export default function KYCPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    aadhaar: '',
    pan: '',
    dob: '',
    address: '',
    selfieFile: null as File | null,
    selfiePreview: '',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSelfie = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    set('selfieFile', file);
    set('selfiePreview', URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!form.aadhaar || form.aadhaar.length !== 12) return setError('Enter valid 12-digit Aadhaar');
    if (!form.pan || form.pan.length !== 10) return setError('Enter valid 10-character PAN');
    if (!form.dob) return setError('Enter date of birth');
    if (!form.address.trim()) return setError('Enter address');

    setLoading(true); setError('');
    try {
      let selfieUrl = '';
      if (form.selfieFile) {
        const storageRef = ref(storage, `kyc/${user!.uid}/selfie`);
        await uploadBytes(storageRef, form.selfieFile);
        selfieUrl = await getDownloadURL(storageRef);
      }

      await submitKYC(user!.uid, {
        aadhaar: form.aadhaar,
        pan: form.pan.toUpperCase(),
        dob: form.dob,
        address: form.address,
        selfieUrl,
      });

      await refreshProfile();
      setSuccess(true);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  if (userProfile?.kycStatus === 'verified') {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <div style={{ fontSize: 64, textAlign: 'center', marginBottom: 16 }}>✅</div>
          <h2 style={s.h2}>KYC Verified!</h2>
          <p style={s.sub}>Your account is fully verified. You can now use all features.</p>
          <button style={s.btn} onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <div style={{ fontSize: 64, textAlign: 'center', marginBottom: 16 }}>🎉</div>
          <h2 style={s.h2}>KYC Submitted!</h2>
          <p style={s.sub}>We'll verify your details within 24 hours. You'll get a notification once approved.</p>
          <button style={s.btn} onClick={() => navigate('/dashboard')}>Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>KYC Verification</h1>
      </div>

      {/* Progress */}
      <div style={s.progress}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ ...s.dot, background: step >= i ? '#00b9f1' : '#e5e7eb', color: step >= i ? '#fff' : '#999' }}>{i}</div>
            {i < 3 && <div style={{ flex: 1, height: 2, background: step > i ? '#00b9f1' : '#e5e7eb' }} />}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        {['Identity', 'Address', 'Selfie'].map((l, i) => (
          <span key={l} style={{ fontSize: 11, color: step > i ? '#00b9f1' : '#999', fontWeight: 600 }}>{l}</span>
        ))}
      </div>

      <div style={s.card}>
        {step === 1 && (
          <>
            <h3 style={s.h3}>Identity Details</h3>
            <Label text="Aadhaar Number (12 digits)" />
            <input style={s.input} maxLength={12} placeholder="XXXX XXXX XXXX"
              value={form.aadhaar} onChange={e => set('aadhaar', e.target.value.replace(/\D/g, ''))} />
            <Label text="PAN Card Number" />
            <input style={s.input} maxLength={10} placeholder="ABCDE1234F"
              value={form.pan} onChange={e => set('pan', e.target.value.toUpperCase())} />
            <Label text="Date of Birth" />
            <input style={s.input} type="date" value={form.dob} onChange={e => set('dob', e.target.value)} />
          </>
        )}

        {step === 2 && (
          <>
            <h3 style={s.h3}>Address Details</h3>
            <Label text="Full Address" />
            <textarea style={{ ...s.input, height: 100, resize: 'none' }}
              placeholder="House No, Street, City, State, PIN"
              value={form.address} onChange={e => set('address', e.target.value)} />
            <div style={{ background: '#fef3c7', borderRadius: 12, padding: 14, marginTop: 8 }}>
              <p style={{ color: '#92400e', fontSize: 13 }}>📋 Make sure address matches your Aadhaar card exactly.</p>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h3 style={s.h3}>Take a Selfie</h3>
            <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>Upload a clear photo of your face. Make sure it's well-lit.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handleSelfie} style={{ display: 'none' }} />
            {form.selfiePreview ? (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <img src={form.selfiePreview} alt="selfie" style={{ width: 160, height: 160, borderRadius: '50%', objectFit: 'cover', border: '4px solid #00b9f1' }} />
                <br />
                <button onClick={() => fileRef.current?.click()} style={s.outline}>Retake Photo</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} style={s.selfieBtn}>
                <span style={{ fontSize: 36 }}>📷</span>
                <span>Tap to take selfie</span>
              </button>
            )}
          </>
        )}

        {error && <p style={s.error}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {step > 1 && <button style={s.outline} onClick={() => setStep(s => s - 1)}>← Back</button>}
          {step < 3 ? (
            <button style={s.btn} onClick={() => { setError(''); setStep(s => s + 1); }}>
              Continue →
            </button>
          ) : (
            <button style={s.btn} onClick={handleSubmit} disabled={loading}>
              {loading ? 'Submitting...' : 'Submit KYC ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <p style={{ color: '#374151', fontSize: 12, fontWeight: 600, marginBottom: 6, marginTop: 14, letterSpacing: 0.5 }}>{text.toUpperCase()}</p>;
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '20px 16px 80px', maxWidth: 480, margin: '0 auto', fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', background: '#f8fafc' },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 },
  back: { background: '#fff', border: '2px solid #e5e7eb', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer' },
  title: { fontWeight: 800, fontSize: 20, color: '#111' },
  progress: { display: 'flex', alignItems: 'center', marginBottom: 8 },
  dot: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 },
  card: { background: '#fff', borderRadius: 20, padding: '24px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' },
  h2: { textAlign: 'center', fontSize: 22, fontWeight: 800, color: '#111', marginBottom: 8 },
  h3: { fontWeight: 800, fontSize: 18, color: '#111', marginBottom: 4 },
  sub: { textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 24 },
  input: { width: '100%', border: '2px solid #e5e7eb', borderRadius: 12, padding: '13px 14px', fontSize: 15, outline: 'none', color: '#111', fontFamily: 'inherit', boxSizing: 'border-box' },
  btn: { flex: 1, padding: '14px 0', background: '#00b9f1', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' },
  outline: { flex: 1, padding: '14px 0', background: '#fff', border: '2px solid #e5e7eb', borderRadius: 14, color: '#374151', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' },
  error: { color: '#ef4444', fontSize: 13, marginTop: 8 },
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#f8fafc' },
  selfieBtn: { width: '100%', background: '#f0f9ff', border: '2px dashed #00b9f1', borderRadius: 16, padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer', color: '#00b9f1', fontWeight: 600, fontSize: 14 },
};
