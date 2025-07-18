import React from 'react';
import styles from './HelpModal.module.css';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: '마우스 드래그', action: '카메라 회전' },
    { key: '마우스 휠', action: '줌 인/아웃' },
    { key: 'Delete', action: '선택된 가구 삭제' },
    { key: 'Backspace', action: '선택된 가구 삭제' },
    { key: 'Esc', action: '편집 모드 종료' },
    { key: '화살표 키', action: '가구 미세 이동' },
    { key: '더블클릭', action: '가구 편집 모드' },
    { key: '드래그 앤 드롭', action: '가구 배치' },
  ];

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>조작법</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div className={styles.content}>
          <div className={styles.shortcuts}>
            {shortcuts.map((shortcut, index) => (
              <div key={index} className={styles.shortcutItem}>
                <span className={styles.key}>{shortcut.key}</span>
                <span className={styles.action}>{shortcut.action}</span>
              </div>
            ))}
          </div>
          
          <div className={styles.tips}>
            <h4>사용 팁</h4>
            <ul>
              <li>사이드바에서 가구를 더블클릭하면 빈 슬롯에 자동 배치됩니다</li>
              <li>가구를 클릭하면 편집 팝업이 열립니다</li>
              <li>기둥을 더블클릭하면 기둥 속성을 편집할 수 있습니다</li>
              <li>도어 설치 버튼으로 도어를 추가/제거할 수 있습니다</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal; 