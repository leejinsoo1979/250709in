import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';
import StockTable from './SidebarLeft/StockTable';
import OptionsCard from './SidebarLeft/OptionsCard';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChange,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t('cnc.settings')}</h3>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <StockTable />
          <OptionsCard onSettingsChange={onSettingsChange} />
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
