/**
 * INRT WALLET — ScanPay.tsx
 * Scans QR → shows payment form → pays directly on this page
 * No navigation to SendMoney page
 *
 * REQUIRES: npm install jsqr
 * Replace: src/pages/ScanPay.tsx
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate }       from 'react-router-dom';
import { useAuth }           from '../context/AuthContext';
import { doc, onSnapshot }   from 'firebase/firestore';
import { db as firestoreDb } from '../lib/firebase';
import jsQR                  from 'jsqr';

const API = import.meta.env.VITE_API_URL || '';

const T = {
  navy:'#0A2540', accent:'#0070F3', green:'#00C853', greenL:'#E8FAF0',
  border:'#E8ECF0', muted:'#6B7C93', light:'#F0F4F8',
  text:'#0A2540', card:'#FFFFFF', red:'#FF3B30', gold:'#FFD60A',
};

type Mode    = 'scan' | 'show';
type PayStep = 'form' | 'pin' | 'processing' | 'success' | 'failed';

function parseUpiQR(raw: string) {
  try {
    if (raw.startsWith('upi://')) {
      const url = new URL(raw);
      return { upiId: url.searchParams.get('pa')||'', name: url.searchParams.get('pn')||'', amount: url.searchParams.get('am')||'' };
    }
    if (raw.includes('@') && !raw.includes(' ') && raw.length < 80) {
      return { upiId: raw.trim(), name: '', amount: '' };
    }
  } catch {}
  return null;
}

function PinPad({ onComplete, onCancel }: { onComplete:(pin:string)=>void; onCancel:()=>void }) {
  const [pin, setPin] = useState<string[]>([]);
  const tap = (d: string) => {
    if (pin.length >= 6) return;
    const next = [...pin, d];
    setPin(next);
    if (next.length === 6) setTimeout(()=>onComplete(next.join('')), 200);
  };
  return (
    <div style={{ textAlign:'center' as const }}>
      <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>Enter your 6-digit UPI PIN</p>
      <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:28 }}>
        {Array.from({length:6},(_,i)=><div key={i} style={{ width:14, height:14, borderRadius:'50%', background:i<pin.length?T.navy:T.border, transition:'background 0.15s' }}/>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, maxWidth:240, margin:'0 auto 16px' }}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i)=>(
          <button key={i} onClick={()=>k==='⌫'?setPin(p=>p.slice(0,-1)):k!==''&&tap(String(k))}
            style={{ height:56, borderRadius:14, border:`1.5px solid ${T.border}`, background:k===''?'transparent':T.card, fontSize:k==='⌫'?20:22, fontWeight:700, color:T.text, cursor:k===''?'default':'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", boxShadow:k!==''&&k!=='⌫'?'0 2px 8px rgba(10,37,64,0.06)':'none' }}>
            {k}
          </button>
        ))}
      </div>
      <button onClick={onCancel} style={{ background:'none', border:'none', color:T.muted, fontSize:13, cursor:'pointer' }}>Cancel</button>
    </div>
  );
}

export default function ScanPay() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]       = useState<Mode>('scan');
  const [profile, setProfile] = useState<any>(null);

  // Camera refs
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const rafRef    = useRef<number|null>(null);
  const activeRef = useRef(false);

  const [camStatus, setCamStatus] = useState<'idle'|'requesting'|'active'|'error'>('idle');
  const [camErr, setCamErr]       = useState('');

  // Scanned QR data
  const [scanned, setScanned]       = useState<{upiId:string;name:string;amount:string}|null>(null);

  // Payment state
  const [payStep,   setPayStep]   = useState<PayStep>('form');
  const [payAmount, setPayAmount] = useState('');
  const [payNote,   setPayNote]   = useState('');
  const [payErr,    setPayErr]    = useState('');
  const [payRef,    setPayRef]    = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(firestoreDb,'users',user.uid), snap => {
      if (snap.exists()) setProfile(snap.data());
    });
    return () => unsub();
  }, [user?.uid]);

  // ── QR scan loop ─────────────────────────────────────────────
  const scanLoop = useCallback(() => {
    if (!activeRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoop); return;
    }
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result  = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts:'dontInvert' });
      if (result?.data) {
        const parsed = parseUpiQR(result.data);
        if (parsed?.upiId) {
          activeRef.current = false;
          setScanned(parsed);
          setPayAmount(parsed.amount || '');
          setPayStep('form');
          return;
        }
      }
    } catch {}
    rafRef.current = requestAnimationFrame(scanLoop);
  }, []);

  // ── Camera start/stop ─────────────────────────────────────────
  const startCamera = async () => {
    setCamErr(''); setCamStatus('requesting'); setScanned(null); activeRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr('Camera not supported. Use Upload QR below.'); setCamStatus('error'); return; }
    if (!window.isSecureContext) { setCamErr('Camera requires HTTPS. Open https://inrtwallet.in'); setCamStatus('error'); return; }
    try {
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ideal:'environment'}, width:{ideal:1280} }, audio:false }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false }); }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject   = stream;
        videoRef.current.muted       = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }
      setCamStatus('active');
      activeRef.current = true;
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (e: any) {
      const n = e.name || '';
      if (n === 'NotAllowedError')    setCamErr('Permission denied. Tap 🔒 in address bar → Allow Camera → Try Again.');
      else if (n === 'NotFoundError') setCamErr('No camera found. Use Upload QR below.');
      else if (n === 'NotReadableError') setCamErr('Camera in use by another app. Close it and try again.');
      else setCamErr(`Camera error: ${e.message}`);
      setCamStatus('error');
    }
  };

  const stopCamera = () => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamStatus('idle');
  };

  useEffect(() => {
    if (mode==='scan') startCamera(); else stopCamera();
    return () => stopCamera();
  }, [mode]);

  // ── File upload QR ────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap,0,0);
      const imgData = ctx.getImageData(0,0,bitmap.width,bitmap.height);
      const result  = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts:'attemptBoth' });
      if (result?.data) {
        const parsed = parseUpiQR(result.data);
        if (parsed?.upiId) { setScanned(parsed); setPayAmount(parsed.amount||''); setPayStep('form'); return; }
        alert(`QR found but not a UPI code:\n${result.data.slice(0,80)}`);
      } else alert('No QR code found in this image. Try a clearer photo.');
    } catch { alert('Failed to read image.'); }
    e.target.value = '';
  };

  // ── Pay via backend ───────────────────────────────────────────
  const executePay = async (pin: string) => {
    if (!scanned || !payAmount) return;
    setPayStep('processing'); setPayErr('');
    try {
      const r = await fetch(`${API}/payout/send-upi`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fromUid:user!.uid, toUpiId:scanned.upiId, amount:parseFloat(payAmount), note:payNote||`Pay to ${scanned.name||scanned.upiId}`, name:scanned.name }),
      });
      const d = await r.json();
      if (!r.ok) { setPayErr(d.error||'Payment failed'); setPayStep('form'); return; }
      setPayRef(d.transferId||'');
      setPayStep('success');
    } catch (e: any) { setPayErr(e.message||'Payment failed'); setPayStep('form'); }
  };

  const resetPay = () => {
    setScanned(null); setPayStep('form'); setPayAmount(''); setPayNote(''); setPayErr(''); setPayRef('');
    startCamera();
  };

  const bal     = Number(profile?.balance ?? 0);
  const upiId   = profile?.upiId || (profile?.phone ? `${profile.phone}@inrt` : '');
  const inrtAddr= profile?.inrtAddress || '';

  return (
    <div style={{ maxWidth:480, margin:'0 auto', minHeight:'100vh', background:T.card, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ padding:'52px 20px 24px' }}>
        <button onClick={()=>navigate('/dashboard')} style={{ background:'none', border:'none', color:T.accent, cursor:'pointer', fontSize:14, fontWeight:700, padding:'0 0 16px', display:'block' }}>← Back</button>
        <h2 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:24, color:T.text, marginBottom:16 }}>Scan & Pay</h2>

        {/* Tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          {([['scan','📷 Scan QR'],['show','🖼️ My QR']] as [Mode,string][]).map(([m,l])=>(
            <button key={m} onClick={()=>{ setMode(m as Mode); setScanned(null); setPayStep('form'); setPayErr(''); }}
              style={{ flex:1, padding:'12px', borderRadius:12, cursor:'pointer', border:`2px solid ${mode===m?T.navy:T.border}`, background:mode===m?`${T.navy}0a`:'transparent', color:mode===m?T.navy:T.muted, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:13 }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── SCAN MODE ─────────────────────────────────────── */}
        {mode==='scan'&&(
          <>
            {/* SUCCESS */}
            {payStep==='success'&&(
              <div style={{ textAlign:'center' as const, padding:'20px 0' }}>
                <div style={{ width:80, height:80, borderRadius:'50%', background:T.greenL, border:`3px solid ${T.green}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 20px' }}>✓</div>
                <h3 style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:22, color:T.text, margin:'0 0 6px' }}>Payment Sent! 🎉</h3>
                <p style={{ color:T.muted, fontSize:14, margin:'0 0 20px' }}>₹{parseFloat(payAmount).toLocaleString('en-IN')} sent to {scanned?.name||scanned?.upiId}</p>
                {payRef&&<p style={{ color:T.muted, fontSize:11, fontFamily:'monospace', marginBottom:20 }}>Ref: {payRef}</p>}
                <button onClick={resetPay} style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:T.navy, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:10 }}>
                  Scan Another QR
                </button>
                <button onClick={()=>navigate('/dashboard')} style={{ width:'100%', padding:'14px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.muted, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                  Back to Home
                </button>
              </div>
            )}

            {/* PIN */}
            {payStep==='pin'&&(
              <div style={{ padding:'10px 0' }}>
                <div style={{ background:T.light, borderRadius:14, padding:'14px 16px', marginBottom:20, display:'flex', justifyContent:'space-between' }}>
                  <div>
                    <p style={{ color:T.muted, fontSize:12, margin:0 }}>Paying</p>
                    <p style={{ color:T.text, fontWeight:800, fontSize:20, margin:'2px 0 0', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>₹{parseFloat(payAmount).toLocaleString('en-IN')}</p>
                  </div>
                  <div style={{ textAlign:'right' as const }}>
                    <p style={{ color:T.muted, fontSize:12, margin:0 }}>To</p>
                    <p style={{ color:T.text, fontWeight:700, fontSize:14, margin:'2px 0 0' }}>{scanned?.name||scanned?.upiId}</p>
                  </div>
                </div>
                <PinPad onComplete={executePay} onCancel={()=>setPayStep('form')}/>
              </div>
            )}

            {/* PROCESSING */}
            {payStep==='processing'&&(
              <div style={{ textAlign:'center' as const, padding:'40px 0' }}>
                <div style={{ width:60, height:60, border:`4px solid ${T.light}`, borderTopColor:T.navy, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 20px' }}/>
                <p style={{ fontWeight:700, fontSize:16, color:T.text, margin:'0 0 6px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Processing payment…</p>
                <p style={{ color:T.muted, fontSize:13 }}>Sending ₹{parseFloat(payAmount||'0').toLocaleString('en-IN')} to {scanned?.name||scanned?.upiId}</p>
              </div>
            )}

            {/* PAYMENT FORM (after QR scan) */}
            {(payStep==='form'||payStep==='failed')&&scanned&&(
              <div>
                <div style={{ background:T.greenL, border:`1px solid ${T.green}30`, borderRadius:14, padding:'14px 16px', marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
                  <div style={{ width:42, height:42, background:`${T.green}18`, borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>✅</div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:T.text, margin:0 }}>QR Scanned</p>
                    <p style={{ fontSize:12, color:T.muted, margin:'2px 0 0', wordBreak:'break-all' as const }}>{scanned.upiId}</p>
                    {scanned.name&&<p style={{ fontSize:13, fontWeight:600, color:T.text, margin:'2px 0 0' }}>{scanned.name}</p>}
                  </div>
                  <button onClick={resetPay} style={{ background:'none', border:'none', color:T.muted, fontSize:12, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>Re-scan</button>
                </div>

                <p style={{ fontSize:11, fontWeight:700, color:T.muted, margin:'0 0 8px', letterSpacing:0.5 }}>AMOUNT (₹)</p>
                <div style={{ display:'flex', alignItems:'center', gap:8, background:T.light, borderRadius:14, padding:'14px 16px', border:`1.5px solid ${payAmount?T.navy:T.border}`, marginBottom:6 }}>
                  <span style={{ color:T.navy, fontSize:22, fontWeight:800 }}>₹</span>
                  <input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder="0" autoFocus
                    style={{ flex:1, background:'none', border:'none', outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:28, color:T.text }}/>
                </div>
                <p style={{ color:T.muted, fontSize:12, margin:'0 0 12px' }}>Balance: ₹{bal.toLocaleString('en-IN')}</p>

                <p style={{ fontSize:11, fontWeight:700, color:T.muted, margin:'0 0 8px', letterSpacing:0.5 }}>NOTE (OPTIONAL)</p>
                <input value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="What's this payment for?"
                  style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:`1.5px solid ${T.border}`, fontSize:14, outline:'none', boxSizing:'border-box' as const, fontFamily:"'Plus Jakarta Sans',sans-serif", marginBottom:14, color:T.text }}/>

                {payStep==='failed'&&payErr&&(
                  <div style={{ background:'#FFF0F0', border:`1px solid ${T.red}30`, borderRadius:12, padding:'12px 14px', marginBottom:12 }}>
                    <p style={{ color:T.red, fontSize:13, fontWeight:600, margin:0 }}>⚠️ {payErr}</p>
                  </div>
                )}

                {parseFloat(payAmount||'0')>bal&&(
                  <p style={{ color:T.red, fontSize:12, margin:'0 0 12px', textAlign:'center' as const }}>Insufficient balance</p>
                )}

                <button
                  onClick={()=>setPayStep('pin')}
                  disabled={!payAmount||parseFloat(payAmount)<=0||parseFloat(payAmount)>bal}
                  style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:T.navy, color:'#fff', fontWeight:700, fontSize:16, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity:(!payAmount||parseFloat(payAmount)<=0||parseFloat(payAmount)>bal)?0.5:1 }}>
                  Pay ₹{payAmount ? parseFloat(payAmount).toLocaleString('en-IN') : '0'} →
                </button>
              </div>
            )}

            {/* CAMERA VIEW (no QR scanned yet) */}
            {(payStep==='form'||payStep==='failed')&&!scanned&&(
              <>
                <div style={{ width:'100%', height:300, borderRadius:20, background:'#0D0D1A', position:'relative', overflow:'hidden', marginBottom:14 }}>
                  <video ref={videoRef} autoPlay playsInline muted style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', opacity:camStatus==='active'?1:0, transition:'opacity 0.3s' }}/>
                  <canvas ref={canvasRef} style={{ display:'none' }}/>

                  {/* Corner markers */}
                  {camStatus==='active'&&(
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                      <div style={{ width:180, height:180, position:'relative' }}>
                        {[{top:0,left:0},{top:0,right:0},{bottom:0,left:0},{bottom:0,right:0}].map((pos,i)=>(
                          <div key={i} style={{ position:'absolute', width:28, height:28, borderRadius:4,
                            borderTop:i<2?'3px solid #00FF88':'none', borderBottom:i>=2?'3px solid #00FF88':'none',
                            borderLeft:i%2===0?'3px solid #00FF88':'none', borderRight:i%2===1?'3px solid #00FF88':'none',
                            ...pos }}/>
                        ))}
                      </div>
                    </div>
                  )}

                  {camStatus==='requesting'&&(
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', gap:12 }}>
                      <div style={{ width:44, height:44, border:'4px solid rgba(0,229,204,0.15)', borderTopColor:'#00e5cc', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                      <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, margin:0 }}>Starting camera…</p>
                    </div>
                  )}

                  {camStatus==='error'&&(
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', padding:20, textAlign:'center' as const }}>
                      <p style={{ fontSize:32, marginBottom:10 }}>📷</p>
                      <p style={{ color:'#FF9500', fontSize:12, fontWeight:600, lineHeight:1.6, margin:'0 0 14px' }}>{camErr}</p>
                      <button onClick={startCamera} style={{ background:'#00e5cc', color:'#000', border:'none', borderRadius:10, padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
                        🔄 Try Again
                      </button>
                    </div>
                  )}

                  {camStatus==='active'&&(
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'10px', background:'linear-gradient(transparent,rgba(0,0,0,0.5))' }}>
                      <p style={{ color:'rgba(255,255,255,0.8)', fontSize:12, margin:0, textAlign:'center' as const }}>🔍 Point at any UPI QR code to scan</p>
                    </div>
                  )}
                </div>

                {camStatus==='active'&&(
                  <div style={{ background:T.light, borderRadius:12, padding:'10px 14px', marginBottom:12 }}>
                    {['Hold phone 15-20cm from QR code','Good lighting gives better scan results','Works with GPay, Paytm, PhonePe, INRT QR'].map((t,i)=>(
                      <p key={i} style={{ color:T.muted, fontSize:11, margin:'2px 0' }}>• {t}</p>
                    ))}
                  </div>
                )}

                <div style={{ background:T.light, border:`1px solid ${T.border}`, borderRadius:14, padding:'14px 16px' }}>
                  <p style={{ color:T.muted, fontSize:12, fontWeight:600, margin:'0 0 10px' }}>Camera not working?</p>
                  <div style={{ display:'flex', gap:8 }}>
                    <label style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'12px', borderRadius:10, border:`1px solid ${T.border}`, background:T.card, cursor:'pointer', fontSize:13, fontWeight:700, color:T.navy, fontFamily:"'Plus Jakarta Sans',sans-serif", gap:6 }}>
                      📁 Upload QR Image
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
        {mode==='show'&&(
          <div style={{ textAlign:'center' as const }}>
            <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:20, padding:24, marginBottom:16, boxShadow:'0 4px 20px rgba(10,37,64,0.08)' }}>
              <div style={{ width:200, height:200, background:'#fff', borderRadius:12, margin:'0 auto 16px', overflow:'hidden', padding:8 }}>
                {upiId ? (
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(profile?.name||'INRT User')}&cu=INR`)}`} alt="UPI QR" style={{ width:'100%', height:'100%' }}/>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#999', fontSize:13 }}>Generating…</div>
                )}
              </div>
              <p style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontWeight:800, fontSize:18, margin:'0 0 4px', color:T.text }}>{profile?.name||'INRT User'}</p>
              <p style={{ fontSize:13, color:T.muted, margin:'0 0 16px' }}>{upiId}</p>
              <div style={{ display:'flex', gap:10 }}>
                <button style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:T.accent, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                  onClick={()=>navigator.share?navigator.share({title:'Pay me via UPI',text:upiId}):navigator.clipboard.writeText(upiId).then(()=>alert('Copied!'))}>
                  📤 Share
                </button>
                <button style={{ flex:1, padding:'12px', borderRadius:12, border:`1px solid ${T.border}`, background:'transparent', color:T.text, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                  onClick={()=>navigator.clipboard.writeText(upiId).then(()=>alert('UPI ID copied!'))}>
                  📋 Copy
                </button>
              </div>
            </div>

            {inrtAddr&&(
              <div onClick={()=>navigate('/crypto')} style={{ background:'rgba(123,47,190,0.06)', border:'1px solid rgba(123,47,190,0.2)', borderRadius:14, padding:'14px 16px', cursor:'pointer', textAlign:'left' as const, marginBottom:12 }}>
                <p style={{ color:'#7B2FBE', fontWeight:700, fontSize:13, margin:'0 0 4px' }}>🪙 Share INRT address instead</p>
                <p style={{ color:T.muted, fontSize:11, margin:0, fontFamily:'monospace' }}>{inrtAddr}</p>
              </div>
            )}

            <div onClick={()=>navigate('/checkout')} style={{ background:'rgba(0,112,243,0.06)', border:'1px solid rgba(0,112,243,0.2)', borderRadius:14, padding:'14px 16px', cursor:'pointer', textAlign:'left' as const }}>
              <p style={{ color:T.accent, fontWeight:700, fontSize:13, margin:'0 0 4px' }}>💰 Want to buy or sell INRT?</p>
              <p style={{ color:T.muted, fontSize:12, margin:0 }}>Buy INRT with ₹ or sell INRT back to ₹ →</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
