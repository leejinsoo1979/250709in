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
import styles from './Step3Confirmation.module.css';

interface Step3ConfirmationProps {
  onPrevious: () => void;
  onClose: () => void;
}

const Step3Confirmation: React.FC<Step3ConfirmationProps> = ({ onPrevious, onClose }) => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('3D');
  const [viewerKey, setViewerKey] = useState(0);
  const [customOptions, setCustomOptions] = useState({
    wallType: 'nowall',  // 노서라운드(타이트)가 기본값 - 'nowall' maps to tight
    rackThickness: '2mm',
    motorSettings: '10',  // 서라운드일 때 사용될 기본값
    ventilationSettings: 'yes',  // 받침대 있음이 기본값
    ventThickness: '300',
    placement: 'floor',  // 바닥에 배치가 기본값
    baseHeight: '65',  // 받침대 높이 기본값 65mm
    leftFrameSize: '50',  // 좌측 프레임 크기
    rightFrameSize: '50'  // 우측 프레임 크기
  });
  
  const { basicInfo } = useProjectStore();
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const { placedModules } = useFurnitureStore();
  
  // 디버깅용 로그
  console.log('🔍 Step3 - basicInfo 상태:', basicInfo);
  console.log('🔍 Step3 - spaceInfo 상태:', spaceInfo);

  // 컴포넌트 마운트 시 초기 설정 적용
  useEffect(() => {
    // 노서라운드가 기본값이므로 초기 설정 적용
    const initialUpdates: Partial<typeof spaceInfo> = {
      surroundType: 'no-surround',
      frameSize: { left: 0, right: 0, top: 0 },
      gapConfig: {
        left: spaceInfo.installType === 'builtin' ? 2 : 
              (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left) ? 2 : 20,
        right: spaceInfo.installType === 'builtin' ? 2 : 
               (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right) ? 2 : 20
      },
      baseConfig: {
        type: 'floor' as const,
        height: 65,
        placementType: 'floor' as const
      }
    };
    
    setSpaceInfo({ ...spaceInfo, ...initialUpdates });
  }, []); // 마운트 시 한 번만 실행

  // 설치 유형 변경 시 프레임 설정 자동 업데이트
  useEffect(() => {
    if (customOptions.wallType === 'nowall') {
      // 노서라운드: 벽 유무에 따라 이격거리/엔드패널 설정
      const updates: Partial<typeof spaceInfo> = {
        gapConfig: {
          left: spaceInfo.installType === 'builtin' ? 2 : 
                (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left) ? 2 : 20,
          right: spaceInfo.installType === 'builtin' ? 2 : 
                 (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right) ? 2 : 20
        }
      };
      setSpaceInfo({ ...spaceInfo, ...updates });
    }
  }, [spaceInfo.installType, spaceInfo.wallConfig]); // 설치 유형이나 벽 설정 변경 시

  const handleCustomOptionUpdate = (key: string, value: string) => {
    setCustomOptions(prev => ({ ...prev, [key]: value }));
    
    // customOptions 변경사항을 spaceInfo에도 반영
    const updates: Partial<typeof spaceInfo> = {};
    
    switch (key) {
      case 'wallType':
        updates.surroundType = value === 'nowall' ? 'no-surround' : 'surround';
        // 노서라운드/서라운드에 따라 frameSize 즉시 업데이트
        if (value === 'nowall') {
          // 노서라운드: 프레임 없음
          updates.frameSize = { left: 0, right: 0, top: 0 };
          // 벽 유무에 따라 이격거리/엔드패널 설정
          updates.gapConfig = {
            left: spaceInfo.installType === 'builtin' ? 2 : 
                  (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left) ? 2 : 20,
            right: spaceInfo.installType === 'builtin' ? 2 : 
                   (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right) ? 2 : 20
          };
        } else {
          // 서라운드: 설치 유형에 따라 프레임/엔드패널 설정
          let leftSize = 50;
          let rightSize = 50;
          
          if (spaceInfo.installType === 'semistanding') {
            if (!spaceInfo.wallConfig?.left) leftSize = 20;  // 좌측벽 없음: 엔드패널
            if (!spaceInfo.wallConfig?.right) rightSize = 20; // 우측벽 없음: 엔드패널
          } else if (spaceInfo.installType === 'freestanding') {
            leftSize = 20;  // 양쪽 모두 엔드패널
            rightSize = 20;
          }
          
          // customOptions도 업데이트
          setCustomOptions(prev => ({
            ...prev,
            leftFrameSize: leftSize.toString(),
            rightFrameSize: rightSize.toString()
          }));
          
          updates.frameSize = {
            left: leftSize,
            right: rightSize,
            top: parseInt(customOptions.motorSettings) || 10
          };
          updates.gapConfig = { left: 0, right: 0 };
        }
        break;
      case 'rackThickness':
        // 이격거리 설정 (노서라운드일 때만 의미있음)
        if (customOptions.wallType === 'nowall') {
          const gapDistance = parseInt(value) || 2;
          updates.gapConfig = {
            left: spaceInfo.installType === 'builtin' ? gapDistance : 
                  (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left) ? gapDistance : 20,
            right: spaceInfo.installType === 'builtin' ? gapDistance : 
                   (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right) ? gapDistance : 20
          };
        }
        break;
      case 'motorSettings':
        if (customOptions.wallType !== 'nowall') {
          updates.frameSize = {
            ...spaceInfo.frameSize,
            top: parseInt(value) || 10
          };
        }
        break;
      case 'ventilationSettings':
        // 받침대 설정
        break;
      case 'baseHeight':
        // 받침대 높이 설정
        updates.baseConfig = {
          ...spaceInfo.baseConfig,
          height: parseInt(value) || 65
        };
        break;
      case 'ventThickness':
        updates.baseConfig = {
          ...spaceInfo.baseConfig,
          height: parseInt(value) || 300
        };
        break;
      case 'leftFrameSize':
      case 'rightFrameSize':
        if (customOptions.wallType !== 'nowall') {
          updates.frameSize = {
            ...spaceInfo.frameSize,
            left: key === 'leftFrameSize' ? parseInt(value) || 50 : parseInt(customOptions.leftFrameSize) || 50,
            right: key === 'rightFrameSize' ? parseInt(value) || 50 : parseInt(customOptions.rightFrameSize) || 50,
            top: spaceInfo.frameSize?.top || 10
          };
        }
        break;
    }
    
    if (Object.keys(updates).length > 0) {
      setSpaceInfo({ ...spaceInfo, ...updates });
    }
    
    // 뷰어 강제 리렌더링
    setViewerKey(prev => prev + 1);
  };

  // 모든 설정 변경 시 뷰어에 반영
  useEffect(() => {
    setViewerKey(prev => prev + 1);
  }, [spaceInfo, customOptions]);

  const handleComplete = async () => {
    console.log('🚀 Step3 handleComplete 시작');
    console.log('📋 Current customOptions:', customOptions);
    console.log('📋 Current spaceInfo:', spaceInfo);
    console.log('📋 Current basicInfo:', basicInfo);
    setSaving(true);
    
    try {
      // 현재 사용자 확인
      const user = await getCurrentUserAsync();
      if (!user) {
        console.error('❌ 사용자 로그인 필요');
        alert('로그인이 필요합니다.');
        setSaving(false);
        return;
      }
      
      console.log('✅ 사용자 인증 완료:', user.uid);
      
      // 필수 데이터 검증 - 기본값 제공
      const projectTitle = basicInfo.title || '새 프로젝트';
      const projectLocation = basicInfo.location || '미지정';
      
      console.log('📝 프로젝트 정보:', { 
        originalTitle: basicInfo.title, 
        originalLocation: basicInfo.location,
        finalTitle: projectTitle,
        finalLocation: projectLocation
      });
      
      if (!spaceInfo.width || !spaceInfo.height || !spaceInfo.depth) {
        console.error('❌ 공간 정보 누락:', { width: spaceInfo.width, height: spaceInfo.height, depth: spaceInfo.depth });
        alert('공간 치수 정보를 입력해주세요.');
        setSaving(false);
        return;
      }

      // Step1-3 데이터를 CreateProjectData 구조로 변환
      const now = serverTimestamp() as Timestamp;
      
      const createProjectData = {
        userId: user.uid,
        basicInfo: {
          title: projectTitle,
          location: projectLocation,
          createdAt: now,
          updatedAt: now,
          version: '1.0.0',
        },
        spaceConfig: {
          dimensions: {
            width: spaceInfo.width || 4800,
            height: spaceInfo.height || 2400,
            depth: spaceInfo.depth || 1500,
          },
          installType: spaceInfo.installType || 'builtin',
          wallPosition: spaceInfo.wallPosition || 'back',
          damper: {
            agentPosition: 'none' as const,
            size: {
              width: 900,
              height: 200,
            },
          },
          floorFinish: {
            enabled: spaceInfo.hasFloorFinish || false,
            height: spaceInfo.floorFinish?.height || 10,
          },
        },
        customLayout: {
          wall: {
            type: customOptions.wallType === 'tight' ? 'nowall' as const : 'wall' as const,
            completed: true,
          },
          rack: {
            thickness: customOptions.rackThickness || '2mm',
            completed: true,
            options: {
              isComposite: false,
            },
          },
          motor: {
            topHeight: parseInt(customOptions.motorSettings) || 50,
            completed: true,
          },
          ventilation: {
            type: customOptions.ventilationSettings || 'no',
            completed: true,
          },
          exhaust: {
            height: customOptions.ventilationSettings === 'yes' 
              ? parseInt(customOptions.baseHeight) || 65  // 받침대 있음: baseHeight 사용
              : parseInt(customOptions.ventThickness) || 300,  // 받침대 없음 + 띄워서: ventThickness 사용
            completed: true,
            fromFloor: true,
          },
        },
      };

      console.log('🔄 Step3에서 새 프로젝트 생성 시작:', {
        basicInfo: createProjectData.basicInfo,
        spaceConfig: createProjectData.spaceConfig,
        customLayout: createProjectData.customLayout
      });
      
      // 프로젝트 데이터 검증
      console.log('🔍 프로젝트 데이터 검증:', {
        wallType: createProjectData.customLayout.wall.type,
        expectedTypes: ['nowall', 'wall'],
        isValidWallType: ['nowall', 'wall'].includes(createProjectData.customLayout.wall.type)
      });

      // 썸네일 생성 스킵 (나중에 백그라운드에서 처리)
      console.log('📸 썸네일 생성 스킵 - 속도 개선을 위해');
      
      // 새 프로젝트 생성 (썸네일 없이 - 빠른 저장 모드)
      const result = await createProject(createProjectData, undefined, { skipThumbnail: true });

      if (!result.success || !result.data) {
        console.error('❌ 프로젝트 생성 실패:', result.error);
        alert('프로젝트 생성 중 오류가 발생했습니다: ' + (result.error || '알 수 없는 오류'));
        setSaving(false);
        return;
      }

      const projectId = result.data;
      console.log('✅ 프로젝트 생성 성공:', projectId);
      
      // 프로젝트 ID 유효성 검증
      if (!projectId || typeof projectId !== 'string') {
        console.error('❌ 유효하지 않은 프로젝트 ID:', projectId);
        alert('프로젝트 ID가 유효하지 않습니다.');
        setSaving(false);
        return;
      }

      // 디자인 파일 생성을 비동기로 처리 (백그라운드에서 진행)
      console.log('🎨 기본 디자인 파일 생성을 백그라운드에서 시작');
      const designFilePromise = createDesignFile({
        name: '기본 디자인',
        projectId: projectId,
        spaceConfig: {
          width: spaceInfo.width || 4800,
          height: spaceInfo.height || 2400,
          depth: spaceInfo.depth || 1500,
          installType: spaceInfo.installType || 'builtin',
          wallPosition: spaceInfo.wallPosition || 'back',
          hasFloorFinish: spaceInfo.hasFloorFinish || false,
          floorFinish: spaceInfo.floorFinish || null,
          surroundType: customOptions.wallType === 'nowall' ? 'no-surround' : 'surround',
          frameSize: customOptions.wallType === 'nowall' 
            ? { left: 0, right: 0, top: 0 }  // 노서라운드일 때는 프레임 없음
            : { left: 50, right: 50, top: parseInt(customOptions.motorSettings) || 10 },  // 서라운드일 때만 프레임
          baseConfig: {
            type: 'floor' as const,
            height: customOptions.ventilationSettings === 'yes' 
              ? parseInt(customOptions.baseHeight) || 65  // 받침대 있음: baseHeight 사용
              : parseInt(customOptions.ventThickness) || 300,  // 받침대 없음 + 띄워서: ventThickness 사용
            placementType: customOptions.placement || 'floor' as const
          },
          materialConfig: {
            interiorColor: '#FFFFFF',
            doorColor: '#E0E0E0' // Changed from #FFFFFF to light gray
          },
          columns: [],
          wallConfig: {
            left: true,
            right: true
          },
          gapConfig: {
            left: 0,
            right: 0
          }
        },
        furniture: {
          placedModules: []
        }
      }).then(result => {
        if (result.error) {
          console.warn('⚠️ 기본 디자인 파일 생성 실패:', result.error);
        } else {
          console.log('✅ 기본 디자인 파일 생성 성공:', result.id);
        }
      }).catch(error => {
        console.warn('⚠️ 기본 디자인 파일 생성 중 예외:', error);
      });

      // 다른 창(대시보드)에 프로젝트 업데이트 알림
      try {
        const channel = new BroadcastChannel('project-updates');
        channel.postMessage({ 
          type: 'PROJECT_CREATED', 
          projectId: projectId,
          timestamp: Date.now()
        });
        console.log('📡 다른 창에 프로젝트 생성 알림 전송 (Step3)');
      } catch (error) {
        console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
      }

      setSaving(false);

      // Configurator로 이동
      console.log('🚀 Step3 navigate 호출 직전:', {
        projectId,
        currentUrl: window.location.href,
        targetUrl: `/configurator?projectId=${projectId}`
      });
      
      // 스토어에 데이터 미리 설정 (Configurator에서 중복 로드 방지)
      const { setBasicInfo } = useProjectStore.getState();
      const { setSpaceInfo } = useSpaceConfigStore.getState();
      const { setPlacedModules } = useFurnitureStore.getState();
      
      // 생성한 데이터를 스토어에 미리 설정
      setBasicInfo(createProjectData.basicInfo);
      setSpaceInfo({
        ...spaceInfo,
        surroundType: customOptions.wallType === 'nowall' ? 'no-surround' : 'surround',
        frameSize: customOptions.wallType === 'nowall' 
          ? { left: 0, right: 0, top: 0 }  // 노서라운드일 때는 프레임 없음
          : { left: 50, right: 50, top: parseInt(customOptions.motorSettings) || 10 },  // 서라운드일 때만 프레임
        gapConfig: customOptions.wallType === 'nowall' 
          ? {
              // 노서라운드인 경우 벽 유무에 따라 이격거리/엔드패널 설정
              left: spaceInfo.installType === 'builtin' ? 2 : 
                    (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left) ? 2 : 20,
              right: spaceInfo.installType === 'builtin' ? 2 : 
                     (spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right) ? 2 : 20
            }
          : { left: 0, right: 0 },
        baseConfig: {
          type: 'floor' as const,
          height: customOptions.ventilationSettings === 'yes' 
            ? parseInt(customOptions.baseHeight) || 65  // 받침대 있음: baseHeight 사용
            : parseInt(customOptions.ventThickness) || 300,  // 받침대 없음 + 띄워서: ventThickness 사용
          placementType: customOptions.placement || 'floor' as const
        },
        materialConfig: {
          interiorColor: '#FFFFFF',
          doorColor: '#E0E0E0' // Changed from #FFFFFF to light gray
        },
        columns: [],
        wallConfig: {
          left: true,
          right: true
        },
        gapConfig: {
          left: 0,
          right: 0
        }
      });
      setPlacedModules([]);
      
      // 네비게이션 실행
      console.log('🚀 Step3 navigate 실행 중...', {
        projectId,
        navigationUrl: `/configurator?projectId=${projectId}&skipLoad=true`,
        currentLocation: window.location.href
      });
      
      try {
        // skipLoad 파라미터 추가하여 중복 로드 방지
        navigate(`/configurator?projectId=${projectId}&skipLoad=true`);
        console.log('✅ Step3 navigate 호출 성공');
      } catch (navError) {
        console.error('❌ Step3 navigate 실행 실패:', navError);
        alert('에디터로 이동하는 중 오류가 발생했습니다.');
        return;
      }
      
      // 네비게이션 후 확인
      setTimeout(() => {
        console.log('🚀 Step3 navigate 호출 후 상태:', {
          currentUrl: window.location.href,
          expectedUrl: `/configurator?projectId=${projectId}`,
          didNavigate: window.location.href.includes(`projectId=${projectId}`)
        });
        
        if (!window.location.href.includes(`projectId=${projectId}`)) {
          console.error('❌ 네비게이션이 실행되지 않았습니다!');
          alert('에디터로 이동에 실패했습니다. 수동으로 이동해보세요.');
        }
      }, 500);
    } catch (error) {
      console.error('❌ 프로젝트 완료 실패:', error);
      alert(`프로젝트 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      setSaving(false);
    }
  };

  // 로딩 중일 때 로딩 화면 표시
  if (saving) {
    return (
      <div className={styles.container}>
        <div className={styles.modalContent}>
          <LoadingSpinner 
            message="디자인을 생성하고 있습니다..."
            size="large"
            type="spinner"
          />
          <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '14px', opacity: 0.7 }}>
            3D 환경을 준비하는 중입니다...
          </p>
        </div>
      </div>
    );
  }

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
            <h1>STEP. 3 프레임 설정</h1>
            <p>설정한 내용을 확인하고 디자인을 시작해보세요.</p>
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
                spaceInfo={spaceInfo}
                viewMode={viewMode}
                renderMode="solid"
                showAll={true}
                showDimensions={true}
                showFrame={true}
                isEmbedded={true}
                setViewMode={(mode) => setViewMode(mode)}
              />
            </div>
          </div>

          <div className={styles.rightSection}>
            <div className={styles.confirmationSection}>
              <h2 className={styles.sectionTitle}>옷장 배치 설정</h2>
              
              {/* 맞춤 옵션 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>맞춤 옵션</label>
                <div className={styles.buttonGroup}>
                  <button 
                    className={`${styles.typeButton} ${customOptions.wallType === 'nowall' ? styles.active : ''}`}
                    onClick={() => handleCustomOptionUpdate('wallType', 'nowall')}
                  >
                    노서라운드 (타이트)
                  </button>
                  <button 
                    className={`${styles.typeButton} ${customOptions.wallType === 'wall' ? styles.active : ''}`}
                    onClick={() => handleCustomOptionUpdate('wallType', 'wall')}
                  >
                    서라운드 (일반)
                  </button>
                </div>
              </div>

              {/* 프레임 설정 - 서라운드 선택시에만 표시 */}
              {customOptions.wallType === 'wall' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>프레임 설정</label>
                  <div className={styles.inputRow}>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>
                        {spaceInfo.installType === 'builtin' ? '좌측 프레임' : 
                         spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left ? '좌측 프레임' :
                         spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left ? '좌측 엔드패널' :
                         spaceInfo.installType === 'freestanding' ? '좌측 엔드패널' : '좌측'} (mm)
                      </label>
                      <input 
                        type="number"
                        className={styles.numberInput}
                        value={customOptions.leftFrameSize}
                        onChange={(e) => {
                          if ((spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left) || 
                              spaceInfo.installType === 'builtin') {
                            handleCustomOptionUpdate('leftFrameSize', e.target.value);
                          }
                        }}
                        disabled={
                          (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.left) || 
                          spaceInfo.installType === 'freestanding'
                        }
                        placeholder="50"
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>
                        {spaceInfo.installType === 'builtin' ? '우측 프레임' : 
                         spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right ? '우측 프레임' :
                         spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right ? '우측 엔드패널' :
                         spaceInfo.installType === 'freestanding' ? '우측 엔드패널' : '우측'} (mm)
                      </label>
                      <input 
                        type="number"
                        className={styles.numberInput}
                        value={customOptions.rightFrameSize}
                        onChange={(e) => {
                          if ((spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right) || 
                              spaceInfo.installType === 'builtin') {
                            handleCustomOptionUpdate('rightFrameSize', e.target.value);
                          }
                        }}
                        disabled={
                          (spaceInfo.installType === 'semistanding' && !spaceInfo.wallConfig?.right) || 
                          spaceInfo.installType === 'freestanding'
                        }
                        placeholder="50"
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>상단 프레임 (mm)</label>
                      <input 
                        type="number"
                        className={styles.numberInput}
                        value={customOptions.motorSettings}
                        onChange={(e) => handleCustomOptionUpdate('motorSettings', e.target.value)}
                        placeholder="10"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 이격거리 설정 - 노서라운드 선택시에만 표시 */}
              {customOptions.wallType === 'nowall' && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>이격거리 설정</label>
                  <p className={styles.description}>
                    노서라운드 옵션 선택 시 이격거리를 선택해주세요:
                    {spaceInfo.installType === 'builtin' && ' (양쪽벽: 양쪽 모두 이격거리)'}
                    {spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.left && ' (좌측벽: 좌측 이격거리, 우측 20mm 엔드패널)'}
                    {spaceInfo.installType === 'semistanding' && spaceInfo.wallConfig?.right && ' (우측벽: 우측 이격거리, 좌측 20mm 엔드패널)'}
                    {spaceInfo.installType === 'freestanding' && ' (벽없음: 양쪽 모두 20mm 엔드패널)'}
                  </p>
                  <div className={styles.buttonGroup}>
                    <button 
                      className={`${styles.typeButton} ${customOptions.rackThickness === '2mm' ? styles.active : ''}`}
                      onClick={() => handleCustomOptionUpdate('rackThickness', '2mm')}
                    >
                      2mm
                    </button>
                    <button 
                      className={`${styles.typeButton} ${customOptions.rackThickness === '3mm' ? styles.active : ''}`}
                      onClick={() => handleCustomOptionUpdate('rackThickness', '3mm')}
                    >
                      3mm
                    </button>
                  </div>
                </div>
              )}

              {/* 받침대 설정 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>받침대 설정</label>
                <div className={styles.buttonGroup}>
                  <button 
                    className={`${styles.typeButton} ${customOptions.ventilationSettings === 'yes' ? styles.active : ''}`}
                    onClick={() => handleCustomOptionUpdate('ventilationSettings', 'yes')}
                  >
                    받침대 있음
                  </button>
                  <button 
                    className={`${styles.typeButton} ${customOptions.ventilationSettings === 'no' ? styles.active : ''}`}
                    onClick={() => handleCustomOptionUpdate('ventilationSettings', 'no')}
                  >
                    받침대 없음
                  </button>
                </div>
                {/* 받침대 있음 선택 시 높이 입력 필드 */}
                {customOptions.ventilationSettings === 'yes' && (
                  <>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>받침대 높이 (mm)</label>
                      <input 
                        type="number"
                        className={styles.numberInput}
                        value={customOptions.baseHeight}
                        onChange={(e) => handleCustomOptionUpdate('baseHeight', e.target.value)}
                        placeholder="65"
                        style={{ width: '100px' }}
                      />
                    </div>
                    <p className={styles.helpText}>바닥으로부터 받침대의 높이입니다. (기본값: 65mm)</p>
                  </>
                )}
              </div>

              {/* 배치 설정 - 받침대 없음 선택시에만 표시 */}
              {customOptions.ventilationSettings === 'no' && (
                <div className={styles.formGroup}>
                <label className={styles.formLabel}>배치 설정</label>
                <div className={styles.buttonGroup}>
                  <button 
                    className={`${styles.typeButton} ${customOptions.placement === 'floor' ? styles.active : ''}`}
                    onClick={() => handleCustomOptionUpdate('placement', 'floor')}
                  >
                    바닥에 배치
                  </button>
                  <button 
                    className={`${styles.typeButton} ${customOptions.placement === 'floating' ? styles.active : ''}`}
                    onClick={() => handleCustomOptionUpdate('placement', 'floating')}
                  >
                    띄워서 배치
                  </button>
                </div>
                {customOptions.placement === 'floating' && (
                  <div className={styles.subSetting}>
                    <div className={styles.inputGroup}>
                      <label className={styles.inputLabel}>띄움 높이 (mm)</label>
                      <input 
                        type="number"
                        className={styles.numberInput}
                        value={customOptions.ventThickness}
                        onChange={(e) => handleCustomOptionUpdate('ventThickness', e.target.value)}
                        placeholder="300"
                      />
                    </div>
                    <p className={styles.helpText}>바닥으로부터 옷장이 띄워지는 높이입니다.</p>
                  </div>
                )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.previousButton}
            onClick={onPrevious}
            disabled={saving}
          >
            &lt; 이전
          </button>
          <button
            className={styles.completeButton}
            onClick={handleComplete}
            disabled={saving}
          >
            {saving ? '디자인 생성 중...' : '디자인 생성'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step3Confirmation;