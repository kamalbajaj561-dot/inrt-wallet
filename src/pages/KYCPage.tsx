import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import '../styles/theme.css';

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu & Kashmir'];

type Step = 1|2|3|4;

export default function KYCPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step,setStep] = useState<Step>(1);
  const [loading,setLoading] = useState(false);
  const [toast,setToast] = useState('');
  const [errs,setErrs] = useState<Record<string,string>>({});

  const [fullName,setFullName] = useState(userProfile?.name||'');
  const [dob,setDob] = useState('');
  const [gender,setGender] = useState('');
  const [aadhaar,setAadhaar] = useState('');
  const [pan,setPan] = useState('');
  const [address,setAddress] = useState('');
  const [city,setCity] = useState('');
  const [state,setState] = useState('Maharashtra');
  const [pincode,setPincode] = useState('');

  const [files,setFiles] = useState<Record<string,File|null>>({af:null,ab:null,pan:null,selfie:null});
  const [prevs,setPrevs] = useState<Record<string,string>>({});

  const refs = {af:useRef<HTMLInputElement>(null),ab:useRef<HTMLInputElement>(null),pan:useRef<HTMLInputElement>(null),selfie:useRef<HTMLInputElement>(null)};

  const showToast=(m:string)=>{setToast(m);setTimeout(()=>setToast(''),3000);};
  const kyc = userProfile?.kycStatus||'not_started';

  const validate = (s:Step) => {
    const e:Record<string,string> = {};
    if(s===1){if(!fullName.trim()||fullName.length<3)e.fullName='Min 3 chars';if(!dob)e.dob='Required';else{const age=new Date().getFullYear()-new Date(dob).getFullYear();if(age<18)e.dob='Must be 18+';}if(!gender)e.gender='Select gender';}
    if(s===2){if(!aadhaar||aadhaar.replace(/\s/g,'').length!==12)e.aadhaar='12 digits required';if(!pan||!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))e.pan='Format: ABCDE1234F';}
    if(s===3){if(!address.trim()||address.length<10)e.address='Min 10 chars';if(!city.trim())e.city='Required';if(!pincode||!/^\d{6}$/.test(pincode))e.pincode='6 digits';}
    if(s===4){if(!files.af)e.af='Required';if(!files.ab)e.ab='Required';if(!files.pan)e.pan='Required';if(!files.selfie)e.selfie='Required';}
    setErrs(e); return Object.keys(e).length===0;
  };

  const handleNext = () => { if(!validate(step))return; if(step<4)setStep(s=>(s+1) as Step); else handleSubmit(); };

  const handleSubmit = async () => {
    if(!user)return; setLoading(true);
    try {
      showToast('Uploading documents…');
      const upload = async (file:File,path:string) => {
        const s = await uploadBytes(ref(storage,path),file);
        return getDownloadURL(s.ref);
      };
      const base = `kyc/${user.uid}`;
      const [urlAF,urlAB,urlPan,urlSelfie] = await Promise.all([
        upload(files.af!,`${base}/aadhaar_front`),upload(files.ab!,`${base}/aadhaar_back`),
        upload(files.pan!,`${base}/pan_card`),upload(files.selfie!,`${base}/selfie`),
      ]);
      await setDoc(doc(db,'kyc',user.uid),{
        userId:user.uid,status:'pending',step:4,
        personalInfo:{fullName:fullName.trim(),dob,gender},
        identity:{aadhaarLast4:aadhaar.slice(-4),panMasked:pan.slice(0,2)+'XXX'+pan.slice(5)},
        address:{address:address.trim(),city:city.trim(),state,pincode},
        documents:{aadhaarFront:urlAF,aadhaarBack:urlAB,panCard:urlPan,selfie:urlSelfie},
        submittedAt:serverTimestamp(),updatedAt:serverTimestamp(),
      });
      await updateDoc(doc(db,'users',user.uid),{kycStatus:'pending',kycSubmittedAt:serverTimestamp(),updatedAt:serverTimestamp()});
      await refreshProfile(); showToast('✅ KYC submitted!');
    } catch(e:any){showToast(e.message||'Failed');}
    setLoading(false);
  };

  const setFile = (key:string,file:File) => {
    if(file.size>5*1024*1024){setErrs(e=>({...e,[key]:'Max 5MB'}));return;}
    setFiles(f=>({...f,[key]:file}));
    setPrevs(p=>({...p,[key]:URL.createObjectURL(file)}));
  };

  if(kyc==='verified') return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)',display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 24px',textAlign:'center'}}>
      <div style={{width:72,height:72,borderRadius:'50%',background:'rgba(0,214,143,0.1)',border:'2px solid var(--green)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,marginBottom:16}}>✅</div>
      <h2 style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:22,color:'var(--t1)',marginBottom:8}}>KYC Verified!</h2>
      <p style={{color:'var(--t2)',fontSize:14,marginBottom:24}}>Your identity is verified. Full access unlocked.</p>
      <button className="btn-primary" onClick={()=>navigate('/dashboard')}>Back to Home</button>
    </div>
  );
  if(kyc==='pending') return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)',display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 24px',textAlign:'center'}}>
      <div style={{width:72,height:72,borderRadius:'50%',background:'var(--teal-dim)',border:'2px solid var(--teal)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,marginBottom:16}}>⏳</div>
      <h2 style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:22,color:'var(--t1)',marginBottom:8}}>Under Review</h2>
      <p style={{color:'var(--t2)',fontSize:14,marginBottom:24}}>Documents submitted. Verification takes 24-48 hours.</p>
      <button className="btn-primary" onClick={()=>navigate('/dashboard')}>Back to Home</button>
    </div>
  );

  const STEP_LABELS = ['Personal','Identity','Address','Documents'];
  const F = ({label,err,children}:{label:string;err?:string;children:React.ReactNode}) => (
    <div style={{marginBottom:16}}>
      <p className="s-label">{label}</p>
      {children}
      {err&&<p className="err-box" style={{marginTop:6}}>{err}</p>}
    </div>
  );

  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)'}}>
      {toast&&<div className="toast">{toast}</div>}
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
          <button onClick={()=>step>1?setStep((step-1) as Step):navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">KYC Verification</h1>
        </div>
        <div style={{display:'flex',alignItems:'center'}}>
          {STEP_LABELS.map((l,i)=>(
            <div key={l} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',width:'100%'}}>
                {i>0&&<div style={{flex:1,height:2,background:step>i?'var(--teal)':'var(--b1)',transition:'background 0.3s'}}/>}
                <div style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12,flexShrink:0,transition:'all 0.3s',background:step>i+1?'var(--teal)':step===i+1?'var(--bg-elevated)':'var(--bg)',border:`2px solid ${step>=i+1?'var(--teal)':'var(--b1)'}`,color:step>i+1?'#000':step===i+1?'var(--teal)':'var(--t3)'}}>
                  {step>i+1?'✓':i+1}
                </div>
                {i<STEP_LABELS.length-1&&<div style={{flex:1,height:2,background:step>i+1?'var(--teal)':'var(--b1)',transition:'background 0.3s'}}/>}
              </div>
              <span style={{fontSize:9,marginTop:4,color:step===i+1?'var(--teal)':'var(--t3)',fontWeight:600}}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{padding:'16px 16px 100px'}}>
        {step===1&&(
          <div className="card">
            <p className="s-title">👤 Personal Info</p>
            <F label="FULL NAME (AS ON AADHAAR)" err={errs.fullName}>
              <input className="inp" placeholder="Your full legal name" value={fullName} onChange={e=>{setFullName(e.target.value);setErrs(x=>({...x,fullName:''}));}}/>
            </F>
            <F label="DATE OF BIRTH" err={errs.dob}>
              <input className="inp" type="date" value={dob} max={new Date(Date.now()-18*365.25*24*3600*1000).toISOString().split('T')[0]} onChange={e=>{setDob(e.target.value);setErrs(x=>({...x,dob:''}));}}/>
            </F>
            <F label="GENDER" err={errs.gender}>
              <div style={{display:'flex',gap:10}}>
                {['Male','Female','Other'].map(g=>(
                  <button key={g} onClick={()=>{setGender(g);setErrs(x=>({...x,gender:''}));}}
                    style={{flex:1,padding:'12px 0',borderRadius:'var(--r1)',border:`2px solid ${gender===g?'var(--teal)':'var(--b1)'}`,background:gender===g?'var(--teal-dim)':'var(--bg-elevated)',color:gender===g?'var(--teal)':'var(--t2)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                    {g}
                  </button>
                ))}
              </div>
            </F>
          </div>
        )}
        {step===2&&(
          <div className="card">
            <p className="s-title">🪪 Identity Details</p>
            <F label="AADHAAR NUMBER" err={errs.aadhaar}>
              <input className="inp" type="tel" maxLength={14} placeholder="XXXX XXXX XXXX"
                value={aadhaar.replace(/(\d{4})(?=\d)/g,'$1 ').trim()}
                onChange={e=>{setAadhaar(e.target.value.replace(/\s/g,'').replace(/\D/g,''));setErrs(x=>({...x,aadhaar:''}));}}/>
              {aadhaar.replace(/\s/g,'').length===12&&<p style={{color:'var(--green)',fontSize:12,marginTop:4}}>✓ Valid format</p>}
            </F>
            <F label="PAN NUMBER" err={errs.pan}>
              <input className="inp" maxLength={10} placeholder="ABCDE1234F"
                style={{textTransform:'uppercase',letterSpacing:3}}
                value={pan} onChange={e=>{setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));setErrs(x=>({...x,pan:''}));}}/>
              {/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)&&<p style={{color:'var(--green)',fontSize:12,marginTop:4}}>✓ Valid format</p>}
            </F>
          </div>
        )}
        {step===3&&(
          <div className="card">
            <p className="s-title">🏠 Address</p>
            <F label="FULL ADDRESS" err={errs.address}>
              <textarea className="inp" style={{height:80,resize:'none'}} placeholder="House no, Street, Area, Landmark"
                value={address} onChange={e=>{setAddress(e.target.value);setErrs(x=>({...x,address:''}));}}/>
            </F>
            <F label="CITY" err={errs.city}>
              <input className="inp" placeholder="City" value={city} onChange={e=>{setCity(e.target.value);setErrs(x=>({...x,city:''}));}}/>
            </F>
            <F label="STATE" err="">
              <select className="inp" value={state} onChange={e=>setState(e.target.value)}>
                {STATES.map(s=><option key={s}>{s}</option>)}
              </select>
            </F>
            <F label="PIN CODE" err={errs.pincode}>
              <input className="inp" type="tel" maxLength={6} placeholder="6-digit PIN"
                value={pincode} onChange={e=>{setPincode(e.target.value.replace(/\D/g,''));setErrs(x=>({...x,pincode:''}));}}/>
            </F>
          </div>
        )}
        {step===4&&(
          <div className="card">
            <p className="s-title">📄 Documents</p>
            <p style={{color:'var(--t2)',fontSize:12,marginBottom:16}}>JPG/PNG · Max 5MB each · Clear photos only</p>
            {[
              {key:'af',label:'AADHAAR FRONT',icon:'🪪'},
              {key:'ab',label:'AADHAAR BACK', icon:'🪪'},
              {key:'pan',label:'PAN CARD',    icon:'💳'},
              {key:'selfie',label:'SELFIE',   icon:'🤳',capture:'user'},
            ].map(d=>(
              <div key={d.key} style={{marginBottom:20}}>
                <p className="s-label">{d.label}</p>
                <input ref={refs[d.key as keyof typeof refs]} type="file" accept="image/*"
                  capture={d.capture as any} style={{display:'none'}}
                  onChange={e=>{const f=e.target.files?.[0];if(f)setFile(d.key,f);}}/>
                {!prevs[d.key]?(
                  <button onClick={()=>refs[d.key as keyof typeof refs].current?.click()}
                    style={{width:'100%',background:'rgba(0,229,204,0.04)',border:'2px dashed rgba(0,229,204,0.25)',borderRadius:'var(--r2)',padding:'20px 0',display:'flex',flexDirection:'column',alignItems:'center',gap:8,cursor:'pointer'}}>
                    <span style={{fontSize:32}}>{d.icon}</span>
                    <span style={{color:'var(--teal)',fontWeight:700,fontSize:13}}>Tap to upload</span>
                  </button>
                ):(
                  <div style={{position:'relative'}}>
                    <img src={prevs[d.key]} style={{width:'100%',height:130,objectFit:'cover',borderRadius:'var(--r2)',border:'2px solid var(--teal)'}}/>
                    <button onClick={()=>{setFiles(f=>({...f,[d.key]:null}));setPrevs(p=>({...p,[d.key]:''}));}}
                      style={{position:'absolute',top:8,right:8,background:'var(--bg)',border:'1px solid var(--b2)',borderRadius:'var(--r1)',padding:'4px 10px',color:'var(--t2)',fontSize:11,cursor:'pointer'}}>
                      Retake
                    </button>
                    <div style={{position:'absolute',top:8,left:8,background:'var(--green)',borderRadius:'50%',width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',color:'#000',fontSize:11}}>✓</div>
                  </div>
                )}
                {errs[d.key]&&<p className="err-box" style={{marginTop:6}}>{errs[d.key]}</p>}
              </div>
            ))}
          </div>
        )}

        <div style={{display:'flex',gap:10,marginTop:16}}>
          {step>1&&<button onClick={()=>setStep((step-1) as Step)} className="btn-outline" style={{flex:0.5}}>← Back</button>}
          <button onClick={handleNext} disabled={loading} className="btn-primary" style={{flex:1,opacity:loading?0.6:1}}>
            {loading?'⏳ Uploading…':step<4?'Continue →':'Submit KYC ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}
