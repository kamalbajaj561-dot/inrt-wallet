import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/theme.css';

export default function QRPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const upiId = `${userProfile?.phone || ''}@inrt`;

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const size = 280;
    canvas.width = size; canvas.height = size;
    // Simple QR visual placeholder
    ctx.fillStyle = '#0d1528';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#00e5cc';
    const cell = size / 25;
    for (let i = 0; i < 25; i++) {
      for (let j = 0; j < 25; j++) {
        if (Math.random() > 0.5 || (i<7&&j<7) || (i>17&&j<7) || (i<7&&j>17)) {
          ctx.fillRect(i * cell + 2, j * cell + 2, cell - 2, cell - 2);
        }
      }
    }
    ctx.fillStyle = '#0d1528';
    ctx.fillRect(cell, cell, 5*cell, 5*cell);
    ctx.fillRect(19*cell, cell, 5*cell, 5*cell);
    ctx.fillRect(cell, 19*cell, 5*cell, 5*cell);
    ctx.fillStyle = '#00e5cc';
    ctx.fillRect(2*cell, 2*cell, 3*cell, 3*cell);
    ctx.fillRect(20*cell, 2*cell, 3*cell, 3*cell);
    ctx.fillRect(2*cell, 20*cell, 3*cell, 3*cell);
    // Logo center
    ctx.fillStyle = '#050914';
    ctx.fillRect(10*cell, 10*cell, 5*cell, 5*cell);
    ctx.fillStyle = '#00e5cc';
    ctx.font = `bold ${cell*2}px Space Grotesk`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('IN', size/2, size/2);
  }, []);

  const download = () => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.href = canvasRef.current.toDataURL();
    a.download = `inrt-qr-${userProfile?.phone}.png`;
    a.click();
  };

  return (
    <div style={{ maxWidth:480,margin:'0 auto',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:4 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">My QR Code</h1>
        </div>
      </div>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'32px 24px' }}>
        <div style={{ background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r3)',
                       padding:28,marginBottom:20,boxShadow:'var(--s2)' }}>
          <canvas ref={canvasRef} style={{ display:'block',borderRadius:'var(--r2)' }} />
        </div>
        <p style={{ fontFamily:'var(--f-display)',fontWeight:700,fontSize:18,color:'var(--t1)',marginBottom:4 }}>
          {userProfile?.name}
        </p>
        <p style={{ color:'var(--teal)',fontSize:14,fontWeight:600,marginBottom:24 }}>{upiId}</p>
        <div style={{ display:'flex',gap:12,width:'100%' }}>
          <button className="btn-primary" style={{ flex:1 }} onClick={download}>⬇ Download</button>
          <button className="btn-outline" style={{ flex:1 }} onClick={()=>navigator.share?.({title:'INRT QR',text:upiId})}>
            ↑ Share
          </button>
        </div>
        <p style={{ color:'var(--t3)',fontSize:12,marginTop:16,textAlign:'center' }}>
          Anyone can scan this QR to send you money instantly
        </p>
      </div>
    </div>
  );
}