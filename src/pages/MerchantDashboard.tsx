import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Transaction } from '@/types';
import { Card, Button } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { ArrowDownLeft, Store, QrCode } from 'lucide-react';
import QRCode from 'react-qr-code';
import { format } from 'date-fns';

export default function MerchantDashboard() {
  const { user, userProfile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) return;

    const fetchMerchantData = async () => {
      setLoading(true);
      try {
        const txRef = collection(db, 'transactions');
        // Get all received transactions
        const q = query(
          txRef, 
          where('receiverId', '==', user.uid),
          orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const txs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
        setTransactions(txs);

        // Calculate stats
        let today = 0;
        let total = 0;
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        txs.forEach(tx => {
          if (tx.status === 'success') {
            total += tx.amount;
            const txDate = new Date(tx.timestamp); // Assuming timestamp is number (ms) or Firestore Timestamp
            // Handle Firestore timestamp if needed, but types say number
            if (tx.timestamp >= startOfDay.getTime()) {
              today += tx.amount;
            }
          }
        });

        setTodayEarnings(today);
        setTotalReceived(total);

      } catch (error) {
        console.error("Error fetching merchant data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMerchantData();
  }, [user]);

  if (userProfile?.accountType !== 'merchant') {
    return (
      <div className="text-center py-12">
        <Store size={48} className="mx-auto text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-700">Merchant Account Required</h2>
        <p className="text-slate-500">Please switch to a merchant account to view this dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Merchant Dashboard</h1>
        <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
          Business Account
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-green-50 border-green-100">
          <p className="text-xs text-green-600 font-medium uppercase mb-1">Today's Earnings</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(todayEarnings)}</p>
        </Card>
        <Card className="p-4 bg-blue-50 border-blue-100">
          <p className="text-xs text-blue-600 font-medium uppercase mb-1">Total Received</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalReceived)}</p>
        </Card>
      </div>

      <Card className="p-6 flex flex-col items-center text-center">
        <h3 className="font-bold text-lg mb-4">{userProfile?.fullName || 'My Business'}</h3>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-4">
          <QRCode 
            value={`INRT://pay?upi=${userProfile?.upiId || ''}`}
            size={180}
            level="H"
          />
        </div>
        <p className="font-mono bg-slate-100 px-3 py-1 rounded text-sm text-slate-600 mb-2">
          {userProfile?.upiId}
        </p>
        <p className="text-xs text-slate-400">Scan to pay to this business</p>
      </Card>

      <div>
        <h3 className="font-bold text-lg mb-4">Recent Payments</h3>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-slate-400">No payments received yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 5).map(tx => (
              <Card key={tx.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                    <ArrowDownLeft size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-900">Received from {tx.senderPhoneNumber}</p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(tx.timestamp), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
                <span className="font-bold text-green-600">+{formatCurrency(tx.amount)}</span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
