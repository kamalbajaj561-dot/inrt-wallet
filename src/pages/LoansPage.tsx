import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';

const LOANS = [
  {icon:'⚡',name:'Instant Personal Loan',desc:'Up to ₹5 Lakh · 24h disbursal',rate:'10.5% p.a.',color:'#f4b942'},
  {icon:'🏠',name:'Home Loan',desc:'Up to ₹2 Crore · 20 year tenure',rate:'8.5% p.a.',color:'#00d68f'},
  {icon:'🚗',name:'Car Loan',desc:'New & used cars · 100% finance',rate:'7.9% p.a.',color:'#4d8af0'},
  {icon:'📚',name:'Education Loan',desc:'Study abroad · moratorium period',rate:'9.5% p.a.',color:'#a78bfa'},
  {icon:'💼',name:'Business Loan',desc:'Working capital · ₹50K to ₹50L',rate:'12% p.a.',color:'#00e5cc'},
  {icon:'💳',name:'Credit Card',desc:'Lifetime free · rewards on every spend',rate:'0 joining fee',color:'#ff4d6a'},
];

export default function LoansPage() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Loans & Credit</h1>
        </div>
      </div>
      <div style={{ padding:'16px 16px 40px' }}>
        {LOANS.map(l => (
          <div key={l.name} style={{ background:'var(--bg-card)',border:'1px solid var(--b1)',
                                      borderRadius:'var(--r2)',padding:'18px',marginBottom:12,
                                      display:'flex',gap:14,alignItems:'center',cursor:'pointer' }}>
            <div style={{ width:52,height:52,borderRadius:'var(--r2)',background:`${l.color}18`,
                           border:`1px solid ${l.color}28`,display:'flex',alignItems:'center',
                           justifyContent:'center',fontSize:24,flexShrink:0 }}>
              {l.icon}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ color:'var(--t1)',fontWeight:700,fontSize:15,marginBottom:4 }}>{l.name}</p>
              <p style={{ color:'var(--t2)',fontSize:12,marginBottom:4 }}>{l.desc}</p>
              <span style={{ color:l.color,fontSize:11,fontWeight:700 }}>{l.rate}</span>
            </div>
            <button style={{ padding:'8px 14px',background:`${l.color}18`,border:`1px solid ${l.color}30`,
                               borderRadius:'var(--r1)',color:l.color,fontSize:12,fontWeight:700,cursor:'pointer' }}>
              Apply
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}