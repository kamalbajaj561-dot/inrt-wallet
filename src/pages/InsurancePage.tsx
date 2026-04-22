import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';

const PRODUCTS = [
  {icon:'❤️',name:'Health Insurance',desc:'Family floater plans from ₹500/month',badge:'Popular',color:'#ff4d6a'},
  {icon:'🚗',name:'Car Insurance',desc:'Comprehensive coverage from ₹2,500/year',badge:'',color:'#4d8af0'},
  {icon:'🏠',name:'Home Insurance',desc:'Protect your home from ₹800/year',badge:'',color:'#00d68f'},
  {icon:'✈️',name:'Travel Insurance',desc:'Trip coverage from ₹99',badge:'New',color:'#00e5cc'},
  {icon:'📱',name:'Mobile Insurance',desc:'Screen & theft cover from ₹49/month',badge:'',color:'#a78bfa'},
  {icon:'💼',name:'Term Life Plan',desc:'₹1Cr cover from ₹500/month',badge:'Best Value',color:'#f4b942'},
];

export default function InsurancePage() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Insurance</h1>
        </div>
      </div>
      <div style={{ padding:'16px 16px 40px' }}>
        <div style={{ background:'rgba(0,229,204,0.05)',border:'1px solid rgba(0,229,204,0.15)',
                       borderRadius:'var(--r2)',padding:'14px 16px',marginBottom:20 }}>
          <p style={{ color:'var(--teal)',fontWeight:600,fontSize:13 }}>
            🛡️ Insure smart · Instant policy · IRDAI approved
          </p>
        </div>
        {PRODUCTS.map(p => (
          <div key={p.name} style={{ background:'var(--bg-card)',border:'1px solid var(--b1)',
                                      borderRadius:'var(--r2)',padding:'18px',marginBottom:12,
                                      display:'flex',gap:14,alignItems:'center',cursor:'pointer' }}>
            <div style={{ width:52,height:52,borderRadius:'var(--r2)',background:`${p.color}18`,
                           border:`1px solid ${p.color}30`,display:'flex',alignItems:'center',
                           justifyContent:'center',fontSize:24,flexShrink:0 }}>
              {p.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4 }}>
                <p style={{ color:'var(--t1)',fontWeight:700,fontSize:15 }}>{p.name}</p>
                {p.badge && <span className="badge-teal">{p.badge}</span>}
              </div>
              <p style={{ color:'var(--t2)',fontSize:12 }}>{p.desc}</p>
            </div>
            <span style={{ color:'var(--teal)',fontSize:18 }}>→</span>
          </div>
        ))}
      </div>
    </div>
  );
}