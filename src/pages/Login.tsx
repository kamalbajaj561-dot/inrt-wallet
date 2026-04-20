import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, updateDoc,
  serverTimestamp, collection, addDoc, deleteDoc,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { createUserProfile, getUserProfile } from '../lib/db';

// ── OTP helpers (stored in Firestore — no SMS API needed) ─────────
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function saveOTP(phone: string, otp: string): Promise<void> {
  const ref = doc(db, 'otps', phone);
  await setDoc(ref, {
    otp,
    phone,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    attempts: 0,
  });
}

async function verifyOTP(phone: string, enteredOTP: string): Promise<'valid' | 'invalid' | 'expired' | 'max_attempts'> {
  const ref  = doc(db, 'otps', phone);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 'invalid';

  const data = snap.data();
  if (Date.now() > data.expiresAt) { await deleteDoc(ref); return 'expired'; }
  if (data.attempts >= 5)           return 'max_attempts';

  await updateDoc(ref, { attempts: data.attempts + 1 });

  if (data.otp !== enteredOTP) return 'invalid';

  await deleteDoc(ref); // OTP used — delete it
  return 'valid';
}

// ══════════════════════════════════════════════════════════════════
export default function LoginPage() {
  const { refreshProfile } = useAuth();
  const navigate = useNavigate();

  // flow: 'phone' → 'otp' → done
  const [flow,     setFlow]    = useState<'phone' | 'otp'>('phone');
  const [mode,     setMode]    = useState<'login' | 'register'>('login');
  const [phone,    setPhone]   = useState('');
  const [name,     setName]    = useState('');
  const [otp,      setOtp]     = useState('');
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');
  const [info,     setInfo]    = useState('');
  const [generatedOTP, setGeneratedOTP] = useState(''); // kept in memory for demo display

  const email = `${phone.replace(/\s/g, '')}@inrtwallet.app`;

  // ── STEP 1: Send OTP ────────────────────────────────────────────
  const handleSendOTP = async () => {
    if (!phone || phone.replace(/\s/g,'').length !== 10)
      return setError('Enter valid 10-digit mobile number');
    if (mode === 'register' && !name.trim())
      return setError('Enter your full name');

    setLoading(true); setError(''); setInfo('');
    try {
      const cleanPhone = phone.replace(/\s/g, '');

      // Check if account exists for this phone
      const userRef   = doc(db, 'phoneIndex', cleanPhone);
      const userSnap  = await getDoc(userRef);
      const exists    = userSnap.exists();

      if (mode === 'login' && !exists) {
        setError('No account found. Please create an account first.');
        setLoading(false); return;
      }
      if (mode === 'register' && exists) {
        setError('Account already exists. Please login instead.');
        setLoading(false); return;
      }

      const newOTP = generateOTP();
      await saveOTP(cleanPhone, newOTP);
      setGeneratedOTP(newOTP); // show on screen since no SMS

      setFlow('otp');
      setInfo(`OTP generated for +91 ${cleanPhone}`);
    } catch (e: any) {
      setError(e.message || 'Failed to generate OTP');
    }
    setLoading(false);
  };

  // ── STEP 2: Verify OTP ──────────────────────────────────────────
  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6)
      return setError('Enter 6-digit OTP');

    setLoading(true); setError('');
    try {
      const cleanPhone = phone.replace(/\s/g, '');
      const result     = await verifyOTP(cleanPhone, otp);

      if (result === 'expired')      { setError('OTP expired. Please request a new one.'); setLoading(false); return; }
      if (result === 'max_attempts') { setError('Too many attempts. Please request a new OTP.'); setLoading(false); return; }
      if (result === 'invalid')      { setError('Incorrect OTP. Please try again.'); setLoading(false); return; }

      // OTP valid — sign in or register
      if (mode === 'login') {
        // Get stored password hash from Firestore
        const userRef  = doc(db, 'phoneIndex', cleanPhone);
        const userSnap = await getDoc(userRef);
        const pwd      = userSnap.data()?.pwd || `INRT_${cleanPhone}_secure`;
        await signInWithEmailAndPassword(auth, email, pwd);
      } else {
        // Register new user
        const pwd = `INRT_${cleanPhone}_${Date.now()}_secure`;
        const result = await createUserWithEmailAndPassword(auth, email, pwd);
        await updateProfile(result.user, { displayName: name.trim() });

        // Save phone index with password for future logins
        await setDoc(doc(db, 'phoneIndex', cleanPhone), { uid: result.user.uid, pwd, phone: cleanPhone });

        // Create user profile
        const existing = await getUserProfile(result.user.uid);
        if (!existing) {
          await createUserProfile(result.user.uid, {
            phone: cleanPhone, name: name.trim(), email
          });
        }
      }

      await refreshProfile();
      navigate('/dashboard');
    } catch (e: any) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
        setError('Login failed. Please try again or create a new account.');
      else
        setError(e.message || 'Verification failed');
    }
    setLoading(false);
  };

  // ── RESEND OTP ──────────────────────────────────────────────────
  const handleResend = async () => {
    setOtp(''); setError(''); setInfo('');
    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\s/g, '');
      const newOTP     = generateOTP();
      await saveOTP(cleanPhone, newOTP);
      setGeneratedOTP(newOTP);
      setInfo('New OTP generated!');
    } catch (e: any) {
      setError(e.message || 'Failed to resend OTP');
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

        {/* ── PHONE SCREEN ── */}
        {flow === 'phone' && (
          <>
            {/* Tabs */}
            <div style={s.tabs}>
              <button onClick={() => { setMode('login'); setError(''); }}
                style={{ ...s.tab, ...(mode==='login' ? s.tabActive : {}) }}>
                Login
              </button>
              <button onClick={() => { setMode('register'); setError(''); }}
                style={{ ...s.tab, ...(mode==='register' ? s.tabActive : {}) }}>
                Create Account
              </button>
            </div>

            {mode === 'register' && (
              <>
                <Label text="Full Name" />
                <input style={s.input} placeholder="Enter your full name"
                  value={name} onChange={e => { setName(e.target.value); setError(''); }} />
              </>
            )}

            <Label text="Mobile Number" />
            <div style={s.phoneRow}>
              <span style={s.flag}>🇮🇳 +91</span>
              <input style={s.phoneInput} type="tel" maxLength={10}
                placeholder="10-digit mobile number"
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g,'')); setError(''); }}
                onKeyDown={e => e.key==='Enter' && handleSendOTP()} />
            </div>

            {error && <p style={s.errorBox}>⚠️ {error}</p>}

            <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
              onClick={handleSendOTP} disabled={loading}>
              {loading ? '⏳ Please wait...' : `Send OTP →`}
            </button>

            <p style={s.terms}>
              By continuing, you agree to INRT's Terms of Service & Privacy Policy
            </p>
          </>
        )}

        {/* ── OTP SCREEN ── */}
        {flow === 'otp' && (
          <>
            {/* Back button */}
            <button style={s.backRow} onClick={() => { setFlow('phone'); setOtp(''); setError(''); }}>
              ← Change number
            </button>

            <div style={s.otpHeader}>
              <div style={{ fontSize:40, marginBottom:12 }}>📱</div>
              <p style={{ fontWeight:800, fontSize:18, color:'#001a2e', marginBottom:6 }}>
                Enter OTP
              </p>
              <p style={{ color:'#6b7280', fontSize:13, lineHeight:1.5 }}>
                OTP generated for<br />
                <strong style={{ color:'#001a2e' }}>+91 {phone}</strong>
              </p>
            </div>

            {/* OTP Display Box — shows OTP since no SMS */}
            {generatedOTP && (
              <div style={s.otpDisplayBox}>
                <p style={{ color:'#9ca3af', fontSize:11, fontWeight:700,
                             letterSpacing:1, marginBottom:6 }}>YOUR OTP IS</p>
                <p style={{ fontFamily:'monospace', fontSize:32, fontWeight:900,
                             color:'#001a2e', letterSpacing:8 }}>
                  {generatedOTP}
                </p>
                <p style={{ color:'#9ca3af', fontSize:11, marginTop:6 }}>
                  Valid for 5 minutes · Don't share with anyone
                </p>
              </div>
            )}

            <Label text="Enter 6-digit OTP" />
            {/* OTP Input boxes */}
            <input
              style={{ ...s.input, letterSpacing:8, fontSize:22, fontWeight:800,
                        textAlign:'center', fontFamily:'monospace' }}
              type="tel" maxLength={6} placeholder="_ _ _ _ _ _"
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g,'')); setError(''); }}
              onKeyDown={e => e.key==='Enter' && handleVerifyOTP()}
            />

            {error && <p style={s.errorBox}>⚠️ {error}</p>}
            {info  && <p style={s.infoBox}>ℹ️ {info}</p>}

            <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
              onClick={handleVerifyOTP} disabled={loading}>
              {loading ? '⏳ Verifying...' : `Verify OTP & ${mode === 'login' ? 'Login' : 'Create Account'} →`}
            </button>

            <div style={{ display:'flex', justifyContent:'center', gap:4,
                          marginTop:14, fontSize:13, color:'#6b7280' }}>
              <span>Didn't get it?</span>
              <button style={{ background:'none', border:'none', color:'#00b9f1',
                                fontWeight:700, cursor:'pointer', fontSize:13 }}
                onClick={handleResend} disabled={loading}>
                Resend OTP
              </button>
            </div>

            <p style={{ ...s.terms, marginTop:16 }}>
              OTP expires in 5 minutes
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <p style={{ color:'#374151', fontSize:12, fontWeight:700,
                marginBottom:6, marginTop:14, letterSpacing:0.5 }}>
      {text.toUpperCase()}
    </p>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { minHeight:'100vh', background:'linear-gradient(135deg,#001a2e 0%,#002a45 100%)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:16, fontFamily:"'DM Sans',sans-serif" },
  card:         { background:'#fff', borderRadius:24, padding:'36px 28px',
                  width:'100%', maxWidth:400, boxShadow:'0 40px 80px rgba(0,0,0,0.4)' },
  logoRow:      { display:'flex', alignItems:'center', gap:10, marginBottom:4 },
  logoIcon:     { width:44, height:44, borderRadius:14,
                  background:'linear-gradient(135deg,#00b9f1,#0090c0)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#fff', fontWeight:900, fontSize:16 },
  logoText:     { fontWeight:800, fontSize:22, color:'#001a2e' },
  tagline:      { color:'#6b7280', fontSize:14, marginBottom:24 },
  tabs:         { display:'flex', background:'#f1f5f9', borderRadius:14, padding:4, marginBottom:20 },
  tab:          { flex:1, padding:'10px 0', background:'none', border:'none',
                  borderRadius:10, fontSize:14, fontWeight:600, cursor:'pointer', color:'#6b7280' },
  tabActive:    { background:'#fff', color:'#001a2e', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' },
  phoneRow:     { display:'flex', border:'2px solid #e5e7eb', borderRadius:12, overflow:'hidden' },
  flag:         { padding:'13px 12px', background:'#f9fafb', fontSize:13,
                  borderRight:'2px solid #e5e7eb', whiteSpace:'nowrap' },
  phoneInput:   { flex:1, border:'none', outline:'none', padding:'13px 14px',
                  fontSize:15, color:'#111', fontFamily:'inherit' },
  input:        { width:'100%', border:'2px solid #e5e7eb', borderRadius:12,
                  padding:'13px 14px', fontSize:15, outline:'none', color:'#111',
                  fontFamily:'inherit', boxSizing:'border-box' },
  btn:          { width:'100%', padding:'15px 0',
                  background:'linear-gradient(135deg,#00b9f1,#0090c0)',
                  border:'none', borderRadius:14, color:'#fff',
                  fontWeight:700, fontSize:16, cursor:'pointer',
                  marginTop:16, fontFamily:'inherit' },
  errorBox:     { color:'#ef4444', fontSize:13, marginTop:10,
                  padding:'10px 12px', background:'#fef2f2',
                  borderRadius:10, border:'1px solid #fecaca' },
  infoBox:      { color:'#0369a1', fontSize:13, marginTop:10,
                  padding:'10px 12px', background:'#f0f9ff',
                  borderRadius:10, border:'1px solid #bae6fd' },
  otpHeader:    { textAlign:'center', marginBottom:16 },
  otpDisplayBox:{ background:'linear-gradient(135deg,#f0f9ff,#e0f2fe)',
                  border:'2px solid #00b9f1', borderRadius:16,
                  padding:'16px', textAlign:'center', marginBottom:16 },
  backRow:      { background:'none', border:'none', color:'#6b7280',
                  fontSize:13, cursor:'pointer', padding:'0 0 16px',
                  textAlign:'left', fontFamily:'inherit' },
  terms:        { color:'#9ca3af', fontSize:11, textAlign:'center',
                  marginTop:12, lineHeight:1.5 },
};
