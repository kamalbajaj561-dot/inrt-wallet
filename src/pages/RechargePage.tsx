import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

type RechargeType = 'prepaid' | 'postpaid' | 'dth';
type FlowStep     = 'form' | 'plans' | 'confirm' | 'success';

interface Plan {
  id: string; price: number; validity: string;
  data: string; calls: string; sms: string; desc: string; popular?: boolean;
}

const OPERATORS: Record<RechargeType, string[]> = {
  prepaid:  ['Jio', 'Airtel', 'Vi', 'BSNL'],
  postpaid: ['Jio Postpaid', 'Airtel Postpaid', 'Vi Postpaid', 'BSNL Postpaid'],
  dth:      ['Tata Play', 'Dish TV', 'Airtel DTH', 'Sun Direct', 'DD Free Dish'],
};

// Realistic plans — in production fetch from recharge API
const PLANS: Plan[] = [
  { id:'p1', price:179, validity:'28 days',  data:'2GB/day',  calls:'Unlimited',sms:'100/day',desc:'Entry plan',popular:false },
  { id:'p2', price:239, validity:'28 days',  data:'2GB/day',  calls:'Unlimited',sms:'100/day',desc:'Popular plan',popular:true },
  { id:'p3', price:299, validity:'28 days',  data:'3GB/day',  calls:'Unlimited',sms:'100/day',desc:'High data',popular:false },
  { id:'p4', price:479, validity:'56 days',  data:'2.5GB/day',calls:'Unlimited',sms:'100/day',desc:'2-month plan',popular:false },
  { id:'p5', price:599, validity:'84 days',  data:'2GB/day',  calls:'Unlimited',sms:'100/day',desc:'3-month plan',popular:true },
  { id:'p6', price:899, validity:'84 days',  data:'3GB/day',  calls:'Unlimited',sms:'100/day',desc:'3-month premium',popular:false },
  { id:'p7', price:1199,validity:'365 days', data:'2.5GB/day',calls:'Unlimited',sms:'100/day',desc:'Annual plan',popular:false },
  { id:'p8', price:2999,validity:'365 days', data:'3GB/day',  calls:'Unlimited',sms:'100/day',desc:'Annual premium',popular:false },
];

