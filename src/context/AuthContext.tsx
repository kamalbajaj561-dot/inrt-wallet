import {
  createContext, useContext, useEffect,
  useState, type ReactNode,
} from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, onAuthStateChanged,
  updateProfile, type User,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { createUserProfile, getUserProfile } from '../lib/db';

interface AuthCtx {
  user:          User | null;
  userProfile:   any;
  loading:       boolean;
  signIn:        (phone: string, password: string) => Promise<void>;
  signUp:        (phone: string, name: string, password: string) => Promise<void>;
  logout:        () => Promise<void>;
  refreshProfile:() => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

const toEmail = (phone: string) =>
  `${phone.replace(/\D/g, '')}@inrtwallet.app`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,        setUser]        = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const p = await getUserProfile(u.uid);
        setUserProfile(p);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (phone: string, password: string) => {
    await signInWithEmailAndPassword(auth, toEmail(phone), password);
  };

  const signUp = async (phone: string, name: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, toEmail(phone), password);
    await updateProfile(cred.user, { displayName: name });
    await createUserProfile(cred.user.uid, {
      phone, name, email: toEmail(phone),
    });
    const p = await getUserProfile(cred.user.uid);
    setUserProfile(p);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null); setUserProfile(null);
  };

  const refreshProfile = async () => {
    if (!user) return;
    const p = await getUserProfile(user.uid);
    setUserProfile(p);
  };

  if (loading) {
    return (
      <div style={{ minHeight:'100vh',background:'#050914',display:'flex',
                    alignItems:'center',justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:48,height:48,border:'3px solid #00e5cc',
                         borderTopColor:'transparent',borderRadius:'50%',
                         animation:'spin 0.7s linear infinite',margin:'0 auto 12px' }} />
          <p style={{ color:'#7d8fb3',fontSize:14,fontFamily:'Plus Jakarta Sans,sans-serif' }}>
            Loading…
          </p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ user, userProfile, loading, signIn, signUp, logout, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}
