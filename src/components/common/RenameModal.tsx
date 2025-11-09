import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon } from './Icons';
import styles from './RenameModal.module.css';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
  title?: string;
}

const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentName,
  title = '이름 바꾸기'
}) => {
  const [newName, setNewName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
      // 모달이 열릴 때 input에 포커스하고 텍스트 선택
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 100);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName.trim() !== currentName) {
      onConfirm(newName.trim());
      onClose();
    } else if (newName.trim() === currentName) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className={styles.modalOverlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={styles.modalContent}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>{title}</h2>
            <button
              className={styles.closeButton}
              onClick={onClose}
              aria-label="닫기"
            >
              <XIcon size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className={styles.modalBody}>
            <label htmlFor="rename-input" className={styles.label}>
              새 이름
            </label>
            <input
              ref={inputRef}
              id="rename-input"
              type="text"
              className={styles.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="새 이름을 입력하세요"
              maxLength={100}
            />

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={onClose}
              >
                취소
              </button>
              <button
                type="submit"
                className={styles.confirmButton}
                disabled={!newName.trim()}
              >
                확인
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default RenameModal;
