import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import AlertModal from '@/components/common/AlertModal';

interface AlertOptions {
  title?: string;
}

interface AlertContextType {
  showAlert: (message: string, options?: AlertOptions) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return context;
};

interface AlertProviderProps {
  children: ReactNode;
}

export const AlertProvider: React.FC<AlertProviderProps> = ({ children }) => {
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

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      {(() => {
        const modalRoot = document.getElementById('modal-root');
        if (!modalRoot || !isOpen) return null;

        return ReactDOM.createPortal(
          <AlertModal
            isOpen={isOpen}
            message={message}
            title={title}
            onClose={hideAlert}
          />,
          modalRoot
        );
      })()}
    </AlertContext.Provider>
  );
};