import React, { useState, useEffect, useRef } from 'react';
import { X, Delete } from 'lucide-react';

interface PinInputProps {
  onComplete: (pin: string) => void;
  onClose?: () => void;
  title?: string;
  error?: string;
  isLoading?: boolean;
}

export const PinInput: React.FC<PinInputProps> = ({ onComplete, onClose, title = "Enter UPI PIN", error, isLoading }) => {
  const [pin, setPin] = useState<string>('');
  const maxLen = 6;

  const handleNumberClick = (num: number) => {
    if (pin.length < maxLen) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === maxLen) {
        onComplete(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: '#ffffff', width: '100%', maxWidth: '448px', borderRadius: '16px 16px 0 0', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', margin: 0 }}>{title}</h3>
          {onClose && (
            <button onClick={onClose} style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '50%', cursor: 'pointer', transition: 'background-color 0.2s' }}>
              <X size={20} style={{ color: '#64748b' }} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '32px' }}>
          {[...Array(maxLen)].map((_, i) => (
            <div 
              key={i} 
              style={{ 
                width: '16px', 
                height: '16px', 
                borderRadius: '50%', 
                transition: 'all 0.2s',
                background: i < pin.length ? '#0f172a' : '#e2e8f0',
                transform: i < pin.length ? 'scale(1.1)' : 'scale(1)'
              }}
            />
          ))}
        </div>

        {error && (
          <p style={{ color: '#ef4444', textAlign: 'center', fontSize: '14px', marginBottom: '16px', fontWeight: 500, margin: '0 0 16px' }}>
            {error}
          </p>
        )}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ animation: 'spin 1s linear infinite', borderRadius: '50%', height: '24px', width: '24px', borderBottom: '2px solid #0ea5e9' }}></div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              disabled={isLoading}
              style={{ height: '64px', borderRadius: '12px', fontSize: '24px', fontWeight: 600, color: '#334155', background: 'transparent', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s', opacity: isLoading ? 0.5 : 1 }}
              onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              onMouseDown={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
            >
              {num}
            </button>
          ))}
          <div style={{ height: '64px' }}></div>
          <button
            onClick={() => handleNumberClick(0)}
            disabled={isLoading}
            style={{ height: '64px', borderRadius: '12px', fontSize: '24px', fontWeight: 600, color: '#334155', background: 'transparent', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s', opacity: isLoading ? 0.5 : 1 }}
            onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            onMouseDown={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
          >
            0
          </button>
          <button
            onClick={handleDelete}
            disabled={isLoading}
            style={{ height: '64px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', background: 'transparent', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s', opacity: isLoading ? 0.5 : 1 }}
            onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            onMouseDown={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
          >
            <Delete size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
