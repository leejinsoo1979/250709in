import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import AlertModal from '@/components/common/AlertModal';

interface AlertOptions {
  title?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
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
  const [onConfirm, setOnConfirm] = useState<(() => void) | undefined>();
  const [onCancel, setOnCancel] = useState<(() => void) | undefined>();
  const [showCancel, setShowCancel] = useState(false);

  const showAlert = useCallback((message: string, options?: AlertOptions) => {
    setMessage(message);
    setTitle(options?.title || '알림');
    setOnConfirm(() => options?.onConfirm);
    setOnCancel(() => options?.onCancel);
    setShowCancel(options?.showCancel || false);
    setIsOpen(true);
  }, []);

  const hideAlert = useCallback(() => {
    setIsOpen(false);
    setOnConfirm(undefined);
    setOnCancel(undefined);
    setShowCancel(false);
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
            onConfirm={onConfirm}
            onCancel={onCancel}
            showCancel={showCancel}
          />,
          modalRoot
        );
      })()}
    </AlertContext.Provider>
  );
};