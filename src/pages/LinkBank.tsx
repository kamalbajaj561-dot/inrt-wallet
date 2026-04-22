import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';

const BANKS = [
  'HDFC Bank','SBI','ICICI Bank','Axis Bank','Kotak Mahindra',
  'Punjab National Bank','Bank of Baroda','Canara Bank','IDFC First','Yes Bank',
];

export default function LinkBank() {
  const navigate = useNavigate();
  const [linked,  setLinked]  = useState<string[]>([]);
  const [loading, setLoading] = useState('');

  const toggle = async (bank: string) => {
    setLoading(bank);
    await new Promise(r => setTimeout(r, 1200));
    setLinked(prev => prev.includes(bank) ? prev.filter(b=>b!==bank) : [...prev,bank]);
    setLoading('');
  };

  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Link Bank Account</h1>
        </div>
      </div>
      <div style={{ padding:'20px 16px 40px' }}>
        <div style={{ background:'rgba(0,229,204,0.06)',border:'1px solid rgba(0,229,204,0.15)',
                       borderRadius:'var(--r2)',padding:'12px 16px',marginBottom:20 }}>
          <p style={{ color:'var(--teal)',fontSize:13,fontWeight:600 }}>
            🔒 Bank-grade security · UPI 2.0 · Instant verification
          </p>
        </div>
        {BANKS.map(bank => (
          <div key={bank} style={{ background:'var(--bg-card)',border:`1px solid ${linked.includes(bank)?'var(--teal)':'var(--b1)'}`,
                                    borderRadius:'var(--r2)',padding:'16px',marginBottom:10,
                                    display:'flex',alignItems:'center',gap:14 }}>
            <div style={{ width:42,height:42,borderRadius:'var(--r1)',background:'var(--bg-elevated)',
                           display:'flex',alignItems:'center',justifyContent:'center',
                           fontSize:14,fontWeight:700,color:'var(--teal)',flexShrink:0 }}>
              {bank.slice(0,2).toUpperCase()}
            </div>
            <p style={{ flex:1,color:'var(--t1)',fontWeight:600,fontSize:14 }}>{bank}</p>
            <button onClick={() => toggle(bank)} disabled={loading===bank}
              style={{ padding:'8px 16px',borderRadius:'var(--r1)',fontSize:12,fontWeight:700,
                         cursor:'pointer',border:'none',
                         background:linked.includes(bank)?'rgba(255,77,106,0.1)':'var(--teal-dim)',
                         color:linked.includes(bank)?'var(--red)':'var(--teal)' }}>
              {loading===bank?'…':linked.includes(bank)?'Unlink':'Link'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}