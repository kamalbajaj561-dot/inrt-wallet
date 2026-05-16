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
