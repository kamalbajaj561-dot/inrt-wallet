import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ScanLine, ArrowLeftRight, History, User, Bell, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('status', '==', 'unread')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [user]);

  const navItems = [
    { icon: Home, label: 'Home', path: '/dashboard' },
    { icon: ScanLine, label: 'Scan', path: '/send' },
    { icon: ArrowLeftRight, label: 'Requests', path: '/request' },
    { icon: Calendar, label: 'AutoPay', path: '/subscriptions' },
    { icon: History, label: 'History', path: '/history' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-0">
      <div className="max-w-md mx-auto min-h-screen bg-white shadow-2xl shadow-slate-200 overflow-hidden relative flex flex-col">
        {/* Header */}
        <header className="bg-primary text-white p-4 pt-safe-top sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center font-bold text-white">
                IN
              </div>
              <span className="font-display font-bold text-xl tracking-tight">INRT Wallet</span>
            </div>
            {userProfile && (
              <div className="flex items-center space-x-3">
                <Link to="/notifications" className="relative p-2 rounded-full hover:bg-white/10 transition-colors">
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-primary"></span>
                  )}
                </Link>
                <Link to="/profile" className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors">
                  <User size={18} />
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-24">
          {children}
        </main>

        {/* Bottom Navigation (Mobile) */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 md:absolute md:max-w-md md:mx-auto z-20">
          <div className="flex justify-around items-center h-16">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    isActive ? "text-primary" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};
