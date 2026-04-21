import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  doc, updateDoc, setDoc, getDoc, serverTimestamp
} from 'firebase/firestore';
import {
  ref, uploadBytes, getDownloadURL
} from 'firebase/storage';
import { db, storage } from '../lib/firebase';

type KYCStatus = 'not_started'|'in_progress'|'pending'|'verified'|'rejected';
type Step = 1|2|3|4;

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu',
  'Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu & Kashmir','Ladakh','Puducherry','Chandigarh',
];

export default function KYCPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step,     setStep]    = useState<Step>(1);
  const [loading,  setLoading] = useState(false);
  const [errors,   setErrors]  = useState<Record<string,string>>({});
  const [toast,    setToast]   = useState('');

  // Form data
  const [fullName,  setFullName]  = useState(userProfile?.name || '');
  const [dob,       setDob]       = useState('');
  const [gender,    setGender]    = useState('');
  const [aadhaar,   setAadhaar]   = useState('');
  const [pan,       setPan]       = useState('');
  const [address,   setAddress]   = useState('');
  const [city,      setCity]      = useState('');
  const [state,     setState]     = useState('Maharashtra');
  const [pincode,   setPincode]   = useState('');

  // Document files + previews
  const [aadhaarF,  setAadhaarF]  = useState<File|null>(null);
  const [aadhaarB,  setAadhaarB]  = useState<File|null>(null);
  const [panDoc,    setPanDoc]    = useState<File|null>(null);
  const [selfie,    setSelfie]    = useState<File|null>(null);
  const [prevAF,    setPrevAF]    = useState('');
  const [prevAB,    setPrevAB]    = useState('');
  const [prevPan,   setPrevPan]   = useState('');
  const [prevSel,   setPrevSel]   = useState('');

  const refAF  = useRef<HTMLInputElement>(null);
  const refAB  = useRef<HTMLInputElement>(null);
  const refPan = useRef<HTMLInputElement>(null);
  const refSel = useRef<HTMLInputElement>(null);

  const kycStatus: KYCStatus = userProfile?.kycStatus || 'not_started';

  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(''),3000); };

  const setFile = (
    file: File,
    setter: (f:File|null)=>void,
    prevSetter: (s:string)=>void,
    key: string
  ) => {
    if (file.size > 5*1024*1024) { setErrors(e=>({...e,[key]:'File too large (max 5MB)'})); return; }
    setter(file);
    prevSetter(URL.createObjectURL(file));
    setErrors(e=>({...e,[key]:''}));
  };

  // ── Validate each step ────────────────────────────────────────
  const validate = (s: Step): boolean => {
    const e: Record<string,string> = {};
    if (s===1) {
      if (!fullName.trim()||fullName.length<3) e.fullName='Enter full name (min 3 chars)';
      if (!dob) e.dob='Date of birth required';
      else {
        const age = new Date().getFullYear() - new Date(dob).getFullYear();
        if (age<18) e.dob='Must be 18 or older';
      }
      if (!gender) e.gender='Select gender';
    }
    if (s===2) {
      if (!aadhaar||aadhaar.replace(/\s/g,'').length!==12) e.aadhaar='Aadhaar must be 12 digits';
      if (!pan||!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) e.pan='PAN format: ABCDE1234F';
    }
    if (s===3) {
      if (!address.trim()||address.length<10) e.address='Enter complete address';
      if (!city.trim()) e.city='City required';
      if (!pincode||!/^\d{6}$/.test(pincode)) e.pincode='Enter valid 6-digit PIN';
    }
    if (s===4) {
      if (!aadhaarF)  e.aadhaarF='Upload Aadhaar front';
      if (!aadhaarB)  e.aadhaarB='Upload Aadhaar back';
      if (!panDoc)    e.panDoc='Upload PAN card';
      if (!selfie)    e.selfie='Upload selfie photo';
    }
    setErrors(e);
    return Object.keys(e).length===0;
  };

  const uploadDoc = async (file: File, path: string): Promise<string> => {
    const storageRef = ref(storage, path);
    const snap = await uploadBytes(storageRef, file);
    return getDownloadURL(snap.ref);
  };

  const handleNext = () => {
    if (!validate(step)) return;
    if (step < 4) setStep((step+1) as Step);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    if (!validate(4)||!user) return;
    setLoading(true);
    try {
      // Upload documents to Firebase Storage
      showToast('Uploading documents...');
      const basePath = `kyc/${user.uid}`;
      const [urlAF, urlAB, urlPan, urlSel] = await Promise.all([
        uploadDoc(aadhaarF!,  `${basePath}/aadhaar_front`),
        uploadDoc(aadhaarB!,  `${basePath}/aadhaar_back`),
        uploadDoc(panDoc!,    `${basePath}/pan_card`),
        uploadDoc(selfie!,    `${basePath}/selfie`),
      ]);

      const cleanAadhaar = aadhaar.replace(/\s/g,'');

      // Save KYC data to Firestore
      await setDoc(doc(db,'kyc',user.uid), {
        userId:       user.uid,
        status:       'pending',
        step:         4,
        personalInfo: { fullName:fullName.trim(), dob, gender },
        identity: {
          aadhaarLast4: cleanAadhaar.slice(-4),
          aadhaarHash:  btoa(cleanAadhaar), // base64 encode (not true hash, use server for prod)
          panMasked:    pan.slice(0,2)+'XXX'+pan.slice(5),
        },
        address: { address:address.trim(), city:city.trim(), state, pincode },
        documents: {
          aadhaarFront: urlAF,
          aadhaarBack:  urlAB,
          panCard:      urlPan,
          selfie:       urlSel,
        },
        submittedAt:  serverTimestamp(),
        updatedAt:    serverTimestamp(),
      });

      // Update user record
      await updateDoc(doc(db,'users',user.uid), {
        kycStatus:      'pending',
        kycSubmittedAt: serverTimestamp(),
        updatedAt:      serverTimestamp(),
      });

      await refreshProfile();
      showToast('✅ KYC submitted successfully!');
    } catch (e:any) {
      showToast(e.message||'Submission failed. Try again.');
    }
    setLoading(false);
  };

  // ── STATUS SCREENS ────────────────────────────────────────────
  if (kycStatus==='verified') return (
    <div style={S.page}>
      <Header onBack={()=>navigate('/dashboard')} title="KYC Verified" />
      <div style={S.centred}>
        <div style={S.statusIcon('#10b981')}>✅</div>
        <h2 style={S.statusTitle}>KYC Complete!</h2>
        <p style={S.statusDesc}>Your identity is verified. You have full access to all INRT Wallet features.</p>
        <div style={S.perksBox}>
          {['Higher limit: ₹1 Lakh/day','International transfers','Instant loans eligible','500 bonus reward points'].map(p=>(
            <p key={p} style={{ color:'#10b981',fontSize:13,padding:'6px 0',borderBottom:'1px solid rgba(16,185,129,0.1)' }}>✓ {p}</p>
          ))}
        </div>
        <button style={S.goldBtn} onClick={()=>navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    </div>
  );

  if (kycStatus==='pending') return (
    <div style={S.page}>
      <Header onBack={()=>navigate('/dashboard')} title="KYC Status" />
      <div style={S.centred}>
        <div style={S.statusIcon('#f0b429')}>⏳</div>
        <h2 style={S.statusTitle}>Under Review</h2>
        <p style={S.statusDesc}>Documents submitted. Verification takes 24–48 hours. You'll be notified once done.</p>
        <div style={{ ...S.perksBox,borderColor:'rgba(240,180,41,0.2)',background:'rgba(240,180,41,0.05)' }}>
          <p style={{ color:'#f0b429',fontSize:13,fontWeight:600,marginBottom:8 }}>What happens next?</p>
          {['Our team reviews your documents','Identity is verified against records','You get notified on completion','Higher limits are unlocked automatically'].map((s,i)=>(
            <p key={i} style={{ color:'#8888a8',fontSize:13,padding:'5px 0' }}>{i+1}. {s}</p>
          ))}
        </div>
        <button style={S.goldBtn} onClick={()=>navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    </div>
  );

  if (kycStatus==='rejected') return (
    <div style={S.page}>
      <Header onBack={()=>navigate('/dashboard')} title="KYC Rejected" />
      <div style={S.centred}>
        <div style={S.statusIcon('#ef4444')}>❌</div>
        <h2 style={S.statusTitle}>Verification Failed</h2>
        <p style={S.statusDesc}>{userProfile?.kycRejectionReason||'Documents could not be verified. Please resubmit with clear photos.'}</p>
        <button style={S.goldBtn} onClick={()=>{ setStep(1); }}>Resubmit KYC</button>
      </div>
    </div>
  );

  // ── MAIN FORM ─────────────────────────────────────────────────
  const STEPS = ['Personal','Identity','Address','Documents'];

  return (
    <div style={S.page}>
      {toast && <div style={S.toast}>{toast}</div>}

      <Header
        onBack={()=>step>1?setStep((step-1) as Step):navigate('/dashboard')}
        title="KYC Verification" />

      {/* Progress */}
      <div style={{ background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)',padding:'0 16px 20px' }}>
        <div style={{ display:'flex',alignItems:'center' }}>
          {STEPS.map((label,i)=>(
            <div key={label} style={{ flex:1,display:'flex',flexDirection:'column' as const,alignItems:'center' }}>
              <div style={{ display:'flex',alignItems:'center',width:'100%' }}>
                {i>0 && <div style={{ flex:1,height:2,background:step>i?'#f0b429':'#1e1e2a',transition:'background 0.3s' }} />}
                <div style={{ width:28,height:28,borderRadius:'50%',flexShrink:0,
                               display:'flex',alignItems:'center',justifyContent:'center',
                               fontWeight:700,fontSize:12,transition:'all 0.3s',
                               background:step>i+1?'#f0b429':step===i+1?'#1e1e2a':'#111118',
                               border:`2px solid ${step>=i+1?'#f0b429':'#1e1e2a'}`,
                               color:step>i+1?'#000':step===i+1?'#f0b429':'#555570' }}>
                  {step>i+1?'✓':i+1}
                </div>
                {i<STEPS.length-1 && <div style={{ flex:1,height:2,background:step>i+1?'#f0b429':'#1e1e2a',transition:'background 0.3s' }} />}
              </div>
              <span style={{ fontSize:9,marginTop:4,color:step===i+1?'#f0b429':'#555570',fontWeight:600 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:'16px 16px 100px' }}>

        {/* ── STEP 1: Personal ── */}
        {step===1 && (
          <div style={S.card}>
            <p style={S.cardTitle}>👤 Personal Information</p>
            <Field label="Full Name (as on Aadhaar)" error={errors.fullName}>
              <input style={S.input} value={fullName} placeholder="Your full legal name"
                onChange={e=>{setFullName(e.target.value);setErrors(x=>({...x,fullName:''}))}} />
            </Field>
            <Field label="Date of Birth" error={errors.dob}>
              <input style={S.input} type="date" value={dob}
                max={new Date(Date.now()-18*365.25*24*3600*1000).toISOString().split('T')[0]}
                onChange={e=>{setDob(e.target.value);setErrors(x=>({...x,dob:''}))}} />
            </Field>
            <Field label="Gender" error={errors.gender}>
              <div style={{ display:'flex',gap:10 }}>
                {['Male','Female','Other'].map(g=>(
                  <button key={g} onClick={()=>{setGender(g);setErrors(x=>({...x,gender:''}))}}
                    style={{ flex:1,padding:'12px 0',borderRadius:12,border:`2px solid ${gender===g?'#f0b429':'rgba(255,255,255,0.07)'}`,
                             background:gender===g?'rgba(240,180,41,0.1)':'#1e1e2a',
                             color:gender===g?'#f0b429':'#8888a8',fontWeight:700,fontSize:13,cursor:'pointer' }}>
                    {g}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* ── STEP 2: Identity ── */}
        {step===2 && (
          <div style={S.card}>
            <p style={S.cardTitle}>🪪 Identity Details</p>
            <Field label="Aadhaar Number (12 digits)" error={errors.aadhaar}>
              <input style={S.input} type="tel" maxLength={14}
                placeholder="XXXX XXXX XXXX"
                value={aadhaar.replace(/(\d{4})(?=\d)/g,'$1 ').trim()}
                onChange={e=>{setAadhaar(e.target.value.replace(/\s/g,'').replace(/\D/g,''));setErrors(x=>({...x,aadhaar:''}))}} />
              {aadhaar.replace(/\s/g,'').length===12 && <p style={S.hint}>✓ Valid format</p>}
            </Field>
            <Field label="PAN Card Number" error={errors.pan}>
              <input style={{ ...S.input,textTransform:'uppercase' as const,letterSpacing:3 }}
                maxLength={10} placeholder="ABCDE1234F"
                value={pan}
                onChange={e=>{setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));setErrors(x=>({...x,pan:''}))}} />
              {/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) && <p style={S.hint}>✓ Valid format</p>}
            </Field>
            <div style={{ background:'rgba(255,255,255,0.03)',borderRadius:12,padding:'12px 14px',marginTop:8 }}>
              <p style={{ color:'#555570',fontSize:12 }}>🔐 Your data is encrypted and never shared with third parties.</p>
            </div>
          </div>
        )}

        {/* ── STEP 3: Address ── */}
        {step===3 && (
          <div style={S.card}>
            <p style={S.cardTitle}>🏠 Address (as on Aadhaar)</p>
            <Field label="Full Address" error={errors.address}>
              <textarea style={{ ...S.input,height:80,resize:'none' as const }}
                placeholder="House no, Street, Area, Landmark"
                value={address}
                onChange={e=>{setAddress(e.target.value);setErrors(x=>({...x,address:''}))}} />
            </Field>
            <Field label="City" error={errors.city}>
              <input style={S.input} placeholder="City" value={city}
                onChange={e=>{setCity(e.target.value);setErrors(x=>({...x,city:''}))}} />
            </Field>
            <Field label="State" error="">
              <select style={{ ...S.input,cursor:'pointer' }} value={state} onChange={e=>setState(e.target.value)}>
                {STATES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="PIN Code" error={errors.pincode}>
              <input style={S.input} type="tel" maxLength={6} placeholder="6-digit PIN"
                value={pincode}
                onChange={e=>{setPincode(e.target.value.replace(/\D/g,''));setErrors(x=>({...x,pincode:''}))}} />
            </Field>
          </div>
        )}

        {/* ── STEP 4: Documents ── */}
        {step===4 && (
          <div style={S.card}>
            <p style={S.cardTitle}>📄 Upload Documents</p>
            <p style={{ color:'#555570',fontSize:12,marginBottom:16 }}>
              Clear photos only · Max 5MB each · JPG or PNG
            </p>
            <DocUpload label="Aadhaar Card — Front" icon="🪪" preview={prevAF}
              inputRef={refAF} error={errors.aadhaarF}
              onChange={f=>setFile(f,setAadhaarF,setPrevAF,'aadhaarF')}
              onRetake={()=>{setAadhaarF(null);setPrevAF('')}} />
            <DocUpload label="Aadhaar Card — Back" icon="🪪" preview={prevAB}
              inputRef={refAB} error={errors.aadhaarB}
              onChange={f=>setFile(f,setAadhaarB,setPrevAB,'aadhaarB')}
              onRetake={()=>{setAadhaarB(null);setPrevAB('')}} />
            <DocUpload label="PAN Card" icon="💳" preview={prevPan}
              inputRef={refPan} error={errors.panDoc}
              onChange={f=>setFile(f,setPanDoc,setPrevPan,'panDoc')}
              onRetake={()=>{setPanDoc(null);setPrevPan('')}} />
            <DocUpload label="Selfie Photo" icon="🤳" preview={prevSel}
              inputRef={refSel} error={errors.selfie} capture="user"
              hint="Look straight at camera, good lighting"
              onChange={f=>setFile(f,setSelfie,setPrevSel,'selfie')}
              onRetake={()=>{setSelfie(null);setPrevSel('')}} />
            <div style={{ background:'rgba(255,255,255,0.03)',borderRadius:12,padding:'12px 14px' }}>
              <p style={{ color:'#555570',fontSize:12 }}>🛡️ Encrypted with 256-bit SSL · Stored in insured vaults</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display:'flex',gap:10,marginTop:16 }}>
          {step>1 && (
            <button onClick={()=>setStep((step-1) as Step)}
              style={{ flex:0.5,padding:'15px',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',
                       borderRadius:14,color:'#f0f0f8',fontWeight:600,fontSize:15,cursor:'pointer' }}>
              ← Back
            </button>
          )}
          <button onClick={handleNext} disabled={loading}
            style={{ ...S.goldBtn,flex:1,opacity:loading?0.6:1 }}>
            {loading?'⏳ Uploading...':(step<4?'Continue →':'Submit KYC ✓')}
          </button>
        </div>
        <p style={{ textAlign:'center' as const,color:'#555570',fontSize:12,marginTop:10 }}>
          Step {step} of 4
        </p>
      </div>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────
function Header({ onBack, title }: { onBack:()=>void; title:string }) {
  return (
    <div style={{ display:'flex',alignItems:'center',gap:14,
                   padding:'52px 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)' }}>
      <button onClick={onBack}
        style={{ background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',
                  borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',
                  color:'#f0f0f8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
        ←
      </button>
      <h1 style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:20,color:'#f0f0f8' }}>
        {title}
      </h1>
    </div>
  );
}

function Field({ label, error, children }: { label:string; error:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:16 }}>
      <p style={{ color:'#555570',fontSize:10,fontWeight:700,letterSpacing:0.8,
                   marginBottom:8,textTransform:'uppercase' as const }}>{label}</p>
      {children}
      {error && <p style={{ color:'#ef4444',fontSize:12,marginTop:6 }}>⚠️ {error}</p>}
    </div>
  );
}

function DocUpload({ label, icon, preview, error, inputRef, onChange, onRetake, capture, hint }:
  { label:string;icon:string;preview:string;error:string;inputRef:React.RefObject<HTMLInputElement>;
    onChange:(f:File)=>void;onRetake:()=>void;capture?:'user'|'environment';hint?:string }) {
  return (
    <div style={{ marginBottom:18 }}>
      <p style={{ color:'#555570',fontSize:10,fontWeight:700,letterSpacing:0.8,
                   marginBottom:6,textTransform:'uppercase' as const }}>{label}</p>
      {hint && <p style={{ color:'#444458',fontSize:11,marginBottom:8 }}>{hint}</p>}
      <input ref={inputRef} type="file" accept="image/*" capture={capture}
        style={{ display:'none' }}
        onChange={e=>{ const f=e.target.files?.[0]; if(f) onChange(f); }} />
      {!preview ? (
        <button onClick={()=>inputRef.current?.click()}
          style={{ width:'100%',background:'rgba(240,180,41,0.05)',
                    border:'2px dashed rgba(240,180,41,0.3)',borderRadius:14,
                    padding:'20px 0',display:'flex',flexDirection:'column' as const,
                    alignItems:'center',gap:8,cursor:'pointer' }}>
          <span style={{ fontSize:32 }}>{icon}</span>
          <span style={{ color:'#f0b429',fontWeight:700,fontSize:13 }}>Tap to upload</span>
          <span style={{ color:'#555570',fontSize:11 }}>JPG · PNG · Max 5MB</span>
        </button>
      ) : (
        <div style={{ position:'relative' }}>
          <img src={preview} alt={label}
            style={{ width:'100%',height:140,objectFit:'cover' as const,
                      borderRadius:14,border:'2px solid #f0b429' }} />
          <div style={{ position:'absolute',top:0,left:0,right:0,bottom:0,
                          borderRadius:14,background:'rgba(0,0,0,0.4)',
                          display:'flex',alignItems:'center',justifyContent:'center' }}>
            <button onClick={onRetake}
              style={{ background:'#fff',border:'none',borderRadius:10,
                        padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer' }}>
              🔄 Retake
            </button>
          </div>
          <div style={{ position:'absolute',top:8,right:8,background:'#10b981',
                          borderRadius:'50%',width:24,height:24,display:'flex',
                          alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12 }}>✓</div>
        </div>
      )}
      {error && <p style={{ color:'#ef4444',fontSize:12,marginTop:6 }}>⚠️ {error}</p>}
    </div>
  );
}

const S: Record<string,React.CSSProperties> = {
  page:       { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  card:       { background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',borderRadius:18,padding:20 },
  cardTitle:  { fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:17,color:'#f0f0f8',marginBottom:20 },
  input:      { width:'100%',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'13px 14px',fontSize:15,outline:'none',color:'#f0f0f8',fontFamily:'inherit',boxSizing:'border-box' as const },
  hint:       { color:'#10b981',fontSize:12,marginTop:6,fontWeight:600 },
  goldBtn:    { width:'100%',padding:'15px 0',background:'linear-gradient(135deg,#f0b429,#ff8c00)',border:'none',borderRadius:14,color:'#000',fontWeight:700,fontSize:16,cursor:'pointer',fontFamily:'inherit' },
  toast:      { position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.14)',borderRadius:14,padding:'12px 20px',fontSize:14,fontWeight:600,color:'#f0f0f8',zIndex:999 },
  centred:    { display:'flex',flexDirection:'column' as const,alignItems:'center',padding:'60px 24px',textAlign:'center' as const },
  statusIcon: (c:string)=>({ width:72,height:72,borderRadius:'50%',background:`${c}15`,border:`2px solid ${c}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,marginBottom:16 }),
  statusTitle:{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:'#f0f0f8',marginBottom:10 },
  statusDesc: { color:'#8888a8',fontSize:14,lineHeight:1.6,marginBottom:24,maxWidth:320 },
  perksBox:   { background:'rgba(16,185,129,0.06)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:16,padding:'16px',width:'100%',marginBottom:24,textAlign:'left' as const },
};
