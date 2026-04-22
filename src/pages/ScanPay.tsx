import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';

export default function ScanPay() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#000',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title" style={{ color:'#fff' }}>Scan & Pay</h1>
        </div>
      </div>
      <div style={{ position:'relative',height:400,background:'#111',display:'flex',
                     alignItems:'center',justifyContent:'center' }}>
        {/* Viewfinder */}
        <div style={{ width:240,height:240,position:'relative' }}>
          {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos,i) => (
            <div key={i} style={{ position:'absolute',...pos,width:40,height:40,
                                    borderTop:i<2?'3px solid #00e5cc':'none',
                                    borderBottom:i>=2?'3px solid #00e5cc':'none',
                                    borderLeft:i%2===0?'3px solid #00e5cc':'none',
                                    borderRight:i%2!==0?'3px solid #00e5cc':'none' }} />
          ))}
          <div style={{ position:'absolute',top:'50%',left:0,right:0,height:2,
                         background:'rgba(0,229,204,0.5)',animation:'scanLine 2s infinite' }} />
        </div>
        <p style={{ position:'absolute',bottom:24,color:'rgba(255,255,255,0.5)',fontSize:13,textAlign:'center' }}>
          Point camera at any QR code to pay
        </p>
      </div>
      <div style={{ padding:'20px 16px' }}>
        <button className="btn-outline" style={{ marginBottom:12 }}
          onClick={() => navigate('/send')}>
          Enter UPI ID / Phone number instead
        </button>
      </div>
      <style>{`@keyframes scanLine{0%{top:0%}50%{top:100%}100%{top:0%}}`}</style>
    </div>
  );
}