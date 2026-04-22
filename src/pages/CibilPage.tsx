import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/theme.css';
export default function CibilPage() {
  const navigate = useNavigate();
  const [loading,setLoading] = useState(true);
  const score = 762;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(()=>{setTimeout(()=>setLoading(false),1500);},[]);
  useEffect(()=>{
    if(!loading&&canvasRef.current){
      const canvas=canvasRef.current,ctx=canvas.getContext('2d')!;
      const cx=canvas.width/2,cy=canvas.height*0.72,r=canvas.width*0.38;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.beginPath();ctx.arc(cx,cy,r,Math.PI,2*Math.PI);ctx.lineWidth=18;ctx.strokeStyle='#111e35';ctx.stroke();
      const pct=(score-300)/600;
      const grad=ctx.createLinearGradient(cx-r,cy,cx+r,cy);
      grad.addColorStop(0,'#ff4d6a');grad.addColorStop(0.5,'#f4b942');grad.addColorStop(1,'#00d68f');
      ctx.beginPath();ctx.arc(cx,cy,r,Math.PI,Math.PI+pct*Math.PI);ctx.lineWidth=18;ctx.lineCap='round';ctx.strokeStyle=grad;ctx.stroke();
      ctx.fillStyle='#e8edf8';ctx.font=`bold 40px Space Grotesk`;ctx.textAlign='center';ctx.fillText(String(score),cx,cy+4);
      ctx.fillStyle='#00d68f';ctx.font=`bold 13px Plus Jakarta Sans`;ctx.fillText('Excellent',cx,cy+26);
      ctx.fillStyle='#3d4f6e';ctx.font=`11px Plus Jakarta Sans`;ctx.textAlign='left';ctx.fillText('300',cx-r-6,cy+16);
      ctx.textAlign='right';ctx.fillText('900',cx+r+6,cy+16);
    }
  },[loading]);
  const FACTORS = [
    {l:'Payment History',s:96,c:'#00d68f',icon:'💳'},{l:'Credit Utilization',s:72,c:'#00d68f',icon:'📊'},
    {l:'Credit Age',s:58,c:'#f4b942',icon:'📅'},{l:'Credit Mix',s:80,c:'#00d68f',icon:'🔀'},{l:'New Inquiries',s:90,c:'#00d68f',icon:'🔍'},
  ];
  const TIPS = [
    {t:'Pay all EMIs on time',imp:'High Impact',c:'#ff4d6a'},{t:'Keep utilization below 30%',imp:'High Impact',c:'#ff4d6a'},
    {t:'Do not close old accounts',imp:'Medium',c:'#f4b942'},{t:'Avoid multiple loan applications',imp:'Low',c:'#00d68f'},
  ];
  if(loading) return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
      <div style={{width:52,height:52,border:'4px solid var(--teal)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <p style={{color:'var(--t2)',fontSize:14,fontFamily:'var(--f-body)'}}>Fetching your credit score…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  return (
    <div style={{maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)'}}>
      <div style={{background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">Credit Score</h1>
          <span className="badge-teal">CIBIL</span>
        </div>
      </div>
      <div style={{padding:'16px 16px 90px'}}>
        <div className="card" style={{textAlign:'center',marginBottom:16}}>
          <canvas ref={canvasRef} width={300} height={180} style={{width:'100%',maxWidth:300,height:'auto'}}/>
          <p style={{color:'var(--t3)',fontSize:11,marginTop:8}}>Last updated: {new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          {[{l:'Active Loans',v:'2',icon:'🏦'},{l:'Credit Cards',v:'1',icon:'💳'},{l:'On-time Payments',v:'98%',icon:'✅'},{l:'Total Exposure',v:'₹4.2L',icon:'📈'}].map(s=>(
            <div key={s.l} style={{background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r2)',padding:'14px'}}>
              <span style={{fontSize:20}}>{s.icon}</span>
              <p style={{color:'var(--t1)',fontWeight:800,fontSize:16,marginTop:8}}>{s.v}</p>
              <p style={{color:'var(--t3)',fontSize:10,marginTop:2}}>{s.l}</p>
            </div>
          ))}
        </div>
        <div className="card" style={{marginBottom:16}}>
          <p className="s-title">Score Factors</p>
          {FACTORS.map(f=>(
            <div key={f.l} style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span>{f.icon}</span><p style={{color:'var(--t1)',fontWeight:600,fontSize:13}}>{f.l}</p>
                </div>
                <span style={{color:f.c,fontWeight:700,fontSize:13}}>{f.s}%</span>
              </div>
              <div style={{background:'var(--bg-elevated)',borderRadius:8,height:7,overflow:'hidden'}}>
                <div style={{width:`${f.s}%`,height:'100%',background:f.c,borderRadius:8}}/>
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{background:'rgba(0,214,143,0.04)',border:'1px solid rgba(0,214,143,0.15)'}}>
          <p className="s-title" style={{color:'var(--green)'}}>💡 Improve Your Score</p>
          {TIPS.map(t=>(
            <div key={t.t} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--b1)'}}>
              <p style={{color:'var(--t2)',fontSize:13,flex:1,paddingRight:12}}>{t.t}</p>
              <span style={{background:`${t.c}18`,color:t.c,fontSize:9,fontWeight:700,padding:'3px 8px',borderRadius:20,flexShrink:0}}>{t.imp.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
