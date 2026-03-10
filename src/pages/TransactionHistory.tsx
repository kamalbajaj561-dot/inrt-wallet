import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Transaction } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui';
import { ArrowUpRight, ArrowDownLeft, Clock, Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function TransactionHistory() {
  const { user } = useAuth();
  const [sentTransactions, setSentTransactions] = useState<Transaction[]>([]);
  const [receivedTransactions, setReceivedTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) return;

    setLoading(true);
    const txRef = collection(db, 'transactions');

    // NOTE: We use two separate listeners because Firestore requires a composite index
    // for an 'OR' query combined with 'orderBy'. To avoid requiring manual index creation
    // for this demo, we fetch both sets separately and merge them client-side.

    // Listener for sent transactions
    // Note: We removed orderBy and limit to avoid needing a composite index (senderId + timestamp)
    // which requires manual creation in the Firebase Console.
    const sentQuery = query(
      txRef, 
      where('senderId', '==', user.uid)
    );

    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setSentTransactions(txs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching sent transactions:", error);
      setLoading(false);
    });

    // Listener for received transactions
    const receivedQuery = query(
      txRef, 
      where('receiverId', '==', user.uid)
    );

    const unsubscribeReceived = onSnapshot(receivedQuery, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setReceivedTransactions(txs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching received transactions:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeSent();
      unsubscribeReceived();
    };
  }, [user]);

  const transactions = useMemo(() => {
    const all = [...sentTransactions, ...receivedTransactions];
    // Deduplicate in case of overlap
    const uniqueMap = new Map();
    all.forEach(tx => uniqueMap.set(tx.id, tx));
    
    return Array.from(uniqueMap.values()).sort((a: any, b: any) => {
      const timeA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : a.timestamp || 0;
      const timeB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : b.timestamp || 0;
      return timeB - timeA;
    });
  }, [sentTransactions, receivedTransactions]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transaction History</h1>

      {loading && transactions.length === 0 ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
            <Clock size={32} />
          </div>
          <h3 className="text-lg font-medium text-slate-900">No transactions yet</h3>
          <p className="text-slate-500">Your activity will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => {
            const isDeposit = tx.type === 'deposit';
            const isSender = tx.senderId === user?.uid;
            const date = (tx.timestamp as any)?.seconds 
              ? new Date((tx.timestamp as any).seconds * 1000) 
              : new Date(tx.timestamp || Date.now());

            return (
              <Card key={tx.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer">
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isDeposit ? 'bg-green-100 text-green-600' :
                    isSender ? 'bg-slate-100 text-slate-600' : 'bg-green-100 text-green-600'
                  }`}>
                    {isDeposit ? <Plus size={20} /> :
                     isSender ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">
                      {isDeposit ? (tx.paymentMethod === 'razorpay' ? 'Wallet Top-up (Razorpay)' : 'Wallet Top-up') :
                       isSender ? `To: ${tx.receiverPhoneNumber}` : `From: ${tx.senderPhoneNumber}`}
                    </p>
                    {tx.note && <p className="text-xs text-slate-700 italic">"{tx.note}"</p>}
                    <p className="text-xs text-slate-500">{format(date, 'MMM d, h:mm a')}</p>
                  </div>
                </div>
                <div className={`text-right font-bold ${
                  isDeposit || !isSender ? 'text-green-600' : 'text-slate-900'
                }`}>
                  {isDeposit || !isSender ? '+' : '-'}{formatCurrency(tx.amount)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
