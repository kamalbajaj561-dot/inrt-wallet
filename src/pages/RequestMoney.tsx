import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';

export default function RequestMoney() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [copied, setCopied] = useState(false);

  const link = `https://inrtwallet.app/pay/${userProfile?.phone}?amount=${amount}&note=${encodeURIComponent(note)}`;

  const copy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Request Money</h1>
        </div>
      </div>
      <div style={{ padding:'20px 16px 40px' }}>
        <div className="card" style={{ marginBottom:16 }}>
          <p className="s-label">AMOUNT (OPTIONAL)</p>
          <div className="amount-box" style={{ marginBottom:14 }}>
            <span style={{ color:'var(--teal)',fontSize:24,fontWeight:700 }}>₹</span>
            <input className="amount-input" type="number" placeholder="0"
              value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <p className="s-label">NOTE</p>
          <input className="inp" placeholder="What is this for?" value={note}
            onChange={e => setNote(e.target.value)} />
        </div>
        <div className="card" style={{ marginBottom:16 }}>
          <p className="s-label">PAYMENT LINK</p>
          <div style={{ background:'var(--bg-elevated)',borderRadius:'var(--r1)',padding:'12px 14px',
                         fontSize:12,color:'var(--t2)',wordBreak:'break-all',marginBottom:12 }}>
            {link}
          </div>
          <button className="btn-primary" onClick={copy}>
            {copied ? '✅ Copied!' : '📋 Copy Link'}
          </button>
        </div>
        <div className="card">
          <p className="s-label">SHARE VIA</p>
          <div style={{ display:'flex',gap:10 }}>
            {['WhatsApp','SMS','Email'].map(m => (
              <button key={m} className="btn-outline" style={{ flex:1,fontSize:12,padding:'10px 0' }}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}