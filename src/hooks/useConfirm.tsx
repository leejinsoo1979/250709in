import React, { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import ConfirmModal from '@/components/common/ConfirmModal';

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

export const useConfirm = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('확인');
  const [confirmText, setConfirmText] = useState('확인');
  const [cancelText, setCancelText] = useState('취소');
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const showConfirm = useCallback((message: string, options?: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setMessage(message);
      setTitle(options?.title || '확인');
      setConfirmText(options?.confirmText || '확인');
      setCancelText(options?.cancelText || '취소');
      setIsOpen(true);
      setResolvePromise(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(true);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  const ConfirmComponent = () => {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
      <ConfirmModal
        isOpen={isOpen}
        message={message}
        title={title}
        confirmText={confirmText}
        cancelText={cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />,
      modalRoot
    );
  };

  return {
    showConfirm,
    ConfirmComponent
  };
};