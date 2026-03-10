import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button, Input, Card } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { Phone, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (auth) {
      // Initialize Recaptcha
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': () => {
          // reCAPTCHA solved
        }
      });
    }
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;

    try {
      if (!auth || !window.recaptchaVerifier) throw new Error("Firebase Auth not initialized");
      
      // Disable app verification for testing
      auth.settings.appVerificationDisabledForTesting = true;

      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);
      setConfirmationResult(confirmation);
      setStep('OTP');
      toast.success('OTP sent successfully!');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/captcha-check-failed') {
        toast.error('Domain not authorized. Please add this domain to Firebase Console.');
      } else {
        toast.error(error.message || 'Failed to send OTP');
      }
      // Reset recaptcha on error
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then(widgetId => {
          grecaptcha.reset(widgetId);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !confirmationResult) return;

    setLoading(true);
    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;

      if (db) {
        // Check if user profile exists
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          // Create new user profile
          await setDoc(userDocRef, {
            uid: user.uid,
            phoneNumber: user.phoneNumber,
            walletBalance: 0,
            kycTier: 'TIER_1',
            accountStatus: 'active',
            createdAt: serverTimestamp(),
            fullName: 'New User' // Ideally ask for name in next step
          });
        }
      }

      toast.success('Welcome to INRT Wallet!');
      navigate('/dashboard');
    } catch (error) {
      console.error(error);
      toast.error('Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-accent/20">
            <span className="text-3xl font-bold text-white">IN</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">INRT Wallet</h1>
          <p className="text-slate-300">Secure payments for everyone</p>
        </div>

        <Card className="shadow-2xl border-0">
          {step === 'PHONE' ? (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">+91</span>
                  <Input
                    type="tel"
                    placeholder="98765 43210"
                    className="pl-14"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    maxLength={10}
                  />
                </div>
              </div>
              
              <div id="recaptcha-container"></div>

              <Button type="submit" className="w-full" isLoading={loading}>
                Send OTP <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-3">
                  <ShieldCheck size={24} />
                </div>
                <h3 className="text-lg font-semibold">Verify OTP</h3>
                <p className="text-sm text-slate-500">Enter the code sent to +91 {phoneNumber}</p>
              </div>

              <div>
                <Input
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  className="text-center text-2xl tracking-widest"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
              </div>

              <Button type="submit" className="w-full" isLoading={loading}>
                Verify & Login
              </Button>
              
              <button 
                type="button"
                onClick={() => setStep('PHONE')}
                className="w-full text-sm text-slate-500 hover:text-primary mt-4"
              >
                Change Phone Number
              </button>
            </form>
          )}
        </Card>
        
        <p className="text-center text-slate-400 text-xs mt-8">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}

// Add types for window
declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier;
  }
}
