import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import InstallTypeControls from '@/editor/shared/controls/space/InstallTypeControls';
import WidthControl from '@/editor/shared/controls/space/WidthControl';
import HeightControl from '@/editor/shared/controls/space/HeightControl';
import FloorFinishControls from '@/editor/shared/controls/space/FloorFinishControls';
import BaseControls from '@/editor/shared/controls/customization/BaseControls';
import SurroundControls from '@/editor/shared/controls/customization/SurroundControls';
import { calculateInternalSpace } from '@/editor/shared/viewer3d/utils/geometry';
import { SpaceCalculator, ColumnIndexer } from '@/editor/shared/utils/indexing';

import styles from './Step2SpaceAndCustomization.module.css';

interface Step2SpaceAndCustomizationProps {
  onPrevious: () => void;
  onClose: () => void;
}

const Step2SpaceAndCustomization: React.FC<Step2SpaceAndCustomizationProps> = ({ onPrevious, onClose }) => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const viewMode = '3D'; // 3D 뷰만 사용
  const [viewerKey, setViewerKey] = useState(0);
  
  const { basicInfo } = useProjectStore();
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
        placementType: 'floor' as const
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

      const result = await createProject(projectData);
      
      if (result.success && result.data) {
        const projectId = result.data;
        const designFileName = `${basicInfo.title || '새로운 디자인'}_${new Date().toISOString().split('T')[0]}`;
        
        const thumbnailDataURL = generateDefaultThumbnail(spaceInfo, placedModules.length);
        const thumbnailBlob = thumbnailDataURL ? dataURLToBlob(thumbnailDataURL) : null;
        
        const designFileResult = await createDesignFile({
          name: designFileName,
          projectId: projectId,
          spaceConfig: spaceInfo,
          furniture: {
            placedModules: []
          }
        });

        if (designFileResult.id) {
          // onClose가 있으면 모달을 닫고, 없으면 직접 navigate
          if (onClose) {
            onClose();
          }
          
          // 약간의 지연을 주어 로딩 화면이 보이도록 함
          setTimeout(() => {
            navigate(`/configurator?project=${projectId}&design=new`, { replace: true });
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
            <h1>공간 설정</h1>
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
              {/* 설치 타입 */}
              <InstallTypeControls
                spaceInfo={spaceInfo}
                onUpdate={handleUpdate}
              />

              {/* 공간 크기 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>크기</label>
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
              <div className={styles.formGroup}>
                <label className={styles.compactLabel}>단내림</label>
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
                    없음
                  </button>
                  <button
                    className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.enabled ? styles.active : ''}`}
                    onClick={() => handleUpdate({ 
                      droppedCeiling: { 
                        enabled: true,
                        position: spaceInfo.droppedCeiling?.position || 'left',
                        width: spaceInfo.droppedCeiling?.width || 900,
                        dropHeight: spaceInfo.droppedCeiling?.dropHeight || 300
                      } 
                    })}
                  >
                    있음
                  </button>
                </div>
              </div>

              {/* 단내림 위치 - 단내림이 활성화된 경우에만 표시 */}
              {spaceInfo.droppedCeiling?.enabled && (
                <div className={styles.compactSection}>
                  <label className={styles.compactLabel}>위치</label>
                  <div className={styles.toggleButtons}>
                    <button
                      className={`${styles.toggleButton} ${spaceInfo.droppedCeiling?.position === 'left' ? styles.active : ''}`}
                      onClick={() => handleUpdate({ 
                        droppedCeiling: { 
                          ...spaceInfo.droppedCeiling,
                          position: 'left'
                        } 
                      })}
                    >
                      좌측
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
                      우측
                    </button>
                  </div>
                </div>
              )}

              {/* 컬럼수 */}
              <div className={styles.compactSection}>
                <label className={styles.compactLabel}>{spaceInfo.droppedCeiling?.enabled ? '메인 컬럼수' : '컬럼수'}</label>
                {(() => {
                  const internalSpace = calculateInternalSpace(spaceInfo);
                  let internalWidth = internalSpace.width;
                  let maxColumns = 6;
                  
                  if (spaceInfo.droppedCeiling?.enabled) {
                    // 단내림이 활성화되면 메인 구간의 너비 계산
                    const droppedCeilingWidth = spaceInfo.droppedCeiling.width || 900;
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
                  <label className={styles.compactLabel}>단내림 컬럼수</label>
                  {(() => {
                    const droppedCeilingWidth = spaceInfo.droppedCeiling.width || 900;
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

              {/* 프레임 타입 */}
              <SurroundControls
                spaceInfo={spaceInfo}
                onUpdate={handleUpdate}
              />

              {/* 받침대 */}
              <BaseControls
                spaceInfo={spaceInfo}
                onUpdate={handleUpdate}
              />

              {/* 바닥 마감재 */}
              <FloorFinishControls
                spaceInfo={spaceInfo}
                onUpdate={handleUpdate}
              />
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