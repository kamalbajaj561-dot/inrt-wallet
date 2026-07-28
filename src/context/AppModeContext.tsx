import {
  createContext, useContext, useState, useEffect, type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { setAppMode as setAppModeInDb } from '../lib/db';

export type AppMode = 'national' | 'international';

interface AppModeCtx {
  mode:    AppMode;
  setMode: (mode: AppMode) => void;
}

const Ctx = createContext<AppModeCtx>({ mode: 'national', setMode: () => {} });
export const useAppMode = () => useContext(Ctx);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const { user, userProfile } = useAuth();
  const [mode, setModeState] = useState<AppMode>('national');

  // Reflect whatever is saved on the user's profile. Existing users
  // without an appMode field fall back to 'national' automatically.
  useEffect(() => {
    const saved = userProfile?.appMode;
    if (saved === 'international' || saved === 'national') {
      setModeState(saved);
    }
  }, [userProfile?.appMode]);

  const setMode = (next: AppMode) => {
    setModeState(next); // update UI immediately, don't wait on Firestore
    if (user?.uid) {
      setAppModeInDb(user.uid, next).catch(() => {
        // If the write fails, we still leave the local UI in the chosen
        // mode rather than snapping back — it'll just re-sync next load.
      });
    }
  };

  return (
    <Ctx.Provider value={{ mode, setMode }}>
      {children}
    </Ctx.Provider>
  );
}
