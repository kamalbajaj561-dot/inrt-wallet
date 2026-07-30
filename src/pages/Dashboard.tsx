/**
 * INRT WALLET — Dashboard.tsx
 *
 * NATIONAL mode: pure domestic rupee wallet, Paytm-style. NO mention of
 * INRT, crypto, blockchain, or "stablecoin" anywhere in this branch —
 * a user who only wants to pay bills in India should never see it.
 *
 * INTERNATIONAL mode: INRT / Polygon wallet, Binance-style dark theme.
 *
 * Same bottom nav tabs in both modes; content + theme differ.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useAuth }             from '../context/AuthContext';
import { useAppMode }          from '../context/AppModeContext';
import { doc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db as firestoreDb }   from '../lib/firebase';
import ModeDrawer              from '../components/ModeDrawer';
import '../styles/theme.css';

const CARD_GRADIENTS = [
  'linear-gradient(135deg,#1B2A4A,#3D5A99)',
  'linear-gradient(135deg,#4A2545,#8B3A6B)',
  'linear-gradient(135deg,#1F3A34,#2E7D6B)',
  'linear-gradient(135deg,#3A2A1F,#B8763E)',
  'linear-gradient(135deg,#2A1F3A,#6B4A9E)',
  'linear-gradient(135deg,#1F2A3A,#3E7DB8)',
  'linear-gradient(135deg,#3A1F2A,#B83E5C)',
  'linear-gradient(135deg,#232B23,#4A6A4A)',
];

const NATIONAL_SUBS: Record<string,string> = {
  'Send Money':'Instant UPI transfer', 'Scan & Pay':'Scan any QR code',
  'Recharge':'Prepaid & postpaid', 'Electricity':'Pay any board',
  'DTH':'All operators', 'Gas':'LPG & piped gas',
  'Insurance':'Life & health premium', 'History':'View past payments',
};

const THEMES = {
  national: {
    bg:'#F5F7FA', card:'#FFFFFF', border:'#E8ECF0', text:'#0A2540', muted:'#6B7C93', light:'#F0F4F8',
    navy:'#0A2540', accent:'#0070F3', primary:'#00BAF2', green:'#00C853', greenL:'#E8FAF0',
    orange:'#FF9500', gold:'#E0A100', red:'#FF3B30',
    headerGrad:'linear-gradient(135deg,#002E6E 0%,#00BAF2 100%)',
    navBg:'rgba(255,255,255,0.97)', navBorder:'#E8ECF0',
  },
  international: {
    bg:'#0B0E11', card:'#181A20', border:'rgba(255,255,255,0.08)', text:'#EAECEF', muted:'#848E9C', light:'#1E2126',
    navy:'#0B0E11', accent:'#00e5cc', inrt:'#7B2FBE', green:'#0ECB81', greenL:'rgba(14,203,129,0.12)',
    orange:'#F0B90B', gold:'#F0B90B', red:'#F6465D', teal:'#00e5cc',
    headerGrad:'linear-gradient(145deg,#0B0E11 0%,#181A20 100%)',
    navBg:'rgba(11,14,17,0.97)', navBorder:'rgba(255,255,255,0.08)',
  },
} as const;

function Chip({ children, color, bg }: { children:React.ReactNode; color:string; bg?:string }) {
  return (
    <span style={{ background:bg||color+'18', color, fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, letterSpacing:0.2, whiteSpace:'nowrap' as const, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      {children}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { mode } = useAppMode();
  const T: any = THEMES[mode];
  const isIntl = mode === 'international';

  const [profile, setProfile]     = useState<any>(null);
  const [txns,    setTxns]        = useState<any[]>([]);
  const [balVis,  setBalVis]      = useState(true);
  const [ready,   setReady]       = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubUser = onSnapshot(
      doc(firestoreDb, 'users', user.uid),
      (snap) => {
        if (snap.exists()) { setProfile(snap.data()); setReady(true); }
      }
    );
    const q = query(
      collection(firestoreDb, 'transactions'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(5),
    );
    const unsubTxns = onSnapshot(q, snap => {
      setTxns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUser(); unsubTxns(); };
  }, [user?.uid]);

  const inrtBal         = Number(profile?.inrtBalance ?? 0);
  const points           = Number(profile?.rewardPoints ?? 0);
  const name             = profile?.name     || user?.displayName || 'User';
  const kyc              = profile?.kycStatus|| 'not_started';
  const polygonWallet    = profile?.polygonWallet || null;
  const hasWallet        = !!polygonWallet;
  const shortWallet      = polygonWallet ? `${polygonWallet.slice(0,6)}…${polygonWallet.slice(-4)}` : '';
  const month    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][new Date().getMonth()];

  const fmtDate = (ts:any) => {
    if (!ts?.toDate) return '';
    const d = ts.toDate(), diff = Date.now() - d.getTime();
    if (diff < 3600000)   return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000)  return d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  };

  const goBill = (categoryId: string) => navigate('/bill-payments', { state: { category: categoryId } });

  // National: pure domestic actions, zero INRT/crypto mentions
  const NATIONAL_ACTIONS = [
    { label:'Send Money',  icon:'📤', path:'/send'                         },
    { label:'Scan & Pay',  icon:'📷', path:'/scan'                         },
    { label:'Recharge',    icon:'📱', path:'/recharge'                     },
    { label:'Electricity', icon:'⚡', path:'/bill-payments', cat:'electricity' },
    { label:'DTH',         icon:'📡', path:'/bill-payments', cat:'dth'     },
    { label:'Gas',         icon:'🔥', path:'/bill-payments', cat:'gas'     },
    { label:'Insurance',   icon:'🛡️', path:'/bill-payments', cat:'insurance' },
    { label:'History',     icon:'📋', path:'/history'                      },
  ];

  // International: crypto/global-focused actions
  const INTERNATIONAL_ACTIONS = [
    { label:'Send',      icon:'📤', path:'/crypto',        color:T.inrt    },
    { label:'Receive',   icon:'📥', path:'/receive',       color:T.green   },
    { label:'Buy INRT',  icon:'🪙', path:'/checkout',      color:T.inrt   , mode:'buy' },
    { label:'Sell INRT', icon:'💸', path:'/checkout',      color:'#00897B', mode:'sell' },
    { label:'Wallet',    icon:'🔗', path:'/crypto',        color:T.teal    },
    { label:'Scan',      icon:'📷', path:'/scan',          color:T.muted   },
    { label:'History',   icon:'📋', path:'/history',       color:T.muted   },
    { label:'Rewards',   icon:'🏆', path:'/rewards',       color:T.gold    },
  ];

  const TX_ICON: Record<string,string> = {
    bills:'🧾', recharge:'📱', rewards:'🎁', crypto:'🪙',
    gold:'🥇', transfer:'💸', add_money:'💳',
  };

  if (!ready) return (
    <div style={{ width:'100%', minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:44, height:44, border:`4px solid ${T.light}`, borderTopColor:T.accent, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }}/>
        <p style={{ color:T.muted, fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:14 }}>Loading your wallet…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ width:'100%', minHeight:'100vh', background:T.bg, fontFamily:"'Plus Jakarta Sans',sans-serif", paddingBottom:80, transition:'background 0.2s' }}>

      {/* ── TEST MODE NOTICE — always visible, both modes ─── */}
      <div style={{ background:'rgba(255,214,10,0.14)', borderBottom:'1px solid rgba(255,214,10,0.3)', padding:'6px 16px', textAlign:'center' as const }}>
        <span style={{ color:'#B8860B', fontSize:11, fontWeight:700 }}>🧪 Test Mode — live payments are coming soon</span>
      </div>

      {/* ── HERO HEADER ───────────────────────────────────── */}
      <div style={{ background:T.headerGrad, padding: isIntl ? '20px 20px 80px' : '20px 20px 24px', position:'relative', overflow:'hidden' }}>
        {isIntl && <>
          <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,229,204,0.06),transparent 70%)', pointerEvents:'none' }}/>
          <div style={{ position:'absolute', bottom:-40, left:-30, width:140, height:140, borderRadius:'50%', background:'radial-gradient(circle,rgba(123,47,190,0.05),transparent 70%)', pointerEvents:'none' }}/>
        </>}

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22, position:'relative' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={()=>setDrawerOpen(true)} aria-label="Menu"
              style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
              ☰
            </button>
            {isIntl ? (
              <div style={{ width:36,height:36,borderRadius:12,
                  background:'linear-gradient(135deg,#00e5cc,#00b4a0)',
                  display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <span style={{ color:'#000',fontWeight:900,fontFamily:'Space Grotesk,sans-serif',fontSize:12 }}>IN</span>
              </div>
            ) : (
              <div style={{ width:36,height:36,borderRadius:12,
                  background:'rgba(255,255,255,0.2)',
                  display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <span style={{ color:'#fff',fontWeight:900,fontFamily:'Space Grotesk,sans-serif',fontSize:16 }}>₹</span>
              </div>
            )}
            <div>
              <p style={{ color:'rgba(255,255,255,0.7)',fontSize:12,margin:0 }}>Welcome back 👋</p>
              <p style={{ color:'#fff',fontSize:16,fontWeight:800,margin:0,fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{name.split(' ')[0]}</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>navigate('/notifications')} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:16 }}>🔔</button>
            <button onClick={()=>navigate('/profile')} aria-label="Profile" style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:10, width:38, height:38, color:'#fff', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>👤</button>
          </div>
        </div>

        {kyc !== 'verified' && (
          <button onClick={()=>navigate('/kyc')}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', background:'rgba(255,214,10,0.15)', border:'1px solid rgba(255,214,10,0.35)', borderRadius:12, padding:'9px 12px', marginBottom:14, cursor:'pointer' }}>
            <span style={{ fontSize:14 }}>⚠️</span>
            <span style={{ color:'#FFD60A', fontSize:12, fontWeight:600, flex:1, textAlign:'left' as const }}>Complete KYC to unlock ₹1L/day limit</span>
            <span style={{ color:'#FFD60A', fontSize:12 }}>→</span>
          </button>
        )}

        {isIntl ? (
          /* ── INTERNATIONAL BALANCE CARD (Binance-style, INRT) ── */
          <div onClick={()=>navigate('/crypto')} style={{ background:'#181A20', borderRadius:20, padding:'20px', border:'1px solid rgba(240,185,11,0.25)', cursor:'pointer', position:'relative', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div>
                <p style={{ color:'#848E9C', fontSize:11, margin:'0 0 4px', letterSpacing:1 }}>TOTAL INRT (POLYGON)</p>
                <p style={{ color:'#EAECEF', fontSize:38, fontWeight:800, margin:0, fontFamily:"'Plus Jakarta Sans',sans-serif", lineHeight:1 }}>
                  {balVis ? inrtBal.toLocaleString('en-IN') : '••••••'}
                </p>
                <p style={{ color:'#848E9C', fontSize:12, margin:'8px 0 0', fontFamily:'monospace' }}>
                  {hasWallet ? `🔗 ${shortWallet}` : '⚠️ No wallet linked — tap to set up'}
                </p>
              </div>
              <div style={{ display:'flex', flexDirection:'column' as const, alignItems:'flex-end', gap:8 }}>
                <button onClick={e=>{e.stopPropagation();setBalVis(!balVis);}} style={{ background:'rgba(255,255,255,0.08)', border:'none', borderRadius:8, width:34, height:34, color:'#fff', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {balVis?'👁️':'🙈'}
                </button>
                <div style={{ background:'rgba(240,185,11,0.12)', border:'1px solid rgba(240,185,11,0.3)', borderRadius:8, padding:'4px 10px' }}>
                  <p style={{ color:'#F0B90B', fontSize:10, fontWeight:700, margin:0, letterSpacing:0.5 }}>1 INRT = ₹1</p>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={e=>{e.stopPropagation();navigate('/crypto');}} style={{ flex:1, padding:'10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#EAECEF', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                📤 Send
              </button>
              <button onClick={e=>{e.stopPropagation();navigate('/checkout');}} style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#F0B90B,#D4A00A)', color:'#000', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                🪙 Buy INRT
              </button>
              <button onClick={e=>{e.stopPropagation();navigate('/crypto');}} style={{ flex:1, padding:'10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#EAECEF', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                🔗 Wallet
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {isIntl ? (
        /* ══════════════ INTERNATIONAL CONTENT ══════════════ */
        <>
          <div style={{ margin:'0 16px', marginTop:-44, position:'relative', zIndex:10 }}>
            <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:'18px 16px', boxShadow:'0 4px 24px rgba(0,0,0,0.2)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                {INTERNATIONAL_ACTIONS.map(a=>(
                  <button key={a.label} onClick={()=>(a as any).mode ? navigate(a.path, { state: { mode: (a as any).mode } }) : navigate(a.path)}
                    style={{ background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column' as const, alignItems:'center', gap:6, padding:'8px 4px', borderRadius:12 }}>
                    <div style={{ width:46, height:46, borderRadius:13, background:a.color+'15', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, border:`1px solid ${a.color}25` }}>
                      {a.icon}
                    </div>
                    <span style={{ fontSize:10, color:T.text, fontWeight:700, textAlign:'center' as const, lineHeight:1.3 }}>{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding:'16px 16px 0' }}>
            <div onClick={()=>navigate('/checkout')}
              style={{ background:'linear-gradient(120deg,#181A20 0%,#0B0E11 100%)', border:'1px solid rgba(240,185,11,0.25)', borderRadius:18, padding:'18px 20px', marginBottom:16, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <Chip color="#F0B90B" bg="rgba(240,185,11,0.12)">1 INRT = ₹1 · Stablecoin</Chip>
                <p style={{ color:'#fff', fontSize:17, fontWeight:800, margin:'8px 0 4px' }}>Buy or Sell INRT 🪙</p>
                <p style={{ color:'rgba(255,255,255,0.6)', fontSize:12, margin:0 }}>Global INRT transfers · zero forex fees</p>
              </div>
              <div style={{ textAlign:'center' as const }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🪙</div>
                <p style={{ color:'#F0B90B', fontSize:13, fontWeight:700, margin:'4px 0 0' }}>Buy Now</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ══════════════ NATIONAL CONTENT — Paytm-style ══════════════ */
        <div style={{ margin:'0 16px', marginTop:8, position:'relative', zIndex:10 }}>
          <h3 style={{ fontWeight:800, fontSize:16, color:T.navy, margin:'0 0 12px' }}>Recharge & Pay Bills</h3>
          <div className="svc-row">
            {NATIONAL_ACTIONS.map((a,i)=>(
              <button key={a.label} onClick={()=>(a as any).cat ? goBill((a as any).cat) : navigate(a.path)}
                className="svc-card" style={{ background:CARD_GRADIENTS[i%CARD_GRADIENTS.length] }}>
                <span className="svc-card-icon">{a.icon}</span>
                <div>
                  <p className="svc-card-title">{a.label}</p>
                  <p className="svc-card-sub">{NATIONAL_SUBS[a.label]||'Quick & secure'}</p>
                </div>
                <span className="svc-card-arrow">→</span>
              </button>
            ))}
          </div>

          {/* Bill due promo cards */}
          <div style={{ display:'grid', gap:10, margin:'16px 0' }}>
            <button onClick={()=>goBill('broadband')} className="svc-banner" style={{ background:'linear-gradient(120deg,#0F3D5C,#1E6FA8)' }}>
              <span style={{ fontSize:26 }}>📶</span>
              <div style={{ flex:1, textAlign:'left' as const }}>
                <p className="svc-card-title" style={{ fontSize:14 }}>Wifi or Broadband Bill Due?</p>
                <p className="svc-card-sub">Check latest bill and pay instantly</p>
              </div>
              <span className="svc-banner-arrow">→</span>
            </button>
            <button onClick={()=>goBill('loan')} className="svc-banner" style={{ background:'linear-gradient(120deg,#4A2E12,#B8763E)' }}>
              <span style={{ fontSize:26 }}>📅</span>
              <div style={{ flex:1, textAlign:'left' as const }}>
                <p className="svc-card-title" style={{ fontSize:14 }}>Loan EMI Due?</p>
                <p className="svc-card-sub">Pay pending EMIs in a few simple steps</p>
              </div>
              <span className="svc-banner-arrow">→</span>
            </button>
          </div>

          <h3 style={{ fontWeight:800, fontSize:16, color:T.navy, margin:'0 0 12px' }}>Book Travel</h3>
          <div className="svc-row" style={{ marginBottom:16 }}>
            {[
              { label:'Flights',      icon:'✈️', sub:'Domestic fares' },
              { label:'Bus',          icon:'🚌', sub:'1000+ routes'   },
              { label:'Trains',       icon:'🚆', sub:'IRCTC booking'  },
              { label:'Intl Flights', icon:'🌍', sub:'Fly worldwide'  },
            ].map((tItem,i)=>(
              <button key={tItem.label} onClick={()=>navigate('/travel')}
                className="svc-card" style={{ background:CARD_GRADIENTS[(i+3)%CARD_GRADIENTS.length] }}>
                <span className="svc-card-icon">{tItem.icon}</span>
                <div>
                  <p className="svc-card-title">{tItem.label}</p>
                  <p className="svc-card-sub">{tItem.sub}</p>
                </div>
                <span className="svc-card-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding:'16px 16px 0' }}>

        {/* ── REWARDS PROGRESS ──────────────────────────── */}
        <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:'16px 18px', boxShadow:'0 2px 12px rgba(0,0,0,0.08)', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:20 }}>🏆</span>
              <div>
                <p style={{ fontWeight:800, fontSize:14, margin:0, color:isIntl?T.text:T.navy }}>
                  {isIntl ? `INRT Level — ${points>=5000?'Platinum':points>=1000?'Gold':'Silver'}` : `Cashback Level — ${points>=5000?'Platinum':points>=1000?'Gold':'Silver'}`}
                </p>
                <p style={{ fontSize:12, color:T.muted, margin:0 }}>{points.toLocaleString('en-IN')} points</p>
              </div>
            </div>
            <Chip color={T.gold} bg={T.gold+'18'}>+{Math.floor(points*0.1)} {month}</Chip>
          </div>
          <div style={{ height:6, background:T.light, borderRadius:10, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${Math.min((points/5000)*100,100)}%`, background:`linear-gradient(90deg,${T.gold},${T.orange})`, borderRadius:10 }}/>
          </div>
          <p style={{ fontSize:11, color:T.muted, margin:'6px 0 0' }}>
            {points>=5000 ? 'Platinum member 🎉' : `${(5000-points).toLocaleString('en-IN')} more points to reach Platinum`}
          </p>
        </div>

        {/* ── ALL SERVICES ──────────────────────────────── */}
        <h3 style={{ fontWeight:800, fontSize:16, color:isIntl?T.text:T.navy, margin:'0 0 12px' }}>All Services</h3>
        <div className="svc-row" style={{ marginBottom:16 }}>
          {[
            { label:'Stocks',    icon:'📈', path:'/stocks',     sub:'Invest in equity'   },
            { label:'Gold',      icon:'🥇', path:'/gold',       sub:'24K digital gold'   },
            { label:'Insurance', icon:'🛡️', path:'/insurance',  sub:'Life & health'      },
            { label:'Loans',     icon:'💸', path:'/loans',      sub:'Instant approval'   },
            { label:'CIBIL',     icon:'📊', path:'/cibil',      sub:'Check your score'   },
            { label:'Split',     icon:'÷',  path:'/split-bill', sub:'Split with friends' },
            { label:'Movies',    icon:'🎬', path:'/movies',     sub:'Book tickets'       },
            { label:'Travel',    icon:'✈️', path:'/travel',     sub:'Flights & more'     },
          ].map((s,i)=>(
            <button key={s.path} onClick={()=>navigate(s.path)}
              className="svc-card" style={{ background:CARD_GRADIENTS[i%CARD_GRADIENTS.length] }}>
              <span className="svc-card-icon">{s.icon}</span>
              <div>
                <p className="svc-card-title">{s.label}</p>
                <p className="svc-card-sub">{s.sub}</p>
              </div>
              <span className="svc-card-arrow">→</span>
            </button>
          ))}
        </div>

        {/* ── RECENT TRANSACTIONS ───────────────────────── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ fontWeight:800, fontSize:16, color:isIntl?T.text:T.navy, margin:0 }}>Recent Transactions</h3>
          <button onClick={()=>navigate('/history')} style={{ color:T.accent, background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700 }}>View all →</button>
        </div>

        {txns.length===0 ? (
          <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:'40px 20px', textAlign:'center' as const, boxShadow:'0 2px 12px rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize:36, marginBottom:12 }}>💳</p>
            <p style={{ fontWeight:700, fontSize:15, color:isIntl?T.text:T.navy, margin:'0 0 4px' }}>No transactions yet</p>
            <p style={{ fontSize:13, color:T.muted, margin:0 }}>Start by adding money to your wallet</p>
          </div>
        ) : (
          <div style={{ background:T.card, borderRadius:20, border:`1px solid ${T.border}`, padding:0, overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.08)' }}>
            {txns.map((tx,i)=>(
              <div key={tx.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', borderBottom:i<txns.length-1?`1px solid ${T.border}`:'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:44, height:44, borderRadius:13, background:tx.type==='credit'?T.greenL:T.light, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    {TX_ICON[tx.cat]||(tx.type==='credit'?'↙️':'↗️')}
                  </div>
                  <div>
                    <p style={{ fontWeight:700, fontSize:14, margin:0, color:isIntl?T.text:T.navy, whiteSpace:'nowrap' as const, overflow:'hidden', textOverflow:'ellipsis', maxWidth:150 }}>
                      {tx.note||(tx.type==='credit'?'Received':'Sent')}
                    </p>
                    <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0' }}>{fmtDate(tx.createdAt)}</p>
                  </div>
                </div>
                <div style={{ textAlign:'right' as const, flexShrink:0 }}>
                  <p style={{ fontWeight:800, fontSize:15, margin:'0 0 3px', color:tx.type==='credit'?T.green:(isIntl?T.text:T.navy) }}>
                    {tx.type==='credit'?'+':'−'}₹{(tx.amount||0).toLocaleString('en-IN')}
                  </p>
                  <Chip color={tx.status==='failed'?T.red:T.green}>{tx.status==='failed'?'✕ Failed':'✓ Done'}</Chip>
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
            { label:'Reward Points',  val:points.toLocaleString('en-IN'),                                     color:isIntl?T.inrt:'#7B2FBE' },
          ].map(s=>(
            <div key={s.label} style={{ background:T.card, borderRadius:16, border:`1px solid ${T.border}`, padding:'12px 10px', textAlign:'center' as const, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
              <p style={{ color:s.color, fontWeight:800, fontSize:14, margin:'0 0 4px' }}>{s.val}</p>
              <p style={{ fontSize:10, color:T.muted, margin:0, fontWeight:600 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── LEGAL FOOTER ──────────────────────────────── */}
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:20, padding:'16px', marginBottom:16 }}>
          <p style={{ fontWeight:700, fontSize:13, color:isIntl?T.text:T.navy, margin:'0 0 12px' }}>{isIntl ? 'INRT Wallet · INRTPay' : 'INRT Wallet'}</p>
          <div style={{ display:'flex', flexWrap:'wrap' as const, gap:8, marginBottom:10 }}>
            {[
              { label:'Privacy Policy', path:'/privacy'        },
              { label:'Terms & Conditions', path:'/terms'      },
              { label:'Refund Policy', path:'/refund-policy'   },
              { label:'Admin Panel', path:'/admin/kyc'         },
            ].map(l=>(
              <button key={l.path} onClick={()=>navigate(l.path)}
                style={{ padding:'7px 14px', borderRadius:20, border:`1px solid ${T.border}`, background:T.light, color:isIntl?T.text:T.navy, fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {l.label}
              </button>
            ))}
          </div>
          <p style={{ color:T.muted, fontSize:11, margin:0, lineHeight:1.6 }}>
            {isIntl
              ? 'RBI Compliant · KYC Secured · INRT is a ₹-pegged stablecoin. 1 INRT = ₹1. Not a cryptocurrency or investment instrument.'
              : 'RBI Compliant · KYC Secured · All payments processed securely.'}
          </p>
        </div>

      </div>

      {/* ── BOTTOM NAV — same tabs in both modes ──────────── */}
      <nav style={{ position:'fixed', bottom:0, left:0, width:'100%', height:72, background:T.navBg, borderTop:`1px solid ${T.navBorder}`, display:'flex', alignItems:'center', zIndex:200, padding:'0 8px 8px', backdropFilter:'blur(20px)' }}>
        {[
          { path:'/dashboard', icon:'🏠', label:'Home'    },
          { path:'/history',   icon:'📋', label:'History' },
          { path:'/scan',       icon:'📷', label:'Scan',    special:true },
          { path:'/rewards',   icon:'🎁', label:'Rewards' },
          { path:'/profile',   icon:'👤', label:'Profile' },
        ].map(t=>(
          <button key={t.path} onClick={()=>navigate(t.path)}
            style={{ flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center', gap:(t as any).special?0:3, cursor:'pointer', background:'none', border:'none', padding:'6px 0' }}>
            {(t as any).special ? (
              <div style={{ width:44, height:44, borderRadius:'50%', background: isIntl ? `linear-gradient(135deg,${T.teal},#00b4a0)` : T.headerGrad, display:'flex', alignItems:'center', justifyContent:'center', color: isIntl ? '#000' : '#fff', fontSize:19, boxShadow: isIntl ? '0 4px 16px rgba(0,229,204,0.4)' : '0 4px 16px rgba(0,46,110,0.35)', marginTop:-8 }}>📷</div>
            ) : (
              <>
                <span style={{ fontSize:22, lineHeight:1 }}>{t.icon}</span>
                <span style={{ fontSize:10, fontWeight:600, color:isIntl?T.text:T.navy }}>{t.label}</span>
              </>
            )}
          </button>
        ))}
      </nav>

      <ModeDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
        * { -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.97) !important; }

        .svc-row {
          display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px;
          -ms-overflow-style: none; scrollbar-width: none;
        }
        .svc-row::-webkit-scrollbar { display: none; }

        .svc-card {
          flex: 0 0 150px; height: 176px; border-radius: 20px; padding: 16px;
          border: none; cursor: pointer; position: relative; overflow: hidden;
          display: flex; flex-direction: column; justify-content: space-between;
          text-align: left; box-shadow: 0 6px 18px rgba(0,0,0,0.18);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .svc-card:hover { transform: translateY(-5px); box-shadow: 0 12px 28px rgba(0,0,0,0.28); }
        .svc-card-icon { font-size: 26px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25)); }
        .svc-card-title { color: #fff; font-weight: 800; font-size: 13px; margin: 0 0 3px; line-height: 1.25; }
        .svc-card-sub { color: rgba(255,255,255,0.7); font-size: 10.5px; margin: 0; line-height: 1.3; }
        .svc-card-arrow {
          position: absolute; bottom: 14px; right: 14px;
          width: 28px; height: 28px; border-radius: 50%;
          background: rgba(255,255,255,0.16); color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; transition: background 0.2s ease, transform 0.2s ease;
        }
        .svc-card:hover .svc-card-arrow { background: rgba(255,255,255,0.32); transform: translateX(2px); }

        .svc-banner {
          display: flex; align-items: center; gap: 14px; border: none; cursor: pointer;
          border-radius: 18px; padding: 16px 18px; box-shadow: 0 6px 18px rgba(0,0,0,0.15);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .svc-banner:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(0,0,0,0.22); }
        .svc-banner-arrow {
          width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
          background: rgba(255,255,255,0.16); color: #fff;
          display: flex; align-items: center; justify-content: center; font-size: 14px;
          transition: background 0.2s ease;
        }
        .svc-banner:hover .svc-banner-arrow { background: rgba(255,255,255,0.32); }
        @keyframes spin { to { transform: rotate(360deg); } }

      `}</style>
    </div>
  );
}
