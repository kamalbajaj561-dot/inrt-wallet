import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, increment, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const API = import.meta.env.VITE_API_URL || '';

const CATEGORIES = [
  { id:'electricity', label:'Electricity', icon:'⚡', color:'#f0b429',
    providers:['MSEDCL','BESCOM','TNEB','PSPCL','BSES','Torrent Power','CESC','WBSEDCL'] },
  { id:'water',       label:'Water',       icon:'💧', color:'#00d4ff',
    providers:['BWSSB','Delhi Jal Board','MCG','PMC Water','NMMC','NMCG'] },
  { id:'gas',         label:'Gas',         icon:'🔥', color:'#ff6b35',
    providers:['Indane LPG','Bharat Gas','HP Gas','IGL','MGL','Adani Gas'] },
  { id:'dth',         label:'DTH',         icon:'📡', color:'#8b5cf6',
    providers:['Tata Play','Dish TV','Sun Direct','Airtel DTH','BSNL DTH','DD Free Dish'] },
  { id:'broadband',   label:'Broadband',   icon:'📶', color:'#10b981',
    providers:['JioFiber','Airtel Broadband','ACT Fibernet','Hathway','BSNL Broadband','MTNL'] },
  { id:'insurance',   label:'Insurance',   icon:'🛡️', color:'#06b6d4',
    providers:['LIC','HDFC Life','ICICI Prudential','SBI Life','Max Life','Bajaj Allianz'] },
  { id:'loan',        label:'Loan EMI',    icon:'🏦', color:'#f59e0b',
    providers:['HDFC Bank','SBI','ICICI Bank','Axis Bank','Bajaj Finserv','Tata Capital'] },
  { id:'credit_card', label:'Credit Card', icon:'💳', color:'#ec4899',
    providers:['HDFC Credit Card','SBI Card','ICICI Credit Card','Axis Bank CC','Citi Bank CC','Amex'] },
];

type FlowStep = 'category' | 'details' | 'confirm' | 'success';

