/**
 * INRT WALLET — ScanPay.tsx (FIXED)
 * Root cause fixed: <video> element is now ALWAYS rendered in the DOM
 * (hidden via CSS when inactive) so videoRef.current is never null
 * when the camera stream is attached.
 * Replace: src/pages/ScanPay.tsx
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate }                  from 'react-router-dom';
import { useAuth }                      from '../context/AuthContext';
import { doc, onSnapshot }              from 'firebase/firestore';
import { db as firestoreDb }            from '../lib/firebase';

const T = {
  navy:'#0A2540', accent:'#0070F3', green:'#00C853', border:'#E8ECF0',
  muted:'#6B7C93', light:'#F0F4F8', text:'#0A2540', card:'#FFFFFF',
};

type Mode = 'scan' | 'show';

export default function ScanPay() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('scan');
  const [profile, setProfile] = useState<any>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [camStatus, setCamStatus] = useState<'idle'|'requesting'|'active'|'error'>('idle');
  const [camErr, setCamErr]       = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user?.uid]);

  // ── Start camera ─────────────────────────────────────────────
  const startCamera = async () => {
    setCamErr(''); setCamStatus('requesting');

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCamErr('Camera requires HTTPS. Open this site via https:// (not http://).');
      setCamStatus('error');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr('Camera not supported on this browser. Use Upload or Enter Manually below.');
      setCamStatus('error');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          // Laptop fallback — try front camera explicitly
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }, audio: false,
          });
        }
      }

      streamRef.current = stream;

      // video element is ALWAYS mounted now — ref is guaranteed to exist
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('video.play() error (often safe to ignore):', playErr);
        }
      }

      setCamStatus('active');
    } catch (e: any) {
      console.error('Camera error:', e.name, e.message, e);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setCamErr('Camera permission denied. Click the 🔒 / camera icon in your browser address bar → Allow camera → then tap Try Again.');
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        setCamErr('No camera found on this device.');
      } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        setCamErr('Camera is being used by another app (close other camera apps/tabs) and try again.');
      } else if (e.name === 'OverconstrainedError') {
        setCamErr('Camera does not support requested settings. Tap Try Again to retry with default camera.');
      } else {
        setCamErr(`Camera error: ${e.message || e.name || 'Unknown error'}`);
      }
      setCamStatus('error');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamStatus('idle');
  };

  useEffect(() => {
    if (mode === 'scan') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTimeout(() => navigate('/send'), 600);
  };

  const upiId       = profile?.upiId || (profile?.phone ? `${profile.phone}@inrt` : '');
  const inrtAddress = profile?.inrtAddress || '';

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.card, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ padding:'24px' }}>
        <button onClick={()=>navigate('/dashboard')} style={{ background:'none', border:'none', color:T.accent, cursor:'pointer', fontSize:14, fontWeight:700, padding:'0 0 20px', display:'block' }}>← Back</button>
        <h2 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:24, color:T.text, marginBottom:16 }}>Scan & Pay</h2>

        {/* Mode tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {([['scan','📷 Scan QR'],['show','🖼️ My QR']] as [Mode,string][]).map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)}
              style={{ flex:1, padding:'11px', borderRadius:12, cursor:'pointer', border:`2px solid ${mode===m?T.navy:T.border}`, background:mode===m?T.navy+'08':'transparent', color:mode===m?T.navy:T.muted, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── SCAN MODE ───────────────────────────────────────── */}
        <div style={{ display: mode==='scan' ? 'block' : 'none' }}>
          <div style={{ width:'100%', height:340, borderRadius:20, background:'#0A0A1A', position:'relative', overflow:'hidden', marginBottom:16 }}>

            {/* Video — ALWAYS in DOM. Visibility toggled via CSS, never via conditional render */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width:'100%', height:'100%', objectFit:'cover',
                position:'absolute', inset:0,
                opacity: camStatus==='active' ? 1 : 0,
                transition:'opacity 0.2s',
              }}
            />

            {/* Overlay states sit on top of (hidden) video */}
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
              {camStatus==='active' && (
                <div style={{ width:200, height:200, position:'relative' }}>
                  {[
                    { top:0, left:0,    border:'4px solid #00FF66', borderRight:'none',  borderBottom:'none' },
                    { top:0, right:0,   border:'4px solid #00FF66', borderLeft:'none',   borderBottom:'none' },
                    { bottom:0, left:0, border:'4px solid #00FF66', borderRight:'none',  borderTop:'none'    },
                    { bottom:0, right:0,border:'4px solid #00FF66', borderLeft:'none',   borderTop:'none'    },
                  ].map((s,i)=>(
                    <div key={i} style={{ position:'absolute', width:32, height:32, borderRadius:6, ...s }}/>
                  ))}
                </div>
              )}

              {camStatus==='requesting' && (
                <div style={{ textAlign:'center', padding:20 }}>
                  <div style={{ width:48, height:48, border:'4px solid rgba(0,229,204,0.2)', borderTopColor:'#00e5cc', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }}/>
                  <p style={{ color:'rgba(255,255,255,0.6)', fontSize:13 }}>Requesting camera access…</p>
                </div>
              )}

              {camStatus==='error' && (
                <div style={{ textAlign:'center', padding:24, pointerEvents:'auto' }}>
                  <p style={{ fontSize:36, marginBottom:12 }}>📷</p>
                  <p style={{ color:'#FF9500', fontSize:13, fontWeight:600, marginBottom:16, lineHeight:1.6, padding:'0 12px' }}>{camErr}</p>
                  <button onClick={startCamera} style={{ background:'#00e5cc', color:'#000', border:'none', borderRadius:10, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                    🔄 Try Again
                  </button>
                </div>
              )}

              {camStatus==='idle' && (
                <p style={{ color:'rgba(255,255,255,0.4)', fontSize:13 }}>Starting camera…</p>
              )}
            </div>

            {camStatus==='active' && (
              <p style={{ position:'absolute', bottom:18, left:0, right:0, textAlign:'center' as const, color:'rgba(255,255,255,0.6)', fontSize:13, textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>
                Point camera at any UPI QR code
              </p>
            )}
          </div>

          {/* Manual fallback */}
          <div style={{ background:T.light, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px 16px', marginBottom:12 }}>
            <p style={{ color:T.muted, fontSize:12, margin:'0 0 8px', fontWeight:600 }}>Camera not working?</p>
            <div style={{ display:'flex', gap:8 }}>
              <label style={{ flex:1, textAlign:'center' as const, padding:'11px', borderRadius:10, border:`1px solid ${T.border}`, background:T.card, cursor:'pointer', fontSize:13, fontWeight:700, color:T.navy, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                📁 Upload QR Image
                <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display:'none' }}/>
              </label>
              <button onClick={()=>navigate('/send')} style={{ flex:1, padding:'11px', borderRadius:10, border:'none', background:T.navy, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                ✍️ Enter Manually
              </button>
            </div>
          </div>

          {camStatus==='active' && (
            <p style={{ textAlign:'center' as const, color:T.muted, fontSize:12 }}>
              🔒 Camera access is used only for QR scanning and is never recorded or stored.
            </p>
          )}
        </div>

        {/* ── SHOW MY QR MODE ─────────────────────────────────── */}
        {mode==='show'&&(
          <div style={{ textAlign:'center' as const }}>
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, padding:24, marginBottom:16, boxShadow:'0 2px 12px rgba(10,37,64,0.06)' }}>
              <div style={{ width:200, height:200, background:'#fff', borderRadius:10, margin:'0 auto 14px', overflow:'hidden' }}>
                {upiId ? (
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(profile?.name||'INRT User')}&cu=INR`)}`} alt="UPI QR" style={{ width:'100%', height:'100%' }}/>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#999' }}>Loading…</div>
                )}
              </div>
              <p style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:17, margin:'0 0 2px', color:T.text }}>{profile?.name || 'INRT User'}</p>
              <p style={{ fontSize:13, color:T.muted, margin:0 }}>{upiId}</p>
            </div>

            {inrtAddress && (
              <div onClick={()=>navigate('/crypto')} style={{ background:'rgba(123,47,190,0.05)', border:'1px solid rgba(123,47,190,0.15)', borderRadius:14, padding:'14px 16px', marginBottom:16, cursor:'pointer' }}>
                <p style={{ color:'#7B2FBE', fontWeight:700, fontSize:12, margin:'0 0 4px' }}>🪙 Receive INRT instead?</p>
                <p style={{ color:T.muted, fontSize:11, margin:0, fontFamily:'monospace' }}>{inrtAddress} →</p>
              </div>
            )}

            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                onClick={()=>{ if(navigator.share) navigator.share({ title:'Pay me via UPI', text:upiId }); else navigator.clipboard.writeText(upiId).then(()=>alert('UPI ID copied!')); }}>
                📤 Share
              </button>
              <button style={{ flex:1, padding:'12px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.text, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                onClick={()=>navigator.clipboard.writeText(upiId).then(()=>alert('UPI ID copied!'))}>
                📋 Copy UPI ID
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
