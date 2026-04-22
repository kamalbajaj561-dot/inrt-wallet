import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  collection, query, where, orderBy, limit,
  startAfter, getDocs, type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import BottomNav from '../components/BottomNav';
import '../styles/theme.css';

const CAT_ICONS: Record<string,string> = {
  transfer:'↑↓', recharge:'📱', bills:'⚡', crypto:'₿',
  gold:'🥇', add_money:'💳', rewards:'🎁', default:'💰',
};

export default function TransactionHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [txns,    setTxns]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot|null>(null);
  const [filter,  setFilter]  = useState<'all'|'credit'|'debit'>('all');
  const [search,  setSearch]  = useState('');
  const PAGE = 20;

  const fetch = useCallback(async (more = false) => {
    if (!user) return;
    more ? null : setLoading(true);
    try {
      let q = filter === 'all'
        ? query(collection(db,'transactions'),where('uid','==',user.uid),orderBy('createdAt','desc'),limit(PAGE))
        : query(collection(db,'transactions'),where('uid','==',user.uid),where('type','==',filter),orderBy('createdAt','desc'),limit(PAGE));
      if (more && lastDoc) q = query(q, startAfter(lastDoc));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d=>({id:d.id,...d.data()}));
      setTxns(p => more ? [...p,...docs] : docs);
      setLastDoc(snap.docs[snap.docs.length-1]||null);
      setHasMore(snap.docs.length===PAGE);
    } catch(e){ console.error(e); }
    setLoading(false);
  },[user,filter,lastDoc]);

  useEffect(()=>{ setTxns([]); setLastDoc(null); fetch(false); },[user,filter]);

  const filtered = txns.filter(t => !search ||
    (t.note||'').toLowerCase().includes(search.toLowerCase()));

  const fmtDate = (ts: any) => {
    if (!ts?.toDate) return '';
    const d = ts.toDate();
    const diff = Date.now() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  };

  const totals = txns.reduce((a,t)=>{
    if (t.type==='credit') a.in+=t.amount||0;
    else a.out+=t.amount||0;
    return a;
  },{in:0,out:0});

  const grouped: Record<string,any[]> = {};
  filtered.forEach(t => {
    const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
    const k = d.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
    if (!grouped[k]) grouped[k]=[];
    grouped[k].push(t);
  });

  return (
    <div className="page">
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',
                    padding:'52px 20px 12px',borderBottom:'1px solid var(--b1)'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Transactions</h1>
          <button onClick={()=>fetch(false)} style={{background:'none',border:'none',color:'var(--teal)',fontSize:20,cursor:'pointer'}}>↻</button>
        </div>
        {/* Summary */}
        <div style={{display:'flex',gap:10,marginBottom:12}}>
          {[{l:'Money In',v:`+₹${totals.in.toLocaleString('en-IN')}`,c:'var(--green)'},
            {l:'Money Out',v:`-₹${totals.out.toLocaleString('en-IN')}`,c:'var(--red)'},
            {l:'Net',v:`₹${(totals.in-totals.out).toLocaleString('en-IN')}`,c:totals.in-totals.out>=0?'var(--green)':'var(--red)'},
          ].map(s=>(
            <div key={s.l} style={{flex:1,background:'rgba(255,255,255,0.03)',border:'1px solid var(--b1)',borderRadius:'var(--r1)',padding:'10px 12px'}}>
              <p style={{color:'var(--t3)',fontSize:9,fontWeight:700,letterSpacing:0.5}}>{s.l.toUpperCase()}</p>
              <p style={{color:s.c,fontWeight:800,fontSize:13,marginTop:4}}>{s.v}</p>
            </div>
          ))}
        </div>
        {/* Filters */}
        <div style={{display:'flex',gap:8}}>
          {(['all','credit','debit'] as const).map(f=>(
            <button key={f} onClick={()=>{setFilter(f);setTxns([]);setLastDoc(null);}}
              style={{flex:1,padding:'8px 0',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer',
                       background:filter===f?(f==='credit'?'rgba(0,214,143,0.12)':f==='debit'?'rgba(255,77,106,0.12)':'var(--teal-dim)'):'var(--bg-elevated)',
                       border:`1px solid ${filter===f?(f==='credit'?'var(--green)':f==='debit'?'var(--red)':'var(--teal)'):'var(--b1)'}`,
                       color:filter===f?(f==='credit'?'var(--green)':f==='debit'?'var(--red)':'var(--teal)'):'var(--t3)'}}>
              {f==='all'?'All':f==='credit'?'↓ In':'↑ Out'}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:'12px 16px 0'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Search transactions…"
          style={{width:'100%',background:'var(--bg-elevated)',border:'1px solid var(--b1)',borderRadius:'var(--r1)',
                   padding:'11px 14px',fontSize:14,color:'var(--t1)',outline:'none',
                   fontFamily:'inherit',boxSizing:'border-box',marginBottom:12}} />

        {loading ? [1,2,3,4,5].map(i=>(
          <div key={i} className="shimmer" style={{height:68,borderRadius:'var(--r2)',marginBottom:10}}/>
        )) : filtered.length===0 ? (
          <div style={{textAlign:'center',padding:'60px 0'}}>
            <p style={{fontSize:48,marginBottom:12}}>📭</p>
            <p style={{color:'var(--t2)',fontWeight:600,fontSize:16}}>
              {search?'No results':'No transactions yet'}
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([date, dayTxns])=>(
            <div key={date}>
              <p style={{color:'var(--t3)',fontSize:10,fontWeight:700,letterSpacing:0.5,
                           padding:'8px 0 4px',textTransform:'uppercase'}}>{date}</p>
              {dayTxns.map(tx=>(
                <div key={tx.id} style={{background:'var(--bg-card)',border:'1px solid var(--b1)',
                                          borderRadius:'var(--r2)',padding:'13px',
                                          display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                  <div style={{width:42,height:42,borderRadius:'var(--r1)',flexShrink:0,
                                 background:tx.type==='credit'?'rgba(0,214,143,0.1)':'rgba(255,77,106,0.1)',
                                 display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>
                    {CAT_ICONS[tx.cat]||(tx.type==='credit'?'↓':'↑')}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{color:'var(--t1)',fontWeight:600,fontSize:14,
                                 whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {tx.note||'Transaction'}
                    </p>
                    <p style={{color:'var(--t3)',fontSize:11,marginTop:2}}>{fmtDate(tx.createdAt)}</p>
                  </div>
                  <span style={{color:tx.type==='credit'?'var(--green)':'var(--red)',fontWeight:800,fontSize:15,flexShrink:0}}>
                    {tx.type==='credit'?'+':'-'}₹{(tx.amount||0).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
        {hasMore && !loading && filtered.length>0 && (
          <button onClick={()=>fetch(true)}
            style={{width:'100%',padding:'13px',background:'var(--bg-card)',border:'1px solid var(--b1)',
                     borderRadius:'var(--r2)',color:'var(--teal)',fontWeight:600,fontSize:14,cursor:'pointer',marginBottom:8}}>
            Load more
          </button>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
