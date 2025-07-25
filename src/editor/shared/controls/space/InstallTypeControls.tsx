import React from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { INSTALL_TYPES, InstallType } from '../types';
import styles from '../styles/common.module.css';

interface InstallTypeControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
}

const InstallTypeControls: React.FC<InstallTypeControlsProps> = ({ spaceInfo, onUpdate }) => {
  console.log('🏢 InstallTypeControls - 현재 installType:', spaceInfo.installType);
  console.log('🏢 InstallTypeControls - 현재 wallConfig:', spaceInfo.wallConfig);
  const handleInstallTypeChange = (type: InstallType) => {
    // 설치 유형에 따른 벽 구성 설정
    let wallConfig = { ...spaceInfo.wallConfig };
    
    switch (type) {
      case 'builtin':
        wallConfig = { left: true, right: true };
        break;
      case 'semistanding':
        wallConfig = { left: true, right: false };
        break;
      case 'freestanding':
        wallConfig = { left: false, right: false };
        break;
    }

    console.log('🏢 InstallTypeControls - updating with:', { installType: type, wallConfig });
    onUpdate({
      installType: type,
      wallConfig,
    });
  };

  const handleWallConfigChange = (side: 'left' | 'right') => {
    onUpdate({
      wallConfig: {
        left: side === 'left',
        right: side === 'right',
      },
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.toggleButtonGroup}>
          {INSTALL_TYPES.map((type) => (
            <button
              key={type.type}
              className={`${styles.toggleButton} ${spaceInfo.installType === type.type ? styles.toggleButtonActive : ''}`}
              onClick={() => handleInstallTypeChange(type.type)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* 세미스탠딩일 때만 벽 위치 선택 UI 표시 */}
      {spaceInfo.installType === 'semistanding' && (
        <div className={styles.section}>
          <span className={styles.label}>벽 위치</span>
          <div className={styles.toggleButtonGroup}>
            <button
              className={`${styles.toggleButton} ${spaceInfo.wallConfig.left ? styles.toggleButtonActive : ''}`}
              onClick={() => handleWallConfigChange('left')}
            >
              좌측
            </button>
            <button
              className={`${styles.toggleButton} ${spaceInfo.wallConfig.right ? styles.toggleButtonActive : ''}`}
              onClick={() => handleWallConfigChange('right')}
            >
              우측
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstallTypeControls; 