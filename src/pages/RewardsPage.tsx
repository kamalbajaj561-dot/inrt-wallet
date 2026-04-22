import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import BottomNav from '../components/BottomNav';
import '../styles/theme.css';

const TIERS = [
  {name:'Silver', min:0,    max:999,  color:'#9ca3af',icon:'🥈'},
  {name:'Gold',   min:1000, max:4999, color:'#f4b942',icon:'🥇'},
  {name:'Plat',   min:5000, max:19999,color:'#00e5cc',icon:'💎'},
  {name:'Diamond',min:20000,max:99999,color:'#a78bfa',icon:'👑'},
];
const OFFERS = [
  {title:'5X on Recharge',desc:'This month only',icon:'📱',pts:'+50 pts'},
  {title:'2% Bill Cashback',desc:'All categories',icon:'⚡',pts:'2% back'},
  {title:'Refer & Earn',desc:'₹100 per friend',icon:'👥',pts:'₹100'},
  {title:'KYC Bonus',desc:'One-time',icon:'🪪',pts:'+500 pts'},
];

export default function RewardsPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [tab,setTab] = useState<'overview'|'offers'>('overview');
  const [redeem,setRedeem] = useState(100);
  const [loading,setLoading] = useState(false);
  const [toast,setToast] = useState('');

  const pts = userProfile?.rewardPoints || 0;
  const tier = TIERS.find(t=>pts>=t.min&&pts<=t.max)||TIERS[0];
  const next = TIERS[TIERS.indexOf(tier)+1];
  const prog = next?((pts-tier.min)/(next.min-tier.min))*100:100;
  const showToast = (m:string)=>{setToast(m);setTimeout(()=>setToast(''),2500);};

  const doRedeem = async () => {
    if (!user||pts<redeem||redeem<100) return showToast('Minimum 100 points');
    setLoading(true);
    try {
      const cash = redeem*0.25;
      await updateDoc(doc(db,'users',user.uid),{
        rewardPoints:increment(-redeem),balance:increment(cash),cashback:increment(cash),updatedAt:serverTimestamp()
      });
      await addDoc(collection(db,'transactions'),{uid:user.uid,type:'credit',amount:cash,note:`Rewards redemption (${redeem} pts)`,cat:'rewards',status:'success',createdAt:serverTimestamp()});
      await refreshProfile();
      showToast(`✅ ₹${cash} added to wallet!`);
    } catch(e:any){showToast(e.message||'Failed');}
    setLoading(false);
  };

  return (
    <div className="page">
      {toast&&<div className="toast">{toast}</div>}
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Rewards</h1>
        </div>
        <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(244,185,66,0.2)',borderRadius:'var(--r3)',padding:'20px'}}>
          <p style={{color:'rgba(244,185,66,0.6)',fontSize:10,fontWeight:700,letterSpacing:1}}>YOUR POINTS</p>
          <p style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:44,color:'var(--gold)',lineHeight:1,marginTop:4}}>{pts.toLocaleString()}</p>
          <p style={{color:'var(--t3)',fontSize:13,marginTop:4}}>≈ ₹{(pts*0.25).toFixed(0)} cashback value</p>
          <div style={{display:'flex',alignItems:'center',gap:10,marginTop:14,paddingTop:14,borderTop:'1px solid rgba(255,255,255,0.06)'}}>
            <span style={{fontSize:20}}>{tier.icon}</span>
            <div style={{flex:1}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span style={{color:tier.color,fontSize:12,fontWeight:700}}>{tier.name}</span>
                {next&&<span style={{color:'var(--t3)',fontSize:11}}>{(next.min-pts).toLocaleString()} to {next.name}</span>}
              </div>
              <div style={{background:'rgba(255,255,255,0.06)',borderRadius:8,height:6,overflow:'hidden'}}>
                <div style={{width:`${Math.min(prog,100)}%`,height:'100%',background:tier.color,borderRadius:8}}/>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{display:'flex',gap:8,padding:'12px 16px 0'}}>
        {(['overview','offers'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{flex:1,padding:'9px 0',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',
                     background:tab===t?'var(--gold)':'var(--bg-card)',border:`1px solid ${tab===t?'var(--gold)':'var(--b1)'}`,
                     color:tab===t?'#000':'var(--t2)'}}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>
      <div style={{padding:'16px 16px 0'}}>
        {tab==='overview'&&(
          <>
            <div className="card" style={{marginBottom:14}}>
              <p className="s-title">Redeem Points</p>
              <p style={{color:'var(--t2)',fontSize:13,marginBottom:14}}>100 pts = ₹25 cashback</p>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
                {[100,200,500,1000].filter(v=>v<=Math.max(pts,100)).map(v=>(
                  <button key={v} onClick={()=>setRedeem(v)}
                    style={{padding:'8px 14px',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,cursor:'pointer',
                             background:redeem===v?'var(--gold-dim)':'var(--bg-elevated)',border:`1px solid ${redeem===v?'var(--gold)':'var(--b1)'}`,color:redeem===v?'var(--gold)':'var(--t2)'}}>
                    {v} pts
                  </button>
                ))}
              </div>
              <button className="btn-gold" onClick={doRedeem} disabled={loading||pts<redeem||redeem<100} style={{opacity:loading||pts<redeem||redeem<100?0.5:1}}>
                {loading?'⏳ Redeeming…':`Redeem ${redeem} pts → ₹${(redeem*0.25).toFixed(0)}`}
              </button>
            </div>
            <div className="card">
              <p className="s-title">How to Earn</p>
              {[['Send Money','10 pts/₹100'],['Add Money','10 pts/₹100'],['Pay Bills','10 pts/₹100'],['KYC Complete','500 pts'],['Refer Friend','250 pts']].map(([a,p])=>(
                <div key={a} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--b1)'}}>
                  <span style={{color:'var(--t2)',fontSize:13}}>{a}</span>
                  <span style={{color:'var(--gold)',fontSize:12,fontWeight:700}}>{p}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {tab==='offers'&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {OFFERS.map(o=>(
              <div key={o.title} className="card" style={{display:'flex',gap:14,alignItems:'center'}}>
                <div style={{width:50,height:50,borderRadius:'var(--r2)',background:'var(--bg-elevated)',border:'1px solid var(--b1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,flexShrink:0}}>{o.icon}</div>
                <div style={{flex:1}}>
                  <p style={{color:'var(--t1)',fontWeight:700,fontSize:14}}>{o.title}</p>
                  <p style={{color:'var(--t2)',fontSize:12,marginTop:3}}>{o.desc}</p>
                </div>
                <span className="badge-gold">{o.pts}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
