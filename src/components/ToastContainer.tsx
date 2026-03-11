import React from 'react';
import { ToastContainer, Toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const ToastComponent = () => {
  return (
    <ToastContainer>
      <Toast>
        <div>This is a toast message!</div>
      </Toast>
    </ToastContainer>
  );
};

export default ToastComponent;