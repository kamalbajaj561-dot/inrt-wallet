import {
  doc, setDoc, getDoc, updateDoc,
  collection, query, where, orderBy,
  limit, getDocs, serverTimestamp,
  increment, addDoc, onSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';

// ── User profile ──────────────────────────────────────────────
export async function createUserProfile(uid: string, data: {
  phone: string; name: string; email: string;
}) {
  await setDoc(doc(db, 'users', uid), {
    uid, ...data,
    balance:        0,
    rewardPoints:   0,
    cashback:       0,
    kycStatus:      'not_started',
    goldGrams:      0,
    goldInvested:   0,
    cryptoHoldings: {},
    notifPush:      true,
    notifEmail:     true,
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
  });
  // phone index for login lookup
  await setDoc(doc(db, 'phoneIndex', data.phone), {
    uid, phone: data.phone,
  });
}

export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export function subscribeToUser(uid: string, cb: (d: any) => void) {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (snap.exists()) cb(snap.data());
  });
}

export async function getUserByPhone(phone: string) {
  const snap = await getDoc(doc(db, 'phoneIndex', phone));
  if (!snap.exists()) return null;
  const { uid } = snap.data();
  return getUserProfile(uid);
}

// ── Transactions ──────────────────────────────────────────────
export async function addTransaction(uid: string, data: {
  type: 'credit' | 'debit';
  amount: number;
  note: string;
  cat?: string;
  ref?: string;
}) {
  return addDoc(collection(db, 'transactions'), {
    uid, ...data,
    status:    'success',
    createdAt: serverTimestamp(),
  });
}

export function subscribeToTransactions(uid: string, cb: (t: any[]) => void) {
  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  );
}

// ── Balance ───────────────────────────────────────────────────
export async function updateBalance(uid: string, delta: number) {
  await updateDoc(doc(db, 'users', uid), {
    balance:   increment(delta),
    updatedAt: serverTimestamp(),
  });
}

// ── Notifications ─────────────────────────────────────────────
export async function addNotification(uid: string, title: string, body: string, type = 'info') {
  await addDoc(collection(db, 'notifications'), {
    uid, title, body, type,
    read:      false,
    createdAt: serverTimestamp(),
  });
}
