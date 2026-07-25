import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { QRCodeCanvas } from "qrcode.react";
import { useNavigate } from "react-router-dom";

export default function ReceiveMoney() {

  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const qrValue = userProfile?.phone
    ? `upi://pay?phone=${userProfile.phone}`
    : "";

  const polygonWallet = userProfile?.polygonWallet || null;
  const hasWallet = !!polygonWallet;

  const copyAddress = () => {
    if (polygonWallet) {
      navigator.clipboard.writeText(polygonWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (

    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', padding: '20px' }}>

      <h1 style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', margin: 0, color: '#ffffff' }}>
        Receive Money
      </h1>

      {/* UPI QR Section */}
      <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>

        <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: '#111827' }}>
          Scan to Pay Me
        </h2>

        <QRCodeCanvas
          value={qrValue}
          size={220}
          bgColor="#ffffff"
          fgColor="#000000"
        />

        <div style={{ textAlign: 'center' }}>

          <p style={{ fontWeight: '500', margin: '0 0 4px', color: '#111827' }}>
            {userProfile?.name || "INRT User"}
          </p>

          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            {userProfile?.phone}
          </p>

        </div>

        <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
          Scan this QR using INRT Wallet to send money
        </div>

      </div>

      {/* Polygon Wallet Section */}
      <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>

        <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: '#111827' }}>
          Receive INRT via blockchain address
        </h2>

        {hasWallet ? (
          <>
            <QRCodeCanvas
              value={polygonWallet}
              size={220}
              bgColor="#ffffff"
              fgColor="#000000"
            />

            <div style={{ width: '100%', background: '#f3f4f6', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <p style={{ fontSize: '12px', color: '#374151', margin: 0, wordBreak: 'break-all', flex: 1 }}>
                {polygonWallet}
              </p>
              <button
                onClick={copyAddress}
                style={{ background: '#0070F3', color: '#ffffff', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
              Scan this QR to send INRT to your Polygon wallet
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 12px' }}>
              No Polygon wallet linked yet
            </p>
            <button
              onClick={() => navigate('/crypto')}
              style={{ background: '#0070F3', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '12px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              Set up wallet
            </button>
          </div>
        )}

      </div>

    </div>

  );

}