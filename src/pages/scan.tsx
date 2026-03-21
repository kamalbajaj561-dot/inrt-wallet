import React from "react";
import { useNavigate } from "react-router-dom";
import QRScanner from "@/components/QRScanner";
import { useAuth } from "@/context/AuthContext";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "react-hot-toast";

function extractPhoneFromUpiUrl(data: string): string | null {
  try {
    if (!data) return null;
    if (data.startsWith("upi://")) {
      const url = new URL(data.replace("upi://", "https://")); // hack to use URL parser
      const phoneParam = url.searchParams.get("phone");
      if (!phoneParam) return null;
      const digits = phoneParam.replace(/\D/g, "");
      if (digits.length >= 10) {
        return digits.slice(-10);
      }
      return null;
    }
    // Fallback: if QR just encodes a phone-like string
    const digits = data.replace(/\D/g, "");
    if (digits.length === 10) return digits;
    return null;
  } catch {
    return null;
  }
}

export default function Scan() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  const upiValue = userProfile?.upiId
    ? `upi://pay?pa=${encodeURIComponent(userProfile.upiId)}`
    : "";

  const shareMyQr = async () => {
    if (!upiValue) return;
    try {
      await navigator.clipboard.writeText(upiValue);
      toast.success("UPI link copied. Share it to receive payments.");
    } catch {
      toast.error("Unable to copy. Please try again.");
    }
  };

  const handleScan = (data: string) => {
    const phone = extractPhoneFromUpiUrl(data);
    if (!phone) {
      return;
    }
    navigate(`/send?phone=${encodeURIComponent(phone)}`);
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-center">INRT QR</h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-900">Your Receive QR</p>
            <p className="text-xs text-slate-500">Scan this to receive money.</p>
          </div>
          <button
            type="button"
            onClick={shareMyQr}
            className="text-sm font-bold text-primary hover:underline"
            disabled={!upiValue}
          >
            Share
          </button>
        </div>

        <div className="flex items-center justify-center">
          {upiValue ? (
            <QRCodeCanvas value={upiValue} size={160} bgColor="#ffffff" fgColor="#000000" />
          ) : (
            <div className="text-sm text-slate-500">UPI not available yet.</div>
          )}
        </div>

        {userProfile?.upiId && (
          <p className="text-xs text-slate-500 break-all">{userProfile.upiId}</p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4 text-center">Scan to Send</h2>
        <QRScanner onScan={handleScan} />
        <p className="text-xs text-slate-500 mt-3 text-center">
          Point your camera at an INRT Wallet QR. We’ll open Send automatically.
        </p>
      </div>
    </div>
  );
}

