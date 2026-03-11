// src/context/ToastContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface ToastContextType {
    addToast: (message: string, type: 'success' | 'error' | 'info') => void;
    removeToast: (id: number) => void;
    toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    let nextId = 0;

    const addToast = (message: string, type: 'success' | 'error' | 'info') => {
        const toast = { id: nextId++, message, type };
        setToasts(prevToasts => [...prevToasts, toast]);
        setTimeout(() => {
            removeToast(toast.id);
        }, 3000); // auto dismiss after 3 seconds
    };

    const removeToast = (id: number) => {
        setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast, removeToast, toasts }}>
            {children}
            <div>
                {toasts.map(toast => (
                    <div key={toast.id} className={`toast toast-${toast.type}`}> 
                        {toast.message}
                        <button onClick={() => removeToast(toast.id)}>X</button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};