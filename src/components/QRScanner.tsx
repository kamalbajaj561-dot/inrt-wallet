import React from "react";

export default function QRScanner({
  onScan,
}: {
  onScan: (data: string) => void;
}) {
  return (
    <div style={{ textAlign: "center", padding: 32 }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>📷</div>
      <p style={{ color: "#666", marginBottom: 16 }}>
        Camera scanner coming soon. Enter UPI ID manually:
      </p>
      <input
        placeholder="Enter UPI ID manually"
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 10,
          border: "2px solid #e5e7eb",
          fontSize: 16,
        }}
        onChange={(e) => onScan(e.target.value)}
      />
    </div>
  );
}
