/**
 * INRT WALLET — server.js FINAL
 * All routes in one file, no duplicates, no crashes
 * KYC: Didit auto-approve + Manual PAN fallback
 * Blockchain: INRT on Polygon via ethers.js
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

// ── Polygon / ethers.js ───────────────────────────────────────
let inrtContract = null;
let adminWallet  = null;

try {
  const { ethers } = require('ethers');
  const POLYGON_RPC       = process.env.POLYGON_RPC || 'https://polygon-rpc.com';
  const CONTRACT_ADDRESS  = process.env.INRT_CONTRACT_ADDRESS;
  const ADMIN_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;

  const INRT_ABI = [
    'function mint(address to, uint256 amount) external',
    'function burn(address from, uint256 amount) external',
    'function balanceOf(address account) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function paused() view returns (bool)',
  ];

  if (CONTRACT_ADDRESS && ADMIN_PRIVATE_KEY) {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    adminWallet    = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    inrtContract   = new ethers.Contract(CONTRACT_ADDRESS, INRT_ABI, adminWallet);
    console.log('✅ INRT Contract connected:', CONTRACT_ADDRESS);
  } else {
    console.warn('⚠️  INRT Contract not configured — add INRT_CONTRACT_ADDRESS and ADMIN_WALLET_PRIVATE_KEY to Railway');
  }

  // ── Blockchain helpers ──────────────────────────────────────
  global.mintINRT = async function(toWalletAddress, amount) {
    if (!inrtContract) throw new Error('Contract not configured');
    const { ethers: e } = require('ethers');
    const amountWei = e.parseUnits(amount.toString(), 18);
    const tx = await inrtContract.mint(toWalletAddress, amountWei);
    const receipt = await tx.wait();
    console.log(`✅ Minted ${amount} INRT to ${toWalletAddress} | tx: ${tx.hash}`);
    return { txHash: tx.hash, blockNumber: receipt.blockNumber };
  };

  global.burnINRT = async function(fromWalletAddress, amount) {
    if (!inrtContract) throw new Error('Contract not configured');
    const { ethers: e } = require('ethers');
    const amountWei = e.parseUnits(amount.toString(), 18);
    const tx = await inrtContract.burn(fromWalletAddress, amountWei);
    const receipt = await tx.wait();
    console.log(`✅ Burned ${amount} INRT from ${fromWalletAddress} | tx: ${tx.hash}`);
    return { txHash: tx.hash, blockNumber: receipt.blockNumber };
  };

  global.getOnChainBalance = async function(walletAddress) {
    if (!inrtContract) return 0;
    const { ethers: e } = require('ethers');
    const bal = await inrtContract.balanceOf(walletAddress);
    return parseFloat(e.formatUnits(bal, 18));
  };

  global.getOnChainTotalSupply = async function() {
    if (!inrtContract) return 0;
    const { ethers: e } = require('ethers');
    const supply = await inrtContract.totalSupply();
    return parseFloat(e.formatUnits(supply, 18));
  };

} catch (e) {
  console.warn('⚠️  ethers.js not available:', e.message, '— run: npm install ethers');
  global.mintINRT           = async () => { throw new Error('ethers.js not installed'); };
  global.burnINRT           = async () => { throw new Error('ethers.js not installed'); };
  global.getOnChainBalance  = async () => 0;
  global.getOnChainTotalSupply = async () => 0;
}

/* ═══ HIDDEN FOR LAUNCH — CASHFREE CONFIG & HELPERS — commented out pending payout approval ═══
const CF_BASE = process.env.NODE_ENV === 'production'
  ? 'https://payout-api.cashfree.com'
  : 'https://payout-gamma.cashfree.com';
let cfToken = null, cfTokenExpiry = 0;
async function getCFToken() { ... }
async function cfPost(endpoint, body) { ... }
async function cfGet(endpoint) { ... }
═══ END HIDDEN ═══ */

/* ═══ HIDDEN FOR LAUNCH — INSTAMOJO CONFIG ═══
async function instamojoPost(endpoint, data) { ... }
async function instamojoGet(endpoint) { ... }
═══ END HIDDEN ═══ */

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
//  POLYGON — ON-CHAIN INRT ROUTES
// ══════════════════════════════════════════════════════════════

