import React, { useState, useEffect } from 'react';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { WidthControl, HeightControl, InstallTypeControls } from '@/editor/shared/controls';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import styles from './Step2SpaceConfig.module.css';

interface Step2SpaceConfigProps {
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

const Step2SpaceConfig: React.FC<Step2SpaceConfigProps> = ({ onNext, onPrevious, onClose }) => {
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const [viewerKey, setViewerKey] = useState(0);
  const [hasAircon, setHasAircon] = useState(false);
  const [hasFloorFinish, setHasFloorFinish] = useState(false);

  const canProceed = spaceInfo.width > 0 && spaceInfo.height > 0;

  const handleUpdate = (updates: Partial<typeof spaceInfo>) => {
    setSpaceInfo({ ...spaceInfo, ...updates });
    // 뷰어 강제 리렌더링
    setViewerKey(prev => prev + 1);
  };

  // spaceInfo 변경 시 뷰어에 반영
  useEffect(() => {
    setViewerKey(prev => prev + 1);
  }, [spaceInfo.width, spaceInfo.height, spaceInfo.installType, spaceInfo.wallPosition]);

  return (
    <div className={styles.container}>
      <div className={styles.modalContent}>
        <div className={styles.header}>
          <button
            className={styles.closeButton}
            aria-label="닫기"
            onClick={onClose}
          >
            ×
          </button>
          <div>
            <h1>STEP.2    공간 정보</h1>
            <p>벽장의 크기와 설치 방식을 설정해주세요.</p>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.leftSection}>
            {/* 2D/3D 토글 버튼 */}
            <div className={styles.viewToggle}>
              <button 
                className={`${styles.toggleButton} ${viewMode === '2D' ? styles.active : ''}`}
                onClick={() => setViewMode('2D')}
              >
                2D
              </button>
              <button 
                className={`${styles.toggleButton} ${viewMode === '3D' ? styles.active : ''}`}
                onClick={() => setViewMode('3D')}
              >
                3D
              </button>
            </div>
            
            {/* 3D 에디터 뷰어 */}
            <div className={styles.editorViewer}>
              <Space3DView 
                key={viewerKey}
                viewMode={viewMode === '3D' ? '3d' : '2d'}
                isEmbedded={true}
                onViewModeChange={() => {}}
              />
            </div>
          </div>

          <div className={styles.rightSection}>
            <div className={styles.formSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.stepBadge}>STEP 2</span>
                <h2>공간 정보 입력</h2>
              </div>
              
              <div className={styles.form}>
                {/* 설치 타입 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>설치 타입</label>
                  <div className={styles.buttonGroup}>
                    <button 
                      className={`${styles.typeButton} ${spaceInfo.installType === 'builtin' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ installType: 'builtin' })}
                    >
                      빌트인
                    </button>
                    <button 
                      className={`${styles.typeButton} ${spaceInfo.installType === 'standalone' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ installType: 'standalone' })}
                    >
                      세미스탠딩
                    </button>
                    <button 
                      className={`${styles.typeButton} ${spaceInfo.installType === 'freestanding' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ installType: 'freestanding' })}
                    >
                      프리스탠딩
                    </button>
                  </div>
                </div>

                {/* 벽 위치 - 세미스탠딩에서만 표시 */}
                {spaceInfo.installType === 'standalone' && (
                  <div className={styles.formGroup}>
                    <div className={styles.groupHeader}>
                      <label className={styles.formLabel}>벽 위치</label>
                    </div>
                    <div className={styles.buttonGroup}>
                      <button 
                        className={`${styles.typeButton} ${spaceInfo.wallPosition === 'left' ? styles.active : ''}`}
                        onClick={() => handleUpdate({ wallPosition: 'left' })}
                      >
                        좌측
                      </button>
                      <button 
                        className={`${styles.typeButton} ${spaceInfo.wallPosition === 'right' ? styles.active : ''}`}
                        onClick={() => handleUpdate({ wallPosition: 'right' })}
                      >
                        우측
                      </button>
                    </div>
                  </div>
                )}

                {/* 공간 크기 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>공간 크기</label>
                  <div className={styles.sizeInputs}>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>폭</label>
                      <div className={styles.inputWithUnit}>
                        <input 
                          type="number" 
                          className={styles.sizeInput}
                          value={spaceInfo.width || ''}
                          onChange={(e) => handleUpdate({ width: parseInt(e.target.value) || 0 })}
                          placeholder="3600"
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>높이</label>
                      <div className={styles.inputWithUnit}>
                        <input 
                          type="number" 
                          className={styles.sizeInput}
                          value={spaceInfo.height || ''}
                          onChange={(e) => handleUpdate({ height: parseInt(e.target.value) || 0 })}
                          placeholder="2400"
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 에어컨 단내림 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>에어컨 단내림</label>
                  <div className={styles.buttonGroup}>
                    <button 
                      className={`${styles.typeButton} ${hasAircon ? styles.active : ''}`}
                      onClick={() => setHasAircon(true)}
                    >
                      있음
                    </button>
                    <button 
                      className={`${styles.typeButton} ${!hasAircon ? styles.active : ''}`}
                      onClick={() => setHasAircon(false)}
                    >
                      없음
                    </button>
                    {/* 에어컨 위치 - 있음 선택시에만 표시 */}
                    {hasAircon && (
                      <>
                        <button className={`${styles.typeButton} ${styles.active}`}>좌측</button>
                        <button className={styles.typeButton}>우측</button>
                      </>
                    )}
                  </div>
                </div>

                {/* 에어컨 크기 - 있음 선택시에만 표시 */}
                {hasAircon && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>에어컨 크기</label>
                  <div className={styles.sizeInputs}>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>폭</label>
                      <div className={styles.inputWithUnit}>
                        <input 
                          type="number" 
                          className={styles.sizeInput}
                          defaultValue="900"
                          placeholder="900"
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>높이</label>
                      <div className={styles.inputWithUnit}>
                        <input 
                          type="number" 
                          className={styles.sizeInput}
                          defaultValue="200"
                          placeholder="200"
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* 바닥 마감재 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>바닥 마감재</label>
                  <div className={styles.buttonGroup}>
                    <button 
                      className={`${styles.typeButton} ${hasFloorFinish ? styles.active : ''}`}
                      onClick={() => setHasFloorFinish(true)}
                    >
                      있음
                    </button>
                    <button 
                      className={`${styles.typeButton} ${!hasFloorFinish ? styles.active : ''}`}
                      onClick={() => setHasFloorFinish(false)}
                    >
                      없음
                    </button>
                  </div>
                  {/* 바닥 마감재 높이 - 있음 선택시에만 표시 */}
                  {hasFloorFinish && (
                    <div className={styles.sizeInputs}>
                      <div className={styles.inputGroup}>
                        <label className={styles.inputLabel}>높이</label>
                        <div className={styles.inputWithUnit}>
                          <input 
                            type="number" 
                            className={styles.sizeInput}
                            defaultValue="10"
                            placeholder="10"
                          />
                          <span className={styles.unit}>mm</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.previousButton}
            onClick={onPrevious}
          >
            &lt; 이전
          </button>
          <button
            className={styles.nextButton}
            onClick={onNext}
            disabled={!canProceed}
          >
            다음 단계
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step2SpaceConfig;