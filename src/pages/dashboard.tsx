import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { subscribeToUser, subscribeToTransactions } from '../lib/db';
import BottomNav from '../components/BottomNav';
import '../styles/theme.css';

const SERVICES = [
  { icon:'↑',   label:'Send',       path:'/send',          color:'#00e5cc' },
  { icon:'📷',  label:'Scan & Pay', path:'/scan',          color:'#4d8af0' },
  { icon:'+',   label:'Add Money',  path:'/add-money',     color:'#00d68f' },
  { icon:'↓',   label:'Request',    path:'/request',       color:'#a78bfa' },
  { icon:'📱',  label:'Recharge',   path:'/recharge',      color:'#f4b942' },
  { icon:'⚡',  label:'Bills',      path:'/bill-payments', color:'#00e5cc' },
  { icon:'📺',  label:'DTH',        path:'/recharge',      color:'#4d8af0' },
  { icon:'🏦',  label:'Bank',       path:'/link-bank',     color:'#00d68f' },
  { icon:'₿',   label:'Crypto',     path:'/crypto',        color:'#f7931a' },
  { icon:'🥇',  label:'Gold',       path:'/gold',          color:'#f4b942' },
  { icon:'📈',  label:'Stocks',     path:'/stocks',        color:'#00d68f' },
  { icon:'🏦',  label:'CIBIL',      path:'/cibil',         color:'#a78bfa' },
  { icon:'🛡️',  label:'Insurance',  path:'/insurance',     color:'#4d8af0' },
  { icon:'💸',  label:'Loans',      path:'/loans',         color:'#f4b942' },
  { icon:'🎬',  label:'Movies',     path:'/movies',        color:'#ff4d6a' },
  { icon:'✈️',  label:'Travel',     path:'/travel',        color:'#00e5cc' },
];

