import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, runTransaction, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { SplitPayment, UserProfile } from '@/types';
import { Button, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { ArrowLeft, CheckCircle, Clock, XCircle, Wallet, Building, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PinVerificationModal } from '@/components/PinVerificationModal';
import { httpsCallable, getFunctions } from 'firebase/functions';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function SplitDetails() {
  const { id } = useParams<{ id: string }>();
  const { user, userProfile } = useAuth();
  const functions = getFunctions();
  const navigate = useNavigate();
  const [split, setSplit] = useState<SplitPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentMode, setPaymentMode] = useState<'WALLET' | 'BANK'>('WALLET');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!id || !user) return;

    const fetchSplit = async () => {
      try {
        const docRef = doc(db, 'splitPayments', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSplit({ ...docSnap.data(), id: docSnap.id } as SplitPayment);
        } else {
          toast.error("Split not found");
          navigate('/split-bill');
        }
      } catch (error) {
        console.error(error);
        toast.error("Error fetching split details");
      } finally {
        setLoading(false);
      }
    };

    fetchSplit();
  }, [id, user, navigate]);

  const myParticipantData = split?.participants.find(p => p.userId === user?.uid);
  const isCreator = split?.creatorId === user?.uid;
  const isParticipant = !!myParticipantData;

  const initiatePayment = () => {
    if (!myParticipantData || !userProfile) return;

    if (paymentMode === 'WALLET') {
      if (myParticipantData.amount > userProfile.walletBalance) {
        toast.error("Insufficient wallet balance");
        return;
      }
    }
    setShowPinModal(true);
  };

  const handlePayment = async () => {
    if (paymentMode === 'WALLET') {
      await processWalletPayment();
    } else {
      await processBankPayment();
    }
  };

  const processWalletPayment = async () => {
    if (!split || !myParticipantData || !user) return;
    setProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        // Get Payer (Me)
        const payerRef = doc(db, 'users', user.uid);
        const payerDoc = await transaction.get(payerRef);
        if (!payerDoc.exists()) throw "Payer not found";
        
        const payerData = payerDoc.data();
        if (payerData.walletBalance < myParticipantData.amount) throw "Insufficient funds";

        // Get Creator (Receiver)
        const creatorRef = doc(db, 'users', split.creatorId);
        const creatorDoc = await transaction.get(creatorRef);
        if (!creatorDoc.exists()) throw "Creator not found";

        // Update Balances
        const newPayerBalance = payerData.walletBalance - myParticipantData.amount;
        const newCreatorBalance = (creatorDoc.data().walletBalance || 0) + myParticipantData.amount;

        transaction.update(payerRef, { walletBalance: newPayerBalance });
        transaction.update(creatorRef, { walletBalance: newCreatorBalance });

        // Update Split Document
        const splitRef = doc(db, 'splitPayments', split.id);
        const updatedParticipants = split.participants.map(p => {
            if (p.userId === user.uid) {
                return { ...p, status: 'paid' as const, paidAt: Date.now() };
            }
            return p;
        });
        
        // Check if all paid
        const allPaid = updatedParticipants.every(p => p.status === 'paid');
        
        transaction.update(splitRef, { 
            participants: updatedParticipants,
            status: allPaid ? 'completed' : 'pending'
        });

        // Create Transaction Record
        const newTxRef = doc(collection(db, 'transactions'));
        transaction.set(newTxRef, {
          id: newTxRef.id,
          senderId: user.uid,
          senderPhoneNumber: payerData.phoneNumber,
          receiverId: split.creatorId,
          receiverPhoneNumber: creatorDoc.data().phoneNumber,
          amount: myParticipantData.amount,
          timestamp: serverTimestamp(),
          status: 'success',
          type: 'split_payment',
          description: `Split Payment: ${split.note}`,
          paymentMethod: 'wallet'
        });

        // Notification for Creator
        const notifRef = doc(collection(db, 'notifications'));
        transaction.set(notifRef, {
          userId: split.creatorId,
          type: 'split_settled',
          title: 'Split Payment Received',
          message: `${payerData.fullName || payerData.phoneNumber} paid their share of ${formatCurrency(myParticipantData.amount)} for ${split.note}`,
          amount: myParticipantData.amount,
          status: 'unread',
          timestamp: Date.now()
        });
      });

      toast.success("Payment successful!");
      setShowPaymentModal(false);
      // Refresh data
      const updatedDoc = await getDoc(doc(db, 'splitPayments', split.id));
      if (updatedDoc.exists()) {
          setSplit({ ...updatedDoc.data(), id: updatedDoc.id } as SplitPayment);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Payment failed");
    } finally {
      setProcessing(false);
    }
  };

  const processBankPayment = async () => {
    if (!split || !myParticipantData || !user) return;
    setProcessing(true);
    try {
        // Simulation logic similar to other pages
        await runTransaction(db, async (transaction) => {
            // Update Split Document
            const splitRef = doc(db, 'splitPayments', split.id);
            const updatedParticipants = split.participants.map(p => {
                if (p.userId === user.uid) {
                    return { ...p, status: 'paid' as const, paidAt: Date.now() };
                }
                return p;
            });
            
            const allPaid = updatedParticipants.every(p => p.status === 'paid');
            
            transaction.update(splitRef, { 
                participants: updatedParticipants,
                status: allPaid ? 'completed' : 'pending'
            });

            // Transaction Record
            const newTxRef = doc(collection(db, 'transactions'));
            transaction.set(newTxRef, {
              id: newTxRef.id,
              senderId: user.uid,
              senderPhoneNumber: userProfile?.phoneNumber,
              receiverId: split.creatorId,
              receiverPhoneNumber: split.creatorName,
              amount: myParticipantData.amount,
              timestamp: serverTimestamp(),
              status: 'success',
              type: 'split_payment',
              description: `Split Payment: ${split.note}`,
              paymentMethod: 'razorpay',
              razorpayPaymentId: "simulated_" + Date.now()
            });

            // Notification
            const notifRef = doc(collection(db, 'notifications'));
            transaction.set(notifRef, {
              userId: split.creatorId,
              type: 'split_settled',
              title: 'Split Payment Received',
              message: `${userProfile?.fullName || userProfile?.phoneNumber} paid their share of ${formatCurrency(myParticipantData.amount)} for ${split.note}`,
              amount: myParticipantData.amount,
              status: 'unread',
              timestamp: Date.now()
            });
        });

        toast.success("Payment successful!");
        setShowPaymentModal(false);
        const updatedDoc = await getDoc(doc(db, 'splitPayments', split.id));
        if (updatedDoc.exists()) {
            setSplit({ ...updatedDoc.data(), id: updatedDoc.id } as SplitPayment);
        }
    } catch (error) {
        console.error(error);
        toast.error("Payment failed");
    } finally {
        setProcessing(false);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (!split) return <div className="p-4">Split not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/split-bill')}>
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-2xl font-bold">Split Details</h1>
      </div>

      <Card className="p-6 bg-blue-50 border-blue-100">
        <h2 className="text-xl font-bold mb-1">{split.note}</h2>
        <p className="text-sm text-slate-500 mb-4">Created by {split.creatorName}</p>
        
        <div className="flex justify-between items-end">
            <div>
                <p className="text-sm text-slate-500">Total Bill</p>
                <p className="text-3xl font-bold text-blue-700">{formatCurrency(split.totalAmount)}</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-bold ${split.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {split.status.toUpperCase()}
            </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold mb-4">Participants</h3>
        <div className="space-y-4">
            {/* Creator Row (Implicitly Paid) */}
            <div className="flex justify-between items-center p-2">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                        {split.creatorName.charAt(0)}
                    </div>
                    <div>
                        <p className="font-medium">{split.creatorName} <span className="text-xs text-slate-400">(Creator)</span></p>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-xs font-bold text-green-600 flex items-center">
                        <CheckCircle size={14} className="mr-1" /> PAID
                    </span>
                </div>
            </div>

            {split.participants.map(p => (
                <div key={p.userId} className="flex justify-between items-center p-2 border-t border-slate-50">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold">
                            {p.name.charAt(0)}
                        </div>
                        <div>
                            <p className="font-medium">{p.name} {p.userId === user?.uid && <span className="text-xs text-blue-500">(You)</span>}</p>
                            <p className="text-xs text-slate-500">{formatCurrency(p.amount)}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        {p.status === 'paid' ? (
                            <span className="text-xs font-bold text-green-600 flex items-center">
                                <CheckCircle size={14} className="mr-1" /> PAID
                            </span>
                        ) : p.status === 'declined' ? (
                            <span className="text-xs font-bold text-red-600 flex items-center">
                                <XCircle size={14} className="mr-1" /> DECLINED
                            </span>
                        ) : (
                            <span className="text-xs font-bold text-yellow-600 flex items-center">
                                <Clock size={14} className="mr-1" /> PENDING
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
      </Card>

      {isParticipant && myParticipantData?.status === 'pending' && (
        <div className="fixed bottom-20 left-4 right-4 md:absolute md:bottom-4">
            <Button className="w-full shadow-lg" size="lg" onClick={() => setShowPaymentModal(true)}>
                Pay My Share {formatCurrency(myParticipantData.amount)}
            </Button>
        </div>
      )}

      {showPaymentModal && myParticipantData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 bg-white">
            <h3 className="text-lg font-bold mb-4">Pay Split Share</h3>
            <div className="mb-6">
              <p className="text-sm text-slate-500">Paying to</p>
              <p className="font-bold text-lg">{split.creatorName}</p>
              <p className="text-2xl font-bold mt-2">{formatCurrency(myParticipantData.amount)}</p>
              <p className="text-sm text-slate-500 mt-1">For: {split.note}</p>
            </div>

            <div className="space-y-3 mb-6">
              <label className="block text-sm font-medium text-slate-700">Select Payment Method</label>
              <div 
                className={`border rounded-xl p-3 cursor-pointer flex items-center justify-between ${paymentMode === 'WALLET' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300'}`}
                onClick={() => setPaymentMode('WALLET')}
              >
                <div className="flex items-center space-x-3">
                  <Wallet className={paymentMode === 'WALLET' ? 'text-primary' : 'text-slate-400'} />
                  <div>
                    <p className="font-bold text-sm">Wallet Balance</p>
                    <p className="text-xs text-slate-500">Available: {formatCurrency(userProfile?.walletBalance || 0)}</p>
                  </div>
                </div>
                {paymentMode === 'WALLET' && <Check size={16} className="text-primary" />}
              </div>

              <div 
                className={`border rounded-xl p-3 cursor-pointer flex items-center justify-between ${paymentMode === 'BANK' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300'}`}
                onClick={() => setPaymentMode('BANK')}
              >
                <div className="flex items-center space-x-3">
                  <Building className={paymentMode === 'BANK' ? 'text-primary' : 'text-slate-400'} />
                  <div>
                    <p className="font-bold text-sm">Bank Account</p>
                    <p className="text-xs text-slate-500">Pay via UPI/Card</p>
                  </div>
                </div>
                {paymentMode === 'BANK' && <Check size={16} className="text-primary" />}
              </div>
            </div>

            <div className="flex gap-3">
              <Button className="flex-1" onClick={initiatePayment} isLoading={processing}>
                Pay {formatCurrency(myParticipantData.amount)}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowPaymentModal(false)} disabled={processing}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      <PinVerificationModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={handlePayment}
      />
    </div>
  );
}
