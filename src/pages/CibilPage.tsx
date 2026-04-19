import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function CibilPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [score]   = useState(762);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const t = setTimeout(() => { setLoading(false); }, 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loading && canvasRef.current) drawGauge(canvasRef.current, score);
  }, [loading, score]);

  function drawGauge(canvas: HTMLCanvasElement, score: number) {
    const ctx = canvas.getContext('2d')!;
    const cx = canvas.width / 2, cy = canvas.height * 0.72;
    const r  = canvas.width * 0.38;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 2*Math.PI);
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#1e1e2a';
    ctx.stroke();

    // Colored arc
    const pct = (score - 300) / 600;
    const color = score>=750?'#10b981':score>=700?'#f0b429':score>=600?'#f97316':'#ef4444';
    const grad = ctx.createLinearGradient(cx-r,cy,cx+r,cy);
    grad.addColorStop(0,'#ef4444');
    grad.addColorStop(0.5,'#f0b429');
    grad.addColorStop(1,'#10b981');

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI + pct * Math.PI);
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.strokeStyle = grad;
    ctx.stroke();

    // Score text
    ctx.fillStyle = '#f0f0f8';
    ctx.font = `bold 42px 'Syne', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(String(score), cx, cy + 4);

    ctx.fillStyle = color;
    ctx.font = `bold 14px 'DM Sans', sans-serif`;
    ctx.fillText(score>=750?'Excellent':score>=700?'Good':score>=600?'Fair':'Poor', cx, cy+28);

    // Labels
    ctx.fillStyle = '#555570';
    ctx.font = `11px 'DM Sans',sans-serif`;
    ctx.textAlign = 'left';  ctx.fillText('300', cx-r-8, cy+18);
    ctx.textAlign = 'right'; ctx.fillText('900', cx+r+8, cy+18);
  }

  const factors = [
    { label:'Payment History',     score:96, icon:'💳', desc:'All payments on time — excellent!', color:'#10b981' },
    { label:'Credit Utilization',  score:72, icon:'📊', desc:'Using 28% of limit — healthy', color:'#10b981' },
    { label:'Credit Age',          score:58, icon:'📅', desc:'Average age 3.2 years — moderate', color:'#f0b429' },
    { label:'Credit Mix',          score:80, icon:'🔀', desc:'Good variety of credit types', color:'#10b981' },
    { label:'New Inquiries',       score:90, icon:'🔍', desc:'No recent hard inquiries', color:'#10b981' },
  ];

  const tips = [
    { tip:'Pay all EMIs and credit card bills on time', impact:'High Impact', color:'#ef4444' },
    { tip:'Keep credit utilization below 30%',          impact:'High Impact', color:'#ef4444' },
    { tip:'Do not close old credit accounts',           impact:'Medium',      color:'#f0b429' },
    { tip:'Avoid multiple loan applications at once',   impact:'Medium',      color:'#f0b429' },
    { tip:'Mix secured & unsecured credit',             impact:'Low',         color:'#10b981' },
  ];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={()=>navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>Credit Score</h1>
        <span style={s.badge}>CIBIL</span>
      </div>

      {loading ? (
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'80px 20px' }}>
          <div style={{ width:52,height:52,border:'4px solid #f0b429',borderTopColor:'transparent',
                         borderRadius:'50%',animation:'spin 0.8s linear infinite',marginBottom:16 }} />
          <p style={{ color:'#8888a8',fontSize:14 }}>Fetching your credit score...</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ padding:'0 16px 90px' }}>
          {/* Gauge */}
          <div style={{ ...s.card,textAlign:'center' as const,marginBottom:16 }}>
            <canvas ref={canvasRef} width={300} height={180}
              style={{ width:'100%',maxWidth:300,height:'auto' }} />
            <div style={{ display:'flex',justifyContent:'center',gap:8,marginTop:8 }}>
              <span style={{ ...s.rangeDot, background:'#ef4444' }} />
              <span style={{ color:'#555570',fontSize:10 }}>Poor</span>
              <span style={{ ...s.rangeDot, background:'#f0b429' }} />
              <span style={{ color:'#555570',fontSize:10 }}>Fair</span>
              <span style={{ ...s.rangeDot, background:'#10b981' }} />
              <span style={{ color:'#555570',fontSize:10 }}>Excellent</span>
            </div>
            <p style={{ color:'#555570',fontSize:11,marginTop:8 }}>
              Last updated: {new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
            </p>
          </div>

          {/* Quick stats */}
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16 }}>
            {[
              { label:'Active Loans',    val:'2',    icon:'🏦' },
              { label:'Credit Cards',    val:'1',    icon:'💳' },
              { label:'On-time Payments',val:'98%',  icon:'✅' },
              { label:'Total Exposure',  val:'₹4.2L',icon:'📈' },
            ].map(item=>(
              <div key={item.label} style={{ background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',
                                              borderRadius:14,padding:'14px' }}>
                <span style={{ fontSize:20 }}>{item.icon}</span>
                <p style={{ color:'#f0f0f8',fontWeight:800,fontSize:16,marginTop:8 }}>{item.val}</p>
                <p style={{ color:'#555570',fontSize:10,marginTop:2 }}>{item.label}</p>
              </div>
            ))}
          </div>

          {/* Score Factors */}
          <div style={{ ...s.card,marginBottom:16 }}>
            <p style={s.sectionTitle}>Score Factors</p>
            {factors.map(f=>(
              <div key={f.label} style={{ marginBottom:16 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6 }}>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <span>{f.icon}</span>
                    <div>
                      <p style={{ color:'#f0f0f8',fontWeight:600,fontSize:13 }}>{f.label}</p>
                      <p style={{ color:'#555570',fontSize:10,marginTop:1 }}>{f.desc}</p>
                    </div>
                  </div>
                  <span style={{ color:f.color,fontWeight:700,fontSize:13 }}>{f.score}%</span>
                </div>
                <div style={{ background:'#1e1e2a',borderRadius:8,height:6,overflow:'hidden' }}>
                  <div style={{ width:`${f.score}%`,height:'100%',background:f.color,
                                 borderRadius:8,transition:'width 1s ease' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Tips */}
          <div style={{ ...s.card,background:'rgba(16,185,129,0.05)',
                         border:'1px solid rgba(16,185,129,0.15)',marginBottom:16 }}>
            <p style={{ ...s.sectionTitle,color:'#10b981' }}>💡 Improve Your Score</p>
            {tips.map(t=>(
              <div key={t.tip} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',
                                         padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ color:'#8888a8',fontSize:13,flex:1,paddingRight:12 }}>{t.tip}</p>
                <span style={{ background:`${t.color}15`,color:t.color,
                               fontSize:9,fontWeight:700,padding:'3px 8px',borderRadius:20,
                               flexShrink:0,letterSpacing:0.5 }}>
                  {t.impact.toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          {/* Download report CTA */}
          <button style={{ width:'100%',padding:'16px',background:'linear-gradient(135deg,#f0b429,#ff8c00)',
                            border:'none',borderRadius:14,color:'#000',fontWeight:700,fontSize:16,cursor:'pointer' }}>
            📄 Download Full Credit Report
          </button>
          <p style={{ textAlign:'center' as const,color:'#555570',fontSize:11,marginTop:8 }}>
            Free report · Powered by CRIF High Mark
          </p>
        </div>
      )}
    </div>
  );
}

const s: Record<string,React.CSSProperties> = {
  page:        { maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'#0a0a0f',fontFamily:"'DM Sans',sans-serif" },
  header:      { display:'flex',alignItems:'center',gap:14,padding:'52px 16px 16px',background:'linear-gradient(160deg,#0f0f1a,#111118)' },
  back:        { background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,width:40,height:40,fontSize:18,cursor:'pointer',color:'#f0f0f8',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' },
  title:       { fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:20,color:'#f0f0f8',flex:1 },
  badge:       { background:'rgba(240,180,41,0.1)',border:'1px solid rgba(240,180,41,0.3)',color:'#f0b429',fontSize:10,fontWeight:700,padding:'4px 10px',borderRadius:8 },
  card:        { background:'#16161f',border:'1px solid rgba(255,255,255,0.07)',borderRadius:18,padding:20 },
  sectionTitle:{ fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,color:'#f0f0f8',marginBottom:16 },
  rangeDot:    { display:'inline-block',width:8,height:8,borderRadius:'50%',flexShrink:0,alignSelf:'center' },
};
