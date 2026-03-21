const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ========================= 
// UTILITY: Normalize Phone Number
// =========================
const normalizePhoneNumber = (phone) => {
  if (!phone || typeof phone !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Phone number must be a valid string"
    );
  }

  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, "");

  // If it starts with 91, assume it's already in +91 format
  if (digits.startsWith("91") && digits.length === 12) {
    return "+" + digits;
  }

  // If it's 10 digits (just the number without country code)
  if (digits.length === 10) {
    return "+91" + digits;
  }

  // If it already has +91 prefix
  if (phone.startsWith("+91") && digits.length === 12) {
    return "+91" + digits.slice(2);
  }

  throw new functions.https.HttpsError(
    "invalid-argument",
    "Invalid phone number format. Use 10-digit number or +91XXXXXXXXXX"
  );
};

// =========================
// SEND MONEY BY PHONE NUMBER
// =========================
exports.sendMoney = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated to send money"
    );
  }

  const senderId = context.auth.uid;
  const { receiverPhone, amount, transactionId, note } = data;

  // ===== INPUT VALIDATION =====
  if (!receiverPhone || !amount || !transactionId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing required parameters: receiverPhone, amount, transactionId"
    );
  }

  // Validate amount
  if (typeof amount !== "number" || amount <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Amount must be a positive number"
    );
  }

  // Validate transaction ID format
  if (typeof transactionId !== "string" || transactionId.trim().length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Transaction ID must be a non-empty string"
    );
  }

  // Normalize receiver phone number
  let normalizedPhone;
  try {
    normalizedPhone = normalizePhoneNumber(receiverPhone);
  } catch (error) {
    throw error;
  }

  // ===== IDEMPOTENCY CHECK =====
  // Prevent duplicate transactions
  const existingTx = await db
    .collection("ledger")
    .where("transactionId", "==", transactionId)
    .limit(1)
    .get();

  if (!existingTx.empty) {
    throw new functions.https.HttpsError(
      "already-exists",
      "This transaction has already been processed"
    );
  }

  // ===== FIND RECEIVER BY PHONE NUMBER =====
  const receiverQuery = await db
    .collection("users")
    .where("phoneNumber", "==", normalizedPhone)
    .limit(1)
    .get();

  if (receiverQuery.empty) {
    throw new functions.https.HttpsError(
      "not-found",
      "No user found with this phone number"
    );
  }

  const receiverId = receiverQuery.docs[0].id;

  // ===== SELF-TRANSFER CHECK =====
  if (senderId === receiverId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "You cannot send money to yourself"
    );
  }

  // ===== ATOMIC TRANSACTION =====
  const senderUserRef = db.collection("users").doc(senderId);
  const receiverUserRef = db.collection("users").doc(receiverId);
  const ledgerRef = db.collection("ledger").doc();
  const globalTxRef = db.collection("transactions").doc();

  const serverTime = admin.firestore.FieldValue.serverTimestamp();

  try {
    await db.runTransaction(async (transaction) => {
      // Get both user documents (source of truth for walletBalance)
      const senderDoc = await transaction.get(senderUserRef);
      const receiverDoc = await transaction.get(receiverUserRef);

      if (!senderDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Sender account not found"
        );
      }

      if (!receiverDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Receiver account not found"
        );
      }

      const senderData = senderDoc.data();
      const receiverData = receiverDoc.data();

      const senderBalance = senderData.walletBalance || 0;
      const receiverBalance = receiverData.walletBalance || 0;

      // ===== BALANCE CHECK =====
      if (senderBalance < amount) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Insufficient balance. You have ₹${senderBalance} but trying to send ₹${amount}`
        );
      }

      // ===== UPDATE SENDER WALLET BALANCE (users collection) =====
      transaction.update(senderUserRef, {
        walletBalance: senderBalance - amount,
        updatedAt: serverTime,
      });

      // ===== UPDATE RECEIVER WALLET BALANCE (users collection) =====
      transaction.update(receiverUserRef, {
        walletBalance: receiverBalance + amount,
        updatedAt: serverTime,
      });

      const senderPhone = senderData.phoneNumber || null;
      const receiverPhoneStored = receiverData.phoneNumber || normalizedPhone;

      // ===== CREATE GLOBAL TRANSACTION DOCUMENT (used by UI) =====
      transaction.set(globalTxRef, {
        id: globalTxRef.id,
        transactionId: transactionId,
        senderId,
        senderPhoneNumber: senderPhone,
        receiverId,
        receiverPhoneNumber: receiverPhoneStored,
        amount,
        timestamp: serverTime,
        status: "success",
        type: "wallet_transfer",
        note: note || "",
        paymentMethod: "wallet",
      });

      // ===== CREATE GLOBAL LEDGER ENTRY =====
      transaction.set(ledgerRef, {
        transactionId: transactionId,
        from: senderId,
        fromPhone: senderPhone,
        to: receiverId,
        toPhone: normalizedPhone,
        amount: amount,
        currency: "INR",
        status: "completed",
        createdAt: serverTime,
        note: note || "",
      });
    });

    console.log(`Transaction ${transactionId} completed successfully`);

    return {
      success: true,
      message: "Money sent successfully",
      transactionId: transactionId,
      amount: amount,
    };
  } catch (error) {
    // If error is already an HttpsError, rethrow it
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Log unexpected errors
    console.error("Unexpected error in sendMoney:", error);

    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while processing your transaction"
    );
  }
});

// =========================
// LOOKUP USER BY PHONE NUMBER
// =========================
exports.lookupUserByPhone = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const { phoneNumber } = data;

  if (!phoneNumber) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Phone number is required"
    );
  }

  // Normalize phone number
  let normalizedPhone;
  try {
    normalizedPhone = normalizePhoneNumber(phoneNumber);
  } catch (error) {
    throw error;
  }

  try {
    const userQuery = await db
      .collection("users")
      .where("phoneNumber", "==", normalizedPhone)
      .limit(1)
      .get();

    if (userQuery.empty) {
      return {
        found: false,
        message: "User not found",
      };
    }

    const userData = userQuery.docs[0].data();
    const uid = userQuery.docs[0].id;

    // Prevent self lookup
    if (uid === context.auth.uid) {
      return {
        found: false,
        isSelf: true,
        message: "This is your own phone number",
      };
    }

    return {
      found: true,
      uid: uid,
      fullName: userData.fullName || "User",
      phoneNumber: normalizedPhone,
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    console.error("Error looking up user:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Error looking up user information"
    );
  }
});

// =========================
// CREATE PAYMENT REQUEST
// =========================
exports.createPaymentRequest = functions.https.onCall(
  async (data, context) => {
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

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      requestId: requestRef.id,
    };
  }
);

// =========================
// APPROVE PAYMENT REQUEST
// =========================
exports.approvePaymentRequest = functions.https.onCall(
  async (data, context) => {
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

      transaction.update(senderRef, {
        balance: senderBalance - amount,
        updatedAt: time,
      });

      transaction.update(receiverRef, {
        balance: receiverBalance + amount,
        updatedAt: time,
      });

      const senderTxRef = senderRef.collection("transactions").doc();
      const receiverTxRef = receiverRef.collection("transactions").doc();

      transaction.set(senderTxRef, {
        transactionId: transactionId,
        type: "debit",
        amount: amount,
        to: receiverId,
        status: "completed",
        timestamp: time,
      });

      transaction.set(receiverTxRef, {
        transactionId: transactionId,
        type: "credit",
        amount: amount,
        from: senderId,
        status: "completed",
        timestamp: time,
      });

      transaction.set(ledgerRef, {
        transactionId: transactionId,
        from: senderId,
        to: receiverId,
        amount: amount,
        currency: "INR",
        status: "completed",
        createdAt: time,
      });
    });

    await requestRef.update({
      status: "completed",
      transactionId: transactionId,
    });

    return { success: true };
  }
);

// =========================
// CREATE RAZORPAY ORDER
// =========================

const Razorpay = require("razorpay");

exports.createRazorpayOrder = functions.https.onCall(async (data, context) => {
  const amount = data.amount;

  if (!amount || amount <= 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid amount"
    );
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_SOmbfBMF8uYZam",
    key_secret:
      process.env.RAZORPAY_KEY_SECRET || "kroM7CrIMriR5cBmxkyHjQve",
  });

  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay expects paise
      currency: "INR",
      receipt: "receipt_" + Date.now(),
      payment_capture: 1,
    });

    return {
      orderId: order.id,
    };
  } catch (error) {
    console.error("Razorpay error:", error);

    throw new functions.https.HttpsError(
      "internal",
      "Unable to create Razorpay order"
    );
  }
});

// =========================
// VERIFY RAZORPAY PAYMENT
// =========================

exports.verifyRazorpayPayment = functions.https.onCall(async (data, context) => {
  const crypto = require("crypto");

  const razorpay_order_id = data.razorpay_order_id;
  const razorpay_payment_id = data.razorpay_payment_id;
  const razorpay_signature = data.razorpay_signature;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "kroM7CrIMriR5cBmxkyHjQve")
    .update(body.toString())
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Payment verification failed"
    );
  }

  return {
    success: true,
  };
});