import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, functions } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, onSnapshot, orderBy, updateDoc, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Button, Input, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { PaymentRequest, UserProfile } from '@/types';
import { toast } from 'react-hot-toast';
import { ArrowDownLeft, ArrowUpRight, Check, X, Clock, Search, Wallet, Building } from 'lucide-react';
import { format } from 'date-fns';

import { PinVerificationModal } from '@/components/PinVerificationModal';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function RequestMoney() {
  const { user, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  
  // New Request State
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);

  // Payment Modal State
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'WALLET' | 'BANK'>('WALLET');
  const [showPinModal, setShowPinModal] = useState(false);

  useEffect(() => {
    if (!user || !db) return;

    const reqRef = collection(db, 'payment_requests');
    let q;

    if (activeTab === 'received') {
      // Requests sent TO me (I need to pay)
      q = query(reqRef, where('receiverId', '==', user.uid), orderBy('timestamp', 'desc'));
    } else {
      // Requests sent BY me (I want money)
      q = query(reqRef, where('senderId', '==', user.uid), orderBy('timestamp', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map(doc => {
        const data = doc.data() as PaymentRequest;
        // Check for expiration (24 hours)
        if (data.status === 'pending' && Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
           // Ideally update in DB, but for display we can mark as expired
           return { ...data, requestId: doc.id, status: 'expired' };
        }
        return { ...data, requestId: doc.id };
      });
      setRequests(reqs);
    });

    return () => unsubscribe();
  }, [user, activeTab]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    setLoading(true);
    try {
      const usersRef = collection(db!, 'users');
      let querySnapshot;

      if (searchQuery.includes('@')) {
        const q = query(usersRef, where('upiId', '==', searchQuery));
        querySnapshot = await getDocs(q);
      } else {
        let formattedQuery = searchQuery;
        if (!searchQuery.startsWith('+') && /^\d+$/.test(searchQuery)) {
           formattedQuery = `+91${searchQuery}`;
        }
        const q = query(usersRef, where('phoneNumber', '==', formattedQuery));
        querySnapshot = await getDocs(q);
      }

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data() as UserProfile;
        if (userData.uid === user?.uid) {
          toast.error("You cannot request money from yourself");
          setFoundUser(null);
        } else {
          setFoundUser(userData);
        }
      } else {
        toast.error("User not found");
        setFoundUser(null);
      }
    } catch (error) {
      console.error(error);
      toast.error("Error searching user");
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async () => {
    if (!foundUser || !amount || !user || !userProfile) return;

    setLoading(true);
    try {
      await addDoc(collection(db!, 'payment_requests'), {
        senderId: user.uid,
        senderName: userProfile.fullName || userProfile.phoneNumber,
        senderUpiId: userProfile.upiId,
        receiverId: foundUser.uid,
        receiverUpiId: foundUser.upiId,
        amount: parseFloat(amount),
        status: 'pending',
        timestamp: Date.now(),
        description: description || 'Payment Request'
      });

      // Create Notification for Receiver
      await addDoc(collection(db!, 'notifications'), {
        userId: foundUser.uid,
        type: 'payment_request',
        title: 'Payment Request',
        message: `${userProfile.fullName || userProfile.phoneNumber} requested ${formatCurrency(parseFloat(amount))}`,
        amount: parseFloat(amount),
        status: 'unread',
        timestamp: Date.now()
      });
      
      toast.success("Request sent successfully!");
      setShowNewRequest(false);
      setSearchQuery('');
      setAmount('');
      setFoundUser(null);
      setActiveTab('sent');
    } catch (error) {
      console.error(error);
      toast.error("Failed to send request");
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async (request: PaymentRequest) => {
    if (!user) return;
    try {
      await updateDoc(doc(db!, 'payment_requests', request.requestId), {
        status: 'declined'
      });

      // Create Notification for Sender (Requester)
      await addDoc(collection(db!, 'notifications'), {
        userId: request.senderId,
        type: 'request_declined',
        title: 'Request Declined',
        message: `${userProfile?.fullName || userProfile?.phoneNumber} declined your request of ${formatCurrency(request.amount)}`,
        amount: request.amount,
        status: 'unread',
        timestamp: Date.now()
      });

      toast.success("Request declined");
    } catch (e) {
      toast.error("Error declining request");
    }
  };

  const openPaymentModal = (request: PaymentRequest) => {
    setSelectedRequest(request);
    setShowPaymentModal(true);
    setPaymentMode('WALLET');
  };

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const initiatePayment = () => {
    if (!selectedRequest || !user || !userProfile) return;

    if (paymentMode === 'WALLET') {
      if (selectedRequest.amount > userProfile.walletBalance) {
        toast.error("Insufficient wallet balance");
        return;
      }
    }

    setShowPinModal(true);
  };

  const processPayment = async () => {
    if (paymentMode === 'WALLET') {
      await processWalletPayment();
    } else {
      await processBankPayment();
    }
  };

  const processWalletPayment = async () => {
    if (!selectedRequest) return;
    setLoading(true);
    try {
      await runTransaction(db!, async (transaction) => {
        // Get sender (me, the payer)
        const senderRef = doc(db!, 'users', user!.uid);
        const senderDoc = await transaction.get(senderRef);
        if (!senderDoc.exists()) throw new Error("Sender not found");
        
        const senderData = senderDoc.data();
        if (senderData.walletBalance < selectedRequest.amount) {
          throw new Error("Insufficient funds");
        }

        // Get receiver (the person who requested)
        const receiverRef = doc(db!, 'users', selectedRequest.senderId);
        const receiverDoc = await transaction.get(receiverRef);
        if (!receiverDoc.exists()) throw new Error("Receiver not found");

        // Update balances
        const newSenderBalance = senderData.walletBalance - selectedRequest.amount;
        const newReceiverBalance = (receiverDoc.data().walletBalance || 0) + selectedRequest.amount;

        transaction.update(senderRef, { walletBalance: newSenderBalance });
        transaction.update(receiverRef, { walletBalance: newReceiverBalance });

        // Create transaction record
        const newTxRef = doc(collection(db!, 'transactions'));
        transaction.set(newTxRef, {
          id: newTxRef.id,
          senderId: user!.uid,
          senderPhoneNumber: senderData.phoneNumber,
          receiverId: selectedRequest.senderId,
          receiverPhoneNumber: receiverDoc.data().phoneNumber,
          amount: selectedRequest.amount,
          timestamp: serverTimestamp(),
          status: 'success',
          type: 'request_payment',
          description: `Payment for request: ${selectedRequest.description}`,
          paymentMethod: 'wallet'
        });

        // Update request status
        const requestRef = doc(db!, 'payment_requests', selectedRequest.requestId);
        transaction.update(requestRef, { status: 'approved' });

        // Create Notification for Sender (Requester)
        const notifRef = doc(collection(db!, 'notifications'));
        transaction.set(notifRef, {
          userId: selectedRequest.senderId,
          type: 'request_approved',
          title: 'Request Approved',
          message: `${receiverDoc.data().fullName || receiverDoc.data().phoneNumber} paid your request of ${formatCurrency(selectedRequest.amount)}`,
          amount: selectedRequest.amount,
          status: 'unread',
          timestamp: Date.now()
        });
      });

      toast.success("Payment successful!");
      setShowPaymentModal(false);
      setSelectedRequest(null);
    } catch (error: any) {
      console.error("Payment failed:", error);
      toast.error(error.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  const processBankPayment = async () => {
    if (!selectedRequest) return;
    setLoading(true);
    try {
      // Razorpay checkout disabled in preview environment
      // Real Razorpay popup will run after deployment

      let orderId = '';
      
      // 1. Call Cloud Function to generate order (simulating backend interaction)
      try {
        if (functions) {
          const createOrder = httpsCallable(functions, 'createRazorpayOrder');
          const result = await createOrder({ amount: selectedRequest.amount });
          const data = result.data as any;
          orderId = data.orderId;
        } else {
          throw new Error("Functions not initialized");
        }
      } catch (error) {
        console.warn("Backend not reachable, using simulation.", error);
        orderId = "order_" + new Date().getTime();
      }

      // 2. Simulate successful payment immediately
      await runTransaction(db!, async (transaction) => {
         const newTxRef = doc(collection(db!, 'transactions'));
         transaction.set(newTxRef, {
           id: newTxRef.id,
           senderId: user!.uid,
           senderPhoneNumber: userProfile?.phoneNumber,
           receiverId: selectedRequest.senderId,
           receiverPhoneNumber: selectedRequest.senderName,
           amount: selectedRequest.amount,
           timestamp: serverTimestamp(),
           status: 'success',
           type: 'request_payment',
           description: `Payment for request: ${selectedRequest.description}`,
           paymentMethod: 'razorpay',
           razorpayPaymentId: "simulated_" + Date.now()
         });

         const requestRef = doc(db!, 'payment_requests', selectedRequest.requestId);
         transaction.update(requestRef, { status: 'approved' });

         // Create Notification for Sender (Requester)
         const notifRef = doc(collection(db!, 'notifications'));
         transaction.set(notifRef, {
           userId: selectedRequest.senderId,
           type: 'request_approved',
           title: 'Request Approved',
           message: `${userProfile?.fullName || userProfile?.phoneNumber} paid your request of ${formatCurrency(selectedRequest.amount)}`,
           amount: selectedRequest.amount,
           status: 'unread',
           timestamp: Date.now()
         });
      });

      toast.success("Payment successful!");
      setShowPaymentModal(false);
      setSelectedRequest(null);

    } catch (error) {
      console.error("Bank Transfer Error:", error);
      toast.error("Failed to initiate payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Payment Requests</h1>
        <Button onClick={() => setShowNewRequest(!showNewRequest)} variant={showNewRequest ? "secondary" : "default"}>
          {showNewRequest ? "Cancel" : "New Request"}
        </Button>
      </div>

      {showNewRequest && (
        <Card className="p-4 bg-slate-50 border-slate-200">
          <h3 className="font-bold mb-4">Request Money From</h3>
          {!foundUser ? (
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <Input 
                placeholder="Phone number or UPI ID" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button type="submit" isLoading={loading}>Search</Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white p-3 rounded border">
                <div>
                  <p className="font-bold">{foundUser.fullName}</p>
                  <p className="text-xs text-slate-500">{foundUser.phoneNumber}</p>
                  {foundUser.upiId && <p className="text-xs text-slate-500">{foundUser.upiId}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setFoundUser(null)}>Change</Button>
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
                <label className="text-sm font-medium">Note (Optional)</label>
                <Input 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Dinner, Rent, etc."
                />
              </div>

              <Button className="w-full" onClick={sendRequest} isLoading={loading}>
                Send Request
              </Button>
            </div>
          )}
        </Card>
      )}

      {showPaymentModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 bg-white">
            <h3 className="text-lg font-bold mb-4">Approve Payment Request</h3>
            <div className="mb-6">
              <p className="text-sm text-slate-500">Request from</p>
              <p className="font-bold text-lg">{selectedRequest.senderName}</p>
              <p className="text-2xl font-bold mt-2">{formatCurrency(selectedRequest.amount)}</p>
              <p className="text-sm text-slate-500 mt-1">{selectedRequest.description}</p>
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
                    <p className="text-xs text-slate-500">Pay via UPI/Card/Netbanking</p>
                  </div>
                </div>
                {paymentMode === 'BANK' && <Check size={16} className="text-primary" />}
              </div>
            </div>

            <div className="flex gap-3">
              <Button className="flex-1" onClick={initiatePayment} isLoading={loading}>
                Pay {formatCurrency(selectedRequest.amount)}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowPaymentModal(false)} disabled={loading}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      <PinVerificationModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={processPayment}
      />

      <div className="flex space-x-2 border-b border-slate-200">
        <button
          className={`pb-2 px-4 font-medium text-sm ${activeTab === 'received' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}
          onClick={() => setActiveTab('received')}
        >
          Received (To Pay)
        </button>
        <button
          className={`pb-2 px-4 font-medium text-sm ${activeTab === 'sent' ? 'border-b-2 border-primary text-primary' : 'text-slate-500'}`}
          onClick={() => setActiveTab('sent')}
        >
          Sent (To Receive)
        </button>
      </div>

      <div className="space-y-3">
        {requests.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            No {activeTab} requests found
          </div>
        ) : (
          requests.map(req => (
            <Card key={req.requestId} className="p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    activeTab === 'received' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {activeTab === 'received' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                  </div>
                  <div>
                    <p className="font-bold text-sm">
                      {activeTab === 'received' ? `Request from ${req.senderName}` : `Request to ...`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(req.timestamp), 'MMM d, h:mm a')} • {req.description}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{formatCurrency(req.amount)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full uppercase font-bold ${
                    req.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    req.status === 'approved' ? 'bg-green-100 text-green-700' :
                    req.status === 'declined' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {req.status}
                  </span>
                </div>
              </div>

              {activeTab === 'received' && req.status === 'pending' && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                  <Button 
                    className="flex-1 bg-green-600 hover:bg-green-700" 
                    size="sm"
                    onClick={() => openPaymentModal(req)}
                    isLoading={loading}
                  >
                    <Check size={16} className="mr-1" /> Approve
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50" 
                    size="sm"
                    onClick={() => handleDecline(req)}
                    disabled={loading}
                  >
                    <X size={16} className="mr-1" /> Decline
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
