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
        wallConfig = { left: false, right: false };  // 한쪽벽모드는 양쪽 벽이 없음 (양쪽 엔드패널)
        break;
      case 'freestanding':
        wallConfig = { left: false, right: false };
        break;
    }

    // 프레임 설정도 함께 업데이트
    const updates: Partial<SpaceInfo> = {
      installType: type,
      wallConfig,
    };
    
    // 노서라운드 모드에서 세미스탠딩/프리스탠딩으로 변경 시 이격거리를 0으로 설정
    if (spaceInfo.surroundType === 'no-surround' && (type === 'semistanding' || type === 'freestanding')) {
      updates.gapConfig = {
        left: 0,
        right: 0
      };
    }
    
    // 서라운드 모드일 때 프레임 크기 재설정
    if (spaceInfo.surroundType === 'surround') {
      if (type === 'builtin') {
        // 양쪽벽: 기본 프레임 50mm
        updates.frameSize = {
          left: 50,
          right: 50,
          top: spaceInfo.frameSize?.top || 10,
        };
      } else if (type === 'semistanding') {
        // 한쪽벽: 벽 있는 쪽은 50mm, 없는 쪽은 20mm
        updates.frameSize = {
          left: wallConfig.left ? 50 : 20,
          right: wallConfig.right ? 50 : 20,
          top: spaceInfo.frameSize?.top || 10,
        };
      } else if (type === 'freestanding') {
        // 벽없음: 서라운드에서는 양쪽 20mm
        updates.frameSize = {
          left: 20,
          right: 20,
          top: spaceInfo.frameSize?.top || 10,
        };
      }
    }
    // 노서라운드 모드일 때는 frameSize를 기본값으로 설정
    else if (spaceInfo.surroundType === 'no-surround') {
      updates.frameSize = { left: 0, right: 0, top: 0 };
      
      // 빌트인 모드에서는 스토어가 자동으로 이격거리를 조정함
      // 세미스탠딩/프리스탠딩에서만 이격거리 설정
      if (type === 'semistanding' || type === 'freestanding') {
        updates.gapConfig = {
          left: wallConfig.left ? 2 : 20,
          right: wallConfig.right ? 2 : 20,
        };
      }
      // builtin의 경우 스토어의 adjustForIntegerSlotWidth가 자동으로 처리
    }
    
    console.log('🏢 InstallTypeControls - updating with:', updates);
    onUpdate(updates);
  };

  const handleWallConfigChange = (side: 'left' | 'right') => {
    const newWallConfig = {
      left: side === 'left',
      right: side === 'right',
    };
    
    // 노서라운드 모드일 때 gapConfig도 함께 업데이트
    const updates: Partial<SpaceInfo> = {
      wallConfig: newWallConfig
    };
    
    if (spaceInfo.surroundType === 'no-surround') {
      // 세미스탠딩(한쪽 벽만)이나 프리스탠딩(벽 없음)에서는 이격거리 0
      // 빌트인(양쪽 벽)에서만 이격거리 설정
      if (newWallConfig.left && newWallConfig.right) {
        // 빌트인: 이격거리 기본값 2mm
        updates.gapConfig = {
          left: spaceInfo.gapConfig?.left || 2,
          right: spaceInfo.gapConfig?.right || 2
        };
      } else {
        // 세미스탠딩 또는 프리스탠딩: 이격거리 0
        updates.gapConfig = {
          left: 0,
          right: 0
        };
      }
      // frameSize도 업데이트하여 자동 계산이 작동하도록 함
      updates.frameSize = { left: 0, right: 0, top: 0 };
    }
    
    console.log('🏢 InstallTypeControls - wallConfig 변경:', { 
      newWallConfig, 
      gapConfig: updates.gapConfig,
      surroundType: spaceInfo.surroundType 
    });
    
    onUpdate(updates);
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