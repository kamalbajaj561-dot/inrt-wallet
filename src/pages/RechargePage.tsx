import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import '../styles/theme.css';

type RType = 'prepaid'|'postpaid'|'dth';
type RStep = 'form'|'plans'|'confirm'|'success';

const OPERATORS: Record<RType,string[]> = {
  prepaid:  ['Jio','Airtel','Vi','BSNL'],
  postpaid: ['Jio Postpaid','Airtel Postpaid','Vi Postpaid','BSNL Postpaid'],
  dth:      ['Tata Play','Dish TV','Airtel DTH','Sun Direct','DD Free Dish'],
};

const PLANS = [
  {id:'p1',price:179,validity:'28 days',data:'2GB/day',calls:'Unlimited',sms:'100/day',popular:false},
  {id:'p2',price:239,validity:'28 days',data:'2GB/day',calls:'Unlimited',sms:'100/day',popular:true},
  {id:'p3',price:299,validity:'28 days',data:'3GB/day',calls:'Unlimited',sms:'100/day',popular:false},
  {id:'p4',price:479,validity:'56 days',data:'2.5GB/day',calls:'Unlimited',sms:'100/day',popular:false},
  {id:'p5',price:599,validity:'84 days',data:'2GB/day',calls:'Unlimited',sms:'100/day',popular:true},
  {id:'p6',price:899,validity:'84 days',data:'3GB/day',calls:'Unlimited',sms:'100/day',popular:false},
  {id:'p7',price:1199,validity:'365 days',data:'2.5GB/day',calls:'Unlimited',sms:'100/day',popular:false},
  {id:'p8',price:2999,validity:'365 days',data:'3GB/day',calls:'Unlimited',sms:'100/day',popular:false},
];

