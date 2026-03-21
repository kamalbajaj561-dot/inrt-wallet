import React, { createContext, useContext, useState, ReactNode } from "react";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextType {
  showToast: (type: "success" | "error" | "info", message: string) => void;
  toasts: Toast[];
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const showToast = (
    type: "success" | "error" | "info",
    message: string
  ) => {
    const id = `toast-${Date.now()}`;
    const newToast: Toast = { id, type, message };

    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      removeToast(id);
    }, 3000);
  };

  return (
    <ToastContext.Provider value={{ showToast, toasts, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};