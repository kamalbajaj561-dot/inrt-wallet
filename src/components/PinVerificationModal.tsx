import React, { useState, useEffect } from 'react';
import { PinInput } from './PinInput';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { hashPin } from '@/lib/crypto';
import { toast } from 'react-hot-toast';

interface PinVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
}

export const PinVerificationModal: React.FC<PinVerificationModalProps> = ({ isOpen, onClose, onSuccess, title }) => {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (lockoutTime) {
      const interval = setInterval(() => {
        if (Date.now() > lockoutTime) {
          setLockoutTime(null);
          setAttempts(0);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lockoutTime]);

  const handlePinComplete = async (pin: string) => {
    if (lockoutTime) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!user) {
        setError("User not authenticated");
        setLoading(false);
        return;
      }

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        setError("User not found");
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      const storedHash = userData.upiPinHash;
      
      if (!storedHash) {
        setError("UPI PIN not set. Please set it in Profile.");
        setLoading(false);
        return;
      }

      const enteredHash = await hashPin(pin);

      if (storedHash === enteredHash) {
        onSuccess();
        onClose();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 3) {
          const newLockout = Date.now() + 30000;
          setLockoutTime(newLockout);
          setError("Too many failed attempts. Locked for 30s.");
        } else {
          setError("Incorrect UPI PIN");
        }
      }
    } catch (e) {
      console.error(e);
      setError("Verification failed");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (lockoutTime) {
      const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
      return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-xl shadow-xl text-center w-64">
                  <h3 className="text-lg font-bold text-red-600 mb-2">Locked</h3>
                  <p className="text-sm text-slate-600">Too many failed attempts.</p>
                  <p className="font-mono text-xl mt-4 font-bold">{remaining}s</p>
                  <button onClick={onClose} className="mt-6 text-sm text-slate-500 hover:text-slate-800 underline">Close</button>
              </div>
          </div>
      );
  }

  return (
    <PinInput
      onComplete={handlePinComplete}
      onClose={onClose}
      title={title || "Enter UPI PIN"}
      error={error}
      isLoading={loading}
    />
  );
};
