import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';
import { Button } from '@/components/ui';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize scanner
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );
    
    scanner.render(
      (decodedText) => {
        onScan(decodedText);
        scanner.clear();
      },
      (errorMessage) => {
        // Handle scan error (ignore for now as it triggers on every frame without QR)
      }
    );

    scannerRef.current = scanner;

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden relative">
        <div className="p-4 flex justify-between items-center border-b border-slate-100">
          <h3 className="font-bold text-lg">Scan QR Code</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4">
          <div id="reader" className="w-full h-64 bg-slate-100 rounded-lg overflow-hidden"></div>
          {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
        </div>

        <div className="p-4 text-center text-sm text-slate-500">
          Point your camera at a valid INRT Wallet QR code
        </div>
      </div>
    </div>
  );
};
