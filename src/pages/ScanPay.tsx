/**
 * INRT WALLET — ScanPay.tsx
 * QR scanning via jsqr npm package (not CDN — fixes load error)
 *
 * FIRST: run this in your project folder:
 *   npm install jsqr
 *
 * Replace: src/pages/ScanPay.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate }       from 'react-router-dom';
import { useAuth }           from '../context/AuthContext';
import { doc, onSnapshot }   from 'firebase/firestore';
import { db as firestoreDb } from '../lib/firebase';
import jsQR                  from 'jsqr';

const T = {
  navy:'#0A2540', accent:'#0070F3', green:'#00C853',
  border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8',
  text:'#0A2540', card:'#FFFFFF', red:'#FF3B30',
};

type Mode = 'scan' | 'show';

function parseUpiQR(raw: string) {
  try {
    if (raw.startsWith('upi://')) {
      const url = new URL(raw);
      return {
        upiId:  url.searchParams.get('pa') || '',
        name:   url.searchParams.get('pn') || '',
        amount: url.searchParams.get('am') || '',
      };
    }
    if (raw.includes('@') && !raw.includes(' ') && raw.length < 60) {
      return { upiId: raw, name: '', amount: '' };
    }
  } catch {}
  return null;
}

export default function ScanPay() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]       = useState<Mode>('scan');
  const [profile, setProfile] = useState<any>(null);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number | null>(null);
  const activeRef   = useRef(false);

  const [camStatus, setCamStatus]   = useState<'idle'|'requesting'|'active'|'error'>('idle');
  const [camErr, setCamErr]         = useState('');
  const [scanned, setScanned]       = useState<{upiId:string;name:string;amount:string}|null>(null);
  const [payAmount, setPayAmount]   = useState('');
  const [payErr, setPayErr]         = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb,'users',user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user?.uid]);

  // ── QR scan loop using jsqr npm package ──────────────────────
  const scanLoop = useCallback(() => {
    if (!activeRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result  = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'dontInvert',
      });
      if (result?.data) {
        const parsed = parseUpiQR(result.data);
        if (parsed?.upiId) {
          activeRef.current = false;
          setScanned(parsed);
          if (parsed.amount) setPayAmount(parsed.amount);
          return;
        }
      }
    } catch (e) {
      console.warn('QR scan frame error:', e);
    }
    rafRef.current = requestAnimationFrame(scanLoop);
  }, []);

  // ── Start camera ──────────────────────────────────────────────
  const startCamera = async () => {
    setCamErr(''); setCamStatus('requesting'); setScanned(null);
    activeRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr('Camera not available. Try using Upload QR Image below.'); setCamStatus('error'); return;
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCamErr('Camera requires HTTPS. Make sure you are on https://inrtwallet.in'); setCamStatus('error'); return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject  = stream;
        videoRef.current.muted      = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }

      setCamStatus('active');
      activeRef.current = true;
      rafRef.current = requestAnimationFrame(scanLoop);

    } catch (e: any) {
      const name = e.name || '';
      if (name === 'NotAllowedError')   setCamErr('Camera permission denied.\n\nTap the 🔒 icon in your browser address bar → tap Camera → Allow → then tap Try Again.');
      else if (name === 'NotFoundError') setCamErr('No camera found on this device. Use "Upload QR Image" instead.');
      else if (name === 'NotReadableError') setCamErr('Camera is being used by another app. Close WhatsApp, Instagram or other camera apps, then tap Try Again.');
      else setCamErr(`Camera error (${name || 'unknown'}): ${e.message}`);
      setCamStatus('error');
    }
  };

  const stopCamera = () => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamStatus('idle');
  };

  useEffect(() => {
    if (mode === 'scan') startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [mode]);

  // ── Upload QR image ───────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const result  = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'attemptBoth' });
      if (result?.data) {
        const parsed = parseUpiQR(result.data);
        if (parsed?.upiId) { setScanned(parsed); if (parsed.amount) setPayAmount(parsed.amount); return; }
        alert(`QR found but is not a UPI code:\n${result.data.slice(0,80)}`);
      } else {
        alert('No QR code detected in this image. Please try a clearer photo with better lighting.');
      }
    } catch { alert('Failed to read image. Please try again.'); }
    e.target.value = '';
  };

  const bal         = Number(profile?.balance ?? 0);
  const upiId       = profile?.upiId || (profile?.phone ? `${profile.phone}@inrt` : '');
  const inrtAddress = profile?.inrtAddress || '';

  const handlePay = () => {
    if (!scanned || !payAmount || parseFloat(payAmount) <= 0) return;
    if (parseFloat(payAmount) > bal) return setPayErr('Insufficient balance');
    navigate(`/send?upiId=${encodeURIComponent(scanned.upiId)}&amount=${payAmount}&name=${encodeURIComponent(scanned.name)}`);
  };

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.card, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ padding:'52px 20px 24px' }}>
        <button onClick={()=>navigate('/dashboard')} style={{ background:'none', border:'none', color:T.accent, cursor:'pointer', fontSize:14, fontWeight:700, padding:'0 0 16px', display:'block' }}>← Back</button>
        <h2 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:24, color:T.text, marginBottom:16 }}>Scan & Pay</h2>

        {/* Mode tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          {([['scan','📷 Scan QR'],['show','🖼️ My QR']] as [Mode,string][]).map(([m,l])=>(
            <button key={m} onClick={()=>{ setMode(m as Mode); setScanned(null); setPayErr(''); }}
              style={{ flex:1, padding:'12px', borderRadius:12, cursor:'pointer', border:`2px solid ${mode===m?T.navy:T.border}`, background:mode===m?`${T.navy}0a`:'transparent', color:mode===m?T.navy:T.muted, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13 }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── SCAN MODE ─────────────────────────────────────── */}
        {mode==='scan' && (
          <>
            {scanned ? (
              /* Payment confirm form */
              <div>
                <div style={{ background:'#E8FAF0', border:`1px solid ${T.green}40`, borderRadius:16, padding:'16px', marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
                  <div style={{ width:44, height:44, background:`${T.green}18`, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>✅</div>
                  <div>
                    <p style={{ fontWeight:700, fontSize:14, color:T.text, margin:0 }}>QR Code Scanned!</p>
                    <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0', wordBreak:'break-all' as const }}>{scanned.upiId}</p>
                    {scanned.name && <p style={{ fontSize:13, fontWeight:600, color:T.text, margin:'2px 0 0' }}>{scanned.name}</p>}
                  </div>
                </div>

                <p style={{ fontSize:11, fontWeight:700, color:T.muted, margin:'0 0 8px', letterSpacing:0.5 }}>AMOUNT (₹)</p>
                <div style={{ display:'flex', alignItems:'center', gap:8, background:T.light, borderRadius:14, padding:'14px 16px', marginBottom:8, border:`1.5px solid ${payAmount?T.navy:T.border}` }}>
                  <span style={{ color:T.navy, fontSize:22, fontWeight:800 }}>₹</span>
                  <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0" autoFocus
                    style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:T.text }}/>
                </div>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 16px' }}>Your balance: ₹{bal.toLocaleString('en-IN')}</p>
                {payErr && <p style={{ color:T.red, fontSize:12, marginBottom:12 }}>⚠️ {payErr}</p>}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={()=>{ setScanned(null); startCamera(); }}
                    style={{ flex:1, padding:'14px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                    Re-scan
                  </button>
                  <button onClick={handlePay} disabled={!payAmount || parseFloat(payAmount)<=0}
                    style={{ flex:2, padding:'14px', borderRadius:12, border:'none', background:T.navy, color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:(!payAmount||parseFloat(payAmount)<=0)?0.5:1 }}>
                    Pay ₹{payAmount||'0'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Camera box — video always in DOM */}
                <div style={{ width:'100%', height:300, borderRadius:20, background:'#0D0D1A', position:'relative', overflow:'hidden', marginBottom:16 }}>
                  <video ref={videoRef} autoPlay playsInline muted
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block',
                      opacity: camStatus==='active' ? 1 : 0, transition:'opacity 0.3s' }}/>
                  <canvas ref={canvasRef} style={{ display:'none' }}/>

                  {/* Corner markers */}
                  {camStatus==='active' && (
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                      <div style={{ width:180, height:180, position:'relative' }}>
                        {[
                          { top:0,    left:0,  borderTop:'3px solid #00FF88', borderLeft:'3px solid #00FF88'   },
                          { top:0,    right:0, borderTop:'3px solid #00FF88', borderRight:'3px solid #00FF88'  },
                          { bottom:0, left:0,  borderBottom:'3px solid #00FF88', borderLeft:'3px solid #00FF88'  },
                          { bottom:0, right:0, borderBottom:'3px solid #00FF88', borderRight:'3px solid #00FF88' },
                        ].map((s,i)=>(
                          <div key={i} style={{ position:'absolute', width:30, height:30, borderRadius:4, ...s }}/>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spinner while requesting */}
                  {camStatus==='requesting' && (
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', gap:12 }}>
                      <div style={{ width:44, height:44, border:'4px solid rgba(0,229,204,0.15)', borderTopColor:'#00e5cc', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                      <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, margin:0 }}>Starting camera…</p>
                    </div>
                  )}

                  {/* Error */}
                  {camStatus==='error' && (
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', padding:20, textAlign:'center' as const }}>
                      <p style={{ fontSize:32, marginBottom:10 }}>📷</p>
                      <p style={{ color:'#FF9500', fontSize:12, fontWeight:600, lineHeight:1.6, margin:'0 0 14px', whiteSpace:'pre-line' as const }}>{camErr}</p>
                      <button onClick={startCamera} style={{ background:'#00e5cc', color:'#000', border:'none', borderRadius:10, padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                        🔄 Try Again
                      </button>
                    </div>
                  )}

                  {camStatus==='active' && (
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'12px', background:'linear-gradient(transparent,rgba(0,0,0,0.5))', textAlign:'center' as const }}>
                      <p style={{ color:'rgba(255,255,255,0.8)', fontSize:12, margin:0 }}>🔍 Scanning for QR code…</p>
                    </div>
                  )}
                </div>

                {/* Tips when active */}
                {camStatus==='active' && (
                  <div style={{ background:T.light, borderRadius:12, padding:'10px 14px', marginBottom:12 }}>
                    <p style={{ color:T.muted, fontSize:11, margin:'0 0 4px', fontWeight:700 }}>Tips for best results:</p>
                    {['Hold phone 15-20cm from QR code','Ensure good lighting, no shadows','Keep camera steady for 1-2 seconds'].map((t,i)=>(
                      <p key={i} style={{ color:T.muted, fontSize:11, margin:'2px 0' }}>• {t}</p>
                    ))}
                  </div>
                )}

                {/* Fallback */}
                <div style={{ background:T.light, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px 16px' }}>
                  <p style={{ color:T.muted, fontSize:12, fontWeight:600, margin:'0 0 10px' }}>Other options:</p>
                  <div style={{ display:'flex', gap:8 }}>
                    <label style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'12px', borderRadius:10, border:`1px solid ${T.border}`, background:T.card, cursor:'pointer', fontSize:13, fontWeight:700, color:T.navy, fontFamily:"'Plus Jakarta Sans',sans-serif", gap:6 }}>
                      📁 Upload QR
                      <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display:'none' }}/>
                    </label>
                    <button onClick={()=>navigate('/send')} style={{ flex:1, padding:'12px', borderRadius:10, border:'none', background:T.navy, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                      ✍️ Enter UPI ID
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── MY QR MODE ──────────────────────────────────────── */}
        {mode==='show' && (
          <div style={{ textAlign:'center' as const }}>
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:20, padding:24, marginBottom:16, boxShadow:'0 4px 20px rgba(10,37,64,0.08)' }}>
              <div style={{ width:200, height:200, background:'#fff', borderRadius:12, margin:'0 auto 16px', overflow:'hidden', padding:8 }}>
                {upiId ? (
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(profile?.name||'INRT User')}&cu=INR`)}`}
                    alt="UPI QR" style={{ width:'100%', height:'100%' }}/>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#999', fontSize:13 }}>Generating…</div>
                )}
              </div>
              <p style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:18, margin:'0 0 4px', color:T.text }}>{profile?.name || 'INRT User'}</p>
              <p style={{ fontSize:13, color:T.muted, margin:'0 0 16px' }}>{upiId}</p>
              <div style={{ display:'flex', gap:10 }}>
                <button style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                  onClick={()=>navigator.share ? navigator.share({ title:'Pay me via UPI', text:upiId }) : navigator.clipboard.writeText(upiId).then(()=>alert('Copied!'))}>
                  📤 Share
                </button>
                <button style={{ flex:1, padding:'12px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.text, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                  onClick={()=>navigator.clipboard.writeText(upiId).then(()=>alert('UPI ID copied!'))}>
                  📋 Copy
                </button>
              </div>
            </div>
            {inrtAddress && (
              <div onClick={()=>navigate('/crypto')} style={{ background:'rgba(123,47,190,0.06)', border:'1px solid rgba(123,47,190,0.2)', borderRadius:14, padding:'14px 16px', cursor:'pointer', textAlign:'left' as const }}>
                <p style={{ color:'#7B2FBE', fontWeight:700, fontSize:13, margin:'0 0 4px' }}>🪙 Receive INRT globally</p>
                <p style={{ color:T.muted, fontSize:11, margin:0, fontFamily:'monospace' }}>{inrtAddress}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
