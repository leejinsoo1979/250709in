import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import AlertModal from '@/components/common/AlertModal';

interface AlertOptions {
  title?: string;
}

export const useAlert = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('알림');

  const showAlert = useCallback((message: string, options?: AlertOptions) => {
    setMessage(message);
    if (options?.title) {
      setTitle(options.title);
    }
    setIsOpen(true);
  }, []);

  const hideAlert = useCallback(() => {
    setIsOpen(false);
  }, []);

  const AlertComponent = () => {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
      <AlertModal
        isOpen={isOpen}
        message={message}
        title={title}
        onClose={hideAlert}
      />,
      modalRoot
    );
  };

  return {
    showAlert,
    hideAlert,
    AlertComponent
  };
};