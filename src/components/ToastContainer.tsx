import React from "react";
import { useToast } from "@/context/ToastContext";
import "@/styles/ToastContainer.module.css";

const ToastContainer: React.FC = () => {
  const { toasts } = useToast();

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div 
          key={toast.id} 
          className={`toast toast-${toast.type}`}
          role="alert"
        >
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
