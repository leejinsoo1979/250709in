import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './style.module.css';
import Button from '@/components/common/Button';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { 
  BasicInfoControls, 
  WidthControl,
  HeightControl,
  // DepthControl, // 공간 깊이는 780mm로 고정 (개별 가구에서만 조정 가능)
  InstallTypeControls 
} from '@/editor/shared/controls';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getProject, updateProject } from '@/firebase/projects';
import { generateDefaultThumbnail } from '@/editor/shared/utils/thumbnailCapture';

// 개발 환경 체크
const isDevelopment = import.meta.env.DEV;

const Step0: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  const { 
    basicInfo, 
    setBasicInfo,
    resetAll: resetProject
  } = useProjectStore();
  
  const { 
    spaceInfo,
    setSpaceInfo,
    resetAll: resetSpaceConfig
  } = useSpaceConfigStore();

  const { 
    clearAllModules,
    setPlacedModules,
    placedModules
  } = useFurnitureStore();



  // 프로젝트 데이터 로드
  const loadProject = async (projectId: string) => {
    setLoading(true);
    try {
      const { project, error } = await getProject(projectId);
      if (error) {
        console.error('프로젝트 로드 에러:', error);
        alert('프로젝트를 불러오는데 실패했습니다: ' + error);
        navigate('/'); // 홈으로 돌아가기
        return;
      }

      if (project) {
        // Store에 데이터 설정
        setBasicInfo(project.projectData);
        setSpaceInfo(project.spaceConfig);
        setPlacedModules(project.furniture.placedModules);
        setCurrentProjectId(projectId);
        console.log('✅ 프로젝트 로드 성공:', project.title);
        console.log('🎨 로드된 materialConfig:', project.spaceConfig.materialConfig);
      }
    } catch (error) {
      console.error('프로젝트 로드 실패:', error);
      alert('프로젝트 로드 중 오류가 발생했습니다.');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // Step0 컴포넌트 마운트 시 처리
  useEffect(() => {
    const projectId = searchParams.get('projectId');
    
    if (projectId) {
      // URL에 프로젝트 ID가 있으면 해당 프로젝트 로드
      loadProject(projectId);
    } else {
      // 새 프로젝트 시작 - 모든 데이터 초기화
      resetProject();
      resetSpaceConfig();
      clearAllModules();
      setCurrentProjectId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);



  const handleBasicInfoUpdate = (updates: Partial<typeof basicInfo>) => {
    setBasicInfo(updates);
  };

  const handleSpaceInfoUpdate = (updates: Partial<typeof spaceInfo>) => {
    setSpaceInfo(updates);
  };

  const handleNext = async () => {
    if (basicInfo.title && basicInfo.location) {
      // 현재 프로젝트가 있으면 저장 후 이동
      if (currentProjectId) {
        setSaving(true);
        try {
          // 기본 썸네일 생성
          const thumbnail = generateDefaultThumbnail(spaceInfo, placedModules.length);
          
          const { error } = await updateProject(currentProjectId, {
            title: basicInfo.title,
            projectData: basicInfo,
            spaceConfig: spaceInfo,
            furniture: {
              placedModules: placedModules
            }
          }, thumbnail);

          if (error) {
            console.error('프로젝트 저장 에러:', error);
            alert('프로젝트 저장에 실패했습니다: ' + error);
            setSaving(false);
            return;
          }
          
          console.log('✅ 프로젝트 저장 후 Configurator로 이동');
          
          // 다른 창(대시보드)에 프로젝트 업데이트 알림
          try {
            const channel = new BroadcastChannel('project-updates');
            channel.postMessage({ 
              type: 'PROJECT_SAVED', 
              projectId: currentProjectId,
              timestamp: Date.now()
            });
            console.log('📡 다른 창에 프로젝트 업데이트 알림 전송 (Step0)');
          } catch (error) {
            console.warn('BroadcastChannel 전송 실패 (무시 가능):', error);
          }
        } catch (error) {
          console.error('프로젝트 저장 실패:', error);
          alert('프로젝트 저장 중 오류가 발생했습니다.');
          setSaving(false);
          return;
        }
        setSaving(false);
      }

      // Configurator로 이동
      const configUrl = currentProjectId 
        ? `/configurator?projectId=${currentProjectId}`
        : '/configurator';
      navigate(configUrl);
    }
  };

  const canProceed = basicInfo.title && basicInfo.location;

  // 로딩 중일 때 표시할 UI
  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSpinner 
          message="프로젝트를 불러오는 중..."
          size="large"
          type="spinner"
        />
        <p className={styles.loadingSubtext}>잠시만 기다려주세요.</p>
      </div>
    );
  }

  return (
    <div 
      className={styles.container}
      data-debug={isDevelopment ? "step0" : undefined}
      data-component="Step0"
    >
      <div 
        className={styles.modalContent}
        data-debug-element="modalContent"
      >
        <div 
          className={styles.header}
          data-debug-element="header"
        >
          
          <div>
            <h1>벽장 제작</h1>
            <p>기본 정보와 공간 크기를 설정해주세요.</p>
          </div>
        </div>

        <div 
          className={styles.content}
          data-debug-element="content"  
        >
          <div 
            className={styles.formSection}
            data-debug-element="formSection"
          >
            

            <div 
              className={styles.form}
              data-debug-element="form"
            >
              <BasicInfoControls 
                basicInfo={basicInfo} 
                onUpdate={handleBasicInfoUpdate}
              />
              
              <div 
                className={styles.spaceSettings}
                data-debug-element="spaceSettings"
              >
                <h3 className={styles.sectionTitle}>공간 정보</h3>
                
                <div className={styles.spaceSizeSection}>
                  <span className={styles.label}>공간 크기</span>
                  
                  {/* 전체 크기 요약 표시 */}
                  <div className={styles.dimensionsSummary}>
                    <span className={styles.summaryText}>
                      {spaceInfo.width} × {spaceInfo.height} mm (깊이: {spaceInfo.depth}mm 고정)
                    </span>
                  </div>
                  
                  <div className={styles.inputGroupTwoColumns}>
                    <WidthControl 
                      spaceInfo={spaceInfo}
                      onUpdate={handleSpaceInfoUpdate}
                    />
                    <HeightControl 
                      spaceInfo={spaceInfo}
                      onUpdate={handleSpaceInfoUpdate}
                    />
                    {/* DepthControl - 공간 깊이는 780mm로 고정, 개별 가구에서만 조정 가능 */}
                  </div>
                </div>
                
                <InstallTypeControls 
                  spaceInfo={spaceInfo}
                  onUpdate={handleSpaceInfoUpdate}
                />
              </div>
            </div>

            <div 
              className={styles.startButtonContainer}
              data-debug-element="startButtonContainer"
            >
              <Button
                variant="primary"
                size="large"
                onClick={handleNext}
                disabled={!canProceed || saving}
                data-debug-element="startButton"
              >
                {saving ? '저장 중...' : '벽장 제작 시작하기'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Step0;
