import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, orderBy, limit, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import BottomNav from '../components/BottomNav';
import '../styles/theme.css';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db,'notifications'),where('uid','==',user.uid),orderBy('createdAt','desc'),limit(30));
    getDocs(q).then(snap => {
      setNotifs(snap.docs.map(d => ({id:d.id,...d.data()})));
      setLoading(false);
    });
  },[user]);

  const markRead = async (id: string) => {
    await updateDoc(doc(db,'notifications',id),{read:true});
    setNotifs(n => n.map(x => x.id===id?{...x,read:true}:x));
  };

  const ICONS: Record<string,string> = {
    transaction:'💸',info:'ℹ️',reward:'🎁',kyc:'🪪',security:'🔐'};

  return (
    <div className="page">
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 16px',
                     display:'flex',alignItems:'center',gap:14,borderBottom:'1px solid var(--b1)' }}>
        <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
        <h1 className="page-title">Notifications</h1>
        <span className="badge-teal">{notifs.filter(n=>!n.read).length} New</span>
      </div>
      <div style={{ padding:'16px 16px 0' }}>
        {loading ? (
          [1,2,3].map(i=><div key={i} className="shimmer" style={{height:70,marginBottom:10}}/>)
        ) : notifs.length === 0 ? (
          <div style={{ textAlign:'center',padding:'60px 0',color:'var(--t3)' }}>
            <p style={{fontSize:48,marginBottom:12}}>🔔</p>
            <p style={{color:'var(--t2)',fontWeight:600}}>All caught up!</p>
          </div>
        ) : notifs.map(n => (
          <div key={n.id} onClick={()=>markRead(n.id)}
            style={{ background:n.read?'var(--bg-card)':'var(--bg-elevated)',
                      border:`1px solid ${n.read?'var(--b1)':'var(--b2)'}`,
                      borderRadius:'var(--r2)',padding:'14px',marginBottom:10,
                      display:'flex',gap:14,cursor:'pointer' }}>
            <span style={{fontSize:24,flexShrink:0}}>{ICONS[n.type]||'🔔'}</span>
            <div style={{flex:1}}>
              <p style={{color:'var(--t1)',fontWeight:600,fontSize:14}}>{n.title}</p>
              <p style={{color:'var(--t2)',fontSize:12,marginTop:3}}>{n.body}</p>
            </div>
            {!n.read && <div style={{width:8,height:8,borderRadius:'50%',background:'var(--teal)',flexShrink:0,marginTop:4}}/>}
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}