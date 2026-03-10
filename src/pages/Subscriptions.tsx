import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Subscription } from '@/types';
import { Card, Button, Input } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { Calendar, CheckCircle, PauseCircle, PlayCircle, XCircle, Plus, RefreshCw } from 'lucide-react';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { toast } from 'react-hot-toast';

export default function Subscriptions() {
  const { user, userProfile } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'paused' | 'cancelled'>('active');

  // Create Form State
  const [merchantName, setMerchantName] = useState('');
  const [amount, setAmount] = useState('');
  const [interval, setInterval] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const q = query(
      collection(db, 'subscriptions'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const subs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Subscription));
      setSubscriptions(subs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching subscriptions:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreate = async () => {
    if (!user || !merchantName || !amount) return;

    setProcessing(true);
    try {
      const nextDate = getNextPaymentDate(Date.now(), interval);
      
      await addDoc(collection(db, 'subscriptions'), {
        userId: user.uid,
        merchantName,
        amount: parseFloat(amount),
        interval,
        nextPaymentDate: nextDate,
        status: 'active',
        paymentMethod: 'wallet',
        createdAt: Date.now()
      });

      toast.success("AutoPay created successfully!");
      setShowCreate(false);
      setMerchantName('');
      setAmount('');
      setInterval('monthly');
    } catch (error) {
      console.error("Error creating subscription:", error);
      toast.error("Failed to create subscription");
    } finally {
      setProcessing(false);
    }
  };

  const updateStatus = async (id: string, status: Subscription['status']) => {
    try {
      await updateDoc(doc(db, 'subscriptions', id), { status });
      toast.success(`Subscription ${status}`);
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const getNextPaymentDate = (current: number, interval: string) => {
    const date = new Date(current);
    switch (interval) {
      case 'daily': return addDays(date, 1).getTime();
      case 'weekly': return addWeeks(date, 1).getTime();
      case 'monthly': return addMonths(date, 1).getTime();
      default: return addMonths(date, 1).getTime();
    }
  };

  // Simulate Cloud Function for Daily Processing
  const runDailyScheduler = async () => {
    if (!user || !userProfile) return;
    
    const confirmRun = window.confirm("Simulate daily AutoPay processing? This will process due payments.");
    if (!confirmRun) return;

    setProcessing(true);
    let processedCount = 0;

    try {
      const activeSubs = subscriptions.filter(s => s.status === 'active');
      const today = Date.now();

      for (const sub of activeSubs) {
        if (today >= sub.nextPaymentDate) {
          await runTransaction(db, async (transaction) => {
            // Get fresh user data
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) throw "User not found";
            
            const userData = userDoc.data();
            if (userData.walletBalance < sub.amount) {
              throw new Error(`Insufficient balance for ${sub.merchantName}`);
            }

            // Deduct balance
            const newBalance = userData.walletBalance - sub.amount;
            transaction.update(userRef, { walletBalance: newBalance });

            // Create Transaction Record
            const newTxRef = doc(collection(db, 'transactions'));
            transaction.set(newTxRef, {
              id: newTxRef.id,
              senderId: user.uid,
              senderPhoneNumber: userData.phoneNumber,
              receiverId: 'merchant_autopay', // Placeholder
              amount: sub.amount,
              timestamp: serverTimestamp(),
              status: 'success',
              type: 'subscription_payment',
              description: `AutoPay to ${sub.merchantName}`,
              paymentMethod: 'wallet'
            });

            // Create Notification
            const notifRef = doc(collection(db, 'notifications'));
            transaction.set(notifRef, {
              userId: user.uid,
              type: 'subscription_payment',
              title: 'AutoPay Successful',
              message: `You paid ${formatCurrency(sub.amount)} to ${sub.merchantName} (AutoPay)`,
              amount: sub.amount,
              status: 'unread',
              timestamp: Date.now()
            });

            // Update Next Payment Date
            const subRef = doc(db, 'subscriptions', sub.id);
            const nextDate = getNextPaymentDate(sub.nextPaymentDate, sub.interval);
            transaction.update(subRef, { nextPaymentDate: nextDate });
          });
          processedCount++;
        }
      }
      
      if (processedCount > 0) {
        toast.success(`Processed ${processedCount} payments successfully`);
      } else {
        toast.success("No payments due today");
      }

    } catch (error: any) {
      console.error("Scheduler error:", error);
      toast.error(error.message || "Error processing payments");
    } finally {
      setProcessing(false);
    }
  };

  const filteredSubs = subscriptions.filter(s => s.status === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={runDailyScheduler} title="Simulate Daily Run">
            <RefreshCw size={20} className={processing ? "animate-spin" : ""} />
          </Button>
          <Button onClick={() => setShowCreate(!showCreate)} variant={showCreate ? "secondary" : "default"}>
            {showCreate ? "Cancel" : <><Plus size={16} className="mr-1" /> Create AutoPay</>}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card className="p-4 bg-slate-50 border-slate-200">
          <h3 className="font-bold mb-4">Setup New AutoPay</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Merchant / Service Name</label>
              <Input 
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="Netflix, Spotify, Rent..."
              />
            </div>
            <div>
              <label className="text-sm font-medium">Amount</label>
              <Input 
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Frequency</label>
              <div className="flex gap-2 mt-1">
                {(['daily', 'weekly', 'monthly'] as const).map(int => (
                  <button
                    key={int}
                    onClick={() => setInterval(int)}
                    className={`px-3 py-1.5 text-sm rounded-lg capitalize ${
                      interval === int ? 'bg-primary text-white' : 'bg-white border text-slate-600'
                    }`}
                  >
                    {int}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={handleCreate} isLoading={processing}>
              Enable AutoPay
            </Button>
          </div>
        </Card>
      )}

      <div className="flex space-x-2 border-b border-slate-200">
        {(['active', 'paused', 'cancelled'] as const).map(tab => (
          <button
            key={tab}
            className={`pb-2 px-4 font-medium text-sm capitalize ${
              activeTab === tab ? 'border-b-2 border-primary text-primary' : 'text-slate-500'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filteredSubs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Calendar size={32} className="mx-auto mb-2 opacity-50" />
            <p>No {activeTab} subscriptions</p>
          </div>
        ) : (
          filteredSubs.map(sub => (
            <Card key={sub.id} className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg">{sub.merchantName}</h3>
                  <p className="text-sm text-slate-500 capitalize">{sub.interval} Payment</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-xl">{formatCurrency(sub.amount)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full uppercase font-bold ${
                    sub.status === 'active' ? 'bg-green-100 text-green-700' :
                    sub.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {sub.status}
                  </span>
                </div>
              </div>

              <div className="flex items-center text-xs text-slate-500 mb-4 bg-slate-50 p-2 rounded">
                <Calendar size={14} className="mr-2" />
                Next Payment: {format(new Date(sub.nextPaymentDate), 'MMM d, yyyy')}
              </div>

              <div className="flex gap-2">
                {sub.status === 'active' && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => updateStatus(sub.id, 'paused')}>
                    <PauseCircle size={16} className="mr-1" /> Pause
                  </Button>
                )}
                {sub.status === 'paused' && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => updateStatus(sub.id, 'active')}>
                    <PlayCircle size={16} className="mr-1" /> Resume
                  </Button>
                )}
                {sub.status !== 'cancelled' && (
                  <Button variant="outline" size="sm" className="flex-1 text-red-600 hover:bg-red-50 border-red-200" onClick={() => updateStatus(sub.id, 'cancelled')}>
                    <XCircle size={16} className="mr-1" /> Cancel
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
