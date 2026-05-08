/**
 * INRT WALLET — server.js (FINAL CLEAN)
 * All routes in one file, no duplicates, no crashes
 */

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ── Firebase Admin ────────────────────────────────────────────
const admin = require('firebase-admin');
let adminAuth = null;
let db        = null;
try {
  const creds = process.env.GOOGLE_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : require('./serviceAccountKey.json');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    adminAuth = admin.auth();
    db        = admin.firestore();
    console.log('✅ Firebase Admin connected');
  }
} catch (e) { console.warn('⚠️  Firebase Admin:', e.message); }

// ── Razorpay ──────────────────────────────────────────────────
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

// ── Cashfree config ───────────────────────────────────────────
const CF_BASE = process.env.NODE_ENV === 'production'
  ? 'https://payout-api.cashfree.com'
  : 'https://payout-gamma.cashfree.com';

let cfToken       = null;
let cfTokenExpiry = 0;

async function getCFToken() {
  if (cfToken && Date.now() < cfTokenExpiry) return cfToken;
  const appId  = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret) throw new Error('CASHFREE_APP_ID and CASHFREE_SECRET_KEY not set in Railway');
  const r = await fetch(`${CF_BASE}/payout/v1/authorize`, {
    method: 'POST',
    headers: { 'X-Client-Id': appId, 'X-Client-Secret': secret, 'Content-Type': 'application/json' },
  });
  const d = await r.json();
  if (d.status !== 'SUCCESS') throw new Error(`Cashfree auth failed: ${d.message}`);
  cfToken       = d.data.token;
  cfTokenExpiry = Date.now() + 25 * 60 * 1000;
  return cfToken;
}

