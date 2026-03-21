import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { subscribeToUser, subscribeToTransactions } from '../lib/db';
import AIAssistant from '../components/AIAssistant';
import QRCode from 'qrcode';

export default function Dashboard() {
  const { user, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(userProfile);

  // Guard against undefined profile on initial render
  if (!userProfile) return null;
  const [txs, setTxs] = useState<any[]>([]);
  const [qrUrl, setQrUrl] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeToUser(user.uid, setProfile);
    const unsub2 = subscribeToTransactions(user.uid, setTxs);
    return () => { unsub1(); unsub2(); };
  }, [user]);

  useEffect(() => {
    if (profile?.upiId) {
      QRCode.toDataURL(`upi://pay?pa=${profile.upiId}&pn=${encodeURIComponent(profile.name)}&cu=INR`, {
        width: 200, margin: 2, color: { dark: '#001a2e', light: '#ffffff' }
      }).then(setQrUrl).catch(() => {});
    }
  }, [profile?.upiId]);

  const fmt = (n: number | undefined) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

  const services = [
    { icon: '📤', label: 'Send', path: '/send' },
    { icon: '📷', label: 'Scan QR', path: '/scan' },
    { icon: '➕', label: 'Add Money', path: '/add-money' },
    { icon: '📥', label: 'Request', path: '/request' },
    { icon: '📱', label: 'Recharge', path: '/recharge' },
    { icon: '⚡', label: 'Bills', path: '/bills' },
    { icon: '🎫', label: 'Bookings', path: '/bookings' },
    { icon: '🥇', label: 'Gold', path: '/gold' },
    { icon: '📈', label: 'Invest', path: '/invest' },
    { icon: '🛡️', label: 'Insurance', path: '/insurance' },
    { icon: '🎁', label: 'Rewards', path: '/rewards' },
    { icon: '📊', label: 'CIBIL', path: '/cibil' },
  ];

  if (!profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #00b9f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#666' }}>Loading your wallet...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <p style={s.greet}>{greeting}, {profile.name?.split(' ')[0]} 👋</p>
          <p style={s.upi}>{profile.upiId}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/notifications')} style={s.iconBtn}>🔔</button>
          <button onClick={() => navigate('/profile')} style={s.iconBtn}>👤</button>
        </div>
      </div>

      {/* KYC Banner */}
      {profile.kycStatus !== 'verified' && (
        <div style={s.kycBanner} onClick={() => navigate('/kyc')}>
          <span>🪪 Complete KYC to unlock higher limits</span>
          <span style={{ fontWeight: 700 }}>Verify Now →</span>
        </div>
      )}

      {/* Balance Card */}
      <div style={s.balanceCard}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <p style={s.balLabel}>TOTAL BALANCE</p>
        <p style={s.balance}>{fmt(profile.balance)}</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <div style={s.balStat}>
            <span style={{ color: '#4ade80', fontSize: 12 }}>↓ Received</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{fmt(txs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0))}</span>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
          <div style={s.balStat}>
            <span style={{ color: '#f87171', fontSize: 12 }}>↑ Sent</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{fmt(txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0))}</span>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
          <div style={s.balStat}>
            <span style={{ color: '#fbbf24', fontSize: 12 }}>⭐ Points</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>{profile.rewardPoints || 0}</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={s.quickRow}>
        {[
          { icon: '📤', label: 'Send', path: '/send', color: '#dbeafe' },
          { icon: '📷', label: 'Scan', path: '/scan', color: '#dcfce7' },
          { icon: '➕', label: 'Add', path: '/add-money', color: '#fef9c3' },
          { icon: '📥', label: 'Request', path: '/request', color: '#fce7f3' },
        ].map(item => (
          <button key={item.label} onClick={() => navigate(item.path)} style={{ ...s.quickBtn, background: item.color }}>
            <span style={{ fontSize: 24 }}>{item.icon}</span>
            <span style={s.quickLabel}>{item.label}</span>
          </button>
        ))}
      </div>

      {/* QR Code */}
      <div style={s.qrSection}>
        <p style={s.sectionTitle}>Your QR Code</p>
        <div style={s.qrCard}>
          {qrUrl && <img src={qrUrl} alt="QR" style={{ width: 140, height: 140 }} />}
          <div>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{profile.name}</p>
            <p style={{ color: '#666', fontSize: 13 }}>{profile.upiId}</p>
            <button style={s.shareBtn}>📤 Share QR</button>
          </div>
        </div>
      </div>

      {/* All Services */}
      <p style={s.sectionTitle}>All Services</p>
      <div style={s.grid}>
        {services.map(item => (
          <button key={item.label} onClick={() => navigate(item.path)} style={s.serviceBtn}>
            <span style={{ fontSize: 26 }}>{item.icon}</span>
            <span style={s.serviceLabel}>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Recent Transactions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
        <p style={s.sectionTitle}>Recent Transactions</p>
        <button onClick={() => navigate('/history')} style={s.viewAll}>View All →</button>
      </div>
      {txs.length === 0 ? (
        <div style={s.emptyTx}>
          <span style={{ fontSize: 32 }}>💳</span>
          <p>No transactions yet. Send money to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {txs.slice(0, 6).map(tx => (
            <div key={tx.id} style={s.txRow}>
              <div style={{ ...s.txIcon, background: tx.type === 'credit' ? '#dcfce7' : tx.type === 'cashback' ? '#fef9c3' : '#fee2e2' }}>
                {tx.type === 'credit' ? '↙' : tx.type === 'cashback' ? '🎁' : '↗'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={s.txLabel}>{tx.toName ? `To: ${tx.toName}` : tx.fromName ? `From: ${tx.fromName}` : tx.note || 'Transaction'}</p>
                <p style={s.txSub}>{tx.ref} · {tx.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || 'Just now'}</p>
              </div>
              <span style={{ color: tx.type === 'debit' ? '#ef4444' : '#22c55e', fontWeight: 700 }}>
                {tx.type === 'debit' ? '-' : '+'}{fmt(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* AI Assistant FAB */}
      <button style={s.fab} onClick={() => setShowAI(true)}>
        🤖
        <span style={s.fabLabel}>AI Help</span>
      </button>

      {showAI && <AIAssistant onClose={() => setShowAI(false)} />}

      {/* Bottom Nav */}
      <div style={s.nav}>
        {[
          { icon: '🏠', label: 'Home', path: '/dashboard' },
          { icon: '📋', label: 'History', path: '/history' },
          { icon: '🎁', label: 'Rewards', path: '/rewards' },
          { icon: '👤', label: 'Profile', path: '/profile' },
        ].map(item => (
          <button key={item.label} onClick={() => navigate(item.path)} style={s.navBtn}>
            <span style={{ fontSize: 22 }}>{item.icon}</span>
            <span style={s.navLabel}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', background: '#f8fafc', minHeight: '100vh', paddingBottom: 80, fontFamily: "'DM Sans', sans-serif" },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '52px 20px 16px', background: 'linear-gradient(160deg,#001a2e,#002a45)' },
  greet: { color: '#fff', fontWeight: 700, fontSize: 18 },
  upi: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 2 },
  iconBtn: { background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer' },
  kycBanner: { background: '#fef3c7', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontSize: 13, color: '#92400e' },
  balanceCard: { background: 'linear-gradient(135deg,#001a2e,#002a45)', margin: '0 16px 16px', borderRadius: 20, padding: '24px 20px', position: 'relative', overflow: 'hidden' },
  balLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 1.5, marginBottom: 4 },
  balance: { color: '#fff', fontSize: 44, fontWeight: 900, letterSpacing: -1 },
  balStat: { display: 'flex', flexDirection: 'column', gap: 4 },
  quickRow: { display: 'flex', gap: 10, padding: '0 16px 16px' },
  quickBtn: { flex: 1, border: 'none', borderRadius: 16, padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' },
  quickLabel: { fontSize: 11, fontWeight: 700, color: '#374151' },
  qrSection: { padding: '0 16px 16px' },
  sectionTitle: { fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 12 },
  qrCard: { background: '#fff', borderRadius: 18, padding: 20, display: 'flex', gap: 20, alignItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
  shareBtn: { marginTop: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '8px 14px', color: '#0369a1', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, padding: '0 16px' },
  serviceBtn: { background: '#fff', border: '1px solid #f1f5f9', borderRadius: 16, padding: '14px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  serviceLabel: { fontSize: 11, fontWeight: 600, color: '#374151' },
  viewAll: { background: 'none', border: 'none', color: '#00b9f1', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  emptyTx: { textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' },
  txRow: { background: '#fff', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  txIcon: { width: 42, height: 42, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 },
  txLabel: { fontWeight: 600, fontSize: 14, color: '#111' },
  txSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  fab: { position: 'fixed', bottom: 90, right: 20, background: 'linear-gradient(135deg,#001a2e,#00b9f1)', border: 'none', borderRadius: 20, padding: '12px 16px', color: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, boxShadow: '0 8px 24px rgba(0,185,241,0.4)', fontSize: 22, zIndex: 100 },
  fabLabel: { fontSize: 10, fontWeight: 700 },
  nav: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: '#fff', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-around', padding: '8px 0 16px' },
  navBtn: { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '4px 16px' },
  navLabel: { fontSize: 10, color: '#6b7280', fontWeight: 600 },
};
