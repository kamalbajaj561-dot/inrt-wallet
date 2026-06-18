/**
 * INRT WALLET — KYCPage.tsx (PAN Only, Manual Review)
 * Replace: src/pages/KYCPage.tsx
 *
 * Flow:
 *   Step 1: Personal info + PAN number
 *   Step 2: PAN card photo upload
 *   Step 3: Selfie
 *   Step 4: Submitted — shows real-time status
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate }                  from 'react-router-dom';
import { useAuth }                      from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || '';

type Step = 1 | 2 | 3 | 'submitted' | 'success' | 'rejected';

async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas  = document.createElement('canvas');
      const ratio   = Math.min(800 / img.width, 800 / img.height, 1);
      canvas.width  = img.width  * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
    };
    img.onerror = reject;
    img.src     = url;
  });
}

export default function KYCPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step,     setStep]     = useState<Step>(1);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');

  // Step 1 fields
  const [fullName, setFullName] = useState(userProfile?.name || '');
  const [dob,      setDob]      = useState('');
  const [pan,      setPan]      = useState('');

  // Step 2 — PAN photo
  const [panPhoto,   setPanPhoto]   = useState<string | null>(null);
  const [panPreview, setPanPreview] = useState<string | null>(null);

  // Step 3 — Selfie
  const [selfie,        setSelfie]        = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn,   setCamOn]   = useState(false);
  const pollRef   = useRef<any>(null);

  const kycStatus = userProfile?.kycStatus || 'not_started';

  // ── Sync step with kycStatus ─────────────────────────────────
  useEffect(() => {
    if (kycStatus === 'verified') setStep('success');
    if (kycStatus === 'rejected') setStep('rejected');
    if (kycStatus === 'pending' && step === 1) {
      setStep('submitted');
      startPolling();
    }
    return () => {
      clearInterval(pollRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [kycStatus]);

  // ── Poll every 15 seconds when pending ───────────────────────
  const startPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API}/kyc/status/${user!.uid}`);
        const d = await r.json();
        if (d.status === 'verified') {
          clearInterval(pollRef.current);
          await refreshProfile();
          setStep('success');
        } else if (d.status === 'rejected') {
          clearInterval(pollRef.current);
          await refreshProfile();
          setStep('rejected');
        }
      } catch { /* keep polling */ }
    }, 15000);
  };

  // ── Handle file upload ────────────────────────────────────────
  const handleFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setB64: (v: string) => void,
    setPreview: (v: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return setErr('File too large. Max 15MB.');
    setErr('');
    try {
      const b64     = await compressImage(file);
      const preview = URL.createObjectURL(file);
      setB64(b64);
      setPreview(preview);
    } catch { setErr('Failed to process image. Try again.'); }
  };

  // ── Camera ────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamOn(true);
    } catch { setErr('Camera access denied. Please upload a selfie instead.'); }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };

  const captureSelfie = () => {
    if (!videoRef.current) return;
    const canvas  = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0);
    setSelfie(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    setSelfiePreview(canvas.toDataURL('image/jpeg', 0.8));
    stopCamera();
  };

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selfie) return setErr('Please take a selfie or upload a photo');
    setLoading(true); setErr('');
    try {
      const r = await fetch(`${API}/kyc/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:         user!.uid,
          fullName,
          dob,
          pan:            pan.toUpperCase().trim(),
          panPhotoBase64: panPhoto,
          selfieBase64:   selfie,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Submission failed');
      await refreshProfile();
      setStep('submitted');
      startPolling();
    } catch (e: any) {
      setErr(e.message || 'Submission failed. Please try again.');
    }
    setLoading(false);
  };

  const STEP_LABELS = ['Personal Info', 'PAN Card', 'Selfie'];

  // ══════════════════════════════════════════════════════════════
  //  SUCCESS SCREEN
  // ══════════════════════════════════════════════════════════════
  if (step === 'success') return (
    <div style={S.page}>
      <div style={S.centered}>
        <div style={S.icon('#00C853')}>✅</div>
        <h2 style={S.h2}>KYC Verified!</h2>
        <p style={S.sub}>Your PAN card has been verified. Daily limit is now ₹1,00,000.</p>
        <div style={{ display:'flex', gap:10, width:'100%', marginBottom:24 }}>
          {[['Daily Limit','₹1,00,000'],['Reward','+500 INRT'],['Status','Verified ✓']].map(([k,v])=>(
            <div key={k} style={S.statBox}>
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:10, fontWeight:600, margin:'0 0 4px' }}>{k}</p>
              <p style={{ color:'#00e5cc', fontSize:12, fontWeight:700, margin:0 }}>{v}</p>
            </div>
          ))}
        </div>
        <button style={{ ...S.btnTeal, width:'100%' }} onClick={()=>navigate('/dashboard')}>
          Back to Home →
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  SUBMITTED / PENDING SCREEN — real time status
  // ══════════════════════════════════════════════════════════════
  if (step === 'submitted') return (
    <div style={S.page}>
      <div style={S.centered}>
        {/* Animated pending icon */}
        <div style={{ position:'relative', marginBottom:24 }}>
          <div style={{ width:84, height:84, borderRadius:'50%', background:'rgba(255,149,0,0.1)', border:'2px solid #FF9500', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36 }}>⏳</div>
          <div style={{ position:'absolute', top:-4, right:-4, width:24, height:24, borderRadius:'50%', background:'rgba(0,229,204,0.15)', border:'1px solid #00e5cc', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:'#00e5cc', animation:'pulse 1.5s infinite' }}/>
          </div>
        </div>

        <h2 style={S.h2}>Documents Under Review</h2>
        <p style={S.sub}>Your PAN card and selfie have been submitted. Our team will verify within 24 hours.</p>

        {/* Status timeline */}
        <div style={{ width:'100%', marginBottom:20 }}>
          {[
            { label:'Documents submitted',     done:true,  active:false, icon:'✅' },
            { label:'Under review by our team', done:false, active:true,  icon:'🔍' },
            { label:'KYC approved',             done:false, active:false, icon:'🎉' },
          ].map((s,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: i<2?'1px solid rgba(255,255,255,0.05)':'none' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:s.done?'rgba(0,200,83,0.15)':s.active?'rgba(255,149,0,0.15)':'rgba(255,255,255,0.04)', border:`1px solid ${s.done?'#00C853':s.active?'#FF9500':'rgba(255,255,255,0.1)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                {s.icon}
              </div>
              <div style={{ flex:1, textAlign:'left' as const }}>
                <p style={{ fontWeight:700, fontSize:14, color:s.done?'#fff':s.active?'#FF9500':'rgba(255,255,255,0.3)', margin:0 }}>{s.label}</p>
                {s.active && <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', margin:'2px 0 0' }}>Checking every 15 seconds…</p>}
              </div>
              {s.active && <div style={{ width:16, height:16, border:'2px solid rgba(255,149,0,0.3)', borderTopColor:'#FF9500', borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }}/>}
            </div>
          ))}
        </div>

        {/* Info boxes */}
        <div style={{ background:'rgba(0,229,204,0.04)', border:'1px solid rgba(0,229,204,0.1)', borderRadius:14, padding:'14px 16px', width:'100%', marginBottom:12 }}>
          <p style={{ color:'#00e5cc', fontWeight:700, fontSize:13, margin:'0 0 6px' }}>📱 Auto-notification</p>
          <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:0, lineHeight:1.6 }}>
            You will be automatically notified when your KYC is approved. No need to keep this page open.
          </p>
        </div>

        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'14px 16px', width:'100%', marginBottom:24 }}>
          <p style={{ color:'rgba(255,255,255,0.5)', fontWeight:600, fontSize:13, margin:'0 0 6px' }}>⏱️ Typical review times</p>
          {[['Business hours (10am-6pm)','Within 2 hours'],['After hours','By 10am next day'],['Weekends','By Monday 10am']].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color:'rgba(255,255,255,0.3)', fontSize:12 }}>{k}</span>
              <span style={{ color:'#00e5cc', fontSize:12, fontWeight:600 }}>{v}</span>
            </div>
          ))}
        </div>

        <button style={{ ...S.btnTeal, width:'100%', marginBottom:10 }} onClick={()=>navigate('/dashboard')}>
          Back to Home
        </button>
        <button style={S.btnOutline} onClick={async ()=>{ await refreshProfile(); }}>
          🔄 Refresh Status
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  REJECTED SCREEN
  // ══════════════════════════════════════════════════════════════
  if (step === 'rejected') return (
    <div style={S.page}>
      <div style={S.centered}>
        <div style={S.icon('#FF3B30')}>❌</div>
        <h2 style={S.h2}>KYC Rejected</h2>
        <p style={S.sub}>{userProfile?.kycRejectionReason || 'Your documents could not be verified.'}</p>
        <div style={{ background:'rgba(255,59,48,0.06)', border:'1px solid rgba(255,59,48,0.15)', borderRadius:14, padding:'16px', width:'100%', marginBottom:24 }}>
          <p style={{ color:'#FF3B30', fontWeight:700, fontSize:13, margin:'0 0 8px' }}>Please fix and resubmit:</p>
          {['Ensure PAN card photo is clear and readable','All text on PAN must be visible','Selfie must clearly show your face','PAN name must match your registered name'].map(t=>(
            <p key={t} style={{ color:'rgba(255,255,255,0.5)', fontSize:12, margin:'4px 0' }}>• {t}</p>
          ))}
        </div>
        <button style={{ ...S.btnTeal, width:'100%', marginBottom:10 }}
          onClick={()=>{ setPanPhoto(null); setPanPreview(null); setSelfie(null); setSelfiePreview(null); setErr(''); setStep(1); }}>
          🔄 Resubmit Documents
        </button>
        <button style={S.btnOutline} onClick={()=>navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  MAIN FORM
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={()=>step===1?navigate('/dashboard'):setStep(s=>(typeof s==='number'?s-1 as Step:1))} style={S.backBtn}>←</button>
        <h1 style={S.title}>KYC Verification</h1>
      </div>

      {/* Progress bar */}
      {typeof step === 'number' && (
        <div style={{ padding:'14px 16px 0', background:'#050914' }}>
          <div style={{ display:'flex', gap:6, marginBottom:6 }}>
            {STEP_LABELS.map((_,i)=>(
              <div key={i} style={{ flex:1, height:4, borderRadius:4, background:i<(step as number)?'#00e5cc':'rgba(255,255,255,0.08)', transition:'background 0.3s' }}/>
            ))}
          </div>
          <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, margin:0 }}>
            Step {step} of 3 — {STEP_LABELS[(step as number)-1]}
          </p>
        </div>
      )}

      <div style={{ padding:'16px 16px 90px' }}>

        {/* ── STEP 1: Personal Info ── */}
        {step===1&&(
          <div>
            <div style={S.infoCard}>
              <p style={{ color:'#00e5cc', fontWeight:700, fontSize:13, margin:'0 0 4px' }}>📋 What you need</p>
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:0, lineHeight:1.6 }}>
                PAN card · A selfie photo · Takes 3 minutes
              </p>
            </div>

            <div style={S.card}>
              <p style={S.label}>FULL NAME (as on PAN card)</p>
              <input value={fullName} onChange={e=>{setFullName(e.target.value);setErr('');}}
                placeholder="Your full legal name" style={S.input}/>

              <p style={S.label}>DATE OF BIRTH</p>
              <input type="date" value={dob} onChange={e=>{setDob(e.target.value);setErr('');}}
                max={new Date(Date.now()-18*365*24*60*60*1000).toISOString().split('T')[0]}
                style={S.input}/>

              <p style={S.label}>PAN NUMBER</p>
              <input value={pan} onChange={e=>{setPan(e.target.value.toUpperCase().replace(/\s/g,''));setErr('');}}
                placeholder="e.g. ABCDE1234F" maxLength={10}
                style={{ ...S.input, textTransform:'uppercase' as const, letterSpacing:2, fontFamily:'monospace', fontSize:18 }}/>

              <div style={{ background:'rgba(0,112,243,0.06)', border:'1px solid rgba(0,112,243,0.1)', borderRadius:10, padding:'10px 12px', marginBottom:16 }}>
                <p style={{ color:'rgba(255,255,255,0.4)', fontSize:11, margin:0, lineHeight:1.6 }}>
                  🔒 Your PAN is securely stored and used only for identity verification. We never share it with third parties except as required by law.
                </p>
              </div>

              {err&&<p style={S.err}>{err}</p>}

              <button style={{ ...S.btnTeal, width:'100%', opacity:(!fullName||!dob||pan.length!==10)?0.5:1 }}
                onClick={()=>{
                  if (!fullName.trim())                            return setErr('Enter your full name');
                  if (!dob)                                        return setErr('Select date of birth');
                  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))      return setErr('Invalid PAN. Example: ABCDE1234F');
                  setErr(''); setStep(2);
                }}
                disabled={!fullName||!dob||pan.length!==10}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: PAN Photo ── */}
        {step===2&&(
          <div>
            <div style={S.card}>
              <p style={S.cardTitle}>📸 PAN Card Photo</p>
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:'0 0 16px', lineHeight:1.6 }}>
                Upload a clear photo of your PAN card. All text must be readable.
              </p>

              {panPreview ? (
                <div style={{ marginBottom:16 }}>
                  <img src={panPreview} alt="PAN" style={{ width:'100%', borderRadius:12, maxHeight:220, objectFit:'cover' as const, border:'1px solid rgba(0,229,204,0.2)' }}/>
                  <button onClick={()=>{setPanPhoto(null);setPanPreview(null);}}
                    style={S.removeBtn}>✕ Remove — Retake</button>
                </div>
              ) : (
                <label style={S.uploadBox}>
                  <span style={{ fontSize:44, marginBottom:10, display:'block' }}>🪪</span>
                  <span style={{ color:'#00e5cc', fontWeight:700, fontSize:14, display:'block' }}>Tap to upload PAN card</span>
                  <span style={{ color:'rgba(255,255,255,0.3)', fontSize:12, marginTop:6, display:'block' }}>JPG / PNG · Max 15MB</span>
                  <input type="file" accept="image/*" onChange={e=>handleFile(e, setPanPhoto!, setPanPreview!)} style={{ display:'none' }}/>
                </label>
              )}

              <div style={S.tipCard}>
                <p style={{ color:'#FFD60A', fontWeight:700, fontSize:12, margin:'0 0 6px' }}>💡 Tips</p>
                {['All 4 corners of PAN must be visible','PAN number must be clearly readable','Good lighting, no shadows or glare','Keep card flat on a surface'].map(t=>(
                  <p key={t} style={{ color:'rgba(255,255,255,0.4)', fontSize:11, margin:'3px 0' }}>• {t}</p>
                ))}
              </div>

              {err&&<p style={S.err}>{err}</p>}

              <button style={{ ...S.btnTeal, width:'100%', opacity:!panPhoto?0.5:1 }}
                onClick={()=>panPhoto&&setStep(3)} disabled={!panPhoto}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Selfie ── */}
        {step===3&&(
          <div>
            <div style={S.card}>
              <p style={S.cardTitle}>🤳 Take a Selfie</p>
              <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:'0 0 16px', lineHeight:1.6 }}>
                We need a selfie to confirm you are the PAN card holder.
              </p>

              {selfiePreview ? (
                <div style={{ marginBottom:16, textAlign:'center' as const }}>
                  <img src={selfiePreview} alt="Selfie" style={{ width:190, height:190, borderRadius:'50%', objectFit:'cover' as const, border:'3px solid #00e5cc', display:'block', margin:'0 auto 12px' }}/>
                  <button onClick={()=>{setSelfie(null);setSelfiePreview(null);stopCamera();}}
                    style={S.removeBtn}>✕ Retake Selfie</button>
                </div>
              ) : camOn ? (
                <div style={{ marginBottom:16 }}>
                  <video ref={videoRef} autoPlay playsInline muted
                    style={{ width:'100%', borderRadius:16, maxHeight:280, background:'#000', display:'block', border:'1px solid rgba(0,229,204,0.2)' }}/>
                  <div style={{ display:'flex', gap:10, marginTop:10 }}>
                    <button onClick={stopCamera} style={{ flex:1, padding:'12px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Cancel</button>
                    <button onClick={captureSelfie} style={{ ...S.btnTeal, flex:2, padding:'12px' }}>📸 Capture</button>
                  </div>
                </div>
              ) : (
                <div>
                  <button onClick={startCamera} style={{ ...S.uploadBox, width:'100%', cursor:'pointer', display:'flex', flexDirection:'column' as const, alignItems:'center' }}>
                    <span style={{ fontSize:48, display:'block', marginBottom:10 }}>📸</span>
                    <span style={{ color:'#00e5cc', fontWeight:700, fontSize:14, display:'block' }}>Open Camera</span>
                    <span style={{ color:'rgba(255,255,255,0.3)', fontSize:12, marginTop:4, display:'block' }}>Take a live selfie</span>
                  </button>
                  <div style={{ textAlign:'center' as const, margin:'12px 0', color:'rgba(255,255,255,0.2)', fontSize:12 }}>— OR —</div>
                  <label style={S.uploadBox}>
                    <span style={{ fontSize:36, marginBottom:8, display:'block' }}>🖼️</span>
                    <span style={{ color:'#00e5cc', fontWeight:700, fontSize:14 }}>Upload from gallery</span>
                    <input type="file" accept="image/*" capture="user"
                      onChange={e=>handleFile(e, setSelfie!, setSelfiePreview!)} style={{ display:'none' }}/>
                  </label>
                </div>
              )}

              <div style={S.tipCard}>
                <p style={{ color:'#FFD60A', fontWeight:700, fontSize:12, margin:'0 0 6px' }}>💡 Selfie tips</p>
                {['Face must be clearly visible','Good lighting — no backlight','No sunglasses or hat','Look directly at camera'].map(t=>(
                  <p key={t} style={{ color:'rgba(255,255,255,0.4)', fontSize:11, margin:'3px 0' }}>• {t}</p>
                ))}
              </div>

              {err&&<p style={S.err}>{err}</p>}

              <button style={{ ...S.btnPrimary, width:'100%', opacity:loading||!selfie?0.5:1 }}
                onClick={handleSubmit} disabled={loading||!selfie}>
                {loading
                  ?<span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                     <span style={{ width:18, height:18, border:'2px solid #fff', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/>
                     Uploading…
                   </span>
                  :'🚀 Submit for Verification'
                }
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        *{-webkit-tap-highlight-color:transparent}
        input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.4)}
      `}</style>
    </div>
  );
}

const S: Record<string,any> = {
  page:      { maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#050914', fontFamily:"'Plus Jakarta Sans',sans-serif" },
  header:    { background:'linear-gradient(160deg,#050914,#0a1428)', padding:'52px 20px 16px', display:'flex', alignItems:'center', gap:14, borderBottom:'1px solid rgba(255,255,255,0.06)' },
  backBtn:   { background:'none', border:'none', color:'#00e5cc', fontSize:22, cursor:'pointer', lineHeight:1, flexShrink:0 },
  title:     { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:20, color:'#fff', margin:0 },
  centered:  { display:'flex', flexDirection:'column', alignItems:'center', padding:'60px 24px', textAlign:'center' },
  card:      { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:18, padding:'18px 16px', marginBottom:14 },
  cardTitle: { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:15, color:'#fff', margin:'0 0 12px' },
  infoCard:  { background:'rgba(0,229,204,0.04)', border:'1px solid rgba(0,229,204,0.1)', borderRadius:14, padding:'14px 16px', marginBottom:14 },
  tipCard:   { background:'rgba(255,214,10,0.03)', border:'1px solid rgba(255,214,10,0.08)', borderRadius:12, padding:'12px 14px', marginBottom:16 },
  label:     { color:'rgba(255,255,255,0.4)', fontSize:11, fontWeight:700, letterSpacing:0.8, margin:'0 0 8px' },
  input:     { width:'100%', background:'rgba(255,255,255,0.05)', border:'1.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'13px 14px', color:'#fff', fontSize:15, outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:16, boxSizing:'border-box' as const },
  uploadBox: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'rgba(0,229,204,0.04)', border:'2px dashed rgba(0,229,204,0.2)', borderRadius:16, padding:'28px 20px', marginBottom:16, cursor:'pointer', textAlign:'center' as const },
  removeBtn: { width:'100%', marginTop:8, background:'rgba(255,59,48,0.08)', border:'1px solid rgba(255,59,48,0.2)', color:'#FF3B30', borderRadius:10, padding:'10px 16px', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'Plus Jakarta Sans',sans-serif" },
  err:       { color:'#FF3B30', fontSize:13, margin:'0 0 12px', fontWeight:600 },
  btnTeal:   { background:'linear-gradient(135deg,#00e5cc,#00b4a0)', color:'#000', border:'none', borderRadius:14, padding:'16px 24px', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", boxShadow:'0 4px 16px rgba(0,229,204,0.3)' },
  btnPrimary:{ background:'#0A2540', color:'#fff', border:'none', borderRadius:14, padding:'16px 24px', fontSize:15, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" },
  btnOutline:{ background:'transparent', color:'#00e5cc', border:'1px solid rgba(0,229,204,0.3)', borderRadius:14, padding:'14px 20px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", width:'100%', marginTop:8 },
  statBox:   { flex:1, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'12px 8px', textAlign:'center' },
  icon:      (c:string) => ({ width:84, height:84, borderRadius:'50%', background:`${c}18`, border:`2px solid ${c}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, marginBottom:20 }),
  h2:        { fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:26, color:'#fff', margin:'0 0 8px' },
  sub:       { color:'rgba(255,255,255,0.5)', fontSize:14, marginBottom:24, lineHeight:1.7, maxWidth:320 },
};
