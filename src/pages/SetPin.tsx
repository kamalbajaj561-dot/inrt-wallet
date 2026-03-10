import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { Button, Card, Input } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { hashPin } from '@/lib/crypto';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';

export default function SetPin() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'OLD' | 'NEW' | 'CONFIRM'>('NEW');

  useEffect(() => {
    if (userProfile?.upiPinEnabled) {
      setStep('OLD');
    }
  }, [userProfile]);

  const handleSetPin = async () => {
    if (pin.length !== 6 || confirmPin.length !== 6) {
      toast.error("PIN must be 6 digits");
      return;
    }

    if (pin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      const hashedPin = await hashPin(pin);
      
      await updateDoc(doc(db, 'users', user!.uid), {
        upiPinHash: hashedPin,
        upiPinEnabled: true
      });

      toast.success("UPI PIN set successfully!");
      navigate('/profile');
    } catch (error) {
      console.error("Error setting PIN:", error);
      toast.error("Failed to set PIN");
    } finally {
      setLoading(false);
    }
  };

  const verifyOldPin = async () => {
    if (oldPin.length !== 6) {
      toast.error("Enter valid 6-digit PIN");
      return;
    }

    setLoading(true);
    try {
        const userDoc = await getDoc(doc(db, 'users', user!.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            const storedHash = data.upiPinHash;
            const enteredHash = await hashPin(oldPin);
            
            if (storedHash === enteredHash) {
                setStep('NEW');
                toast.success("Old PIN verified");
            } else {
                toast.error("Incorrect Old PIN");
            }
        } else {
            toast.error("User data not found");
        }
    } catch (e) {
        console.error(e);
        toast.error("Verification failed");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div className="flex items-center space-x-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-2xl font-bold">
          {userProfile?.upiPinEnabled ? "Change UPI PIN" : "Set UPI PIN"}
        </h1>
      </div>

      <Card className="p-6 space-y-6">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <Lock size={32} />
          </div>
        </div>

        {step === 'OLD' && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Enter Old PIN</label>
            <Input
              type="password"
              maxLength={6}
              value={oldPin}
              onChange={(e) => setOldPin(e.target.value.replace(/[^0-9]/g, ''))}
              className="text-center text-2xl tracking-widest"
              placeholder="••••••"
            />
            <Button onClick={verifyOldPin} className="w-full" isLoading={loading} disabled={oldPin.length !== 6}>
              Verify
            </Button>
          </div>
        )}

        {step === 'NEW' && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Enter New 6-Digit PIN</label>
            <Input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
              className="text-center text-2xl tracking-widest"
              placeholder="••••••"
            />
            <Button onClick={() => setStep('CONFIRM')} className="w-full" disabled={pin.length !== 6}>
              Next
            </Button>
          </div>
        )}

        {step === 'CONFIRM' && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Confirm New PIN</label>
            <Input
              type="password"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
              className="text-center text-2xl tracking-widest"
              placeholder="••••••"
            />
            <Button onClick={handleSetPin} className="w-full" isLoading={loading} disabled={confirmPin.length !== 6}>
              Set PIN
            </Button>
            <Button variant="ghost" onClick={() => setStep('NEW')} className="w-full">
              Back
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
