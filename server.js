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

/**
 * INRT WALLET — KYC Backend Routes (add to your server.js)
 *
 * These routes call Surepass API from your backend.
 * Never call Surepass from the frontend — your token would be exposed.
 *
 * HOW TO ADD TO YOUR server.js:
 *   Copy everything below the line "// ── KYC ROUTES ──"
 *   Paste it into your server.js before app.listen(...)
 */

// ── Dependencies already in your server.js ──
// const express = require('express');
// const cors    = require('cors');
// require('dotenv').config();
// const admin   = require('firebase-admin');

// ══════════════════════════════════════════════════════════════
// ── KYC ROUTES — paste into server.js ──────────────────────
// ══════════════════════════════════════════════════════════════

/**
 * POST /kyc/aadhaar-send-otp
 * Sends OTP to Aadhaar-linked mobile via Surepass
 * Body: { aadhaarNumber: "123456789012", userId: "firebaseUid" }
 */
app.post('/kyc/aadhaar-send-otp', async (req, res) => {
  try {
    const { aadhaarNumber, userId } = req.body;

    if (!aadhaarNumber || aadhaarNumber.replace(/\s/g,'').length !== 12)
      return res.status(400).json({ error: 'Invalid Aadhaar number' });

    const SUREPASS_TOKEN = process.env.SUREPASS_TOKEN;
    if (!SUREPASS_TOKEN)
      return res.status(500).json({ error: 'SUREPASS_TOKEN not configured in Railway env vars' });

    // Call Surepass Aadhaar OTP generation endpoint
    const response = await fetch('https://kyc-api.surepass.io/api/v1/aadhaar-v2/generate-otp', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUREPASS_TOKEN}`,
      },
      body: JSON.stringify({
        id_number: aadhaarNumber.replace(/\s/g,''),
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status_code !== 200) {
      console.error('Surepass Aadhaar OTP error:', data);
      return res.status(400).json({
        error: data.message || 'Failed to send OTP. Check Aadhaar number.'
      });
    }

    // Log attempt to Firestore (optional, for audit trail)
    if (db && userId) {
      await db.collection('kycAttempts').add({
        userId,
        type:      'aadhaar_otp_sent',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        aadhaarLast4: aadhaarNumber.slice(-4),
      });
    }

    // Return ref_id to frontend (needed for OTP verification)
    res.json({
      success:  true,
      ref_id:   data.data?.ref_id || data.ref_id,
      message:  'OTP sent to Aadhaar-linked mobile',
    });

  } catch (e) {
    console.error('/kyc/aadhaar-send-otp error:', e);
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

/**
 * POST /kyc/aadhaar-verify-otp
 * Verifies OTP and retrieves Aadhaar data from Surepass
 * Body: { otp: "123456", ref_id: "xxxxx", userId: "firebaseUid" }
 */
app.post('/kyc/aadhaar-verify-otp', async (req, res) => {
  try {
    const { otp, ref_id, userId } = req.body;

    if (!otp || otp.length !== 6) return res.status(400).json({ error: 'Invalid OTP' });
    if (!ref_id) return res.status(400).json({ error: 'ref_id required' });

    const SUREPASS_TOKEN = process.env.SUREPASS_TOKEN;
    if (!SUREPASS_TOKEN)
      return res.status(500).json({ error: 'SUREPASS_TOKEN not configured' });

    // Verify OTP with Surepass
    const response = await fetch('https://kyc-api.surepass.io/api/v1/aadhaar-v2/submit-otp', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUREPASS_TOKEN}`,
      },
      body: JSON.stringify({ otp, ref_id }),
    });

    const data = await response.json();

    if (!response.ok || data.status_code !== 200) {
      console.error('Surepass OTP verify error:', data);
      return res.status(400).json({
        error: data.message || 'Invalid OTP or OTP expired'
      });
    }

    // Surepass returns: name, dob, gender, address, zip_code, state, photo
    const aadhaarData = data.data || {};

    // Save partial KYC data to Firestore
    if (db && userId) {
      await db.collection('kyc').doc(userId).set({
        aadhaarVerified:   true,
        aadhaarVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        aadhaarName:       aadhaarData.full_name || '',
        aadhaarDob:        aadhaarData.dob        || '',
        aadhaarGender:     aadhaarData.gender      || '',
        aadhaarState:      aadhaarData.state       || '',
        aadhaarPincode:    aadhaarData.zip_code    || '',
        updatedAt:         admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    res.json({
      success:     true,
      aadhaarData: {
        name:      aadhaarData.full_name  || '',
        dob:       aadhaarData.dob        || '',
        gender:    aadhaarData.gender     || '',
        address:   aadhaarData.address    || '',
        state:     aadhaarData.state      || '',
        zip_code:  aadhaarData.zip_code   || '',
        // Note: We do NOT return the Aadhaar photo to frontend for privacy
      },
      message: 'Aadhaar verified successfully',
    });

  } catch (e) {
    console.error('/kyc/aadhaar-verify-otp error:', e);
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

/**
 * POST /kyc/verify-pan
 * Verifies PAN against Income Tax database via Surepass
 * Body: { panNumber: "ABCDE1234F", userId: "firebaseUid" }
 */
app.post('/kyc/verify-pan', async (req, res) => {
  try {
    const { panNumber, userId } = req.body;

    if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber))
      return res.status(400).json({ error: 'Invalid PAN format' });

    const SUREPASS_TOKEN = process.env.SUREPASS_TOKEN;
    if (!SUREPASS_TOKEN)
      return res.status(500).json({ error: 'SUREPASS_TOKEN not configured' });

    // Verify PAN with Surepass
    const response = await fetch('https://kyc-api.surepass.io/api/v1/pan/pan', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUREPASS_TOKEN}`,
      },
      body: JSON.stringify({ id_number: panNumber }),
    });

    const data = await response.json();

    if (!response.ok || data.status_code !== 200) {
      console.error('Surepass PAN verify error:', data);
      return res.status(400).json({
        error: data.message || 'PAN verification failed. Check PAN number.'
      });
    }

    const panData = data.data || {};

    // Save to Firestore
    if (db && userId) {
      await db.collection('kyc').doc(userId).set({
        panVerified:   true,
        panVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        panName:       panData.full_name  || '',
        panDob:        panData.dob        || '',
        panStatus:     panData.pan_status || 'VALID',
        updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    res.json({
      success: true,
      panData: {
        name:   panData.full_name  || '',
        dob:    panData.dob        || '',
        status: panData.pan_status || 'VALID',
        panType: panData.pan_type  || '',
      },
      message: 'PAN verified successfully',
    });

  } catch (e) {
    console.error('/kyc/verify-pan error:', e);
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

/**
 * POST /kyc/admin/approve
 * Admin-only: approve or reject a KYC submission
 * Body: { userId, action: "approve"|"reject", reason?, adminKey }
 */
app.post('/kyc/admin/approve', async (req, res) => {
  try {
    const { userId, action, reason, adminKey } = req.body;

    if (adminKey !== process.env.ADMIN_KEY)
      return res.status(403).json({ error: 'Unauthorized' });

    if (!['approve','reject'].includes(action))
      return res.status(400).json({ error: 'action must be approve or reject' });

    if (!db)
      return res.status(500).json({ error: 'Firebase not connected' });

    const newStatus  = action === 'approve' ? 'verified' : 'rejected';
    const rewardPts  = action === 'approve' ? 500 : 0; // bonus for completing KYC

    await db.collection('kyc').doc(userId).update({
      status:           newStatus,
      reviewedAt:       admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason:  reason || null,
      updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('users').doc(userId).update({
      kycStatus:      newStatus,
      kycReviewedAt:  admin.firestore.FieldValue.serverTimestamp(),
      ...(action === 'approve' && {
        rewardPoints:  admin.firestore.FieldValue.increment(rewardPts),
        kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      ...(action === 'reject' && {
        kycRejectionReason: reason || 'Documents could not be verified',
      }),
    });

    // TODO: Send push notification / email to user here

    res.json({
      success: true,
      userId,
      status:  newStatus,
      message: action === 'approve'
        ? `KYC approved. 500 reward points added to ${userId}`
        : `KYC rejected. Reason: ${reason}`,
    });

  } catch (e) {
    console.error('/kyc/admin/approve error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /kyc/status/:userId
 * Returns KYC status for a user
 */
app.get('/kyc/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!db) return res.json({ status: 'unknown' });

    const snap = await db.collection('kyc').doc(userId).get();
    if (!snap.exists) return res.json({ status: 'not_started' });

    const d = snap.data();
    res.json({
      status:           d.status,
      kycRef:           d.kycRef,
      submittedAt:      d.submittedAt,
      reviewedAt:       d.reviewedAt,
      rejectionReason:  d.rejectionReason,
      aadhaarVerified:  d.aadhaarVerified || false,
      panVerified:      d.panVerified     || false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * INRT WALLET — CUSTOM PAYMENT ENGINE
 * Paste this into server.js BEFORE app.listen(...)
 *
 * Includes:
 *  - Wallet-to-wallet transfers (zero fees, instant)
 *  - UPI QR code generation (any UPI app can scan)
 *  - UPI webhook to credit wallet when payment received
 *  - Bill payments with 2% cashback
 *  - Mobile recharge
 *  - Refunds
 *  - Balance check
 *  - Business commission earnings tracker
 */

const crypto = require('crypto');

// ── Commission rates — you earn this on every transaction ─────
const COMMISSION = {
  transfer: 0.005,  // 0.5% on transfers above ₹1000
  recharge: 0.02,   // 2% on recharges
  bills:    0.015,  // 1.5% on bill payments
  gold:     0.01,   // 1% on gold
  crypto:   0.01,   // 1% on crypto
};

// ── Generate unique transaction ID ────────────────────────────
function genTxId(prefix = 'TXN') {
  return `${prefix}${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// ── Credit business wallet with commission ────────────────────
async function earnCommission(amount, type) {
  const rate = COMMISSION[type] || 0;
  if (rate <= 0 || amount < 100) return 0;
  const commission = Math.floor(amount * rate);
  if (commission < 1) return 0;
  if (db) {
    await db.collection('businessWallet').doc('earnings').set({
      balance: admin.firestore.FieldValue.increment(commission),
      [`${type}Earnings`]: admin.firestore.FieldValue.increment(commission),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return commission;
}

// ══════════════════════════════════════════════════════════════
//  1. WALLET-TO-WALLET TRANSFER
// ══════════════════════════════════════════════════════════════
app.post('/payment/transfer', async (req, res) => {
  try {
    const { fromUid, toPhone, toUid: directToUid, amount, note } = req.body;
    if (!fromUid)              return res.status(400).json({ error: 'fromUid required' });
    if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
    if (amount > 100000)       return res.status(400).json({ error: 'Max ₹1,00,000 per transfer' });
    if (!db)                   return res.status(500).json({ error: 'Database not connected' });

    // Get sender
    const senderSnap = await db.collection('users').doc(fromUid).get();
    if (!senderSnap.exists) return res.status(404).json({ error: 'Sender not found' });
    const sender = senderSnap.data();

    // Balance check
    if ((sender.balance || 0) < amount)
      return res.status(402).json({ error: `Insufficient balance. Available: ₹${sender.balance || 0}` });

    // Daily limit check
    const today     = new Date().toISOString().split('T')[0];
    const limitKey  = `dailySent_${today}`;
    const dailySent = sender[limitKey] || 0;
    const dailyLimit= sender.kycStatus === 'verified' ? 100000 : 10000;
    if (dailySent + amount > dailyLimit)
      return res.status(402).json({ error: `Daily limit ₹${dailyLimit.toLocaleString('en-IN')} reached. Sent: ₹${dailySent.toLocaleString('en-IN')}` });

    // Resolve receiver
    let toUid = directToUid;
    if (!toUid && toPhone) {
      const phoneSnap = await db.collection('phoneIndex').doc(toPhone.replace(/\D/g,'')).get();
      if (!phoneSnap.exists) return res.status(404).json({ error: 'No INRT Wallet account found for this number' });
      toUid = phoneSnap.data().uid;
    }
    if (!toUid)         return res.status(400).json({ error: 'Receiver not found' });
    if (toUid===fromUid)return res.status(400).json({ error: 'Cannot transfer to yourself' });

    const ref = genTxId('TXN');
    const pts = Math.floor(amount / 10);
    const commission = await earnCommission(amount, 'transfer');

    // Atomic batch write
    const batch = db.batch();

    // Debit sender
    batch.update(db.collection('users').doc(fromUid), {
      balance:       admin.firestore.FieldValue.increment(-amount),
      totalSent:     admin.firestore.FieldValue.increment(amount),
      [limitKey]:    admin.firestore.FieldValue.increment(amount),
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
    });

    // Credit receiver
    batch.update(db.collection('users').doc(toUid), {
      balance:       admin.firestore.FieldValue.increment(amount),
      totalReceived: admin.firestore.FieldValue.increment(amount),
      rewardPoints:  admin.firestore.FieldValue.increment(pts),
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
    });

    // Debit transaction record
    batch.set(db.collection('transactions').doc(ref), {
      uid: fromUid, toUid, type: 'debit', amount,
      note: note || `Transfer to ${toUid}`,
      cat: 'transfer', ref, status: 'success',
      commission, rewardPoints: pts,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Credit transaction record
    batch.set(db.collection('transactions').doc(ref + '_CR'), {
      uid: toUid, fromUid, type: 'credit', amount,
      note: `Received from ${sender.name || 'INRT User'}`,
      cat: 'transfer', ref: ref + '_CR', status: 'success',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    res.json({
      success: true, ref, amount, commission, rewardPoints: pts,
      message: `₹${amount.toLocaleString('en-IN')} transferred successfully`,
    });
  } catch (e) {
    console.error('/payment/transfer:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  2. GENERATE UPI QR CODE
//  User shows QR → payer scans with GPay / PhonePe / Paytm
// ══════════════════════════════════════════════════════════════
app.post('/payment/generate-upi-qr', async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!db)     return res.status(500).json({ error: 'DB not connected' });

    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });

    const user      = userSnap.data();
    const upiId     = user.upiId || `${user.phone}@inrt`;
    const txnId     = genTxId('UPI');
    const payeeName = encodeURIComponent(user.name || 'INRT Wallet');
    const amtParam  = amount ? `&am=${amount}` : '';
    const noteParam = note   ? `&tn=${encodeURIComponent(note)}` : '';

    // Standard UPI deep link — works with ALL UPI apps (GPay, PhonePe, Paytm etc.)
    const upiString  = `upi://pay?pa=${upiId}&pn=${payeeName}&tr=${txnId}${amtParam}${noteParam}&cu=INR`;
    // Free QR image API — no key needed
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiString)}`;

    // Save pending payment to track it
    await db.collection('pendingPayments').doc(txnId).set({
      userId, upiId, amount: amount || null,
      note: note || '', txnId, status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
    });

    res.json({
      success: true, txnId, upiId, upiString, qrImageUrl,
      amount: amount || null,
      message: 'QR generated. User can scan with any UPI app.',
    });
  } catch (e) {
    console.error('/payment/generate-upi-qr:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  3. CHECK UPI PAYMENT STATUS (poll every 3 seconds)
// ══════════════════════════════════════════════════════════════
app.get('/payment/check-upi/:txnId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('pendingPayments').doc(req.params.txnId).get();
    if (!snap.exists) return res.json({ status: 'not_found' });
    const data = snap.data();
    if (Date.now() > data.expiresAt) {
      await snap.ref.update({ status: 'expired' });
      return res.json({ status: 'expired' });
    }
    res.json({ status: data.status, amount: data.amount, txnId: req.params.txnId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  4. UPI WEBHOOK — credits wallet when UPI payment received
//  Connect your UPI VPA to this URL in your bank's dashboard
// ══════════════════════════════════════════════════════════════
app.post('/payment/upi-webhook', async (req, res) => {
  try {
    // Verify signature if processor sends one
    const webhookSecret = process.env.UPI_WEBHOOK_SECRET;
    if (webhookSecret) {
      const sig      = req.headers['x-webhook-signature'] || '';
      const expected = crypto.createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body)).digest('hex');
      if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' });
    }

    const { txnId, amount, payerVpa, status } = req.body;
    if (!txnId || !amount || status !== 'SUCCESS') return res.json({ received: true });
    if (!db) return res.json({ received: true });

    const pendingSnap = await db.collection('pendingPayments').doc(txnId).get();
    if (!pendingSnap.exists) return res.json({ received: true });
    const pending = pendingSnap.data();
    if (pending.status === 'success') return res.json({ received: true }); // already processed

    const ref = genTxId('UPI');
    const pts = Math.floor(amount / 10);

    const batch = db.batch();
    batch.update(db.collection('users').doc(pending.userId), {
      balance:       admin.firestore.FieldValue.increment(parseFloat(amount)),
      totalReceived: admin.firestore.FieldValue.increment(parseFloat(amount)),
      rewardPoints:  admin.firestore.FieldValue.increment(pts),
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('transactions').doc(ref), {
      uid: pending.userId, type: 'credit', amount: parseFloat(amount),
      note: `UPI payment from ${payerVpa || 'UPI'}`,
      cat: 'add_money', ref, status: 'success',
      payerVpa, upiTxnId: txnId, rewardPoints: pts,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.update(pendingSnap.ref, {
      status: 'success',
      paidAt: admin.firestore.FieldValue.serverTimestamp(), ref,
    });
    await batch.commit();

    console.log(`✅ UPI credited: ₹${amount} → ${pending.userId}`);
    res.json({ received: true, credited: true });
  } catch (e) {
    console.error('/payment/upi-webhook:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  5. ADMIN CREDIT (manually add money to any wallet)
// ══════════════════════════════════════════════════════════════
app.post('/payment/admin-credit', async (req, res) => {
  try {
    const { userId, amount, note, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!userId || !amount) return res.status(400).json({ error: 'userId and amount required' });
    if (!db) return res.status(500).json({ error: 'DB not connected' });

    const ref = genTxId('ADM');
    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), {
      balance:   admin.firestore.FieldValue.increment(parseFloat(amount)),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('transactions').doc(ref), {
      uid: userId, type: 'credit', amount: parseFloat(amount),
      note: note || 'Admin credit', cat: 'add_money', ref, status: 'success',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    res.json({ success: true, ref, amount, message: `₹${amount} credited to ${userId}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  6. BILL PAYMENT
// ══════════════════════════════════════════════════════════════
app.post('/payment/bill', async (req, res) => {
  try {
    const { userId, amount, category, provider, accountNo } = req.body;
    if (!userId || !amount || !category) return res.status(400).json({ error: 'userId, amount, category required' });
    if (!db) return res.status(500).json({ error: 'DB not connected' });

    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    if ((userSnap.data().balance || 0) < amount)
      return res.status(402).json({ error: `Insufficient balance. Available: ₹${userSnap.data().balance || 0}` });

    const ref        = genTxId('BILL');
    const cashback   = Math.floor(amount * 0.02);
    const pts        = Math.floor(amount / 10);
    const commission = await earnCommission(amount, 'bills');

    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), {
      balance:      admin.firestore.FieldValue.increment(-amount + cashback),
      cashback:     admin.firestore.FieldValue.increment(cashback),
      rewardPoints: admin.firestore.FieldValue.increment(pts),
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('transactions').doc(ref), {
      uid: userId, type: 'debit', amount,
      note: `${category} — ${provider || ''}`, cat: 'bills',
      ref, status: 'success', accountNo, cashback, commission, rewardPoints: pts,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();

    res.json({
      success: true, ref, amount, cashback, rewardPoints: pts, commission,
      message: `Bill paid! ₹${cashback} cashback added.`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  7. MOBILE RECHARGE
// ══════════════════════════════════════════════════════════════
app.post('/payment/recharge', async (req, res) => {
  try {
    const { userId, amount, mobile, operator, rechargeType } = req.body;
    if (!userId || !amount || !mobile) return res.status(400).json({ error: 'userId, amount, mobile required' });
    if (!db) return res.status(500).json({ error: 'DB not connected' });

    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    if ((userSnap.data().balance || 0) < amount)
      return res.status(402).json({ error: 'Insufficient balance' });

    const ref        = genTxId('RCH');
    const pts        = Math.floor(amount / 10);
    const commission = await earnCommission(amount, 'recharge');

    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), {
      balance:      admin.firestore.FieldValue.increment(-amount),
      rewardPoints: admin.firestore.FieldValue.increment(pts),
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('transactions').doc(ref), {
      uid: userId, type: 'debit', amount,
      note: `${operator || 'Mobile'} ${rechargeType || 'Prepaid'} — ${mobile}`,
      cat: 'recharge', ref, status: 'success',
      mobile, operator, commission, rewardPoints: pts,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();

    res.json({
      success: true, ref, amount, rewardPoints: pts, commission,
      message: `₹${amount} recharge done for ${mobile}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  8. REFUND
// ══════════════════════════════════════════════════════════════
app.post('/payment/refund', async (req, res) => {
  try {
    const { txId, reason, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!db) return res.status(500).json({ error: 'DB not connected' });

    const txSnap = await db.collection('transactions').doc(txId).get();
    if (!txSnap.exists)         return res.status(404).json({ error: 'Transaction not found' });
    if (txSnap.data().status === 'refunded') return res.status(400).json({ error: 'Already refunded' });

    const tx = txSnap.data();
    const refundRef = genTxId('REF');

    const batch = db.batch();
    batch.update(db.collection('users').doc(tx.uid), {
      balance:   admin.firestore.FieldValue.increment(tx.amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.update(db.collection('transactions').doc(txId), { status: 'refunded', refundRef });
    batch.set(db.collection('transactions').doc(refundRef), {
      uid: tx.uid, type: 'credit', amount: tx.amount,
      note: `Refund: ${reason || 'Customer request'}`,
      cat: 'refund', ref: refundRef, status: 'success', originalTxId: txId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();

    res.json({ success: true, refundRef, amount: tx.amount, message: 'Refund processed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  9. GET BALANCE
// ══════════════════════════════════════════════════════════════
app.get('/payment/balance/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ balance: 0 });
    const snap = await db.collection('users').doc(req.params.userId).get();
    if (!snap.exists) return res.json({ balance: 0 });
    res.json({ balance: snap.data().balance || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  10. BUSINESS EARNINGS
// ══════════════════════════════════════════════════════════════
app.get('/payment/earnings', async (req, res) => {
  try {
    if (req.query.adminKey !== process.env.ADMIN_KEY)
      return res.status(403).json({ error: 'Unauthorized' });
    if (!db) return res.json({ earnings: {} });
    const snap = await db.collection('businessWallet').doc('earnings').get();
    res.json({ earnings: snap.exists ? snap.data() : { balance: 0 } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * INRT WALLET — CASHFREE PAYOUTS ROUTES
 *
 * Paste into server.js BEFORE app.listen(...)
 *
 * What this does:
 *   - Send money to ANY UPI ID (GPay, PhonePe, Paytm, bank UPI)
 *   - Send money to ANY bank account (IMPS/NEFT)
 *   - 100% silent — no popup, no redirect, no third-party UI
 *   - Users only ever see YOUR app screens
 *
 * Cashfree Payouts pricing:
 *   UPI transfer:  ₹2-3 per transaction
 *   Bank transfer: ₹3-5 per transaction
 *   Free tier:     First 1000 payouts free (test)
 */

const crypto = require('crypto');

// ── Cashfree config ───────────────────────────────────────────
const CF_BASE = process.env.NODE_ENV === 'production'
  ? 'https://payout-api.cashfree.com'     // production
  : 'https://payout-gamma.cashfree.com';  // sandbox/test

// ── Get Cashfree auth token (valid 30 min, cache it) ─────────
let cfToken      = null;
let cfTokenExpiry= 0;

async function getCFToken() {
  if (cfToken && Date.now() < cfTokenExpiry) return cfToken;

  const appId  = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secret) throw new Error('CASHFREE_APP_ID and CASHFREE_SECRET_KEY not set in Railway env vars');

  const r = await fetch(`${CF_BASE}/payout/v1/authorize`, {
    method: 'POST',
    headers: {
      'X-Client-Id':     appId,
      'X-Client-Secret': secret,
      'Content-Type':    'application/json',
    },
  });

  const d = await r.json();
  if (d.status !== 'SUCCESS') throw new Error(`Cashfree auth failed: ${d.message}`);

  cfToken       = d.data.token;
  cfTokenExpiry = Date.now() + 25 * 60 * 1000; // 25 min cache
  return cfToken;
}

// ── Cashfree API helper ───────────────────────────────────────
async function cfPost(endpoint, body) {
  const token = await getCFToken();
  const r = await fetch(`${CF_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
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

// ── Generate transfer ID ──────────────────────────────────────
function genTransferId() {
  return `INRT${Date.now()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// ══════════════════════════════════════════════════════════════
//  ROUTE 1 — SEND TO UPI ID (most common — silent, no popup)
//  e.g. send to 9876543210@ybl, name@okhdfcbank etc.
// ══════════════════════════════════════════════════════════════
app.post('/payout/send-upi', async (req, res) => {
  try {
    const { fromUid, toUpiId, amount, note, name } = req.body;

    // ── Validate ──────────────────────────────────────────────
    if (!fromUid)              return res.status(400).json({ error: 'fromUid required' });
    if (!toUpiId)              return res.status(400).json({ error: 'UPI ID required (e.g. 9876543210@ybl)' });
    if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });
    if (amount > 100000)       return res.status(400).json({ error: 'Max ₹1,00,000 per transfer' });
    if (!db)                   return res.status(500).json({ error: 'Database not connected' });

    // ── Check sender balance ──────────────────────────────────
    const senderSnap = await db.collection('users').doc(fromUid).get();
    if (!senderSnap.exists) return res.status(404).json({ error: 'Sender account not found' });

    const sender    = senderSnap.data();
    const balance   = sender.balance || 0;
    const kycStatus = sender.kycStatus || 'not_started';

    if (balance < amount)
      return res.status(402).json({ error: `Insufficient balance. Available: ₹${balance.toLocaleString('en-IN')}` });

    // ── Daily limit check ─────────────────────────────────────
    const today      = new Date().toISOString().split('T')[0];
    const limitKey   = `dailySent_${today}`;
    const dailySent  = sender[limitKey] || 0;
    const dailyLimit = kycStatus === 'verified' ? 100000 : 10000;

    if (dailySent + amount > dailyLimit)
      return res.status(402).json({
        error: `Daily limit ₹${dailyLimit.toLocaleString('en-IN')} reached. Complete KYC to increase limit.`
      });

    const transferId = genTransferId();

    // ── Deduct from wallet FIRST (reserve funds) ──────────────
    await db.collection('users').doc(fromUid).update({
      balance:    admin.firestore.FieldValue.increment(-amount),
      [limitKey]: admin.firestore.FieldValue.increment(amount),
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── Call Cashfree Payouts API (completely silent) ─────────
    const cfResponse = await cfPost('/payout/v1/directTransfer', {
      amount:        amount,
      transferId:    transferId,
      transferMode:  'upi',
      remarks:       note || `INRT Transfer from ${sender.name || sender.phone}`,
      beneDetails: {
        beneId:  `BENE_${toUpiId.replace(/[@.]/g, '_')}`,
        name:    name || 'UPI Recipient',
        vpa:     toUpiId,
      },
    });

    if (cfResponse.status !== 'SUCCESS') {
      // Refund if Cashfree rejected
      await db.collection('users').doc(fromUid).update({
        balance:    admin.firestore.FieldValue.increment(amount),
        [limitKey]: admin.firestore.FieldValue.increment(-amount),
        updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new Error(cfResponse.message || 'Transfer failed. Please check the UPI ID.');
    }

    // ── Log successful transaction ────────────────────────────
    const pts = Math.floor(amount / 10);
    await db.collection('transactions').add({
      uid:         fromUid,
      type:        'debit',
      amount,
      note:        note || `Sent to ${toUpiId}`,
      cat:         'transfer',
      ref:         transferId,
      toUpiId,
      status:      'success',
      method:      'cashfree_upi',
      rewardPoints: pts,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    // Add reward points
    await db.collection('users').doc(fromUid).update({
      rewardPoints: admin.firestore.FieldValue.increment(pts),
      totalSent:    admin.firestore.FieldValue.increment(amount),
    });

    res.json({
      success:      true,
      transferId,
      amount,
      toUpiId,
      rewardPoints: pts,
      message:      `₹${amount.toLocaleString('en-IN')} sent to ${toUpiId} successfully`,
    });

  } catch (e) {
    console.error('/payout/send-upi:', e);
    res.status(500).json({ error: e.message || 'Transfer failed' });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 2 — SEND TO BANK ACCOUNT (IMPS/NEFT)
//  For users who want to send to bank account directly
// ══════════════════════════════════════════════════════════════
app.post('/payout/send-bank', async (req, res) => {
  try {
    const { fromUid, accountNo, ifsc, accountName, amount, note } = req.body;

    if (!fromUid || !accountNo || !ifsc || !accountName || !amount)
      return res.status(400).json({ error: 'fromUid, accountNo, ifsc, accountName, amount required' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    // ── Check sender ──────────────────────────────────────────
    const senderSnap = await db.collection('users').doc(fromUid).get();
    if (!senderSnap.exists) return res.status(404).json({ error: 'Sender not found' });

    const sender  = senderSnap.data();
    const balance = sender.balance || 0;

    if (balance < amount)
      return res.status(402).json({ error: `Insufficient balance. Available: ₹${balance.toLocaleString('en-IN')}` });

    const transferId = genTransferId();

    // ── Deduct from wallet ────────────────────────────────────
    await db.collection('users').doc(fromUid).update({
      balance:   admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── Cashfree bank transfer (IMPS) ─────────────────────────
    const cfResponse = await cfPost('/payout/v1/directTransfer', {
      amount,
      transferId,
      transferMode: 'imps',
      remarks:      note || `INRT Bank Transfer`,
      beneDetails: {
        beneId:      `BENE_${accountNo}`,
        name:        accountName,
        bankAccount: accountNo,
        ifsc:        ifsc.toUpperCase(),
      },
    });

    if (cfResponse.status !== 'SUCCESS') {
      // Refund on failure
      await db.collection('users').doc(fromUid).update({
        balance:   admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new Error(cfResponse.message || 'Bank transfer failed. Check account details.');
    }

    // ── Log transaction ───────────────────────────────────────
    await db.collection('transactions').add({
      uid: fromUid, type: 'debit', amount,
      note: note || `Bank transfer to ${accountName}`,
      cat: 'transfer', ref: transferId,
      accountNo: accountNo.slice(-4).padStart(accountNo.length, 'X'),
      ifsc, accountName, status: 'success', method: 'cashfree_imps',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('users').doc(fromUid).update({
      rewardPoints: admin.firestore.FieldValue.increment(Math.floor(amount/10)),
      totalSent:    admin.firestore.FieldValue.increment(amount),
    });

    res.json({
      success: true, transferId, amount, accountName,
      message: `₹${amount.toLocaleString('en-IN')} sent to ${accountName}'s bank account`,
    });

  } catch (e) {
    console.error('/payout/send-bank:', e);
    res.status(500).json({ error: e.message || 'Bank transfer failed' });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 3 — VALIDATE UPI ID BEFORE SENDING
//  Check if a UPI ID is valid and get the account name
//  Call this before showing the confirm screen
// ══════════════════════════════════════════════════════════════
app.post('/payout/validate-upi', async (req, res) => {
  try {
    const { upiId } = req.body;
    if (!upiId) return res.status(400).json({ error: 'UPI ID required' });

    const d = await cfPost('/payout/v1/validation/upiDetails', { vpa: upiId });

    if (d.status !== 'SUCCESS')
      return res.status(400).json({ error: 'Invalid UPI ID. Please check and try again.' });

    res.json({
      valid:   true,
      name:    d.data?.name     || 'UPI Account',
      upiId:   d.data?.vpa      || upiId,
      bankName:d.data?.bankName || '',
    });

  } catch (e) {
    console.error('/payout/validate-upi:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 4 — CHECK TRANSFER STATUS
// ══════════════════════════════════════════════════════════════
app.get('/payout/status/:transferId', async (req, res) => {
  try {
    const d = await cfGet(`/payout/v1/getTransferStatus?transferId=${req.params.transferId}`);
    res.json({
      transferId: req.params.transferId,
      status:     d.data?.transfer?.status || 'UNKNOWN',
      amount:     d.data?.transfer?.amount,
      utr:        d.data?.transfer?.utr || null, // bank reference number
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 5 — CASHFREE WEBHOOK (transfer status update)
//  Add this URL in Cashfree dashboard → Payouts → Webhooks
// ══════════════════════════════════════════════════════════════
app.post('/payout/webhook', async (req, res) => {
  try {
    const { event, transferId, status, utr, reason } = req.body;
    if (!db || !transferId) return res.json({ received: true });

    // Find the transaction by ref
    const snap = await db.collection('transactions')
      .where('ref', '==', transferId).limit(1).get();

    if (snap.empty) return res.json({ received: true });

    const txDoc = snap.docs[0];
    const tx    = txDoc.data();

    if (status === 'SUCCESS') {
      await txDoc.ref.update({ status: 'success', utr, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else if (status === 'FAILED' || status === 'REVERSED') {
      // Refund the user
      await db.collection('users').doc(tx.uid).update({
        balance:   admin.firestore.FieldValue.increment(tx.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await txDoc.ref.update({
        status: 'failed', failReason: reason || 'Transfer failed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Add refund transaction record
      await db.collection('transactions').add({
        uid: tx.uid, type: 'credit', amount: tx.amount,
        note: `Refund: Transfer to ${tx.toUpiId || tx.accountName} failed`,
        cat: 'refund', ref: `REF_${transferId}`, status: 'success',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`Cashfree webhook: ${transferId} → ${status}`);
    res.json({ received: true });
  } catch (e) {
    console.error('/payout/webhook:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  ROUTE 6 — WITHDRAW TO OWN BANK (user withdraws from wallet)
// ══════════════════════════════════════════════════════════════
app.post('/payout/withdraw', async (req, res) => {
  try {
    const { userId, amount, upiId } = req.body;

    if (!userId || !amount || !upiId)
      return res.status(400).json({ error: 'userId, amount, upiId required' });
    if (amount < 100) return res.status(400).json({ error: 'Minimum withdrawal ₹100' });
    if (!db) return res.status(500).json({ error: 'DB not connected' });

    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });

    const user = snap.data();
    if (user.kycStatus !== 'verified')
      return res.status(403).json({ error: 'Complete KYC to withdraw money to your bank' });

    if ((user.balance || 0) < amount)
      return res.status(402).json({ error: `Insufficient balance. Available: ₹${user.balance || 0}` });

    const transferId = genTransferId();

    // Deduct from wallet
    await db.collection('users').doc(userId).update({
      balance:   admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send to user's UPI via Cashfree
    const cfResponse = await cfPost('/payout/v1/directTransfer', {
      amount, transferId,
      transferMode: 'upi',
      remarks: 'INRT Wallet Withdrawal',
      beneDetails: {
        beneId: `USER_${userId}`,
        name:   user.name || 'INRT User',
        vpa:    upiId,
      },
    });

    if (cfResponse.status !== 'SUCCESS') {
      await db.collection('users').doc(userId).update({
        balance:   admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      throw new Error(cfResponse.message || 'Withdrawal failed');
    }

    await db.collection('transactions').add({
      uid: userId, type: 'debit', amount,
      note: `Withdrawal to ${upiId}`,
      cat: 'withdrawal', ref: transferId,
      toUpiId: upiId, status: 'success', method: 'cashfree_upi',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      success: true, transferId, amount,
      message: `₹${amount.toLocaleString('en-IN')} withdrawn to ${upiId}. Credited in minutes.`,
    });

  } catch (e) {
    console.error('/payout/withdraw:', e);
    res.status(500).json({ error: e.message || 'Withdrawal failed' });
  }
});




app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 INRT API on port ${PORT}`);
  console.log(`   Razorpay : ${process.env.RAZORPAY_KEY_ID  ? '✅' : '❌ Missing'}`);
  console.log(`   Resend   : ${process.env.RESEND_API_KEY   ? '✅' : '❌ Missing RESEND_API_KEY'}`);
  console.log(`   Firebase : ${adminAuth                     ? '✅' : '❌ Missing'}\n`);
});
