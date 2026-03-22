import { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
  signUp: (phone: string, name: string, password: string) => Promise<void>;
  signIn: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const signUp = async (phone: string, name: string, password: string) => {
    const email = `${phone.replace(/\s/g, '')}@inrtwallet.app`;
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });
    const existing = await getUserProfile(result.user.uid);
    if (!existing) {
      await createUserProfile(result.user.uid, { phone, name, email });
    }
    const profile = await getUserProfile(result.user.uid);
    setUserProfile(profile);
  };

  const signIn = async (phone: string, password: string) => {
    const email = `${phone.replace(/\s/g, '')}@inrtwallet.app`;
    const result = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserProfile(result.user.uid);
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
    <AuthContext.Provider value={{ user, userProfile, loading, signUp, signIn, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
