import { useAppMode } from '../context/AppModeContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ModeDrawer({ open, onClose }: Props) {
  const { mode, setMode } = useAppMode();
  const { logout, userProfile } = useAuth();
  const navigate = useNavigate();

  const upiId = userProfile?.upiId || (userProfile?.phone ? `${userProfile.phone}@inrt` : '');
  const qrUrl = upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(userProfile?.name || 'INRT User')}&cu=INR`)}`
    : '';

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: '80%', maxWidth: 320,
        background: '#0D2A4A', boxShadow: '4px 0 32px rgba(0,0,0,0.4)',
        padding: '24px 18px', boxSizing: 'border-box',
        fontFamily: "'Plus Jakarta Sans',sans-serif",
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg,#00e5cc,#00b4a0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#000', fontWeight: 900, fontSize: 12 }}>IN</span>
            </div>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>INRT Wallet</span>
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 15, cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <p style={{ color: '#8B9DB3', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, margin: '0 0 10px' }}>
          MODE
        </p>

        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 4, marginBottom: 8,
        }}>
          <button
            onClick={() => setMode('national')}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 11, border: 'none', cursor: 'pointer',
              background: mode === 'national' ? '#fff' : 'transparent',
              color: mode === 'national' ? '#0A2540' : '#8B9DB3',
              fontWeight: 800, fontSize: 13, transition: 'all 0.15s',
            }}>
            🇮🇳 National
          </button>
          <button
            onClick={() => setMode('international')}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 11, cursor: 'pointer',
              background: mode === 'international' ? '#181A20' : 'transparent',
              color: mode === 'international' ? '#F0B90B' : '#8B9DB3',
              fontWeight: 800, fontSize: 13, transition: 'all 0.15s',
              border: mode === 'international' ? '1px solid #F0B90B' : '1px solid transparent',
            }}>
            🌍 International
          </button>
        </div>
        <p style={{ color: '#5C6B85', fontSize: 11, margin: '0 0 24px', lineHeight: 1.5 }}>
          {mode === 'national'
            ? 'Domestic payments, recharges, bills — everything for India.'
            : 'Crypto & global transfers — your Polygon wallet, INRT worldwide.'}
        </p>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0 16px' }} />

        {mode === 'national' && upiId && (
          <div style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: 16, marginBottom: 16, textAlign: 'center',
          }}>
            <div style={{ width: 110, height: 110, background: '#fff', borderRadius: 10, margin: '0 auto 10px', overflow: 'hidden', padding: 6 }}>
              <img src={qrUrl} alt="My UPI QR" style={{ width: '100%', height: '100%' }} />
            </div>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, margin: '0 0 2px' }}>{userProfile?.name || 'INRT User'}</p>
            <p style={{ color: '#8B9DB3', fontSize: 11, margin: '0 0 10px' }}>{upiId}</p>
            <button
              onClick={() => navigator.clipboard.writeText(upiId)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 9, padding: '8px 0', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              📋 Copy UPI ID
            </button>
          </div>
        )}

        {mode === 'national' && (
          <button onClick={() => { onClose(); navigate('/link-bank'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 4px', cursor: 'pointer', textAlign: 'left' }}>
            🏦 Link Bank Account
          </button>
        )}
        <button onClick={() => { onClose(); navigate('/settings'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 4px', cursor: 'pointer', textAlign: 'left' }}>
          ⚙️ Settings
        </button>
        <button onClick={() => { onClose(); navigate('/profile'); }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, padding: '11px 4px', cursor: 'pointer', textAlign: 'left' }}>
          👤 Profile
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={() => { onClose(); logout(); navigate('/login'); }}
          style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#FF3B30', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Log Out
        </button>
      </div>
    </div>
  );
}
