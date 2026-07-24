import React from "react";
import { useAuth } from "@/context/AuthContext";
import { QRCodeCanvas } from "qrcode.react";

export default function ReceiveMoney() {

  const { userProfile } = useAuth();

  const qrValue = userProfile?.phone
    ? `upi://pay?phone=${userProfile.phone}`
    : "";

  return (

    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', padding: '20px' }}>

      <h1 style={{ fontSize: '24px', fontWeight: 'bold', textAlign: 'center', margin: 0 }}>
        Receive Money
      </h1>

      <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>

        <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
          Scan to Pay Me
        </h2>

        <QRCodeCanvas
          value={qrValue}
          size={220}
          bgColor="#ffffff"
          fgColor="#000000"
        />

        <div style={{ textAlign: 'center' }}>

          <p style={{ fontWeight: '500', margin: '0 0 4px' }}>
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

    </div>

  );

}