// Get on-chain INRT balance for a Polygon wallet address
app.get('/polygon/balance/:walletAddress', async (req, res) => {
  try {
    const balance = await global.getOnChainBalance(req.params.walletAddress);
    res.json({ success: true, walletAddress: req.params.walletAddress, balance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get total INRT supply on-chain
app.get('/polygon/supply', async (req, res) => {
  try {
    const totalSupply = await global.getOnChainTotalSupply();
    const contractAddress = process.env.INRT_CONTRACT_ADDRESS || null;
    res.json({ success: true, totalSupply, contractAddress, network: 'Polygon Mainnet' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Connect user's Polygon wallet address to their INRT account
app.post('/polygon/connect-wallet', async (req, res) => {
  try {
    const { userId, walletAddress } = req.body;
    if (!userId || !walletAddress) return res.status(400).json({ error: 'userId and walletAddress required' });
    if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) return res.status(400).json({ error: 'Invalid Polygon wallet address' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    // Check address not already used by another user
    const dupSnap = await db.collection('users')
      .where('polygonWallet', '==', walletAddress.toLowerCase())
      .limit(2).get();
    if (dupSnap.docs.some(d => d.id !== userId))
      return res.status(400).json({ error: 'This wallet address is already connected to another account' });

    await db.collection('users').doc(userId).update({
      polygonWallet:      walletAddress.toLowerCase(),
      polygonConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:          admin.firestore.FieldValue.serverTimestamp(),
    });

    // Get on-chain balance
    const onChainBalance = await global.getOnChainBalance(walletAddress);

    console.log(`✅ Polygon wallet connected: ${userId} → ${walletAddress}`);
    res.json({ success: true, walletAddress, onChainBalance });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mint INRT on-chain to user's Polygon wallet (called after Razorpay payment)
app.post('/polygon/mint', async (req, res) => {
  try {
    const { userId, walletAddress, amount, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!userId || !walletAddress || !amount) return res.status(400).json({ error: 'userId, walletAddress, amount required' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });

    const result = await global.mintINRT(walletAddress, parseFloat(amount));

    // Log in Firebase
    await db.collection('transactions').add({
      uid: userId, type: 'credit', amount: parseFloat(amount),
      note: `${amount} INRT minted on Polygon`,
      cat: 'crypto', ref: result.txHash, status: 'success',
      method: 'polygon_mint', txHash: result.txHash,
      blockNumber: result.blockNumber, walletAddress,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, ...result, amount, walletAddress });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
//  CHECKOUT — BUY INRT VIA RAZORPAY
//  Credits inrtBalance in Firebase + mints on Polygon if wallet connected
// ══════════════════════════════════════════════════════════════
app.post('/checkout/verify-inrt-purchase', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, amount } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId || !amount)
      return res.status(400).json({ error: 'Missing fields' });
    if (!db) return res.status(500).json({ error: 'DB not connected' });

    // Verify signature
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (expected !== razorpay_signature) return res.status(400).json({ error: 'Invalid payment signature' });

    // Idempotency check
    const existing = await db.collection('transactions').where('ref', '==', `INRT_BUY_${razorpay_payment_id}`).limit(1).get();
    if (!existing.empty) return res.json({ success: true, message: 'Already credited', duplicate: true });

    const amt = parseFloat(amount);
    const ref = `INRT_BUY_${razorpay_payment_id}`;

    // Get user's Polygon wallet if connected
    const userSnap = await db.collection('users').doc(userId).get();
    const user = userSnap.exists ? userSnap.data() : {};
    const polygonWallet = user.polygonWallet || null;

    // Credit in Firebase
    const batch = db.batch();
    batch.update(db.collection('users').doc(userId), {
      inrtBalance:   admin.firestore.FieldValue.increment(amt),
      totalReceived: admin.firestore.FieldValue.increment(amt),
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(db.collection('transactions').doc(ref), {
      uid: userId, type: 'credit', amount: amt,
      note: `Bought ${amt.toLocaleString()} INRT via Razorpay`,
      cat: 'crypto', ref, status: 'success', method: 'razorpay',
      razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    console.log(`✅ INRT purchased: ${amt} → ${userId}`);

    // Also mint on Polygon if user has connected wallet
    let txHash = null;
    if (polygonWallet && inrtContract) {
      try {
        const result = await global.mintINRT(polygonWallet, amt);
        txHash = result.txHash;
        // Update transaction with tx hash
        await db.collection('transactions').doc(ref).update({
          txHash, blockNumber: result.blockNumber, polygonWallet,
        });
        console.log(`✅ Also minted on Polygon: ${amt} INRT → ${polygonWallet}`);
      } catch (e) {
        console.warn('Polygon mint failed (Firebase credited OK):', e.message);
      }
    }

    res.json({
      success: true, amount: amt, ref, message: `${amt.toLocaleString()} INRT credited`,
      polygonMinted: !!txHash, txHash,
      polygonWallet: polygonWallet || null,
    });
  } catch (e) {
    console.error('/checkout/verify-inrt-purchase:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  OTP EMAIL
// ══════════════════════════════════════════════════════════════
app.post('/send-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });
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
    if (!adminAuth) return res.status(500).json({ error: 'Firebase Admin not connected' });
    const email = `${phone.replace(/\D/g, '')}@inrtwallet.app`;
    const user  = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(user.uid, { password: newPassword });
    res.json({ success: true });
  } catch (e) {
    if (e.code === 'auth/user-not-found') return res.status(404).json({ error: 'No account found' });
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  KYC — DIDIT AUTO-APPROVE
// ══════════════════════════════════════════════════════════════
const DIDIT_BASE = 'https://verification.didit.me';

async function diditGet(endpoint) {
  const r = await fetch(`${DIDIT_BASE}${endpoint}`, {
    headers: { 'x-api-key': process.env.DIDIT_API_KEY || '' },
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: { error: text } }; }
}

app.post('/kyc/didit-session', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || !db) return res.status(400).json({ error: 'userId required' });
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    if (snap.data().kycStatus === 'verified') return res.status(400).json({ error: 'Already verified' });
    const WORKFLOW = process.env.DIDIT_WORKFLOW_ID;
    const APP_URL  = process.env.APP_URL || 'https://inrtwallet.in';
    const apiKey   = process.env.DIDIT_API_KEY;
    if (!WORKFLOW || !apiKey) return res.status(500).json({ error: 'Didit not configured in Railway vars' });
    const r = await fetch(`${DIDIT_BASE}/v3/session/`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow_id: WORKFLOW, vendor_data: userId, callback: `${APP_URL}/kyc-complete` }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { return res.status(500).json({ error: `Didit non-JSON: ${text.slice(0, 100)}` }); }
    if (r.status !== 200 && r.status !== 201) return res.status(500).json({ error: data?.detail || data?.message || `Didit error (${r.status})` });
    const sessionId  = data.session_id || data.id;
    const sessionUrl = data.url || data.session_url;
    if (!sessionId || !sessionUrl) return res.status(500).json({ error: 'Didit did not return session_id or url' });
    await db.collection('diditSessions').doc(sessionId).set({ userId, sessionId, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(userId).update({ kycStatus: 'in_progress', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, sessionId, url: sessionUrl });
  } catch (e) { console.error('/kyc/didit-session:', e); res.status(500).json({ error: e.message }); }
});

app.post('/kyc/didit-webhook', async (req, res) => {
  res.json({ received: true });
  try {
    const body = req.body;
    if (!db) return;
    const sessionId  = body.session_id || body.id || '';
    const status     = body.status || '';
    const decision   = body.kyc_decision || body.decision || '';
    const vendorData = body.vendor_data || '';
    const APPROVED   = ['Approved','APPROVED','approved','completed','COMPLETED','verified','VERIFIED'];
    const REJECTED   = ['Declined','DECLINED','declined','rejected','REJECTED','failed','FAILED'];
    const isApproved = APPROVED.includes(status) || APPROVED.includes(decision);
    const isRejected = REJECTED.includes(status)  || REJECTED.includes(decision);
    if (!isApproved && !isRejected) return;
    let userId = vendorData;
    if (!userId && sessionId) {
      const s = await db.collection('diditSessions').doc(sessionId).get();
      if (s.exists) userId = s.data().userId;
    }
    if (!userId) return;
    const uSnap = await db.collection('users').doc(userId).get();
    if (!uSnap.exists || uSnap.data().kycStatus === 'verified') return;
    if (isApproved) {
      const kycRef = `KYC${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const batch  = db.batch();
      batch.set(db.collection('kyc').doc(userId), { userId, kycRef, status: 'verified', kycType: 'didit_auto', autoApproved: true, diditSessionId: sessionId, submittedAt: admin.firestore.FieldValue.serverTimestamp(), reviewedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      batch.update(db.collection('users').doc(userId), { kycStatus: 'verified', kycRef, kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(), inrtBalance: admin.firestore.FieldValue.increment(500), dailyLimit: 100000, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      batch.set(db.collection('transactions').doc(`KYC_BONUS_${kycRef}`), { uid: userId, type: 'credit', amount: 500, note: 'KYC Verified — Welcome Bonus 🎉', cat: 'rewards', ref: `KYC_BONUS_${kycRef}`, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await batch.commit();
      console.log(`✅ AUTO-APPROVED: ${userId} | ${kycRef}`);
    } else if (isRejected) {
      const reason = body.rejection_reason || body.reason || 'Verification failed';
      await db.collection('users').doc(userId).update({ kycStatus: 'rejected', kycRejectionReason: reason, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('kyc').doc(userId).set({ userId, status: 'rejected', kycType: 'didit_auto', rejectionReason: reason, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      console.log(`❌ AUTO-REJECTED: ${userId}`);
    }
  } catch (e) { console.error('/kyc/didit-webhook error:', e); }
});

app.get('/kyc/didit-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return res.json({ status: 'not_found' });
    const kycStatus = snap.data().kycStatus || 'not_started';
    if (['verified', 'rejected'].includes(kycStatus)) return res.json({ status: kycStatus });
    if (kycStatus === 'in_progress') {
      try {
        const sessSnap = await db.collection('diditSessions').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(1).get();
        if (!sessSnap.empty) {
          const sessionId = sessSnap.docs[0].data().sessionId;
          if (sessionId) {
            const { data } = await diditGet(`/v3/session/${sessionId}/`);
            const s = data?.status || '', d = data?.kyc_decision || '';
            const approved = ['Approved','APPROVED','approved','completed','verified'].includes(s) || ['Approved','APPROVED','approved'].includes(d);
            const rejected = ['Declined','DECLINED','declined','rejected','failed'].includes(s) || ['Declined','DECLINED','declined'].includes(d);
            if (approved) {
              const kycRef = `KYC${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
              const batch  = db.batch();
              batch.set(db.collection('kyc').doc(userId), { userId, kycRef, status: 'verified', kycType: 'didit_auto', autoApproved: true, diditSessionId: sessionId, submittedAt: admin.firestore.FieldValue.serverTimestamp(), reviewedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
              batch.update(db.collection('users').doc(userId), { kycStatus: 'verified', kycRef, kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(), inrtBalance: admin.firestore.FieldValue.increment(500), dailyLimit: 100000, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              await batch.commit();
              return res.json({ status: 'verified', kycRef });
            }
            if (rejected) {
              await db.collection('users').doc(userId).update({ kycStatus: 'rejected', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              return res.json({ status: 'rejected' });
            }
          }
        }
      } catch (e) { console.warn('Didit poll:', e.message); }
    }
    res.json({ status: kycStatus });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/kyc/reset-status', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId || !db) return res.status(400).json({ error: 'userId required' });
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    if (snap.data().kycStatus === 'verified') return res.json({ success: true, message: 'Already verified' });
    await db.collection('users').doc(userId).update({ kycStatus: 'not_started', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('kyc').doc(userId).set({ status: 'not_started', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Manual KYC (fallback) ─────────────────────────────────────
app.post('/kyc/submit', async (req, res) => {
  try {
    const { userId, fullName, dob, pan, panPhotoBase64, selfieBase64 } = req.body;
    if (!userId || !fullName || !dob || !pan) return res.status(400).json({ error: 'userId, fullName, dob and pan required' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    const panClean = pan.toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panClean)) return res.status(400).json({ error: 'Invalid PAN format' });
    const birth = new Date(dob), today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    if (isNaN(age) || age < 18) return res.status(400).json({ error: `You must be 18 or older. Your age: ${age}` });
    const panMasked = panClean.slice(0, 2) + 'XXX' + panClean.slice(5);
    const dupSnap   = await db.collection('kyc').where('panMasked', '==', panMasked).where('status', 'in', ['pending', 'verified']).limit(2).get();
    if (dupSnap.docs.some(d => d.id !== userId)) return res.status(400).json({ error: 'This PAN is already registered.' });
    const existing = await db.collection('kyc').doc(userId).get();
    if (existing.exists && existing.data().status === 'verified') return res.status(400).json({ error: 'Already verified.' });
    await db.collection('kyc').doc(userId).set({ userId, fullName: fullName.trim(), dob, pan: panClean, panMasked, kycType: 'manual_pan', status: 'pending', submittedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await db.collection('users').doc(userId).update({ kycStatus: 'pending', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, message: 'KYC submitted. We will verify within 24 hours.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/kyc/status/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('kyc').doc(req.params.userId).get();
    if (!snap.exists) return res.json({ status: 'not_started' });
    const d = snap.data();
    res.json({ status: d.status, kycRef: d.kycRef || null, rejectionReason: d.rejectionReason || null, submittedAt: d.submittedAt?.toDate?.()?.toISOString() || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/kyc/admin/list', async (req, res) => {
  try {
    if (req.query.adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!db) return res.json({ submissions: [] });
    const { status = 'pending' } = req.query;
    let query = db.collection('kyc').orderBy('submittedAt', 'desc').limit(100);
    if (status !== 'all') query = query.where('status', '==', status);
    const snap = await query.get();
    res.json({ submissions: snap.docs.map(d => ({ id: d.id, ...d.data(), submittedAt: d.data().submittedAt?.toDate?.()?.toISOString() || null, reviewedAt: d.data().reviewedAt?.toDate?.()?.toISOString() || null })), count: snap.docs.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/kyc/admin/review', async (req, res) => {
  try {
    const { userId, action, reason, adminKey } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });
    if (!db) return res.status(500).json({ error: 'Firebase not connected' });
    const newStatus = action === 'approve' ? 'verified' : 'rejected';
    const kycRef    = action === 'approve' ? `KYC${Date.now()}${Math.random().toString(36).slice(2, 5).toUpperCase()}` : null;
    await db.collection('kyc').doc(userId).update({ status: newStatus, kycRef: kycRef || null, rejectionReason: reason || null, reviewedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(userId).update({ kycStatus: newStatus, kycRef: kycRef || null, kycReviewedAt: admin.firestore.FieldValue.serverTimestamp(), ...(action === 'approve' && { inrtBalance: admin.firestore.FieldValue.increment(500), kycVerifiedAt: admin.firestore.FieldValue.serverTimestamp(), dailyLimit: 100000 }), ...(action === 'reject' && { kycRejectionReason: reason || 'Documents could not be verified' }), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, userId, status: newStatus, kycRef });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      db.collection('transactions').orderBy('createdAt', 'desc').limit(500).get(),
      db.collection('kyc').get(),
      db.collection('businessWallet').doc('earnings').get(),
    ]);
    const users   = usersSnap.docs.map(d => d.data());
    const kycDocs = kycSnap.docs.map(d => d.data());
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentTxs = txSnap.docs.map(d => d.data()).filter(tx => tx.createdAt?.toMillis?.() > thirtyDaysAgo);
    const earnings  = earningsSnap.exists ? earningsSnap.data() : {};
    const totalINRT = await global.getOnChainTotalSupply();
    res.json({ stats: {
      totalUsers:    users.length,
      kycVerified:   kycDocs.filter(k => k.status === 'verified').length,
      kycPending:    kycDocs.filter(k => k.status === 'pending').length,
      kycRejected:   kycDocs.filter(k => k.status === 'rejected').length,
      totalBalance:  Math.round(users.reduce((s, u) => s + (u.balance || 0), 0)),
      totalINRTSupply: totalINRT,
      contractAddress: process.env.INRT_CONTRACT_ADDRESS || null,
      last30Days: { txVolume: Math.round(recentTxs.filter(t => t.type === 'debit').reduce((s, t) => s + (t.amount || 0), 0)), txCount: recentTxs.length },
      earnings: { total: earnings.balance || 0, transferEarnings: earnings.transferEarnings || 0, rechargeEarnings: earnings.rechargeEarnings || 0, billsEarnings: earnings.billsEarnings || 0 },
    }});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/users', async (req, res) => {
  try {
    if (req.query.adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
    if (!db) return res.json({ users: [] });
    const snap  = await db.collection('users').orderBy('createdAt', 'desc').limit(200).get();
    const users = snap.docs.map(d => ({ id: d.id, name: d.data().name || '', phone: d.data().phone || '', balance: d.data().balance || 0, kycStatus: d.data().kycStatus || 'not_started', inrtBalance: d.data().inrtBalance || 0, polygonWallet: d.data().polygonWallet || null, createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null }));
    res.json({ users, count: users.length });
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

// ══════════════════════════════════════════════════════════════
//  INRT GLOBAL TRANSFER ROUTES
// ══════════════════════════════════════════════════════════════
function genInrtAddress() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `INRT-${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8, 12)}`;
}

app.get('/inrt/wallet/:userId', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB not connected' });
    const snap = await db.collection('users').doc(req.params.userId).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    const user = snap.data();
    let inrtAddress = user.inrtAddress;
    if (!inrtAddress) {
      let unique = false;
      while (!unique) {
        inrtAddress = genInrtAddress();
        const dup = await db.collection('inrtAddressIndex').doc(inrtAddress).get();
        if (!dup.exists) unique = true;
      }
      await db.collection('users').doc(req.params.userId).update({ inrtAddress });
      await db.collection('inrtAddressIndex').doc(inrtAddress).set({ userId: req.params.userId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    res.json({ success: true, inrtAddress, inrtBalance: user.inrtBalance || 0, inrBalance: user.balance || 0, name: user.name || 'INRT User', polygonWallet: user.polygonWallet || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/inrt/lookup/:address', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB not connected' });
    const address = req.params.address.toUpperCase().trim();
    const idxSnap = await db.collection('inrtAddressIndex').doc(address).get();
    if (!idxSnap.exists) return res.status(404).json({ error: 'INRT address not found. Check and try again.' });
    const uSnap = await db.collection('users').doc(idxSnap.data().userId).get();
    if (!uSnap.exists) return res.status(404).json({ error: 'Wallet not found' });
    const u = uSnap.data();
    res.json({ success: true, inrtAddress: address, name: u.name || 'INRT User', verified: u.kycStatus === 'verified' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/inrt/convert', async (req, res) => {
  try {
    const { userId, direction, amount } = req.body;
    if (!userId || !direction || !amount || amount <= 0 || !db) return res.status(400).json({ error: 'Missing fields' });
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    const user = snap.data();
    const amt  = parseFloat(amount);
    const ref  = genTxId('CNV');
    if (direction === 'inr_to_inrt') {
      if ((user.balance || 0) < amt) return res.status(402).json({ error: 'Insufficient ₹ balance' });
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(-amt), inrtBalance: admin.firestore.FieldValue.increment(amt), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('transactions').add({ uid: userId, type: 'convert', amount: amt, note: `Converted ₹${amt} → ${amt} INRT`, cat: 'crypto', ref, status: 'success', direction, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    } else if (direction === 'inrt_to_inr') {
      if ((user.inrtBalance || 0) < amt) return res.status(402).json({ error: 'Insufficient INRT balance' });
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amt), inrtBalance: admin.firestore.FieldValue.increment(-amt), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('transactions').add({ uid: userId, type: 'convert', amount: amt, note: `Converted ${amt} INRT → ₹${amt}`, cat: 'crypto', ref, status: 'success', direction, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    } else return res.status(400).json({ error: 'Invalid direction' });
    res.json({ success: true, ref, amount: amt, direction });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/inrt/send', async (req, res) => {
  try {
    const { fromUserId, toAddress, amount, note } = req.body;
    if (!fromUserId || !toAddress || !amount || amount <= 0 || !db) return res.status(400).json({ error: 'Missing fields' });
    const cleanAddress = toAddress.toUpperCase().trim();
    const amt = parseFloat(amount);
    const idxSnap = await db.collection('inrtAddressIndex').doc(cleanAddress).get();
    if (!idxSnap.exists) return res.status(404).json({ error: 'INRT address not found' });
    const toUserId = idxSnap.data().userId;
    if (toUserId === fromUserId) return res.status(400).json({ error: 'Cannot send to your own wallet' });
    const fromSnap = await db.collection('users').doc(fromUserId).get();
    if (!fromSnap.exists) return res.status(404).json({ error: 'Sender not found' });
    const fromUser = fromSnap.data();
    if ((fromUser.inrtBalance || 0) < amt) return res.status(402).json({ error: 'Insufficient INRT balance' });
    const toSnap = await db.collection('users').doc(toUserId).get();
    const toUser = toSnap.data();
    const ref = `INRTX${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const startedAt = Date.now();
    await db.collection('users').doc(fromUserId).update({ inrtBalance: admin.firestore.FieldValue.increment(-amt), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('inrtTransfers').doc(ref).set({ ref, fromUserId, toUserId, fromAddress: fromUser.inrtAddress || '', toAddress: cleanAddress, amount: amt, note: note || '', status: 'processing', startedAt, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('transactions').add({ uid: fromUserId, type: 'debit', amount: amt, note: `INRT sent to ${toUser.name || cleanAddress}`, cat: 'crypto', ref, status: 'processing', toAddress: cleanAddress, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    const processingTime = 1500 + Math.floor(Math.random() * 2500);
    setTimeout(async () => {
      try {
        const completedAt = Date.now();
        const durationMs  = completedAt - startedAt;
        const batch = db.batch();
        batch.update(db.collection('users').doc(toUserId), { inrtBalance: admin.firestore.FieldValue.increment(amt), totalReceived: admin.firestore.FieldValue.increment(amt), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(db.collection('transactions').doc(ref + '_RX'), { uid: toUserId, type: 'credit', amount: amt, note: `INRT received from ${fromUser.name || 'INRT User'}`, cat: 'crypto', ref: ref + '_RX', status: 'success', fromAddress: fromUser.inrtAddress || '', createdAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.update(db.collection('inrtTransfers').doc(ref), { status: 'completed', completedAt, durationMs });
        await batch.commit();
        const sSnap = await db.collection('transactions').where('ref', '==', ref).where('uid', '==', fromUserId).limit(1).get();
        if (!sSnap.empty) await sSnap.docs[0].ref.update({ status: 'success', durationMs });
        console.log(`✅ INRT transfer: ${ref} | ${amt} INRT | ${durationMs}ms`);
      } catch (e) { console.error('INRT transfer complete error:', e); }
    }, processingTime);
    res.json({ success: true, ref, amount: amt, toAddress: cleanAddress, toName: toUser.name || 'INRT User', status: 'processing', estimatedSeconds: Math.ceil(processingTime / 1000) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/inrt/transfer/:ref', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'unknown' });
    const snap = await db.collection('inrtTransfers').doc(req.params.ref).get();
    if (!snap.exists) return res.status(404).json({ error: 'Transfer not found' });
    const d = snap.data();
    res.json({ ref: d.ref, status: d.status, amount: d.amount, fromAddress: d.fromAddress, toAddress: d.toAddress, note: d.note, startedAt: d.startedAt, completedAt: d.completedAt || null, durationMs: d.durationMs || (d.status === 'processing' ? Date.now() - d.startedAt : null), elapsedMs: Date.now() - d.startedAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/inrt/history/:userId', async (req, res) => {
  try {
    if (!db) return res.json({ transactions: [] });
    const snap = await db.collection('transactions').where('uid', '==', req.params.userId).where('cat', '==', 'crypto').orderBy('createdAt', 'desc').limit(50).get();
    res.json({ transactions: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null })) });
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
    if (AIRTEL.some(p => mobile.startsWith(p))) operator = 'AIRTEL';
    else if (VI.some(p => mobile.startsWith(p))) operator = 'VI';
    else if (BSNL.some(p => mobile.startsWith(p))) operator = 'BSNL';
    else if (mobile.startsWith('6')) operator = 'JIO';
    else if (['70','71','72','81','82','83','90','91','92'].some(p => mobile.startsWith(p))) operator = 'AIRTEL';
    else if (['73','74','75','84','85','86','96','97','98','99'].some(p => mobile.startsWith(p))) operator = 'JIO';
    else if (['76','77','78','87','88','89'].some(p => mobile.startsWith(p))) operator = 'VI';
    else if (['79','93','94','95'].some(p => mobile.startsWith(p))) operator = 'BSNL';
    res.json({ mobile, operator, circle: 'UNKNOWN' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/recharge/plans', async (req, res) => {
  try {
    const { operator } = req.query;
    const token = process.env.EZYTM_API_TOKEN;
    if (token) {
      try {
        const url = new URL('https://newapi.ezytm.in/Service/BrowsePlan');
        url.searchParams.append('ApiToken', token);
        url.searchParams.append('OpId', operator || 'JIO');
        const r    = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
        const data = JSON.parse(await r.text());
        if (data && (data.DATA || data.data || Array.isArray(data)))
          return res.json({ success: true, plans: data.DATA || data.data || data, source: 'live' });
      } catch (e) { console.warn('Ezytm plans fallback:', e.message); }
    }
    const fallback = [
      { id:'p1', amount:179,  validity:'28 days',  data:'2GB/day',   calls:'Unlimited', popular:false },
      { id:'p2', amount:239,  validity:'28 days',  data:'2GB/day',   calls:'Unlimited', popular:true  },
      { id:'p3', amount:299,  validity:'28 days',  data:'3GB/day',   calls:'Unlimited', popular:false },
      { id:'p4', amount:479,  validity:'56 days',  data:'2.5GB/day', calls:'Unlimited', popular:false },
      { id:'p5', amount:599,  validity:'84 days',  data:'2GB/day',   calls:'Unlimited', popular:true  },
      { id:'p6', amount:899,  validity:'84 days',  data:'3GB/day',   calls:'Unlimited', popular:false },
      { id:'p7', amount:1199, validity:'365 days', data:'2.5GB/day', calls:'Unlimited', popular:false },
      { id:'p8', amount:2999, validity:'365 days', data:'3GB/day',   calls:'Unlimited', popular:false },
    ];
    res.json({ success: true, plans: fallback, source: 'fallback' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/recharge/do', async (req, res) => {
  try {
    const { userId, mobile, operator, amount, rechargeType } = req.body;
    if (!userId || !mobile || !operator || !amount) return res.status(400).json({ error: 'userId, mobile, operator, amount required' });
    const token = process.env.EZYTM_API_TOKEN;
    if (!token) return res.status(500).json({ error: 'EZYTM_API_TOKEN not set in Railway variables' });
    if (!db) return res.status(500).json({ error: 'Database not connected' });
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });
    if ((userSnap.data().balance || 0) < amount) return res.status(402).json({ error: 'Insufficient balance' });
    const orderId = genTxId('RCH'), pts = Math.floor(amount / 10);
    await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(-amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    let ezytmResponse;
    try {
      const url = new URL('https://newapi.ezytm.in/Service/Recharge2');
      url.searchParams.append('ApiToken', token);
      url.searchParams.append('MobileNo', mobile.replace(/\D/g, ''));
      url.searchParams.append('Amount', amount.toString());
      url.searchParams.append('OpId', operator);
      url.searchParams.append('RefTxnId', orderId);
      const text = await (await fetch(url.toString(), { signal: AbortSignal.timeout(20000) })).text();
      try { ezytmResponse = JSON.parse(text); }
      catch {
        await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return res.status(500).json({ error: 'Invalid response from Ezytm. Balance refunded.' });
      }
    } catch (fetchErr) {
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return res.status(500).json({ error: 'Recharge service unreachable. Balance refunded.' });
    }
    const status = String(ezytmResponse.STATUS || '').trim();
    const txnId  = ezytmResponse.OPTXNID || ezytmResponse.TXNNO || orderId;
    const message = ezytmResponse.MESSAGE || '';
    if (status === '3') {
      await db.collection('users').doc(userId).update({ balance: admin.firestore.FieldValue.increment(amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      await db.collection('transactions').add({ uid: userId, type: 'debit', amount, note: `Failed recharge: ${operator} ${mobile}`, cat: 'recharge', ref: orderId, status: 'failed', mobile, operator, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      return res.status(400).json({ success: false, error: message || 'Recharge failed. Balance refunded.' });
    }
    const txStatus = status === '1' ? 'success' : 'pending';
    await db.collection('transactions').add({ uid: userId, type: 'debit', amount, note: `${operator} ${rechargeType === 'D' ? 'DTH' : rechargeType === 'T' ? 'Postpaid' : 'Prepaid'} — ${mobile}`, cat: 'recharge', ref: orderId, status: txStatus, mobile, operator, ezytmTxnId: txnId, inrtBalance: status === '1' ? pts : 0, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    if (status === '1') await db.collection('users').doc(userId).update({ inrtBalance: admin.firestore.FieldValue.increment(pts), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: status === '1', pending: status === '2', orderId, txnId, amount, mobile, operator, status: txStatus, inrtBalance: status === '1' ? pts : 0, message: status === '1' ? `₹${amount} recharge done for ${mobile}` : status === '2' ? 'Processing…' : message });
  } catch (e) { res.status(500).json({ error: e.message || 'Recharge failed' }); }
});

app.get('/recharge/status/:orderId', async (req, res) => {
  try {
    const token = process.env.EZYTM_API_TOKEN;
    const url = new URL('https://newapi.ezytm.in/service/statuscheck');
    url.searchParams.append('ApiToken', token);
    url.searchParams.append('RefTxnId', req.params.orderId);
    const text = await (await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })).text();
    let data; try { data = JSON.parse(text); } catch { return res.status(500).json({ error: 'Invalid Ezytm response' }); }
    const status = String(data.STATUS || '').trim();
    const txnId  = data.OPTXNID || data.TXNNO || '';
    if (status === '1' && db) {
      const snap = await db.collection('transactions').where('ref', '==', req.params.orderId).limit(1).get();
      if (!snap.empty && snap.docs[0].data().status !== 'success') {
        const tx = snap.docs[0].data();
        await snap.docs[0].ref.update({ status: 'success', ezytmTxnId: txnId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection('users').doc(tx.uid).update({ inrtBalance: admin.firestore.FieldValue.increment(Math.floor(tx.amount / 10)), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    if (status === '3' && db) {
      const snap = await db.collection('transactions').where('ref', '==', req.params.orderId).limit(1).get();
      if (!snap.empty && snap.docs[0].data().status === 'pending') {
        const tx = snap.docs[0].data();
        await db.collection('users').doc(tx.uid).update({ balance: admin.firestore.FieldValue.increment(tx.amount), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await snap.docs[0].ref.update({ status: 'failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection('transactions').add({ uid: tx.uid, type: 'credit', amount: tx.amount, note: `Refund: Recharge failed for ${tx.mobile}`, cat: 'refund', ref: `REF_${req.params.orderId}`, status: 'success', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    res.json({ orderId: req.params.orderId, status: status === '1' ? 'success' : status === '3' ? 'failed' : 'pending', txnId, message: data.MESSAGE || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 INRT API on port ${PORT}`);
  console.log(`   Firebase      : ${adminAuth                              ? '✅' : '❌'}`);
  console.log(`   Razorpay      : ${process.env.RAZORPAY_KEY_ID            ? '✅' : '❌'}`);
  console.log(`   Resend        : ${process.env.RESEND_API_KEY             ? '✅' : '❌'}`);
  console.log(`   Didit         : ${process.env.DIDIT_API_KEY              ? '✅' : '❌'}`);
  console.log(`   Ezytm         : ${process.env.EZYTM_API_TOKEN            ? '✅' : '❌'}`);
  console.log(`   Admin Key     : ${process.env.ADMIN_KEY                  ? '✅' : '❌'}`);
  console.log(`   INRT Contract : ${process.env.INRT_CONTRACT_ADDRESS      ? '✅' : '❌'}`);
  console.log(`   Polygon Wallet: ${process.env.ADMIN_WALLET_PRIVATE_KEY   ? '✅' : '❌'}\n`);
});