export default function Dashboard() {
  const { user, userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [profile,  setProfile]  = useState<any>(userProfile);
  const [txns,     setTxns]     = useState<any[]>([]);
  const [balVis,   setBalVis]   = useState(true);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeToUser(user.uid, setProfile);
    const u2 = subscribeToTransactions(user.uid, t => setTxns(t.slice(0, 4)));
    return () => { u1(); u2(); };
  }, [user]);

  const bal    = profile?.balance || 0;
  const points = profile?.rewardPoints || 0;
  const name   = profile?.name || 'User';
  const kyc    = profile?.kycStatus || 'not_started';
  const fmt    = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits:2 })}`;

  const greet = () => {
    const h = new Date().getHours();
    return h < 12 ? '☀️ Good morning' : h < 17 ? '🌤 Good afternoon' : '🌙 Good evening';
  };

  const fmtDate = (ts: any) => {
    if (!ts?.toDate) return '';
    const d   = ts.toDate();
    const now = new Date();
    const diff= now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  };

  return (
    <div className="page" style={{ paddingBottom:'calc(var(--nav-h) + 16px)' }}>

      {/* ── HERO HEADER ── */}
      <div style={{ background:'linear-gradient(160deg,#050914 0%,#0a1428 60%,#050e1e 100%)',
                     padding:'52px 20px 0' }}>

        {/* Top row */}
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <button onClick={() => navigate('/profile')}
              style={{ width:44,height:44,borderRadius:'50%',background:'linear-gradient(135deg,#00e5cc,#00b4a0)',
                        border:'none',cursor:'pointer',
                        display:'flex',alignItems:'center',justifyContent:'center',
                        fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:16,color:'#000' }}>
              {name.charAt(0).toUpperCase()}
            </button>
            <div>
              <p style={{ color:'var(--t2)',fontSize:11 }}>{greet()},</p>
              <p style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:17,color:'var(--t1)' }}>
                {name.split(' ')[0]}
              </p>
            </div>
          </div>
          <div style={{ display:'flex',gap:8 }}>
            <button onClick={() => navigate('/notifications')} style={iconBtn}>🔔</button>
            <button onClick={() => navigate('/scan')}          style={iconBtn}>⬜</button>
          </div>
        </div>

        {/* Balance card */}
        <div style={{ background:'rgba(255,255,255,0.03)',border:'1px solid var(--b1)',
                       borderRadius:'var(--r3)',padding:'22px 20px',
                       backdropFilter:'blur(20px)',marginBottom:20 }}>

          {/* KYC banner */}
          {kyc !== 'verified' && (
            <button onClick={() => navigate('/kyc')}
              style={{ display:'flex',alignItems:'center',gap:8,width:'100%',
                        background:'rgba(244,185,66,0.08)',border:'1px solid rgba(244,185,66,0.2)',
                        borderRadius:'var(--r1)',padding:'9px 12px',marginBottom:16,
                        cursor:'pointer' }}>
              <span style={{ fontSize:14 }}>⚠️</span>
              <span style={{ color:'var(--gold)',fontSize:12,fontWeight:600,flex:1,textAlign:'left' }}>
                Complete KYC to unlock ₹1L/day limit
              </span>
              <span style={{ color:'var(--gold)',fontSize:12 }}>→</span>
            </button>
          )}

          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
            <div>
              <p style={{ color:'var(--t3)',fontSize:11,letterSpacing:1,marginBottom:8 }}>WALLET BALANCE</p>
              <div style={{ display:'flex',alignItems:'baseline',gap:6 }}>
                <span style={{ color:'var(--t2)',fontSize:20 }}>₹</span>
                <span style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:40,
                               color:'var(--t1)',letterSpacing:-1,lineHeight:1 }}>
                  {balVis ? bal.toLocaleString('en-IN') : '••••••'}
                </span>
              </div>
              <p style={{ color:'var(--t3)',fontSize:12,marginTop:6 }}>
                {profile?.phone ? `${profile.phone}@inrt` : ''}
              </p>
            </div>
            <button onClick={() => setBalVis(v => !v)}
              style={{ background:'var(--bg-elevated)',border:'1px solid var(--b1)',
                        borderRadius:'var(--r1)',padding:'8px 10px',color:'var(--t2)',
                        cursor:'pointer',fontSize:14 }}>
              {balVis ? '👁' : '👁‍🗨'}
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display:'flex',gap:8,marginTop:18,paddingTop:16,borderTop:'1px solid var(--b1)' }}>
            {[
              { label:'Received', val:fmt(profile?.totalReceived||0), color:'var(--green)' },
              { label:'Sent',     val:fmt(profile?.totalSent||0),     color:'var(--red)' },
              { label:'Points',   val:points.toLocaleString(),         color:'var(--gold)' },
            ].map(s => (
              <div key={s.label} style={{ flex:1,textAlign:'center' }}>
                <p style={{ color:s.color,fontWeight:700,fontSize:14 }}>{s.val}</p>
                <p style={{ color:'var(--t3)',fontSize:10,marginTop:2 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display:'flex',gap:10,paddingBottom:24 }}>
          {[
            { icon:'↑', label:'Send',    path:'/send' },
            { icon:'📷',label:'Scan',    path:'/scan' },
            { icon:'+', label:'Add',     path:'/add-money' },
            { icon:'↓', label:'Request', path:'/request' },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)}
              style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:8,
                        background:'rgba(255,255,255,0.04)',border:'1px solid var(--b1)',
                        borderRadius:'var(--r2)',padding:'14px 0',cursor:'pointer',transition:'all 0.2s' }}>
              <div style={{ width:40,height:40,borderRadius:'var(--r1)',
                             background:'var(--g-teal)',display:'flex',alignItems:'center',
                             justifyContent:'center',fontSize:16,fontWeight:700,color:'#000' }}>
                {a.icon}
              </div>
              <span style={{ color:'var(--t1)',fontSize:11,fontWeight:600 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ padding:'20px 16px 0' }}>

        {/* Services grid */}
        <p className="s-title">All Services</p>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24 }}>
          {SERVICES.map(svc => (
            <button key={svc.label + svc.path} onClick={() => navigate(svc.path)}
              style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8,
                        background:'var(--bg-card)',border:'1px solid var(--b1)',
                        borderRadius:'var(--r2)',padding:'16px 8px',cursor:'pointer',
                        transition:'all 0.2s' }}>
              <div style={{ width:44,height:44,borderRadius:'var(--r1)',
                             background:`${svc.color}18`,border:`1px solid ${svc.color}28`,
                             display:'flex',alignItems:'center',justifyContent:'center',fontSize:20 }}>
                {svc.icon}
              </div>
              <span style={{ color:'var(--t2)',fontSize:10,fontWeight:600,textAlign:'center',
                              lineHeight:1.3 }}>
                {svc.label}
              </span>
            </button>
          ))}
        </div>

        {/* Rewards banner */}
        <button onClick={() => navigate('/rewards')}
          style={{ width:'100%',background:'linear-gradient(135deg,rgba(244,185,66,0.1),rgba(244,185,66,0.04))',
                    border:'1px solid rgba(244,185,66,0.2)',borderRadius:'var(--r3)',
                    padding:'16px 20px',display:'flex',alignItems:'center',gap:16,
                    cursor:'pointer',marginBottom:24,textAlign:'left' }}>
          <div style={{ width:48,height:48,borderRadius:'var(--r2)',background:'var(--g-gold)',
                         display:'flex',alignItems:'center',justifyContent:'center',
                         fontSize:24,flexShrink:0 }}>🎁</div>
          <div style={{ flex:1 }}>
            <p style={{ fontFamily:'var(--f-display)',fontWeight:700,color:'var(--gold)',fontSize:15 }}>
              {points} Reward Points
            </p>
            <p style={{ color:'var(--t3)',fontSize:12,marginTop:2 }}>
              ≈ ₹{(points * 0.25).toFixed(0)} cashback available
            </p>
          </div>
          <span style={{ color:'var(--gold)',fontSize:18 }}>→</span>
        </button>

        {/* Recent Transactions */}
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
          <p className="s-title" style={{ marginBottom:0 }}>Recent Transactions</p>
          <button onClick={() => navigate('/history')} className="btn-ghost" style={{ fontSize:13 }}>
            View all →
          </button>
        </div>

        {txns.length === 0 ? (
          <div style={{ textAlign:'center',padding:'40px 0',color:'var(--t3)' }}>
            <p style={{ fontSize:36,marginBottom:12 }}>💳</p>
            <p style={{ fontWeight:600,fontSize:14,color:'var(--t2)' }}>No transactions yet</p>
            <p style={{ fontSize:12,marginTop:4 }}>Start by adding money to your wallet</p>
          </div>
        ) : (
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {txns.map(tx => (
              <div key={tx.id}
                style={{ background:'var(--bg-card)',border:'1px solid var(--b1)',
                          borderRadius:'var(--r2)',padding:'14px',
                          display:'flex',alignItems:'center',gap:14 }}>
                <div style={{ width:42,height:42,borderRadius:'var(--r1)',flexShrink:0,
                               background:tx.type==='debit'?'rgba(255,77,106,0.1)':'rgba(0,214,143,0.1)',
                               display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>
                  {tx.type==='debit'?'↑':'↓'}
                </div>
                <div style={{ flex:1,minWidth:0 }}>
                  <p style={{ fontWeight:600,fontSize:14,color:'var(--t1)',
                               whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                    {tx.note || (tx.type==='debit'?'Sent':'Received')}
                  </p>
                  <p style={{ fontSize:11,color:'var(--t3)',marginTop:2 }}>
                    {fmtDate(tx.createdAt)}
                  </p>
                </div>
                <span style={{ fontWeight:800,fontSize:15,flexShrink:0,
                               color:tx.type==='debit'?'var(--red)':'var(--green)' }}>
                  {tx.type==='debit'?'-':'+'}₹{(tx.amount||0).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width:42,height:42,borderRadius:'var(--r1)',
  background:'rgba(255,255,255,0.04)',
  border:'1px solid var(--b1)',color:'var(--t1)',
  fontSize:16,cursor:'pointer',
  display:'flex',alignItems:'center',justifyContent:'center',
};
