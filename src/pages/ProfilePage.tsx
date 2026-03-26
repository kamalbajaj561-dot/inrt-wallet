import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { updateUserProfile } from '../lib/db';

export default function ProfilePage() {
  const { user, userProfile, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(userProfile?.name || '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateUserProfile(user!.uid, { name });
      await refreshProfile();
      setEditing(false);
      showToast('Profile updated! ✓');
    } catch (e) { showToast('Failed to update'); }
    setSaving(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = (userProfile?.name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const menuItems = [
    { icon: '🪪', label: 'KYC Verification', sub: userProfile?.kycStatus === 'verified' ? '✅ Verified' : '⚠️ Pending - Tap to verify', action: () => navigate('/kyc'), highlight: userProfile?.kycStatus !== 'verified' },
    { icon: '📷', label: 'My QR Code', sub: 'Share to receive payments', action: () => navigate('/qr') },
    { icon: '🏦', label: 'Linked Banks', sub: 'Manage bank accounts', action: () => {} },
    { icon: '📋', label: 'Transaction History', sub: 'View all transactions', action: () => navigate('/history') },
    { icon: '🎁', label: 'Rewards & Cashback', sub: `${userProfile?.rewardPoints || 0} points earned`, action: () => navigate('/rewards') },
    { icon: '🔔', label: 'Notifications', sub: 'Manage alerts', action: () => navigate('/notifications') },
    { icon: '🔒', label: 'Privacy & Security', sub: 'Account security settings', action: () => {} },
    { icon: '❓', label: 'Help & Support', sub: 'FAQs and contact us', action: () => {} },
    { icon: '📄', label: 'Terms & Privacy', sub: 'Legal documents', action: () => {} },
  ];

  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>My Profile</h1>
        <button onClick={() => setEditing(!editing)} style={s.editBtn}>{editing ? 'Cancel' : 'Edit'}</button>
      </div>

      {/* Profile Card */}
      <div style={s.profileCard}>
        <div style={s.avatar}>{initials}</div>
        {editing ? (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={s.nameInput}
              placeholder="Your name"
            />
            <button onClick={handleSave} disabled={saving} style={s.saveBtn}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        ) : (
          <>
            <p style={s.profileName}>{userProfile?.name || 'INRT User'}</p>
            <p style={s.profilePhone}>+91 {userProfile?.phone || ''}</p>
            <div style={s.upiBadge}>
              <span style={{ color: '#0369a1', fontSize: 13 }}>{userProfile?.upiId || `${userProfile?.phone}@inrt`}</span>
            </div>
          </>
        )}

        {/* KYC Status */}
        <div style={{ ...s.kycBadge, background: userProfile?.kycStatus === 'verified' ? '#dcfce7' : '#fef9c3', color: userProfile?.kycStatus === 'verified' ? '#15803d' : '#92400e' }}>
          {userProfile?.kycStatus === 'verified' ? '✅ KYC Verified' : '⚠️ KYC Pending'}
        </div>
      </div>

      {/* Stats */}
      <div style={s.stats}>
        {[
          { label: 'Balance', value: `₹${(userProfile?.balance || 0).toLocaleString('en-IN')}`, color: '#00b9f1' },
          { label: 'Points', value: userProfile?.rewardPoints || 0, color: '#f59e0b' },
          { label: 'Cashback', value: `₹${(userProfile?.cashback || 0).toLocaleString('en-IN')}`, color: '#10b981' },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <p style={{ color: stat.color as string, fontWeight: 800, fontSize: 18 }}>{stat.value}</p>
            <p style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Menu */}
      <div style={s.menu}>
        {menuItems.map((item, i) => (
          <button
            key={item.label}
            onClick={item.action}
            style={{ ...s.menuItem, borderBottom: i < menuItems.length - 1 ? '1px solid #f1f5f9' : 'none', background: (item as any).highlight ? '#fffbeb' : 'transparent' }}
          >
            <span style={s.menuIcon}>{item.icon}</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{item.label}</p>
              <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.sub}</p>
            </div>
            <span style={{ color: '#d1d5db', fontSize: 18 }}>›</span>
          </button>
        ))}
      </div>

      {/* App Info */}
      <div style={{ textAlign: 'center', padding: '16px 0', color: '#9ca3af', fontSize: 12 }}>
        <p>INRT Wallet v1.0.0</p>
        <p style={{ marginTop: 4 }}>Made with ❤️ in India</p>
      </div>

      {/* Logout */}
      <div style={{ padding: '0 16px 40px' }}>
        <button onClick={handleLogout} style={s.logoutBtn}>
          🚪 Sign Out
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif" },
  toast: { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', borderRadius: 14, padding: '12px 20px', fontSize: 14, fontWeight: 600, zIndex: 999 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 16px 20px', background: 'linear-gradient(160deg,#001a2e,#002a45)' },
  back: { background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer', color: '#fff' },
  title: { fontWeight: 800, fontSize: 20, color: '#fff' },
  editBtn: { background: 'rgba(0,185,241,0.2)', border: '1px solid rgba(0,185,241,0.4)', borderRadius: 12, padding: '8px 16px', color: '#00b9f1', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  profileCard: { background: 'linear-gradient(160deg,#001a2e,#002a45)', padding: '0 20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  avatar: { width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#00b9f1,#0090c0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 28, border: '3px solid rgba(255,255,255,0.2)' },
  profileName: { color: '#fff', fontWeight: 800, fontSize: 20 },
  profilePhone: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  upiBadge: { background: 'rgba(0,185,241,0.15)', border: '1px solid rgba(0,185,241,0.3)', borderRadius: 20, padding: '6px 16px' },
  kycBadge: { borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 600 },
  nameInput: { border: '2px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 16px', color: '#fff', fontSize: 16, outline: 'none', width: '100%', textAlign: 'center', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 },
  saveBtn: { background: '#00b9f1', border: 'none', borderRadius: 12, padding: '10px 24px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  stats: { display: 'flex', gap: 10, padding: '16px', background: '#fff', marginBottom: 8 },
  statCard: { flex: 1, textAlign: 'center', background: '#f8fafc', borderRadius: 14, padding: '14px 8px' },
  menu: { background: '#fff', margin: '0 0 8px', borderRadius: 0 },
  menuItem: { width: '100%', padding: '16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', border: 'none' },
  menuIcon: { fontSize: 22, width: 36, textAlign: 'center' },
  logoutBtn: { width: '100%', padding: '16px 0', background: '#fff', border: '2px solid #fecaca', borderRadius: 16, color: '#ef4444', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
};
