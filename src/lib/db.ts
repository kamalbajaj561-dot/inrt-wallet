import {
  doc, setDoc, getDoc, updateDoc, collection,
  addDoc, query, where, orderBy, limit,
  getDocs, serverTimestamp, increment, onSnapshot
} from 'firebase/firestore';
import { db } from './firebase';

// ─── USER PROFILE ─────────────────────────────────────────────
export async function createUserProfile(uid: string, data: {
  phone: string;
  name: string;
  email?: string;
}) {
  const upiId = `${data.phone}@inrt`;
  await setDoc(doc(db, 'users', uid), {
    uid,
    name: data.name,
    phone: data.phone,
    email: data.email || '',
    upiId,
    balance: 0,
    rewardPoints: 0,
    cashback: 0,
    kycStatus: 'pending', // pending | submitted | verified | rejected
    kycData: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return upiId;
}

export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateUserProfile(uid: string, data: object) {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToUser(uid: string, callback: (data: any) => void) {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

// ─── KYC ──────────────────────────────────────────────────────
export async function submitKYC(uid: string, kycData: {
  aadhaar: string;
  pan: string;
  dob: string;
  address: string;
  selfieUrl?: string;
}) {
  await updateDoc(doc(db, 'users', uid), {
    kycStatus: 'submitted',
    kycData,
    kycSubmittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ─── TRANSACTIONS ──────────────────────────────────────────────
export async function sendMoney(params: {
  fromUid: string;
  toUpiId: string;
  amount: number;
  note?: string;
}) {
  const { fromUid, toUpiId, amount, note } = params;

  // Find recipient
  const q = query(collection(db, 'users'), where('upiId', '==', toUpiId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('UPI ID not found');

  const toUser = snap.docs[0].data();
  const toUid = toUser.uid;

  // Check sender balance
  const fromSnap = await getDoc(doc(db, 'users', fromUid));
  const fromUser = fromSnap.data()!;
  if (fromUser.balance < amount) throw new Error('Insufficient balance');

  // Deduct from sender
  await updateDoc(doc(db, 'users', fromUid), {
    balance: increment(-amount),
    updatedAt: serverTimestamp(),
  });

  // Add to receiver
  await updateDoc(doc(db, 'users', toUid), {
    balance: increment(amount),
    updatedAt: serverTimestamp(),
  });

  const txRef = `TXN${Date.now()}`;

  // Record debit tx
  await addDoc(collection(db, 'transactions'), {
    uid: fromUid,
    type: 'debit',
    amount,
    toUpiId,
    toName: toUser.name,
    note: note || '',
    ref: txRef,
    status: 'success',
    createdAt: serverTimestamp(),
  });

  // Record credit tx
  await addDoc(collection(db, 'transactions'), {
    uid: toUid,
    type: 'credit',
    amount,
    fromUpiId: fromUser.upiId,
    fromName: fromUser.name,
    note: note || '',
    ref: txRef,
    status: 'success',
    createdAt: serverTimestamp(),
  });

  // Give cashback (2%)
  const cashback = Math.floor(amount * 0.02);
  if (cashback > 0) {
    await updateDoc(doc(db, 'users', fromUid), {
      cashback: increment(cashback),
      rewardPoints: increment(Math.floor(amount / 10)),
    });
    await addDoc(collection(db, 'transactions'), {
      uid: fromUid,
      type: 'cashback',
      amount: cashback,
      note: `2% cashback on ₹${amount} transfer`,
      ref: `CB${Date.now()}`,
      status: 'success',
      createdAt: serverTimestamp(),
    });
  }

  return txRef;
}

export async function addMoney(uid: string, amount: number, razorpayOrderId: string) {
  await updateDoc(doc(db, 'users', uid), {
    balance: increment(amount),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'transactions'), {
    uid,
    type: 'credit',
    amount,
    note: 'Added via Razorpay',
    ref: razorpayOrderId,
    status: 'success',
    createdAt: serverTimestamp(),
  });
}

export async function getTransactions(uid: string, count = 20) {
  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(count)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function subscribeToTransactions(uid: string, callback: (txs: any[]) => void) {
  const q = query(
    collection(db, 'transactions'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── REWARDS ──────────────────────────────────────────────────
export async function redeemRewardPoints(uid: string, points: number) {
  const snap = await getDoc(doc(db, 'users', uid));
  const user = snap.data()!;
  if (user.rewardPoints < points) throw new Error('Not enough points');
  const cashValue = points; // 1 point = ₹1
  await updateDoc(doc(db, 'users', uid), {
    rewardPoints: increment(-points),
    balance: increment(cashValue),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, 'transactions'), {
    uid,
    type: 'credit',
    amount: cashValue,
    note: `Redeemed ${points} reward points`,
    ref: `RWD${Date.now()}`,
    status: 'success',
    createdAt: serverTimestamp(),
  });
}

// ─── BOOKINGS ─────────────────────────────────────────────────
export async function createBooking(uid: string, booking: {
  type: 'movie' | 'bus' | 'train' | 'flight';
  details: object;
  amount: number;
}) {
  const snap = await getDoc(doc(db, 'users', uid));
  const user = snap.data()!;
  if (user.balance < booking.amount) throw new Error('Insufficient balance');

  await updateDoc(doc(db, 'users', uid), {
    balance: increment(-booking.amount),
    updatedAt: serverTimestamp(),
  });

  const ref = await addDoc(collection(db, 'bookings'), {
    uid,
    ...booking,
    bookingId: `BK${Date.now()}`,
    status: 'confirmed',
    createdAt: serverTimestamp(),
  });

  await addDoc(collection(db, 'transactions'), {
    uid,
    type: 'debit',
    amount: booking.amount,
    note: `${booking.type.toUpperCase()} Booking`,
    ref: `BK${Date.now()}`,
    status: 'success',
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

export async function getBookings(uid: string) {
  const q = query(
    collection(db, 'bookings'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