export default function RechargePage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [type,     setType]    = useState<RechargeType>('prepaid');
  const [operator, setOperator]= useState('Jio');
  const [mobile,   setMobile]  = useState('');
  const [step,     setStep]    = useState<FlowStep>('form');
  const [plan,     setPlan]    = useState<Plan | null>(null);
  const [customAmt,setCustomAmt]=useState('');
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');
  const [txId,     setTxId]    = useState('');

  const bal = userProfile?.balance || 0;

  const handleNext = () => {
    if (type !== 'dth' && mobile.replace(/\D/g,'').length !== 10)
      return setError('Enter valid 10-digit number');
    if (!operator) return setError('Select operator');
    setError(''); setStep('plans');
  };

  const handleSelectPlan = (p: Plan) => {
    setPlan(p); setCustomAmt(''); setStep('confirm');
  };

  const handleSelectCustom = () => {
    const amt = parseFloat(customAmt);
    if (!amt || amt < 10) return setError('Minimum ₹10');
    setPlan({ id:'custom', price:amt, validity:'—', data:'—', calls:'—', sms:'—', desc:'Custom recharge' });
    setStep('confirm');
  };

  const handlePay = async () => {
    if (!plan || !user) return;
    const amt = plan.price;
    if (amt > bal) return setError(`Insufficient balance. You have ₹${bal}`);
    setLoading(true); setError('');
    try {
      const ref = `RC${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      await updateDoc(doc(db, 'users', user.uid), {
        balance:      increment(-amt),
        rewardPoints: increment(Math.floor(amt / 10)),
        updatedAt:    serverTimestamp(),
      });
      await addDoc(collection(db, 'transactions'), {
        uid: user.uid, type:'debit', amount:amt, cat:'recharge',
        note: `${operator} ${type === 'dth' ? 'DTH' : mobile} — ₹${amt}`,
        ref, status:'success', operator, mobile,
        plan: plan.desc, createdAt: serverTimestamp(),
      });
      setTxId(ref);
      await refreshProfile();
      setStep('success');
    } catch (e: any) { setError(e.message || 'Recharge failed'); }
    setLoading(false);
  };

  const reset = () => {
    setStep('form'); setPlan(null); setMobile('');
    setCustomAmt(''); setError(''); setTxId('');
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button
          onClick={() => { if(step==='form') navigate('/dashboard'); else if(step==='plans') setStep('form'); else if(step==='confirm') setStep('plans'); }}
          style={S.back}>←</button>
        <h1 style={S.title}>Recharge</h1>
      </div>

      <div style={{ padding:'16px 16px 90px' }}>

        {/* ── FORM ── */}
        {step === 'form' && (
          <>
            {/* Type selector */}
            <div style={{ display:'flex',gap:8,marginBottom:20 }}>
              {(['prepaid','postpaid','dth'] as RechargeType[]).map(t => (
                <button key={t} onClick={() => { setType(t); setOperator(OPERATORS[t][0]); }}
                  style={{ flex:1,padding:'10px 0',borderRadius:12,fontSize:12,fontWeight:700,cursor:'pointer',
                             background:type===t?'rgba(240,180,41,0.15)':'#16161f',
                             border:`1px solid ${type===t?'#f0b429':'rgba(255,255,255,0.07)'}`,
                             color:type===t?'#f0b429':'#555570' }}>
                  {t==='prepaid'?'📱 Prepaid':t==='postpaid'?'📋 Postpaid':'📡 DTH'}
                </button>
              ))}
            </div>

            <div style={S.card}>
              {/* Mobile number */}
              {type !== 'dth' && (
                <>
                  <p style={S.label}>MOBILE NUMBER</p>
                  <div style={{ display:'flex',border:'1px solid rgba(255,255,255,0.1)',
                                 borderRadius:12,overflow:'hidden',marginBottom:16 }}>
                    <span style={{ padding:'13px 12px',background:'#1e1e2a',color:'#8888a8',
                                    fontSize:13,borderRight:'1px solid rgba(255,255,255,0.07)',
                                    whiteSpace:'nowrap' }}>🇮🇳 +91</span>
                    <input style={{ flex:1,background:'none',border:'none',outline:'none',
                                     padding:'13px 14px',fontSize:15,color:'#f0f0f8',fontFamily:'inherit' }}
                      type="tel" maxLength={10} placeholder="10-digit mobile"
                      value={mobile}
                      onChange={e => { setMobile(e.target.value.replace(/\D/g,'')); setError(''); }} />
                  </div>
                </>
              )}

              {/* Operator */}
              <p style={S.label}>SELECT OPERATOR</p>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:16 }}>
                {OPERATORS[type].map(op => (
                  <button key={op} onClick={() => setOperator(op)}
                    style={{ padding:'8px 14px',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',
                               background:operator===op?'rgba(240,180,41,0.12)':'#1e1e2a',
                               border:`1px solid ${operator===op?'#f0b429':'rgba(255,255,255,0.07)'}`,
                               color:operator===op?'#f0b429':'#8888a8' }}>
                    {op}
                  </button>
                ))}
              </div>

              {error && <p style={S.errBox}>⚠️ {error}</p>}

              <button onClick={handleNext}
                style={S.goldBtn}>
                View Plans →
              </button>
            </div>
          </>
        )}

        {/* ── PLANS ── */}
        {step === 'plans' && (
          <>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
              <p style={{ color:'#f0f0f8',fontWeight:700,fontSize:16 }}>
                {operator} Plans
              </p>
              <span style={{ color:'#555570',fontSize:12 }}>
                {type !== 'dth' && `+91 ${mobile}`}
              </span>
            </div>

            {/* Custom amount */}
            <div style={{ ...S.card,marginBottom:14 }}>
              <p style={S.label}>CUSTOM AMOUNT</p>
              <div style={{ display:'flex',gap:10 }}>
                <input style={{ ...S.input,flex:1 }} type="number"
                  placeholder="Enter amount" value={customAmt}
                  onChange={e => { setCustomAmt(e.target.value); setError(''); }} />
                <button onClick={handleSelectCustom}
                  style={{ padding:'0 18px',background:'linear-gradient(135deg,#f0b429,#ff8c00)',
                             border:'none',borderRadius:12,color:'#000',fontWeight:700,cursor:'pointer' }}>
                  Pay
                </button>
              </div>
              {error && <p style={{ ...S.errBox,marginTop:8 }}>⚠️ {error}</p>}
            </div>

            {/* Plan cards */}
            {PLANS.map(p => (
              <button key={p.id} onClick={() => handleSelectPlan(p)}
                style={{ ...S.planCard, border:`1px solid ${p.popular?'rgba(240,180,41,0.3)':'rgba(255,255,255,0.07)'}` }}>
                {p.popular && (
                  <span style={{ position:'absolute',top:-8,right:12,
                                   background:'#f0b429',color:'#000',fontSize:9,fontWeight:800,
                                   padding:'2px 8px',borderRadius:20 }}>POPULAR</span>
                )}
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
                  <div style={{ textAlign:'left' as const }}>
                    <p style={{ fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:20,color:'#f0b429' }}>
                      ₹{p.price}
                    </p>
                    <p style={{ color:'#555570',fontSize:11,marginTop:2 }}>{p.desc}</p>
                  </div>
                  <span style={{ color:'#8888a8',fontSize:11,background:'#1e1e2a',
                                   padding:'4px 10px',borderRadius:8 }}>
                    {p.validity}
                  </span>
                </div>
                <div style={{ display:'flex',gap:12,marginTop:10 }}>
                  {[['📶',p.data],['📞',p.calls],['💬',p.sms]].map(([icon,val]) => (
                    <div key={icon} style={{ display:'flex',alignItems:'center',gap:4 }}>
                      <span style={{ fontSize:12 }}>{icon}</span>
                      <span style={{ color:'#8888a8',fontSize:11 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </>
        )}

        {/* ── CONFIRM ── */}
        {step === 'confirm' && plan && (
          <div>
            <div style={S.card}>
              <p style={{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,color:'#f0f0f8',marginBottom:16 }}>
                Confirm Recharge
              </p>
              {[
                ['Number',    type!=='dth'?`+91 ${mobile}`:'DTH Account'],
                ['Operator',  operator],
                ['Plan',      plan.desc],
                ['Validity',  plan.validity],
                ['Data',      plan.data],
                ['Amount',    `₹${plan.price}`],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex',justifyContent:'space-between',
                                       padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color:'#555570',fontSize:13 }}>{k}</span>
                  <span style={{ color:'#f0f0f8',fontWeight:600,fontSize:13 }}>{v}</span>
                </div>
              ))}
              <div style={{ display:'flex',justifyContent:'space-between',paddingTop:12 }}>
                <span style={{ color:'#555570',fontSize:14 }}>Points Earned</span>
                <span style={{ color:'#f0b429',fontWeight:700,fontSize:14 }}>
                  +{Math.floor(plan.price/10)} pts
                </span>
              </div>
            </div>

            <div style={{ display:'flex',justifyContent:'space-between',
                           padding:'10px 14px',background:'#16161f',borderRadius:12,margin:'12px 0' }}>
              <span style={{ color:'#555570',fontSize:13 }}>Wallet balance</span>
              <span style={{ color:plan.price>bal?'#ef4444':'#10b981',fontWeight:700,fontSize:13 }}>
                ₹{bal.toLocaleString('en-IN')}
              </span>
            </div>

            {error && <p style={{ ...S.errBox,marginBottom:12 }}>⚠️ {error}</p>}

            <button onClick={handlePay} disabled={loading}
              style={{ ...S.goldBtn,opacity:loading?0.6:1 }}>
              {loading?'⏳ Processing...':`Recharge ₹${plan.price} →`}
            </button>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && plan && (
          <div style={{ display:'flex',flexDirection:'column' as const,alignItems:'center',
                         textAlign:'center' as const,paddingTop:40 }}>
            <div style={{ width:80,height:80,borderRadius:'50%',background:'rgba(16,185,129,0.1)',
                           border:'2px solid #10b981',display:'flex',alignItems:'center',
                           justifyContent:'center',fontSize:36,marginBottom:16 }}>✅</div>
            <h2 style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:'#f0f0f8',marginBottom:8 }}>
              Recharge Done!
            </h2>
            <p style={{ color:'#8888a8',fontSize:15,marginBottom:4 }}>
              {type!=='dth'?`+91 ${mobile}`:operator} recharged with ₹{plan.price}
            </p>

            <div style={{ ...S.card,width:'100%',marginTop:20,marginBottom:20,textAlign:'left' as const }}>
              {[
                ['Transaction ID', txId],
                ['Amount',         `₹${plan.price}`],
                ['Points Earned',  `+${Math.floor(plan.price/10)} pts`],
                ['Status',         '✅ Successful'],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex',justifyContent:'space-between',
                                       padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color:'#555570',fontSize:13 }}>{k}</span>
                  <span style={{ color:'#f0f0f8',fontWeight:700,fontSize:13 }}>{v}</span>
                </div>
              ))}
            </div>

            <button style={S.goldBtn} onClick={reset}>Recharge Again</button>
            <button style={{ ...S.goldBtn,marginTop:10,background:'transparent',
                              border:'1px solid rgba(255,255,255,0.1)',color:'#f0f0f8' }}
              onClick={() => navigate('/dashboard')}>
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:     { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  header:   { display:'flex',alignItems:'center',gap:14,padding:'52px 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)' },
  back:     { background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' },
  title:    { fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8',flex:1 },
  card:     { background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',borderRadius:18,padding:20,marginBottom:14 },
  label:    { color:'#555570',fontSize:10,fontWeight:700,letterSpacing:0.8,marginBottom:8,textTransform:'uppercase' as const },
  input:    { background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'12px 14px',fontSize:14,outline:'none',color:'#f0f0f8',fontFamily:'inherit',boxSizing:'border-box' as const },
  goldBtn:  { width:'100%',padding:'15px',background:'linear-gradient(135deg,#f0b429,#ff8c00)',border:'none',borderRadius:14,color:'#000',fontWeight:700,fontSize:16,cursor:'pointer',fontFamily:'inherit' },
  planCard: { width:'100%',background:'#16161f',borderRadius:16,padding:'16px',marginBottom:10,cursor:'pointer',position:'relative' as const,display:'block',textAlign:'left' as const },
  errBox:   { color:'#ef4444',fontSize:13,padding:'10px 12px',background:'rgba(239,68,68,0.1)',borderRadius:10,border:'1px solid rgba(239,68,68,0.2)' },
};
