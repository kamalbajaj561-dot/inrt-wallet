import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Transaction } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Card, Button } from '@/components/ui';
import { ArrowLeft, TrendingUp, TrendingDown, Lightbulb, Sparkles, PieChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

type TimeRange = 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS';

interface SmartInsight {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

export default function Insights() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('THIS_MONTH');

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const txRef = collection(db, 'transactions');

    // Listener for sent transactions
    const sentQuery = query(
      txRef,
      where('senderId', '==', user.uid)
    );

    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      const sentTxs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      
      // We also need received transactions for the total received metric
      // Ideally we'd combine these listeners better, but for now we'll fetch received separately
      // or set up a second listener.
      // Let's set up the second listener inside here to update the combined state.
    });

    // To properly handle two async listeners updating one state, we'll use two state variables
    // and combine them.
    
    return () => {
       // Cleanup handled below in the refactored effect
    };
  }, [user]);

  // Refactored Effect for Real-time Data
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const txRef = collection(db, 'transactions');
    
    const sentQuery = query(txRef, where('senderId', '==', user.uid));
    const receivedQuery = query(txRef, where('receiverId', '==', user.uid));

    let sentTxs: Transaction[] = [];
    let receivedTxs: Transaction[] = [];

    const unsubscribeSent = onSnapshot(sentQuery, (snapshot) => {
      sentTxs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setTransactions([...sentTxs, ...receivedTxs]);
      setLoading(false);
    });

    const unsubscribeReceived = onSnapshot(receivedQuery, (snapshot) => {
      receivedTxs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setTransactions([...sentTxs, ...receivedTxs]);
      setLoading(false);
    });

    return () => {
      unsubscribeSent();
      unsubscribeReceived();
    };
  }, [user]);

  const filteredData = useMemo(() => {
    const now = new Date();
    let start, end;

    if (timeRange === 'THIS_MONTH') {
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else if (timeRange === 'LAST_MONTH') {
      const lastMonth = subMonths(now, 1);
      start = startOfMonth(lastMonth);
      end = endOfMonth(lastMonth);
    } else {
      start = subMonths(now, 3);
      end = now;
    }

    return transactions.filter(tx => {
      const txDate = (tx.timestamp as any)?.seconds 
        ? new Date((tx.timestamp as any).seconds * 1000) 
        : new Date(tx.timestamp || Date.now());
      return isWithinInterval(txDate, { start, end });
    });
  }, [transactions, timeRange]);

  const analytics = useMemo(() => {
    let totalSpent = 0;
    let totalReceived = 0;
    const categoryMap = new Map<string, number>();
    const contactMap = new Map<string, number>();

    filteredData.forEach(tx => {
      const isSender = tx.senderId === user?.uid;
      
      if (isSender) {
        // Spending
        if (tx.type !== 'deposit' && tx.type !== 'wallet_deposit') { // Exclude deposits to self
             totalSpent += tx.amount;
             
             // Category
             const cat = tx.category || 'Others';
             categoryMap.set(cat, (categoryMap.get(cat) || 0) + tx.amount);

             // Top Contacts
             if (tx.receiverPhoneNumber || tx.receiverId) {
                 // Use description name if available, else phone
                 let contactName = tx.receiverPhoneNumber || 'Unknown';
                 if (tx.description && tx.description.startsWith('Transfer to ')) {
                    contactName = tx.description.replace('Transfer to ', '');
                 } else if (tx.description && tx.description.startsWith('Bank Payment to ')) {
                    contactName = tx.description.replace('Bank Payment to ', '');
                 }

                 contactMap.set(contactName, (contactMap.get(contactName) || 0) + tx.amount);
             }
        }
      } else {
        // Income
        totalReceived += tx.amount;
      }
    });

    const categoryData = Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value }));
    
    // Sort contacts by amount
    const topContacts = Array.from(contactMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, value]) => ({ name, value }));

    return { totalSpent, totalReceived, categoryData, topContacts };
  }, [filteredData, user]);

  // Smart Insights Calculation
  const smartInsights = useMemo(() => {
    const insights: SmartInsight[] = [];
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Helper to get spending for a specific period
    const getSpendingForPeriod = (start: Date, end: Date) => {
      return transactions.filter(tx => {
        const txDate = (tx.timestamp as any)?.seconds 
          ? new Date((tx.timestamp as any).seconds * 1000) 
          : new Date(tx.timestamp || Date.now());
        const isSender = tx.senderId === user?.uid;
        const isSpending = tx.type !== 'deposit' && tx.type !== 'wallet_deposit';
        return isSender && isSpending && isWithinInterval(txDate, { start, end });
      });
    };

    const thisMonthTxs = getSpendingForPeriod(thisMonthStart, thisMonthEnd);
    const lastMonthTxs = getSpendingForPeriod(lastMonthStart, lastMonthEnd);

    // 1. Monthly Spending Comparison
    const thisMonthTotal = thisMonthTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const lastMonthTotal = lastMonthTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const diff = thisMonthTotal - lastMonthTotal;

    if (thisMonthTotal > 0) {
        insights.push({
            id: 'spending_comparison',
            icon: diff > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />,
            title: 'Monthly Comparison',
            description: `You spent ${formatCurrency(thisMonthTotal)} this month, which is ${formatCurrency(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than last month.`,
            color: diff > 0 ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50'
        });
    }

    if (thisMonthTxs.length > 0) {
        // 2. Top Spending Category
        const catMap = new Map<string, number>();
        thisMonthTxs.forEach(tx => {
            const cat = tx.category || 'Others';
            catMap.set(cat, (catMap.get(cat) || 0) + tx.amount);
        });
        
        let topCat = '';
        let topCatAmount = 0;
        catMap.forEach((amount, cat) => {
            if (amount > topCatAmount) {
                topCatAmount = amount;
                topCat = cat;
            }
        });

        if (topCat) {
            insights.push({
                id: 'top_category',
                icon: <PieChart size={20} />, // Using PieChart icon from lucide-react (needs import check)
                title: 'Top Category',
                description: `${topCat} was your biggest spending category this month (${formatCurrency(topCatAmount)}).`,
                color: 'text-blue-600 bg-blue-50'
            });
        }

        // 3. Most Frequent Contact
        const freqMap = new Map<string, number>();
        thisMonthTxs.forEach(tx => {
            let name = tx.receiverPhoneNumber || 'Unknown';
            if (tx.description) {
                 if (tx.description.startsWith('Transfer to ')) name = tx.description.replace('Transfer to ', '');
                 else if (tx.description.startsWith('Bank Payment to ')) name = tx.description.replace('Bank Payment to ', '');
            }
            freqMap.set(name, (freqMap.get(name) || 0) + 1);
        });

        let topContact = '';
        let maxFreq = 0;
        freqMap.forEach((count, name) => {
            if (count > maxFreq) {
                maxFreq = count;
                topContact = name;
            }
        });

        if (topContact && maxFreq > 1) {
             insights.push({
                id: 'top_contact',
                icon: <Sparkles size={20} />,
                title: 'Frequent Contact',
                description: `You paid ${topContact} ${maxFreq} times this month.`,
                color: 'text-purple-600 bg-purple-50'
            });
        }

        // 4. Largest Transaction
        let maxTx: Transaction | null = null;
        thisMonthTxs.forEach(tx => {
            if (!maxTx || tx.amount > maxTx.amount) {
                maxTx = tx;
            }
        });

        if (maxTx) {
            let name = (maxTx as Transaction).receiverPhoneNumber || 'Unknown';
            if ((maxTx as Transaction).description) {
                 if ((maxTx as Transaction).description!.startsWith('Transfer to ')) name = (maxTx as Transaction).description!.replace('Transfer to ', '');
                 else if ((maxTx as Transaction).description!.startsWith('Bank Payment to ')) name = (maxTx as Transaction).description!.replace('Bank Payment to ', '');
            }

            insights.push({
                id: 'largest_tx',
                icon: <Lightbulb size={20} />,
                title: 'Largest Payment',
                description: `Your largest payment was ${formatCurrency((maxTx as Transaction).amount)} to ${name}.`,
                color: 'text-yellow-600 bg-yellow-50'
            });
        }
    }

    return insights;
  }, [transactions, user]);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-2xl font-bold">Insights</h1>
      </div>

      {/* Smart Insights Section */}
      {smartInsights.length > 0 && (
        <div className="space-y-3">
            <h3 className="text-lg font-bold flex items-center">
                <Sparkles className="mr-2 text-yellow-500" size={20} />
                AI Expense Assistant
            </h3>
            <div className="grid gap-3">
                {smartInsights.map(insight => (
                    <Card key={insight.id} className={`p-4 border-l-4 ${insight.color.replace('text-', 'border-').split(' ')[0]}`}>
                        <div className="flex items-start space-x-3">
                            <div className={`p-2 rounded-full ${insight.color} bg-opacity-20`}>
                                {insight.icon}
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-slate-800">{insight.title}</h4>
                                <p className="text-sm text-slate-600 mt-1">{insight.description}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
      )}

      {/* Time Filter */}
      <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl">
        {(['THIS_MONTH', 'LAST_MONTH', 'LAST_3_MONTHS'] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              timeRange === range 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {range === 'THIS_MONTH' ? 'This Month' : range === 'LAST_MONTH' ? 'Last Month' : '3 Months'}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-red-50 border-red-100">
          <div className="flex items-center space-x-2 mb-2 text-red-600">
            <TrendingDown size={20} />
            <span className="text-sm font-medium">Spent</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(analytics.totalSpent)}</p>
        </Card>
        <Card className="p-4 bg-green-50 border-green-100">
          <div className="flex items-center space-x-2 mb-2 text-green-600">
            <TrendingUp size={20} />
            <span className="text-sm font-medium">Received</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(analytics.totalReceived)}</p>
        </Card>
      </div>

      {/* Spending by Category Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Spending by Category</h3>
        {analytics.categoryData.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie
                  data={analytics.categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {analytics.categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
              </RePieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
            No spending data for this period
          </div>
        )}
        
        {/* Category List */}
        <div className="mt-4 space-y-3">
            {analytics.categoryData.map((cat, index) => (
                <div key={cat.name} className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-sm font-medium text-slate-700">{cat.name}</span>
                    </div>
                    <span className="text-sm font-bold">{formatCurrency(cat.value)}</span>
                </div>
            ))}
        </div>
      </Card>

      {/* Top Contacts */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Top Contacts</h3>
        {analytics.topContacts.length > 0 ? (
            <div className="space-y-4">
                {analytics.topContacts.map((contact, index) => (
                    <div key={index} className="flex justify-between items-center border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold">
                                {contact.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-700">{contact.name}</span>
                        </div>
                        <span className="font-bold text-slate-900">{formatCurrency(contact.value)}</span>
                    </div>
                ))}
            </div>
        ) : (
            <div className="text-center text-slate-400 text-sm py-4">
                No contacts found
            </div>
        )}
      </Card>
    </div>
  );
}
