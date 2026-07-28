import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { QRCodeCanvas } from 'qrcode.react';
import '../styles/theme.css';

export default function QRPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const upiId = `${userProfile?.phone || ''}@inrt`;
  const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(userProfile?.name || 'INRT User')}&cu=INR`;

  const download = () => {
    if (!qrRef.current) return;
    const a = document.createElement('a');
    a.href = qrRef.current.toDataURL();
    a.download = `inrt-qr-${userProfile?.phone}.png`;
    a.click();
  };

  return (
    <div style={{ width:'100%',minHeight:'100vh',background:'var(--bg)',fontFamily:'var(--f-body)' }}>
      <div style={{ background:'linear-gradient(160deg,#050914,#0a1428)',padding:'52px 20px 20px' }}>
        <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:4 }}>
          <button onClick={()=>navigate('/dashboard')} className="back-btn">←</button>
          <h1 className="page-title">My QR Code</h1>
        </div>
      </div>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',padding:'32px 24px' }}>
        <div style={{ background:'var(--bg-card)',border:'1px solid var(--b1)',borderRadius:'var(--r3)',
                       padding:28,marginBottom:20,boxShadow:'var(--s2)' }}>
          <QRCodeCanvas 
            ref={qrRef}
            value={upiString}
            size={220}
            bgColor="#ffffff"
            fgColor="#050914"
            style={{ display:'block',borderRadius:'var(--r2)' }}
          />
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