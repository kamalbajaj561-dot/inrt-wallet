import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { redeemRewardPoints } from '../lib/db';

export default function RewardsPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [scratched, setScratched] = useState<Record<number, boolean>>({});
  const [scratchValues, setScratchValues] = useState<Record<number, number>>({});
  const [redeeming, setRedeeming] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const scratch = (id: number) => {
    if (scratched[id]) return;
    const val = [0, 5, 10, 25, 50, 100][Math.floor(Math.random() * 6)];
    setScratchValues(v => ({ ...v, [id]: val }));
    setScratched(s => ({ ...s, [id]: true }));
    if (val > 0) showToast(`🎉 You won ₹${val} cashback!`);
  };

  const redeemAll = async () => {
    const pts = userProfile?.rewardPoints || 0;
    if (pts < 10) return showToast('Need at least 10 points to redeem');
    setRedeeming(true);
    try {
      await redeemRewardPoints(user!.uid, pts);
      await refreshProfile();
      showToast(`✅ ₹${pts} added to wallet!`);
    } catch (e: any) {
      showToast(e.message);
    }
    setRedeeming(false);
  };

  const cards = [1, 2, 3, 4, 5, 6];

  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>Rewards & Cashback</h1>
      </div>

      {/* Points Balance */}
      <div style={s.pointsCard}>
        <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,215,0,0.1)' }} />
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: 1 }}>REWARD POINTS</p>
        <p style={{ color: '#FFD700', fontSize: 48, fontWeight: 900 }}>{(userProfile?.rewardPoints || 0).toLocaleString()}</p>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>1 point = ₹1 · Redeem anytime</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button style={s.redeemBtn} onClick={redeemAll} disabled={redeeming}>
            {redeeming ? 'Redeeming...' : '💰 Redeem All Points'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Cashback', value: `₹${(userProfile?.cashback || 0).toLocaleString('en-IN')}`, icon: '💵', color: '#dcfce7' },
          { label: 'Points Earned', value: (userProfile?.rewardPoints || 0).toString(), icon: '⭐', color: '#fef9c3' },
        ].map(item => (
          <div key={item.label} style={{ ...s.statCard, background: item.color }}>
            <span style={{ fontSize: 28 }}>{item.icon}</span>
            <p style={{ fontWeight: 800, fontSize: 20, color: '#111' }}>{item.value}</p>
            <p style={{ color: '#555', fontSize: 12 }}>{item.label}</p>
          </div>
        ))}
      </div>

      {/* How to Earn */}
      <div style={s.earnCard}>
        <p style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 12 }}>⭐ How to Earn Points</p>
        {[
          ['Send Money', '10 pts per ₹100 sent'],
          ['Pay Bills', '15 pts per bill paid'],
          ['Recharge', '5 pts per recharge'],
          ['Book Tickets', '20 pts per booking'],
          ['Complete KYC', '500 bonus pts'],
        ].map(([a, b]) => (
          <div key={a} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ color: '#374151', fontSize: 14 }}>{a}</span>
            <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 14 }}>{b}</span>
          </div>
        ))}
      </div>

      {/* Scratch Cards */}
      <p style={s.sectionTitle}>🎴 Scratch Cards</p>
      <div style={s.scratchGrid}>
        {cards.map(id => (
          <button key={id} onClick={() => scratch(id)} style={{ ...s.scratchCard, background: scratched[id] ? (scratchValues[id] > 0 ? '#dcfce7' : '#f1f5f9') : 'linear-gradient(135deg,#00b9f1,#0090c0)' }}>
            {!scratched[id] ? (
              <>
                <span style={{ fontSize: 28 }}>🎴</span>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>Scratch!</span>
              </>
            ) : scratchValues[id] > 0 ? (
              <>
                <span style={{ fontSize: 28 }}>🎉</span>
                <span style={{ color: '#15803d', fontWeight: 800, fontSize: 16 }}>₹{scratchValues[id]}</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 28 }}>😢</span>
                <span style={{ color: '#9ca3af', fontSize: 12 }}>Better luck!</span>
              </>
            )}
          </button>
        ))}
      </div>

      {/* Offers */}
      <p style={s.sectionTitle}>🔥 Hot Deals</p>
      {[
        { icon: '⚡', title: '₹50 Cashback', desc: 'On electricity bill ≥ ₹500', code: 'ELEC50', color: '#fef9c3' },
        { icon: '📱', title: '5% Cashback', desc: 'On mobile recharge ≥ ₹199', code: 'RCHRG5', color: '#dbeafe' },
        { icon: '🎬', title: '₹100 Off', desc: 'On first movie booking', code: 'MOVIE1', color: '#fce7f3' },
        { icon: '🚂', title: '₹75 Off', desc: 'On train ticket booking', code: 'TRAIN75', color: '#dcfce7' },
      ].map(offer => (
        <div key={offer.code} style={{ ...s.offerCard, background: offer.color }}>
          <span style={{ fontSize: 32 }}>{offer.icon}</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{offer.title}</p>
            <p style={{ color: '#555', fontSize: 13 }}>{offer.desc}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: '#374151', fontSize: 11, marginBottom: 4 }}>Code:</p>
            <p style={{ fontWeight: 800, fontSize: 13, color: '#111' }}>{offer.code}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', padding: '20px 16px 40px', fontFamily: "'DM Sans', sans-serif" },
  toast: { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', borderRadius: 14, padding: '12px 20px', fontSize: 14, fontWeight: 600, zIndex: 999, whiteSpace: 'nowrap' },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  back: { background: '#fff', border: '2px solid #e5e7eb', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer' },
  title: { fontWeight: 800, fontSize: 22, color: '#111' },
  pointsCard: { background: 'linear-gradient(135deg,#1a1a2e,#001a3e)', borderRadius: 22, padding: 24, marginBottom: 16, position: 'relative', overflow: 'hidden' },
  redeemBtn: { background: '#FFD700', border: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#000' },
  statCard: { flex: 1, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' },
  earnCard: { background: '#fff', borderRadius: 18, padding: 18, marginBottom: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' },
  sectionTitle: { fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 12 },
  scratchGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 },
  scratchCard: { borderRadius: 16, padding: '20px 0', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 90 },
  offerCard: { borderRadius: 16, padding: 16, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 },
};
