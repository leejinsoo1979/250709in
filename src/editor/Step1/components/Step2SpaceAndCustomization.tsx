import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { createProject } from '@/services/projectDataService';
import { getCurrentUserAsync } from '@/firebase/auth';
import { createDesignFile } from '@/firebase/projects';
import { generateDefaultThumbnail, dataURLToBlob } from '@/editor/shared/utils/thumbnailCapture';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import Space3DView from '@/editor/shared/viewer3d/Space3DView';
import LoadingSpinner from '@/components/common/LoadingSpinner';

// 컨트롤 컴포넌트들 import
import { InstallType } from '@/editor/shared/controls/types';
import WidthControl from '@/editor/shared/controls/space/WidthControl';
import HeightControl from '@/editor/shared/controls/space/HeightControl';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { SpaceCalculator, ColumnIndexer } from '@/editor/shared/utils/indexing';

import styles from './Step2SpaceAndCustomization.module.css';

interface Step2SpaceAndCustomizationProps {
  onPrevious: () => void;
  onClose: () => void;
}

const Step2SpaceAndCustomization: React.FC<Step2SpaceAndCustomizationProps> = ({ onPrevious, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const viewMode = '3D'; // 3D 뷰만 사용
  const [viewerKey, setViewerKey] = useState(0);
  
  const { basicInfo, projectId } = useProjectStore();
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();

  // 컴포넌트 마운트 시 초기 설정
  useEffect(() => {
    const updates: Partial<typeof spaceInfo> = {};
    
    // 기본값 설정이 필요한 경우
    if (!spaceInfo.surroundType) {
      updates.surroundType = 'no-surround';
      updates.frameSize = { left: 0, right: 0, top: 0 };
      updates.gapConfig = {
        left: spaceInfo.installType === 'builtin' ? 2 : 
              (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left) ? 2 : 20,
        right: spaceInfo.installType === 'builtin' ? 2 : 
               (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right) ? 2 : 20
      };
      updates.baseConfig = {
        type: 'floor' as const,
        height: 65,
        placementType: 'ground' as const
      };
    }
    
    // 컬럼 수 초기값 설정
    if (!spaceInfo.customColumnCount && !spaceInfo.mainDoorCount) {
      updates.customColumnCount = 3;
    }
    
    // 업데이트가 필요한 경우에만 실행
    if (Object.keys(updates).length > 0) {
      setSpaceInfo({ ...spaceInfo, ...updates });
    }
  }, []);

  const canProceed = spaceInfo.width > 0 && spaceInfo.height > 0;

  const handleUpdate = (updates: Partial<typeof spaceInfo>) => {
    setSpaceInfo({ ...spaceInfo, ...updates });
    setViewerKey(prev => prev + 1);
  };

  // spaceInfo 변경 시 뷰어에 반영
  useEffect(() => {
    setViewerKey(prev => prev + 1);
  }, [spaceInfo.width, spaceInfo.height, spaceInfo.installType, spaceInfo.wallConfig?.left, spaceInfo.wallConfig?.right, spaceInfo.surroundType, spaceInfo.gapConfig?.left, spaceInfo.gapConfig?.right]);

  const handleStartDesign = async () => {
    if (!basicInfo.title || !basicInfo.location || !canProceed) {
      alert('모든 필수 정보를 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUserAsync();
      if (!user) {
        throw new Error('사용자 정보를 찾을 수 없습니다.');
      }

      const projectId = `project_${Date.now()}`;
      const currentTimestamp = serverTimestamp();
      
      // CreateProjectData 형식에 맞게 데이터 준비
      const projectData = {
        userId: user.uid,
        basicInfo: {
          title: basicInfo.title,
          location: basicInfo.location,
          description: basicInfo.description || '',
          unitType: basicInfo.unitType || 'household',
          category: basicInfo.category || 'residential',
          createdAt: currentTimestamp,
          updatedAt: currentTimestamp,
          version: '1.0.0'
        },
        spaceConfig: spaceInfo,
        customLayout: {
          wall: {
            type: spaceInfo.surroundType === 'surround' ? 'wall' : 'nowall',
            completed: true
          },
          rack: {
            thickness: '2mm',
            completed: false,
            options: {
              isComposite: false
            }
          },
          motor: {
            type: 'none',
            completed: false
          },
          ventilation: {
            type: 'none',
            completed: false
          },
          exhaust: {
            type: 'none',
            completed: false
          }
        }
      };

      // 이미 Step1에서 프로젝트가 생성되었으므로, projectId 사용
      let currentProjectId = projectId;
      
      if (!currentProjectId) {
        // 만약 프로젝트 ID가 없으면 생성 (백업용)
        const result = await createProject(projectData);
        if (result.success && result.data) {
          currentProjectId = result.data;
        } else {
          throw new Error(result.error || '프로젝트 생성 실패');
        }
      }
      
      if (currentProjectId) {
        const designFileName = `${basicInfo.title || '새로운 디자인'}_${new Date().toISOString().split('T')[0]}`;
        
        const thumbnailDataURL = generateDefaultThumbnail(spaceInfo, placedModules.length);
        const thumbnailBlob = thumbnailDataURL ? dataURLToBlob(thumbnailDataURL) : null;
        
        const designFileResult = await createDesignFile({
          name: designFileName,
          projectId: currentProjectId,
          spaceConfig: spaceInfo,
          furniture: {
            placedModules: []
          }
        });

        if (designFileResult.id) {
          // BroadcastChannel로 다른 탭에 알림
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ 
              type: 'DESIGN_FILE_UPDATED',
              action: 'design_created',
              projectId: currentProjectId,
              designFileId: designFileResult.id
            });
            channel.close();
          } catch (error) {
            console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
          }
          
          // onClose가 있으면 모달을 닫고, 없으면 직접 navigate
          if (onClose) {
            onClose();
          }
          
          // 약간의 지연을 주어 로딩 화면이 보이도록 함
          setTimeout(() => {
            navigate(`/configurator?projectId=${currentProjectId}&designId=${designFileResult.id}&skipLoad=true`, { replace: true });
          }, 100);
        } else {
          throw new Error(designFileResult.error || '디자인 파일 생성 실패');
        }
      } else {
        throw new Error(result.error || '프로젝트 생성 실패');
      }
    } catch (error) {
      console.error('프로젝트 생성 오류:', error);
      alert(`프로젝트 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.container} data-theme="light" style={{ colorScheme: 'light' }}>
      {/* 로딩 화면 */}
      {saving && (
        <div className={styles.loadingOverlay}>
          <LoadingSpinner 
            message="Loading"
            size="large"
            type="spinner"
          />
        </div>
      )}
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
            <h1>
              STEP. 2 공간 설정
              {basicInfo.title && (
                <span style={{ marginLeft: '20px', fontSize: '0.8em', color: '#666' }}>
                  {basicInfo.title} / {basicInfo.location || '위치 미정'}
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.leftSection}>
            {/* 3D 에디터 뷰어 (2D 뷰 제거) */}
            <div className={styles.editorViewer}>
              <Space3DView 
                key={`${viewerKey}-${spaceInfo.wallConfig?.left ? 'L' : 'R'}-${spaceInfo.gapConfig?.left}-${spaceInfo.gapConfig?.right}`}
                spaceInfo={spaceInfo}
                viewMode={viewMode}
                renderMode="solid"
                showAll={true}
                showDimensions={true}
                showFrame={true}
                isEmbedded={true}
                isStep2={true}
                setViewMode={() => {}}
              />
            </div>
          </div>

          <div className={styles.rightSection}>
            <div className={styles.formContent}>
              {/* 공간 유형 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>{t('space.installType')}</label>
                <div className={styles.toggleButtonsWide}>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.installType === 'builtin' ? styles.active : ''}`}
                    onClick={() => {
                      const updates: Partial<typeof spaceInfo> = {
                        installType: 'builtin' as InstallType,
                      };
                      updates.wallConfig = { left: true, right: true };
                      updates.gapConfig = { left: 2, right: 2 };
                      handleUpdate(updates);
                    }}
                    title={t('space.builtinDesc')}
                  >
                    {t('space.builtin')}
                  </button>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.installType === 'semistanding' ? styles.active : ''}`}
                    onClick={() => {
                      const updates: Partial<typeof spaceInfo> = {
                        installType: 'semistanding' as InstallType,
                      };
                      updates.wallConfig = { left: true, right: false };
                      updates.gapConfig = { left: 2, right: 20 };
                      handleUpdate(updates);
                    }}
                    title={t('space.semistandingDesc')}
                  >
                    {t('space.semistanding')}
                  </button>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.installType === 'freestanding' ? styles.active : ''}`}
                    onClick={() => {
                      const updates: Partial<typeof spaceInfo> = {
                        installType: 'freestanding' as InstallType,
                      };
                      updates.wallConfig = { left: false, right: false };
                      updates.gapConfig = { left: 20, right: 20 };
                      handleUpdate(updates);
                    }}
                    title={t('space.freestandingDesc')}
                  >
                    {t('space.freestanding')}
                  </button>
                </div>
              </div>
              
              {/* 세미스탠딩일 때 벽 위치 선택 */}
              {spaceInfo.installType === 'semistanding' && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>{t('space.wallPosition')}</label>
                  <div className={styles.toggleButtonsWide}>
                    <button
                      className={`${styles.toggleButton} ${spaceInfo.wallConfig?.left ? styles.active : ''}`}
                      onClick={() => handleUpdate({ 
                        wallConfig: { left: true, right: false },
                        gapConfig: { left: 2, right: 20 }
                      })}
                    >
                      {t('furniture.left')}
                    </button>
                    <button
                      className={`${styles.toggleButton} ${spaceInfo.wallConfig?.right ? styles.active : ''}`}
                      onClick={() => handleUpdate({ 
                        wallConfig: { left: false, right: true },
                        gapConfig: { left: 20, right: 2 }
                      })}
                    >
                      {t('furniture.right')}
                    </button>
                  </div>
                </div>
              )}

              {/* 공간 크기 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>{t('space.title')}</label>
                <div className={styles.sizeInputs}>
                  <span className={styles.sizeLabel}>W</span>
                  <WidthControl
                    spaceInfo={spaceInfo}
                    onUpdate={handleUpdate}
                  />
                  <span className={styles.sizeLabel}>H</span>
                  <HeightControl
                    spaceInfo={spaceInfo}
                    onUpdate={handleUpdate}
                  />
                </div>
              </div>

              {/* 단내림 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>{t('space.droppedCeiling')}</label>
                <div className={styles.toggleButtonsWide}>
                  <button
                    className={`${styles.toggleButton} ${!spaceInfo.droppedCeiling?.enabled ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      droppedCeiling: { 
                        ...spaceInfo.droppedCeiling,
                        enabled: false 
                      } 
                    })}
                  >
                    {t('common.none')}
                  </button>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.enabled ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      droppedCeiling: { 
                        enabled: true,
                        position: spaceInfo.droppedCeiling?.position || 'left',
                        width: spaceInfo.droppedCeiling?.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH,
                        dropHeight: spaceInfo.droppedCeiling?.dropHeight || 300
                      } 
                    })}
                  >
                    {t('common.enabled')}
                  </button>
                </div>
              </div>

              {/* 단내림 위치 - 단내림이 활성화된 경우에만 표시 */}
              {spaceInfo.droppedCeiling?.enabled && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>{t('placement.placementType')}</label>
                  <div className={styles.toggleButtonsWide}>
                    <button
                      className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.position === 'left' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ 
                        droppedCeiling: { 
                          ...spaceInfo.droppedCeiling,
                          position: 'left'
                        } 
                      })}
                    >
                      {t('furniture.left')}
                    </button>
                    <button
                      className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.position === 'right' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ 
                        droppedCeiling: { 
                          ...spaceInfo.droppedCeiling,
                          position: 'right'
                        } 
                      })}
                    >
                      {t('furniture.right')}
                    </button>
                  </div>
                </div>
              )}

              {/* 컬럼수 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>{spaceInfo.droppedCeiling?.enabled ? t('space.columnCount') : t('space.columnCount')}</label>
                {(() => {
                  const internalSpace = calculateInternalSpace(spaceInfo);
                  let internalWidth = internalSpace.width;
                  let maxColumns = 6;
                  
                  if (spaceInfo.droppedCeiling?.enabled) {
                    // 단내림이 활성화되면 메인 구간의 너비 계산
                    const droppedCeilingWidth = spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
                    internalWidth = internalSpace.width - droppedCeilingWidth;
                  }
                  
                  // 컬럼 제한 계산
                  const columnLimits = ColumnIndexer.getColumnLimits(internalWidth);
                  maxColumns = columnLimits.maxColumns;
                  
                  const currentValue = spaceInfo.droppedCeiling?.enabled 
                    ? (spaceInfo.mainDoorCount || spaceInfo.customColumnCount || columnLimits.minColumns)
                    : (spaceInfo.customColumnCount || columnLimits.minColumns);
                  
                  // 현재 값이 범위를 벗어나면 자동 조정
                  const validValue = Math.max(columnLimits.minColumns, 
                                             Math.min(columnLimits.maxColumns, currentValue));
                  
                  // 값이 조정되었으면 즉시 업데이트
                  if (validValue !== currentValue) {
                    if (spaceInfo.droppedCeiling?.enabled) {
                      handleUpdate({ mainDoorCount: validValue });
                    } else {
                      handleUpdate({ customColumnCount: validValue });
                    }
                  }
                  
                  return (
                    <>
                      <input
                        type="range"
                        min={columnLimits.minColumns}
                        max={columnLimits.maxColumns}
                        value={validValue}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (spaceInfo.droppedCeiling?.enabled) {
                            handleUpdate({ mainDoorCount: value });
                          } else {
                            handleUpdate({ customColumnCount: value });
                          }
                        }}
                        className={styles.rangeInput}
                      />
                      <span className={styles.rangeValue}>
                        {validValue}
                      </span>
                    </>
                  );
                })()}
              </div>

              {/* 단내림 구간 컬럼수 - 단내림이 활성화된 경우에만 표시 */}
              {spaceInfo.droppedCeiling?.enabled && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>{t('space.droppedColumnCount')}</label>
                  {(() => {
                    const droppedCeilingWidth = spaceInfo.droppedCeiling.width || DEFAULT_DROPPED_CEILING_VALUES.WIDTH;
                    // 단내림 구간의 내부 너비 계산 (프레임 두께 고려)
                    const frameThickness = spaceInfo.surroundType === 'surround' ? 50 : 0;
                    const droppedInternalWidth = droppedCeilingWidth - frameThickness;
                    
                    // 단내림 구간의 컬럼 제한 계산
                    const droppedColumnLimits = ColumnIndexer.getColumnLimits(droppedInternalWidth);
                    const currentValue = spaceInfo.droppedCeilingDoorCount || droppedColumnLimits.minColumns;
                    
                    // 현재 값이 범위를 벗어나면 자동 조정
                    const validValue = Math.max(droppedColumnLimits.minColumns, 
                                               Math.min(droppedColumnLimits.maxColumns, currentValue));
                    
                    return (
                      <>
                        <input
                          type="range"
                          min={droppedColumnLimits.minColumns}
                          max={droppedColumnLimits.maxColumns}
                          value={validValue}
                          onChange={(e) => handleUpdate({ droppedCeilingDoorCount: parseInt(e.target.value) })}
                          className={styles.rangeInput}
                        />
                        <span className={styles.rangeValue}>{validValue}</span>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className={styles.divider} />

              {/* 프레임 설정 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>프레임 설정</label>
                <div className={styles.toggleButtonsWide}>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.surroundType === 'surround' ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      surroundType: 'surround',
                      frameSize: spaceInfo.frameSize || { left: 50, right: 50, top: 10 }
                    })}
                  >
                    {t('space.surround')}
                  </button>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.surroundType === 'no-surround' ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      surroundType: 'no-surround',
                      frameSize: { left: 0, right: 0, top: 0 },
                      gapConfig: {
                        left: spaceInfo.installType === 'builtin' ? 2 : 
                              (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left) ? 2 : 20,
                        right: spaceInfo.installType === 'builtin' ? 2 : 
                               (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right) ? 2 : 20
                      }
                    })}
                  >
                    {t('space.noSurround')}
                  </button>
                </div>
              </div>
              
              {/* 서라운드일 때 프레임 사이즈 입력 필드 */}
              {spaceInfo.surroundType === 'surround' && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>프레임 두께</label>
                  <div className={styles.sizeInputs}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span className={styles.labelText}>좌</span>
                      <input
                        type="number"
                        className={styles.numberInput}
                        value={spaceInfo.frameSize?.left || 50}
                        onChange={(e) => handleUpdate({
                          frameSize: {
                            ...spaceInfo.frameSize,
                            left: parseInt(e.target.value) || 50
                          }
                        })}
                        min="40"
                        max="100"
                      />
                      <span className={styles.labelText}>우</span>
                      <input
                        type="number"
                        className={styles.numberInput}
                        value={spaceInfo.frameSize?.right || 50}
                        onChange={(e) => handleUpdate({
                          frameSize: {
                            ...spaceInfo.frameSize,
                            right: parseInt(e.target.value) || 50
                          }
                        })}
                        min="40"
                        max="100"
                      />
                      <span className={styles.labelText}>상</span>
                      <input
                        type="number"
                        className={styles.numberInput}
                        value={spaceInfo.frameSize?.top || 10}
                        onChange={(e) => handleUpdate({
                          frameSize: {
                            ...spaceInfo.frameSize,
                            top: parseInt(e.target.value) || 10
                          }
                        })}
                        min="10"
                        max="200"
                      />
                      <span className={styles.unitText}>mm</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 노서라운드일 때 이격거리 설정 */}
              {spaceInfo.surroundType === 'no-surround' && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>이격거리</label>
                  <div className={styles.sizeInputs}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span className={styles.labelText}>좌</span>
                      <input
                        type="number"
                        className={styles.inputField}
                        value={spaceInfo.gapConfig?.left || 2}
                        onChange={(e) => handleUpdate({
                          gapConfig: {
                            ...spaceInfo.gapConfig,
                            left: parseInt(e.target.value) || 2
                          }
                        })}
                        min="2"
                        max="50"
                        disabled={spaceInfo.installType === 'builtin' || (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left)}
                      />
                      <span className={styles.labelText}>우</span>
                      <input
                        type="number"
                        className={styles.inputField}
                        value={spaceInfo.gapConfig?.right || 2}
                        onChange={(e) => handleUpdate({
                          gapConfig: {
                            ...spaceInfo.gapConfig,
                            right: parseInt(e.target.value) || 2
                          }
                        })}
                        min="2"
                        max="50"
                        disabled={spaceInfo.installType === 'builtin' || (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right)}
                      />
                      <span className={styles.unitText}>mm</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 배치 설정 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>배치 설정</label>
                <div className={styles.toggleButtonsWide}>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.baseConfig?.type === 'floor' || !spaceInfo.baseConfig ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      baseConfig: { 
                        ...spaceInfo.baseConfig,
                        type: 'floor',
                        height: spaceInfo.baseConfig?.height || 65,
                        placementType: 'ground'
                      } 
                    })}
                  >
                    바닥에 배치
                  </button>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.baseConfig?.type === 'stand' ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      baseConfig: { 
                        ...spaceInfo.baseConfig,
                        type: 'stand',
                        placementType: 'float',
                        floatHeight: spaceInfo.baseConfig?.floatHeight || 200
                      } 
                    })}
                  >
                    띄워서 배치
                  </button>
                </div>
              </div>
              
              {/* 높이 입력 필드 - 바닥에 배치일 때 */}
              {(spaceInfo.baseConfig?.type === 'floor' || !spaceInfo.baseConfig) && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>높이</label>
                  <div className={styles.sizeInputs}>
                    <input
                      type="number"
                      className={styles.wideInputField}
                      value={spaceInfo.baseConfig?.height || 65}
                      onChange={(e) => handleUpdate({
                        baseConfig: {
                          ...spaceInfo.baseConfig,
                          type: 'floor',
                          height: parseInt(e.target.value) || 65
                        }
                      })}
                      min="50"
                      max="500"
                    />
                    <span className={styles.unitText}>mm</span>
                  </div>
                </div>
              )}
              
              {/* 높이 입력 필드 - 띄워서 배치일 때 */}
              {spaceInfo.baseConfig?.type === 'stand' && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>높이</label>
                  <div className={styles.sizeInputs}>
                    <input
                      type="number"
                      className={styles.wideInputField}
                      value={spaceInfo.baseConfig?.floatHeight || 200}
                      onChange={(e) => handleUpdate({
                        baseConfig: {
                          ...spaceInfo.baseConfig,
                          type: 'stand',
                          placementType: 'float',
                          floatHeight: parseInt(e.target.value) || 200
                        }
                      })}
                      min="100"
                      max="500"
                    />
                    <span className={styles.unitText}>mm</span>
                  </div>
                </div>
              )}

              {/* 바닥 마감재 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>바닥 마감재</label>
                <div className={styles.toggleButtonsWide}>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.hasFloorFinish ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      hasFloorFinish: true,
                      floorFinish: spaceInfo.floorFinish || { height: 10 }
                    })}
                  >
                    {t('common.enabled')}
                  </button>
                  <button
                    className={`${styles.toggleButton} ${!spaceInfo.hasFloorFinish ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      hasFloorFinish: false 
                    })}
                  >
                    {t('common.none')}
                  </button>
                </div>
              </div>
              
              {/* 바닥 마감재 두께 입력 필드 - 마감재가 있을 때만 표시 */}
              {spaceInfo.hasFloorFinish && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>마감재 두께</label>
                  <div className={styles.sizeInputs}>
                    <input
                      type="number"
                      className={styles.wideInputField}
                      value={spaceInfo.floorFinish?.height || 10}
                      onChange={(e) => handleUpdate({
                        floorFinish: {
                          height: parseInt(e.target.value) || 10
                        }
                      })}
                      min="5"
                      max="50"
                    />
                    <span className={styles.unitText}>mm</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button 
            className={styles.previousButton}
            onClick={onPrevious}
          >
            이전
          </button>
          <button 
            className={`${styles.confirmButton} ${!canProceed ? styles.disabled : ''}`}
            onClick={handleStartDesign}
            disabled={!canProceed || saving}
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step2SpaceAndCustomization;