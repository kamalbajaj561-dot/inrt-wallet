import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';

type Screen = 'login' | 'register' | 'reset_phone' | 'reset_otp' | 'reset_pass';
const toEmail = (p: string) => `${p.replace(/\D/g, '')}@inrtwallet.app`;
const genOTP  = () => Math.floor(100000 + Math.random() * 900000).toString();

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [screen,  setScreen]  = useState<Screen>('login');
  const [phone,   setPhone]   = useState('');
  const [name,    setName]    = useState('');
  const [pass,    setPass]    = useState('');
  const [pass2,   setPass2]   = useState('');
  const [otp,     setOtp]     = useState('');
  const [newPass, setNewPass] = useState('');
  const [np2,     setNp2]     = useState('');
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const [info,    setInfo]    = useState('');

  const go = (s: Screen) => { setScreen(s); setErr(''); setInfo(''); };

  // ── login ──
  const doLogin = async () => {
    const p = phone.replace(/\D/g,'');
    if (p.length !== 10) return setErr('Enter valid 10-digit number');
    if (pass.length < 6) return setErr('Password min 6 characters');
    setLoading(true); setErr('');
    try {
      await signIn(p, pass);
      navigate('/dashboard');
    } catch (e: any) {
      const c = e.code || '';
      if (c.includes('user-not-found') || c.includes('invalid-credential'))
        setErr('No account found. Please create one.');
      else if (c.includes('wrong-password'))
        setErr('Wrong password. Use Forgot Password to reset.');
      else setErr(e.message || 'Login failed');
    }
    setLoading(false);
  };

  // ── register ──
  const doRegister = async () => {
    const p = phone.replace(/\D/g,'');
    if (!name.trim())    return setErr('Enter your full name');
    if (p.length !== 10) return setErr('Enter valid 10-digit number');
    if (pass.length < 6) return setErr('Password min 6 characters');
    if (pass !== pass2)  return setErr('Passwords do not match');
    setLoading(true); setErr('');
    try {
      await signUp(p, name.trim(), pass);
      navigate('/dashboard');
    } catch (e: any) {
      if ((e.code||'').includes('email-already-in-use'))
        setErr('Account exists. Please login.');
      else setErr(e.message || 'Registration failed');
    }
    setLoading(false);
  };

  // ── send OTP (stored in Firestore) ──
  const doSendOTP = async () => {
    const p = phone.replace(/\D/g,'');
    if (p.length !== 10) return setErr('Enter valid 10-digit number');
    setLoading(true); setErr(''); setInfo('');
    try {
      const code = genOTP();
      await setDoc(doc(db, 'passwordResets', p), {
        otp: code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0,
      });

      // Try to send via backend; fallback shows OTP on screen
      const apiUrl = import.meta.env.VITE_API_URL || '';
      try {
        const r = await fetch(`${apiUrl}/send-otp`, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ phone: p, otp: code }),
        });
        if (r.ok) setInfo(`OTP sent to ${p}@inrtwallet.app`);
        else      setInfo(`Your OTP: ${code}  (valid 5 min)`);
      } catch {
        setInfo(`Your OTP: ${code}  (valid 5 min)`);
      }
      go('reset_otp');
    } catch (e: any) { setErr(e.message || 'Failed to send OTP'); }
    setLoading(false);
  };

  // ── verify OTP ──
  const doVerifyOTP = async () => {
    if (otp.length !== 6) return setErr('Enter 6-digit OTP');
    const p = phone.replace(/\D/g,'');
    setLoading(true); setErr('');
    const snap = await getDoc(doc(db, 'passwordResets', p));
    if (!snap.exists()) { setErr('OTP not found. Request again.'); setLoading(false); return; }
    const d = snap.data();
    if (Date.now() > d.expiresAt) { setErr('OTP expired. Request again.'); setLoading(false); return; }
    if (d.attempts >= 5)          { setErr('Too many attempts.'); setLoading(false); return; }
    await setDoc(doc(db,'passwordResets',p),{...d,attempts:d.attempts+1},{merge:true});
    if (d.otp !== otp)            { setErr('Wrong OTP. Try again.'); setLoading(false); return; }
    await deleteDoc(doc(db,'passwordResets',p));
    go('reset_pass');
    setLoading(false);
  };

  // ── set new password via backend ──
  const doSetPass = async () => {
    if (newPass.length < 6)  return setErr('Min 6 characters');
    if (newPass !== np2)     return setErr('Passwords do not match');
    setLoading(true); setErr('');
    const p = phone.replace(/\D/g,'');
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const r = await fetch(`${apiUrl}/reset-password`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ phone: p, newPassword: newPass }),
      });
      if (r.ok) {
        setInfo('Password updated! Please login.');
        go('login'); setPhone(p);
      } else {
        setErr('Password reset failed. Please contact support.');
      }
    } catch (e: any) { setErr(e.message || 'Failed'); }
    setLoading(false);
  };

  return (
    <div style={S.page}>
      {/* Decorative blobs */}
      <div style={S.blob1} />
      <div style={S.blob2} />

      <div style={S.wrap}>
        {/* Logo */}
        <div style={S.logoRow}>
          <div style={S.logoMark}>
            <span style={{ color:'#000',fontWeight:900,fontFamily:'Space Grotesk,sans-serif',fontSize:18 }}>IN</span>
          </div>
          <div>
            <p style={{ fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:22,color:'#e8edf8' }}>INRT Wallet</p>
            <p style={{ color:'#3d4f6e',fontSize:12,marginTop:1 }}>India's Smartest Payment App</p>
          </div>
        </div>

        <div style={S.card}>

          {/* ── LOGIN ── */}
          {screen === 'login' && <>
            <Tabs active="login" onChange={t => { go(t as Screen); setPhone(''); }} />
            <Lbl>MOBILE NUMBER</Lbl>
            <PhoneRow value={phone} onChange={v => { setPhone(v); setErr(''); }} />
            <Lbl style={{ marginTop:14 }}>PASSWORD</Lbl>
            <input className="inp" type="password" placeholder="Enter password"
              value={pass} onChange={e => { setPass(e.target.value); setErr(''); }}
              onKeyDown={e => e.key==='Enter' && doLogin()} />
            {err  && <p className="err-box">{err}</p>}
            {info && <p className="ok-box">{info}</p>}
            <button className="btn-primary" style={{ marginTop:20 }}
              onClick={doLogin} disabled={loading}>
              {loading ? '⏳ Logging in…' : 'Login →'}
            </button>
            <button className="btn-ghost" style={{ display:'block',margin:'14px auto 0' }}
              onClick={() => go('reset_phone')}>
              Forgot password?
            </button>
          </>}

          {/* ── REGISTER ── */}
          {screen === 'register' && <>
            <Tabs active="register" onChange={t => { go(t as Screen); setPhone(''); }} />
            <Lbl>FULL NAME</Lbl>
            <input className="inp" placeholder="Your full name"
              value={name} onChange={e => { setName(e.target.value); setErr(''); }} />
            <Lbl style={{ marginTop:14 }}>MOBILE NUMBER</Lbl>
            <PhoneRow value={phone} onChange={v => { setPhone(v); setErr(''); }} />
            <Lbl style={{ marginTop:14 }}>CREATE PASSWORD</Lbl>
            <input className="inp" type="password" placeholder="Min 6 characters"
              value={pass} onChange={e => { setPass(e.target.value); setErr(''); }} />
            <Lbl style={{ marginTop:14 }}>CONFIRM PASSWORD</Lbl>
            <input className="inp" type="password" placeholder="Re-enter password"
              value={pass2} onChange={e => { setPass2(e.target.value); setErr(''); }}
              onKeyDown={e => e.key==='Enter' && doRegister()} />
            {err && <p className="err-box">{err}</p>}
            <button className="btn-primary" style={{ marginTop:20 }}
              onClick={doRegister} disabled={loading}>
              {loading ? '⏳ Creating…' : 'Create Account →'}
            </button>
          </>}

          {/* ── FORGOT: phone ── */}
          {screen === 'reset_phone' && <>
            <BackBtn onClick={() => go('login')} />
            <p style={S.heading}>Reset Password</p>
            <p style={S.hint}>Enter your registered number to receive an OTP.</p>
            <Lbl>MOBILE NUMBER</Lbl>
            <PhoneRow value={phone} onChange={v => { setPhone(v); setErr(''); }} />
            {err  && <p className="err-box">{err}</p>}
            {info && <p className="ok-box">{info}</p>}
            <button className="btn-primary" style={{ marginTop:20 }}
              onClick={doSendOTP} disabled={loading}>
              {loading ? '⏳ Sending…' : 'Send OTP →'}
            </button>
          </>}

          {/* ── FORGOT: OTP ── */}
          {screen === 'reset_otp' && <>
            <BackBtn onClick={() => go('reset_phone')} />
            <p style={S.heading}>Enter OTP</p>
            {info && <p className="ok-box" style={{ marginBottom:16 }}>{info}</p>}
            <Lbl>6-DIGIT OTP</Lbl>
            <input className="inp" type="tel" maxLength={6}
              placeholder="______"
              style={{ letterSpacing:10, fontSize:22, fontWeight:800, textAlign:'center', fontFamily:'Space Grotesk,sans-serif' }}
              value={otp} onChange={e => { setOtp(e.target.value.replace(/\D/g,'')); setErr(''); }}
              onKeyDown={e => e.key==='Enter' && doVerifyOTP()} />
            {err && <p className="err-box">{err}</p>}
            <button className="btn-primary" style={{ marginTop:20 }}
              onClick={doVerifyOTP} disabled={loading}>
              {loading ? '⏳ Verifying…' : 'Verify OTP →'}
            </button>
            <button className="btn-ghost" style={{ display:'block',margin:'12px auto 0' }}
              onClick={doSendOTP} disabled={loading}>Resend OTP</button>
          </>}

          {/* ── FORGOT: new password ── */}
          {screen === 'reset_pass' && <>
            <BackBtn onClick={() => go('login')} />
            <p style={S.heading}>Set New Password</p>
            <Lbl>NEW PASSWORD</Lbl>
            <input className="inp" type="password" placeholder="Min 6 characters"
              value={newPass} onChange={e => { setNewPass(e.target.value); setErr(''); }} />
            <Lbl style={{ marginTop:14 }}>CONFIRM PASSWORD</Lbl>
            <input className="inp" type="password" placeholder="Re-enter"
              value={np2} onChange={e => { setNp2(e.target.value); setErr(''); }}
              onKeyDown={e => e.key==='Enter' && doSetPass()} />
            {err  && <p className="err-box">{err}</p>}
            {info && <p className="ok-box">{info}</p>}
            <button className="btn-primary" style={{ marginTop:20 }}
              onClick={doSetPass} disabled={loading}>
              {loading ? '⏳ Saving…' : 'Save Password →'}
            </button>
          </>}

          <p style={S.terms}>By continuing you agree to INRT's Terms & Privacy Policy</p>
        </div>
      </div>
    </div>
  );
}

function Tabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display:'flex',background:'#0d1528',borderRadius:14,padding:4,marginBottom:20 }}>
      {(['login','register'] as const).map(t => (
        <button key={t} onClick={() => onChange(t)}
          style={{ flex:1,padding:'10px 0',background:active===t?'#111e35':'none',
                   border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer',
                   color:active===t?'#e8edf8':'#3d4f6e',
                   boxShadow:active===t?'0 2px 8px rgba(0,0,0,0.3)':'none',
                   transition:'all 0.2s',fontFamily:'Plus Jakarta Sans,sans-serif' }}>
          {t==='login'?'Login':'Create Account'}
        </button>
      ))}
    </div>
  );
}
function Lbl({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p className="lbl" style={style}>{children}</p>;
}
function PhoneRow({ value, onChange }: { value:string; onChange:(v:string)=>void }) {
  return (
    <div style={{ display:'flex',border:'1px solid var(--b1)',borderRadius:'var(--r2)',overflow:'hidden' }}>
      <span style={{ padding:'14px 12px',background:'var(--bg-elevated)',color:'var(--t2)',
                      fontSize:13,borderRight:'1px solid var(--b1)',whiteSpace:'nowrap' }}>
        🇮🇳 +91
      </span>
      <input style={{ flex:1,background:'none',border:'none',outline:'none',
                       padding:'14px',fontSize:15,color:'var(--t1)',fontFamily:'inherit' }}
        type="tel" maxLength={10} placeholder="10-digit number"
        value={value} onChange={e => onChange(e.target.value.replace(/\D/g,''))} />
    </div>
  );
}
function BackBtn({ onClick }: { onClick: ()=>void }) {
  return (
    <button onClick={onClick}
      style={{ background:'none',border:'none',color:'var(--t2)',fontSize:13,
                cursor:'pointer',padding:'0 0 14px',fontFamily:'inherit' }}>
      ← Back
    </button>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:    { minHeight:'100vh',background:'#050914',display:'flex',alignItems:'center',
              justifyContent:'center',padding:16,fontFamily:'Plus Jakarta Sans,sans-serif',
              position:'relative',overflow:'hidden' },
  blob1:   { position:'absolute',top:-80,right:-60,width:300,height:300,borderRadius:'50%',
              background:'radial-gradient(circle,rgba(0,229,204,0.08),transparent 70%)',pointerEvents:'none' },
  blob2:   { position:'absolute',bottom:-80,left:-80,width:280,height:280,borderRadius:'50%',
              background:'radial-gradient(circle,rgba(77,138,240,0.06),transparent 70%)',pointerEvents:'none' },
  wrap:    { width:'100%',maxWidth:420,position:'relative' },
  logoRow: { display:'flex',alignItems:'center',gap:14,marginBottom:28,padding:'0 4px' },
  logoMark:{ width:52,height:52,borderRadius:16,
              background:'linear-gradient(135deg,#00e5cc,#00b4a0)',
              display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 },
  card:    { background:'#0d1528',border:'1px solid rgba(255,255,255,0.07)',
              borderRadius:24,padding:'28px 24px',boxShadow:'0 24px 80px rgba(0,0,0,0.7)' },
  heading: { fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:20,
              color:'#e8edf8',marginBottom:8 },
  hint:    { color:'#7d8fb3',fontSize:13,lineHeight:1.6,marginBottom:16 },
  terms:   { color:'#3d4f6e',fontSize:11,textAlign:'center',marginTop:20,lineHeight:1.5 },
};
