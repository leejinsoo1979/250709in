import React, { useMemo, useState } from 'react';
import styles from './HelpModal.module.css';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Platform = 'mac' | 'win';

const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'win';
  const s = `${navigator.userAgent || ''}`;
  return /Mac|iPhone|iPad|iPod/.test(s) ? 'mac' : 'win';
};

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const detected = useMemo(detectPlatform, []);
  const [platform, setPlatform] = useState<Platform>(detected);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const imageSrc = platform === 'mac' ? '/help/shortcuts-mac.png' : '/help/shortcuts-win.png';
  // 이미지 원본 비율 (mac: 1196x1315, win: 1148x1370)
  const aspect = platform === 'mac' ? 1196 / 1315 : 1148 / 1370;

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} style={{ aspectRatio: String(aspect) }}>
        <div className={styles.header}>
          <h3 className={styles.title}>조작법</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {/* 플랫폼 토글 */}
        <div className={styles.envBar}>
          <div className={styles.envCurrent}>
            현재 환경
            <span className={styles.envBadge}>{detected === 'mac' ? 'macOS' : 'Windows'}</span>
          </div>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            <button
              type="button"
              className={styles.key}
              onClick={() => setPlatform('win')}
              style={{
                cursor: 'pointer',
                background: platform === 'win' ? 'var(--theme-primary, #121212)' : undefined,
                color: platform === 'win' ? '#fff' : undefined,
                borderColor: platform === 'win' ? 'var(--theme-primary, #121212)' : undefined,
              }}
            >Windows</button>
            <button
              type="button"
              className={styles.key}
              onClick={() => setPlatform('mac')}
              style={{
                cursor: 'pointer',
                background: platform === 'mac' ? 'var(--theme-primary, #121212)' : undefined,
                color: platform === 'mac' ? '#fff' : undefined,
                borderColor: platform === 'mac' ? 'var(--theme-primary, #121212)' : undefined,
              }}
            >macOS</button>
          </div>
        </div>

        {/* 이미지 — 모달 안에 꽉 차게 (스크롤 없이 contain) */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            background: '#fff',
            padding: 12,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <img
            src={imageSrc}
            alt={platform === 'mac' ? 'macOS 조작법' : 'Windows 조작법'}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              borderRadius: 6,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
