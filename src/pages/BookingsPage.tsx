import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createBooking } from '../lib/db';

const MOVIES = [
  { id: 1, title: 'Pushpa 2', rating: '8.5', genre: 'Action', price: 250, times: ['10:00 AM', '1:30 PM', '6:00 PM', '9:30 PM'] },
  { id: 2, title: 'Fighter', rating: '7.8', genre: 'Action', price: 300, times: ['11:00 AM', '2:00 PM', '7:00 PM'] },
  { id: 3, title: 'Stree 3', rating: '8.2', genre: 'Comedy', price: 200, times: ['12:00 PM', '3:30 PM', '8:00 PM'] },
  { id: 4, title: 'Animal 2', rating: '7.5', genre: 'Thriller', price: 350, times: ['11:30 AM', '5:00 PM', '9:00 PM'] },
];

export default function BookingsPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'movies' | 'trains' | 'buses' | 'flights'>('movies');
  const [selected, setSelected] = useState<any>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [seats, setSeats] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleBook = async () => {
    if (!selected || !selectedTime) return showToast('Select a show time');
    const total = selected.price * seats;
    if ((userProfile?.balance || 0) < total) return showToast('Insufficient balance');
    setLoading(true);
    try {
      const id = await createBooking(user!.uid, {
        type: 'movie',
        details: { title: selected.title, time: selectedTime, seats, price: selected.price },
        amount: total,
      });
      setSuccess({ id, title: selected.title, time: selectedTime, seats, total });
      setSelected(null);
    } catch (e: any) {
      showToast(e.message);
    }
    setLoading(false);
  };

  if (success) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>🎬</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Booking Confirmed!</h2>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>{success.title}</p>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 4 }}>{success.time} · {success.seats} seat(s)</p>
        <p style={{ color: '#00b9f1', fontWeight: 700, fontSize: 20, marginBottom: 4 }}>₹{success.total}</p>
        <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 24 }}>Booking ID: {success.id.slice(0, 10).toUpperCase()}</p>
        <button style={s.btn} onClick={() => { setSuccess(null); }}>Book Another</button>
        <br />
        <button style={{ ...s.btn, background: '#fff', color: '#00b9f1', border: '2px solid #00b9f1', marginTop: 10 }} onClick={() => navigate('/dashboard')}>Back to Home</button>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      <div style={s.header}>
        <button onClick={() => navigate('/dashboard')} style={s.back}>←</button>
        <h1 style={s.title}>Book Tickets</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['movies', 'trains', 'buses', 'flights'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, background: tab === t ? '#00b9f1' : '#fff', border: `2px solid ${tab === t ? '#00b9f1' : '#e5e7eb'}`, borderRadius: 12, padding: '10px 0', color: tab === t ? '#fff' : '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>
            {t === 'movies' ? '🎬' : t === 'trains' ? '🚂' : t === 'buses' ? '🚌' : '✈️'} {t}
          </button>
        ))}
      </div>

      {tab === 'movies' && !selected && (
        <>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 14 }}>🔥 Now Showing in your city</p>
          {MOVIES.map(movie => (
            <div key={movie.id} style={s.movieCard} onClick={() => setSelected(movie)}>
              <div style={s.moviePoster}>
                <span style={{ fontSize: 32 }}>🎬</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{movie.title}</p>
                <p style={{ color: '#666', fontSize: 13 }}>{movie.genre} · ⭐ {movie.rating}</p>
                <p style={{ color: '#00b9f1', fontWeight: 700, fontSize: 14, marginTop: 4 }}>From ₹{movie.price}</p>
              </div>
              <button style={s.bookBtn}>Book</button>
            </div>
          ))}
        </>
      )}

      {tab === 'movies' && selected && (
        <div style={s.card}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#00b9f1', fontWeight: 600, cursor: 'pointer', marginBottom: 16, fontSize: 14 }}>← Back to movies</button>
          <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{selected.title}</h3>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>{selected.genre} · ⭐ {selected.rating}</p>

          <p style={s.label}>Select Show Time</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {selected.times.map((t: string) => (
              <button key={t} onClick={() => setSelectedTime(t)} style={{ background: selectedTime === t ? '#dbeafe' : '#f8fafc', border: `2px solid ${selectedTime === t ? '#3b82f6' : '#e5e7eb'}`, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: selectedTime === t ? '#1d4ed8' : '#374151' }}>
                {t}
              </button>
            ))}
          </div>

          <p style={s.label}>Number of Seats</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <button onClick={() => setSeats(s => Math.max(1, s - 1))} style={s.seatBtn}>-</button>
            <span style={{ fontWeight: 800, fontSize: 24 }}>{seats}</span>
            <button onClick={() => setSeats(s => Math.min(6, s + 1))} style={s.seatBtn}>+</button>
          </div>

          <div style={{ background: '#f0f9ff', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#666' }}>₹{selected.price} × {seats} seat(s)</span>
              <span style={{ fontWeight: 700 }}>₹{selected.price * seats}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#666' }}>Booking fee</span>
              <span style={{ fontWeight: 700 }}>₹0</span>
            </div>
            <div style={{ height: 1, background: '#e5e7eb', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontWeight: 800, color: '#00b9f1', fontSize: 18 }}>₹{selected.price * seats}</span>
            </div>
          </div>

          <button style={s.btn} onClick={handleBook} disabled={loading}>
            {loading ? 'Booking...' : `Pay ₹${selected.price * seats} & Confirm →`}
          </button>
        </div>
      )}

      {tab !== 'movies' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <span style={{ fontSize: 64 }}>{tab === 'trains' ? '🚂' : tab === 'buses' ? '🚌' : '✈️'}</span>
          <p style={{ fontWeight: 700, fontSize: 18, color: '#111', marginTop: 16, marginBottom: 8 }}>Coming Soon!</p>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>{tab.charAt(0).toUpperCase() + tab.slice(1)} booking launching soon. Stay tuned!</p>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8fafc', padding: '20px 16px 40px', fontFamily: "'DM Sans', sans-serif" },
  toast: { position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', borderRadius: 14, padding: '12px 20px', fontSize: 14, fontWeight: 600, zIndex: 999 },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  back: { background: '#fff', border: '2px solid #e5e7eb', borderRadius: 12, width: 40, height: 40, fontSize: 18, cursor: 'pointer' },
  title: { fontWeight: 800, fontSize: 22, color: '#111' },
  movieCard: { background: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', cursor: 'pointer' },
  moviePoster: { width: 60, height: 80, background: '#f1f5f9', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bookBtn: { background: '#00b9f1', border: 'none', borderRadius: 10, padding: '8px 14px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  card: { background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' },
  label: { color: '#374151', fontSize: 12, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 },
  seatBtn: { width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', border: '2px solid #e5e7eb', fontSize: 20, fontWeight: 700, cursor: 'pointer' },
  btn: { width: '100%', padding: '16px 0', background: '#00b9f1', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' },
};
