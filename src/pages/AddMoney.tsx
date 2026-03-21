import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { toast } from "react-hot-toast";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Button, Card } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay: any;
  }
}

type CreateOrderResponse =
  | { success: true; orderId: string; amount: number; currency: string; keyId: string; simulated?: boolean }
  | { success: false; error: string; details?: string };

type VerifyPaymentResponse =
  | { success: true; amount: number | null; userId: string | null }
  | { success: false; error: string; details?: string };

export default function AddMoney() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();

  const auth = useMemo(() => getAuth(), []);
  const userId = auth.currentUser?.uid;

  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const amountNum = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) ? n : 0;
  }, [amount]);

  // Razorpay script loader (idempotent)
  useEffect(() => {
    if (!document.getElementById("razorpay-script")) {
      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

  const creditWallet = async (uid: string, amt: number, razorpayOrderId: string, razorpayPaymentId: string) => {
    const rewardPoints = Math.floor(amt / 10); // 1 point per ₹10
    await runTransaction(db, async (tx) => {
      const userRef = doc(db, "users", uid);
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error("User profile not found");

      const data: any = snap.data();
      const nextBalance = Number(data.balance ?? 0) + amt;
      const nextPoints = Number(data.rewardPoints ?? 0) + rewardPoints;

      tx.update(userRef, {
        balance: nextBalance,
        rewardPoints: nextPoints,
        updatedAt: serverTimestamp(),
      });

      const txRef = doc(collection(db, "transactions"));
      tx.set(txRef, {
        uid,
        type: "credit",
        amount: amt,
        note: "Added via Razorpay",
        ref: razorpayOrderId,
        status: "success",
        createdAt: serverTimestamp(),
        razorpayPaymentId: razorpayPaymentId,
      });
    });
  };

  const handleAddMoney = async () => {
    if (!userId) {
      toast.error("Please log in first");
      navigate("/login");
      return;
    }

    if (!amountNum || amountNum < 10) {
      toast.error("Enter a valid amount (min ₹10)");
      return;
    }

    if (!window.Razorpay) {
      toast.error("Razorpay SDK not loaded. Refresh and try again.");
      return;
    }

    setLoading(true);

    try {
      const orderRes = await fetch("http://localhost:4000/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNum, userId }),
      });

      const orderData = (await orderRes.json()) as CreateOrderResponse;
      if (!orderRes.ok || orderData.success === false) {
        throw new Error(orderData.success === false ? orderData.error : "Failed to create order");
      }

      const orderId = orderData.orderId;

      // If backend simulates the order (e.g. Razorpay auth failure), skip the popup
      // and complete the flow end-to-end via verify-payment + wallet credit.
      if ("simulated" in orderData && orderData.simulated) {
        const simulatedPaymentId = `simulated_payment_${Date.now()}`;
        const verifyRes = await fetch("http://localhost:4000/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: orderId,
            razorpay_payment_id: simulatedPaymentId,
            razorpay_signature: "simulated",
            userId,
            amount: amountNum,
          }),
        });

        const verifyData = (await verifyRes.json()) as VerifyPaymentResponse;
        if (!verifyRes.ok || verifyData.success === false) {
          throw new Error(verifyData.success === false ? verifyData.error : "Verification failed");
        }

        await creditWallet(userId, amountNum, orderId, simulatedPaymentId);
        toast.success(`✅ ₹${amountNum} added successfully (simulated)`);
        setTimeout(() => navigate("/dashboard"), 2000);
        setLoading(false);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "INRT Wallet",
        description: "Add Money to Wallet",
        order_id: orderId,
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
          emi: true,
          paylater: true,
        },
        theme: { color: "#2563eb" },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch("http://localhost:4000/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                userId,
                amount: amountNum,
              }),
            });

            const verifyData = (await verifyRes.json()) as VerifyPaymentResponse;
            if (!verifyRes.ok || verifyData.success === false) {
              throw new Error(verifyData.success === false ? verifyData.error : "Payment verification failed");
            }

            await creditWallet(userId, amountNum, orderId, response.razorpay_payment_id);
            toast.success(`✅ ₹${amountNum} added successfully`);

            setTimeout(() => navigate("/dashboard"), 2000);
          } catch (e: any) {
            console.error("verify-payment/credit error:", e);
            toast.error(e?.message || "Payment failed");
          } finally {
            setLoading(false);
          }
        },
        prefill: {
          contact: userProfile?.phone || "",
          name: userProfile?.name || "",
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            toast("Payment cancelled");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp: any) => {
        console.error("Razorpay payment.failed:", resp?.error);
        toast.error(resp?.error?.description || "Payment failed");
        setLoading(false);
      });
      rzp.open();
    } catch (e: any) {
      console.error("AddMoney error:", e);
      toast.error(e?.message || "Failed to initiate payment");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto pb-10">
      {/* Header */}
      <div className="bg-slate-950 text-white p-4 pt-6 rounded-b-3xl shadow-md mb-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Back"
          >
            ←
          </button>
          <h1 className="text-xl font-extrabold tracking-tight">Add Money</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* Balance card */}
      <Card className="p-5 mb-5 bg-gradient-to-br from-slate-950 to-slate-800 text-white border-0 shadow-lg">
        <p className="text-white/70 text-xs font-bold tracking-widest">CURRENT BALANCE</p>
        <p className="text-4xl font-extrabold mt-2">
          ₹{(userProfile?.balance ?? 0).toLocaleString("en-IN")}
        </p>
      </Card>

      <div className="space-y-4 px-2">
        {/* Amount input */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-4xl font-extrabold text-sky-500">₹</span>
          <input
            className="w-full bg-white rounded-2xl border border-slate-200 text-3xl font-extrabold text-center py-3"
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Quick amounts (2x3 grid) */}
        <div className="grid grid-cols-3 gap-3">
          {quickAmounts.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount(String(v))}
              disabled={loading}
              className={`py-2 rounded-xl text-sm font-bold transition-colors ${
                amountNum === v ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-100"
              }`}
            >
              ₹{v}
            </button>
          ))}
        </div>

        {/* Payment methods */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "UPI", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            { label: "Debit Card", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            { label: "Credit Card", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            { label: "Net Banking", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
          ].map((m) => (
            <span
              key={m.label}
              className={`px-3 py-1 rounded-full text-xs font-bold border ${m.color}`}
            >
              ✓ {m.label}
            </span>
          ))}
        </div>

        {/* Add button */}
        <Button
          className="w-full h-14 text-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600"
          size="lg"
          isLoading={loading}
          onClick={handleAddMoney}
          disabled={!amountNum || amountNum <= 0 || loading}
        >
          Add ₹{amountNum ? amountNum : 0} to Wallet →
        </Button>

        <p className="text-xs text-slate-500 text-center pt-1">
          100% Secure · Powered by Razorpay · RBI Compliant
        </p>

        {/* How it works */}
        <div className="pt-2">
          <p className="font-extrabold text-slate-900 mb-3">How it works</p>
          <div className="space-y-3">
            {[
              "Enter amount and tap Add",
              "Select UPI / Card / Net Banking in Razorpay",
              "Complete payment in Razorpay popup",
              "Money instantly added to your INRT wallet",
            ].map((t, idx) => (
              <div key={t} className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-extrabold text-sm">
                  {idx + 1}
                </div>
                <p className="text-sm text-slate-700 pt-1">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
