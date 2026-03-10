import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, updateDoc, doc } from 'firebase/firestore';
import { Notification } from '@/types';
import { Card, Button } from '@/components/ui';
import { ArrowLeft, Bell, CheckCircle, XCircle, ArrowUpRight, ArrowDownLeft, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Notification));
      setNotifications(notifs);
      setLoading(false);
      
      // Mark all as read when viewing the page
      notifs.forEach(async (notif) => {
        if (notif.status === 'unread') {
          try {
            await updateDoc(doc(db, 'notifications', notif.id), { status: 'read' });
          } catch (e) {
            console.error("Error marking notification as read:", e);
          }
        }
      });
    }, (error) => {
      console.error("Error fetching notifications:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'payment_received':
        return <ArrowDownLeft className="text-green-600" size={20} />;
      case 'payment_sent':
        return <ArrowUpRight className="text-slate-600" size={20} />;
      case 'payment_request':
        return <FileText className="text-orange-600" size={20} />;
      case 'request_approved':
        return <CheckCircle className="text-green-600" size={20} />;
      case 'request_declined':
        return <XCircle className="text-red-600" size={20} />;
      default:
        return <Bell className="text-primary" size={20} />;
    }
  };

  const getBgColor = (type: Notification['type']) => {
    switch (type) {
      case 'payment_received':
      case 'request_approved':
        return 'bg-green-100';
      case 'payment_sent':
        return 'bg-slate-100';
      case 'payment_request':
        return 'bg-orange-100';
      case 'request_declined':
        return 'bg-red-100';
      default:
        return 'bg-primary/10';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-2xl font-bold">Notifications</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell size={32} />
          </div>
          <p>No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => (
            <Card key={notif.id} className={`p-4 ${notif.status === 'unread' ? 'bg-blue-50/50 border-blue-100' : ''}`}>
              <div className="flex items-start space-x-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getBgColor(notif.type)}`}>
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-sm text-slate-900">{notif.title}</h3>
                    <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                      {format(new Date(notif.timestamp), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{notif.message}</p>
                  {notif.amount && (
                    <p className="text-sm font-bold mt-1 text-slate-800">
                      {formatCurrency(notif.amount)}
                    </p>
                  )}
                </div>
                {notif.status === 'unread' && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
