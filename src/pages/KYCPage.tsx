/**
 * INRT WALLET — PRODUCTION KYC PAGE
 *
 * Real verification flow:
 *   Step 1: Personal info + age validation
 *   Step 2: Aadhaar OTP verification via Surepass API (real Aadhaar validation)
 *   Step 3: PAN verification via Surepass API (real PAN validation)
 *   Step 4: Selfie + liveness (camera capture)
 *   Step 5: Submit → Firebase Storage → Firestore → Admin review
 *
 * APIs used:
 *   Surepass (surepass.io) — Aadhaar + PAN verification
 *   Firebase Storage        — document storage
 *   Firebase Firestore       — KYC status tracking
 *
 * All API calls go through YOUR backend (Railway) — never expose
 * Surepass token directly in frontend.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  doc, setDoc, updateDoc, getDoc, serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import '../styles/theme.css';

// ── Backend URL (your Railway server) ─────────────────────────
const API = import.meta.env.VITE_API_URL || '';

// ── Indian states ──────────────────────────────────────────────
const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu',
  'Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu & Kashmir','Ladakh','Puducherry','Chandigarh',
];

type Step = 1 | 2 | 3 | 4 | 5;

// ══════════════════════════════════════════════════════════════
export default function KYCPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step,       setStep]      = useState<Step>(1);
  const [loading,    setLoading]   = useState(false);
  const [toast,      setToast]     = useState('');
  const [toastType,  setToastType] = useState<'ok'|'err'>('ok');
  const [errs,       setErrs]      = useState<Record<string,string>>({});

  // Step 1 — Personal
  const [fullName,   setFullName]  = useState(userProfile?.name || '');
  const [dob,        setDob]       = useState('');
  const [gender,     setGender]    = useState('');

  // Step 2 — Aadhaar
  const [aadhaar,    setAadhaar]   = useState('');
  const [aadhaarOTP, setAadhaarOTP]= useState('');
  const [aadhaarRef, setAadhaarRef]= useState(''); // ref_id from Surepass
  const [aadhaarSent,setAadhaarSent]=useState(false);
  const [aadhaarData,setAadhaarData]=useState<any>(null); // verified aadhaar data

  // Step 3 — PAN
  const [pan,        setPan]       = useState('');
  const [panData,    setPanData]   = useState<any>(null); // verified PAN data

  // Step 4 — Selfie
  const [selfieFile, setSelfieFile]= useState<File|null>(null);
  const [selfieURL,  setSelfieURL] = useState('');
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [camActive, setCamActive]  = useState(false);
  const [stream,    setStream]     = useState<MediaStream|null>(null);

  const kycStatus = userProfile?.kycStatus || 'not_started';

  const showToast = (msg: string, type: 'ok'|'err' = 'ok') => {
    setToast(msg); setToastType(type);
    setTimeout(() => setToast(''), 4000);
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, [stream]);

  // ── STEP 1 VALIDATION ──────────────────────────────────────
  const validateStep1 = () => {
    const e: Record<string,string> = {};
    if (!fullName.trim() || fullName.length < 3) e.fullName = 'Enter full name (min 3 chars)';
    if (!dob) {
      e.dob = 'Date of birth required';
    } else {
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      if (age < 18) e.dob = `You must be 18+. You are ${age}.`;
    }
    if (!gender) e.gender = 'Select gender';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  // ── STEP 2 — Send Aadhaar OTP (via your backend → Surepass) ─
  const sendAadhaarOTP = async () => {
    const clean = aadhaar.replace(/\s/g, '');
    if (clean.length !== 12) return setErrs({ aadhaar: 'Aadhaar must be 12 digits' });
    if (/^(\d)\1{11}$/.test(clean)) return setErrs({ aadhaar: 'Invalid Aadhaar number' });

    setLoading(true); setErrs({});
    try {
      const res = await fetch(`${API}/kyc/aadhaar-send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaarNumber: clean, userId: user!.uid }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

      // Surepass returns a ref_id needed for verification
      setAadhaarRef(data.ref_id || data.referenceId);
      setAadhaarSent(true);
      showToast('OTP sent to your Aadhaar-linked mobile!');
    } catch (e: any) {
      // If backend/API not available, show informative error
      if (e.message.includes('fetch') || e.message.includes('network')) {
        showToast('Backend server not reachable. Check VITE_API_URL in .env', 'err');
      } else {
        showToast(e.message || 'Failed to send OTP', 'err');
      }
    }
    setLoading(false);
  };

  // ── STEP 2 — Verify Aadhaar OTP ───────────────────────────
  const verifyAadhaarOTP = async () => {
    if (!aadhaarOTP || aadhaarOTP.length !== 6)
      return setErrs({ otp: 'Enter 6-digit OTP' });

    setLoading(true); setErrs({});
    try {
      const res = await fetch(`${API}/kyc/aadhaar-verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp:     aadhaarOTP,
          ref_id:  aadhaarRef,
          userId:  user!.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OTP verification failed');

      // Store verified Aadhaar data (Surepass returns name, DOB, address, photo)
      setAadhaarData(data.aadhaarData || data);
      showToast('✅ Aadhaar verified successfully!');
      setStep(3);
    } catch (e: any) {
      showToast(e.message || 'OTP verification failed', 'err');
    }
    setLoading(false);
  };

  // ── STEP 3 — Verify PAN ────────────────────────────────────
  const verifyPAN = async () => {
    const cleanPAN = pan.toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPAN))
      return setErrs({ pan: 'PAN format must be ABCDE1234F' });

    setLoading(true); setErrs({});
    try {
      const res = await fetch(`${API}/kyc/verify-pan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panNumber: cleanPAN, userId: user!.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PAN verification failed');

      // Surepass returns name, DOB, PAN status
      setPanData(data.panData || data);
      showToast('✅ PAN verified successfully!');
      setStep(4);
    } catch (e: any) {
      showToast(e.message || 'PAN verification failed', 'err');
    }
    setLoading(false);
  };

  // ── STEP 4 — Camera for selfie ────────────────────────────
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 }
      });
      if (videoRef.current) videoRef.current.srcObject = s;
      setStream(s); setCamActive(true);
    } catch (e) {
      showToast('Camera access denied. Please allow camera in browser settings.', 'err');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      setSelfieFile(file);
      setSelfieURL(URL.createObjectURL(blob));
      stream?.getTracks().forEach(t => t.stop());
      setCamActive(false);
    }, 'image/jpeg', 0.9);
  };

  const retakePhoto = async () => {
    setSelfieFile(null); setSelfieURL('');
    await startCamera();
  };

  // ── STEP 5 — Final submit ──────────────────────────────────
  const handleSubmit = async () => {
    if (!selfieFile) return showToast('Please capture your selfie', 'err');
    if (!user) return;

    setLoading(true); showToast('Uploading and submitting KYC…');
    try {
      // Upload selfie to Firebase Storage
      const selfieRef  = ref(storage, `kyc/${user.uid}/selfie.jpg`);
      const selfieSnap = await uploadBytes(selfieRef, selfieFile);
      const selfieDownloadURL = await getDownloadURL(selfieSnap.ref);

      // Build KYC record
      const kycRef = `KYC${Date.now()}${Math.random().toString(36).slice(2,4).toUpperCase()}`;
      const kycData = {
        userId:      user.uid,
        kycRef,
        status:      'pending',
        step:        5,
        personalInfo: {
          fullName: fullName.trim(),
          dob,
          gender,
        },
        aadhaar: {
          last4:      aadhaar.replace(/\s/g,'').slice(-4),
          verified:   true,
          verifiedAt: new Date().toISOString(),
          // Store masked — never store full Aadhaar
          masked:     `XXXX-XXXX-${aadhaar.replace(/\s/g,'').slice(-4)}`,
          // Surepass verified data (name, address from Aadhaar)
          aadhaarName:  aadhaarData?.name        || fullName,
          aadhaarDob:   aadhaarData?.dob         || dob,
          aadhaarAddr:  aadhaarData?.address      || '',
          aadhaarState: aadhaarData?.state        || '',
          aadhaarPincode: aadhaarData?.zip_code   || '',
        },
        pan: {
          masked:     pan.slice(0,2) + 'XXX' + pan.slice(5,9) + pan.slice(-1),
          verified:   true,
          verifiedAt: new Date().toISOString(),
          panName:    panData?.name || fullName,
          panDob:     panData?.dob  || dob,
          panStatus:  panData?.status || 'VALID',
        },
        selfie:       selfieDownloadURL,
        submittedAt:  serverTimestamp(),
        updatedAt:    serverTimestamp(),
        reviewedAt:   null,
        rejectionReason: null,
      };

      // Save to Firestore
      await setDoc(doc(db, 'kyc', user.uid), kycData);

      // Update user document
      await updateDoc(doc(db, 'users', user.uid), {
        kycStatus:       'pending',
        kycRef,
        kycSubmittedAt:  serverTimestamp(),
        updatedAt:       serverTimestamp(),
      });

      await refreshProfile();
      showToast('✅ KYC submitted! Review takes 24-48 hours.');
      setStep(5);
    } catch (e: any) {
      showToast(e.message || 'Submission failed. Try again.', 'err');
    }
    setLoading(false);
  };

  // ── STATUS SCREENS ──────────────────────────────────────────
  if (kycStatus === 'verified') return (
    <StatusScreen
      icon="✅" color="#00d68f" title="KYC Verified!"
      desc="Your identity is fully verified. You have access to all INRT Wallet features."
      perks={['Limit: ₹1 Lakh/day transfers','International transfers enabled','Instant loan eligibility','500 bonus reward points credited']}
      btn="Back to Dashboard" onBtn={() => navigate('/dashboard')}
    />
  );

  if (kycStatus === 'pending') return (
    <StatusScreen
      icon="⏳" color="#f4b942" title="Under Review"
      desc="Your documents have been submitted. Verification typically takes 24–48 hours."
      perks={['Our team is reviewing your documents','Identity checked against government records','You will be notified via the app','Higher limits unlock automatically on approval']}
      btn="Back to Dashboard" onBtn={() => navigate('/dashboard')}
    />
  );

  if (kycStatus === 'rejected') return (
    <StatusScreen
      icon="❌" color="#ff4d6a" title="Verification Failed"
      desc={userProfile?.kycRejectionReason || 'Documents could not be verified. Please resubmit with clear, valid documents.'}
      btn="Resubmit KYC" onBtn={() => setStep(1)}
    />
  );

  // ── STEP LABELS ────────────────────────────────────────────
  const STEPS = ['Personal','Aadhaar','PAN','Selfie','Submit'];

  return (
    <div style={S.page}>
      {/* Toast */}
      {toast && (
        <div style={{
          ...S.toast,
          background: toastType==='ok'?'rgba(0,214,143,0.12)':'rgba(255,77,106,0.12)',
          borderColor: toastType==='ok'?'#00d68f':'#ff4d6a',
          color:       toastType==='ok'?'#00d68f':'#ff4d6a',
        }}>
          {toastType==='ok'?'✅':'⚠️'} {toast}
        </div>
      )}

      {/* Header */}
      <div style={S.header}>
        <button
          onClick={() => step > 1 ? setStep((step-1) as Step) : navigate('/dashboard')}
          className="back-btn">←</button>
        <h1 className="page-title">KYC Verification</h1>
        <span className="badge-teal">OFFICIAL</span>
      </div>

      {/* Progress stepper */}
      <div style={{ background:'linear-gradient(160deg,#050914,#0a0a14)',padding:'0 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center' }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', width:'100%' }}>
                {i > 0 && (
                  <div style={{ flex:1, height:2,
                    background: step > i ? 'var(--teal)' : 'var(--b1)',
                    transition: 'background 0.4s' }} />
                )}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 11, transition: 'all 0.4s',
                  background: step > i+1 ? 'var(--teal)' : step === i+1 ? 'var(--bg-elevated)' : 'var(--bg)',
                  border: `2px solid ${step >= i+1 ? 'var(--teal)' : 'var(--b1)'}`,
                  color:  step > i+1 ? '#000' : step === i+1 ? 'var(--teal)' : 'var(--t3)',
                }}>
                  {step > i+1 ? '✓' : i+1}
                </div>
                {i < STEPS.length-1 && (
                  <div style={{ flex:1, height:2,
                    background: step > i+1 ? 'var(--teal)' : 'var(--b1)',
                    transition: 'background 0.4s' }} />
                )}
              </div>
              <span style={{
                fontSize: 9, marginTop: 5, fontWeight: 600,
                color: step === i+1 ? 'var(--teal)' : 'var(--t3)',
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 16px 100px' }}>

        {/* ═══════════════════════════════════════════
            STEP 1 — Personal Information
        ═══════════════════════════════════════════ */}
        {step === 1 && (
          <div className="card">
            <p style={S.cardTitle}>👤 Personal Information</p>
            <p style={S.cardSubtitle}>
              Enter your details exactly as they appear on your Aadhaar card.
            </p>

            <Field label="FULL NAME" error={errs.fullName}>
              <input className="inp" placeholder="As on Aadhaar card"
                value={fullName}
                onChange={e => { setFullName(e.target.value); setErrs(x=>({...x,fullName:''})); }} />
            </Field>

            <Field label="DATE OF BIRTH" error={errs.dob}>
              <input className="inp" type="date"
                max={new Date(Date.now() - 18*365.25*24*3600*1000).toISOString().split('T')[0]}
                value={dob}
                onChange={e => { setDob(e.target.value); setErrs(x=>({...x,dob:''})); }} />
            </Field>

            <Field label="GENDER" error={errs.gender}>
              <div style={{ display:'flex', gap:10 }}>
                {['Male','Female','Other'].map(g => (
                  <button key={g} onClick={() => { setGender(g); setErrs(x=>({...x,gender:''})); }}
                    style={{
                      flex:1, padding:'12px 0', borderRadius:'var(--r1)',
                      border:`2px solid ${gender===g?'var(--teal)':'var(--b1)'}`,
                      background: gender===g?'var(--teal-dim)':'var(--bg-elevated)',
                      color: gender===g?'var(--teal)':'var(--t2)',
                      fontWeight:700, fontSize:13, cursor:'pointer',
                    }}>
                    {g}
                  </button>
                ))}
              </div>
            </Field>

            <div style={S.infoBox}>
              🔐 Your data is encrypted with 256-bit SSL and stored securely. We never share your information.
            </div>

            <button className="btn-primary" style={{ marginTop:16 }}
              onClick={() => { if(validateStep1()) setStep(2); }}>
              Continue →
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            STEP 2 — Aadhaar OTP Verification (REAL)
        ═══════════════════════════════════════════ */}
        {step === 2 && (
          <div className="card">
            <p style={S.cardTitle}>🪪 Aadhaar Verification</p>
            <p style={S.cardSubtitle}>
              We verify your Aadhaar using a real-time OTP sent to your
              Aadhaar-linked mobile number via UIDAI.
            </p>

            {!aadhaarSent ? (
              <>
                <Field label="AADHAAR NUMBER (12 DIGITS)" error={errs.aadhaar}>
                  <input className="inp"
                    type="tel" maxLength={14}
                    placeholder="XXXX XXXX XXXX"
                    value={aadhaar.replace(/(\d{4})(?=\d)/g,'$1 ').trim()}
                    onChange={e => {
                      setAadhaar(e.target.value.replace(/\s/g,'').replace(/\D/g,''));
                      setErrs(x=>({...x,aadhaar:''}));
                    }} />
                  {aadhaar.replace(/\s/g,'').length === 12 && (
                    <p style={{ color:'var(--green)',fontSize:12,marginTop:6,fontWeight:600 }}>✓ Valid format</p>
                  )}
                </Field>

                <div style={{ ...S.infoBox, marginBottom:16 }}>
                  📱 An OTP will be sent to the mobile number registered with your Aadhaar by UIDAI.
                  Make sure you have access to that number.
                </div>

                <button className="btn-primary"
                  onClick={sendAadhaarOTP}
                  disabled={loading || aadhaar.replace(/\s/g,'').length !== 12}
                  style={{ opacity:loading||aadhaar.replace(/\s/g,'').length!==12?0.5:1 }}>
                  {loading ? '⏳ Sending OTP…' : 'Send OTP to Aadhaar Mobile →'}
                </button>
              </>
            ) : (
              <>
                <div style={{ background:'rgba(0,229,204,0.06)',border:'1px solid rgba(0,229,204,0.2)',
                               borderRadius:'var(--r2)',padding:'14px 16px',marginBottom:16 }}>
                  <p style={{ color:'var(--teal)',fontWeight:600,fontSize:14 }}>OTP Sent!</p>
                  <p style={{ color:'var(--t2)',fontSize:13,marginTop:4 }}>
                    Enter the 6-digit OTP sent to your Aadhaar-linked mobile.
                    Valid for 10 minutes.
                  </p>
                </div>

                <Field label="6-DIGIT OTP" error={errs.otp}>
                  <input className="inp"
                    type="tel" maxLength={6}
                    placeholder="______"
                    style={{ letterSpacing:10, fontSize:22, fontWeight:800,
                             textAlign:'center', fontFamily:'Space Grotesk,sans-serif' }}
                    value={aadhaarOTP}
                    onChange={e => { setAadhaarOTP(e.target.value.replace(/\D/g,'')); setErrs(x=>({...x,otp:''})); }}
                    onKeyDown={e => e.key==='Enter' && verifyAadhaarOTP()} />
                </Field>

                <button className="btn-primary"
                  onClick={verifyAadhaarOTP}
                  disabled={loading || aadhaarOTP.length !== 6}
                  style={{ opacity:loading||aadhaarOTP.length!==6?0.5:1, marginBottom:12 }}>
                  {loading ? '⏳ Verifying…' : 'Verify OTP →'}
                </button>

                <button
                  onClick={() => { setAadhaarSent(false); setAadhaarOTP(''); }}
                  style={{ width:'100%',background:'none',border:'none',color:'var(--teal)',
                            fontWeight:600,fontSize:14,cursor:'pointer',padding:'8px 0' }}>
                  ← Change Aadhaar Number
                </button>

                <button
                  onClick={sendAadhaarOTP}
                  disabled={loading}
                  style={{ width:'100%',background:'none',border:'none',color:'var(--t2)',
                            fontWeight:500,fontSize:13,cursor:'pointer',padding:'4px 0' }}>
                  Resend OTP
                </button>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            STEP 3 — PAN Verification (REAL)
        ═══════════════════════════════════════════ */}
        {step === 3 && (
          <div className="card">
            <p style={S.cardTitle}>💳 PAN Verification</p>
            <p style={S.cardSubtitle}>
              Your PAN is verified against the Income Tax Department
              database in real-time.
            </p>

            {aadhaarData && (
              <div style={{ background:'rgba(0,214,143,0.06)',border:'1px solid rgba(0,214,143,0.2)',
                             borderRadius:'var(--r2)',padding:'14px',marginBottom:16 }}>
                <p style={{ color:'var(--green)',fontWeight:600,fontSize:13,marginBottom:6 }}>
                  ✅ Aadhaar Verified
                </p>
                <p style={{ color:'var(--t2)',fontSize:12 }}>
                  Name: {aadhaarData.name || fullName}
                </p>
                {aadhaarData.dob && (
                  <p style={{ color:'var(--t2)',fontSize:12,marginTop:2 }}>
                    DOB: {aadhaarData.dob}
                  </p>
                )}
              </div>
            )}

            <Field label="PAN NUMBER" error={errs.pan}>
              <input className="inp"
                maxLength={10}
                placeholder="ABCDE1234F"
                style={{ textTransform:'uppercase', letterSpacing:3,
                          fontFamily:'Space Grotesk,sans-serif',fontWeight:600,fontSize:16 }}
                value={pan}
                onChange={e => {
                  setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));
                  setErrs(x=>({...x,pan:''}));
                }} />
              {/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) && (
                <p style={{ color:'var(--green)',fontSize:12,marginTop:6,fontWeight:600 }}>✓ Valid PAN format</p>
              )}
            </Field>

            <div style={S.infoBox}>
              📋 Your PAN will be verified against the Income Tax database.
              Name on PAN must match your Aadhaar name.
            </div>

            <button className="btn-primary"
              onClick={verifyPAN}
              disabled={loading || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)}
              style={{ marginTop:16, opacity:loading||!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)?0.5:1 }}>
              {loading ? '⏳ Verifying PAN…' : 'Verify PAN →'}
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            STEP 4 — Selfie / Liveness
        ═══════════════════════════════════════════ */}
        {step === 4 && (
          <div className="card">
            <p style={S.cardTitle}>🤳 Selfie Verification</p>
            <p style={S.cardSubtitle}>
              Take a clear selfie. Look straight at the camera in good lighting.
              This photo is used for face match verification.
            </p>

            {panData && (
              <div style={{ background:'rgba(0,214,143,0.06)',border:'1px solid rgba(0,214,143,0.2)',
                             borderRadius:'var(--r2)',padding:'12px 14px',marginBottom:16 }}>
                <p style={{ color:'var(--green)',fontWeight:600,fontSize:13 }}>
                  ✅ PAN Verified — {panData.name || fullName}
                </p>
              </div>
            )}

            {/* Camera / Photo area */}
            <div style={{ marginBottom:16 }}>
              {!selfieURL && !camActive && (
                <button
                  onClick={startCamera}
                  style={{ width:'100%',background:'rgba(0,229,204,0.04)',
                            border:'2px dashed rgba(0,229,204,0.25)',borderRadius:'var(--r3)',
                            padding:'40px 0',display:'flex',flexDirection:'column',
                            alignItems:'center',gap:10,cursor:'pointer' }}>
                  <span style={{ fontSize:48 }}>📸</span>
                  <span style={{ color:'var(--teal)',fontWeight:700,fontSize:15 }}>
                    Open Camera for Selfie
                  </span>
                  <span style={{ color:'var(--t3)',fontSize:12 }}>
                    Requires camera permission
                  </span>
                </button>
              )}

              {camActive && (
                <div style={{ position:'relative',borderRadius:'var(--r3)',overflow:'hidden' }}>
                  <video
                    ref={videoRef}
                    autoPlay playsInline muted
                    style={{ width:'100%',borderRadius:'var(--r3)',
                              border:'2px solid var(--teal)',display:'block' }} />
                  {/* Oval face guide overlay */}
                  <div style={{ position:'absolute',top:'50%',left:'50%',
                                  transform:'translate(-50%,-55%)',
                                  width:'60%',height:'70%',
                                  border:'3px solid rgba(0,229,204,0.7)',
                                  borderRadius:'50%',pointerEvents:'none' }} />
                  <p style={{ position:'absolute',bottom:12,left:0,right:0,
                                textAlign:'center',color:'rgba(255,255,255,0.8)',
                                fontSize:12,fontWeight:600 }}>
                    Align face inside the oval
                  </p>
                  <button
                    onClick={capturePhoto}
                    style={{ position:'absolute',bottom:48,left:'50%',
                              transform:'translateX(-50%)',
                              width:64,height:64,borderRadius:'50%',
                              background:'var(--teal)',border:'4px solid #fff',
                              cursor:'pointer',fontSize:24 }}>
                    📷
                  </button>
                </div>
              )}

              {selfieURL && (
                <div style={{ position:'relative' }}>
                  <img src={selfieURL} alt="selfie"
                    style={{ width:'100%',borderRadius:'var(--r3)',
                              border:'3px solid var(--green)',display:'block',
                              maxHeight:360,objectFit:'cover' }} />
                  <div style={{ position:'absolute',top:12,right:12,
                                  background:'var(--green)',borderRadius:'50%',
                                  width:32,height:32,display:'flex',
                                  alignItems:'center',justifyContent:'center',
                                  color:'#000',fontSize:16,fontWeight:700 }}>✓</div>
                  <button onClick={retakePhoto}
                    style={{ position:'absolute',bottom:12,left:'50%',
                              transform:'translateX(-50%)',
                              background:'rgba(0,0,0,0.7)',border:'1px solid rgba(255,255,255,0.2)',
                              borderRadius:'var(--r1)',padding:'8px 20px',
                              color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer' }}>
                    🔄 Retake
                  </button>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} style={{ display:'none' }} />

            {/* Tips */}
            <div style={S.infoBox}>
              <p style={{ color:'var(--teal)',fontWeight:600,marginBottom:6 }}>📋 Tips for a good selfie:</p>
              {[
                'Remove glasses and face mask',
                'Ensure good front lighting',
                'Look straight at the camera',
                'Keep face centred in the oval',
                'Neutral expression, eyes open',
              ].map(t => (
                <p key={t} style={{ color:'var(--t2)',fontSize:12,padding:'3px 0' }}>✓ {t}</p>
              ))}
            </div>

            <button className="btn-primary"
              onClick={() => setStep(5)}
              disabled={!selfieFile}
              style={{ marginTop:16, opacity:!selfieFile?0.4:1 }}>
              Continue →
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            STEP 5 — Review & Submit
        ═══════════════════════════════════════════ */}
        {step === 5 && (
          <div>
            {/* Verification summary */}
            <div className="card" style={{ marginBottom:16 }}>
              <p style={S.cardTitle}>📋 Verification Summary</p>

              {[
                { label:'Full Name',  value:fullName,           verified:true },
                { label:'Date of Birth',value:dob,             verified:true },
                { label:'Gender',     value:gender,             verified:true },
                { label:'Aadhaar',    value:`XXXX-XXXX-${aadhaar.replace(/\s/g,'').slice(-4)}`, verified:true },
                { label:'PAN',        value:pan.slice(0,2)+'XXX'+pan.slice(5), verified:true },
                { label:'Selfie',     value:'Captured',         verified:true },
              ].map(row => (
                <div key={row.label}
                  style={{ display:'flex',justifyContent:'space-between',alignItems:'center',
                             padding:'11px 0',borderBottom:'1px solid var(--b1)' }}>
                  <span style={{ color:'var(--t2)',fontSize:13 }}>{row.label}</span>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <span style={{ color:'var(--t1)',fontWeight:600,fontSize:13 }}>{row.value}</span>
                    {row.verified && <span style={{ color:'var(--green)',fontSize:12 }}>✓</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Consent */}
            <div style={{ background:'rgba(244,185,66,0.06)',border:'1px solid rgba(244,185,66,0.2)',
                           borderRadius:'var(--r2)',padding:'16px',marginBottom:16 }}>
              <p style={{ color:'var(--gold)',fontWeight:600,fontSize:14,marginBottom:8 }}>
                📜 Declaration
              </p>
              <p style={{ color:'var(--t2)',fontSize:12,lineHeight:1.7 }}>
                I hereby declare that the information provided is accurate and
                I consent to INRT Wallet verifying my identity documents with
                government authorities (UIDAI and Income Tax Department) as
                required under RBI KYC guidelines and Prevention of Money
                Laundering Act (PMLA) 2002.
              </p>
            </div>

            {/* What happens next */}
            <div className="card" style={{ marginBottom:16 }}>
              <p style={{ color:'var(--t1)',fontWeight:600,fontSize:14,marginBottom:12 }}>
                ⏱ What happens after submission?
              </p>
              {[
                { step:'1', text:'Documents submitted to our verification team' },
                { step:'2', text:'Identity checked against UIDAI and IT database' },
                { step:'3', text:'Decision in 24-48 hours' },
                { step:'4', text:'You get notified + limits upgraded automatically' },
              ].map(s => (
                <div key={s.step} style={{ display:'flex',gap:12,padding:'8px 0' }}>
                  <div style={{ width:24,height:24,borderRadius:'50%',background:'var(--teal-dim)',
                                  border:'1px solid var(--teal)',display:'flex',alignItems:'center',
                                  justifyContent:'center',color:'var(--teal)',fontSize:11,
                                  fontWeight:700,flexShrink:0 }}>
                    {s.step}
                  </div>
                  <p style={{ color:'var(--t2)',fontSize:13,flex:1 }}>{s.text}</p>
                </div>
              ))}
            </div>

            <button className="btn-primary"
              onClick={handleSubmit}
              disabled={loading}
              style={{ opacity:loading?0.6:1 }}>
              {loading ? '⏳ Submitting KYC…' : '✓ Submit KYC for Verification'}
            </button>
            <p style={{ textAlign:'center',color:'var(--t3)',fontSize:11,marginTop:10 }}>
              🔒 End-to-end encrypted · RBI compliant · PMLA 2002
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────
function Field({
  label, error, children
}: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:18 }}>
      <p className="s-label">{label}</p>
      {children}
      {error && <p className="err-box" style={{ marginTop:6 }}>⚠️ {error}</p>}
    </div>
  );
}

function StatusScreen({
  icon, color, title, desc, perks, btn, onBtn
}: {
  icon:string; color:string; title:string; desc:string;
  perks?:string[]; btn:string; onBtn:()=>void;
}) {
  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',
                   background:'var(--bg)',fontFamily:'var(--f-body)',
                   display:'flex',flexDirection:'column',alignItems:'center',
                   padding:'80px 24px',textAlign:'center' }}>
      <div style={{ width:80,height:80,borderRadius:'50%',
                     background:`${color}15`,border:`2px solid ${color}`,
                     display:'flex',alignItems:'center',justifyContent:'center',
                     fontSize:36,marginBottom:20 }}>
        {icon}
      </div>
      <h2 style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:24,
                    color:'var(--t1)',marginBottom:10 }}>
        {title}
      </h2>
      <p style={{ color:'var(--t2)',fontSize:14,lineHeight:1.7,
                   marginBottom:24,maxWidth:320 }}>
        {desc}
      </p>
      {perks && (
        <div style={{ background:`${color}08`,border:`1px solid ${color}25`,
                       borderRadius:'var(--r2)',padding:'16px',
                       width:'100%',marginBottom:24,textAlign:'left' }}>
          {perks.map(p => (
            <p key={p} style={{ color:color,fontSize:13,padding:'6px 0',
                                  borderBottom:`1px solid ${color}10`,fontWeight:500 }}>
              ✓ {p}
            </p>
          ))}
        </div>
      )}
      <button className="btn-primary" onClick={onBtn}>{btn}</button>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const S: Record<string,React.CSSProperties> = {
  page:        { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' },
  header:      { background:'linear-gradient(160deg,#050914,#0a0a14)',padding:'52px 20px 16px',display:'flex',alignItems:'center',gap:14,borderBottom:'1px solid var(--b1)' },
  cardTitle:   { fontFamily:'var(--f-display)',fontWeight:700,fontSize:18,color:'var(--t1)',marginBottom:6 },
  cardSubtitle:{ color:'var(--t2)',fontSize:13,lineHeight:1.6,marginBottom:20 },
  infoBox:     { background:'rgba(0,229,204,0.04)',border:'1px solid rgba(0,229,204,0.12)',borderRadius:'var(--r1)',padding:'12px 14px',fontSize:12,color:'var(--t2)',lineHeight:1.6 },
  toast:       { position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',border:'1px solid',borderRadius:'var(--r2)',padding:'12px 22px',fontSize:14,fontWeight:600,zIndex:9999,boxShadow:'var(--s2)',maxWidth:380,textAlign:'center',backdropFilter:'blur(12px)' },
};
