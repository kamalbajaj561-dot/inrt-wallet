import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, storage, auth } from '../lib/firebase';
import BottomNav from '../components/BottomNav';
import '../styles/theme.css';

function Toggle({val,onChange}:{val:boolean;onChange:(v:boolean)=>void}){
  return(
    <button className="toggle" onClick={()=>onChange(!val)}
      style={{background:val?'var(--teal)':'var(--bg-elevated)'}}>
      <div className="toggle-thumb" style={{left:val?23:3}}/>
    </button>
  );
}

export default function ProfilePage() {
  const { user, userProfile, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [tab,setTab] = useState<'profile'|'security'|'prefs'>('profile');
  const [editing,setEditing] = useState(false);
  const [loading,setLoading] = useState(false);
  const [toast,setToast] = useState('');
  const [name,setName] = useState(userProfile?.name||'');
  const [oldPw,setOldPw] = useState('');
  const [newPw,setNewPw] = useState('');
  const [newPw2,setNewPw2] = useState('');
  const [notifPush,setNotifPush] = useState(userProfile?.notifPush??true);
  const [notifEmail,setNotifEmail] = useState(userProfile?.notifEmail??true);
  const avatarRef = useRef<HTMLInputElement>(null);
  const showToast=(m:string)=>{setToast(m);setTimeout(()=>setToast(''),2500);};

  const saveProfile = async () => {
    if (!user||!name.trim()) return;
    setLoading(true);
    try {
      await updateProfile(user,{displayName:name.trim()});
      await updateDoc(doc(db,'users',user.uid),{name:name.trim(),updatedAt:serverTimestamp()});
      await refreshProfile(); setEditing(false); showToast('Profile updated!');
    } catch(e:any){showToast(e.message||'Failed');}
    setLoading(false);
  };

  const changePass = async () => {
    if (!user?.email||newPw.length<6||newPw!==newPw2) return showToast('Check your inputs');
    setLoading(true);
    try {
      await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,oldPw));
      await updatePassword(user,newPw);
      setOldPw('');setNewPw('');setNewPw2('');
      showToast('Password changed!');
    } catch(e:any){
      if((e.code||'').includes('wrong-password')) showToast('Current password wrong');
      else showToast(e.message||'Failed');
    }
    setLoading(false);
  };

  const savePrefs = async () => {
    if (!user) return;
    setLoading(true);
    await updateDoc(doc(db,'users',user.uid),{notifPush,notifEmail,updatedAt:serverTimestamp()});
    await refreshProfile(); showToast('Saved!'); setLoading(false);
  };

  const handleAvatar = async (file:File) => {
    if (!user||file.size>5*1024*1024) return showToast('Max 5MB');
    setLoading(true);
    try {
      const snap = await uploadBytes(ref(storage,`profiles/${user.uid}/avatar`),file);
      const url  = await getDownloadURL(snap.ref);
      await updateProfile(user,{photoURL:url});
      await updateDoc(doc(db,'users',user.uid),{avatar:url,updatedAt:serverTimestamp()});
      await refreshProfile(); showToast('Photo updated!');
    } catch(e:any){showToast(e.message||'Upload failed');}
    setLoading(false);
  };

  const initials=(userProfile?.name||'U').slice(0,2).toUpperCase();
  const kyc=userProfile?.kycStatus||'not_started';

  return (
    <div className="page">
      {toast&&<div className="toast">{toast}</div>}
      <input ref={avatarRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e=>{const f=e.target.files?.[0];if(f)handleAvatar(f);}}/>

      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 24px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20}}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Profile</h1>
          {tab==='profile'&&!editing&&<button onClick={()=>setEditing(true)} style={{marginLeft:'auto',padding:'6px 14px',background:'var(--teal-dim)',border:'1px solid rgba(0,229,204,0.3)',borderRadius:'var(--r1)',color:'var(--teal)',fontWeight:600,fontSize:13,cursor:'pointer'}}>Edit</button>}
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
          <div style={{position:'relative'}}>
            <div style={{width:76,height:76,borderRadius:'50%',border:'3px solid rgba(0,229,204,0.3)',overflow:'hidden',background:'var(--g-teal)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              {userProfile?.avatar?<img src={userProfile.avatar} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                :<span style={{fontFamily:'var(--f-display)',fontWeight:900,fontSize:26,color:'#000'}}>{initials}</span>}
            </div>
            <button onClick={()=>avatarRef.current?.click()} style={{position:'absolute',bottom:0,right:0,width:26,height:26,borderRadius:'50%',background:'var(--teal)',border:'2px solid var(--bg)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:12}}>📷</button>
          </div>
          <p style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:18,color:'var(--t1)'}}>{userProfile?.name}</p>
          <p style={{color:'var(--t2)',fontSize:13}}>+91 {userProfile?.phone}</p>
          {kyc==='verified'?<span className="badge-green">✓ KYC Verified</span>:kyc==='pending'?<span className="badge-teal">⏳ KYC Pending</span>:<button onClick={()=>navigate('/kyc')} className="badge-red" style={{border:'none',cursor:'pointer'}}>⚠️ Complete KYC</button>}
        </div>
      </div>

      <div style={{display:'flex',gap:6,padding:'10px 16px 0'}}>
        {(['profile','security','prefs'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{flex:1,padding:'9px 0',borderRadius:10,fontSize:11,fontWeight:700,cursor:'pointer',
                     background:tab===t?'var(--teal)':'var(--bg-card)',border:`1px solid ${tab===t?'var(--teal)':'var(--b1)'}`,
                     color:tab===t?'#000':'var(--t3)'}}>
            {t==='profile'?'👤 Profile':t==='security'?'🔐 Security':'⚙️ Prefs'}
          </button>
        ))}
      </div>

      <div style={{padding:'16px 16px 0'}}>
        {tab==='profile'&&(
          <div className="card">
            {[{l:'Full Name',v:name,s:setName,e:true},{l:'Phone',v:`+91 ${userProfile?.phone||''}`,s:()=>{},e:false},{l:'Email',v:userProfile?.email||'',s:()=>{},e:false}].map(f=>(
              <div key={f.l} style={{marginBottom:18}}>
                <p className="s-label">{f.l}</p>
                {editing&&f.e
                  ?<input className="inp" value={f.v} onChange={e=>f.s(e.target.value)}/>
                  :<p style={{color:'var(--t1)',fontSize:15,padding:'4px 0'}}>{f.v}</p>}
              </div>
            ))}
            {editing&&(
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setEditing(false)} className="btn-outline" style={{flex:1}}>Cancel</button>
                <button onClick={saveProfile} className="btn-primary" style={{flex:2,opacity:loading?0.6:1}} disabled={loading}>{loading?'Saving…':'Save'}</button>
              </div>
            )}
          </div>
        )}
        {tab==='security'&&(
          <div className="card">
            <p className="s-title">Change Password</p>
            {[{l:'CURRENT',v:oldPw,s:setOldPw},{l:'NEW',v:newPw,s:setNewPw},{l:'CONFIRM',v:newPw2,s:setNewPw2}].map(f=>(
              <div key={f.l} style={{marginBottom:14}}>
                <p className="s-label">{f.l} PASSWORD</p>
                <input className="inp" type="password" value={f.v} onChange={e=>f.s(e.target.value)}/>
              </div>
            ))}
            <button className="btn-primary" onClick={changePass} disabled={loading} style={{opacity:loading?0.6:1}}>{loading?'Updating…':'Update Password'}</button>
          </div>
        )}
        {tab==='prefs'&&(
          <>
            <div className="card" style={{marginBottom:14}}>
              {[{l:'Push Notifications',d:'Transaction alerts',v:notifPush,s:setNotifPush},{l:'Email Updates',d:'Receipts & news',v:notifEmail,s:setNotifEmail}].map(item=>(
                <div key={item.l} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 0',borderBottom:'1px solid var(--b1)'}}>
                  <div style={{flex:1}}>
                    <p style={{color:'var(--t1)',fontWeight:600,fontSize:14}}>{item.l}</p>
                    <p style={{color:'var(--t3)',fontSize:12,marginTop:2}}>{item.d}</p>
                  </div>
                  <Toggle val={item.v} onChange={item.s}/>
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={savePrefs} disabled={loading} style={{marginBottom:14,opacity:loading?0.6:1}}>{loading?'Saving…':'Save Preferences'}</button>
            <button onClick={async()=>{await logout();navigate('/login');}}
              style={{width:'100%',padding:'14px',background:'rgba(255,77,106,0.06)',border:'1px solid rgba(255,77,106,0.2)',borderRadius:'var(--r2)',color:'var(--red)',fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'var(--f-body)'}}>
              🚪 Logout
            </button>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
