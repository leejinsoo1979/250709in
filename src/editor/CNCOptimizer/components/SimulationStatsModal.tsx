import React from 'react';
import { X } from 'lucide-react';
import styles from './SimulationStatsModal.module.css';

interface SimulationStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: {
    sheetCount: number;
    totalPanels: number;
    totalCutLength: number;
    avgEfficiency: number;
  };
}

const SimulationStatsModal: React.FC<SimulationStatsModalProps> = ({
  isOpen,
  onClose,
  stats
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>시뮬레이션 완료</h3>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>시트 수</span>
              <span className={styles.statValue}>{stats.sheetCount}장</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>패널 수</span>
              <span className={styles.statValue}>{stats.totalPanels}개</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>총 재단 길이</span>
              <span className={styles.statValue}>{stats.totalCutLength.toFixed(2)}m</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>평균 효율</span>
              <span className={styles.statValue}>{stats.avgEfficiency.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.confirmButton}
            onClick={onClose}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimulationStatsModal;