async function cfPost(endpoint, body) {
  const token = await getCFToken();
  const r = await fetch(`${CF_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function cfGet(endpoint) {
  const token = await getCFToken();
  const r = await fetch(`${CF_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return r.json();
}

// ── Helpers ───────────────────────────────────────────────────
const genTxId       = (p = 'TXN')  => `${p}${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const genTransferId = ()            => `INRT${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const COMMISSION = { transfer:0.005, recharge:0.02, bills:0.015, gold:0.01, crypto:0.01 };
async function earnCommission(amount, type) {
  const rate = COMMISSION[type] || 0;
  if (rate <= 0 || amount < 100) return 0;
  const commission = Math.floor(amount * rate);
  if (commission < 1 || !db) return 0;
  await db.collection('businessWallet').doc('earnings').set({
    balance: admin.firestore.FieldValue.increment(commission),
    [`${type}Earnings`]: admin.firestore.FieldValue.increment(commission),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return commission;
}

// ══════════════════════════════════════════════════════════════
//  HEALTH
// ══════════════════════════════════════════════════════════════
app.get('/',       (_, res) => res.json({ status: 'INRT API ✅' }));
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ══════════════════════════════════════════════════════════════
//  RAZORPAY
// ══════════════════════════════════════════════════════════════
app.post('/create-order', async (req, res) => {
  try {
    const { amount, userId } = req.body;
    if (!amount || amount < 10) return res.status(400).json({ error: 'Minimum ₹10' });
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), currency: 'INR',
      receipt: `rcpt_${Date.now()}`, notes: { userId: userId || '' },
    });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, amount } = req.body;
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (expected !== razorpay_signature) return res.status(400).json({ error: 'Invalid signature' });
    if (db && userId) {
      await db.collection('users').doc(userId).update({
        balance: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('transactions').add({
        uid: userId, type: 'credit', amount,
        note: 'Added via Razorpay', ref: razorpay_payment_id,
        status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    res.json({ success: true, message: `₹${amount} added!` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  OTP EMAIL via Resend
// ══════════════════════════════════════════════════════════════
app.post('/send-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });
    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [`${phone}@inrtwallet.app`],
        subject: `${otp} — Your INRT Wallet OTP`,
        html: `<div style="font-family:Arial;padding:32px;max-width:480px;margin:0 auto"><h2>INRT Wallet OTP</h2><div style="background:#f0f9ff;border:2px solid #00b9f1;border-radius:12px;padding:24px;text-align:center;margin:20px 0"><p style="color:#6b7280;margin:0 0 8px">Your OTP is</p><p style="color:#001a2e;font-size:40px;font-weight:900;letter-spacing:12px;margin:0">${otp}</p><p style="color:#9ca3af;font-size:12px;margin:8px 0 0">Valid for 5 minutes</p></div></div>`,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data.message || 'Email failed' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  RESET PASSWORD
// ══════════════════════════════════════════════════════════════
app.post('/reset-password', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone || !newPassword) return res.status(400).json({ error: 'phone and newPassword required' });
    if (newPassword.length < 6)  return res.status(400).json({ error: 'Min 6 characters' });
    if (!adminAuth)              return res.status(500).json({ error: 'Firebase Admin not connected' });
    const email = `${phone.replace(/\D/g,'')}@inrtwallet.app`;
    const user  = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(user.uid, { password: newPassword });
    res.json({ success: true, message: 'Password updated' });
  } catch (e) {
    if (e.code === 'auth/user-not-found') return res.status(404).json({ error: 'No account found' });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  KYC — Aadhaar OTP send
// ══════════════════════════════════════════════════════════════
app.post('/kyc/aadhaar-send-otp', async (req, res) => {
  try {
    const { aadhaarNumber, userId } = req.body;
    const clean = (aadhaarNumber || '').replace(/\s/g, '');
    if (clean.length !== 12) return res.status(400).json({ error: 'Invalid Aadhaar number' });
    const SUREPASS_TOKEN = process.env.SUREPASS_TOKEN;
    if (!SUREPASS_TOKEN) return res.status(500).json({ error: 'SUREPASS_TOKEN not set in Railway' });
    const response = await fetch('https://kyc-api.surepass.io/api/v1/aadhaar-v2/generate-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUREPASS_TOKEN}` },
      body: JSON.stringify({ id_number: clean }),
    });
    const data = await response.json();
    if (!response.ok || data.status_code !== 200)
      return res.status(400).json({ error: data.message || 'Failed to send OTP' });
    if (db && userId) {
      await db.collection('kycAttempts').add({
        userId, type: 'aadhaar_otp_sent', aadhaarLast4: clean.slice(-4),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    res.json({ success: true, ref_id: data.data?.ref_id || data.ref_id, message: 'OTP sent' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── KYC — Aadhaar OTP verify ──────────────────────────────────
app.post('/kyc/aadhaar-verify-otp', async (req, res) => {
  try {
    const { otp, ref_id, userId } = req.body;
    if (!otp || otp.length !== 6) return res.status(400).json({ error: 'Invalid OTP' });
    if (!ref_id)                   return res.status(400).json({ error: 'ref_id required' });
    const SUREPASS_TOKEN = process.env.SUREPASS_TOKEN;
    if (!SUREPASS_TOKEN) return res.status(500).json({ error: 'SUREPASS_TOKEN not set' });
    const response = await fetch('https://kyc-api.surepass.io/api/v1/aadhaar-v2/submit-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUREPASS_TOKEN}` },
      body: JSON.stringify({ otp, ref_id }),
    });
    const data = await response.json();
    if (!response.ok || data.status_code !== 200)
      return res.status(400).json({ error: data.message || 'OTP verification failed' });
    const ad = data.data || {};
    if (db && userId) {
      await db.collection('kyc').doc(userId).set({
        aadhaarVerified: true, aadhaarVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        aadhaarName: ad.full_name || '', aadhaarDob: ad.dob || '',
        aadhaarState: ad.state || '', aadhaarPincode: ad.zip_code || '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    res.json({ success: true, aadhaarData: { name: ad.full_name || '', dob: ad.dob || '', gender: ad.gender || '', state: ad.state || '', zip_code: ad.zip_code || '' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── KYC — PAN verify ─────────────────────────────────────────
app.post('/kyc/verify-pan', async (req, res) => {
  try {
    const { panNumber, userId } = req.body;
    const pan = (panNumber || '').toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return res.status(400).json({ error: 'Invalid PAN format' });
    const SUREPASS_TOKEN = process.env.SUREPASS_TOKEN;
    if (!SUREPASS_TOKEN) return res.status(500).json({ error: 'SUREPASS_TOKEN not set' });
    const response = await fetch('https://kyc-api.surepass.io/api/v1/pan/pan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUREPASS_TOKEN}` },
      body: JSON.stringify({ id_number: pan }),
    });
    const data = await response.json();
    if (!response.ok || data.status_code !== 200)
      return res.status(400).json({ error: data.message || 'PAN verification failed' });
    const pd = data.data || {};
    if (db && userId) {
      await db.collection('kyc').doc(userId).set({
        panVerified: true, panVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        panName: pd.full_name || '', panDob: pd.dob || '', panStatus: pd.pan_status || 'E',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    res.json({ success: true, panData: { name: pd.full_name || '', dob: pd.dob || '', status: pd.pan_status || 'E' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── KYC — Auto approve ────────────────────────────────────────
app.post('/kyc/auto-approve', async (req, res) => {
  try {
    const { userId, fullName, dob, gender, aadhaarLast4, aadhaarData, panData, pan, selfieBase64 } = req.body;
    if (!userId || !aadhaarData || !panData) return res.status(400).json({ approved: false, reason: 'Missing required data' });
    if (!db) return res.status(500).json({ approved: false, reason: 'Database not connected' });

    // Check duplicate Aadhaar
    const aSnap = await db.collection('kyc').where('aadhaarLast4','==',aadhaarLast4).where('aadhaarVerified','==',true).where('status','==','verified').limit(2).get();
    if (aSnap.docs.some(d => d.id !== userId)) return res.json({ approved: false, reason: 'This Aadhaar is already registered with another account.' });

    // Check duplicate PAN
    const panMasked = pan.slice(0,2) + 'XXX' + pan.slice(5);
    const pSnap = await db.collection('kyc').where('panMasked','==',panMasked).where('panVerified','==',true).where('status','==','verified').limit(2).get();
    if (pSnap.docs.some(d => d.id !== userId)) return res.json({ approved: false, reason: 'This PAN is already registered with another account.' });

    // Name match
    const n1 = (aadhaarData.name || '').toLowerCase().trim();
    const n2 = (panData.name     || '').toLowerCase().trim();
    if (n1 && n2) {
      const w1 = n1.split(' ').filter(w => w.length > 1);
      const w2 = n2.split(' ').filter(w => w.length > 1);
      const common = w1.filter(w => w2.includes(w));
      if (common.length < 1 && !n1.includes(n2) && !n2.includes(n1))
        return res.json({ approved: false, reason: `Name mismatch: Aadhaar shows "${aadhaarData.name}" but PAN shows "${panData.name}".` });
    }

    // Age check
    if (dob) {
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      if (age < 18) return res.json({ approved: false, reason: `Must be 18+. Your age: ${age}` });
    }

    // Upload selfie if provided
    let selfieUrl = '';
    if (selfieBase64) {
      try {
        const bucket = admin.storage().bucket();
        const file   = bucket.file(`kyc/${userId}/selfie.jpg`);
        const buffer = Buffer.from(selfieBase64, 'base64');
        await file.save(buffer, { metadata: { contentType: 'image/jpeg' } });
        const urls = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
        selfieUrl = urls[0];
      } catch (e) { console.warn('Selfie upload failed (non-critical):', e.message); }
    }

    const kycRef = genTxId('KYC');
    await db.collection('kyc').doc(userId).set({
      userId, kycRef, status: 'verified', autoApproved: true,
      aadhaarVerified: true, aadhaarLast4, aadhaarMasked: `XXXX-XXXX-${aadhaarLast4}`,
      aadhaarName: aadhaarData.name || '', aadhaarDob: aadhaarData.dob || '', aadhaarState: aadhaarData.state || '',
      panVerified: true, panMasked, panName: panData.name || '', panDob: panData.dob || '', panStatus: panData.status || 'E',
      selfie: selfieUrl, fullName: fullName?.trim() || '', dob, gender,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt:  admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection('users').doc(userId).update({
      kycStatus: 'verified', kycRef,
      kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      rewardPoints: admin.firestore.FieldValue.increment(500),
      dailyLimit: 100000,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ KYC auto-approved: ${userId} | ${kycRef}`);
    res.json({ approved: true, kycRef });
  } catch (e) { res.status(500).json({ approved: false, reason: e.message }); }
});

app.get('/kyc/status/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('kyc').doc(req.params.userId).get();
    if (!snap.exists) return res.json({ status: 'not_started' });
    const d = snap.data();
    res.json({ status: d.status, kycRef: d.kycRef, aadhaarVerified: d.aadhaarVerified || false, panVerified: d.panVerified || false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  WALLET — Transfer
// ══════════════════════════════════════════════════════════════
app.post('/payment/transfer', async (req, res) => {
  try {
    const { fromUid, toPhone, toUid: directToUid, amount, note } = req.body;
    if (!fromUid || !amount || amount < 1) return res.status(400).json({ error: 'fromUid and amount required' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    const sSnap = await db.collection('users').doc(fromUid).get();
    if (!sSnap.exists) return res.status(404).json({ error: 'Sender not found' });
    const sender = sSnap.data();
    if ((sender.balance || 0) < amount) return res.status(402).json({ error: `Insufficient balance` });
    const today = new Date().toISOString().split('T')[0];
    const lk = `dailySent_${today}`;
    const dl = sender.kycStatus === 'verified' ? 100000 : 10000;
    if ((sender[lk] || 0) + amount > dl) return res.status(402).json({ error: `Daily limit reached` });
    let toUid = directToUid;
    if (!toUid && toPhone) {
      const pSnap = await db.collection('phoneIndex').doc(toPhone.replace(/\D/g,'')).get();
      if (!pSnap.exists) return res.status(404).json({ error: 'No INRT account for this number' });
      toUid = pSnap.data().uid;
    }
    if (!toUid || toUid === fromUid) return res.status(400).json({ error: 'Invalid receiver' });
    const ref = genTxId('TXN'), pts = Math.floor(amount / 10);
    const commission = await earnCommission(amount, 'transfer');
    const batch = db.batch();
    batch.update(db.collection('users').doc(fromUid), { balance: admin.firestore.FieldValue.increment(-amount), totalSent: admin.firestore.FieldValue.increment(amount), [lk]: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(db.collection('users').doc(toUid),   { balance: admin.firestore.FieldValue.increment(amount),  totalReceived: admin.firestore.FieldValue.increment(amount), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref),        { uid: fromUid, toUid, type: 'debit',  amount, note: note || `Transfer`, cat: 'transfer', ref, status: 'success', commission, rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref + '_CR'),{ uid: toUid, fromUid, type: 'credit', amount, note: `Received from ${sender.name || 'INRT User'}`, cat: 'transfer', ref: ref + '_CR', status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, ref, amount, commission, rewardPoints: pts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── UPI QR ────────────────────────────────────────────────────
app.post('/payment/generate-upi-qr', async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    if (!userId || !db) return res.status(400).json({ error: 'userId required' });
    const uSnap = await db.collection('users').doc(userId).get();
    if (!uSnap.exists) return res.status(404).json({ error: 'User not found' });
    const user = uSnap.data();
    const upiId = user.upiId || `${user.phone}@inrt`;
    const txnId = genTxId('UPI');
    const upiString  = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(user.name || 'INRT Wallet')}&tr=${txnId}${amount?`&am=${amount}`:''}${note?`&tn=${encodeURIComponent(note)}`:''}}&cu=INR`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiString)}`;
    await db.collection('pendingPayments').doc(txnId).set({ userId, upiId, amount: amount || null, note: note || '', txnId, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: Date.now() + 10 * 60 * 1000 });
    res.json({ success: true, txnId, upiId, upiString, qrImageUrl, amount: amount || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/payment/check-upi/:txnId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('pendingPayments').doc(req.params.txnId).get();
    if (!snap.exists) return res.json({ status: 'not_found' });
    const d = snap.data();
    if (Date.now() > d.expiresAt) { await snap.ref.update({ status: 'expired' }); return res.json({ status: 'expired' }); }
    res.json({ status: d.status, amount: d.amount, txnId: req.params.txnId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment/upi-webhook', async (req, res) => {
  try {
    const { txnId, amount, payerVpa, status } = req.body;
    if (!txnId || !amount || status !== 'SUCCESS' || !db) return res.json({ received: true });
    const pSnap = await db.collection('pendingPayments').doc(txnId).get();
    if (!pSnap.exists || pSnap.data().status === 'success') return res.json({ received: true });
    const pending = pSnap.data();
    const ref = genTxId('UPI'), pts = Math.floor(amount / 10);
    const batch = db.batch();
    batch.update(db.collection('users').doc(pending.userId), { balance: admin.firestore.FieldValue.increment(parseFloat(amount)), totalReceived: admin.firestore.FieldValue.increment(parseFloat(amount)), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref), { uid: pending.userId, type: 'credit', amount: parseFloat(amount), note: `UPI from ${payerVpa || 'UPI'}`, cat: 'add_money', ref, status: 'success', payerVpa, upiTxnId: txnId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(pSnap.ref, { status: 'success', paidAt: admin.firestore.FieldValue.serverTimestamp(), ref });
    await batch.commit();
    res.json({ received: true, credited: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment/admin-credit', async (req, res) => {
  try {
    const { userId, amount, note, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!userId || !amount || !db) return res.status(400).json({ error: 'userId and amount required' });
    const ref = genTxId('ADM');
    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), { balance: admin.firestore.FieldValue.increment(parseFloat(amount)), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref), { uid: userId, type: 'credit', amount: parseFloat(amount), note: note || 'Admin credit', cat: 'add_money', ref, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, ref, amount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment/bill', async (req, res) => {
  try {
    const { userId, amount, category, provider, accountNo } = req.body;
    if (!userId || !amount || !db) return res.status(400).json({ error: 'Missing fields' });
    const uSnap = await db.collection('users').doc(userId).get();
    if (!uSnap.exists || (uSnap.data().balance || 0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const ref = genTxId('BILL'), cashback = Math.floor(amount * 0.02), pts = Math.floor(amount / 10);
    const commission = await earnCommission(amount, 'bills');
    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), { balance: admin.firestore.FieldValue.increment(-amount + cashback), cashback: admin.firestore.FieldValue.increment(cashback), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref), { uid: userId, type: 'debit', amount, note: `${category} — ${provider || ''}`, cat: 'bills', ref, status: 'success', accountNo, cashback, commission, rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, ref, amount, cashback, rewardPoints: pts, commission });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment/recharge', async (req, res) => {
  try {
    const { userId, amount, mobile, operator, rechargeType } = req.body;
    if (!userId || !amount || !db) return res.status(400).json({ error: 'Missing fields' });
    const uSnap = await db.collection('users').doc(userId).get();
    if (!uSnap.exists || (uSnap.data().balance || 0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const ref = genTxId('RCH'), pts = Math.floor(amount / 10);
    const commission = await earnCommission(amount, 'recharge');
    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), { balance: admin.firestore.FieldValue.increment(-amount), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref), { uid: userId, type: 'debit', amount, note: `${operator || 'Mobile'} ${rechargeType || 'Prepaid'} — ${mobile}`, cat: 'recharge', ref, status: 'success', mobile, operator, commission, rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, ref, amount, rewardPoints: pts, commission });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment/refund', async (req, res) => {
  try {
    const { txId, reason, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY || !db) return res.status(403).json({ error: 'Unauthorized' });
    const tSnap = await db.collection('transactions').doc(txId).get();
    if (!tSnap.exists) return res.status(404).json({ error: 'Transaction not found' });
    if (tSnap.data().status === 'refunded') return res.status(400).json({ error: 'Already refunded' });
    const tx = tSnap.data(), refundRef = genTxId('REF');
    const batch = db.batch();
    batch.update(db.collection('users').doc(tx.uid), { balance: admin.firestore.FieldValue.increment(tx.amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(db.collection('transactions').doc(txId), { status: 'refunded', refundRef });
    batch.set(db.collection('transactions').doc(refundRef), { uid: tx.uid, type: 'credit', amount: tx.amount, note: `Refund: ${reason || 'Customer request'}`, cat: 'refund', ref: refundRef, status: 'success', originalTxId: txId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, refundRef, amount: tx.amount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/payment/balance/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ balance: 0 });
    const snap = await db.collection('users').doc(req.params.userId).get();
    res.json({ balance: snap.exists ? snap.data().balance || 0 : 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/payment/earnings', async (req, res) => {
  try {
    if (req.query.adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!db) return res.json({ earnings: {} });
    const snap = await db.collection('businessWallet').doc('earnings').get();
    res.json({ earnings: snap.exists ? snap.data() : { balance: 0 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  CASHFREE PAYOUTS
// ══════════════════════════════════════════════════════════════
app.post('/payout/validate-upi', async (req, res) => {
  try {
    const { upiId } = req.body;
    if (!upiId) return res.status(400).json({ error: 'UPI ID required' });

    // In sandbox/test mode, skip real validation
    if (process.env.NODE_ENV !== 'production') {
      return res.json({
        valid:    true,
        name:     'Test Account',
        upiId,
        bankName: 'Test Bank',
      });
    }

    const d = await cfPost('/payout/v1/validation/upiDetails', { vpa: upiId });
    if (d.status !== 'SUCCESS')
      return res.status(400).json({ error: 'Invalid UPI ID' });

    res.json({
      valid:    true,
      name:     d.data?.name     || 'UPI Account',
      upiId:    d.data?.vpa      || upiId,
      bankName: d.data?.bankName || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/payout/send-upi', async (req, res) => {
  try {
    const { fromUid, toUpiId, amount, note, name } = req.body;
    if (!fromUid || !toUpiId || !amount || !db) return res.status(400).json({ error: 'Missing fields' });
    const sSnap = await db.collection('users').doc(fromUid).get();
    if (!sSnap.exists) return res.status(404).json({ error: 'Sender not found' });
    const sender = sSnap.data();
    if ((sender.balance || 0) < amount) return res.status(402).json({ error: `Insufficient balance` });
    const today = new Date().toISOString().split('T')[0];
    const lk = `dailySent_${today}`;
    const dl = sender.kycStatus === 'verified' ? 100000 : 10000;
    if ((sender[lk] || 0) + amount > dl) return res.status(402).json({ error: 'Daily limit reached' });
    const transferId = genTransferId();
    await db.collection('users').doc(fromUid).update({ balance: admin.firestore.FieldValue.increment(-amount), [lk]: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const cfResponse = await cfPost('/payout/v1/directTransfer', { amount, transferId, transferMode: 'upi', remarks: note || `INRT from ${sender.name || sender.phone}`, beneDetails: { beneId: `BENE_${toUpiId.replace(/[@.]/g,'_')}`, name: name || 'UPI Recipient', vpa: toUpiId } });
    if (cfResponse.status !== 'SUCCESS') {
      await db.collection('users').doc(fromUid).update({ balance: admin.firestore.FieldValue.increment(amount), [lk]: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw new Error(cfResponse.message || 'Transfer failed');
    }
    const pts = Math.floor(amount / 10);
    await db.collection('transactions').add({ uid: fromUid, type: 'debit', amount, note: note || `Sent to ${toUpiId}`, cat: 'transfer', ref: transferId, toUpiId, status: 'success', method: 'cashfree_upi', rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(fromUid).update({ rewardPoints: admin.firestore.FieldValue.increment(pts), totalSent: admin.firestore.FieldValue.increment(amount) });
    res.json({ success: true, transferId, amount, toUpiId, rewardPoints: pts, message: `₹${amount.toLocaleString('en-IN')} sent to ${toUpiId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payout/send-bank', async (req, res) => {
  try {
    const { fromUid, accountNo, ifsc, accountName, amount, note } = req.body;
    if (!fromUid || !accountNo || !ifsc || !accountName || !amount || !db) return res.status(400).json({ error: 'Missing fields' });
    const sSnap = await db.collection('users').doc(fromUid).get();
    if (!sSnap.exists || (sSnap.data().balance || 0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const transferId = genTransferId();
    await db.collection('users').doc(fromUid).update({ balance: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const cfResponse = await cfPost('/payout/v1/directTransfer', { amount, transferId, transferMode: 'imps', remarks: note || 'INRT Bank Transfer', beneDetails: { beneId: `BENE_${accountNo}`, name: accountName, bankAccount: accountNo, ifsc: ifsc.toUpperCase() } });
    if (cfResponse.status !== 'SUCCESS') {
      await db.collection('users').doc(fromUid).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw new Error(cfResponse.message || 'Bank transfer failed');
    }
    await db.collection('transactions').add({ uid: fromUid, type: 'debit', amount, note: note || `Bank transfer to ${accountName}`, cat: 'transfer', ref: transferId, accountNo: accountNo.slice(-4).padStart(accountNo.length,'X'), ifsc, accountName, status: 'success', method: 'cashfree_imps', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(fromUid).update({ rewardPoints: admin.firestore.FieldValue.increment(Math.floor(amount/10)), totalSent: admin.firestore.FieldValue.increment(amount) });
    res.json({ success: true, transferId, amount, accountName, message: `₹${amount.toLocaleString('en-IN')} sent to ${accountName}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/payout/status/:transferId', async (req, res) => {
  try {
    const d = await cfGet(`/payout/v1/getTransferStatus?transferId=${req.params.transferId}`);
    res.json({ transferId: req.params.transferId, status: d.data?.transfer?.status || 'UNKNOWN', amount: d.data?.transfer?.amount, utr: d.data?.transfer?.utr || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payout/webhook', async (req, res) => {
  try {
    const { transferId, status, utr, reason } = req.body;
    if (!db || !transferId) return res.json({ received: true });
    const snap = await db.collection('transactions').where('ref','==',transferId).limit(1).get();
    if (snap.empty) return res.json({ received: true });
    const txDoc = snap.docs[0], tx = txDoc.data();
    if (status === 'SUCCESS') {
      await txDoc.ref.update({ status: 'success', utr, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else if (status === 'FAILED' || status === 'REVERSED') {
      await db.collection('users').doc(tx.uid).update({ balance: admin.firestore.FieldValue.increment(tx.amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await txDoc.ref.update({ status: 'failed', failReason: reason || 'Transfer failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('transactions').add({ uid: tx.uid, type: 'credit', amount: tx.amount, note: `Refund: Transfer failed`, cat: 'refund', ref: `REF_${transferId}`, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    res.json({ received: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payout/withdraw', async (req, res) => {
  try {
    const { userId, amount, upiId } = req.body;
    if (!userId || !amount || !upiId || !db) return res.status(400).json({ error: 'Missing fields' });
    if (amount < 100) return res.status(400).json({ error: 'Minimum ₹100' });
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    const user = snap.data();
    if (user.kycStatus !== 'verified') return res.status(403).json({ error: 'Complete KYC to withdraw' });
    if ((user.balance || 0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const transferId = genTransferId();
    await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const cfResponse = await cfPost('/payout/v1/directTransfer', { amount, transferId, transferMode: 'upi', remarks: 'INRT Wallet Withdrawal', beneDetails: { beneId: `USER_${userId}`, name: user.name || 'INRT User', vpa: upiId } });
    if (cfResponse.status !== 'SUCCESS') {
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw new Error(cfResponse.message || 'Withdrawal failed');
    }
    await db.collection('transactions').add({ uid: userId, type: 'debit', amount, note: `Withdrawal to ${upiId}`, cat: 'withdrawal', ref: transferId, toUpiId: upiId, status: 'success', method: 'cashfree_upi', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, transferId, amount, message: `₹${amount.toLocaleString('en-IN')} withdrawn to ${upiId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 INRT API running on port ${PORT}`);
  console.log(`   Razorpay  : ${process.env.RAZORPAY_KEY_ID    ? '✅' : '❌ Missing'}`);
  console.log(`   Resend    : ${process.env.RESEND_API_KEY      ? '✅' : '❌ Missing'}`);
  console.log(`   Firebase  : ${adminAuth                        ? '✅' : '❌ Missing'}`);
  console.log(`   Surepass  : ${process.env.SUREPASS_TOKEN      ? '✅' : '❌ Missing'}`);
  console.log(`   Cashfree  : ${process.env.CASHFREE_APP_ID     ? '✅' : '❌ Missing'}`);
  console.log(`   Admin Key : ${process.env.ADMIN_KEY           ? '✅' : '❌ Missing'}\n`);
});
