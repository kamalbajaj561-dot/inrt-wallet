import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function CibilPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [score] = useState(762);

  useEffect(() => {
    setTimeout(() => setLoading(false), 1500);
  }, []);

  const getScoreLabel = (s: number) => {
    if (s >= 750) return { label: 'Excellent', color: '#16a34a' };
    if (s >= 700) return { label: 'Good', color: '#00b9f1' };
    if (s >= 650) return { label: 'Fair', color: '#f59e0b' };
    return { label: 'Poor', color: '#ef4444' };
  };

  const { label, color } = getScoreLabel(score);
  const pct = ((score - 300) / 600) * 100;

  const factors = [
    { label: 'Payment History', score: 95, desc: 'All payments on time', color: '#16a34a' },
    { label: 'Credit Utilization', score: 28, desc: 'Low utilization — great!', color: '#16a34a' },
    { label: 'Credit Age', score: 65, desc: 'Average account age 3 years', color: '#f59e0b' },
    { label: 'Credit Mix', score: 80, desc: 'Good mix of credit types', color: '#16a34a' },
    { label: 'New Inquiries', score: 90, desc: 'No recent hard inquiries', color: '#16a34a' },
  ];

  const tips = [
    '✅ Always pay bills and EMIs on time',
    '✅ Keep credit card utilization below 30%',
    '📈 Maintain older credit accounts',
    '📈 Avoid applying for multiple loans at once',
    '📈 Check your CIBIL report for errors',
  ];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>CIBIL Score</h1>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px' }}>
          <div style={{ width: 48, height: 48, border: '4px solid #00b9f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 16 }} />
          <p style={{ color: '#666', fontSize: 14 }}>Fetching your credit score...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* Score Card */}
          <div style={s.scoreCard}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: 1, marginBottom: 16 }}>YOUR CIBIL SCORE</p>
            {/* Gauge */}
            <div style={{ position: 'relative', width: 200, height: 100, margin: '0 auto 16px' }}>
              <svg width="200" height="110" viewBox="0 0 200 110">
                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="16" strokeLinecap="round" />
                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#scoreGrad)" strokeWidth="16" strokeLinecap="round"
                  strokeDasharray={`${(pct / 100) * 251} 251`} />
                <defs>
                  <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center' }}>
                <p style={{ color: '#fff', fontSize: 44, fontWeight: 900, lineHeight: 1 }}>{score}</p>
                <p style={{ color, fontWeight: 700, fontSize: 14, marginTop: 4 }}>{label}</p>
              </div>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center' }}>
              Score range: 300 – 900 · Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div style={{ padding: '0 16px' }}>
            {/* Score Factors */}
            <div style={s.card}>
              <p style={s.cardTitle}>Score Factors</p>
              {factors.map(f => (
                <div key={f.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{f.label}</span>
                      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{f.desc}</p>
                    </div>
                    <span style={{ color: f.color, fontWeight: 700, fontSize: 14 }}>{f.score}%</span>
                  </div>
                  <div style={{ background: '#f1f5f9', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${f.score}%`, height: '100%', background: f.color, borderRadius: 8, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Tips */}
            <div style={{ ...s.card, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <p style={{ ...s.cardTitle, color: '#15803d' }}>💡 Tips to Improve Score</p>
              {tips.map((tip, i) => (
                <p key={i} style={{ color: '#374151', fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>{tip}</p>
              ))}
            </div>

            {/* Full Report */}
            <button style={s.btn}>📄 Download Full Credit Report</button>
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
              Free report · Powered by CRIF High Mark
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif", paddingBottom: 40 },
  header: { display: 'flex', alignItems: 'center', gap: 14, padding: '52px 16px 16px', background: 'linear-gradient(160deg,#001a2e,#002a45)' },
  back: { background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer', color: '#fff' },
  title: { fontWeight: 800, fontSize: 20, color: '#fff' },
  scoreCard: { background: 'linear-gradient(135deg,#001a2e,#003a6e)', padding: '24px 20px', marginBottom: 16 },
  card: { background: '#fff', borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  cardTitle: { fontWeight: 700, fontSize: 16, color: '#111', marginBottom: 16 },
  btn: { width: '100%', padding: '16px 0', background: '#00b9f1', border: 'none', borderRadius: 16, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' },
};
