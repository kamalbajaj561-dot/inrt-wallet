import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { QRCodeCanvas } from "qrcode.react";

const T = {
  navy:'#0A2540', accent:'#0070F3', inrt:'#7B2FBE',
  teal:'#00e5cc',
  border:'rgba(255,255,255,0.1)', muted:'#8B9DB3', light:'#0D2A4A',
  text:'#FFFFFF', card:'#0D2A4A',
};

export default function ReceiveMoney() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const polygonWallet: string | null = userProfile?.polygonWallet || null;
  const hasWallet = !!polygonWallet;

  const copyAddress = () => {
    if (!polygonWallet) return;
    navigator.clipboard.writeText(polygonWallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      background: T.navy,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 20px 40px',
      fontFamily: "'Plus Jakarta Sans',sans-serif",
      boxSizing: 'border-box',
    }}>

      {/* Header */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'rgba(255,255,255,0.08)', border: 'none',
            color: T.text, fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >←</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: 0 }}>
          Receive INRT
        </h1>
      </div>

      {/* Main card */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: 24,
        padding: '32px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
        boxShadow: `0 8px 32px rgba(123,47,190,0.15)`,
      }}>

        {hasWallet ? (
          <>
            <div style={{
              background: '#ffffff', borderRadius: 18, padding: 18,
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            }}>
              <QRCodeCanvas
                value={polygonWallet as string}
                size={220}
                bgColor="#ffffff"
                fgColor={T.navy}
              />
            </div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: '0 0 4px' }}>
                {userProfile?.name || "INRT User"}
              </p>
              <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
                Scan to send INRT directly to this wallet
              </p>
            </div>

            <div style={{
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}>
              <p style={{
                fontSize: 12, color: T.teal, margin: 0, fontFamily: 'monospace',
                wordBreak: 'break-all', flex: 1,
              }}>
                {polygonWallet}
              </p>
              <button
                onClick={copyAddress}
                style={{
                  background: copied ? T.accent : T.inrt,
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '8px 14px', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'background 0.2s',
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            <p style={{ fontSize: 11, color: T.muted, textAlign: 'center', margin: 0 }}>
              1 INRT = ₹1 · Polygon network only
            </p>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
              background: 'linear-gradient(135deg,#00e5cc,#00b4a0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>🔗</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: '0 0 8px' }}>
              No wallet linked yet
            </p>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 20px', lineHeight: 1.5 }}>
              Set up your Polygon wallet to start receiving INRT directly.
            </p>
            <button
              onClick={() => navigate('/crypto')}
              style={{
                background: T.inrt, color: '#fff', border: 'none',
                borderRadius: 12, padding: '13px 24px',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Set Up Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
