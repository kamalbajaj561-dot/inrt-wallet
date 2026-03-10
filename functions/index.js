const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();


// =========================
// SEND MONEY
// =========================
exports.sendMoney = functions.https.onCall(async (data, context) => {

  const senderId = data.senderId;
  const receiverId = data.receiverId;
  const amount = data.amount;
  const transactionId = data.transactionId;

  if (!senderId || !receiverId || !amount || !transactionId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required parameters"
    );
  }

  if (typeof amount !== "number" || amount <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Amount must be a positive number"
    );
  }

  if (senderId === receiverId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Sender and receiver cannot be the same"
    );
  }

  // Prevent duplicate payments
  const existing = await db.collection("ledger")
    .where("transactionId", "==", transactionId)
    .get();

  if (!existing.empty) {
    throw new functions.https.HttpsError(
      "already-exists",
      "Transaction already processed"
    );
  }

  const senderRef = db.collection("wallets").doc(senderId);
  const receiverRef = db.collection("wallets").doc(receiverId);
  const ledgerRef = db.collection("ledger").doc();

  const time = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {

    const senderDoc = await transaction.get(senderRef);
    const receiverDoc = await transaction.get(receiverRef);

    if (!senderDoc.exists || !receiverDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Wallet not found");
    }

    const senderBalance = senderDoc.data().balance;
    const receiverBalance = receiverDoc.data().balance;

    if (senderBalance < amount) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Insufficient balance"
      );
    }

    // Update balances
    transaction.update(senderRef, {
      balance: senderBalance - amount,
      updatedAt: time
    });

    transaction.update(receiverRef, {
      balance: receiverBalance + amount,
      updatedAt: time
    });

    const senderTxRef = senderRef.collection("transactions").doc();
    const receiverTxRef = receiverRef.collection("transactions").doc();

    // Sender history
    transaction.set(senderTxRef, {
      transactionId: transactionId,
      type: "debit",
      amount: amount,
      to: receiverId,
      status: "completed",
      timestamp: time
    });

    // Receiver history
    transaction.set(receiverTxRef, {
      transactionId: transactionId,
      type: "credit",
      amount: amount,
      from: senderId,
      status: "completed",
      timestamp: time
    });

    // Global ledger
    transaction.set(ledgerRef, {
      transactionId: transactionId,
      from: senderId,
      to: receiverId,
      amount: amount,
      currency: "INR",
      status: "completed",
      createdAt: time
    });

  });

  return { success: true };

});



// =========================
// CREATE PAYMENT REQUEST
// =========================
exports.createPaymentRequest = functions.https.onCall(async (data, context) => {

  const senderId = data.senderId;
  const senderName = data.senderName;
  const senderUpiId = data.senderUpiId;

  const receiverId = data.receiverId;
  const receiverUpiId = data.receiverUpiId;

  const amount = data.amount;
  const description = data.description || "Payment Request";

  if (!senderId || !receiverId || !amount) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required parameters"
    );
  }

  const requestRef = db.collection("payment_requests").doc();

  await requestRef.set({

    requestId: requestRef.id,

    senderId: senderId,
    senderName: senderName,
    senderUpiId: senderUpiId,

    receiverId: receiverId,
    receiverUpiId: receiverUpiId,

    amount: amount,
    currency: "INR",
    description: description,

    status: "pending",

    createdAt: admin.firestore.FieldValue.serverTimestamp()

  });

  return {
    success: true,
    requestId: requestRef.id
  };

});



// =========================
// APPROVE PAYMENT REQUEST
// =========================
exports.approvePaymentRequest = functions.https.onCall(async (data, context) => {

  const requestId = data.requestId;

  const requestRef = db.collection("payment_requests").doc(requestId);
  const requestDoc = await requestRef.get();

  if (!requestDoc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Payment request not found"
    );
  }

  const request = requestDoc.data();

  if (request.status !== "pending") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Request already processed"
    );
  }

  const senderId = request.receiverId;
  const receiverId = request.senderId;
  const amount = request.amount;

  const transactionId = "tx_" + Date.now();

  const senderRef = db.collection("wallets").doc(senderId);
  const receiverRef = db.collection("wallets").doc(receiverId);
  const ledgerRef = db.collection("ledger").doc();

  const time = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async (transaction) => {

    const senderDoc = await transaction.get(senderRef);
    const receiverDoc = await transaction.get(receiverRef);

    if (!senderDoc.exists || !receiverDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Wallet not found"
      );
    }

    const senderBalance = senderDoc.data().balance;
    const receiverBalance = receiverDoc.data().balance;

    if (senderBalance < amount) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Insufficient balance"
      );
    }

    transaction.update(senderRef, {
      balance: senderBalance - amount,
      updatedAt: time
    });

    transaction.update(receiverRef, {
      balance: receiverBalance + amount,
      updatedAt: time
    });

    const senderTxRef = senderRef.collection("transactions").doc();
    const receiverTxRef = receiverRef.collection("transactions").doc();

    transaction.set(senderTxRef, {
      transactionId: transactionId,
      type: "debit",
      amount: amount,
      to: receiverId,
      status: "completed",
      timestamp: time
    });

    transaction.set(receiverTxRef, {
      transactionId: transactionId,
      type: "credit",
      amount: amount,
      from: senderId,
      status: "completed",
      timestamp: time
    });

    transaction.set(ledgerRef, {
      transactionId: transactionId,
      from: senderId,
      to: receiverId,
      amount: amount,
      currency: "INR",
      status: "completed",
      createdAt: time
    });

  });

  await requestRef.update({
    status: "completed",
    transactionId: transactionId
  });

  return { success: true };

});

// =========================
// CREATE RAZORPAY ORDER
// =========================

const Razorpay = require("razorpay");

exports.createRazorpayOrder = functions.https.onCall(async (data, context) => {


  const crypto = require("crypto");

exports.verifyRazorpayPayment = functions.https.onCall(async (data, context) => {

  const razorpay_order_id = data.razorpay_order_id;
  const razorpay_payment_id = data.razorpay_payment_id;
  const razorpay_signature = data.razorpay_signature;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", "kroM7CrIMriR5cBmxkyHjQve")
    .update(body.toString())
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {

    throw new functions.https.HttpsError(
      "permission-denied",
      "Payment verification failed"
    );

  }

  return {
    success: true
  };

});
  const amount = data.amount;

  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid amount"
    );
  }

  const razorpay = new Razorpay({
    key_id: "rzp_test_SOmbfBMF8uYZam",
    key_secret: "kroM7CrIMriR5cBmxkyHjQve"
  });

  try {

    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay expects paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
      payment_capture: 1
    });

    return {
      orderId: order.id
    };

  } catch (error) {

    console.error("Razorpay error:", error);

    throw new functions.https.HttpsError(
      "internal",
      "Unable to create Razorpay order"
    );

  }

});