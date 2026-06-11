/**
 * INRT WALLET — Dashboard.tsx
 * INRTPay V2 design + real Firebase data
 * Fix: reads ALL data directly from Firestore subscription
 */

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../context/AuthContext';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db as firestoreDb }   from '../lib/firebase';
import '../styles/theme.css';

const T = {
  navy:'#0A2540', accent:'#0070F3', inrt:'#7B2FBE',
  green:'#00C853', greenL:'#E8FAF0', orange:'#FF9500',
  gold:'#FFD60A', red:'#FF3B30', teal:'#00e5cc',
  border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8',
  text:'#0A2540', card:'#FFFFFF',
};

function Chip({ children, color=T.accent, bg }: { children:React.ReactNode; color?:string; bg?:string }) {
  return (
    <span style={{ background:bg||color+'18', color, fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, letterSpacing:0.2, whiteSpace:'nowrap' as const, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      {children}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Direct Firestore subscription — no stale data ──────────
  const [profile, setProfile] = useState<any>(null);
  const [txns,    setTxns]    = useState<any[]>([]);
  const [balVis,  setBalVis]  = useState(true);
  const [ready,   setReady]   = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    // Subscribe directly to Firestore user document
    const unsubUser = onSnapshot(
      doc(firestoreDb, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          console.log('Firestore user data:', data); // debug
          setProfile(data);
          setReady(true);
        }
      },
      (err) => console.error('User snapshot error:', err)
    );

    // Subscribe to transactions
    const q = query(
      collection(firestoreDb, 'transactions'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5),
    );
    const unsubTxns = onSnapshot(q, (snap) => {
      setTxns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubUser(); unsubTxns(); };
  }, [user?.uid]);

  // ── Read directly from Firestore data — no fallback to stale ─
  const bal     = Number(profile?.balance      ?? 0);
const inrtBal = Number(profile?.rewardPoints ?? 0);
const points  = Number(profile?.rewardPoints ?? 0);
  const name     = profile?.name      || user?.displayName || 'User';
  const phone    = profile?.phone     || '';
  const kyc      = profile?.kycStatus || 'not_started';
  const initials = name.split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase();
  const month    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][new Date().getMonth()];

  const fmtDate = (ts:any) => {
    if (!ts?.toDate) return '';
    const d = ts.toDate(), diff = Date.now() - d.getTime();
    if (diff < 3600000)   return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000)  return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  };

  const ACTIONS = [
    { label:'Send',      icon:'📤', path:'/send',          color:T.accent  },
    { label:'Request',   icon:'📥', path:'/request',       color:T.green   },
    { label:'Recharge',  icon:'📱', path:'/recharge',      color:T.orange  },
    { label:'Bills',     icon:'🧾', path:'/bill-payments', color:'#FF6B35' },
    { label:'INRT',      icon:'🪙', path:'/crypto',        color:T.inrt    },
    { label:'Scan',      icon:'📷', path:'/scan',          color:T.navy    },
    { label:'History',   icon:'📋', path:'/history',       color:T.muted   },
    { label:'Add Money', icon:'+',  path:'/add-money',     color:T.teal    },
  ];

  const TX_ICON: Record<string,string> = {
    bills:'🧾', recharge:'📱', rewards:'🎁', crypto:'₿',
    gold:'🥇', transfer:'💸', add_money:'💳',
  };

  // Show loading until first Firestore snapshot arrives
  if (!ready) return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#F6F8FA', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:44, height:44, border:'4px solid rgba(10,37,64,0.1)', borderTopColor:T.navy, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }}/>
        <p style={{ color:T.muted, fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:14 }}>Loading your wallet…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:'#F6F8FA', fontFamily:"'Plus Jakarta Sans',sans-serif", paddingBottom:80 }}>

      {/* ── HERO HEADER ───────────────────────────────────── */}
      <div style={{ background:`linear-gradient(145deg,${T.navy} 0%,#1565C0 100%)`, padding:'22px 20px 80px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>
        <div style={{ position:'absolute', bottom:-40, left:-30, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,0.03)' }}/>

        {/* Top row */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22, position:'relative' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={()=>navigate('/profile')}
              style={{ width:44, height:44, borderRadius:'50%', background:'rgba(255,255,255,0.15)', border:'1.5px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff', fontFamily:"'Plus Jakarta Sans',sans-serif", cursor:'pointer' }}>
              {initials}
            </button>
            <div>
              <p style={{ color:'rgba(255,255,255,0.6)', fontSize:12, margin:0 }}>Welcome back 👋</p>
              <p style={{ color:'#fff', fontSize:16, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{name.split(' ')[0]}</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>navigate('/scan')}  style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:16 }}>📷</button>
            <button onClick={()=>navigate('/notifications')} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:16 }}>🔔</button>
          </div>
        </div>

        {/* KYC banner */}
        {kyc !== 'verified' && (
          <button onClick={()=>navigate('/kyc')}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', background:'rgba(255,214,10,0.12)', border:'1px solid rgba(255,214,10,0.3)', borderRadius:12, padding:'9px 12px', marginBottom:14, cursor:'pointer' }}>
            <span style={{ fontSize:14 }}>⚠️</span>
            <span style={{ color:T.gold, fontSize:12, fontWeight:600, flex:1, textAlign:'left' }}>Complete KYC to unlock ₹1L/day limit</span>
            <span style={{ color:T.gold, fontSize:12 }}>→</span>
          </button>
        )}

        {/* Balance cards */}
        <div style={{ display:'flex', gap:10, position:'relative' }}>
          {/* Wallet */}
          <div style={{ flex:1, background:'rgba(255,255,255,0.1)', borderRadius:18, padding:'16px', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <p style={{ color:'rgba(255,255,255,0.6)', fontSize:11, margin:0, letterSpacing:0.5 }}>WALLET BALANCE</p>
              <button onClick={()=>setBalVis(!balVis)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:14 }}>
                {balVis?'👁️':'🙈'}
              </button>
            </div>
            <p style={{ color:'#fff', fontSize:24, fontWeight:800, margin:'0 0 2px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {balVis ? `₹${bal.toLocaleString('en-IN',{minimumFractionDigits:2})}` : '₹ ••••••'}
            </p>
            <p style={{ color:'rgba(255,255,255,0.45)', fontSize:11, margin:0 }}>
              {phone ? `+91 ${phone}` : 'INRT Wallet'}
            </p>
          </div>

          {/* INRT */}
          <div onClick={()=>navigate('/crypto')}
            style={{ flex:1, background:'rgba(123,47,190,0.4)', borderRadius:18, padding:'16px', cursor:'pointer', border:'1px solid rgba(200,150,255,0.25)', backdropFilter:'blur(10px)' }}>
            <p style={{ color:'rgba(224,176,255,0.7)', fontSize:11, margin:'0 0 6px', letterSpacing:0.5 }}>INRT BALANCE</p>
            <p style={{ color:'#E0B0FF', fontSize:20, fontWeight:800, margin:'0 0 2px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {balVis ? inrtBal.toLocaleString('en-IN') : '••••'} INRT
            </p>
            <p style={{ color:'rgba(224,176,255,0.45)', fontSize:11, margin:0 }}>1 INRT = ₹1 · Stablecoin 🔒</p>
          </div>
        </div>
      </div>

      {/* ── QUICK ACTIONS ─────────────────────────────────── */}
      <div style={{ margin:'0 16px', marginTop:-44, position:'relative', zIndex:10 }}>
        <div style={{ background:T.card, borderRadius:18, border:`1px solid ${T.border}`, padding:'18px 16px', boxShadow:'0 4px 24px rgba(10,37,64,0.10)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {ACTIONS.map(a=>(
              <button key={a.path} onClick={()=>navigate(a.path)}
                style={{ background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column' as const, alignItems:'center', gap:6, padding:'8px 4px', borderRadius:12 }}>
                <div style={{ width:46, height:46, borderRadius:13, background:a.color+'15', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, border:`1px solid ${a.color}25` }}>
                  {a.icon}
                </div>
                <span style={{ fontSize:11, color:T.text, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif", textAlign:'center', lineHeight:1.3 }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding:'16px 16px 0' }}>

        {/* ── INRT GLOBAL PAY BANNER ─────────────────────── */}
        <div onClick={()=>navigate('/crypto')}
          style={{ background:`linear-gradient(120deg,${T.inrt} 0%,#3D0D7B 100%)`, borderRadius:18, padding:'18px 20px', marginBottom:16, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <Chip color="#E0B0FF" bg="rgba(255,255,255,0.15)">1 INRT = ₹1 · Stablecoin</Chip>
            <p style={{ color:'#fff', fontSize:17, fontWeight:800, margin:'8px 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Pay in Bali or Spain 🌍</p>
            <p style={{ color:'rgba(255,255,255,0.6)', fontSize:12, margin:0 }}>Zero forex charges with INRT</p>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40 }}>🪙</div>
            <p style={{ color:T.teal, fontSize:13, fontWeight:700, margin:'4px 0 0' }}>Always ₹1</p>
          </div>
        </div>

        {/* ── REWARDS PROGRESS ──────────────────────────── */}
        <div style={{ background:T.card, borderRadius:18, border:`1px solid ${T.border}`, padding:'16px 18px', boxShadow:'0 2px 12px rgba(10,37,64,0.08)', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:20 }}>🏆</span>
              <div>
                <p style={{ fontWeight:800, fontSize:14, margin:0, color:T.text }}>
                  INRT Rewards — {points>=5000?'Platinum':points>=1000?'Gold':'Silver'}
                </p>
                <p style={{ fontSize:12, color:T.muted, margin:0 }}>{points.toLocaleString()} INRT earned</p>
              </div>
            </div>
            <Chip color={T.gold} bg={T.gold+'18'}>+{Math.floor(points*0.1)} {month}</Chip>
          </div>
          <div style={{ height:6, background:T.light, borderRadius:10, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.min((points/5000)*100,100)}%`, background:`linear-gradient(90deg,${T.gold},${T.orange})`, borderRadius:10 }}/>
          </div>
          <p style={{ fontSize:11, color:T.muted, margin:'6px 0 0' }}>
            {points>=5000 ? 'Platinum member 🎉' : `${(5000-points).toLocaleString()} more INRT to reach Platinum`}
          </p>
        </div>

        {/* ── ALL SERVICES ──────────────────────────────── */}
        <h3 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:16, color:T.text, margin:'0 0 12px' }}>All Services</h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
          {[
            { label:'Stocks',    icon:'📈', path:'/stocks',     color:'#00897B' },
            { label:'Gold',      icon:'🥇', path:'/gold',       color:T.gold    },
            { label:'Insurance', icon:'🛡️', path:'/insurance',  color:T.accent  },
            { label:'Loans',     icon:'💸', path:'/loans',      color:T.orange  },
            { label:'CIBIL',     icon:'📊', path:'/cibil',      color:'#E91E63' },
            { label:'Split',     icon:'÷',  path:'/split-bill', color:T.inrt    },
            { label:'Movies',    icon:'🎬', path:'/movies',     color:T.red     },
            { label:'Travel',    icon:'✈️', path:'/travel',     color:'#00BCD4' },
          ].map(s=>(
            <button key={s.path} onClick={()=>navigate(s.path)}
              style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', gap:6, background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px 8px', cursor:'pointer', boxShadow:'0 1px 6px rgba(10,37,64,0.06)' }}>
              <div style={{ width:42, height:42, borderRadius:11, background:s.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, border:`1px solid ${s.color}25` }}>
                {s.icon}
              </div>
              <span style={{ fontSize:10, color:T.text, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif", textAlign:'center' }}>{s.label}</span>
            </button>
          ))}
        </div>

        {/* ── RECENT TRANSACTIONS ───────────────────────── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:16, color:T.text, margin:0 }}>Recent Transactions</h3>
          <button onClick={()=>navigate('/history')} style={{ color:T.accent, background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}>View all →</button>
        </div>

        {txns.length===0 ? (
          <div style={{ background:T.card, borderRadius:18, border:`1px solid ${T.border}`, padding:'40px 20px', textAlign:'center', boxShadow:'0 2px 12px rgba(10,37,64,0.06)' }}>
            <p style={{ fontSize:36, marginBottom:12 }}>💳</p>
            <p style={{ fontWeight:700, fontSize:15, color:T.text, margin:'0 0 4px' }}>No transactions yet</p>
            <p style={{ fontSize:13, color:T.muted, margin:0 }}>Start by adding money to your wallet</p>
          </div>
        ) : (
          <div style={{ background:T.card, borderRadius:18, border:`1px solid ${T.border}`, padding:0, overflow:'hidden', boxShadow:'0 2px 12px rgba(10,37,64,0.06)' }}>
            {txns.map((tx,i)=>(
              <div key={tx.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', borderBottom:i<txns.length-1?`1px solid ${T.border}`:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:44, height:44, borderRadius:13, background:tx.type==='credit'?T.greenL:T.light, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    {TX_ICON[tx.cat]||(tx.type==='credit'?'↙️':'↗️')}
                  </div>
                  <div>
                    <p style={{ fontWeight:700, fontSize:14, margin:0, color:T.text, whiteSpace:'nowrap' as const, overflow:'hidden', textOverflow:'ellipsis', maxWidth:140 }}>
                      {tx.note||(tx.type==='credit'?'Received':'Sent')}
                    </p>
                    <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0' }}>{fmtDate(tx.createdAt)}</p>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ fontWeight:800, fontSize:15, margin:'0 0 3px', color:tx.type==='credit'?T.green:T.text }}>
                    {tx.type==='credit'?'+':'−'}₹{(tx.amount||0).toLocaleString('en-IN')}
                  </p>
                  <Chip color={T.green}>✓ Done</Chip>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── STATS ROW ─────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:16, marginBottom:16 }}>
          {[
            { label:'Total Received', val:`₹${(profile?.totalReceived||0).toLocaleString('en-IN')}`, color:T.green },
            { label:'Total Sent',     val:`₹${(profile?.totalSent||0).toLocaleString('en-IN')}`,     color:T.red   },
            { label:'Reward Points',  val:points.toLocaleString(),                                     color:T.gold  },
          ].map(s=>(
            <div key={s.label} style={{ background:T.card, borderRadius:14, border:`1px solid ${T.border}`, padding:'12px 10px', textAlign:'center', boxShadow:'0 1px 6px rgba(10,37,64,0.06)' }}>
              <p style={{ color:s.color, fontWeight:800, fontSize:14, margin:'0 0 4px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{s.val}</p>
              <p style={{ fontSize:10, color:T.muted, margin:0, fontWeight:600 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM NAV ────────────────────────────────────── */}
      <nav style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, height:72, background:'rgba(255,255,255,0.97)', borderTop:`1px solid ${T.border}`, display:'flex', alignItems:'center', zIndex:200, padding:'0 8px 8px', backdropFilter:'blur(20px)' }}>
        {[
          { path:'/dashboard', icon:'🏠', label:'Home'    },
          { path:'/history',   icon:'📋', label:'History' },
          { path:'/add-money', icon:'+',  label:'Add',    special:true },
          { path:'/rewards',   icon:'🎁', label:'Rewards' },
          { path:'/profile',   icon:'👤', label:'Profile' },
        ].map(t=>(
          <button key={t.path} onClick={()=>navigate(t.path)}
            style={{ flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center', gap:(t as any).special?0:3, cursor:'pointer', background:'none', border:'none', padding:'6px 0', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
            {(t as any).special ? (
              <div style={{ width:44, height:44, borderRadius:'50%', background:`linear-gradient(135deg,${T.teal},#00b4a0)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#000', fontSize:24, fontWeight:900, boxShadow:'0 4px 16px rgba(0,229,204,0.4)', marginTop:-8 }}>+</div>
            ) : (
              <>
                <span style={{ fontSize:22, lineHeight:1 }}>{t.icon}</span>
                <span style={{ fontSize:10, fontWeight:600, color:T.muted }}>{t.label}</span>
              </>
            )}
          </button>
        ))}
      </nav>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.97) !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
