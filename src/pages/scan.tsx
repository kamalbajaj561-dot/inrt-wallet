import React from "react";
import { useNavigate } from "react-router-dom";
import { QRScanner } from "@/components/QRScanner";

export default function Scan() {

  const navigate = useNavigate();

  const handleScan = (data: string) => {

    if (!data) return;

    navigate(`/send?receiver=${data}`);

  };

  return (

    <div className="max-w-md mx-auto p-6">

      <h1 className="text-2xl font-bold mb-6 text-center">
        Scan QR Code
      </h1>

      <QRScanner
        onScan={handleScan}
        onClose={() => navigate("/dashboard")}
      />

    </div>

  );

}