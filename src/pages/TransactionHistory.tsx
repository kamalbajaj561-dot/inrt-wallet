import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { subscribeToTransactions } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';
import { Card, Input, Button } from '@/components/ui';
import { ArrowUpRight, ArrowDownLeft, Clock, Plus, Gift, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function TransactionHistory() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'credit' | 'debit' | 'cashback'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const unsubscribe = subscribeToTransactions(user.uid, (txs: any[]) => {
      setTransactions(txs as any[]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const { filtered, totalsIn, totalsOut } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (tx: any) => {
      if (!q) return true;
      const hay = [tx.ref, tx.note, tx.toName, tx.fromName, tx.type].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    };

    const tabbed = transactions.filter((tx) => {
      if (tab === 'all') return true;
      return tx.type === tab;
    });

    const filteredTxs = tabbed.filter(matches);

    const inSum = filteredTxs
      .filter((t) => t.type === 'credit' || t.type === 'cashback')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const outSum = filteredTxs
      .filter((t) => t.type === 'debit')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);

    return { filtered: filteredTxs, totalsIn: inSum, totalsOut: outSum };
  }, [transactions, tab, search]);

  const formatDate = (ts: any) => {
    if (!ts) return new Date();
    // Firestore Timestamp
    if (ts?.seconds != null) return new Date(ts.seconds * 1000);
    // Already a number
    if (typeof ts === 'number') return new Date(ts);
    // String
    return new Date(ts);
  };

  const getIcon = (t: string) => {
    if (t === 'credit') return <ArrowDownLeft className="text-green-600" size={18} />;
    if (t === 'debit') return <ArrowUpRight className="text-slate-700" size={18} />;
    if (t === 'cashback') return <Gift className="text-amber-600" size={18} />;
    return <Plus className="text-slate-700" size={18} />;
  };

  const getName = (tx: any) => {
    if (tx.type === 'credit') return `From: ${tx.fromName || tx.fromUpiId || '—'}`;
    if (tx.type === 'debit') return `To: ${tx.toName || tx.toUpiId || '—'}`;
    if (tx.type === 'cashback') return `Cashback`;
    return tx.note || 'Transaction';
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transaction History</h1>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'credit', label: 'Credit' },
            { id: 'debit', label: 'Debit' },
            { id: 'cashback', label: 'Cashback' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                tab === t.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ref, note, contact..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-slate-500">Money In</p>
            <p className="font-extrabold text-green-700">+{formatCurrency(totalsIn)}</p>
          </div>
          <div>
            <p className="text-slate-500">Money Out</p>
            <p className="font-extrabold text-slate-900">-{formatCurrency(totalsOut)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
            <Clock size={32} />
          </div>
          <h3 className="text-lg font-medium text-slate-900">No transactions found</h3>
          <p className="text-slate-500">Try another tab or search term.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((tx: any) => {
            const date = formatDate(tx.createdAt);
            const isIn = tx.type === 'credit' || tx.type === 'cashback';
            const sign = isIn ? '+' : '-';
            return (
              <Card key={tx.id || tx.ref} className="p-4 flex items-start justify-between gap-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      tx.type === 'credit'
                        ? 'bg-green-100'
                        : tx.type === 'debit'
                          ? 'bg-slate-100'
                          : tx.type === 'cashback'
                            ? 'bg-amber-100'
                            : 'bg-slate-100'
                    }`}
                  >
                    {getIcon(tx.type)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{getName(tx)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {tx.ref ? `Ref: ${tx.ref}` : '—'} · {format(date, 'MMM d, h:mm a')}
                    </p>
                    {tx.note && <p className="text-xs text-slate-600 mt-1 italic">{tx.note}</p>}
                  </div>
                </div>
                <div className={`font-extrabold ${isIn ? 'text-green-700' : 'text-slate-900'} text-right pt-1`}>
                  {sign}
                  {formatCurrency(tx.amount)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
