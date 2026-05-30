/**
 * INRT WALLET — server.js FINAL CLEAN
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
  if (!appId || !secret) throw new Error('CASHFREE_APP_ID and CASHFREE_SECRET_KEY not set');
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
const genTxId       = (p = 'TXN') => `${p}${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const genTransferId = ()           => `INRT${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const COMMISSION = { transfer:0.005, recharge:0.02, bills:0.015, gold:0.01, crypto:0.01 };

async function earnCommission(amount, type) {
  const rate = COMMISSION[type] || 0;
  if (rate <= 0 || amount < 100 || !db) return 0;
  const commission = Math.floor(amount * rate);
  if (commission < 1) return 0;
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
        balance:   admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('transactions').add({
        uid: userId, type: 'credit', amount,
        note: 'Added via Razorpay', ref: razorpay_payment_id,
        status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  OTP EMAIL
// ══════════════════════════════════════════════════════════════
app.post('/send-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY)  return res.status(500).json({ error: 'RESEND_API_KEY not set' });
    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: [`${phone}@inrtwallet.app`],
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
    if (newPassword.length < 6) return res.status(400).json({ error: 'Min 6 characters' });
    if (!adminAuth)             return res.status(500).json({ error: 'Firebase Admin not connected' });
    const email = `${phone.replace(/\D/g,'')}@inrtwallet.app`;
    const user  = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(user.uid, { password: newPassword });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'auth/user-not-found') return res.status(404).json({ error: 'No account found' });
    res.status(500).json({ error: e.message });
  }
});


// ══════════════════════════════════════════════════════════════
//  WALLET TRANSFER
// ══════════════════════════════════════════════════════════════
app.post('/payment/transfer', async (req, res) => {
  try {
    const { fromUid, toPhone, toUid: directToUid, amount, note } = req.body;
    if (!fromUid || !amount || amount < 1) return res.status(400).json({ error: 'fromUid and amount required' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    const sSnap = await db.collection('users').doc(fromUid).get();
    if (!sSnap.exists) return res.status(404).json({ error: 'Sender not found' });
    const sender = sSnap.data();
    if ((sender.balance || 0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const today = new Date().toISOString().split('T')[0];
    const lk    = `dailySent_${today}`;
    const dl    = sender.kycStatus === 'verified' ? 100000 : 10000;
    if ((sender[lk] || 0) + amount > dl) return res.status(402).json({ error: 'Daily limit reached' });
    let toUid = directToUid;
    if (!toUid && toPhone) {
      const pSnap = await db.collection('phoneIndex').doc(toPhone.replace(/\D/g,'')).get();
      if (!pSnap.exists) return res.status(404).json({ error: 'No INRT account for this number' });
      toUid = pSnap.data().uid;
    }
    if (!toUid || toUid === fromUid) return res.status(400).json({ error: 'Invalid receiver' });
    const ref        = genTxId('TXN');
    const pts        = Math.floor(amount / 10);
    const commission = await earnCommission(amount, 'transfer');
    const batch      = db.batch();
    batch.update(db.collection('users').doc(fromUid), { balance: admin.firestore.FieldValue.increment(-amount), totalSent: admin.firestore.FieldValue.increment(amount), [lk]: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(db.collection('users').doc(toUid),   { balance: admin.firestore.FieldValue.increment(amount), totalReceived: admin.firestore.FieldValue.increment(amount), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref),         { uid: fromUid, toUid, type: 'debit',  amount, note: note || 'Transfer', cat: 'transfer', ref, status: 'success', commission, rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref + '_CR'), { uid: toUid, fromUid, type: 'credit', amount, note: `Received from ${sender.name || 'INRT User'}`, cat: 'transfer', ref: ref + '_CR', status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, ref, amount, commission, rewardPoints: pts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  UPI QR
// ══════════════════════════════════════════════════════════════
app.post('/payment/generate-upi-qr', async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    if (!userId || !db) return res.status(400).json({ error: 'userId required' });
    const uSnap = await db.collection('users').doc(userId).get();
    if (!uSnap.exists) return res.status(404).json({ error: 'User not found' });
    const user       = uSnap.data();
    const upiId      = user.upiId || `${user.phone}@inrt`;
    const txnId      = genTxId('UPI');
    const upiString  = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(user.name || 'INRT Wallet')}&tr=${txnId}${amount ? `&am=${amount}` : ''}${note ? `&tn=${encodeURIComponent(note)}` : ''}&cu=INR`;
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
    const ref     = genTxId('UPI');
    const pts     = Math.floor(amount / 10);
    const batch   = db.batch();
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
    if (!userId || !amount || !db)          return res.status(400).json({ error: 'userId and amount required' });
    const ref   = genTxId('ADM');
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
    const ref        = genTxId('BILL');
    const cashback   = Math.floor(amount * 0.02);
    const pts        = Math.floor(amount / 10);
    const commission = await earnCommission(amount, 'bills');
    const batch      = db.batch();
    batch.update(db.collection('users').doc(userId), { balance: admin.firestore.FieldValue.increment(-amount + cashback), cashback: admin.firestore.FieldValue.increment(cashback), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref), { uid: userId, type: 'debit', amount, note: `${category} — ${provider || ''}`, cat: 'bills', ref, status: 'success', accountNo, cashback, commission, rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, ref, amount, cashback, rewardPoints: pts, commission });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment/refund', async (req, res) => {
  try {
    const { txId, reason, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY || !db) return res.status(403).json({ error: 'Unauthorized' });
    const tSnap = await db.collection('transactions').doc(txId).get();
    if (!tSnap.exists) return res.status(404).json({ error: 'Transaction not found' });
    if (tSnap.data().status === 'refunded') return res.status(400).json({ error: 'Already refunded' });
    const tx        = tSnap.data();
    const refundRef = genTxId('REF');
    const batch     = db.batch();
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
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ valid: true, name: 'Test Account', upiId, bankName: 'Test Bank' });
    }
    const d = await cfPost('/payout/v1/validation/upiDetails', { vpa: upiId });
    if (d.status !== 'SUCCESS') return res.status(400).json({ error: 'Invalid UPI ID' });
    res.json({ valid: true, name: d.data?.name || 'UPI Account', upiId: d.data?.vpa || upiId, bankName: d.data?.bankName || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payout/send-upi', async (req, res) => {
  try {
    const { fromUid, toUpiId, amount, note, name } = req.body;
    if (!fromUid || !toUpiId || !amount || !db) return res.status(400).json({ error: 'Missing fields' });
    const sSnap = await db.collection('users').doc(fromUid).get();
    if (!sSnap.exists) return res.status(404).json({ error: 'Sender not found' });
    const sender = sSnap.data();
    if ((sender.balance || 0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const today      = new Date().toISOString().split('T')[0];
    const lk         = `dailySent_${today}`;
    const dl         = sender.kycStatus === 'verified' ? 100000 : 10000;
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
    res.json({ success: true, transferId, amount, toUpiId, rewardPoints: pts });
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
    res.json({ success: true, transferId, amount, accountName });
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
      await db.collection('transactions').add({ uid: tx.uid, type: 'credit', amount: tx.amount, note: 'Refund: Transfer failed', cat: 'refund', ref: `REF_${transferId}`, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
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
    if ((user.balance || 0) < amount)  return res.status(402).json({ error: 'Insufficient balance' });
    const transferId = genTransferId();
    await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const cfResponse = await cfPost('/payout/v1/directTransfer', { amount, transferId, transferMode: 'upi', remarks: 'INRT Wallet Withdrawal', beneDetails: { beneId: `USER_${userId}`, name: user.name || 'INRT User', vpa: upiId } });
    if (cfResponse.status !== 'SUCCESS') {
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw new Error(cfResponse.message || 'Withdrawal failed');
    }
    await db.collection('transactions').add({ uid: userId, type: 'debit', amount, note: `Withdrawal to ${upiId}`, cat: 'withdrawal', ref: transferId, toUpiId: upiId, status: 'success', method: 'cashfree_upi', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, transferId, amount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  EZYTM RECHARGE
//  Correct API format based on Ezytm documentation:
//  GET https://newapi.ezytm.in/Service/Recharge2?ApiToken=xxx&MobileNo=xxx&Amount=xxx&OpId=xxx&RefTxnId=xxx
//  STATUS: 1=Success, 3=Failed, 2=Pending
// ══════════════════════════════════════════════════════════════

// ── Operator detection (auto-detect from mobile number) ──────
// Ezytm does not have a dedicated operator API
// We detect operator from mobile number prefix
app.get('/recharge/operator/:mobile', async (req, res) => {
  try {
    const mobile = req.params.mobile.replace(/\D/g, '');
    if (mobile.length !== 10) return res.status(400).json({ error: 'Invalid mobile number' });

    // Detect operator from number prefix (works offline, no API needed)
    const prefix4 = mobile.slice(0, 4);
    const prefix3 = mobile.slice(0, 3);

    const JIO_PREFIXES    = ['7388','7389','7390','7391','7392','7393','7394','7395','7396','7397','7398','7399','8306','8307','8308','8309','8310','8369','8511','8512','8513','8514','8515','8516','8517','8518','8519','8520','8521','8522','8523','8524','9773','9774','9775','9776','9777','9778','9779','9780','9781','9782','9783','9784','9785','9786','9787','9788','9789','9790','9791','9792','9793','9794','9795','9796','9797','9798','9799'];
    const AIRTEL_PREFIXES = ['7290','7291','7292','7293','7294','7295','7296','7297','7298','7299','8130','8131','8132','8133','8134','8376','8527','8800','8801','8802','8803','8804','9711','9810','9811','9818','9891','9899','9971'];
    const VI_PREFIXES     = ['7016','7041','7042','7043','7044','7045','7046','7047','7048','7049','7208','7209','8160','8161','8758','9408','9409','9898','9974'];
    const BSNL_PREFIXES   = ['9436','9441','9442','9443','9444','9445','9446','9447','9448','9449','9863','9864','9865','9866','9867','9868','9869','9870'];

    let operator = 'JIO'; // default
    if (AIRTEL_PREFIXES.some(p => mobile.startsWith(p))) operator = 'AIRTEL';
    else if (VI_PREFIXES.some(p => mobile.startsWith(p)))     operator = 'VI';
    else if (BSNL_PREFIXES.some(p => mobile.startsWith(p)))   operator = 'BSNL';
    else if (JIO_PREFIXES.some(p => mobile.startsWith(p)))    operator = 'JIO';
    // Numbers starting with 6 are mostly Jio
    else if (mobile.startsWith('6'))  operator = 'JIO';
    // Numbers starting with 7,8,9 default logic
    else if (mobile.startsWith('70') || mobile.startsWith('71') || mobile.startsWith('72')) operator = 'AIRTEL';
    else if (mobile.startsWith('73') || mobile.startsWith('74') || mobile.startsWith('75')) operator = 'JIO';
    else if (mobile.startsWith('76') || mobile.startsWith('77') || mobile.startsWith('78')) operator = 'VI';
    else if (mobile.startsWith('79')) operator = 'BSNL';
    else if (mobile.startsWith('81') || mobile.startsWith('82') || mobile.startsWith('83')) operator = 'AIRTEL';
    else if (mobile.startsWith('84') || mobile.startsWith('85') || mobile.startsWith('86')) operator = 'JIO';
    else if (mobile.startsWith('87') || mobile.startsWith('88') || mobile.startsWith('89')) operator = 'VI';
    else if (mobile.startsWith('90') || mobile.startsWith('91') || mobile.startsWith('92')) operator = 'AIRTEL';
    else if (mobile.startsWith('93') || mobile.startsWith('94') || mobile.startsWith('95')) operator = 'BSNL';
    else if (mobile.startsWith('96') || mobile.startsWith('97') || mobile.startsWith('98') || mobile.startsWith('99')) operator = 'JIO';

    res.json({ mobile, operator, circle: 'UNKNOWN' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get plans (hardcoded fallback + live from Ezytm) ─────────
app.get('/recharge/plans', async (req, res) => {
  try {
    const { operator } = req.query;
    const token  = process.env.EZYTM_API_TOKEN;
    const member = process.env.EZYTM_MEMBER_ID;

    // Try Ezytm API for live plans
    if (token && member) {
      try {
        const url = new URL('https://newapi.ezytm.in/Service/BrowsePlan');
        url.searchParams.append('ApiToken',  token);
        url.searchParams.append('MemberId',  member);
        url.searchParams.append('OpId',      operator || 'JIO');
        const r    = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
        const text = await r.text();
        const data = JSON.parse(text);
        if (data && (data.DATA || data.data || Array.isArray(data))) {
          return res.json({ success: true, plans: data.DATA || data.data || data, source: 'live' });
        }
      } catch (e) {
        console.warn('Ezytm plans API failed, using fallback:', e.message);
      }
    }

    // Fallback plans (always work)
    const fallback = [
      { id:'p1', amount:179,  validity:'28 days',  data:'2GB/day',  calls:'Unlimited', sms:'100/day', popular:false },
      { id:'p2', amount:239,  validity:'28 days',  data:'2GB/day',  calls:'Unlimited', sms:'100/day', popular:true  },
      { id:'p3', amount:299,  validity:'28 days',  data:'3GB/day',  calls:'Unlimited', sms:'100/day', popular:false },
      { id:'p4', amount:479,  validity:'56 days',  data:'2.5GB/day',calls:'Unlimited', sms:'100/day', popular:false },
      { id:'p5', amount:599,  validity:'84 days',  data:'2GB/day',  calls:'Unlimited', sms:'100/day', popular:true  },
      { id:'p6', amount:899,  validity:'84 days',  data:'3GB/day',  calls:'Unlimited', sms:'100/day', popular:false },
      { id:'p7', amount:1199, validity:'365 days', data:'2.5GB/day',calls:'Unlimited', sms:'100/day', popular:false },
      { id:'p8', amount:2999, validity:'365 days', data:'3GB/day',  calls:'Unlimited', sms:'100/day', popular:false },
    ];
    res.json({ success: true, plans: fallback, source: 'fallback' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Do Recharge ───────────────────────────────────────────────
app.post('/recharge/do', async (req, res) => {
  try {
    const { userId, mobile, operator, amount, rechargeType } = req.body;

    if (!userId || !mobile || !operator || !amount)
      return res.status(400).json({ error: 'userId, mobile, operator, amount required' });

    const token  = process.env.EZYTM_API_TOKEN;
    const member = process.env.EZYTM_MEMBER_ID;

    if (!token || !member)
      return res.status(500).json({ error: 'EZYTM_API_TOKEN and EZYTM_MEMBER_ID not set in Railway' });

    if (!db)
      return res.status(500).json({ error: 'Database not connected' });

    // Check balance
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    const user    = userSnap.data();
    const balance = user.balance || 0;
    if (balance < amount)
      return res.status(402).json({ error: `Insufficient balance. Available: ₹${balance.toLocaleString('en-IN')}` });

    const orderId = genTxId('RCH');
    const pts     = Math.floor(amount / 10);

    // Deduct balance first
    await db.collection('users').doc(userId).update({
      balance:   admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Call Ezytm Recharge API
    // Correct URL format: GET https://newapi.ezytm.in/Service/Recharge2?ApiToken=xxx&MobileNo=xxx&Amount=xxx&OpId=xxx&RefTxnId=xxx
    let ezytmResponse;
    try {
      const url = new URL('https://newapi.ezytm.in/Service/Recharge2');
      url.searchParams.append('ApiToken', token);
      url.searchParams.append('MobileNo', mobile.replace(/\D/g, ''));
      url.searchParams.append('Amount',   amount.toString());
      url.searchParams.append('OpId',     operator);
      url.searchParams.append('RefTxnId', orderId);

      console.log('Ezytm URL:', url.toString().replace(token, 'TOKEN_HIDDEN'));

      const r    = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
      const text = await r.text();
      console.log('Ezytm raw response:', text);

      try {
        ezytmResponse = JSON.parse(text);
      } catch {
        // Non-JSON response — refund and return error
        await db.collection('users').doc(userId).update({
          balance:   admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.status(500).json({ error: 'Invalid response from Ezytm. Balance refunded.', raw: text.slice(0, 200) });
      }
    } catch (fetchErr) {
      // Network error — refund
      await db.collection('users').doc(userId).update({
        balance:   admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.status(500).json({ error: 'Recharge service unreachable. Balance refunded.' });
    }

    console.log('Ezytm parsed response:', ezytmResponse);

    // Parse response
    // STATUS: 1=Success, 2=Pending, 3=Failed
    const status      = String(ezytmResponse.STATUS || '').trim();
    const txnId       = ezytmResponse.OPTXNID  || ezytmResponse.TXNNO || orderId;
    const operatorRef = ezytmResponse.TXNNO    || '';
    const message     = ezytmResponse.MESSAGE  || '';

    // STATUS 3 = Failed
    if (status === '3') {
      await db.collection('users').doc(userId).update({
        balance:   admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('transactions').add({
        uid: userId, type: 'debit', amount,
        note: `Failed recharge: ${operator} ${mobile}`,
        cat: 'recharge', ref: orderId, status: 'failed',
        mobile, operator, ezytmTxnId: txnId, message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.status(400).json({ success: false, error: message || 'Recharge failed. Balance refunded.' });
    }

    // STATUS 1 = Success, STATUS 2 = Pending
    const txStatus = status === '1' ? 'success' : 'pending';

    await db.collection('transactions').add({
      uid: userId, type: 'debit', amount,
      note: `${operator} ${rechargeType === 'D' ? 'DTH' : rechargeType === 'T' ? 'Postpaid' : 'Prepaid'} — ${mobile}`,
      cat: 'recharge', ref: orderId, status: txStatus,
      mobile, operator, ezytmTxnId: txnId, operatorRef,
      rewardPoints: status === '1' ? pts : 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (status === '1') {
      await db.collection('users').doc(userId).update({
        rewardPoints: admin.firestore.FieldValue.increment(pts),
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.json({
      success:      status === '1',
      pending:      status === '2',
      orderId,
      txnId,
      operatorRef,
      amount,
      mobile,
      operator,
      status:       txStatus,
      rewardPoints: status === '1' ? pts : 0,
      message:      status === '1'
        ? `₹${amount} recharge successful for ${mobile}`
        : status === '2'
        ? 'Recharge is processing. Please wait.'
        : message,
    });

  } catch (e) {
    console.error('/recharge/do:', e);
    res.status(500).json({ error: e.message || 'Recharge failed' });
  }
});

// ── Check Recharge Status ─────────────────────────────────────
app.get('/recharge/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const token = process.env.EZYTM_API_TOKEN;

    // Correct status URL: GET https://newapi.ezytm.in/service/statuscheck?ApiToken=xxx&RefTxnId=xxx
    const url = new URL('https://newapi.ezytm.in/service/statuscheck');
    url.searchParams.append('ApiToken',  token);
    url.searchParams.append('RefTxnId',  orderId);

    const r    = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(500).json({ error: 'Invalid response from Ezytm', raw: text.slice(0,200) }); }

    const status = String(data.STATUS || '').trim();
    const txnId  = data.OPTXNID || data.TXNNO || '';
    const opId   = data.OPTXNID || '';

    // STATUS 1 = Success — add reward points
    if (status === '1' && db) {
      const snap = await db.collection('transactions').where('ref','==',orderId).limit(1).get();
      if (!snap.empty && snap.docs[0].data().status !== 'success') {
        const tx = snap.docs[0].data();
        await snap.docs[0].ref.update({ status: 'success', ezytmTxnId: txnId, operatorRef: opId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection('users').doc(tx.uid).update({ rewardPoints: admin.firestore.FieldValue.increment(Math.floor(tx.amount/10)), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }

    // STATUS 3 = Failed — refund
    if (status === '3' && db) {
      const snap = await db.collection('transactions').where('ref','==',orderId).limit(1).get();
      if (!snap.empty && snap.docs[0].data().status === 'pending') {
        const tx = snap.docs[0].data();
        await db.collection('users').doc(tx.uid).update({ balance: admin.firestore.FieldValue.increment(tx.amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await snap.docs[0].ref.update({ status: 'failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection('transactions').add({ uid: tx.uid, type: 'credit', amount: tx.amount, note: `Refund: Recharge failed for ${tx.mobile}`, cat: 'refund', ref: `REF_${orderId}`, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }

    res.json({
      orderId,
      status:      status === '1' ? 'success' : status === '3' ? 'failed' : 'pending',
      txnId,
      operatorRef: opId,
      message:     data.MESSAGE || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * INRT WALLET — INSTAMOJO PAYMENT ROUTES
 * Paste into server.js BEFORE app.listen(...)
 *
 * Instamojo collects money from users — NO POPUP on your app.
 * It opens Instamojo's hosted payment page in a new tab/webview.
 * User pays → Instamojo calls your webhook → wallet credited.
 *
 * Railway env vars needed:
 *   INSTAMOJO_API_KEY    = your API key from instamojo.com
 *   INSTAMOJO_AUTH_TOKEN = your auth token from instamojo.com
 *   INSTAMOJO_SALT       = your salt from instamojo.com (for webhook verification)
 *   APP_URL              = https://your-vercel-url.vercel.app (your frontend URL)
 *
 * Instamojo modes:
 *   Test:       https://test.instamojo.com/api/1.1  (use test credentials)
 *   Production: https://www.instamojo.com/api/1.1   (use live credentials)
 */

