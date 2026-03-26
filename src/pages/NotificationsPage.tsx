import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, orderBy, limit, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate notifications from transactions if no real ones exist
  const defaultNotifs = [
    { id: '1', icon: '💸', title: 'Welcome to INRT Wallet!', body: 'Your account is ready. Start sending and receiving money.', time: 'Just now', read: false },
    { id: '2', icon: '🎁', title: 'Complete KYC', body: 'Verify your identity to unlock higher transaction limits.', time: '1 hour ago', read: false },
    { id: '3', icon: '💰', title: 'Earn Rewards', body: 'Get 10 reward points for every ₹100 you send.', time: 'Today', read: true },
  ];

  useEffect(() => {
    if (!user) return;
    const fetchNotifs = async () => {
      try {
        const q = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
          setNotifs(defaultNotifs);
        } else {
          setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch {
        setNotifs(defaultNotifs);
      }
      setLoading(false);
    };
    fetchNotifs();
  }, [user]);

  const markAllRead = () => {
    setNotifs(n => n.map(x => ({ ...x, read: true })));
  };

  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={s.readAllBtn}>Mark all read</button>
        )}
      </div>

      {unreadCount > 0 && (
        <div style={s.unreadBanner}>
          🔔 {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
        </div>
      )}

      <div style={{ padding: '16px 16px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #00b9f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        ) : notifs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
            <span style={{ fontSize: 48 }}>🔔</span>
            <p style={{ marginTop: 16, fontWeight: 600 }}>No notifications yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notifs.map(n => (
              <div
                key={n.id}
                onClick={() => setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}
                style={{ ...s.notifCard, background: n.read ? '#fff' : '#f0f9ff', borderColor: n.read ? '#f1f5f9' : '#bae6fd' }}
              >
                <div style={s.notifIcon}>{n.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{n.title}</p>
                    {!n.read && <div style={s.dot} />}
                  </div>
                  <p style={{ fontSize: 13, color: '#6b7280', marginTop: 3, lineHeight: 1.4 }}>{n.body}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif" },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 16px 16px', background: 'linear-gradient(160deg,#001a2e,#002a45)' },
  back: { background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer', color: '#fff' },
  title: { fontWeight: 800, fontSize: 20, color: '#fff' },
  readAllBtn: { background: 'rgba(0,185,241,0.2)', border: '1px solid rgba(0,185,241,0.4)', borderRadius: 12, padding: '8px 12px', color: '#00b9f1', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
  unreadBanner: { background: '#dbeafe', padding: '10px 16px', color: '#1d4ed8', fontSize: 13, fontWeight: 600 },
  notifCard: { borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start', border: '1px solid', cursor: 'pointer' },
  notifIcon: { width: 44, height: 44, borderRadius: 14, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: '50%', background: '#00b9f1', flexShrink: 0, marginTop: 4 },
};
