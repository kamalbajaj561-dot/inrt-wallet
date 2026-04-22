import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import BottomNav from '../components/BottomNav';
import '../styles/theme.css';

export default function Insights() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [txns, setTxns] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db,'transactions'),where('uid','==',user.uid),orderBy('createdAt','desc'),limit(50)))
      .then(snap => setTxns(snap.docs.map(d=>({id:d.id,...d.data()}))));
  },[user]);

  const cats = txns.reduce((acc,t) => {
    if (t.type !== 'debit') return acc;
    const c = t.cat || 'other';
    acc[c] = (acc[c]||0) + (t.amount||0);
    return acc;
  },{} as Record<string,number>);

  const total = Object.values(cats).reduce((a,b)=>a+b,0);
  const CAT_COLORS: Record<string,string> = {
    recharge:'#f4b942',bills:'#00e5cc',crypto:'#f7931a',
    gold:'#f4b942',transfer:'#4d8af0',other:'#a78bfa'
  };
  const sorted = Object.entries(cats).sort(([,a],[,b])=>b-a);

  return (
    <div className="page">
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 16px',
                    display:'flex',alignItems:'center',gap:14,borderBottom:'1px solid var(--b1)'}}>
        <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
        <h1 className="page-title">Spending Insights</h1>
      </div>
      <div style={{padding:'20px 16px 0'}}>
        <div className="card" style={{marginBottom:20}}>
          <p className="s-label">TOTAL SPENDING (LAST 50 TX)</p>
          <p style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:32,color:'var(--red)',marginTop:6}}>
            ₹{total.toLocaleString('en-IN')}
          </p>
        </div>
        {sorted.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--t3)'}}>
            <p style={{fontSize:48,marginBottom:12}}>📊</p>
            <p style={{color:'var(--t2)',fontWeight:600}}>No spending data yet</p>
          </div>
        ) : (
          sorted.map(([cat, amt]) => {
            const pct = total > 0 ? (amt/total)*100 : 0;
            const c   = CAT_COLORS[cat] || '#4d8af0';
            return (
              <div key={cat} style={{background:'var(--bg-card)',border:'1px solid var(--b1)',
                                      borderRadius:'var(--r2)',padding:'16px',marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                  <span style={{color:'var(--t1)',fontWeight:600,textTransform:'capitalize'}}>{cat}</span>
                  <div style={{textAlign:'right'}}>
                    <span style={{color:'var(--t1)',fontWeight:700}}>₹{amt.toLocaleString('en-IN')}</span>
                    <span style={{color:'var(--t3)',fontSize:12,marginLeft:8}}>{pct.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{background:'var(--bg-elevated)',borderRadius:8,height:8,overflow:'hidden'}}>
                  <div style={{width:`${pct}%`,height:'100%',background:c,borderRadius:8,transition:'width 0.8s ease'}}/>
                </div>
              </div>
            );
          })
        )}
      </div>
      <BottomNav />
    </div>
  );
}