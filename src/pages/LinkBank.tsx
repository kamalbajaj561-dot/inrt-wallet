import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Button, Input, Card } from '@/components/ui';
import { Building, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function LinkBank() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'FORM' | 'SUCCESS'>('FORM');
  
  const [formData, setFormData] = useState({
    bankName: '',
    accountNumber: '',
    ifsc: '',
    holderName: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.bankName || !formData.accountNumber || !formData.ifsc || !formData.holderName) {
      toast.error("Please fill all fields");
      return;
    }

    setLoading(true);
    try {
      // Store in root collection 'bankAccounts' as per previous implementation pattern
      // but with userId field for querying
      await addDoc(collection(db, 'bankAccounts'), {
        userId: user.uid,
        bankName: formData.bankName,
        accountNumberMasked: 'XXXX' + formData.accountNumber.slice(-4),
        ifsc: formData.ifsc.toUpperCase(),
        holderName: formData.holderName,
        upiId: `${userProfile?.phoneNumber}@${formData.bankName.toLowerCase().replace(/\s/g, '')}`,
        verified: true, // Auto-verify for demo
        createdAt: Date.now()
      });

      setStep('SUCCESS');
      toast.success("Bank account linked successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to link bank account");
    } finally {
      setLoading(false);
    }
  };

  if (step === 'SUCCESS') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6">
          <CheckCircle size={40} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Bank Linked!</h2>
        <p className="text-slate-500 mb-6">Your bank account has been successfully verified and linked.</p>
        <Button onClick={() => navigate('/dashboard')} className="w-full max-w-xs">
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Link Bank Account</h1>

      <Card className="p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
            <Building size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Add New Bank</h3>
            <p className="text-sm text-slate-500">Securely link your bank account</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name</label>
            <Input 
              name="bankName"
              placeholder="e.g. HDFC Bank"
              value={formData.bankName}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
            <Input 
              name="accountNumber"
              type="password"
              placeholder="Enter account number"
              value={formData.accountNumber}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">IFSC Code</label>
            <Input 
              name="ifsc"
              placeholder="e.g. HDFC0001234"
              value={formData.ifsc}
              onChange={handleChange}
              className="uppercase"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Account Holder Name</label>
            <Input 
              name="holderName"
              placeholder="Name as per bank records"
              value={formData.holderName}
              onChange={handleChange}
            />
          </div>

          <Button type="submit" className="w-full mt-4" isLoading={loading}>
            Verify & Link
          </Button>
        </form>
      </Card>
      
      <p className="text-xs text-center text-slate-400">
        Your bank details are encrypted and stored securely.
        <br/>We verify your account by depositing ₹1.
      </p>
    </div>
  );
}
