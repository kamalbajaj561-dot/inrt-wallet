import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  collection, query, where, orderBy,
  limit, startAfter, getDocs, DocumentSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  note: string;
  cat: string;
  status: string;
  createdAt: any;
  ref?: string;
}

const CAT_ICONS: Record<string, string> = {
  transfer: '↑', recharge: '📱', bills: '⚡', crypto: '₿',
  gold: '🥇', credit: '↓', add_money: '💳', rewards: '🎁',
  default: '💰',
};

const CAT_LABELS: Record<string, string> = {
  transfer: 'Transfer', recharge: 'Recharge', bills: 'Bill Payment',
  crypto: 'Crypto', gold: 'Gold', credit: 'Received',
  add_money: 'Added Money', rewards: 'Rewards', default: 'Transaction',
};

export default function TransactionHistory() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [txns,      setTxns]      = useState<Transaction[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadMore,  setLoadMore]  = useState(false);
  const [hasMore,   setHasMore]   = useState(true);
  const [lastDoc,   setLastDoc]   = useState<DocumentSnapshot | null>(null);
  const [filter,    setFilter]    = useState<'all'|'credit'|'debit'>('all');
  const [search,    setSearch]    = useState('');
  const PAGE_SIZE = 20;

  const fetchTxns = async (isLoadMore = false) => {
    if (!user) return;
    isLoadMore ? setLoadMore(true) : setLoading(true);

    try {
      let q = query(
        collection(db, 'transactions'),
        where('uid', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      );

      if (filter !== 'all') {
        q = query(
          collection(db, 'transactions'),
          where('uid', '==', user.uid),
          where('type', '==', filter),
          orderBy('createdAt', 'desc'),
          limit(PAGE_SIZE)
        );
      }

      if (isLoadMore && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));

      setTxns(prev => isLoadMore ? [...prev, ...docs] : docs);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error('Fetch transactions error:', e);
    }

    isLoadMore ? setLoadMore(false) : setLoading(false);
  };

  useEffect(() => { fetchTxns(); }, [user, filter]);

  const filtered = txns.filter(t =>
    !search ||
    (t.note || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.cat  || '').toLowerCase().includes(search.toLowerCase())
  );

  const fmtDate = (ts: any): string => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000)    return 'Just now';
    if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    if (diff < 172800000)return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  };

  // Group by date
  const grouped: Record<string, Transaction[]> = {};
  filtered.forEach(t => {
    const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
    const key = d.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  // Monthly totals
  const totals = txns.reduce((acc, t) => {
    if (t.type === 'credit') acc.in  += t.amount || 0;
    else                     acc.out += t.amount || 0;
    return acc;
  }, { in: 0, out: 0 });

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => navigate('/dashboard')} style={S.back}>←</button>
        <h1 style={S.title}>Transactions</h1>
        <button onClick={() => fetchTxns()}
          style={{ background:'none',border:'none',color:'#f0b429',fontSize:20,cursor:'pointer' }}>
          ↻
        </button>
      </div>

      {/* Summary */}
      <div style={{ background:'rgba(255,255,255,0.02)',padding:'12px 16px',
                     display:'flex',gap:12 }}>
        <div style={S.summaryCard}>
          <p style={{ color:'#555570',fontSize:10,fontWeight:700,letterSpacing:1 }}>MONEY IN</p>
          <p style={{ color:'#10b981',fontWeight:800,fontSize:16,marginTop:4 }}>
            +₹{totals.in.toLocaleString('en-IN')}
          </p>
        </div>
        <div style={S.summaryCard}>
          <p style={{ color:'#555570',fontSize:10,fontWeight:700,letterSpacing:1 }}>MONEY OUT</p>
          <p style={{ color:'#ef4444',fontWeight:800,fontSize:16,marginTop:4 }}>
            -₹{totals.out.toLocaleString('en-IN')}
          </p>
        </div>
        <div style={S.summaryCard}>
          <p style={{ color:'#555570',fontSize:10,fontWeight:700,letterSpacing:1 }}>NET</p>
          <p style={{ color: totals.in - totals.out >= 0 ? '#10b981' : '#ef4444',
                       fontWeight:800,fontSize:16,marginTop:4 }}>
            {totals.in - totals.out >= 0 ? '+' : ''}₹{(totals.in - totals.out).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ padding:'12px 16px 0' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search transactions..."
          style={S.searchInput} />
        <div style={{ display:'flex',gap:8,marginTop:8 }}>
          {(['all','credit','debit'] as const).map(f => (
            <button key={f} onClick={() => { setFilter(f); setTxns([]); setLastDoc(null); }}
              style={{ flex:1,padding:'8px 0',borderRadius:10,fontSize:12,fontWeight:700,
                       cursor:'pointer',
                       background:filter===f?(f==='credit'?'rgba(16,185,129,0.15)':f==='debit'?'rgba(239,68,68,0.15)':'rgba(240,180,41,0.15)'):'#1e1e2a',
                       border:`1px solid ${filter===f?(f==='credit'?'#10b981':f==='debit'?'#ef4444':'#f0b429'):'rgba(255,255,255,0.07)'}`,
                       color:filter===f?(f==='credit'?'#10b981':f==='debit'?'#ef4444':'#f0b429'):'#555570' }}>
              {f==='all'?'All':f==='credit'?'↓ Received':'↑ Sent'}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions list */}
      <div style={{ padding:'12px 16px 90px' }}>
        {loading ? (
          [1,2,3,4,5].map(i => (
            <div key={i} style={{ background:'#16161f',borderRadius:14,height:70,
                                   marginBottom:10,opacity:0.4 }} />
          ))
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center',padding:'60px 0' }}>
            <p style={{ fontSize:48,marginBottom:12 }}>📭</p>
            <p style={{ color:'#8888a8',fontWeight:600,fontSize:16 }}>
              {search ? 'No results found' : 'No transactions yet'}
            </p>
            <p style={{ color:'#555570',fontSize:13,marginTop:6 }}>
              {search ? 'Try a different search' : 'Start sending or receiving money'}
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, dayTxns]) => (
            <div key={date}>
              <p style={{ color:'#555570',fontSize:11,fontWeight:700,letterSpacing:0.5,
                           padding:'8px 0 4px',textTransform:'uppercase' as const }}>
                {date}
              </p>
              {dayTxns.map(tx => (
                <div key={tx.id} style={S.txRow}>
                  <div style={{ ...S.txIcon,
                    background: tx.type==='credit'?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',
                    color:       tx.type==='credit'?'#10b981':'#ef4444' }}>
                    {CAT_ICONS[tx.cat] || (tx.type==='credit'?'↓':'↑')}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <p style={{ color:'#f0f0f8',fontWeight:600,fontSize:14,
                                 whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                      {tx.note || CAT_LABELS[tx.cat] || 'Transaction'}
                    </p>
                    <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:3 }}>
                      <p style={{ color:'#555570',fontSize:11 }}>{fmtDate(tx.createdAt)}</p>
                      {tx.status === 'success'
                        ? <span style={S.statusGreen}>✓ Success</span>
                        : <span style={S.statusRed}>✗ Failed</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:'right',flexShrink:0 }}>
                    <p style={{ color:tx.type==='credit'?'#10b981':'#ef4444',
                                 fontWeight:800,fontSize:15 }}>
                      {tx.type==='credit'?'+':'-'}₹{(tx.amount||0).toLocaleString('en-IN')}
                    </p>
                    {tx.ref && (
                      <p style={{ color:'#333350',fontSize:9,marginTop:2 }}>
                        {tx.ref.slice(-8)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}

        {/* Load more */}
        {hasMore && !loading && filtered.length > 0 && (
          <button onClick={() => fetchTxns(true)} disabled={loadMore}
            style={{ width:'100%',padding:'14px',background:'#1e1e2a',
                      border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,
                      color:'#f0b429',fontWeight:600,fontSize:14,cursor:'pointer',marginTop:8 }}>
            {loadMore ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:        { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  header:      { display:'flex',alignItems:'center',gap:14,padding:'52px 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)' },
  back:        { background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' },
  title:       { fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8',flex:1 },
  summaryCard: { flex:1,background:'#16161f',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'10px 12px' },
  searchInput: { width:'100%',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px',fontSize:14,color:'#f0f0f8',outline:'none',fontFamily:'inherit',boxSizing:'border-box' as const },
  txRow:       { background:'#16161f',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'13px 14px',display:'flex',alignItems:'center',gap:12,marginBottom:8 },
  txIcon:      { width:42,height:42,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,flexShrink:0 },
  statusGreen: { background:'rgba(16,185,129,0.1)',color:'#10b981',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:6 },
  statusRed:   { background:'rgba(239,68,68,0.1)',color:'#ef4444',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:6 },
};
