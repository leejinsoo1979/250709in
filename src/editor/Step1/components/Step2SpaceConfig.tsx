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
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('3D'); // 기본값을 3D로 변경
  const [viewerKey, setViewerKey] = useState(0);
  const [hasAircon, setHasAircon] = useState(false);
  const [renderMode, setRenderMode] = useState<'solid' | 'wireframe'>('solid');
  const [showAll, setShowAll] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  
  // 임시 치수 상태 (입력 중인 값)
  const [tempWidth, setTempWidth] = useState(spaceInfo.width?.toString() || '');
  const [tempHeight, setTempHeight] = useState(spaceInfo.height?.toString() || '');

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
  
  // spaceInfo 변경 시 임시 상태 업데이트 (외부에서 변경된 경우)
  useEffect(() => {
    setTempWidth(spaceInfo.width?.toString() || '');
    setTempHeight(spaceInfo.height?.toString() || '');
  }, [spaceInfo.width, spaceInfo.height]);

  return (
    <div className={styles.container} data-theme="light" style={{ colorScheme: 'light' }}>
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
            
            {/* 3D 에디터 뷰어 - Configurator와 동일한 설정 */}
            <div className={styles.editorViewer}>
              <Space3DView 
                key={viewerKey}
                spaceInfo={spaceInfo}
                viewMode={viewMode}
                renderMode={renderMode}
                showAll={false}
                showDimensions={true}
                showFrame={false}
                isEmbedded={true}
                isStep2={true}
                setViewMode={(mode) => setViewMode(mode)}
              />
            </div>
          </div>

          <div className={styles.rightSection}>
            <div className={styles.formSection}>
              <div className={styles.sectionHeader}>
                <h2>공간 정보 입력</h2>
              </div>
              
              <div className={styles.form}>
                {/* 설치 타입 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>설치 타입</label>
                  <div className={styles.buttonGroup}>
                    <button 
                      className={`${styles.typeButton} ${spaceInfo.installType === 'builtin' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ 
                        installType: 'builtin',
                        wallConfig: { left: true, right: true }
                      })}
                    >
                      양쪽벽
                    </button>
                    <button 
                      className={`${styles.typeButton} ${spaceInfo.installType === 'semistanding' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ 
                        installType: 'semistanding',
                        wallConfig: { left: true, right: false }
                      })}
                    >
                      한쪽벽
                    </button>
                    <button 
                      className={`${styles.typeButton} ${spaceInfo.installType === 'freestanding' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ 
                        installType: 'freestanding',
                        wallConfig: { left: false, right: false }
                      })}
                    >
                      벽없음
                    </button>
                  </div>
                </div>

                {/* 벽 위치 - 세미스탠딩에서만 표시 */}
                {spaceInfo.installType === 'semistanding' && (
                  <div className={styles.formGroup}>
                    <div className={styles.groupHeader}>
                      <label className={styles.formLabel}>벽 위치</label>
                    </div>
                    <div className={styles.buttonGroup}>
                      <button 
                        className={`${styles.typeButton} ${spaceInfo.wallConfig?.left ? styles.active : ''}`}
                        onClick={() => handleUpdate({ 
                          wallConfig: { left: true, right: false }
                        })}
                      >
                        좌측
                      </button>
                      <button 
                        className={`${styles.typeButton} ${spaceInfo.wallConfig?.right ? styles.active : ''}`}
                        onClick={() => handleUpdate({ 
                          wallConfig: { left: false, right: true }
                        })}
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
                          value={tempWidth}
                          onChange={(e) => setTempWidth(e.target.value)}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            if (value > 0) {
                              handleUpdate({ width: value });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const value = parseInt(tempWidth) || 0;
                              if (value > 0) {
                                handleUpdate({ width: value });
                              }
                            }
                          }}
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
                          value={tempHeight}
                          onChange={(e) => setTempHeight(e.target.value)}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            if (value > 0) {
                              handleUpdate({ height: value });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const value = parseInt(tempHeight) || 0;
                              if (value > 0) {
                                handleUpdate({ height: value });
                              }
                            }
                          }}
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