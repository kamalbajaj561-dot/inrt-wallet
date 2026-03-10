import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Button, Card } from '@/components/ui';
import { User, Store, LogOut, Shield, QrCode, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import ReactQRCode from 'react-qr-code';

export default function Profile() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showMerchantQR, setShowMerchantQR] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const toggleMerchantMode = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const newType = userProfile?.accountType === 'merchant' ? 'user' : 'merchant';
      await updateDoc(doc(db, 'users', user.uid), {
        accountType: newType
      });
      toast.success(`Switched to ${newType} mode`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update account type");
    } finally {
      setLoading(false);
    }
  };

  const [qrAmount, setQrAmount] = useState('');

  const merchantQRData = userProfile?.upiId 
    ? userProfile.accountType === 'merchant'
      ? `upi://pay?pa=${userProfile.upiId}&pn=${encodeURIComponent(userProfile.merchantName || userProfile.fullName || 'Merchant')}${qrAmount ? `&am=${qrAmount}` : ''}`
      : `upi://pay?pa=${userProfile.upiId}`
    : '';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <Card className="p-6 flex items-center space-x-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary text-2xl font-bold">
          {userProfile?.fullName?.charAt(0) || 'U'}
        </div>
        <div>
          <h2 className="text-xl font-bold">{userProfile?.fullName}</h2>
          <p className="text-slate-500">{userProfile?.phoneNumber}</p>
          <p className="text-xs font-mono bg-slate-100 px-2 py-1 rounded mt-1 inline-block">
            {userProfile?.upiId || 'No UPI ID'}
          </p>
        </div>
      </Card>

      {userProfile?.accountType === 'merchant' && (
        <Card className="p-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600">
                <QrCode size={20} />
              </div>
              <div>
                <p className="font-medium">Merchant QR</p>
                <p className="text-xs text-slate-500">Receive payments</p>
              </div>
            </div>
            <Button size="sm" onClick={() => setShowMerchantQR(!showMerchantQR)}>
              {showMerchantQR ? 'Hide' : 'Show'}
            </Button>
          </div>
          
          {showMerchantQR && merchantQRData && (
            <div className="flex flex-col items-center p-4 bg-white rounded-xl border border-slate-100">
              <div className="mb-4 w-full">
                <label className="block text-xs font-medium text-slate-500 mb-1">Optional Amount</label>
                <input 
                  type="number" 
                  placeholder="Enter amount (optional)"
                  className="w-full p-2 border rounded text-sm"
                  value={qrAmount}
                  onChange={(e) => setQrAmount(e.target.value)}
                />
              </div>
              <ReactQRCode value={merchantQRData} size={200} />
              <p className="mt-4 font-mono text-sm text-slate-600">{userProfile.upiId}</p>
              <p className="text-xs text-slate-400 mt-1">Scan to pay</p>
            </div>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <Card 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
          onClick={toggleMerchantMode}
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
              <Store size={20} />
            </div>
            <div>
              <p className="font-medium">Merchant Mode</p>
              <p className="text-xs text-slate-500">
                {userProfile?.accountType === 'merchant' ? 'Currently Active' : 'Switch to Business Account'}
              </p>
            </div>
          </div>
          <div className={`w-12 h-6 rounded-full p-1 transition-colors ${userProfile?.accountType === 'merchant' ? 'bg-green-500' : 'bg-slate-200'}`}>
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${userProfile?.accountType === 'merchant' ? 'translate-x-6' : ''}`} />
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => navigate('/set-pin')}>
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
            <Lock size={20} />
          </div>
          <div>
            <p className="font-medium">UPI PIN</p>
            <p className="text-xs text-slate-500">
              {userProfile?.upiPinEnabled ? 'Change your 6-digit PIN' : 'Set up security PIN'}
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
            <Shield size={20} />
          </div>
          <div>
            <p className="font-medium">KYC Status</p>
            <p className="text-xs text-slate-500">
              {userProfile?.kycTier === 'TIER_1' ? 'Tier 1 (Basic)' : 'Tier 2 (Verified)'}
            </p>
          </div>
        </Card>

        <Button 
          variant="outline" 
          className="w-full text-red-600 border-red-200 hover:bg-red-50 justify-start h-12 px-4"
          onClick={handleLogout}
        >
          <LogOut size={20} className="mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
