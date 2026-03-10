import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions } from "@/lib/firebase";

import {
  collection,
  doc,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";

import { httpsCallable } from "firebase/functions";

import { Button, Input, Card } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

import { toast } from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Wallet, Building } from "lucide-react";

import { QRScanner } from "@/components/QRScanner";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function SendMoney() {

  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);

  const [paymentMode, setPaymentMode] =
    useState<"WALLET" | "BANK">("WALLET");

  const [showScanner, setShowScanner] = useState(false);



  // =========================
  // OPEN SCANNER IF scan=true
  // =========================

  useEffect(() => {

    if (searchParams.get("scan") === "true") {
      setShowScanner(true);
    }

  }, [searchParams]);



  // =========================
  // WALLET TRANSFER
  // =========================

  const processWalletTransfer = async () => {

    const transferAmount = parseFloat(amount);

    if (!transferAmount || transferAmount <= 0) {
      toast.error("Enter valid amount");
      return;
    }

    if (!receiverId) {
      toast.error("Enter receiver ID");
      return;
    }

    setLoading(true);

    try {

      const sendMoney = httpsCallable(functions, "sendMoney");

      const transactionId =
        "tx_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

      await sendMoney({
        senderId: user!.uid,
        receiverId: receiverId,
        amount: transferAmount,
        transactionId: transactionId
      });

      const txRef = doc(collection(db, "transactions"));

      await runTransaction(db, async (transaction) => {

        transaction.set(txRef, {

          id: txRef.id,
          senderId: user!.uid,
          senderPhoneNumber: userProfile?.phoneNumber,

          receiverId: receiverId,

          amount: transferAmount,

          timestamp: serverTimestamp(),

          status: "success",

          type: "wallet_transfer",

          note: note || "",

          paymentMethod: "wallet",

          transactionId: transactionId

        });

      });

      toast.success("Transfer successful");

      navigate("/dashboard");

    } catch (error: any) {

      console.error(error);

      toast.error(error.message || "Transfer failed");

    } finally {

      setLoading(false);

    }

  };



  // =========================
  // RAZORPAY PAYMENT
  // =========================

  const processBankTransfer = async () => {

    const transferAmount = parseFloat(amount);

    if (!transferAmount || transferAmount <= 0) {
      toast.error("Enter valid amount");
      return;
    }

    setLoading(true);

    try {

      const createOrder = httpsCallable(functions, "createRazorpayOrder");

      const result: any = await createOrder({
        amount: transferAmount
      });

      const orderId = result.data.orderId;

      const options = {

        key: "rzp_test_SOmbfBMF8uYZam",

        amount: transferAmount * 100,

        currency: "INR",

        name: "INRT Wallet",

        description: "Send Money",

        order_id: orderId,

        prefill: {
          name: userProfile?.fullName,
          contact: userProfile?.phoneNumber
        },

        theme: {
          color: "#6366F1"
        },

        handler: async function (response: any) {

          const txRef = doc(collection(db, "transactions"));

          await runTransaction(db, async (transaction) => {

            transaction.set(txRef, {

              id: txRef.id,

              senderId: user!.uid,

              receiverId: receiverId,

              amount: transferAmount,

              timestamp: serverTimestamp(),

              status: "success",

              type: "bank_payment",

              paymentMethod: "razorpay",

              razorpayPaymentId: response.razorpay_payment_id,

              razorpayOrderId: response.razorpay_order_id

            });

          });

          toast.success("Payment successful");

          navigate("/dashboard");

        },

        modal: {
          ondismiss: function () {
            toast.error("Payment cancelled");
          }
        }

      };

      const rzp = new window.Razorpay(options);

      rzp.open();

    } catch (error) {

      console.error(error);

      toast.error("Payment failed");

    } finally {

      setLoading(false);

    }

  };



  // =========================
  // HANDLE QR SCAN
  // =========================

  const handleScan = (data: string) => {

    if (!data) return;

    setReceiverId(data);

    setShowScanner(false);

    toast.success("Receiver detected from QR");

  };



  // =========================
  // UI
  // =========================

  return (

    <div className="max-w-md mx-auto space-y-6">

      <h1 className="text-2xl font-bold">
        Send Money
      </h1>

      <Card className="p-6 space-y-4">

        <Input
          placeholder="Receiver UID / Phone"
          value={receiverId}
          onChange={(e) => setReceiverId(e.target.value)}
        />

        <Input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <Input
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />


        {/* PAYMENT MODE */}

        <div className="flex gap-3">

          <Button
            className={`flex-1 ${
              paymentMode === "WALLET"
                ? "bg-primary text-white"
                : "border"
            }`}
            onClick={() => setPaymentMode("WALLET")}
          >
            <Wallet size={16} className="mr-2" />
            Wallet
          </Button>

          <Button
            className={`flex-1 ${
              paymentMode === "BANK"
                ? "bg-primary text-white"
                : "border"
            }`}
            onClick={() => setPaymentMode("BANK")}
          >
            <Building size={16} className="mr-2" />
            Bank / UPI
          </Button>

        </div>


        <Button
          onClick={
            paymentMode === "WALLET"
              ? processWalletTransfer
              : processBankTransfer
          }
          isLoading={loading}
          className="w-full"
        >
          Pay {amount ? formatCurrency(parseFloat(amount)) : ""}
        </Button>

      </Card>



      {/* QR SCANNER */}

      {showScanner && (

        <QRScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />

      )}

    </div>

  );

}