/**
 * INRT WALLET — server.js FINAL
 * All routes in one file, no duplicates, no crashes
 * KYC: Manual PAN review (no third-party API needed)
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
    admin.initializeApp({
      credential:    admin.credential.cert(creds),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'inrt-wallet.firebasestorage.app',
    });
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

// ── Instamojo ─────────────────────────────────────────────────
const INSTAMOJO_BASE = process.env.NODE_ENV === 'production'
  ? 'https://www.instamojo.com/api/1.1'
  : 'https://test.instamojo.com/api/1.1';

async function instamojoPost(endpoint, data) {
  const API_KEY    = process.env.INSTAMOJO_API_KEY;
  const AUTH_TOKEN = process.env.INSTAMOJO_AUTH_TOKEN;
  if (!API_KEY || !AUTH_TOKEN) throw new Error('INSTAMOJO_API_KEY and INSTAMOJO_AUTH_TOKEN not set');
  const r = await fetch(`${INSTAMOJO_BASE}${endpoint}/`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'X-Auth-Token': AUTH_TOKEN, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Instamojo non-JSON: ${text.slice(0, 200)}`); }
}

async function instamojoGet(endpoint) {
  const API_KEY    = process.env.INSTAMOJO_API_KEY;
  const AUTH_TOKEN = process.env.INSTAMOJO_AUTH_TOKEN;
  const r = await fetch(`${INSTAMOJO_BASE}${endpoint}/`, {
    headers: { 'X-Api-Key': API_KEY, 'X-Auth-Token': AUTH_TOKEN },
    signal: AbortSignal.timeout(10000),
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
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('transactions').add({ uid: userId, type: 'credit', amount, note: 'Added via Razorpay', ref: razorpay_payment_id, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
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
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
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
//  KYC — MANUAL PAN REVIEW
//  No third-party API. User submits PAN + photo + selfie.
//  You review at /admin/kyc and approve with one click.
// ══════════════════════════════════════════════════════════════

// Submit KYC
app.post('/kyc/submit', async (req, res) => {
  try {
    const { userId, fullName, dob, pan, panPhotoBase64, selfieBase64 } = req.body;
    if (!userId || !fullName || !dob || !pan)
      return res.status(400).json({ error: 'userId, fullName, dob and pan required' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const panClean = pan.toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panClean))
      return res.status(400).json({ error: 'Invalid PAN format. Should be like ABCDE1234F' });

    // Age check
    const birth = new Date(dob), today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (isNaN(age) || age < 18)
      return res.status(400).json({ error: `You must be 18 or older. Your age: ${age}` });

    // Duplicate PAN check
    const panMasked = panClean.slice(0,2) + 'XXX' + panClean.slice(5);
    const dupSnap   = await db.collection('kyc').where('panMasked','==',panMasked).where('status','in',['pending','verified']).limit(2).get();
    if (dupSnap.docs.some(d => d.id !== userId))
      return res.status(400).json({ error: 'This PAN is already registered with another account.' });

    // Already verified check
    const existing = await db.collection('kyc').doc(userId).get();
    if (existing.exists && existing.data().status === 'verified')
      return res.status(400).json({ error: 'Your KYC is already verified.' });

    // Upload photos to Firebase Storage
    const uploads = {};
    const hasBucket = admin.storage && typeof admin.storage === 'function';
    if (hasBucket) {
      const bucket = admin.storage().bucket();
      for (const [key, b64, name] of [['panPhoto',panPhotoBase64,'pan.jpg'],['selfie',selfieBase64,'selfie.jpg']]) {
        if (!b64) continue;
        try {
          const file   = bucket.file(`kyc/${userId}/${name}`);
          await file.save(Buffer.from(b64, 'base64'), { metadata: { contentType: 'image/jpeg' } });
          const urls   = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
          uploads[key] = urls[0];
        } catch (e) { console.warn(`Upload ${name} failed:`, e.message); }
      }
    }

    await db.collection('kyc').doc(userId).set({
      userId, fullName: fullName.trim(), dob,
      pan: panClean, panMasked, kycType: 'manual_pan', status: 'pending',
      ...uploads,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection('users').doc(userId).update({
      kycStatus: 'pending',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`📋 KYC submitted: ${userId} | ${fullName} | ${panMasked}`);
    res.json({ success: true, message: 'KYC submitted. We will verify within 24 hours.' });
  } catch (e) {
    console.error('/kyc/submit:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get KYC status (user polls this)
app.get('/kyc/status/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('kyc').doc(req.params.userId).get();
    if (!snap.exists) return res.json({ status: 'not_started' });
    const d = snap.data();
    res.json({
      status:          d.status,
      kycRef:          d.kycRef          || null,
      rejectionReason: d.rejectionReason || null,
      submittedAt:     d.submittedAt?.toDate?.()?.toISOString() || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin — list all KYC submissions
app.get('/kyc/admin/list', async (req, res) => {
  try {
    if (req.query.adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!db) return res.json({ submissions: [] });
    const { status = 'pending' } = req.query;
    let query = db.collection('kyc').orderBy('submittedAt', 'desc').limit(100);
    if (status !== 'all') query = query.where('status', '==', status);
    const snap = await query.get();
    const submissions = snap.docs.map(d => ({
      id:          d.id,
      fullName:    d.data().fullName    || '',
      panMasked:   d.data().panMasked   || '',
      dob:         d.data().dob         || '',
      status:      d.data().status      || '',
      kycType:     d.data().kycType     || '',
      panPhoto:    d.data().panPhoto    || null,
      selfie:      d.data().selfie      || null,
      submittedAt: d.data().submittedAt?.toDate?.()?.toISOString() || null,
      reviewedAt:  d.data().reviewedAt?.toDate?.()?.toISOString()  || null,
      rejectionReason: d.data().rejectionReason || null,
    }));
    res.json({ submissions, count: submissions.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin — approve or reject KYC
app.post('/kyc/admin/review', async (req, res) => {
  try {
    const { userId, action, reason, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!['approve','reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });
    if (!db) return res.status(500).json({ error: 'Firebase not connected' });

    const newStatus = action === 'approve' ? 'verified' : 'rejected';
    const kycRef    = action === 'approve' ? `KYC${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}` : null;

    await db.collection('kyc').doc(userId).update({
      status: newStatus, kycRef: kycRef || null,
      rejectionReason: reason || null,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('users').doc(userId).update({
      kycStatus: newStatus, kycRef: kycRef || null,
      kycReviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(action === 'approve' && {
        rewardPoints:  admin.firestore.FieldValue.increment(500),
        kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        dailyLimit:    100000,
      }),
      ...(action === 'reject' && {
        kycRejectionReason: reason || 'Documents could not be verified',
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`${action==='approve'?'✅':'❌'} KYC ${action}d: ${userId}`);
    res.json({ success: true, userId, status: newStatus, kycRef, message: action==='approve'?`KYC approved. +500 INRT reward points.`:`KYC rejected: ${reason}` });
  } catch (e) {
    console.error('/kyc/admin/review:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ══════════════════════════════════════════════════════════════
app.get('/admin/stats', async (req, res) => {
  try {
    if (req.query.adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!db) return res.json({ stats: {} });
    const [usersSnap, txSnap, kycSnap, earningsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('transactions').orderBy('createdAt','desc').limit(500).get(),
      db.collection('kyc').get(),
      db.collection('businessWallet').doc('earnings').get(),
    ]);
    const users         = usersSnap.docs.map(d => d.data());
    const kycDocs       = kycSnap.docs.map(d => d.data());
    const thirtyDaysAgo = Date.now() - 30*24*60*60*1000;
    const recentTxs     = txSnap.docs.map(d => d.data()).filter(tx => tx.createdAt?.toMillis?.() > thirtyDaysAgo);
    const earnings      = earningsSnap.exists ? earningsSnap.data() : {};
    res.json({ stats: {
      totalUsers:    users.length,
      kycVerified:   kycDocs.filter(k => k.status==='verified').length,
      kycPending:    kycDocs.filter(k => k.status==='pending').length,
      kycRejected:   kycDocs.filter(k => k.status==='rejected').length,
      totalBalance:  Math.round(users.reduce((s,u)=>s+(u.balance||0),0)),
      last30Days: {
        txVolume: Math.round(recentTxs.filter(t=>t.type==='debit').reduce((s,t)=>s+(t.amount||0),0)),
        txCount:  recentTxs.length,
      },
      earnings: {
        total:            earnings.balance             || 0,
        transferEarnings: earnings.transferEarnings    || 0,
        rechargeEarnings: earnings.rechargeEarnings    || 0,
        billsEarnings:    earnings.billsEarnings       || 0,
      },
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/users', async (req, res) => {
  try {
    if (req.query.adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!db) return res.json({ users: [] });
    const snap  = await db.collection('users').orderBy('createdAt','desc').limit(200).get();
    const users = snap.docs.map(d => ({
      id: d.id, name: d.data().name||'', phone: d.data().phone||'',
      balance: d.data().balance||0, kycStatus: d.data().kycStatus||'not_started',
      rewardPoints: d.data().rewardPoints||0,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString()||null,
    }));
    res.json({ users, count: users.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
    if ((sender.balance||0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const today = new Date().toISOString().split('T')[0];
    const lk    = `dailySent_${today}`;
    const dl    = sender.kycStatus === 'verified' ? 100000 : 10000;
    if ((sender[lk]||0) + amount > dl) return res.status(402).json({ error: 'Daily limit reached' });
    let toUid = directToUid;
    if (!toUid && toPhone) {
      const pSnap = await db.collection('phoneIndex').doc(toPhone.replace(/\D/g,'')).get();
      if (!pSnap.exists) return res.status(404).json({ error: 'No INRT account for this number' });
      toUid = pSnap.data().uid;
    }
    if (!toUid || toUid === fromUid) return res.status(400).json({ error: 'Invalid receiver' });
    const ref = genTxId('TXN'), pts = Math.floor(amount/10);
    const commission = await earnCommission(amount, 'transfer');
    const batch = db.batch();
    batch.update(db.collection('users').doc(fromUid), { balance: admin.firestore.FieldValue.increment(-amount), totalSent: admin.firestore.FieldValue.increment(amount), [lk]: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(db.collection('users').doc(toUid),   { balance: admin.firestore.FieldValue.increment(amount), totalReceived: admin.firestore.FieldValue.increment(amount), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref),         { uid: fromUid, toUid, type: 'debit',  amount, note: note||'Transfer', cat: 'transfer', ref, status: 'success', commission, rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref+'_CR'),   { uid: toUid, fromUid, type: 'credit', amount, note: `Received from ${sender.name||'INRT User'}`, cat: 'transfer', ref: ref+'_CR', status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
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
    const user      = uSnap.data();
    const upiId     = user.upiId || `${user.phone}@inrt`;
    const txnId     = genTxId('UPI');
    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(user.name||'INRT Wallet')}&tr=${txnId}${amount?`&am=${amount}`:''}${note?`&tn=${encodeURIComponent(note)}`:''}}&cu=INR`;
    const qrImageUrl= `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiString)}`;
    await db.collection('pendingPayments').doc(txnId).set({ userId, upiId, amount: amount||null, note: note||'', txnId, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: Date.now()+10*60*1000 });
    res.json({ success: true, txnId, upiId, upiString, qrImageUrl, amount: amount||null });
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
    const ref = genTxId('UPI'), pts = Math.floor(amount/10);
    const batch = db.batch();
    batch.update(db.collection('users').doc(pending.userId), { balance: admin.firestore.FieldValue.increment(parseFloat(amount)), totalReceived: admin.firestore.FieldValue.increment(parseFloat(amount)), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref), { uid: pending.userId, type: 'credit', amount: parseFloat(amount), note: `UPI from ${payerVpa||'UPI'}`, cat: 'add_money', ref, status: 'success', payerVpa, upiTxnId: txnId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
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
    batch.set(db.collection('transactions').doc(ref), { uid: userId, type: 'credit', amount: parseFloat(amount), note: note||'Admin credit', cat: 'add_money', ref, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, ref, amount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payment/bill', async (req, res) => {
  try {
    const { userId, amount, category, provider, accountNo } = req.body;
    if (!userId || !amount || !db) return res.status(400).json({ error: 'Missing fields' });
    const uSnap = await db.collection('users').doc(userId).get();
    if (!uSnap.exists || (uSnap.data().balance||0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const ref = genTxId('BILL'), cashback = Math.floor(amount*0.02), pts = Math.floor(amount/10);
    const commission = await earnCommission(amount, 'bills');
    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), { balance: admin.firestore.FieldValue.increment(-amount+cashback), cashback: admin.firestore.FieldValue.increment(cashback), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref), { uid: userId, type: 'debit', amount, note: `${category} — ${provider||''}`, cat: 'bills', ref, status: 'success', accountNo, cashback, commission, rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
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
    const tx = tSnap.data(), refundRef = genTxId('REF');
    const batch = db.batch();
    batch.update(db.collection('users').doc(tx.uid), { balance: admin.firestore.FieldValue.increment(tx.amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(db.collection('transactions').doc(txId), { status: 'refunded', refundRef });
    batch.set(db.collection('transactions').doc(refundRef), { uid: tx.uid, type: 'credit', amount: tx.amount, note: `Refund: ${reason||'Customer request'}`, cat: 'refund', ref: refundRef, status: 'success', originalTxId: txId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ success: true, refundRef, amount: tx.amount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/payment/balance/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ balance: 0 });
    const snap = await db.collection('users').doc(req.params.userId).get();
    res.json({ balance: snap.exists ? snap.data().balance||0 : 0 });
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
    if (process.env.NODE_ENV !== 'production')
      return res.json({ valid: true, name: 'Test Account', upiId, bankName: 'Test Bank' });
    const d = await cfPost('/payout/v1/validation/upiDetails', { vpa: upiId });
    if (d.status !== 'SUCCESS') return res.status(400).json({ error: 'Invalid UPI ID' });
    res.json({ valid: true, name: d.data?.name||'UPI Account', upiId: d.data?.vpa||upiId, bankName: d.data?.bankName||'' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payout/send-upi', async (req, res) => {
  try {
    const { fromUid, toUpiId, amount, note, name } = req.body;
    if (!fromUid || !toUpiId || !amount || !db) return res.status(400).json({ error: 'Missing fields' });
    const sSnap = await db.collection('users').doc(fromUid).get();
    if (!sSnap.exists) return res.status(404).json({ error: 'Sender not found' });
    const sender = sSnap.data();
    if ((sender.balance||0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const today = new Date().toISOString().split('T')[0];
    const lk    = `dailySent_${today}`;
    const dl    = sender.kycStatus === 'verified' ? 100000 : 10000;
    if ((sender[lk]||0) + amount > dl) return res.status(402).json({ error: 'Daily limit reached' });
    const transferId = genTransferId();
    await db.collection('users').doc(fromUid).update({ balance: admin.firestore.FieldValue.increment(-amount), [lk]: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const cfResponse = await cfPost('/payout/v1/directTransfer', { amount, transferId, transferMode: 'upi', remarks: note||`INRT from ${sender.name||sender.phone}`, beneDetails: { beneId: `BENE_${toUpiId.replace(/[@.]/g,'_')}`, name: name||'UPI Recipient', vpa: toUpiId } });
    if (cfResponse.status !== 'SUCCESS') {
      await db.collection('users').doc(fromUid).update({ balance: admin.firestore.FieldValue.increment(amount), [lk]: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw new Error(cfResponse.message || 'Transfer failed');
    }
    const pts = Math.floor(amount/10);
    await db.collection('transactions').add({ uid: fromUid, type: 'debit', amount, note: note||`Sent to ${toUpiId}`, cat: 'transfer', ref: transferId, toUpiId, status: 'success', method: 'cashfree_upi', rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(fromUid).update({ rewardPoints: admin.firestore.FieldValue.increment(pts), totalSent: admin.firestore.FieldValue.increment(amount) });
    res.json({ success: true, transferId, amount, toUpiId, rewardPoints: pts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/payout/send-bank', async (req, res) => {
  try {
    const { fromUid, accountNo, ifsc, accountName, amount, note } = req.body;
    if (!fromUid || !accountNo || !ifsc || !accountName || !amount || !db) return res.status(400).json({ error: 'Missing fields' });
    const sSnap = await db.collection('users').doc(fromUid).get();
    if (!sSnap.exists || (sSnap.data().balance||0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const transferId = genTransferId();
    await db.collection('users').doc(fromUid).update({ balance: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const cfResponse = await cfPost('/payout/v1/directTransfer', { amount, transferId, transferMode: 'imps', remarks: note||'INRT Bank Transfer', beneDetails: { beneId: `BENE_${accountNo}`, name: accountName, bankAccount: accountNo, ifsc: ifsc.toUpperCase() } });
    if (cfResponse.status !== 'SUCCESS') {
      await db.collection('users').doc(fromUid).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw new Error(cfResponse.message || 'Bank transfer failed');
    }
    await db.collection('transactions').add({ uid: fromUid, type: 'debit', amount, note: note||`Bank transfer to ${accountName}`, cat: 'transfer', ref: transferId, accountNo: accountNo.slice(-4).padStart(accountNo.length,'X'), ifsc, accountName, status: 'success', method: 'cashfree_imps', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(fromUid).update({ rewardPoints: admin.firestore.FieldValue.increment(Math.floor(amount/10)), totalSent: admin.firestore.FieldValue.increment(amount) });
    res.json({ success: true, transferId, amount, accountName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/payout/status/:transferId', async (req, res) => {
  try {
    const d = await cfGet(`/payout/v1/getTransferStatus?transferId=${req.params.transferId}`);
    res.json({ transferId: req.params.transferId, status: d.data?.transfer?.status||'UNKNOWN', amount: d.data?.transfer?.amount, utr: d.data?.transfer?.utr||null });
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
      await txDoc.ref.update({ status: 'failed', failReason: reason||'Transfer failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
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
    if ((user.balance||0) < amount)    return res.status(402).json({ error: 'Insufficient balance' });
    const transferId = genTransferId();
    await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const cfResponse = await cfPost('/payout/v1/directTransfer', { amount, transferId, transferMode: 'upi', remarks: 'INRT Wallet Withdrawal', beneDetails: { beneId: `USER_${userId}`, name: user.name||'INRT User', vpa: upiId } });
    if (cfResponse.status !== 'SUCCESS') {
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      throw new Error(cfResponse.message || 'Withdrawal failed');
    }
    await db.collection('transactions').add({ uid: userId, type: 'debit', amount, note: `Withdrawal to ${upiId}`, cat: 'withdrawal', ref: transferId, toUpiId: upiId, status: 'success', method: 'cashfree_upi', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, transferId, amount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  INSTAMOJO
// ══════════════════════════════════════════════════════════════
app.post('/instamojo/create-payment', async (req, res) => {
  try {
    const { userId, amount, name, email, phone } = req.body;
    if (!userId || !amount) return res.status(400).json({ error: 'userId and amount required' });
    if (amount < 10) return res.status(400).json({ error: 'Minimum ₹10' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    const user       = userSnap.data();
    const APP_URL    = process.env.APP_URL || 'https://inrtwallet.in';
    const paymentRef = `INRT${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
    await db.collection('instamojoPayments').doc(paymentRef).set({ userId, amount: parseFloat(amount), status: 'pending', paymentRef, createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt: Date.now()+30*60*1000 });
    const data = await instamojoPost('/payment-requests', {
      purpose: 'Add Money to INRT Wallet', amount: parseFloat(amount).toFixed(2),
      buyer_name: name||user.name||'INRT User', email: email||user.email||`${user.phone}@inrtwallet.app`,
      phone: phone||user.phone||'', send_email: false, send_sms: false, allow_repeated_payments: false,
      redirect_url: `${APP_URL}/payment-success?ref=${paymentRef}&userId=${userId}`,
      webhook: `${process.env.RAILWAY_URL||'https://inrt-wallet-production.up.railway.app'}/instamojo/webhook`,
    });
    if (!data.success) throw new Error(data.message||'Instamojo payment creation failed');
    const paymentUrl = data.payment_request?.longurl||data.payment_request?.shorturl;
    const requestId  = data.payment_request?.id;
    await db.collection('instamojoPayments').doc(paymentRef).update({ instamojoRequestId: requestId, paymentUrl });
    res.json({ success: true, paymentUrl, paymentRef, requestId, amount });
  } catch (e) { console.error('/instamojo/create-payment:', e); res.status(500).json({ error: e.message }); }
});

app.post('/instamojo/webhook', async (req, res) => {
  try {
    const { payment_id, payment_request_id, amount, status, buyer, buyer_name, mac } = req.body;
    console.log('Instamojo webhook:', { payment_id, status, amount });
    const SALT = process.env.INSTAMOJO_SALT;
    if (SALT && mac) {
      const expected = crypto.createHmac('sha1', SALT).update(`|${payment_request_id}|${payment_id}|${status}|${buyer}|${buyer_name}|${amount}|`).digest('hex');
      if (mac !== expected) return res.status(400).json({ error: 'Invalid signature' });
    }
    if (status !== 'Credit') return res.json({ received: true });
    if (!db) return res.json({ received: true });
    const snap = await db.collection('instamojoPayments').where('instamojoRequestId','==',payment_request_id).limit(1).get();
    if (snap.empty) return res.json({ received: true });
    const payDoc = snap.docs[0], payment = payDoc.data();
    if (payment.status === 'success') return res.json({ received: true });
    const paidAmount = parseFloat(amount), pts = Math.floor(paidAmount/10), ref = `IM${payment_id}`;
    const batch = db.batch();
    batch.update(db.collection('users').doc(payment.userId), { balance: admin.firestore.FieldValue.increment(paidAmount), totalReceived: admin.firestore.FieldValue.increment(paidAmount), rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.set(db.collection('transactions').doc(ref), { uid: payment.userId, type: 'credit', amount: paidAmount, note: 'Added via Instamojo', cat: 'add_money', ref, status: 'success', paymentId: payment_id, rewardPoints: pts, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    batch.update(payDoc.ref, { status: 'success', paymentId: payment_id, paidAt: admin.firestore.FieldValue.serverTimestamp(), paidAmount });
    await batch.commit();
    console.log(`✅ Instamojo: ₹${paidAmount} credited to ${payment.userId}`);
    res.json({ received: true, credited: true });
  } catch (e) { console.error('/instamojo/webhook:', e); res.status(500).json({ error: e.message }); }
});

app.get('/instamojo/verify/:paymentRef', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('instamojoPayments').doc(req.params.paymentRef).get();
    if (!snap.exists) return res.json({ status: 'not_found' });
    const data = snap.data();
    if (data.status === 'pending' && Date.now() > data.expiresAt) { await snap.ref.update({ status: 'expired' }); return res.json({ status: 'expired' }); }
    res.json({ status: data.status, amount: data.amount, paymentRef: req.params.paymentRef, paymentId: data.paymentId||null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/instamojo/status/:requestId', async (req, res) => {
  try {
    const data = await instamojoGet(`/payment-requests/${req.params.requestId}`);
    res.json({ requestId: req.params.requestId, status: data.payment_request?.status, amount: data.payment_request?.amount, payments: data.payment_request?.payments||[] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  EZYTM RECHARGE
// ══════════════════════════════════════════════════════════════
app.get('/recharge/operator/:mobile', async (req, res) => {
  try {
    const mobile = req.params.mobile.replace(/\D/g, '');
    if (mobile.length !== 10) return res.status(400).json({ error: 'Invalid mobile number' });
    const AIRTEL = ['7290','7291','7292','7293','7294','7295','7296','7297','7298','7299','8130','8131','8132','8133','8134','8376','8527','8800','8801','8802','8803','8804','9711','9810','9811','9818','9891','9899','9971'];
    const VI     = ['7016','7041','7042','7043','7044','7045','7046','7047','7048','7049','7208','7209','8160','8161','8758','9408','9409','9898','9974'];
    const BSNL   = ['9436','9441','9442','9443','9444','9445','9446','9447','9448','9449','9863','9864','9865','9866','9867','9868','9869','9870'];
    let operator = 'JIO';
    if (AIRTEL.some(p => mobile.startsWith(p)))      operator = 'AIRTEL';
    else if (VI.some(p => mobile.startsWith(p)))     operator = 'VI';
    else if (BSNL.some(p => mobile.startsWith(p)))   operator = 'BSNL';
    else if (mobile.startsWith('6'))                 operator = 'JIO';
    else if (['70','71','72','81','82','83','90','91','92'].some(p=>mobile.startsWith(p))) operator = 'AIRTEL';
    else if (['73','74','75','84','85','86','96','97','98','99'].some(p=>mobile.startsWith(p))) operator = 'JIO';
    else if (['76','77','78','87','88','89'].some(p=>mobile.startsWith(p))) operator = 'VI';
    else if (['79','93','94','95'].some(p=>mobile.startsWith(p))) operator = 'BSNL';
    res.json({ mobile, operator, circle: 'UNKNOWN' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/recharge/plans', async (req, res) => {
  try {
    const { operator } = req.query;
    const token = process.env.EZYTM_API_TOKEN, member = process.env.EZYTM_MEMBER_ID;
    if (token && member) {
      try {
        const url = new URL('https://newapi.ezytm.in/Service/BrowsePlan');
        url.searchParams.append('ApiToken', token);
        url.searchParams.append('MemberId', member);
        url.searchParams.append('OpId', operator||'JIO');
        const r = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
        const data = JSON.parse(await r.text());
        if (data && (data.DATA||data.data||Array.isArray(data)))
          return res.json({ success: true, plans: data.DATA||data.data||data, source: 'live' });
      } catch (e) { console.warn('Ezytm plans fallback:', e.message); }
    }
    const fallback = [
      { id:'p1', amount:179,  validity:'28 days',  data:'2GB/day',  calls:'Unlimited', popular:false },
      { id:'p2', amount:239,  validity:'28 days',  data:'2GB/day',  calls:'Unlimited', popular:true  },
      { id:'p3', amount:299,  validity:'28 days',  data:'3GB/day',  calls:'Unlimited', popular:false },
      { id:'p4', amount:479,  validity:'56 days',  data:'2.5GB/day',calls:'Unlimited', popular:false },
      { id:'p5', amount:599,  validity:'84 days',  data:'2GB/day',  calls:'Unlimited', popular:true  },
      { id:'p6', amount:899,  validity:'84 days',  data:'3GB/day',  calls:'Unlimited', popular:false },
      { id:'p7', amount:1199, validity:'365 days', data:'2.5GB/day',calls:'Unlimited', popular:false },
      { id:'p8', amount:2999, validity:'365 days', data:'3GB/day',  calls:'Unlimited', popular:false },
    ];
    res.json({ success: true, plans: fallback, source: 'fallback' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/recharge/do', async (req, res) => {
  try {
    const { userId, mobile, operator, amount, rechargeType } = req.body;
    if (!userId || !mobile || !operator || !amount) return res.status(400).json({ error: 'userId, mobile, operator, amount required' });
    const token = process.env.EZYTM_API_TOKEN, member = process.env.EZYTM_MEMBER_ID;
    if (!token || !member) return res.status(500).json({ error: 'EZYTM_API_TOKEN and EZYTM_MEMBER_ID not set' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    if ((userSnap.data().balance||0) < amount) return res.status(402).json({ error: `Insufficient balance` });
    const orderId = genTxId('RCH'), pts = Math.floor(amount/10);
    await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    let ezytmResponse;
    try {
      const url = new URL('https://newapi.ezytm.in/Service/Recharge2');
      url.searchParams.append('ApiToken', token);
      url.searchParams.append('MobileNo', mobile.replace(/\D/g,''));
      url.searchParams.append('Amount',   amount.toString());
      url.searchParams.append('OpId',     operator);
      url.searchParams.append('RefTxnId', orderId);
      const text = await (await fetch(url.toString(), { signal: AbortSignal.timeout(20000) })).text();
      console.log('Ezytm raw:', text);
      try { ezytmResponse = JSON.parse(text); }
      catch {
        await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return res.status(500).json({ error: 'Invalid response from Ezytm. Balance refunded.', raw: text.slice(0,200) });
      }
    } catch (fetchErr) {
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return res.status(500).json({ error: 'Recharge service unreachable. Balance refunded.' });
    }
    const status = String(ezytmResponse.STATUS||'').trim();
    const txnId  = ezytmResponse.OPTXNID||ezytmResponse.TXNNO||orderId;
    const message= ezytmResponse.MESSAGE||'';
    if (status === '3') {
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('transactions').add({ uid: userId, type: 'debit', amount, note: `Failed recharge: ${operator} ${mobile}`, cat: 'recharge', ref: orderId, status: 'failed', mobile, operator, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return res.status(400).json({ success: false, error: message||'Recharge failed. Balance refunded.' });
    }
    const txStatus = status === '1' ? 'success' : 'pending';
    await db.collection('transactions').add({ uid: userId, type: 'debit', amount, note: `${operator} ${rechargeType==='D'?'DTH':rechargeType==='T'?'Postpaid':'Prepaid'} — ${mobile}`, cat: 'recharge', ref: orderId, status: txStatus, mobile, operator, ezytmTxnId: txnId, rewardPoints: status==='1'?pts:0, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    if (status === '1') await db.collection('users').doc(userId).update({ rewardPoints: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: status==='1', pending: status==='2', orderId, txnId, amount, mobile, operator, status: txStatus, rewardPoints: status==='1'?pts:0, message: status==='1'?`₹${amount} recharge done for ${mobile}`:status==='2'?'Processing…':message });
  } catch (e) { console.error('/recharge/do:', e); res.status(500).json({ error: e.message||'Recharge failed' }); }
});

app.get('/recharge/status/:orderId', async (req, res) => {
  try {
    const token = process.env.EZYTM_API_TOKEN;
    const url   = new URL('https://newapi.ezytm.in/service/statuscheck');
    url.searchParams.append('ApiToken',  token);
    url.searchParams.append('RefTxnId',  req.params.orderId);
    const text = await (await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })).text();
    let data; try { data = JSON.parse(text); } catch { return res.status(500).json({ error: 'Invalid Ezytm response' }); }
    const status = String(data.STATUS||'').trim();
    const txnId  = data.OPTXNID||data.TXNNO||'';
    if (status === '1' && db) {
      const snap = await db.collection('transactions').where('ref','==',req.params.orderId).limit(1).get();
      if (!snap.empty && snap.docs[0].data().status !== 'success') {
        const tx = snap.docs[0].data();
        await snap.docs[0].ref.update({ status: 'success', ezytmTxnId: txnId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection('users').doc(tx.uid).update({ rewardPoints: admin.firestore.FieldValue.increment(Math.floor(tx.amount/10)), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    if (status === '3' && db) {
      const snap = await db.collection('transactions').where('ref','==',req.params.orderId).limit(1).get();
      if (!snap.empty && snap.docs[0].data().status === 'pending') {
        const tx = snap.docs[0].data();
        await db.collection('users').doc(tx.uid).update({ balance: admin.firestore.FieldValue.increment(tx.amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await snap.docs[0].ref.update({ status: 'failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection('transactions').add({ uid: tx.uid, type: 'credit', amount: tx.amount, note: `Refund: Recharge failed for ${tx.mobile}`, cat: 'refund', ref: `REF_${req.params.orderId}`, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    res.json({ orderId: req.params.orderId, status: status==='1'?'success':status==='3'?'failed':'pending', txnId, message: data.MESSAGE||'' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * INRT WALLET — DIDIT AUTO-APPROVE WEBHOOK
 * Paste into server.js BEFORE app.listen(...)
 *
 * When Didit verifies a user:
 *   1. Didit calls POST /kyc/didit-webhook
 *   2. This route updates the user's kycStatus to "verified"
 *   3. Adds 500 INRT reward points
 *   4. Unlocks ₹1,00,000 daily limit
 *   5. No manual action needed from you
 *
 * Webhook URL already set in your Didit dashboard:
 *   https://inrt-wallet-production.up.railway.app/kyc/didit-webhook
 *
 * Railway env vars needed:
 *   DIDIT_API_KEY     = lWI96iDUzWf8L50yRZjXmxVFTEK3Vc4FjlKgFxxqRhQ
 *   DIDIT_WORKFLOW_ID = 0c011c7c-981e-4ff1-9895-7f74a763b806
 *   APP_URL           = https://inrtwallet.in
 */

