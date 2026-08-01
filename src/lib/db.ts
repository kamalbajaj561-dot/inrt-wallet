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

// ── App Mode (National / International) ─────────────────────
export async function setAppMode(uid: string, mode: 'national' | 'international') {
  await updateDoc(doc(db, 'users', uid), {
    appMode:   mode,
    updatedAt: serverTimestamp(),
  });
}

// ── Bank Account Linking (National mode funding source) ────────
export async function setLinkedBankAccount(uid: string, account: {
  bankName: string;
  accountNumberMasked: string;
  accountType: string;
  ifsc: string;
  mobileNumber: string;
} | null) {
  await updateDoc(doc(db, 'users', uid), {
    linkedBankAccount: account,
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

// ── Sandbox Payments (TEST MODE ONLY — no real money) ──────────
export async function recordSandboxPayment(uid: string, data: {
  amount: number;
  method: string;
  success: boolean;
  refId: string;
}) {
  await addDoc(collection(db, 'transactions'), {
    uid,
    type:      'credit',
    amount:    data.amount,
    note:      `[SANDBOX] Payment via ${data.method}`,
    cat:       'sandbox',
    ref:       data.refId,
    status:    data.success ? 'success' : 'failed',
    createdAt: serverTimestamp(),
  });
  if (data.success) {
    await updateBalance(uid, data.amount);
    await addNotification(
      uid, '✅ Sandbox payment received',
      `₹${data.amount} added via test ${data.method} — no real money moved.`,
      'success',
    );
  } else {
    await addNotification(
      uid, '❌ Sandbox payment failed',
      `Test payment of ₹${data.amount} via ${data.method} was simulated to fail.`,
      'error',
    );
  }
  return data.refId;
}

export async function recordSandboxSend(uid: string, data: {
  amount: number;
  method: string;
  recipient: string;
  success: boolean;
  refId: string;
}) {
  await addDoc(collection(db, 'transactions'), {
    uid,
    type:      'debit',
    amount:    data.amount,
    note:      `[SANDBOX] Sent to ${data.recipient} via ${data.method}`,
    cat:       'sandbox',
    ref:       data.refId,
    status:    data.success ? 'success' : 'failed',
    createdAt: serverTimestamp(),
  });
  if (data.success) {
    await updateBalance(uid, -data.amount);
    await addNotification(
      uid, '✅ Sandbox transfer sent',
      `₹${data.amount} sent to ${data.recipient} — no real money moved.`,
      'success',
    );
  } else {
    await addNotification(
      uid, '❌ Sandbox transfer failed',
      `Test transfer of ₹${data.amount} to ${data.recipient} was simulated to fail.`,
      'error',
    );
  }
  return data.refId;
}

// ── Bookings ─────────────────────────────────────────────────
export async function createBooking(uid: string, data: {
  type: 'movie' | 'train' | 'bus' | 'flight';
  title: string;
  date: string;
  time?: string;
  amount: number;
  seats?: number;
  passengers?: number;
  from?: string;
  to?: string;
  status?: 'confirmed' | 'pending' | 'cancelled';
}) {
  return addDoc(collection(db, 'bookings'), {
    uid, ...data,
    status: data.status || 'confirmed',
    createdAt: serverTimestamp(),
  });
}

export function subscribeToBookings(uid: string, cb: (b: any[]) => void) {
  const q = query(
    collection(db, 'bookings'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
  );
}
