import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { createUserProfile, getUserProfile } from '../lib/db';

interface AuthContextType {
  user: User | null;
  userProfile: any;
  loading: boolean;
  sendOTP: (phone: string) => Promise<void>;
  verifyOTP: (otp: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const profile = await getUserProfile(u.uid);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const sendOTP = async (phone: string) => {
    const formatted = phone.startsWith('+') ? phone : `+91${phone}`;

    // Remove any existing recaptcha
    const existing = document.getElementById('recaptcha-container');
    if (existing) existing.innerHTML = '';

    return new Promise<void>((resolve, reject) => {
      try {
        const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => resolve(),
          'expired-callback': () => reject(new Error('reCAPTCHA expired')),
          'error-callback': (err: any) => reject(err),
        });

        signInWithPhoneNumber(auth, formatted, verifier)
          .then((result) => {
            setConfirmationResult(result);
            resolve();
          })
          .catch((error) => {
            console.error('Phone auth error:', error);
            reject(new Error(
              error.code === 'auth/api-key-not-valid'
                ? 'Please check Firebase configuration'
                : error.message
            ));
          });
      } catch (err: any) {
        reject(err);
      }
    });
  };

  const verifyOTP = async (otp: string, name: string) => {
    if (!confirmationResult) throw new Error('Please request OTP first');
    const result = await confirmationResult.confirm(otp);
    const u = result.user;

    // Create profile if new user
    const existing = await getUserProfile(u.uid);
    if (!existing) {
      await createUserProfile(u.uid, {
        phone: u.phoneNumber || '',
        name,
      });
      await updateProfile(u, { displayName: name });
    }

    const profile = await getUserProfile(u.uid);
    setUserProfile(profile);
  };

  const logout = async () => {
    await signOut(auth);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, userProfile, loading, sendOTP, verifyOTP, logout, refreshProfile }}
    >
      <div id="recaptcha-container" />
      {children}
    </AuthContext.Provider>
  );
}
