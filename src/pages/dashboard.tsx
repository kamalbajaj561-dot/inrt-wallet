import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  ChevronRight,
  QrCode,
  ArrowLeftRight,
  Plus,
  Send,
  Bell
} from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { format } from "date-fns";
import QRCode from "react-qr-code";

export default function Dashboard() {

  const { user, userProfile } = useAuth();

  const [sentTransactions, setSentTransactions] = useState<any[]>([]);
  const [receivedTransactions, setReceivedTransactions] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const qrData = JSON.stringify({
    walletId: user?.uid,
    upiId: userProfile?.upiId || null,
    name: userProfile?.fullName || "INRT User"
  });

  useEffect(() => {

    if (!user) return;

    const txRef = collection(db, "transactions");
    const reqRef = collection(db, "payment_requests");

    const sentQuery = query(txRef, where("senderId", "==", user.uid));
    const receivedQuery = query(txRef, where("receiverId", "==", user.uid));

    const reqQuery = query(
      reqRef,
      where("receiverId", "==", user.uid),
      where("status", "==", "pending")
    );

    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      const txs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setSentTransactions(txs);
      setLoading(false);
    });

    const unsubscribeReceived = onSnapshot(receivedQuery, (snapshot) => {
      const txs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setReceivedTransactions(txs);
      setLoading(false);
    });

    const unsubscribeReq = onSnapshot(reqQuery, (snapshot) => {
      const reqs = snapshot.docs.map((doc) => ({
        requestId: doc.id,
        ...doc.data()
      }));
      setPendingRequests(reqs);
    });

    return () => {
      unsubscribeSent();
      unsubscribeReceived();
      unsubscribeReq();
    };

  }, [user]);

  const recentTransactions = useMemo(() => {

    const all = [...sentTransactions, ...receivedTransactions];

    const unique = new Map();

    all.forEach((tx) => unique.set(tx.id, tx));

    return Array.from(unique.values())
      .sort((a: any, b: any) => {

        const timeA = a.timestamp?.seconds
          ? a.timestamp.seconds * 1000
          : a.timestamp || 0;

        const timeB = b.timestamp?.seconds
          ? b.timestamp.seconds * 1000
          : b.timestamp || 0;

        return timeB - timeA;

      })
      .slice(0, 5);

  }, [sentTransactions, receivedTransactions]);

  return (


    <div className="space-y-6">
      <h1 style={{color:"red"}}>TEST CHANGE</h1>

      {/* Balance Card */}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="bg-primary text-white rounded-2xl p-6 shadow-xl relative">

          <div className="flex justify-between items-start">

            <div>

              <p className="text-sm text-primary-100 mb-1">
                Total Balance
              </p>

              <h2 className="text-4xl font-bold">
                {formatCurrency(userProfile?.walletBalance || 0)}
              </h2>

              {userProfile?.upiId && (
                <div className="mt-2 text-xs bg-white/10 px-2 py-1 rounded inline-block">
                  {userProfile.upiId}
                </div>
              )}

            </div>

            <div className="bg-white/10 p-2 rounded-lg">
              <Wallet size={24} />
            </div>

          </div>

        </div>
      </motion.div>



      {/* RECEIVE PAYMENT QR */}

      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">

        <h3 className="font-bold mb-3 flex items-center justify-center">
          <QrCode size={18} className="mr-2 text-primary" />
          Receive Payment
        </h3>

        <div className="inline-block bg-white p-3 rounded-lg">

          <QRCode
            value={qrData}
            size={160}
          />

        </div>

        <p className="text-xs text-slate-500 mt-2">
          Scan this QR to pay
        </p>

      </div>



      {/* Quick Actions */}

      <div className="grid grid-cols-4 gap-2">

        <Link
          to="/send"
          className="flex flex-col items-center p-2"
        >
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-2">
            <Send size={24} />
          </div>
          <span className="text-xs">Send</span>
        </Link>


        <Link
          to="/send?scan=true"
          className="flex flex-col items-center p-2"
        >
          <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-2">
            <QrCode size={24} />
          </div>
          <span className="text-xs">Scan QR</span>
        </Link>


        <Link
          to="/add-money"
          className="flex flex-col items-center p-2"
        >
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 mb-2">
            <Plus size={24} />
          </div>
          <span className="text-xs">Add Money</span>
        </Link>


        <Link
          to="/request"
          className="flex flex-col items-center p-2"
        >
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 mb-2">
            <ArrowLeftRight size={24} />
          </div>
          <span className="text-xs">Request</span>
        </Link>

      </div>



      {/* Pending Requests */}

      {pendingRequests.length > 0 && (

        <div>

          <div className="flex justify-between items-center mb-4">

            <h3 className="text-lg font-bold flex items-center">
              <Bell size={18} className="mr-2 text-orange-500" />
              Pending Requests
            </h3>

            <Link to="/request" className="text-sm text-primary">
              View All
            </Link>

          </div>

          <div className="space-y-3">

            {pendingRequests.slice(0,3).map((req:any) => (

              <Card key={req.requestId} className="p-4">

                <div className="flex justify-between items-center">

                  <div>
                    <p className="font-bold text-sm">
                      Request from {req.senderName}
                    </p>

                    <p className="text-xs text-slate-500">
                      {req.description || "Payment request"}
                    </p>
                  </div>

                  <div className="text-right">

                    <p className="font-bold">
                      {formatCurrency(req.amount)}
                    </p>

                    <Link to="/request">
                      <button className="text-xs text-primary">
                        Pay Now
                      </button>
                    </Link>

                  </div>

                </div>

              </Card>

            ))}

          </div>

        </div>

      )}



      {/* Recent Transactions */}

      <div>

        <div className="flex justify-between items-center mb-4">

          <h3 className="text-lg font-bold">
            Recent Transactions
          </h3>

          <Link to="/history" className="text-sm text-primary flex items-center">
            View All <ChevronRight size={16} />
          </Link>

        </div>

        {recentTransactions.length === 0 ? (

          <div className="text-center py-8 bg-white rounded-xl border border-dashed">

            <Wallet size={20} className="mx-auto mb-2 text-slate-300" />

            <p className="text-slate-400 text-sm">
              No recent transactions
            </p>

          </div>

        ) : (

          <div className="space-y-3">

            {recentTransactions.map((tx:any) => {

              const isSender = tx.senderId === user?.uid;

              const date = tx.timestamp?.seconds
                ? new Date(tx.timestamp.seconds * 1000)
                : new Date();

              return (

                <Card key={tx.id} className="p-4 flex justify-between items-center">

                  <div className="flex items-center space-x-4">

                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      isSender
                        ? "bg-slate-100 text-slate-600"
                        : "bg-green-100 text-green-600"
                    }`}>

                      {isSender
                        ? <ArrowUpRight size={20}/>
                        : <ArrowDownLeft size={20}/>}

                    </div>

                    <div>

                      <p className="font-bold text-sm">

                        {isSender
                          ? `To: ${tx.receiverPhoneNumber || tx.receiverId}`
                          : `From: ${tx.senderPhoneNumber || tx.senderId}`}

                      </p>

                      <p className="text-xs text-slate-500">
                        {format(date,"MMM d, h:mm a")}
                      </p>

                    </div>

                  </div>

                  <div className={`font-bold ${
                    isSender ? "text-slate-900" : "text-green-600"
                  }`}>

                    {isSender ? "-" : "+"}
                    {formatCurrency(tx.amount)}

                  </div>

                </Card>

              );

            })}

          </div>

        )}

      </div>

    </div>
  );
}