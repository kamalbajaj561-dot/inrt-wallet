import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '@/types';
import { Button, Card, Input } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';

export default function AdminPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    if (!db) return;
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersList = querySnapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(usersList);
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (uid: string, currentStatus: string) => {
    if (!db) return;
    const newStatus = currentStatus === 'active' ? 'frozen' : 'active';
    try {
      await updateDoc(doc(db, 'users', uid), {
        accountStatus: newStatus
      });
      toast.success(`User ${newStatus}`);
      fetchUsers(); // Refresh
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleCredit = async (uid: string) => {
    // In a real app, this would open a modal to enter amount
    // For MVP, let's just add 1000 for testing
    if (!db) return;
    try {
      const user = users.find(u => u.uid === uid);
      if (!user) return;
      
      await updateDoc(doc(db, 'users', uid), {
        walletBalance: user.walletBalance + 1000
      });
      toast.success("Credited ₹1,000");
      fetchUsers();
    } catch (error) {
      toast.error("Failed to credit");
    }
  };

  const filteredUsers = users.filter(u => 
    u.phoneNumber?.includes(filter) || u.fullName?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Panel</h1>
      
      <Card>
        <div className="mb-4">
          <Input 
            placeholder="Search users..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.uid} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">
                    {user.fullName || 'Unknown'}<br/>
                    <span className="text-slate-500 text-xs">{user.phoneNumber}</span>
                  </td>
                  <td className="px-4 py-3">{formatCurrency(user.walletBalance)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      user.accountStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.accountStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    <Button size="sm" variant="outline" onClick={() => handleToggleStatus(user.uid, user.accountStatus)}>
                      {user.accountStatus === 'active' ? 'Freeze' : 'Unfreeze'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => handleCredit(user.uid)}>
                      +1k
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