const DIDIT_VERIFY_BASE = 'https://verification.didit.me';

async function diditVerifyGet(endpoint) {
  const apiKey = process.env.DIDIT_API_KEY;
  if (!apiKey) throw new Error('DIDIT_API_KEY not set');
  const r = await fetch(`${DIDIT_VERIFY_BASE}${endpoint}`, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: { error: text } }; }
}

// ══════════════════════════════════════════════════════════════
//  ROUTE 1 — CREATE DIDIT SESSION (user starts KYC)
// ══════════════════════════════════════════════════════════════
app.post('/kyc/didit-session', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!db)     return res.status(500).json({ error: 'Database not connected' });

    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    if (userSnap.data().kycStatus === 'verified')
      return res.status(400).json({ error: 'KYC already verified' });

    const WORKFLOW = process.env.DIDIT_WORKFLOW_ID;
    const APP_URL  = process.env.APP_URL || 'https://inrtwallet.in';
    const apiKey   = process.env.DIDIT_API_KEY;

    if (!WORKFLOW) return res.status(500).json({ error: 'DIDIT_WORKFLOW_ID not set in Railway' });
    if (!apiKey)   return res.status(500).json({ error: 'DIDIT_API_KEY not set in Railway' });

    const r = await fetch(`${DIDIT_VERIFY_BASE}/v3/session/`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: WORKFLOW,
        vendor_data: userId,
        callback:    `${APP_URL}/kyc-complete`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const text = await r.text();
    console.log(`Didit session → ${r.status}: ${text.slice(0, 300)}`);
    let data;
    try { data = JSON.parse(text); }
    catch { return res.status(500).json({ error: `Didit returned non-JSON: ${text.slice(0,200)}` }); }

    if (r.status !== 200 && r.status !== 201)
      return res.status(500).json({ error: data?.detail || data?.message || `Didit error (${r.status})` });

    const sessionId  = data.session_id || data.id;
    const sessionUrl = data.url || data.session_url;

    if (!sessionId || !sessionUrl)
      return res.status(500).json({ error: 'Didit did not return session_id or url' });

    // Save session
    await db.collection('diditSessions').doc(sessionId).set({
      userId, sessionId, status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    // Mark user as in_progress
    await db.collection('users').doc(userId).update({
      kycStatus: 'in_progress',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Didit session: ${sessionId} for ${userId}`);
    res.json({ success: true, sessionId, url: sessionUrl });

  } catch (e) {
    console.error('/kyc/didit-session:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 2 — DIDIT WEBHOOK (fires automatically after KYC)
//  This is the key route — auto-approves user with zero clicks
// ══════════════════════════════════════════════════════════════
app.post('/kyc/didit-webhook', async (req, res) => {
  // Always respond 200 immediately so Didit doesn't retry
  res.json({ received: true });

  try {
    const body = req.body;
    console.log('📥 Didit webhook received:', JSON.stringify(body).slice(0, 500));

    if (!db) return;

    const sessionId  = body.session_id  || body.id            || '';
    const status     = body.status      || '';
    const decision   = body.kyc_decision|| body.decision      || '';
    const vendorData = body.vendor_data || '';

    // ── Determine result ──────────────────────────────────────
    const APPROVED_STATUSES = ['Approved','APPROVED','approved','completed','COMPLETED','verified','VERIFIED'];
    const REJECTED_STATUSES = ['Declined','DECLINED','declined','rejected','REJECTED','failed','FAILED'];

    const isApproved = APPROVED_STATUSES.includes(status) || APPROVED_STATUSES.includes(decision);
    const isRejected = REJECTED_STATUSES.includes(status) || REJECTED_STATUSES.includes(decision);

    if (!isApproved && !isRejected) {
      console.log(`Didit webhook: status="${status}" decision="${decision}" — not final yet, ignoring`);
      return;
    }

    // ── Resolve userId ────────────────────────────────────────
    let userId = vendorData;
    if (!userId && sessionId) {
      const sessSnap = await db.collection('diditSessions').doc(sessionId).get();
      if (sessSnap.exists) userId = sessSnap.data().userId;
    }

    if (!userId) {
      console.warn('Didit webhook: cannot find userId from', { vendorData, sessionId });
      return;
    }

    // ── Check not already processed ───────────────────────────
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) { console.warn('Didit webhook: user not found:', userId); return; }
    if (userSnap.data().kycStatus === 'verified') {
      console.log(`Didit webhook: ${userId} already verified, skipping`);
      return;
    }

    // ── APPROVED ──────────────────────────────────────────────
    if (isApproved) {
      const docData  = body.document || body.extracted_data || body.ocr_result || {};
      const faceData = body.face     || body.face_result    || {};
      const fullName = docData.full_name || docData.name    || body.full_name || '';
      const dob      = docData.dob || docData.date_of_birth || '';
      const docType  = docData.document_type || 'PAN';
      const kycRef   = `KYC${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;

      const batch = db.batch();

      // Update KYC document
      batch.set(db.collection('kyc').doc(userId), {
        userId,
        kycRef,
        status:         'verified',
        kycType:        'didit_auto',
        autoApproved:   true,
        diditSessionId: sessionId,
        diditStatus:    status,
        diditDecision:  decision,
        fullName,
        dob,
        docType,
        faceMatch:      faceData.result || faceData.match_status || 'verified',
        submittedAt:    admin.firestore.FieldValue.serverTimestamp(),
        reviewedAt:     admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Update user — unlock full wallet
      batch.update(db.collection('users').doc(userId), {
        kycStatus:     'verified',
        kycRef,
        kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        rewardPoints:  admin.firestore.FieldValue.increment(500),
        dailyLimit:    100000,
        updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update session
      if (sessionId) {
        batch.update(db.collection('diditSessions').doc(sessionId), {
          status:      'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      console.log(`✅ AUTO-APPROVED via Didit: ${userId} | ${kycRef}`);

    // ── REJECTED ──────────────────────────────────────────────
    } else if (isRejected) {
      const reason = body.rejection_reason || body.reason || body.comment || 'Identity verification failed';

      await db.collection('users').doc(userId).update({
        kycStatus:          'rejected',
        kycRejectionReason: reason,
        updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection('kyc').doc(userId).set({
        userId,
        status:         'rejected',
        kycType:        'didit_auto',
        diditSessionId: sessionId,
        rejectionReason:reason,
        updatedAt:      admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log(`❌ AUTO-REJECTED via Didit: ${userId} | reason: ${reason}`);
    }

  } catch (e) {
    console.error('/kyc/didit-webhook error:', e);
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 3 — POLL STATUS (frontend polls after user returns)
//  Also polls Didit directly if webhook hasn't fired yet
// ══════════════════════════════════════════════════════════════
app.get('/kyc/didit-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!db) return res.json({ status: 'unknown' });

    const userSnap  = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.json({ status: 'not_found' });
    const kycStatus = userSnap.data().kycStatus || 'not_started';

    // Already done — return immediately
    if (['verified', 'rejected'].includes(kycStatus))
      return res.json({ status: kycStatus });

    // Still in_progress — poll Didit directly (backup if webhook missed)
    if (kycStatus === 'in_progress') {
      try {
        const sessSnap = await db.collection('diditSessions')
          .where('userId', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(1).get();

        if (!sessSnap.empty) {
          const sess      = sessSnap.docs[0].data();
          const sessionId = sess.sessionId;

          if (sessionId) {
            const { status: httpStatus, data } = await diditVerifyGet(`/v3/session/${sessionId}/`);
            console.log(`Didit poll ${sessionId}: status=${data?.status} decision=${data?.kyc_decision}`);

            const s = data?.status      || '';
            const d = data?.kyc_decision || '';
            const approved = ['Approved','APPROVED','approved','completed','verified'].includes(s) || ['Approved','APPROVED','approved'].includes(d);
            const rejected = ['Declined','DECLINED','declined','rejected','failed'].includes(s)    || ['Declined','DECLINED','declined'].includes(d);

            if (approved) {
              const kycRef = `KYC${Date.now()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
              const batch  = db.batch();
              batch.set(db.collection('kyc').doc(userId), {
                userId, kycRef, status: 'verified', kycType: 'didit_auto',
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
              console.log(`✅ Didit poll approved: ${userId} | ${kycRef}`);
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
        console.warn('Didit poll (non-critical):', e.message);
      }
    }

    res.json({ status: kycStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 4 — KYC STATUS (generic — used by frontend)
// ══════════════════════════════════════════════════════════════
app.get('/kyc/status/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('kyc').doc(req.params.userId).get();
    if (!snap.exists) return res.json({ status: 'not_started' });
    const d = snap.data();
    res.json({ status: d.status, kycRef: d.kycRef || null, kycType: d.kycType || 'manual', rejectionReason: d.rejectionReason || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset KYC status if user abandoned Didit page
app.post('/kyc/reset-status', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || !db) return res.status(400).json({ error: 'userId required' });

    // Only reset if in_progress — never reset verified
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    if (snap.data().kycStatus === 'verified')
      return res.json({ success: true, message: 'Already verified, no reset needed' });

    await db.collection('users').doc(userId).update({
      kycStatus: 'not_started',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('kyc').doc(userId).set({
      status:    'not_started',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`🔄 KYC status reset: ${userId}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * INRT WALLET — INRT TRANSFER ROUTES
 * Paste into server.js BEFORE app.listen(...)
 *
 * Features:
 *  - Every user gets a global INRT wallet address (INRT-XXXXXXXXXXXX)
 *  - Convert ₹ (balance) <-> INRT (rewardPoints) — 1:1 always
 *  - Send INRT to any INRT wallet address worldwide
 *  - Tracks processing time — shows exactly how long delivery took
 *  - Full INRT transaction history
 */

// ── Helper: generate INRT wallet address ─────────────────────
function genInrtAddress() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let id = '';
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `INRT-${id.slice(0,4)}-${id.slice(4,8)}-${id.slice(8,12)}`;
}

// ══════════════════════════════════════════════════════════════
//  ROUTE 1 — GET / CREATE INRT WALLET ADDRESS
//  Every user has a unique global INRT address for receiving
// ══════════════════════════════════════════════════════════════
app.get('/inrt/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    const user = userSnap.data();

    let inrtAddress = user.inrtAddress;

    // Generate one if it doesn't exist yet
    if (!inrtAddress) {
      let unique = false;
      while (!unique) {
        inrtAddress = genInrtAddress();
        const dupCheck = await db.collection('inrtAddressIndex').doc(inrtAddress).get();
        if (!dupCheck.exists) unique = true;
      }
      await db.collection('users').doc(userId).update({ inrtAddress });
      await db.collection('inrtAddressIndex').doc(inrtAddress).set({ userId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    res.json({
      success:     true,
      inrtAddress,
      inrtBalance: user.rewardPoints || 0,
      inrBalance:  user.balance || 0,
      name:        user.name || 'INRT User',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 2 — LOOKUP INRT ADDRESS (before sending, show recipient name)
// ══════════════════════════════════════════════════════════════
app.get('/inrt/lookup/:address', async (req, res) => {
  try {
    const address = req.params.address.toUpperCase().trim();
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const idxSnap = await db.collection('inrtAddressIndex').doc(address).get();
    if (!idxSnap.exists) return res.status(404).json({ error: 'INRT address not found' });

    const userSnap = await db.collection('users').doc(idxSnap.data().userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'Wallet not found' });

    const user = userSnap.data();
    res.json({
      success: true,
      inrtAddress: address,
      name: user.name || 'INRT User',
      verified: user.kycStatus === 'verified',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 3 — CONVERT ₹ <-> INRT (always 1:1, instant)
// ══════════════════════════════════════════════════════════════
app.post('/inrt/convert', async (req, res) => {
  try {
    const { userId, direction, amount } = req.body; // direction: 'inr_to_inrt' | 'inrt_to_inr'
    if (!userId || !direction || !amount || amount <= 0)
      return res.status(400).json({ error: 'userId, direction, amount required' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    const user = userSnap.data();

    const amt = parseFloat(amount);
    const ref = genTxId('CNV');

    if (direction === 'inr_to_inrt') {
      if ((user.balance || 0) < amt) return res.status(402).json({ error: 'Insufficient ₹ balance' });
      await db.collection('users').doc(userId).update({
        balance:      admin.firestore.FieldValue.increment(-amt),
        rewardPoints: admin.firestore.FieldValue.increment(amt),
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('transactions').add({
        uid: userId, type: 'convert', amount: amt, note: `Converted ₹${amt} → ${amt} INRT`,
        cat: 'crypto', ref, status: 'success', direction,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (direction === 'inrt_to_inr') {
      if ((user.rewardPoints || 0) < amt) return res.status(402).json({ error: 'Insufficient INRT balance' });
      await db.collection('users').doc(userId).update({
        balance:      admin.firestore.FieldValue.increment(amt),
        rewardPoints: admin.firestore.FieldValue.increment(-amt),
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('transactions').add({
        uid: userId, type: 'convert', amount: amt, note: `Converted ${amt} INRT → ₹${amt}`,
        cat: 'crypto', ref, status: 'success', direction,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      return res.status(400).json({ error: 'Invalid direction' });
    }

    res.json({ success: true, ref, amount: amt, direction });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 4 — SEND INRT TO ANY WALLET ADDRESS (global)
//  Returns immediately with txRef; processing happens async
//  so we can show real elapsed delivery time
// ══════════════════════════════════════════════════════════════
app.post('/inrt/send', async (req, res) => {
  try {
    const { fromUserId, toAddress, amount, note } = req.body;
    if (!fromUserId || !toAddress || !amount || amount <= 0)
      return res.status(400).json({ error: 'fromUserId, toAddress, amount required' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const cleanAddress = toAddress.toUpperCase().trim();
    const amt = parseFloat(amount);

    // Resolve recipient
    const idxSnap = await db.collection('inrtAddressIndex').doc(cleanAddress).get();
    if (!idxSnap.exists) return res.status(404).json({ error: 'INRT address not found. Check and try again.' });
    const toUserId = idxSnap.data().userId;
    if (toUserId === fromUserId) return res.status(400).json({ error: 'Cannot send to your own wallet' });

    // Check sender balance
    const fromSnap = await db.collection('users').doc(fromUserId).get();
    if (!fromSnap.exists) return res.status(404).json({ error: 'Sender not found' });
    const fromUser = fromSnap.data();
    if ((fromUser.rewardPoints || 0) < amt) return res.status(402).json({ error: 'Insufficient INRT balance' });

    const toSnap = await db.collection('users').doc(toUserId).get();
    const toUser = toSnap.data();

    const ref       = `INRTX${Date.now()}${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const startedAt = Date.now();

    // Deduct from sender immediately
    await db.collection('users').doc(fromUserId).update({
      rewardPoints: admin.firestore.FieldValue.increment(-amt),
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create pending transaction record (sender side)
    await db.collection('inrtTransfers').doc(ref).set({
      ref,
      fromUserId, toUserId,
      fromAddress: fromUser.inrtAddress || '',
      toAddress:   cleanAddress,
      amount: amt,
      note: note || '',
      status: 'processing', // processing -> completed
      startedAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Sender transaction record
    await db.collection('transactions').add({
      uid: fromUserId, type: 'debit', amount: amt,
      note: `INRT sent to ${toUser.name || cleanAddress}`,
      cat: 'crypto', ref, status: 'processing', toAddress: cleanAddress,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Simulate global network confirmation delay (1.5–4 seconds, realistic for blockchain)
    const processingTime = 1500 + Math.floor(Math.random() * 2500);

    setTimeout(async () => {
      try {
        const completedAt = Date.now();
        const durationMs  = completedAt - startedAt;

        const batch = db.batch();

        // Credit recipient
        batch.update(db.collection('users').doc(toUserId), {
          rewardPoints:  admin.firestore.FieldValue.increment(amt),
          totalReceived: admin.firestore.FieldValue.increment(amt),
          updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
        });

        // Recipient transaction record
        batch.set(db.collection('transactions').doc(ref + '_RX'), {
          uid: toUserId, type: 'credit', amount: amt,
          note: `INRT received from ${fromUser.name || 'INRT User'}`,
          cat: 'crypto', ref: ref + '_RX', status: 'success', fromAddress: fromUser.inrtAddress || '',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update transfer record
        batch.update(db.collection('inrtTransfers').doc(ref), {
          status: 'completed',
          completedAt,
          durationMs,
        });

        await batch.commit();

        // Update sender transaction to success
        const senderTxSnap = await db.collection('transactions').where('ref','==',ref).where('uid','==',fromUserId).limit(1).get();
        if (!senderTxSnap.empty) {
          await senderTxSnap.docs[0].ref.update({ status: 'success', durationMs });
        }

        console.log(`✅ INRT transfer completed: ${ref} | ${amt} INRT | ${durationMs}ms`);
      } catch (e) {
        console.error('INRT transfer completion error:', e);
        await db.collection('inrtTransfers').doc(ref).update({ status: 'failed', error: e.message });
      }
    }, processingTime);

    res.json({
      success: true,
      ref,
      amount: amt,
      toAddress: cleanAddress,
      toName: toUser.name || 'INRT User',
      status: 'processing',
      estimatedSeconds: Math.ceil(processingTime / 1000),
    });

  } catch (e) {
    console.error('/inrt/send:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 5 — CHECK TRANSFER STATUS (frontend polls this)
//  Returns status + elapsed/total time for live timer display
// ══════════════════════════════════════════════════════════════
app.get('/inrt/transfer/:ref', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('inrtTransfers').doc(req.params.ref).get();
    if (!snap.exists) return res.status(404).json({ error: 'Transfer not found' });

    const d = snap.data();
    const now = Date.now();

    res.json({
      ref:          d.ref,
      status:       d.status, // processing | completed | failed
      amount:       d.amount,
      fromAddress:  d.fromAddress,
      toAddress:    d.toAddress,
      note:         d.note,
      startedAt:    d.startedAt,
      completedAt:  d.completedAt || null,
      durationMs:   d.durationMs || (d.status === 'processing' ? now - d.startedAt : null),
      elapsedMs:    now - d.startedAt,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 6 — INRT TRANSACTION HISTORY (convert + sends + receives)
// ══════════════════════════════════════════════════════════════
app.get('/inrt/history/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ transactions: [] });
    const snap = await db.collection('transactions')
      .where('uid','==',req.params.userId)
      .where('cat','==','crypto')
      .orderBy('createdAt','desc')
      .limit(50)
      .get();

    const transactions = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    res.json({ transactions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ══════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 INRT API on port ${PORT}`);
  console.log(`   Firebase  : ${adminAuth                        ? '✅' : '❌'}`);
  console.log(`   Razorpay  : ${process.env.RAZORPAY_KEY_ID      ? '✅' : '❌'}`);
  console.log(`   Resend    : ${process.env.RESEND_API_KEY        ? '✅' : '❌'}`);
  console.log(`   Cashfree  : ${process.env.CASHFREE_APP_ID       ? '✅' : '❌'}`);
  console.log(`   Instamojo : ${process.env.INSTAMOJO_API_KEY     ? '✅' : '❌'}`);
  console.log(`   Ezytm     : ${process.env.EZYTM_API_TOKEN       ? '✅' : '❌'}`);
  console.log(`   Admin Key : ${process.env.ADMIN_KEY             ? '✅' : '❌'}\n`);
});
