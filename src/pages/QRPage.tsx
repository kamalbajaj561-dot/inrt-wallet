import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import QRCode from 'qrcode';

export default function QRPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [showAmountQR, setShowAmountQR] = useState(false);

  const upiId = userProfile?.upiId || `${userProfile?.phone}@inrt`;
  const name = userProfile?.name || 'INRT User';

  const generateQR = async (amt?: string) => {
    try {
      const upiStr = amt
        ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amt}&cu=INR`
        : `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&cu=INR`;
      const url = await QRCode.toDataURL(upiStr, {
        width: 280,
        margin: 2,
        color: { dark: '#001a2e', light: '#ffffff' },
      });
      setQrUrl(url);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (upiId) generateQR();
  }, [upiId]);

  const copyUPI = () => {
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareQR = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Pay me via INRT Wallet',
        text: `Pay ${name} using UPI ID: ${upiId}`,
        url: window.location.href,
      });
    } else {
      copyUPI();
    }
  };

  const downloadQR = () => {
    const link = document.createElement('a');
    link.download = `INRT-QR-${name}.png`;
    link.href = qrUrl;
    link.click();
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>My QR Code</h1>
        <button onClick={shareQR} style={s.shareBtn}>Share</button>
      </div>

      {/* QR Card */}
      <div style={s.qrCard}>
        <div style={s.qrInner}>
          <div style={s.logoRow}>
            <div style={s.logoIcon}>IN</div>
            <span style={s.logoText}>INRT Wallet</span>
          </div>
          {qrUrl && (
            <img src={qrUrl} alt="QR Code" style={s.qrImg} />
          )}
          <p style={s.upiId}>{upiId}</p>
          <p style={s.name}>{name}</p>
        </div>
        <div style={s.upiRow}>
          <span style={s.upiLabel}>UPI ID: {upiId}</span>
          <button onClick={copyUPI} style={s.copyBtn}>
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* Amount QR */}
      <div style={s.section}>
        <p style={s.sectionTitle}>Generate QR for specific amount</p>
        <div style={s.amountRow}>
          <span style={s.rupee}>₹</span>
          <input
            style={s.amountInput}
            type="number"
            placeholder="Enter amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <button
            style={s.genBtn}
            onClick={() => {
              if (amount) { generateQR(amount); setShowAmountQR(true); }
            }}
          >
            Generate
          </button>
        </div>
        {showAmountQR && amount && (
          <p style={{ color: '#00b9f1', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
            ✓ QR updated for ₹{amount}
          </p>
        )}
      </div>

      {/* Quick Amounts */}
      <div style={s.section}>
        <p style={s.sectionTitle}>Quick amount QR</p>
        <div style={s.quickGrid}>
          {[50, 100, 200, 500, 1000, 2000].map(a => (
            <button
              key={a}
              onClick={() => { setAmount(String(a)); generateQR(String(a)); setShowAmountQR(true); }}
              style={{ ...s.quickBtn, background: amount === String(a) ? '#dbeafe' : '#f8fafc', border: `2px solid ${amount === String(a) ? '#00b9f1' : '#e5e7eb'}`, color: amount === String(a) ? '#0369a1' : '#374151' }}
            >
              ₹{a}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={s.actions}>
        <button style={s.downloadBtn} onClick={downloadQR}>
          ⬇️ Download QR
        </button>
        <button style={s.resetBtn} onClick={() => { setAmount(''); setShowAmountQR(false); generateQR(); }}>
          🔄 Reset
        </button>
      </div>

      {/* Info */}
      <div style={s.infoCard}>
        <p style={s.infoTitle}>💡 How to use your QR Code</p>
        <p style={s.infoText}>• Share your QR code with anyone to receive payments instantly</p>
        <p style={s.infoText}>• They can scan it using any UPI app (PhonePe, GPay, Paytm etc.)</p>
        <p style={s.infoText}>• Set a specific amount to avoid confusion</p>
        <p style={s.infoText}>• Download and print it for your shop/business</p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', paddingBottom: 40, fontFamily: "'DM Sans', sans-serif" },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 16px 16px', background: 'linear-gradient(160deg,#001a2e,#002a45)' },
  back: { background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer', color: '#fff' },
  title: { fontWeight: 800, fontSize: 20, color: '#fff' },
  shareBtn: { background: 'rgba(0,185,241,0.2)', border: '1px solid rgba(0,185,241,0.4)', borderRadius: 12, padding: '8px 16px', color: '#00b9f1', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  qrCard: { margin: '16px', background: '#fff', borderRadius: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', overflow: 'hidden' },
  qrInner: { padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 },
  logoIcon: { width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#00b9f1,#0090c0)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 13 },
  logoText: { fontWeight: 800, fontSize: 18, color: '#001a2e' },
  qrImg: { width: 220, height: 220, borderRadius: 16, border: '3px solid #f1f5f9' },
  upiId: { marginTop: 16, color: '#374151', fontWeight: 700, fontSize: 15 },
  name: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  upiRow: { background: '#f8fafc', borderTop: '1px solid #e5e7eb', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  upiLabel: { color: '#6b7280', fontSize: 13 },
  copyBtn: { background: '#dbeafe', border: 'none', borderRadius: 10, padding: '6px 14px', color: '#1d4ed8', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  section: { margin: '0 16px 16px', background: '#fff', borderRadius: 18, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  sectionTitle: { fontWeight: 700, color: '#374151', fontSize: 14, marginBottom: 12 },
  amountRow: { display: 'flex', alignItems: 'center', gap: 8, border: '2px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', padding: '4px 4px 4px 12px' },
  rupee: { color: '#00b9f1', fontSize: 18, fontWeight: 800 },
  amountInput: { flex: 1, border: 'none', outline: 'none', fontSize: 16, fontFamily: 'inherit', color: '#111' },
  genBtn: { background: '#00b9f1', border: 'none', borderRadius: 10, padding: '10px 16px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  quickGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 },
  quickBtn: { borderRadius: 12, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  actions: { margin: '0 16px 16px', display: 'flex', gap: 10 },
  downloadBtn: { flex: 1, background: '#001a2e', border: 'none', borderRadius: 14, padding: '14px 0', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  resetBtn: { flex: 1, background: '#fff', border: '2px solid #e5e7eb', borderRadius: 14, padding: '14px 0', color: '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  infoCard: { margin: '0 16px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 16, padding: 16 },
  infoTitle: { fontWeight: 700, color: '#0369a1', fontSize: 14, marginBottom: 10 },
  infoText: { color: '#374151', fontSize: 13, marginBottom: 6, lineHeight: 1.5 },
};
