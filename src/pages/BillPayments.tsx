import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import '../styles/theme.css';

const CATEGORIES = [
  { id:'electricity',label:'Electricity',icon:'⚡',color:'#f4b942',providers:['MSEDCL','BESCOM','TNEB','PSPCL','BSES','Torrent Power','CESC','WBSEDCL'] },
  { id:'water',       label:'Water',      icon:'💧',color:'#00e5cc',providers:['BWSSB','Delhi Jal Board','MCG','PMC Water','NMMC'] },
  { id:'gas',         label:'Gas',        icon:'🔥',color:'#ff6b35',providers:['Indane LPG','Bharat Gas','HP Gas','IGL','MGL','Adani Gas'] },
  { id:'dth',         label:'DTH',        icon:'📡',color:'#a78bfa',providers:['Tata Play','Dish TV','Sun Direct','Airtel DTH','BSNL DTH'] },
  { id:'broadband',   label:'Broadband',  icon:'📶',color:'#00d68f',providers:['JioFiber','Airtel Broadband','ACT Fibernet','Hathway','BSNL Broadband'] },
  { id:'insurance',   label:'Insurance',  icon:'🛡️',color:'#4d8af0',providers:['LIC','HDFC Life','ICICI Prudential','SBI Life','Max Life'] },
  { id:'loan',        label:'Loan EMI',   icon:'🏦',color:'#f4b942',providers:['HDFC Bank','SBI','ICICI Bank','Axis Bank','Bajaj Finserv'] },
  { id:'credit_card', label:'Credit Card',icon:'💳',color:'#ec4899',providers:['HDFC CC','SBI Card','ICICI CC','Axis CC','Citi CC'] },
];

type FlowStep = 'category'|'details'|'confirm'|'success';