export default function BillPaymentsPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step,      setStep]     = useState<FlowStep>('category');
  const [category,  setCategory] = useState(CATEGORIES[0]);
  const [provider,  setProvider] = useState('');
  const [accountNo, setAccountNo]= useState('');
  const [amount,    setAmount]   = useState('');
  const [billRef,   setBillRef]  = useState('');
  const [loading,   setLoading]  = useState(false);
  const [error,     setError]    = useState('');
  const [txId,      setTxId]     = useState('');

  const bal = userProfile?.balance || 0;
  const QUICK_AMOUNTS = [199, 299, 499, 599, 999, 1199];

  const handleFetchBill = async () => {
    if (!provider) return setError('Select a provider');
    if (!accountNo.trim()) return setError('Enter account / consumer number');
    setLoading(true); setError('');
    try {
      // Simulate bill fetch — in production call BBPS/Setu API here
      await new Promise(r => setTimeout(r, 1200));
      const simulatedAmount = (Math.floor(Math.random() * 15) + 1) * 100 + 99;
      setAmount(String(simulatedAmount));
      setBillRef(`BILL${Date.now().toString().slice(-8)}`);
      setStep('confirm');
    } catch (e: any) { setError(e.message || 'Failed to fetch bill'); }
    setLoading(false);
  };

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 1) return setError('Invalid amount');
    if (amt > bal)       return setError(`Insufficient balance. You have ₹${bal}`);
    setLoading(true); setError('');
    try {
      const txRef = `BP${Date.now()}${Math.random().toString(36).slice(2,6).toUpperCase()}`;

      await updateDoc(doc(db, 'users', user!.uid), {
        balance:      increment(-amt),
        cashback:     increment(Math.floor(amt * 0.02)),
        rewardPoints: increment(Math.floor(amt / 10)),
        updatedAt:    serverTimestamp(),
      });
      await addDoc(collection(db, 'transactions'), {
        uid:     user!.uid,
        type:    'debit',
        amount:  amt,
        cat:     'bills',
        note:    `${category.label} — ${provider}`,
        ref:     txRef,
        status:  'success',
        billRef, accountNo, provider,
        cashback: Math.floor(amt * 0.02),
        createdAt: serverTimestamp(),
      });

      setTxId(txRef);
      await refreshProfile();
      setStep('success');
    } catch (e: any) { setError(e.message || 'Payment failed'); }
    setLoading(false);
  };

  const reset = () => {
    setStep('category'); setProvider(''); setAccountNo('');
    setAmount(''); setBillRef(''); setTxId(''); setError('');
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button
          onClick={() => { if(step==='category') navigate('/dashboard'); else if(step==='confirm') setStep('details'); else if(step==='details') setStep('category'); }}
          style={S.back}>←</button>
        <h1 style={S.title}>Bill Payments</h1>
        <span style={{ background:'rgba(240,180,41,0.1)',border:'1px solid rgba(240,180,41,0.2)',
                         borderRadius:8,padding:'3px 9px',color:'#f0b429',fontSize:10,fontWeight:700 }}>
          BBPS
        </span>
      </div>

      {/* Progress */}
      {step !== 'success' && (
        <div style={{ padding:'0 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)' }}>
          <div style={{ display:'flex',gap:4 }}>
            {['category','details','confirm'].map((s,i) => (
              <div key={s} style={{ flex:1,height:3,borderRadius:3,transition:'background 0.3s',
                                     background: ['category','details','confirm','success'].indexOf(step)>=i ? '#f0b429' : '#1e1e2a' }} />
            ))}
          </div>
        </div>
      )}

      <div style={{ padding:'16px 16px 90px' }}>

        {/* ── STEP 1: Category ── */}
        {step === 'category' && (
          <>
            <p style={S.sectionTitle}>Select Category</p>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12 }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => { setCategory(cat); setProvider(''); setStep('details'); }}
                  style={{ background:'#16161f',border:`1px solid ${category.id===cat.id?cat.color:'rgba(255,255,255,0.07)'}`,
                             borderRadius:16,padding:'18px 14px',
                             display:'flex',flexDirection:'column' as const,alignItems:'flex-start',gap:8,
                             cursor:'pointer',transition:'all 0.2s' }}>
                  <div style={{ width:44,height:44,borderRadius:12,
                                  background:`${cat.color}18`,border:`1px solid ${cat.color}30`,
                                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:22 }}>
                    {cat.icon}
                  </div>
                  <p style={{ color:'#f0f0f8',fontWeight:700,fontSize:14,textAlign:'left' as const }}>{cat.label}</p>
                  <p style={{ color:'#555570',fontSize:10 }}>{cat.providers.length} providers</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── STEP 2: Details ── */}
        {step === 'details' && (
          <div style={S.card}>
            <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:20 }}>
              <div style={{ width:44,height:44,borderRadius:12,background:`${category.color}18`,
                             display:'flex',alignItems:'center',justifyContent:'center',fontSize:22 }}>
                {category.icon}
              </div>
              <p style={S.sectionTitle}>{category.label} Payment</p>
            </div>

            <p style={S.fieldLabel}>SELECT PROVIDER</p>
            <div style={{ display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:16 }}>
              {category.providers.map(p => (
                <button key={p} onClick={() => { setProvider(p); setError(''); }}
                  style={{ padding:'8px 14px',borderRadius:10,fontSize:12,fontWeight:600,cursor:'pointer',
                             background:provider===p?`${category.color}18`:'#1e1e2a',
                             border:`1px solid ${provider===p?category.color:'rgba(255,255,255,0.07)'}`,
                             color:provider===p?category.color:'#8888a8' }}>
                  {p}
                </button>
              ))}
            </div>

            <p style={S.fieldLabel}>
              {category.id==='credit_card' ? 'CARD NUMBER' :
               category.id==='loan'        ? 'LOAN ACCOUNT NUMBER' :
               category.id==='insurance'   ? 'POLICY NUMBER' : 'CONSUMER / ACCOUNT NUMBER'}
            </p>
            <input style={{ ...S.input,marginBottom:16 }}
              type="tel" placeholder="Enter number"
              value={accountNo}
              onChange={e => { setAccountNo(e.target.value); setError(''); }} />

            {error && <p style={S.errBox}>⚠️ {error}</p>}

            <button onClick={handleFetchBill} disabled={loading}
              style={{ ...S.goldBtn,opacity:loading?0.6:1 }}>
              {loading ? '⏳ Fetching bill...' : 'Fetch Bill Amount →'}
            </button>
          </div>
        )}

        {/* ── STEP 3: Confirm ── */}
        {step === 'confirm' && (
          <div>
            <div style={S.card}>
              <p style={S.sectionTitle}>Bill Details</p>
              {[
                ['Category',   category.label],
                ['Provider',   provider],
                ['Account No', accountNo],
                ['Bill Ref',   billRef],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex',justifyContent:'space-between',
                                       padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color:'#555570',fontSize:13 }}>{k}</span>
                  <span style={{ color:'#f0f0f8',fontWeight:600,fontSize:13 }}>{v}</span>
                </div>
              ))}
              <div style={{ display:'flex',justifyContent:'space-between',paddingTop:12 }}>
                <span style={{ color:'#555570',fontSize:14 }}>Amount Due</span>
                <span style={{ fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:22,color:'#f0b429' }}>
                  ₹{parseFloat(amount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Cashback notice */}
            <div style={{ background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.15)',
                           borderRadius:14,padding:'12px 16px',marginTop:12,marginBottom:16 }}>
              <p style={{ color:'#10b981',fontSize:13,fontWeight:600 }}>
                🎁 You'll earn ₹{Math.floor(parseFloat(amount||'0') * 0.02)} cashback + {Math.floor(parseFloat(amount||'0') / 10)} reward points
              </p>
            </div>

            <div style={{ display:'flex',justifyContent:'space-between',
                           padding:'10px 14px',background:'#16161f',borderRadius:12,marginBottom:16 }}>
              <span style={{ color:'#555570',fontSize:13 }}>Wallet balance</span>
              <span style={{ color:parseFloat(amount)>bal?'#ef4444':'#10b981',fontWeight:700,fontSize:13 }}>
                ₹{bal.toLocaleString('en-IN')}
              </span>
            </div>

            {error && <p style={{ ...S.errBox,marginBottom:12 }}>⚠️ {error}</p>}

            <button onClick={handlePay} disabled={loading}
              style={{ ...S.goldBtn,opacity:loading?0.6:1 }}>
              {loading ? '⏳ Processing...' : `Pay ₹${parseFloat(amount).toLocaleString('en-IN')} →`}
            </button>
            <button onClick={() => setStep('details')}
              style={{ width:'100%',marginTop:10,padding:'13px',background:'transparent',
                        border:'1px solid rgba(255,255,255,0.07)',borderRadius:14,
                        color:'#8888a8',fontWeight:600,cursor:'pointer' }}>
              ← Go Back
            </button>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <div style={{ display:'flex',flexDirection:'column' as const,alignItems:'center',
                         textAlign:'center' as const,paddingTop:40 }}>
            <div style={{ width:80,height:80,borderRadius:'50%',
                           background:'rgba(16,185,129,0.1)',border:'2px solid #10b981',
                           display:'flex',alignItems:'center',justifyContent:'center',
                           fontSize:36,marginBottom:16 }}>✅</div>
            <h2 style={{ fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:24,color:'#f0f0f8',marginBottom:8 }}>
              Bill Paid!
            </h2>
            <p style={{ color:'#8888a8',fontSize:15,marginBottom:4 }}>
              ₹{parseFloat(amount).toLocaleString('en-IN')} paid to {provider}
            </p>

            <div style={{ ...S.card,width:'100%',marginTop:20,marginBottom:20,textAlign:'left' as const }}>
              {[
                ['Transaction ID', txId],
                ['Category',       category.label],
                ['Provider',       provider],
                ['Amount',         `₹${parseFloat(amount).toLocaleString('en-IN')}`],
                ['Cashback',       `₹${Math.floor(parseFloat(amount) * 0.02)}`],
                ['Points Earned',  `+${Math.floor(parseFloat(amount) / 10)} pts`],
                ['Status',         '✅ Paid'],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex',justifyContent:'space-between',
                                       padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color:'#555570',fontSize:13 }}>{k}</span>
                  <span style={{ color:'#f0f0f8',fontWeight:700,fontSize:13 }}>{v}</span>
                </div>
              ))}
            </div>

            <button style={S.goldBtn} onClick={reset}>Pay Another Bill</button>
            <button style={{ ...S.goldBtn,background:'transparent',border:'1px solid rgba(255,255,255,0.1)',
                              color:'#f0f0f8',marginTop:10 }}
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
  page:         { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  header:       { display:'flex',alignItems:'center',gap:14,padding:'52px 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#0a0a0f)' },
  back:         { background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' },
  title:        { fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8',flex:1 },
  sectionTitle: { fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,color:'#f0f0f8',marginBottom:0 },
  card:         { background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',borderRadius:18,padding:20 },
  fieldLabel:   { color:'#555570',fontSize:10,fontWeight:700,letterSpacing:0.8,marginBottom:8,textTransform:'uppercase' as const },
  input:        { width:'100%',background:'#1e1e2a',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'13px 14px',fontSize:15,outline:'none',color:'#f0f0f8',fontFamily:'inherit',boxSizing:'border-box' as const },
  goldBtn:      { width:'100%',padding:'15px',background:'linear-gradient(135deg,#f0b429,#ff8c00)',border:'none',borderRadius:14,color:'#000',fontWeight:700,fontSize:16,cursor:'pointer',fontFamily:'inherit' },
  errBox:       { color:'#ef4444',fontSize:13,padding:'10px 12px',background:'rgba(239,68,68,0.1)',borderRadius:10,border:'1px solid rgba(239,68,68,0.2)',marginBottom:12 },
};
