import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, storage, auth } from '../lib/firebase';

export default function ProfilePage() {
  const { user, userProfile, refreshProfile, logout } = useAuth();
  const navigate  = useNavigate();

  const [tab,         setTab]        = useState<'profile'|'security'|'preferences'>('profile');
  const [editing,     setEditing]    = useState(false);
  const [loading,     setLoading]    = useState(false);
  const [toast,       setToast]      = useState('');
  const [toastType,   setToastType]  = useState<'ok'|'err'>('ok');

  // Profile fields
  const [name,        setName]       = useState(userProfile?.name || '');
  const [email,       setEmail]      = useState(userProfile?.email || '');
  const [avatarURL,   setAvatarURL]  = useState(userProfile?.avatar || '');
  const avatarRef     = useRef<HTMLInputElement>(null);

  // Security fields
  const [oldPass,     setOldPass]    = useState('');
  const [newPass,     setNewPass]    = useState('');
  const [newPass2,    setNewPass2]   = useState('');

  // Preferences
  const [darkMode]    = useState(true);
  const [notifPush,   setNotifPush]  = useState(userProfile?.notifPush ?? true);
  const [notifEmail,  setNotifEmail] = useState(userProfile?.notifEmail ?? true);
  const [twoFA,       setTwoFA]      = useState(userProfile?.twoFA ?? false);

  const showToast = (msg: string, type: 'ok'|'err' = 'ok') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(''), 3000);
  };

  const handleAvatarChange = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) { showToast('File too large (max 5MB)', 'err'); return; }
    setLoading(true);
    try {
      const storageRef = ref(storage, `profiles/${user.uid}/avatar`);
      const snap       = await uploadBytes(storageRef, file);
      const url        = await getDownloadURL(snap.ref);
      await updateProfile(user, { photoURL: url });
      await updateDoc(doc(db, 'users', user.uid), { avatar: url, updatedAt: serverTimestamp() });
      setAvatarURL(url);
      await refreshProfile();
      showToast('Profile photo updated!');
    } catch (e: any) { showToast(e.message || 'Upload failed', 'err'); }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!name.trim()) { showToast('Name cannot be empty', 'err'); return; }
    setLoading(true);
    try {
      await updateProfile(user, { displayName: name.trim() });
      await updateDoc(doc(db, 'users', user.uid), {
        name: name.trim(), updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      setEditing(false);
      showToast('Profile updated!');
    } catch (e: any) { showToast(e.message || 'Update failed', 'err'); }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    if (newPass.length < 6) { showToast('New password min 6 characters', 'err'); return; }
    if (newPass !== newPass2) { showToast('Passwords do not match', 'err'); return; }
    setLoading(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, oldPass);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPass);
      setOldPass(''); setNewPass(''); setNewPass2('');
      showToast('Password changed successfully!');
    } catch (e: any) {
      const c = e.code || '';
      if (c.includes('wrong-password')) showToast('Current password is wrong', 'err');
      else showToast(e.message || 'Failed to change password', 'err');
    }
    setLoading(false);
  };

  const handleSavePreferences = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notifPush, notifEmail, twoFA, updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      showToast('Preferences saved!');
    } catch (e: any) { showToast(e.message || 'Save failed', 'err'); }
    setLoading(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const phone    = userProfile?.phone || '';
  const kycStatus= userProfile?.kycStatus || 'not_started';
  const balance  = userProfile?.balance || 0;
  const points   = userProfile?.rewardPoints || 0;
  const initials = (name || 'U').slice(0, 2).toUpperCase();

  return (
    <div style={S.page}>
      {toast && (
        <div style={{ ...S.toast,
          background: toastType==='ok'?'rgba(16,185,129,0.15)':'rgba(239,68,68,0.15)',
          borderColor: toastType==='ok'?'#10b981':'#ef4444',
          color:       toastType==='ok'?'#10b981':'#ef4444' }}>
          {toastType==='ok'?'✅':'⚠️'} {toast}
        </div>
      )}

      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate('/dashboard')} style={S.back}>←</button>
        <h1 style={S.title}>Profile</h1>
        {!editing && tab==='profile' && (
          <button onClick={() => setEditing(true)} style={S.editBtn}>Edit</button>
        )}
      </div>

      {/* Avatar + name */}
      <div style={{ background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)',padding:'0 16px 24px',
                     display:'flex',flexDirection:'column' as const,alignItems:'center' }}>
        <input ref={avatarRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarChange(f); }} />
        <div style={{ position:'relative',marginBottom:12 }}>
          <div style={{ width:80,height:80,borderRadius:'50%',
                         background: avatarURL?'transparent':'linear-gradient(135deg,#f0b429,#ff8c00)',
                         display:'flex',alignItems:'center',justifyContent:'center',
                         border:'3px solid rgba(240,180,41,0.3)',overflow:'hidden' }}>
            {avatarURL
              ? <img src={avatarURL} alt="avatar" style={{ width:'100%',height:'100%',objectFit:'cover' as const }} />
              : <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:28,color:'#000' }}>{initials}</span>}
          </div>
          <button onClick={() => avatarRef.current?.click()}
            style={{ position:'absolute',bottom:0,right:0,width:26,height:26,borderRadius:'50%',
                      background:'#f0b429',border:'2px solid #0a0a0f',
                      display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:12 }}>
            📷
          </button>
        </div>
        <p style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8' }}>{name}</p>
        <p style={{ color:'#555570',fontSize:13,marginTop:2 }}>+91 {phone}</p>

        {/* KYC badge */}
        <div style={{ marginTop:8 }}>
          {kycStatus==='verified'
            ? <span style={S.kycBadge('#10b981')}>✓ KYC Verified</span>
            : kycStatus==='pending'
            ? <span style={S.kycBadge('#f0b429')}>⏳ KYC Pending</span>
            : <button onClick={() => navigate('/kyc')}
                style={{ ...S.kycBadge('#ef4444'), cursor:'pointer',border:'none' }}>
                ⚠️ Complete KYC
              </button>}
        </div>

        {/* Stats */}
        <div style={{ display:'flex',gap:16,marginTop:16 }}>
          {[
            { label:'Balance',val:`₹${balance.toLocaleString('en-IN')}`,color:'#10b981' },
            { label:'Points', val:points.toLocaleString(),               color:'#f0b429' },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center' }}>
              <p style={{ color:s.color,fontWeight:800,fontSize:18 }}>{s.val}</p>
              <p style={{ color:'#555570',fontSize:11,marginTop:2 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {(['profile','security','preferences'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...S.tab, ...(tab===t ? S.tabOn : {}) }}>
            {t==='profile'?'👤 Profile':t==='security'?'🔐 Security':'⚙️ Settings'}
          </button>
        ))}
      </div>

      <div style={{ padding:'16px 16px 90px' }}>

        {/* ── PROFILE TAB ── */}
        {tab==='profile' && (
          <div style={S.card}>
            {[
              { label:'Full Name',   val:name,              setter:setName,   type:'text',   editable:true },
              { label:'Phone',       val:`+91 ${phone}`,    setter:()=>{},    type:'tel',    editable:false },
              { label:'Email',       val:email,             setter:setEmail,  type:'email',  editable:false },
              { label:'Member Since',val: userProfile?.createdAt
                                          ? new Date(userProfile.createdAt.toDate?.()|| userProfile.createdAt).toLocaleDateString('en-IN',{month:'long',year:'numeric'})
                                          : '—',
                setter:()=>{}, type:'text', editable:false },
            ].map(field => (
              <div key={field.label} style={{ marginBottom:20 }}>
                <p style={S.fieldLabel}>{field.label.toUpperCase()}</p>
                {editing && field.editable ? (
                  <input
                    style={S.input} type={field.type} value={field.val}
                    onChange={e => field.setter(e.target.value)} />
                ) : (
                  <p style={{ color:'#f0f0f8',fontSize:15,fontWeight:500,padding:'4px 0' }}>{field.val}</p>
                )}
              </div>
            ))}

            {editing && (
              <div style={{ display:'flex',gap:10,marginTop:8 }}>
                <button onClick={() => setEditing(false)}
                  style={{ flex:1,padding:'13px',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,color:'#f0f0f8',fontWeight:600,cursor:'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSaveProfile} disabled={loading}
                  style={{ flex:2,padding:'13px',background:'linear-gradient(135deg,#f0b429,#ff8c00)',border:'none',borderRadius:12,color:'#000',fontWeight:700,cursor:'pointer',opacity:loading?0.6:1 }}>
                  {loading?'Saving...':'Save Changes'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SECURITY TAB ── */}
        {tab==='security' && (
          <>
            <div style={{ ...S.card,marginBottom:14 }}>
              <p style={S.sectionTitle}>Change Password</p>
              <p style={S.fieldLabel}>CURRENT PASSWORD</p>
              <input style={{ ...S.input,marginBottom:14 }} type="password" placeholder="Current password"
                value={oldPass} onChange={e => setOldPass(e.target.value)} />
              <p style={S.fieldLabel}>NEW PASSWORD</p>
              <input style={{ ...S.input,marginBottom:14 }} type="password" placeholder="Minimum 6 characters"
                value={newPass} onChange={e => setNewPass(e.target.value)} />
              <p style={S.fieldLabel}>CONFIRM NEW PASSWORD</p>
              <input style={{ ...S.input,marginBottom:16 }} type="password" placeholder="Re-enter new password"
                value={newPass2} onChange={e => setNewPass2(e.target.value)} />
              <button onClick={handleChangePassword} disabled={loading}
                style={{ width:'100%',padding:'13px',background:'linear-gradient(135deg,#f0b429,#ff8c00)',border:'none',borderRadius:12,color:'#000',fontWeight:700,fontSize:15,cursor:'pointer',opacity:loading?0.6:1 }}>
                {loading?'Updating...':'Update Password'}
              </button>
            </div>

            <div style={S.card}>
              <p style={S.sectionTitle}>Security Info</p>
              {[
                { icon:'🔐', title:'Two-Factor Auth',  desc:'Extra security for your account',   status:twoFA?'Enabled':'Disabled', color:twoFA?'#10b981':'#ef4444' },
                { icon:'📱', title:'Login Alerts',     desc:'Get notified on new logins',        status:'Active', color:'#10b981' },
                { icon:'🕐', title:'Session Timeout',  desc:'Auto-logout after 30 min inactivity',status:'30 min', color:'#f0b429' },
              ].map(item => (
                <div key={item.title} style={{ display:'flex',alignItems:'center',gap:12,
                                               padding:'12px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize:22,flexShrink:0 }}>{item.icon}</span>
                  <div style={{ flex:1 }}>
                    <p style={{ color:'#f0f0f8',fontWeight:600,fontSize:14 }}>{item.title}</p>
                    <p style={{ color:'#555570',fontSize:12,marginTop:2 }}>{item.desc}</p>
                  </div>
                  <span style={{ color:item.color,fontSize:11,fontWeight:700 }}>{item.status}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── PREFERENCES TAB ── */}
        {tab==='preferences' && (
          <>
            <div style={{ ...S.card,marginBottom:14 }}>
              <p style={S.sectionTitle}>Notifications</p>
              {[
                { label:'Push Notifications', desc:'Alerts for transactions, offers', val:notifPush, setter:setNotifPush },
                { label:'Email Notifications',desc:'Receipts and updates via email', val:notifEmail,setter:setNotifEmail },
              ].map(item => (
                <div key={item.label} style={{ display:'flex',alignItems:'center',gap:12,
                                               padding:'14px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ color:'#f0f0f8',fontWeight:600,fontSize:14 }}>{item.label}</p>
                    <p style={{ color:'#555570',fontSize:12,marginTop:2 }}>{item.desc}</p>
                  </div>
                  <Toggle value={item.val} onChange={item.setter} />
                </div>
              ))}
            </div>

            <div style={{ ...S.card,marginBottom:14 }}>
              <p style={S.sectionTitle}>App Settings</p>
              {[
                { label:'Dark Mode', desc:'Dark theme (always on)', val:darkMode, onChange:()=>{}, disabled:true },
                { label:'Two-Factor Auth', desc:'Extra login security via OTP', val:twoFA, onChange:setTwoFA },
              ].map(item => (
                <div key={item.label} style={{ display:'flex',alignItems:'center',gap:12,
                                               padding:'14px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ color: item.disabled ? '#333350' : '#f0f0f8',fontWeight:600,fontSize:14 }}>{item.label}</p>
                    <p style={{ color:'#555570',fontSize:12,marginTop:2 }}>{item.desc}</p>
                  </div>
                  <Toggle value={item.val} onChange={item.onChange} disabled={item.disabled} />
                </div>
              ))}
            </div>

            <button onClick={handleSavePreferences} disabled={loading}
              style={{ width:'100%',padding:'15px',background:'linear-gradient(135deg,#f0b429,#ff8c00)',border:'none',borderRadius:14,color:'#000',fontWeight:700,fontSize:16,cursor:'pointer',marginBottom:14,opacity:loading?0.6:1 }}>
              {loading ? 'Saving...' : 'Save Preferences'}
            </button>

            {/* Danger zone */}
            <div style={{ ...S.card,border:'1px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.04)' }}>
              <p style={{ color:'#ef4444',fontWeight:700,fontSize:14,marginBottom:14 }}>⚠️ Account Actions</p>
              <button onClick={handleLogout}
                style={{ width:'100%',padding:'13px',background:'transparent',
                          border:'1px solid #ef4444',borderRadius:12,
                          color:'#ef4444',fontWeight:700,cursor:'pointer',fontSize:14 }}>
                🚪 Logout
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ value, onChange, disabled=false }: { value:boolean; onChange:(v:boolean)=>void; disabled?:boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      style={{ width:48,height:26,borderRadius:13,border:'none',cursor:disabled?'default':'pointer',
                background:value?'#f0b429':'#1e1e2a',
                position:'relative',transition:'background 0.2s',flexShrink:0,
                opacity:disabled?0.4:1 }}>
      <div style={{ width:20,height:20,borderRadius:'50%',background:'#fff',
                     position:'absolute',top:3,
                     left:value?25:3,transition:'left 0.2s' }} />
    </button>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:        { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  header:      { display:'flex',alignItems:'center',gap:14,padding:'52px 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)' },
  back:        { background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' },
  title:       { fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8',flex:1 },
  editBtn:     { background:'rgba(240,180,41,0.1)',border:'1px solid rgba(240,180,41,0.3)',borderRadius:10,padding:'6px 14px',color:'#f0b429',fontWeight:600,fontSize:13,cursor:'pointer' },
  kycBadge:    (c:string):React.CSSProperties=>({ background:`${c}15`,border:`1px solid ${c}40`,borderRadius:20,padding:'5px 14px',color:c,fontSize:12,fontWeight:700,display:'inline-block' }),
  tabs:        { display:'flex',gap:6,padding:'8px 16px',background:'#0a0a0f',position:'sticky' as const,top:0,zIndex:10 },
  tab:         { flex:1,padding:'9px 4px',borderRadius:10,fontSize:11,fontWeight:600,cursor:'pointer',background:'#16161f',border:'1px solid rgba(255,255,255,0.06)',color:'#555570',whiteSpace:'nowrap' as const },
  tabOn:       { background:'#f0b429',border:'1px solid #f0b429',color:'#000' },
  card:        { background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',borderRadius:18,padding:20 },
  fieldLabel:  { color:'#555570',fontSize:10,fontWeight:700,letterSpacing:0.8,marginBottom:8,textTransform:'uppercase' as const },
  input:       { width:'100%',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'13px 14px',fontSize:15,outline:'none',color:'#f0f0f8',fontFamily:'inherit',boxSizing:'border-box' as const },
  sectionTitle:{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,color:'#f0f0f8',marginBottom:16 },
  toast:       { position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',border:'1px solid',borderRadius:14,padding:'12px 20px',fontSize:14,fontWeight:600,zIndex:999 },
};