export default function RechargePage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [type,     setType]     = useState<RType>('prepaid');
  const [operator, setOperator] = useState('Jio');
  const [mobile,   setMobile]   = useState('');
  const [step,     setStep]     = useState<RStep>('form');
  const [plan,     setPlan]     = useState<any>(null);
  const [custom,   setCustom]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [txId,     setTxId]     = useState('');

  const bal = userProfile?.balance || 0;

  const handleNext = () => {
    if(type!=='dth'&&mobile.replace(/\D/g,'').length!==10) return setError('Enter valid 10-digit number');
    setError(''); setStep('plans');
  };

  const handleSelectPlan = (p: any) => { setPlan(p); setCustom(''); setStep('confirm'); };

  const handleCustom = () => {
    const amt=parseFloat(custom);
    if(!amt||amt<10) return setError('Minimum ₹10');
    setPlan({id:'custom',price:amt,validity:'—',data:'—',calls:'—',sms:'—'});
    setStep('confirm');
  };

  const handlePay = async () => {
    if(!plan||!user) return;
    const amt=plan.price;
    if(amt>bal) return setError(`Insufficient balance. You have ₹${bal}`);
    setLoading(true); setError('');
    try {
      const ref=`RC${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      await updateDoc(doc(db,'users',user.uid),{balance:increment(-amt),rewardPoints:increment(Math.floor(amt/10)),updatedAt:serverTimestamp()});
      await addDoc(collection(db,'transactions'),{uid:user.uid,type:'debit',amount:amt,cat:'recharge',note:`${operator} ${type!=='dth'?mobile:'DTH'} — ₹${amt}`,ref,status:'success',operator,mobile,createdAt:serverTimestamp()});
      setTxId(ref); await refreshProfile(); setStep('success');
    } catch(e:any){setError(e.message||'Failed');}
    setLoading(false);
  };

  const reset = () => { setStep('form');setPlan(null);setMobile('');setCustom('');setError('');setTxId(''); };

  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)'}}>
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:10}}>
          <button onClick={()=>{if(step==='form')navigate('/dashboard');else if(step==='plans')setStep('form');else if(step==='confirm')setStep('plans');}} className="back-btn">←</button>
          <h1 className="page-title">Recharge</h1>
        </div>
      </div>

      <div style={{padding:'16px 16px 90px'}}>
        {step==='form'&&(
          <>
            <div style={{display:'flex',gap:8,marginBottom:20}}>
              {(['prepaid','postpaid','dth']as RType[]).map(t=>(
                <button key={t} onClick={()=>{setType(t);setOperator(OPERATORS[t][0]);}}
                  style={{flex:1,padding:'10px 0',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,cursor:'pointer',background:type===t?'var(--teal-dim)':'var(--bg-card)',border:`1px solid ${type===t?'var(--teal)':'var(--b1)'}`,color:type===t?'var(--teal)':'var(--t3)'}}>
                  {t==='prepaid'?'📱 Prepaid':t==='postpaid'?'📋 Postpaid':'📡 DTH'}
                </button>
              ))}
            </div>
            <div className="card">
              {type!=='dth'&&(
                <>
                  <p className="s-label">MOBILE NUMBER</p>
                  <div style={{display:'flex',border:'1px solid var(--b1)',borderRadius:'var(--r2)',overflow:'hidden',marginBottom:16}}>
                    <span style={{padding:'14px 12px',background:'var(--bg-elevated)',color:'var(--t2)',fontSize:13,borderRight:'1px solid var(--b1)',whiteSpace:'nowrap'}}>🇮🇳 +91</span>
                    <input style={{flex:1,background:'none',border:'none',outline:'none',padding:'14px',fontSize:15,color:'var(--t1)',fontFamily:'inherit'}} type="tel" maxLength={10} placeholder="10-digit number" value={mobile} onChange={e=>{setMobile(e.target.value.replace(/\D/g,''));setError('');}}/>
                  </div>
                </>
              )}
              <p className="s-label">SELECT OPERATOR</p>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
                {OPERATORS[type].map(op=>(
                  <button key={op} onClick={()=>setOperator(op)}
                    style={{padding:'8px 14px',borderRadius:'var(--r1)',fontSize:13,fontWeight:600,cursor:'pointer',background:operator===op?'var(--teal-dim)':'var(--bg-elevated)',border:`1px solid ${operator===op?'var(--teal)':'var(--b1)'}`,color:operator===op?'var(--teal)':'var(--t2)'}}>
                    {op}
                  </button>
                ))}
              </div>
              {error&&<p className="err-box" style={{marginBottom:12}}>⚠️ {error}</p>}
              <button className="btn-primary" onClick={handleNext}>View Plans →</button>
            </div>
          </>
        )}

        {step==='plans'&&(
          <>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <p className="s-title" style={{marginBottom:0}}>{operator} Plans</p>
              {type!=='dth'&&<span style={{color:'var(--t3)',fontSize:12}}>+91 {mobile}</span>}
            </div>
            <div className="card" style={{marginBottom:14}}>
              <p className="s-label">CUSTOM AMOUNT</p>
              <div style={{display:'flex',gap:10}}>
                <input className="inp" style={{flex:1}} type="number" placeholder="Enter amount" value={custom} onChange={e=>{setCustom(e.target.value);setError('');}}/>
                <button onClick={handleCustom} style={{padding:'0 18px',background:'var(--g-teal)',border:'none',borderRadius:'var(--r1)',color:'#000',fontWeight:700,cursor:'pointer'}}>Pay</button>
              </div>
              {error&&<p className="err-box" style={{marginTop:8}}>⚠️ {error}</p>}
            </div>
            {PLANS.map(p=>(
              <button key={p.id} onClick={()=>handleSelectPlan(p)}
                style={{width:'100%',background:'var(--bg-card)',border:`1px solid ${p.popular?'rgba(0,229,204,0.3)':'var(--b1)'}`,borderRadius:'var(--r2)',padding:'16px',marginBottom:10,position:'relative',display:'block',textAlign:'left',cursor:'pointer'}}>
                {p.popular&&<span style={{position:'absolute',top:-8,right:12,background:'var(--teal)',color:'#000',fontSize:9,fontWeight:800,padding:'2px 8px',borderRadius:20}}>POPULAR</span>}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <p style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:20,color:'var(--teal)'}}>₹{p.price}</p>
                    <p style={{color:'var(--t3)',fontSize:11,marginTop:2}}>{p.validity}</p>
                  </div>
                  <div style={{display:'flex',gap:10,marginTop:4}}>
                    {[['📶',p.data],['📞',p.calls],['💬',p.sms]].map(([ico,val])=>(
                      <div key={ico} style={{display:'flex',alignItems:'center',gap:3}}>
                        <span style={{fontSize:11}}>{ico}</span>
                        <span style={{color:'var(--t2)',fontSize:10}}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </>
        )}

        {step==='confirm'&&plan&&(
          <div>
            <div className="card" style={{marginBottom:14}}>
              <p className="s-title">Confirm Recharge</p>
              {[['Number',type!=='dth'?`+91 ${mobile}`:'DTH Account'],['Operator',operator],['Validity',plan.validity],['Amount',`₹${plan.price}`]].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--b1)'}}>
                  <span style={{color:'var(--t2)',fontSize:13}}>{k}</span>
                  <span style={{color:'var(--t1)',fontWeight:600,fontSize:13}}>{v}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',paddingTop:10}}>
                <span style={{color:'var(--t2)',fontSize:14}}>Points Earned</span>
                <span style={{color:'var(--gold)',fontWeight:700,fontSize:14}}>+{Math.floor(plan.price/10)} pts</span>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'var(--bg-card)',borderRadius:'var(--r1)',marginBottom:14,border:'1px solid var(--b1)'}}>
              <span style={{color:'var(--t2)',fontSize:13}}>Wallet balance</span>
              <span style={{color:plan.price>bal?'var(--red)':'var(--green)',fontWeight:700,fontSize:13}}>₹{bal.toLocaleString('en-IN')}</span>
            </div>
            {error&&<p className="err-box" style={{marginBottom:12}}>⚠️ {error}</p>}
            <button className="btn-primary" onClick={handlePay} disabled={loading} style={{opacity:loading?0.6:1}}>
              {loading?'⏳ Processing…':`Recharge ₹${plan.price} →`}
            </button>
          </div>
        )}

        {step==='success'&&plan&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',paddingTop:40}}>
            <div style={{width:80,height:80,borderRadius:'50%',background:'rgba(0,214,143,0.1)',border:'2px solid var(--green)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,marginBottom:16}}>✅</div>
            <h2 style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:24,color:'var(--t1)',marginBottom:8}}>Recharge Done!</h2>
            <p style={{color:'var(--t2)',fontSize:15,marginBottom:24}}>{type!=='dth'?`+91 ${mobile}`:operator} recharged with ₹{plan.price}</p>
            <div className="card" style={{width:'100%',marginBottom:20,textAlign:'left'}}>
              {[['Transaction ID',txId],['Amount',`₹${plan.price}`],['Points',`+${Math.floor(plan.price/10)} pts`],['Status','✅ Success']].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--b1)'}}>
                  <span style={{color:'var(--t2)',fontSize:13}}>{k}</span>
                  <span style={{color:'var(--t1)',fontWeight:700,fontSize:13}}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={reset}>Recharge Again</button>
            <button className="btn-outline" style={{marginTop:10}} onClick={()=>navigate('/dashboard')}>Back to Home</button>
          </div>
        )}
      </div>
    </div>
  );
}
