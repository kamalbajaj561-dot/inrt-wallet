const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ── CORS — allow all origins ──────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Razorpay ──────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

console.log('KEY:', process.env.RAZORPAY_KEY_ID);
console.log('SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'OK' : 'MISSING');

// ── Firebase Admin ────────────────────────────────────────────────
let db = null;
try {
  const admin = require('firebase-admin');
  
  // Support both file and env variable for credentials
  let credential;
  if (process.env.GOOGLE_CREDENTIALS) {
    const serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    credential = admin.credential.cert(serviceAccount);
  } else if (require('fs').existsSync('./serviceAccountKey.json')) {
    const serviceAccount = require('./serviceAccountKey.json');
    credential = admin.credential.cert(serviceAccount);
  }
  
  if (credential && !admin.apps.length) {
    admin.initializeApp({ credential });
    db = admin.firestore();
    console.log('Firebase: Connected ✅');
  } else {
    console.log('Firebase: No credentials found');
  }
} catch (e) {
  console.log('Firebase init error:', e.message);
}

// ── HEALTH CHECK ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'INRT Payment Server running ✅', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'INRT Payment Server running ✅' });
});

// ── CREATE ORDER ──────────────────────────────────────────────────
app.post('/create-order', async (req, res) => {
  try {
    const { amount, userId } = req.body;
    console.log('Creating order, amount:', amount, 'userId:', userId);
    
    if (!amount || amount < 10) {
      return res.status(400).json({ error: 'Minimum amount is ₹10' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: { userId: userId || 'unknown' },
    });

    console.log('Order created:', order.id);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to create order',
      details: error.error?.description || ''
    });
  }
});

// ── VERIFY PAYMENT ────────────────────────────────────────────────
app.post('/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      amount,
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Update Firebase if available
    if (db && userId) {
      const admin = require('firebase-admin');
      await db.collection('users').doc(userId).update({
        balance: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('transactions').add({
        uid: userId,
        type: 'credit',
        amount: amount,
        note: 'Added via Razorpay',
        ref: razorpay_payment_id,
        status: 'success',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const rewardPoints = Math.floor(amount / 10);
      if (rewardPoints > 0) {
        await db.collection('users').doc(userId).update({
          rewardPoints: admin.firestore.FieldValue.increment(rewardPoints),
        });
      }
    }

    res.json({ 
      success: true, 
      message: `₹${amount} added to wallet!`,
      rewardPoints: Math.floor(amount / 10)
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed: ' + error.message });
  }
});

// ── START SERVER ──────────────────────────────────────────────────
// Railway uses process.env.PORT — NEVER hardcode 4000
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 INRT Payment Server running on port ${PORT}`);
  console.log(`✅ Razorpay: ${process.env.RAZORPAY_KEY_ID ? 'Connected' : '❌ Missing key!'}`);
});
