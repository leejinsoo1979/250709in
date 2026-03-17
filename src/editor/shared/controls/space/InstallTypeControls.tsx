import React from 'react';
import { SpaceInfo } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { INSTALL_TYPES_UI, InstallTypeUI } from '../types';
import styles from '../styles/common.module.css';

interface InstallTypeControlsProps {
  spaceInfo: SpaceInfo;
  onUpdate: (updates: Partial<SpaceInfo>) => void;
}

const InstallTypeControls: React.FC<InstallTypeControlsProps> = ({ spaceInfo, onUpdate }) => {
  const { clearAllModules, placedModules } = useFurnitureStore();

  // 현재 상태에서 UI 타입 결정
  const getCurrentUIType = (): InstallTypeUI => {
    if (spaceInfo.installType === 'builtin') return 'builtin';
    if (spaceInfo.installType === 'freestanding') return 'freestanding';
    // semistanding: wallConfig으로 좌/우 판단
    if (spaceInfo.wallConfig?.left) return 'semistanding-left';
    return 'semistanding-right';
  };

  const currentUIType = getCurrentUIType();

  const handleUITypeChange = (uiType: InstallTypeUI) => {
    if (uiType === currentUIType) return;

    // 배치된 가구가 있으면 확인 팝업
    if (placedModules.length > 0) {
      if (!window.confirm('공간유형을 변경하면 배치된 가구가 사라집니다. 계속하시겠습니까?')) return;
    }
    clearAllModules();

    let installType: 'builtin' | 'semistanding' | 'freestanding';
    let wallConfig: { left: boolean; right: boolean };

    switch (uiType) {
      case 'builtin':
        installType = 'builtin';
        wallConfig = { left: true, right: true };
        break;
      case 'semistanding-left':
        installType = 'semistanding';
        wallConfig = { left: true, right: false };
        break;
      case 'semistanding-right':
        installType = 'semistanding';
        wallConfig = { left: false, right: true };
        break;
      case 'freestanding':
        installType = 'freestanding';
        wallConfig = { left: false, right: false };
        break;
    }

    const updates: Partial<SpaceInfo> = {
      installType,
      wallConfig,
    };

    // 노서라운드 모드에서 세미스탠딩/프리스탠딩으로 변경 시 이격거리 설정
    if (spaceInfo.surroundType === 'no-surround' && (installType === 'semistanding' || installType === 'freestanding')) {
      updates.gapConfig = {
        left: wallConfig.left ? 2 : 18,
        right: wallConfig.right ? 2 : 18,
      };
    }

    // 서라운드 모드일 때 프레임 크기 재설정
    if (spaceInfo.surroundType === 'surround') {
      if (installType === 'builtin') {
        updates.frameSize = {
          left: 50,
          right: 50,
          top: spaceInfo.frameSize?.top || 30,
        };
      } else if (installType === 'semistanding') {
        updates.frameSize = {
          left: wallConfig.left ? 50 : 20,
          right: wallConfig.right ? 50 : 20,
          top: spaceInfo.frameSize?.top || 30,
        };
      } else if (installType === 'freestanding') {
        updates.frameSize = {
          left: 20,
          right: 20,
          top: spaceInfo.frameSize?.top || 30,
        };
      }
    }
    // 노서라운드 모드일 때
    else if (spaceInfo.surroundType === 'no-surround') {
      updates.frameSize = { left: 0, right: 0, top: 0 };

      if (installType === 'semistanding' || installType === 'freestanding') {
        updates.gapConfig = {
          left: wallConfig.left ? 2 : 18,
          right: wallConfig.right ? 2 : 18,
        };
      }
    }

    onUpdate(updates);
  };

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.toggleButtonGroup}>
          {INSTALL_TYPES_UI.map((type) => (
            <button
              key={type.uiType}
              className={`${styles.toggleButton} ${currentUIType === type.uiType ? styles.toggleButtonActive : ''}`}
              onClick={() => handleUITypeChange(type.uiType)}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InstallTypeControls;
