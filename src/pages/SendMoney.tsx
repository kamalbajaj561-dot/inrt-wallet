import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUserByPhone, updateBalance, addTransaction } from '../lib/db';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import '../styles/theme.css';

type Step = 1 | 2 | 3;

export default function SendMoney() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step,    setStep]    = useState<Step>(1);
  const [phone,   setPhone]   = useState('');
  const [amount,  setAmount]  = useState('');
  const [note,    setNote]    = useState('');
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const [txData,  setTxData]  = useState<any>(null);

  const bal   = userProfile?.balance || 0;
  const QUICK = [50, 100, 200, 500, 1000];

  const lookupPhone = async () => {
    const p = phone.replace(/\D/g, '');
    if (p.length !== 10) return setErr('Enter valid 10-digit number');
    if (p === userProfile?.phone) return setErr('Cannot send to yourself');
    setLoading(true); setErr('');
    try {
      const found = await getUserByPhone(p);
      if (found) {
        setContact(found); setStep(2);
      } else {
        setErr('No INRT Wallet account found for this number');
      }
    } catch { setErr('Lookup failed. Try again.'); }
    setLoading(false);
  };

  const handleSend = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt < 1) return setErr('Enter valid amount');
    if (amt > bal)       return setErr(`Insufficient balance. You have ₹${bal}`);
    setLoading(true); setErr('');
    try {
      const ref = `TXN${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      // Deduct from sender
      await updateBalance(user!.uid, -amt);
      await addTransaction(user!.uid, {
        type:'debit', amount:amt,
        note: note || `Sent to ${contact.name || phone}`,
        cat:'transfer', ref,
      });
      // Credit receiver
      await updateBalance(contact.uid, amt);
      await addTransaction(contact.uid, {
        type:'credit', amount:amt,
        note: `Received from ${userProfile?.name || 'INRT User'}`,
        cat:'transfer', ref,
      });
      await refreshProfile();
      setTxData({ ref, amount:amt, to:contact.name||phone });
      setStep(3);
    } catch (e: any) { setErr(e.message || 'Transfer failed'); }
    setLoading(false);
  };

  // ── Success ──
  if (step === 3 && txData) return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',
                   fontFamily:'var(--f-body)',display:'flex',flexDirection:'column',
                   alignItems:'center',padding:'80px 24px',textAlign:'center' }}>
      <div style={{ width:80,height:80,borderRadius:'50%',background:'rgba(0,214,143,0.1)',
                     border:'2px solid var(--green)',display:'flex',alignItems:'center',
                     justifyContent:'center',fontSize:36,marginBottom:20 }}>✅</div>
      <h2 style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:24,color:'var(--t1)',marginBottom:8 }}>
        Money Sent!
      </h2>
      <p style={{ color:'var(--t2)',fontSize:16,marginBottom:24 }}>
        ₹{txData.amount.toLocaleString('en-IN')} sent to {txData.to}
      </p>
      <div style={{ background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r3)',
                     padding:20,width:'100%',marginBottom:24,textAlign:'left' as const }}>
        {[
          ['Transaction ID', txData.ref],
          ['Amount',`₹${txData.amount.toLocaleString('en-IN')}`],
          ['To', txData.to],
          ['Status','✅ Success'],
          ['Points',`+${Math.floor(txData.amount/10)} pts`],
        ].map(([k,v])=>(
          <div key={k} style={{ display:'flex',justifyContent:'space-between',
                                  padding:'9px 0',borderBottom:'1px solid var(--b1)' }}>
            <span style={{ color:'var(--t2)',fontSize:13 }}>{k}</span>
            <span style={{ color:'var(--t1)',fontWeight:700,fontSize:13 }}>{v}</span>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={() => navigate('/dashboard')}>Back to Home</button>
      <button className="btn-outline" style={{ marginTop:10 }}
        onClick={() => { setStep(1);setPhone('');setAmount('');setNote('');setContact(null);setTxData(null); }}>
        Send Again
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:16 }}>
          <button onClick={() => step > 1 ? setStep((step-1) as Step) : navigate('/dashboard')}
            className="back-btn">←</button>
          <h1 className="page-title">Send Money</h1>
        </div>
        {/* Progress bar */}
        <div style={{ display:'flex',gap:6 }}>
          {[1,2].map(s => (
            <div key={s} style={{ flex:1,height:3,borderRadius:3,transition:'background 0.3s',
                                    background:step>s?'var(--teal)':step===s?'var(--teal)':'var(--b1)' }} />
          ))}
        </div>
      </div>

      <div style={{ padding:'20px 16px 40px' }}>
        {/* STEP 1 */}
        {step === 1 && (
          <div className="card">
            <p className="s-title">Enter Recipient</p>
            <p className="s-label">MOBILE NUMBER</p>
            <div style={{ display:'flex',border:'1px solid var(--b1)',borderRadius:'var(--r2)',overflow:'hidden',marginBottom:16 }}>
              <span style={{ padding:'14px 12px',background:'var(--bg-elevated)',color:'var(--t2)',
                              fontSize:13,borderRight:'1px solid var(--b1)',whiteSpace:'nowrap' }}>
                🇮🇳 +91
              </span>
              <input style={{ flex:1,background:'none',border:'none',outline:'none',
                               padding:'14px',fontSize:15,color:'var(--t1)',fontFamily:'inherit' }}
                type="tel" maxLength={10} placeholder="10-digit number"
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g,'')); setErr(''); }}
                onKeyDown={e => e.key==='Enter' && lookupPhone()} />
            </div>
            {err && <p className="err-box" style={{ marginBottom:14 }}>⚠️ {err}</p>}
            <button className="btn-primary" onClick={lookupPhone}
              disabled={loading || phone.replace(/\D/g,'').length !== 10}
              style={{ opacity:loading||phone.replace(/\D/g,'').length!==10?0.5:1 }}>
              {loading ? 'Looking up…' : 'Continue →'}
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && contact && (
          <>
            {/* Recipient card */}
            <div className="card" style={{ display:'flex',alignItems:'center',gap:14,marginBottom:16 }}>
              <div style={{ width:52,height:52,borderRadius:'50%',background:'var(--g-teal)',
                             display:'flex',alignItems:'center',justifyContent:'center',
                             fontFamily:'var(--f-display)',fontWeight:700,fontSize:20,color:'#000' }}>
                {(contact.name||'?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontWeight:700,fontSize:16,color:'var(--t1)' }}>{contact.name}</p>
                <p style={{ color:'var(--t3)',fontSize:12,marginTop:2 }}>
                  +91 {contact.phone}
                </p>
              </div>
              <span className="badge-green">✓ INRT User</span>
            </div>

            <div className="card" style={{ marginBottom:16 }}>
              <p className="s-label">AMOUNT</p>
              <div className="amount-box" style={{ marginBottom:12 }}>
                <span style={{ color:'var(--teal)',fontSize:24,fontWeight:700 }}>₹</span>
                <input className="amount-input" type="number"
                  placeholder="0" value={amount}
                  onChange={e => { setAmount(e.target.value); setErr(''); }} />
              </div>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:14 }}>
                {QUICK.map(a => (
                  <button key={a} onClick={() => setAmount(String(a))}
                    style={{ padding:'7px 12px',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,
                               cursor:'pointer',
                               background:amount===String(a)?'var(--teal-dim)':'var(--bg-elevated)',
                               border:`1px solid ${amount===String(a)?'var(--teal)':'var(--b1)'}`,
                               color:amount===String(a)?'var(--teal)':'var(--t2)' }}>
                    ₹{a}
                  </button>
                ))}
              </div>
              <p className="s-label">NOTE (OPTIONAL)</p>
              <input className="inp" placeholder="What's this for?"
                value={note} onChange={e => setNote(e.target.value)} />
            </div>

            <div style={{ display:'flex',justifyContent:'space-between',padding:'10px 14px',
                           background:'var(--bg-card)',borderRadius:'var(--r1)',marginBottom:16,
                           border:'1px solid var(--b1)' }}>
              <span style={{ color:'var(--t2)',fontSize:13 }}>Available balance</span>
              <span style={{ color:parseFloat(amount)>bal?'var(--red)':'var(--green)',
                              fontWeight:700,fontSize:13 }}>
                ₹{bal.toLocaleString('en-IN')}
              </span>
            </div>

            {err && <p className="err-box" style={{ marginBottom:14 }}>⚠️ {err}</p>}

            <button className="btn-primary" onClick={handleSend}
              disabled={loading||!amount||parseFloat(amount)<1||parseFloat(amount)>bal}
              style={{ opacity:loading||!amount||parseFloat(amount)<1||parseFloat(amount)>bal?0.5:1 }}>
              {loading ? '⏳ Sending…' : amount ? `Send ₹${parseFloat(amount).toLocaleString('en-IN')} →` : 'Enter amount'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
