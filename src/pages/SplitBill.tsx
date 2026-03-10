import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, onSnapshot, orderBy, doc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Button, Input, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { UserProfile, SplitPayment, SplitParticipant } from '@/types';
import { toast } from 'react-hot-toast';
import { Search, User, Plus, X, Users, Check, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function SplitBill() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'create' | 'my-splits'>('create');
  
  // Create Split State
  const [totalAmount, setTotalAmount] = useState('');
  const [note, setNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [participants, setParticipants] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [splits, setSplits] = useState<SplitPayment[]>([]);

  useEffect(() => {
    if (!user) return;

    // Fetch splits where user is creator OR participant
    // Firestore OR queries are limited, so we might need two queries or client-side filtering
    // For simplicity, let's fetch splits created by user first
    
    const q = query(
      collection(db, 'splitPayments'),
      where('creatorId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const splitData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SplitPayment));
      setSplits(splitData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
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
          toast.error("You are already part of the split");
        } else if (participants.some(p => p.uid === userData.uid)) {
          toast.error("User already added");
        } else {
          setParticipants([...participants, userData]);
          setSearchQuery('');
        }
      } else {
        toast.error("User not found");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error searching user");
    } finally {
      setLoading(false);
    }
  };

  const removeParticipant = (uid: string) => {
    setParticipants(participants.filter(p => p.uid !== uid));
  };

  const createSplit = async () => {
    if (!totalAmount || participants.length === 0 || !user || !userProfile) return;

    setLoading(true);
    try {
      const amount = parseFloat(totalAmount);
      // Total people = participants + creator
      const totalPeople = participants.length + 1;
      const shareAmount = parseFloat((amount / totalPeople).toFixed(2));

      const splitParticipants: SplitParticipant[] = participants.map(p => ({
        userId: p.uid,
        name: p.fullName || p.phoneNumber || 'User',
        phoneNumber: p.phoneNumber || undefined,
        amount: shareAmount,
        status: 'pending'
      }));

      // Add creator as paid participant (since they paid the bill initially, presumably)
      // Or maybe they just want to split a future bill?
      // Usually "Split Bill" implies one person paid and wants reimbursement.
      // So creator is marked as 'paid' or just not included in "requests" but part of the split doc.
      // Let's include creator as a participant who has "paid" their share (or rather, doesn't owe anything).
      // Actually, the standard flow is Creator paid Total. Others owe Creator.
      // So Creator is not really a "participant" in the debt sense, but part of the group.
      
      // Let's store participants who OWE money.
      
      const splitDocRef = await addDoc(collection(db, 'splitPayments'), {
        creatorId: user.uid,
        creatorName: userProfile.fullName || userProfile.phoneNumber,
        totalAmount: amount,
        note: note || 'Split Bill',
        participants: splitParticipants,
        createdAt: Date.now(),
        status: 'pending'
      });

      // Create Payment Requests for each participant
      for (const p of participants) {
        await addDoc(collection(db, 'payment_requests'), {
          senderId: user.uid,
          senderName: userProfile.fullName || userProfile.phoneNumber,
          senderUpiId: userProfile.upiId,
          receiverId: p.uid,
          receiverUpiId: p.upiId,
          amount: shareAmount,
          status: 'pending',
          timestamp: Date.now(),
          description: `Split: ${note || 'Bill'}`,
          splitId: splitDocRef.id
        });

        // Notification
        await addDoc(collection(db, 'notifications'), {
          userId: p.uid,
          type: 'split_request',
          title: 'Split Bill Request',
          message: `${userProfile.fullName || userProfile.phoneNumber} added you to a split for ${note || 'bill'}. Your share: ${formatCurrency(shareAmount)}`,
          amount: shareAmount,
          status: 'unread',
          timestamp: Date.now()
        });
      }

      toast.success("Split created and requests sent!");
      setTotalAmount('');
      setNote('');
      setParticipants([]);
      setActiveTab('my-splits');

    } catch (error) {
      console.error(error);
      toast.error("Failed to create split");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Split Bill</h1>
        <div className="flex space-x-2">
            <Button 
                variant={activeTab === 'create' ? 'default' : 'outline'}
                onClick={() => setActiveTab('create')}
                size="sm"
            >
                Create
            </Button>
            <Button 
                variant={activeTab === 'my-splits' ? 'default' : 'outline'}
                onClick={() => setActiveTab('my-splits')}
                size="sm"
            >
                History
            </Button>
        </div>
      </div>

      {activeTab === 'create' && (
        <Card className="p-4 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount</label>
            <Input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="0.00"
              className="text-2xl font-bold"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dinner, Movie, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Add Participants</label>
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <Input 
                placeholder="Phone number or UPI ID" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button type="submit" isLoading={loading} size="icon">
                <Plus size={20} />
              </Button>
            </form>

            <div className="space-y-2">
              {participants.map(p => (
                <div key={p.uid} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold">
                      {p.fullName?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{p.fullName || p.phoneNumber}</p>
                      <p className="text-xs text-slate-500">{p.phoneNumber}</p>
                    </div>
                  </div>
                  <button onClick={() => removeParticipant(p.uid)} className="text-slate-400 hover:text-red-500">
                    <X size={18} />
                  </button>
                </div>
              ))}
              {participants.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No participants added</p>
              )}
            </div>
          </div>

          {participants.length > 0 && totalAmount && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Total Amount</span>
                <span className="font-bold">{formatCurrency(parseFloat(totalAmount))}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Split with</span>
                <span className="font-bold">{participants.length} people + You</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-blue-700 mt-2 pt-2 border-t border-blue-100">
                <span>Per Person</span>
                <span>{formatCurrency(parseFloat(totalAmount) / (participants.length + 1))}</span>
              </div>
            </div>
          )}

          <Button className="w-full" onClick={createSplit} disabled={participants.length === 0 || !totalAmount} isLoading={loading}>
            Create Split & Send Requests
          </Button>
        </Card>
      )}

      {activeTab === 'my-splits' && (
        <div className="space-y-4">
          {splits.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users size={32} className="mx-auto mb-2 opacity-50" />
              <p>No splits created yet</p>
            </div>
          ) : (
            splits.map(split => (
              <Card key={split.id} className="p-4" onClick={() => navigate(`/split/${split.id}`)}>
                <div className="flex justify-between items-start cursor-pointer">
                  <div>
                    <h3 className="font-bold text-lg">{split.note}</h3>
                    <p className="text-sm text-slate-500">{format(new Date(split.createdAt), 'MMM d, yyyy')}</p>
                    <div className="flex items-center mt-2 space-x-2">
                        <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                            {split.participants.length} participants
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                            split.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                            {split.status}
                        </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-xl">{formatCurrency(split.totalAmount)}</p>
                    <p className="text-xs text-slate-500">Total</p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex justify-between text-sm text-slate-600">
                        <span>Paid: {split.participants.filter(p => p.status === 'paid').length}</span>
                        <span>Pending: {split.participants.filter(p => p.status === 'pending').length}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                        <div 
                            className="bg-green-500 h-full transition-all duration-500"
                            style={{ width: `${(split.participants.filter(p => p.status === 'paid').length / split.participants.length) * 100}%` }}
                        />
                    </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
