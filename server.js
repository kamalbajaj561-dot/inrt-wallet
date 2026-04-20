const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Firebase Admin ─────────────────────────────────────────────
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

// ── Razorpay ───────────────────────────────────────────────────
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.get('/',       (_, res) => res.json({ status: 'INRT API ✅' }));
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

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
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
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
//  SEND OTP EMAIL via Resend
// ══════════════════════════════════════════════════════════════
app.post('/send-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set in Railway env vars' });

    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [process.env.RESEND_TO_EMAIL || `${phone}@inrtwallet.app`],
        subject: `${otp} — Your INRT Wallet OTP`,
        html: `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
  <div style="background:linear-gradient(135deg,#001a2e,#002a45);padding:24px;border-radius:12px;text-align:center;margin-bottom:24px">
    <h1 style="color:#fff;margin:0;font-size:26px">INRT Wallet</h1>
  </div>
  <h2 style="color:#111">Password Reset OTP</h2>
  <div style="background:#f0f9ff;border:2px solid #00b9f1;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
    <p style="color:#6b7280;margin:0 0 8px;font-size:14px">Your OTP is</p>
    <p style="color:#001a2e;font-size:40px;font-weight:900;letter-spacing:12px;margin:0">${otp}</p>
    <p style="color:#9ca3af;font-size:12px;margin:8px 0 0">Valid for 5 minutes · Do not share</p>
  </div>
  <p style="color:#6b7280;font-size:13px">If you didn't request this, ignore this email.</p>
</div>`,
      }),
    });

    const data = await r.json();
    if (!r.ok) { console.error('Resend error:', data); return res.status(500).json({ error: data.message || 'Email send failed' }); }
    console.log(`✅ OTP email sent for +91${phone}`);
    res.json({ success: true });
  } catch (e) { console.error('/send-otp:', e); res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  RESET PASSWORD via Firebase Admin
// ══════════════════════════════════════════════════════════════
app.post('/reset-password', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone || !newPassword) return res.status(400).json({ error: 'phone and newPassword required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Min 6 characters' });
    if (!adminAuth) return res.status(500).json({ error: 'Firebase Admin not connected' });

    const email = `${phone.replace(/\D/g,'')}@inrtwallet.app`;
    const user  = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(user.uid, { password: newPassword });

    console.log(`✅ Password reset for ${email}`);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (e) {
    if (e.code === 'auth/user-not-found')
      return res.status(404).json({ error: 'No account found for this number' });
    console.error('/reset-password:', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 INRT API on port ${PORT}`);
  console.log(`   Razorpay : ${process.env.RAZORPAY_KEY_ID  ? '✅' : '❌ Missing'}`);
  console.log(`   Resend   : ${process.env.RESEND_API_KEY   ? '✅' : '❌ Missing RESEND_API_KEY'}`);
  console.log(`   Firebase : ${adminAuth                     ? '✅' : '❌ Missing'}\n`);
});
