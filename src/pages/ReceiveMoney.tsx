import React from "react";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui";
import { QRCodeCanvas } from "qrcode.react";

export default function ReceiveMoney() {

  const { userProfile } = useAuth();

  const qrValue = userProfile?.phoneNumber
    ? `upi://pay?phone=${userProfile.phoneNumber}`
    : "";

  return (

    <div className="max-w-md mx-auto space-y-6">

      <h1 className="text-2xl font-bold text-center">
        Receive Money
      </h1>

      <Card className="p-6 flex flex-col items-center space-y-4">

        <h2 className="text-lg font-semibold">
          Scan to Pay Me
        </h2>

        <QRCodeCanvas
          value={qrValue}
          size={220}
          bgColor="#ffffff"
          fgColor="#000000"
        />

        <div className="text-center">

          <p className="font-medium">
            {userProfile?.fullName || "INRT User"}
          </p>

          <p className="text-sm text-gray-500">
            {userProfile?.phoneNumber}
          </p>

        </div>

        <div className="text-xs text-gray-400 text-center">
          Scan this QR using INRT Wallet to send money
        </div>

      </Card>

    </div>

  );

}