export default function BillPayments() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step,     setStep]     = useState<FlowStep>('category');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [provider, setProvider] = useState('');
  const [accountNo,setAccountNo]= useState('');
  const [amount,   setAmount]   = useState('');
  const [billRef,  setBillRef]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [txId,     setTxId]     = useState('');

  const bal = userProfile?.balance || 0;

  const fetchBill = async () => {
    if(!provider) return setError('Select a provider');
    if(!accountNo.trim()) return setError('Enter account number');
    setLoading(true); setError('');
    await new Promise(r=>setTimeout(r,1200));
    setAmount(String((Math.floor(Math.random()*15)+1)*100+99));
    setBillRef(`BILL${Date.now().toString().slice(-8)}`);
    setStep('confirm');
    setLoading(false);
  };

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if(!amt||amt<1) return setError('Invalid amount');
    if(amt>bal)     return setError(`Insufficient balance. You have ₹${bal}`);
    setLoading(true); setError('');
    try {
      const ref = `BP${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      await updateDoc(doc(db,'users',user!.uid),{
        balance:increment(-amt),cashback:increment(Math.floor(amt*0.02)),
        rewardPoints:increment(Math.floor(amt/10)),updatedAt:serverTimestamp(),
      });
      await addDoc(collection(db,'transactions'),{
        uid:user!.uid,type:'debit',amount:amt,cat:'bills',
        note:`${category.label} — ${provider}`,ref,status:'success',
        billRef,accountNo,provider,createdAt:serverTimestamp(),
      });
      setTxId(ref); await refreshProfile(); setStep('success');
    } catch(e:any){ setError(e.message||'Payment failed'); }
    setLoading(false);
  };

  const reset = () => { setStep('category');setProvider('');setAccountNo('');setAmount('');setBillRef('');setTxId('');setError(''); };

  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)'}}>
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 16px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:10}}>
          <button onClick={()=>{if(step==='category')navigate('/dashboard');else if(step==='confirm')setStep('details');else if(step==='details')setStep('category');}} className="back-btn">←</button>
          <h1 className="page-title">Bill Payments</h1>
          <span className="badge-teal">BBPS</span>
        </div>
        {step!=='success'&&(
          <div style={{display:'flex',gap:4}}>
            {['category','details','confirm'].map((s,i)=>(
              <div key={s} style={{flex:1,height:3,borderRadius:3,background:['category','details','confirm','success'].indexOf(step)>=i?'var(--teal)':'var(--b1)',transition:'background 0.3s'}}/>
            ))}
          </div>
        )}
      </div>

      <div style={{padding:'16px 16px 90px'}}>
        {step==='category'&&(
          <>
            <p className="s-title">Select Category</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
              {CATEGORIES.map(cat=>(
                <button key={cat.id} onClick={()=>{setCategory(cat);setProvider('');setStep('details');}}
                  style={{background:'var(--bg-card)',border:`1px solid var(--b1)`,borderRadius:'var(--r2)',padding:'18px 14px',display:'flex',flexDirection:'column',alignItems:'flex-start',gap:8,cursor:'pointer',transition:'all 0.2s'}}>
                  <div style={{width:44,height:44,borderRadius:'var(--r1)',background:`${cat.color}18`,border:`1px solid ${cat.color}28`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>
                    {cat.icon}
                  </div>
                  <p style={{color:'var(--t1)',fontWeight:700,fontSize:14,textAlign:'left'}}>{cat.label}</p>
                  <p style={{color:'var(--t3)',fontSize:10}}>{cat.providers.length} providers</p>
                </button>
              ))}
            </div>
          </>
        )}

        {step==='details'&&(
          <div className="card">
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
              <div style={{width:44,height:44,borderRadius:'var(--r1)',background:`${category.color}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>{category.icon}</div>
              <p className="s-title" style={{marginBottom:0}}>{category.label} Payment</p>
            </div>
            <p className="s-label">SELECT PROVIDER</p>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
              {category.providers.map(p=>(
                <button key={p} onClick={()=>{setProvider(p);setError('');}}
                  style={{padding:'8px 14px',borderRadius:'var(--r1)',fontSize:12,fontWeight:600,cursor:'pointer',background:provider===p?`${category.color}18`:'var(--bg-elevated)',border:`1px solid ${provider===p?category.color:'var(--b1)'}`,color:provider===p?category.color:'var(--t2)'}}>
                  {p}
                </button>
              ))}
            </div>
            <p className="s-label">ACCOUNT / CONSUMER NUMBER</p>
            <input className="inp" type="tel" placeholder="Enter number" style={{marginBottom:16}} value={accountNo} onChange={e=>{setAccountNo(e.target.value);setError('');}}/>
            {error&&<p className="err-box" style={{marginBottom:12}}>⚠️ {error}</p>}
            <button className="btn-primary" onClick={fetchBill} disabled={loading} style={{opacity:loading?0.6:1}}>
              {loading?'⏳ Fetching bill…':'Fetch Bill Amount →'}
            </button>
          </div>
        )}

        {step==='confirm'&&(
          <div>
            <div className="card" style={{marginBottom:14}}>
              <p className="s-title">Bill Details</p>
              {[['Category',category.label],['Provider',provider],['Account No',accountNo],['Bill Ref',billRef]].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--b1)'}}>
                  <span style={{color:'var(--t2)',fontSize:13}}>{k}</span>
                  <span style={{color:'var(--t1)',fontWeight:600,fontSize:13}}>{v}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',paddingTop:12}}>
                <span style={{color:'var(--t2)',fontSize:14}}>Amount Due</span>
                <span style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:22,color:'var(--gold)'}}>₹{parseFloat(amount).toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div style={{background:'rgba(0,214,143,0.06)',border:'1px solid rgba(0,214,143,0.15)',borderRadius:'var(--r2)',padding:'12px 16px',marginBottom:14}}>
              <p style={{color:'var(--green)',fontSize:13,fontWeight:600}}>🎁 Earn ₹{Math.floor(parseFloat(amount||'0')*0.02)} cashback + {Math.floor(parseFloat(amount||'0')/10)} reward points</p>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'var(--bg-card)',borderRadius:'var(--r1)',marginBottom:14,border:'1px solid var(--b1)'}}>
              <span style={{color:'var(--t2)',fontSize:13}}>Wallet balance</span>
              <span style={{color:parseFloat(amount)>bal?'var(--red)':'var(--green)',fontWeight:700,fontSize:13}}>₹{bal.toLocaleString('en-IN')}</span>
            </div>
            {error&&<p className="err-box" style={{marginBottom:12}}>⚠️ {error}</p>}
            <button className="btn-primary" onClick={handlePay} disabled={loading} style={{opacity:loading?0.6:1}}>
              {loading?'⏳ Processing…':`Pay ₹${parseFloat(amount).toLocaleString('en-IN')} →`}
            </button>
            <button className="btn-outline" style={{marginTop:10}} onClick={()=>setStep('details')}>← Go Back</button>
          </div>
        )}

        {step==='success'&&(
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',paddingTop:40}}>
            <div style={{width:80,height:80,borderRadius:'50%',background:'rgba(0,214,143,0.1)',border:'2px solid var(--green)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,marginBottom:16}}>✅</div>
            <h2 style={{fontFamily:'var(--f-display)',fontWeight:700,fontSize:24,color:'var(--t1)',marginBottom:8}}>Bill Paid!</h2>
            <p style={{color:'var(--t2)',fontSize:15,marginBottom:24}}>₹{parseFloat(amount).toLocaleString('en-IN')} paid to {provider}</p>
            <div className="card" style={{width:'100%',marginBottom:20,textAlign:'left'}}>
              {[['Transaction ID',txId],['Amount',`₹${parseFloat(amount).toLocaleString('en-IN')}`],['Cashback',`₹${Math.floor(parseFloat(amount)*0.02)}`],['Points',`+${Math.floor(parseFloat(amount)/10)} pts`],['Status','✅ Paid']].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--b1)'}}>
                  <span style={{color:'var(--t2)',fontSize:13}}>{k}</span>
                  <span style={{color:'var(--t1)',fontWeight:700,fontSize:13}}>{v}</span>
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={reset}>Pay Another Bill</button>
            <button className="btn-outline" style={{marginTop:10}} onClick={()=>navigate('/dashboard')}>Back to Home</button>
          </div>
        )}
      </div>
    </div>
  );
}
