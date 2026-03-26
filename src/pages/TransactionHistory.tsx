import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { subscribeToTransactions } from '../lib/db';

export default function TransactionHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [txs, setTxs] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToTransactions(user.uid, (data) => {
      setTxs(data);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const filtered = txs.filter(t => {
    const matchFilter = filter === 'all' || t.type === filter ||
      (filter === 'cashback' && t.type === 'cashback');
    const matchSearch = !search ||
      (t.note || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.toName || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.fromName || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.ref || '').toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const totalIn = txs.filter(t => t.type === 'credit' || t.type === 'cashback')
    .reduce((s, t) => s + (t.amount || 0), 0);
  const totalOut = txs.filter(t => t.type === 'debit')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;

  const getIcon = (tx: any) => {
    if (tx.type === 'cashback') return '🎁';
    if (tx.type === 'credit') return '↙';
    if (tx.cat === 'recharge') return '📱';
    if (tx.cat === 'bill') return '⚡';
    if (tx.cat === 'gold') return '🥇';
    return '↗';
  };

  const getLabel = (tx: any) => {
    if (tx.toName) return `Sent to ${tx.toName}`;
    if (tx.fromName) return `From ${tx.fromName}`;
    return tx.note || 'Transaction';
  };

  const formatDate = (ts: any) => {
    if (!ts) return 'Just now';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return 'Just now'; }
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>Transaction History</h1>
      </div>

      {/* Summary */}
      <div style={s.summary}>
        <div style={s.summaryCard}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>MONEY IN</p>
          <p style={{ color: '#4ade80', fontWeight: 800, fontSize: 20 }}>+{fmt(totalIn)}</p>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
        <div style={s.summaryCard}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>MONEY OUT</p>
          <p style={{ color: '#f87171', fontWeight: 800, fontSize: 20 }}>-{fmt(totalOut)}</p>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
        <div style={s.summaryCard}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 4 }}>TOTAL</p>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{txs.length}</p>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search transactions..."
          style={s.search}
        />

        {/* Filters */}
        <div style={s.filters}>
          {['all', 'credit', 'debit', 'cashback'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ ...s.filterBtn, background: filter === f ? '#00b9f1' : '#fff', color: filter === f ? '#fff' : '#374151', border: `2px solid ${filter === f ? '#00b9f1' : '#e5e7eb'}` }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Transactions */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #00b9f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
            <span style={{ fontSize: 48 }}>💳</span>
            <p style={{ marginTop: 16, fontWeight: 600 }}>No transactions found</p>
            <p style={{ fontSize: 13 }}>Start sending or receiving money!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 40 }}>
            {filtered.map(tx => (
              <div key={tx.id} style={s.txCard}>
                <div style={{ ...s.txIcon, background: tx.type === 'credit' || tx.type === 'cashback' ? '#dcfce7' : '#fee2e2' }}>
                  <span style={{ fontSize: 18 }}>{getIcon(tx)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={s.txLabel}>{getLabel(tx)}</p>
                  <p style={s.txDate}>{formatDate(tx.createdAt)}</p>
                  {tx.ref && <p style={s.txRef}>Ref: {tx.ref}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: tx.type === 'debit' ? '#ef4444' : '#22c55e', fontWeight: 800, fontSize: 15 }}>
                    {tx.type === 'debit' ? '-' : '+'}{fmt(tx.amount)}
                  </p>
                  <span style={{ ...s.badge, background: tx.type === 'debit' ? '#fee2e2' : '#dcfce7', color: tx.type === 'debit' ? '#dc2626' : '#16a34a' }}>
                    {tx.type}
                  </span>
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
  header: { display: 'flex', alignItems: 'center', gap: 14, padding: '52px 16px 16px', background: 'linear-gradient(160deg,#001a2e,#002a45)' },
  back: { background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer', color: '#fff', flexShrink: 0 },
  title: { fontWeight: 800, fontSize: 20, color: '#fff' },
  summary: { background: 'linear-gradient(160deg,#001a2e,#002a45)', padding: '0 16px 20px', display: 'flex', gap: 0 },
  summaryCard: { flex: 1, textAlign: 'center', padding: '0 8px' },
  search: { width: '100%', background: '#fff', border: '2px solid #e5e7eb', borderRadius: 14, padding: '12px 16px', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box', fontFamily: 'inherit' },
  filters: { display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' },
  filterBtn: { flexShrink: 0, borderRadius: 20, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  txCard: { background: '#fff', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  txIcon: { width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txLabel: { fontWeight: 600, fontSize: 14, color: '#111', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  txDate: { fontSize: 11, color: '#9ca3af' },
  txRef: { fontSize: 10, color: '#9ca3af', marginTop: 2 },
  badge: { fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 6px', textTransform: 'capitalize' },
};