const INSTAMOJO_BASE = process.env.NODE_ENV === 'production'
  ? 'https://www.instamojo.com/api/1.1'
  : 'https://test.instamojo.com/api/1.1';

// ── Instamojo API helper ──────────────────────────────────────
async function instamojoPost(endpoint, data) {
  const API_KEY    = process.env.INSTAMOJO_API_KEY;
  const AUTH_TOKEN = process.env.INSTAMOJO_AUTH_TOKEN;

  if (!API_KEY || !AUTH_TOKEN)
    throw new Error('INSTAMOJO_API_KEY and INSTAMOJO_AUTH_TOKEN not set in Railway');

  const formData = new URLSearchParams(data);

  const r = await fetch(`${INSTAMOJO_BASE}${endpoint}/`, {
    method: 'POST',
    headers: {
      'X-Api-Key':    API_KEY,
      'X-Auth-Token': AUTH_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Instamojo returned non-JSON: ${text.slice(0, 200)}`); }
}

async function instamojoGet(endpoint) {
  const API_KEY    = process.env.INSTAMOJO_API_KEY;
  const AUTH_TOKEN = process.env.INSTAMOJO_AUTH_TOKEN;

  const r = await fetch(`${INSTAMOJO_BASE}${endpoint}/`, {
    headers: {
      'X-Api-Key':    API_KEY,
      'X-Auth-Token': AUTH_TOKEN,
    },
    signal: AbortSignal.timeout(10000),
  });

  return r.json();
}

// ══════════════════════════════════════════════════════════════
//  ROUTE 1 — CREATE PAYMENT REQUEST
//  Frontend calls this → gets Instamojo payment URL
//  User is redirected to that URL to pay
// ══════════════════════════════════════════════════════════════
app.post('/instamojo/create-payment', async (req, res) => {
  try {
    const { userId, amount, name, email, phone } = req.body;

    if (!userId || !amount)
      return res.status(400).json({ error: 'userId and amount required' });

    if (amount < 10)
      return res.status(400).json({ error: 'Minimum amount is ₹10' });

    if (!db)
      return res.status(500).json({ error: 'Database not connected' });

    // Get user info from Firestore
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists)
      return res.status(404).json({ error: 'User not found' });

    const user       = userSnap.data();
    const APP_URL    = process.env.APP_URL || 'https://your-app.vercel.app';
    const paymentRef = `INRT${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;

    // Store pending payment in Firestore
    await db.collection('instamojoPayments').doc(paymentRef).set({
      userId,
      amount:     parseFloat(amount),
      status:     'pending',
      paymentRef,
      createdAt:  admin.firestore.FieldValue.serverTimestamp(),
      expiresAt:  Date.now() + 30 * 60 * 1000, // 30 minutes
    });

    // Create Instamojo payment request
    const data = await instamojoPost('/payment-requests', {
      purpose:          `Add Money to INRT Wallet`,
      amount:           parseFloat(amount).toFixed(2),
      buyer_name:       name  || user.name  || 'INRT User',
      email:            email || user.email || `${user.phone}@inrtwallet.app`,
      phone:            phone || user.phone || '',
      send_email:       false,
      send_sms:         false,
      allow_repeated_payments: false,
      redirect_url:     `${APP_URL}/payment-success?ref=${paymentRef}&userId=${userId}`,
      webhook:          `${process.env.RAILWAY_URL || 'https://inrt-wallet-production.up.railway.app'}/instamojo/webhook`,
    });

    if (!data.success)
      throw new Error(data.message || JSON.stringify(data.message_slug) || 'Instamojo payment creation failed');

    const paymentUrl = data.payment_request?.longurl || data.payment_request?.shorturl;
    const requestId  = data.payment_request?.id;

    // Update Firestore with Instamojo request ID
    await db.collection('instamojoPayments').doc(paymentRef).update({
      instamojoRequestId: requestId,
      paymentUrl,
    });

    console.log(`✅ Instamojo payment created: ${paymentRef} | ₹${amount} | ${requestId}`);

    res.json({
      success:    true,
      paymentUrl, // redirect user to this URL
      paymentRef,
      requestId,
      amount,
      message:    'Payment page created. Redirect user to paymentUrl.',
    });

  } catch (e) {
    console.error('/instamojo/create-payment:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 2 — WEBHOOK (Instamojo calls this after payment)
//  Add this URL in Instamojo dashboard → Settings → Webhooks
//  URL: https://your-railway-url.up.railway.app/instamojo/webhook
// ══════════════════════════════════════════════════════════════
app.post('/instamojo/webhook', async (req, res) => {
  try {
    const {
      payment_id,
      payment_request_id,
      amount,
      status,
      buyer,
      buyer_name,
      mac,  // webhook signature from Instamojo
    } = req.body;

    console.log('Instamojo webhook received:', { payment_id, status, amount });

    // ── Verify webhook signature ──────────────────────────────
    const SALT = process.env.INSTAMOJO_SALT;
    if (SALT && mac) {
      const message = `|${payment_request_id}|${payment_id}|${status}|${buyer}|${buyer_name}|${amount}|`;
      const expected = crypto
        .createHmac('sha1', SALT)
        .update(message)
        .digest('hex');

      if (mac !== expected) {
        console.error('Instamojo webhook: invalid MAC signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    // Only process successful payments
    if (status !== 'Credit') {
      console.log(`Instamojo webhook: status=${status}, skipping`);
      return res.json({ received: true });
    }

    if (!db) return res.json({ received: true });

    // Find the pending payment by Instamojo request ID
    const snap = await db.collection('instamojoPayments')
      .where('instamojoRequestId', '==', payment_request_id)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn('Instamojo webhook: payment request not found:', payment_request_id);
      return res.json({ received: true });
    }

    const payDoc  = snap.docs[0];
    const payment = payDoc.data();

    // Prevent double-processing
    if (payment.status === 'success') {
      console.log('Instamojo webhook: already processed:', payment_request_id);
      return res.json({ received: true });
    }

    const paidAmount = parseFloat(amount);
    const pts        = Math.floor(paidAmount / 10);
    const ref        = `IM${payment_id}`;

    // Credit user wallet atomically
    const batch = db.batch();

    batch.update(db.collection('users').doc(payment.userId), {
      balance:       admin.firestore.FieldValue.increment(paidAmount),
      totalReceived: admin.firestore.FieldValue.increment(paidAmount),
      rewardPoints:  admin.firestore.FieldValue.increment(pts),
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.set(db.collection('transactions').doc(ref), {
      uid:         payment.userId,
      type:        'credit',
      amount:      paidAmount,
      note:        `Added via Instamojo`,
      cat:         'add_money',
      ref,
      status:      'success',
      paymentId:   payment_id,
      rewardPoints: pts,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    batch.update(payDoc.ref, {
      status:    'success',
      paymentId: payment_id,
      paidAt:    admin.firestore.FieldValue.serverTimestamp(),
      paidAmount,
    });

    await batch.commit();

    console.log(`✅ Instamojo: ₹${paidAmount} credited to ${payment.userId} | ${ref}`);
    res.json({ received: true, credited: true });

  } catch (e) {
    console.error('/instamojo/webhook:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 3 — VERIFY PAYMENT (frontend polls after redirect)
//  After user is redirected back to your app, call this to
//  confirm the payment was successful
// ══════════════════════════════════════════════════════════════
app.get('/instamojo/verify/:paymentRef', async (req, res) => {
  try {
    const { paymentRef } = req.params;

    if (!db) return res.json({ status: 'unknown' });

    const snap = await db.collection('instamojoPayments').doc(paymentRef).get();
    if (!snap.exists) return res.json({ status: 'not_found' });

    const data = snap.data();

    // Check if expired
    if (data.status === 'pending' && Date.now() > data.expiresAt) {
      await snap.ref.update({ status: 'expired' });
      return res.json({ status: 'expired' });
    }

    res.json({
      status:     data.status,   // pending | success | expired
      amount:     data.amount,
      paymentRef,
      paymentId:  data.paymentId || null,
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 4 — GET PAYMENT STATUS FROM INSTAMOJO (admin check)
// ══════════════════════════════════════════════════════════════
app.get('/instamojo/status/:requestId', async (req, res) => {
  try {
    const data = await instamojoGet(`/payment-requests/${req.params.requestId}`);
    res.json({
      requestId:  req.params.requestId,
      status:     data.payment_request?.status,
      amount:     data.payment_request?.amount,
      payments:   data.payment_request?.payments || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * INRT WALLET — DIDIT KYC ROUTES (FIXED)
 * Paste into server.js BEFORE app.listen(...)
 *
 * Didit has TWO separate hosts:
 *   verification.didit.me  → KYC sessions (uses x-api-key header)
 *   apx.didit.me           → Account management (uses Bearer JWT)
 *
 * Railway env vars needed:
 *   DIDIT_API_KEY   = api_key from Didit (see setup below)
 *   DIDIT_WORKFLOW_ID = workflow ID from app.didit.me dashboard
 *   APP_URL         = https://inrtwallet.in
 *
 * HOW TO GET YOUR API KEY:
 *   Run this in CMD (replace email/password with yours):
 *
 *   Step 1 — Register programmatic account:
 *   curl -X POST https://apx.didit.me/auth/v2/programmatic/register/ \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"admin@inrtwallet.in","password":"YourStr0ng@Pass"}'
 *
 *   Step 2 — Verify email (check inbox for 6-char code):
 *   curl -X POST https://apx.didit.me/auth/v2/programmatic/verify-email/ \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"admin@inrtwallet.in","code":"ABC123"}'
 *
 *   Response gives you: application.api_key
 *   Save that as DIDIT_API_KEY in Railway
 *
 * HOW TO GET WORKFLOW ID:
 *   app.didit.me → Workflows → Create workflow (KYC)
 *   Copy the workflow ID (looks like: wf_xxxxxxxx)
 */

const DIDIT_VERIFY_BASE = 'https://verification.didit.me';

// ── Didit Verification API helper (uses x-api-key) ───────────
async function diditVerifyPost(endpoint, body) {
  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) throw new Error('DIDIT_API_KEY not set in Railway Variables');

  const r = await fetch(`${DIDIT_VERIFY_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'x-api-key':    apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const text = await r.text();
  console.log(`Didit POST ${endpoint} → ${r.status}: ${text.slice(0, 300)}`);

  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: { error: text } }; }
}

async function diditVerifyGet(endpoint) {
  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) throw new Error('DIDIT_API_KEY not set in Railway Variables');

  const r = await fetch(`${DIDIT_VERIFY_BASE}${endpoint}`, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(10000),
  });

  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: { error: text } }; }
}

// ══════════════════════════════════════════════════════════════
//  ROUTE 1 — CREATE DIDIT VERIFICATION SESSION
// ══════════════════════════════════════════════════════════════
app.post('/kyc/didit-session', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!db)     return res.status(500).json({ error: 'Database not connected' });

    // Check user exists
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });

    const user = userSnap.data();
    if (user.kycStatus === 'verified')
      return res.status(400).json({ error: 'KYC already verified' });

    const APP_URL    = process.env.APP_URL || 'https://inrtwallet.in';
    const WORKFLOW   = process.env.DIDIT_WORKFLOW_ID || '';

    if (!WORKFLOW)
      return res.status(500).json({ error: 'DIDIT_WORKFLOW_ID not set in Railway Variables' });

    // Create session on Didit verification API
    const { status, data } = await diditVerifyPost('/v3/session/create/', {
  workflow_id:  WORKFLOW,
  vendor_data:  userId,
  callback:     `${APP_URL}/kyc-complete`,
    });

    if (status !== 200 && status !== 201)
      throw new Error(data?.detail || data?.message || data?.error || `Didit session failed (${status})`);

    const sessionId  = data.session_id || data.id;
    const sessionUrl = data.url        || data.session_url || data.verification_url;

    if (!sessionId || !sessionUrl)
      throw new Error('Didit did not return session_id or url. Check DIDIT_WORKFLOW_ID is correct.');

    // Save to Firestore
    await db.collection('diditSessions').doc(sessionId).set({
      userId,
      sessionId,
      status:    'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    // Update user KYC to in_progress
    await db.collection('users').doc(userId).update({
      kycStatus: 'in_progress',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Didit session created: ${sessionId} for user ${userId}`);

    res.json({
      success:   true,
      sessionId,
      url:       sessionUrl,
      expiresIn: 1800,
    });

  } catch (e) {
    console.error('/kyc/didit-session:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 2 — DIDIT WEBHOOK
//  Didit calls this automatically after verification completes
//  URL already set: inrt-wallet-production.up.railway.app/kyc/didit-webhook
// ══════════════════════════════════════════════════════════════
app.post('/kyc/didit-webhook', async (req, res) => {
  try {
    // Always respond 200 immediately so Didit knows we received it
    res.json({ received: true });

    const body = req.body;
    console.log('Didit webhook:', JSON.stringify(body).slice(0, 500));

    if (!db) return;

    // Didit v3 webhook fields
    const sessionId  = body.session_id  || body.id            || '';
    const status     = body.status      || '';
    const vendorData = body.vendor_data || '';
    const decision   = body.kyc_decision|| body.decision       || '';

    // Approved statuses from Didit
    const isApproved = [
      'Approved', 'APPROVED', 'approved',
      'completed', 'COMPLETED',
      'verified',  'VERIFIED',
    ].includes(status) || [
      'Approved', 'APPROVED', 'approved',
    ].includes(decision);

    const isRejected = [
      'Declined', 'DECLINED', 'declined',
      'rejected',  'REJECTED',
      'failed',    'FAILED',
    ].includes(status) || [
      'Declined', 'DECLINED', 'declined',
    ].includes(decision);

    if (!isApproved && !isRejected) {
      console.log(`Didit webhook: status="${status}" decision="${decision}" — not final, skipping`);
      return;
    }

    // Resolve userId
    let userId = vendorData;
    if (!userId && sessionId) {
      const sessSnap = await db.collection('diditSessions').doc(sessionId).get();
      if (sessSnap.exists) userId = sessSnap.data().userId;
    }

    if (!userId) {
      console.warn('Didit webhook: cannot resolve userId', { vendorData, sessionId });
      return;
    }

    // Check not already processed
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists || userSnap.data().kycStatus === 'verified') {
      console.log(`Didit webhook: ${userId} already processed`);
      return;
    }

    if (isApproved) {
      // Extract identity data
      const docData  = body.document || body.extracted_data || {};
      const faceData = body.face      || {};
      const fullName = docData.full_name || docData.name     || body.full_name || '';
      const dob      = docData.dob       || docData.date_of_birth              || '';
      const docType  = docData.document_type                                   || '';
      const kycRef   = `KYC${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;

      const batch = db.batch();

      batch.set(db.collection('kyc').doc(userId), {
        userId, kycRef, status: 'verified', kycType: 'didit',
        autoApproved: true, diditSessionId: sessionId,
        fullName, dob, docType,
        faceMatch:    faceData.result || 'matched',
        submittedAt:  admin.firestore.FieldValue.serverTimestamp(),
        reviewedAt:   admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      batch.update(db.collection('users').doc(userId), {
        kycStatus:     'verified',
        kycRef,
        kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        rewardPoints:  admin.firestore.FieldValue.increment(500),
        dailyLimit:    100000,
        updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
      });

      if (sessionId) {
        batch.update(db.collection('diditSessions').doc(sessionId), {
          status: 'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      console.log(`✅ Didit KYC APPROVED: ${userId} | ${kycRef}`);

    } else if (isRejected) {
      await db.collection('users').doc(userId).update({
        kycStatus:          'rejected',
        kycRejectionReason: body.rejection_reason || body.reason || 'Identity verification failed',
        updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('kyc').doc(userId).set({
        status:    'rejected',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`❌ Didit KYC REJECTED: ${userId}`);
    }

  } catch (e) {
    console.error('/kyc/didit-webhook error:', e);
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 3 — POLL SESSION STATUS (frontend polls after redirect)
// ══════════════════════════════════════════════════════════════
app.get('/kyc/didit-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!db) return res.json({ status: 'unknown' });

    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.json({ status: 'not_found' });

    const kycStatus = userSnap.data().kycStatus || 'not_started';

    // Already resolved
    if (['verified', 'rejected'].includes(kycStatus))
      return res.json({ status: kycStatus });

    // Still in_progress — poll Didit directly
    if (kycStatus === 'in_progress') {
      try {
        const sessSnap = await db.collection('diditSessions')
          .where('userId', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(1).get();

        if (!sessSnap.empty) {
          const sess     = sessSnap.docs[0].data();
          const sessionId= sess.sessionId;

          if (sessionId) {
            const { status: httpStatus, data } = await diditVerifyGet(`/v3/session/${sessionId}/`);
            console.log(`Didit poll ${sessionId}:`, data?.status, data?.kyc_decision);

            const s = data?.status        || '';
            const d = data?.kyc_decision  || '';

            const approved = ['Approved','APPROVED','approved','completed','verified'].includes(s)
                          || ['Approved','APPROVED','approved'].includes(d);
            const rejected = ['Declined','DECLINED','declined','rejected','failed'].includes(s)
                          || ['Declined','DECLINED','declined'].includes(d);

            if (approved) {
              const kycRef = `KYC${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
              const batch  = db.batch();
              batch.set(db.collection('kyc').doc(userId), {
                userId, kycRef, status: 'verified', kycType: 'didit',
                autoApproved: true, diditSessionId: sessionId,
                submittedAt:  admin.firestore.FieldValue.serverTimestamp(),
                reviewedAt:   admin.firestore.FieldValue.serverTimestamp(),
                updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
              }, { merge: true });
              batch.update(db.collection('users').doc(userId), {
                kycStatus: 'verified', kycRef,
                kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                rewardPoints:  admin.firestore.FieldValue.increment(500),
                dailyLimit:    100000,
                updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
              });
              await batch.commit();
              return res.json({ status: 'verified', kycRef });
            }

            if (rejected) {
              await db.collection('users').doc(userId).update({
                kycStatus: 'rejected',
                kycRejectionReason: data?.rejection_reason || 'Verification failed',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              return res.json({ status: 'rejected' });
            }
          }
        }
      } catch (e) {
        console.warn('Didit poll error (non-critical):', e.message);
      }
    }

    res.json({ status: kycStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 4 — KYC STATUS (existing — keep working)
// ══════════════════════════════════════════════════════════════
app.get('/kyc/status/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('kyc').doc(req.params.userId).get();
    if (!snap.exists) return res.json({ status: 'not_started' });
    const d = snap.data();
    res.json({
      status:  d.status,
      kycRef:  d.kycRef,
      kycType: d.kycType || 'manual',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ══════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 INRT API on port ${PORT}`);
  console.log(`   Firebase  : ${adminAuth                    ? '✅' : '❌'}`);
  console.log(`   Razorpay  : ${process.env.RAZORPAY_KEY_ID  ? '✅' : '❌'}`);
  console.log(`   Resend    : ${process.env.RESEND_API_KEY   ? '✅' : '❌'}`);
  console.log(`   Surepass  : ${process.env.SUREPASS_TOKEN   ? '✅' : '❌'}`);
  console.log(`   Cashfree  : ${process.env.CASHFREE_APP_ID  ? '✅' : '❌'}`);
  console.log(`   Ezytm     : ${process.env.EZYTM_API_TOKEN  ? '✅' : '❌'}`);
  console.log(`   Admin Key : ${process.env.ADMIN_KEY        ? '✅' : '❌'}\n`);
});
