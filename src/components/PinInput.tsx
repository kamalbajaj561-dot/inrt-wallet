import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui';
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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md sm:rounded-2xl rounded-t-2xl p-6 shadow-xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
          )}
        </div>

        <div className="flex justify-center space-x-4 mb-8">
          {[...Array(maxLen)].map((_, i) => (
            <div 
              key={i} 
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                i < pin.length ? 'bg-slate-900 scale-110' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-500 text-center text-sm mb-4 font-medium animate-pulse">
            {error}
          </p>
        )}

        {isLoading && (
          <div className="flex justify-center mb-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              disabled={isLoading}
              className="h-16 rounded-xl text-2xl font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {num}
            </button>
          ))}
          <div className="h-16"></div> {/* Spacer */}
          <button
            onClick={() => handleNumberClick(0)}
            disabled={isLoading}
            className="h-16 rounded-xl text-2xl font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            disabled={isLoading}
            className="h-16 rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <Delete size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
