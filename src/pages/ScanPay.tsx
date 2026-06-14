/**
 * INRT WALLET — ScanPay.tsx
 * Uses jsQR library (loaded via CDN) to actually decode QR codes
 * from the camera feed in real time.
 * Replace: src/pages/ScanPay.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate }   from 'react-router-dom';
import { useAuth }       from '../context/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db as firestoreDb } from '../lib/firebase';

const T = {
  navy:'#0A2540', accent:'#0070F3', green:'#00C853', border:'#E8ECF0',
  muted:'#6B7C93', light:'#F0F4F8', text:'#0A2540', card:'#FFFFFF',
};

type Mode = 'scan' | 'show';

// Load jsQR from CDN
let jsQRLib: any = null;
async function loadJsQR() {
  if (jsQRLib) return jsQRLib;
  await new Promise<void>((resolve, reject) => {
    if ((window as any).jsQR) { jsQRLib = (window as any).jsQR; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
    s.onload  = () => { jsQRLib = (window as any).jsQR; resolve(); };
    s.onerror = () => reject(new Error('jsQR load failed'));
    document.head.appendChild(s);
  });
  return jsQRLib;
}

// Parse UPI QR string
function parseUpiQR(raw: string): { upiId: string; name: string; amount: string } | null {
  if (!raw) return null;
  try {
    // Handle standard UPI deep link: upi://pay?pa=...&pn=...&am=...
    if (raw.startsWith('upi://')) {
      const url    = new URL(raw);
      const upiId  = url.searchParams.get('pa') || '';
      const name   = url.searchParams.get('pn') || '';
      const amount = url.searchParams.get('am') || '';
      if (upiId) return { upiId, name, amount };
    }
    // Handle plain UPI ID (e.g. name@paytm)
    if (raw.includes('@') && !raw.includes(' ')) {
      return { upiId: raw, name: '', amount: '' };
    }
  } catch {}
  return null;
}

export default function ScanPay() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [mode, setMode]       = useState<Mode>('scan');
  const [profile, setProfile] = useState<any>(null);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number | null>(null);
  const scanningRef = useRef(false);

  const [camStatus, setCamStatus] = useState<'idle'|'requesting'|'active'|'error'>('idle');
  const [camErr, setCamErr]       = useState('');
  const [scanResult, setScanResult] = useState<{ upiId:string; name:string; amount:string } | null>(null);
  const [payAmount, setPayAmount]   = useState('');
  const [paying, setPaying]         = useState(false);
  const [payErr, setPayErr]         = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user?.uid]);

  // ── QR scan loop ─────────────────────────────────────────────
  const scanLoop = useCallback(async () => {
    if (!scanningRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    try {
      const qr = jsQRLib(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
      if (qr?.data) {
        const parsed = parseUpiQR(qr.data);
        if (parsed) {
          scanningRef.current = false;
          setScanResult(parsed);
          if (parsed.amount) setPayAmount(parsed.amount);
          return;
        }
      }
    } catch {}
    rafRef.current = requestAnimationFrame(scanLoop);
  }, []);

  // ── Start camera ──────────────────────────────────────────────
  const startCamera = async () => {
    setCamErr(''); setCamStatus('requesting'); setScanResult(null);
    if (!window.isSecureContext) {
      setCamErr('Camera requires HTTPS. Open https://inrtwallet.in'); setCamStatus('error'); return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr('Camera not supported on this browser. Upload a QR image instead.'); setCamStatus('error'); return;
    }
    try {
      await loadJsQR();
    } catch {
      setCamErr('QR scanner library failed to load. Check your internet connection.'); setCamStatus('error'); return;
    }
    try {
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal:'environment' } }, audio:false }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }
      setCamStatus('active');
      scanningRef.current = true;
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (e: any) {
      if (e.name === 'NotAllowedError')  setCamErr('Camera permission denied. Tap the 🔒 icon in address bar → Allow Camera → Try Again.');
      else if (e.name === 'NotFoundError') setCamErr('No camera found on this device.');
      else if (e.name === 'NotReadableError') setCamErr('Camera is in use by another app. Close it and try again.');
      else setCamErr(`Camera error: ${e.message}`);
      setCamStatus('error');
    }
  };

  const stopCamera = () => {
    scanningRef.current = false;
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

  // ── Handle file upload — scan QR from image ──────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await loadJsQR();
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const qr = jsQRLib(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'attemptBoth' });
      if (qr?.data) {
        const parsed = parseUpiQR(qr.data);
        if (parsed) { setScanResult(parsed); if (parsed.amount) setPayAmount(parsed.amount); return; }
        alert(`QR found but not a UPI code: ${qr.data.slice(0,60)}`);
      } else {
        alert('No QR code found in this image. Try a clearer photo.');
      }
    } catch { alert('Failed to read QR from image.'); }
  };

  const upiId       = profile?.upiId || (profile?.phone ? `${profile.phone}@inrt` : '');
  const inrtAddress = profile?.inrtAddress || '';
  const bal         = Number(profile?.balance ?? 0);

  const handlePay = async () => {
    if (!scanResult || !payAmount || parseFloat(payAmount) <= 0) return;
    if (parseFloat(payAmount) > bal) return setPayErr('Insufficient balance');
    setPaying(true); setPayErr('');
    navigate(`/send?upiId=${scanResult.upiId}&amount=${payAmount}&name=${encodeURIComponent(scanResult.name)}`);
  };

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.card, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ padding:'24px' }}>
        <button onClick={()=>navigate('/dashboard')} style={{ background:'none', border:'none', color:T.accent, cursor:'pointer', fontSize:14, fontWeight:700, padding:'0 0 20px', display:'block' }}>← Back</button>
        <h2 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:24, color:T.text, marginBottom:16 }}>Scan & Pay</h2>

        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {([['scan','📷 Scan QR'],['show','🖼️ My QR']] as [Mode,string][]).map(([m,l])=>(
            <button key={m} onClick={()=>{ setMode(m); setScanResult(null); }}
              style={{ flex:1, padding:'11px', borderRadius:12, cursor:'pointer', border:`2px solid ${mode===m?T.navy:T.border}`, background:mode===m?T.navy+'08':'transparent', color:mode===m?T.navy:T.muted, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── SCAN MODE ─────────────────────────────────────── */}
        <div style={{ display: mode==='scan' ? 'block' : 'none' }}>

          {/* If QR scanned — show payment form */}
          {scanResult ? (
            <div>
              <div style={{ background:'#E8FAF0', border:`1px solid ${T.green}30`, borderRadius:16, padding:'16px', marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
                <span style={{ fontSize:28 }}>✅</span>
                <div>
                  <p style={{ fontWeight:700, fontSize:14, color:T.text, margin:0 }}>QR Scanned!</p>
                  <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0' }}>{scanResult.upiId}</p>
                  {scanResult.name && <p style={{ fontSize:13, fontWeight:600, color:T.text, margin:'2px 0 0' }}>{scanResult.name}</p>}
                </div>
              </div>

              <p style={{ fontSize:11, fontWeight:700, color:T.muted, margin:'0 0 8px', letterSpacing:0.5 }}>AMOUNT (₹)</p>
              <div style={{ display:'flex', alignItems:'center', gap:8, background:T.light, borderRadius:14, padding:'14px 16px', marginBottom:8, border:`1.5px solid ${payAmount?T.navy:T.border}` }}>
                <span style={{ color:T.navy, fontSize:22, fontWeight:800 }}>₹</span>
                <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0"
                  style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:T.text }}/>
              </div>
              <p style={{ color:T.muted, fontSize:12, margin:'0 0 16px' }}>Balance: ₹{bal.toLocaleString('en-IN')}</p>
              {payErr && <p style={{ color:'#FF3B30', fontSize:12, marginBottom:8 }}>{payErr}</p>}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{ setScanResult(null); startCamera(); }}
                  style={{ flex:1, padding:'14px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  Re-scan
                </button>
                <button onClick={handlePay} disabled={paying||!payAmount||parseFloat(payAmount)<=0}
                  style={{ flex:2, padding:'14px', borderRadius:12, border:'none', background:T.navy, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:(!payAmount||parseFloat(payAmount)<=0)?0.5:1 }}>
                  {paying ? '⏳ Processing…' : `Pay ₹${payAmount||'0'}`}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Camera viewport */}
              <div style={{ width:'100%', height:320, borderRadius:20, background:'#0A0A1A', position:'relative', overflow:'hidden', marginBottom:16 }}>
                {/* Video — ALWAYS in DOM */}
                <video ref={videoRef} autoPlay playsInline muted
                  style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0, opacity:camStatus==='active'?1:0, transition:'opacity 0.2s' }}/>
                {/* Hidden canvas for QR decoding */}
                <canvas ref={canvasRef} style={{ display:'none' }}/>

                {/* Corner markers */}
                {camStatus==='active'&&(
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ width:180, height:180, position:'relative' }}>
                      {[
                        { top:0, left:0 }, { top:0, right:0 },
                        { bottom:0, left:0 }, { bottom:0, right:0 },
                      ].map((pos,i)=>(
                        <div key={i} style={{ position:'absolute', width:28, height:28, borderRadius:4,
                          borderTop:i<2?'4px solid #00FF66':'none', borderBottom:i>=2?'4px solid #00FF66':'none',
                          borderLeft:i%2===0?'4px solid #00FF66':'none', borderRight:i%2===1?'4px solid #00FF66':'none',
                          ...pos }}/>
                      ))}
                    </div>
                  </div>
                )}

                {/* Loading spinner */}
                {camStatus==='requesting'&&(
                  <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', gap:12 }}>
                    <div style={{ width:44, height:44, border:'4px solid rgba(0,229,204,0.2)', borderTopColor:'#00e5cc', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                    <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13 }}>Starting camera…</p>
                  </div>
                )}

                {/* Error */}
                {camStatus==='error'&&(
                  <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' as const }}>
                    <p style={{ fontSize:36, marginBottom:12 }}>📷</p>
                    <p style={{ color:'#FF9500', fontSize:13, fontWeight:600, marginBottom:16, lineHeight:1.6 }}>{camErr}</p>
                    <button onClick={startCamera} style={{ background:'#00e5cc', color:'#000', border:'none', borderRadius:10, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                      🔄 Try Again
                    </button>
                  </div>
                )}

                {camStatus==='active'&&(
                  <p style={{ position:'absolute', bottom:16, left:0, right:0, textAlign:'center' as const, color:'rgba(255,255,255,0.7)', fontSize:13 }}>
                    🔍 Scanning for QR code…
                  </p>
                )}
              </div>

              {/* Tips */}
              {camStatus==='active'&&(
                <div style={{ background:T.light, borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
                  {['Hold camera steady — 10-15cm from QR','Make sure QR code is well lit','Works with UPI, Paytm, PhonePe, INRT QR codes'].map((t,i)=>(
                    <p key={i} style={{ color:T.muted, fontSize:12, margin:'2px 0' }}>• {t}</p>
                  ))}
                </div>
              )}

              {/* Fallback options */}
              <div style={{ background:T.light, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px 16px' }}>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 8px', fontWeight:600 }}>Or choose an option:</p>
                <div style={{ display:'flex', gap:8 }}>
                  <label style={{ flex:1, textAlign:'center' as const, padding:'11px', borderRadius:10, border:`1px solid ${T.border}`, background:T.card, cursor:'pointer', fontSize:13, fontWeight:700, color:T.navy, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                    📁 Upload QR Image
                    <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display:'none' }}/>
                  </label>
                  <button onClick={()=>navigate('/send')} style={{ flex:1, padding:'11px', borderRadius:10, border:'none', background:T.navy, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                    ✍️ Enter UPI ID
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── MY QR MODE ──────────────────────────────────────── */}
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
            {inrtAddress&&(
              <div onClick={()=>navigate('/crypto')} style={{ background:'rgba(123,47,190,0.05)', border:'1px solid rgba(123,47,190,0.15)', borderRadius:14, padding:'14px 16px', marginBottom:16, cursor:'pointer' }}>
                <p style={{ color:'#7B2FBE', fontWeight:700, fontSize:12, margin:'0 0 4px' }}>🪙 Receive INRT globally</p>
                <p style={{ color:T.muted, fontSize:11, margin:0, fontFamily:'monospace' }}>{inrtAddress} →</p>
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                onClick={()=>navigator.share ? navigator.share({ title:'Pay me via UPI', text:upiId }) : navigator.clipboard.writeText(upiId).then(()=>alert('UPI ID copied!'))}>
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
