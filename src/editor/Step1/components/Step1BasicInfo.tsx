import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useProjectStore } from '@/store/core/projectStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { createProject } from '@/services/projectDataService';
import { getCurrentUserAsync } from '@/firebase/auth';
import { serverTimestamp } from 'firebase/firestore';
import { generateDefaultThumbnail, dataURLToBlob } from '@/editor/shared/utils/thumbnailCapture';
import Input from '@/components/common/Input';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import styles from './Step1BasicInfo.module.css';

interface Step1BasicInfoProps {
  onNext: () => void;
  onClose: () => void;
  projectId?: string;
  projectTitle?: string;
}

const Step1BasicInfo: React.FC<Step1BasicInfoProps> = ({ onNext, onClose, projectId: propsProjectId, projectTitle: propsProjectTitle }) => {
  // Store 전체 가져오기
  const projectStore = useProjectStore();
  const { basicInfo, setBasicInfo, projectId: storeProjectId, setProjectId, projectTitle: storeProjectTitle } = projectStore;
  
  // projectId와 projectTitle을 안정적으로 유지
  // 1. 초기값은 store 또는 props에서 가져옴
  // 2. ref로 저장하여 리렌더링 시에도 유지
  const projectIdRef = useRef<string | null>(null);
  const projectTitleRef = useRef<string | null>(null);
  
  // 최초 마운트 시 한 번만 초기값 설정
  useEffect(() => {
    if (!projectIdRef.current) {
      projectIdRef.current = storeProjectId || propsProjectId || null;
    }
    if (!projectTitleRef.current) {
      projectTitleRef.current = storeProjectTitle || propsProjectTitle || null;
    }
  }, []); // 빈 dependency로 최초 한 번만 실행
  
  // store가 업데이트되면 ref도 업데이트 (store가 우선순위)
  useEffect(() => {
    if (storeProjectId) {
      projectIdRef.current = storeProjectId;
    }
    if (storeProjectTitle) {
      projectTitleRef.current = storeProjectTitle;
    }
  }, [storeProjectId, storeProjectTitle]);
  
  // 최종 사용할 값 - ref를 우선 사용하되, 없으면 store/props 순서로 fallback
  const projectId = useMemo(() => 
    projectIdRef.current || storeProjectId || propsProjectId || null,
    [storeProjectId, propsProjectId, projectIdRef.current]
  );
  
  const projectTitle = useMemo(() => 
    projectTitleRef.current || storeProjectTitle || propsProjectTitle || null,
    [storeProjectTitle, propsProjectTitle, projectTitleRef.current]
  );
  
  // 컴포넌트가 마운트될 때와 리렌더링될 때 로그
  useEffect(() => {
    console.log('🔥 Step1BasicInfo 마운트/업데이트:', {
      propsProjectId,
      storeProjectId,
      refProjectId: projectIdRef.current,
      finalProjectId: projectId,
      storeProjectTitle,
      refProjectTitle: projectTitleRef.current,
      finalProjectTitle: projectTitle,
      basicInfo
    });
  });
  
  const { spaceInfo, setSpaceInfo } = useSpaceConfigStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hasFloorFinish, setHasFloorFinish] = useState(spaceInfo.hasFloorFinish || false);
  const [floorFinishHeight, setFloorFinishHeight] = useState(spaceInfo.floorFinish?.height || 10);
  const [saving, setSaving] = useState(false);
  
  const locationOptions = ['안방', '거실', '아이방', '옷방', '창고'];

  const canProceed = basicInfo.title && basicInfo.title.trim() && basicInfo.location && basicInfo.location.trim();

  const handleUpdate = (updates: Partial<typeof basicInfo>) => {
    setBasicInfo({ ...basicInfo, ...updates });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLocationSelect = (location: string) => {
    handleUpdate({ location });
    setShowDropdown(false);
  };

  const handleFloorFinishToggle = () => {
    const newHasFloorFinish = !hasFloorFinish;
    setHasFloorFinish(newHasFloorFinish);
    setSpaceInfo({
      ...spaceInfo,
      hasFloorFinish: newHasFloorFinish,
      floorFinish: newHasFloorFinish ? {
        type: 'wood',
        thickness: 5,
        height: floorFinishHeight
      } : null
    });
  };

  const handleFloorFinishHeightChange = (height: number) => {
    setFloorFinishHeight(height);
    if (hasFloorFinish) {
      setSpaceInfo({
        ...spaceInfo,
        floorFinish: {
          type: 'wood',
          thickness: 5,
          height: height
        }
      });
    }
  };

  return (
    <div className={styles.container} data-theme="light" style={{ colorScheme: 'light' }}>
      {/* 로딩 화면 */}
      {saving && (
        <div className={styles.loadingOverlay}>
          <LoadingSpinner 
            message="프로젝트 생성 중..."
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
              STEP. 1 디자인 정보
              {projectId && projectTitle && (
                <span style={{ marginLeft: '20px', fontSize: '0.8em', color: '#666' }}>
                  프로젝트: {projectTitle}
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.leftSection}>
            <div className={styles.iconContainer}>
              <div className={styles.stepIcon}>
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className={styles.stepIconSvg}>
                  <circle cx="60" cy="60" r="60" className={styles.iconBackground}/>
                  <rect x="30" y="35" width="60" height="50" rx="4" className={styles.iconPaper}/>
                  <rect x="35" y="45" width="30" height="2" className={styles.iconAccent}/>
                  <rect x="35" y="50" width="40" height="2" className={styles.iconAccent}/>
                  <rect x="35" y="55" width="25" height="2" className={styles.iconAccent}/>
                  <rect x="35" y="65" width="35" height="2" className={styles.iconAccent}/>
                  <rect x="35" y="70" width="20" height="2" className={styles.iconAccent}/>
                  <circle cx="75" cy="65" r="8" className={styles.iconAccent}/>
                  <path d="M71 65l2 2 4-4" stroke="white" strokeWidth="2" fill="none"/>
                  <rect x="82" y="40" width="8" height="25" rx="1" className={styles.iconPaper}/>
                  <rect x="84" y="35" width="4" height="8" rx="2" className={styles.iconPaper}/>
                </svg>
              </div>
              <div className={styles.stepInfo}>
                <span className={styles.stepNumber}>1 단계 / 3</span>
              </div>
            </div>
          </div>

          <div className={styles.rightSection}>
            <div className={styles.formSection}>
              <h2>정보</h2>
              <div className={styles.form}>
                <div className={styles.inputGroup}>
                  <label className={styles.fieldLabel}>
                    {basicInfo.title && basicInfo.title.trim() && (
                      <span className={styles.checkIcon}>✓</span>
                    )}
                    {/* projectId가 있으면 항상 디자인파일 명으로 표시 */}
                    {projectId ? '디자인파일 명' : '프로젝트 제목'}
                  </label>
                  <Input
                    placeholder={projectId ? "디자인파일 명을 입력해주세요" : "프로젝트 제목을 입력해주세요"}
                    value={basicInfo.title || ''}
                    onChange={(e) => handleUpdate({ title: e.target.value })}
                    fullWidth
                    size="medium"
                  />
                </div>
                
                <div className={styles.inputGroup}>
                  <label className={styles.fieldLabel}>
                    {basicInfo.location && basicInfo.location.trim() && (
                      <span className={styles.checkIcon}>✓</span>
                    )}
                    설치 위치
                  </label>
                  <div className={styles.inputWrapper} ref={dropdownRef}>
                    <Input
                      placeholder="설치 위치를 선택하거나 입력해주세요"
                      value={basicInfo.location || ''}
                      onChange={(e) => handleUpdate({ location: e.target.value })}
                      onFocus={() => setShowDropdown(true)}
                      fullWidth
                      size="medium"
                    />
                    <button
                      type="button"
                      className={styles.dropdownToggle}
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {showDropdown && (
                      <div className={styles.dropdown}>
                        {locationOptions.map((option) => (
                          <button
                            key={option}
                            className={styles.dropdownOption}
                            onClick={() => handleLocationSelect(option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 바닥 마감재 섹션 제거 (Step2에서 설정) */}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button
            className={styles.nextButton}
            onClick={async () => {
              console.log('🔥 다음 단계 버튼 클릭, projectId:', projectId);
              if (!projectId) {
                console.log('⚠️ projectId가 없어서 새 프로젝트 생성 시도');
                // 프로젝트가 없으면 생성
                setSaving(true);
                try {
                  const user = await getCurrentUserAsync();
                  if (!user) {
                    alert('로그인이 필요합니다.');
                    setSaving(false);
                    return;
                  }

                  // 기본 썸네일 생성 (현재 spaceInfo를 기반으로)
                  let thumbnailBlob: Blob | undefined;
                  try {
                    const thumbnail = generateDefaultThumbnail(spaceInfo, 0);
                    thumbnailBlob = dataURLToBlob(thumbnail);
                    console.log('📸 Step1 - 기본 썸네일 생성 성공');
                  } catch (thumbnailError) {
                    console.error('📸 Step1 - 썸네일 생성 실패:', thumbnailError);
                    thumbnailBlob = undefined;
                  }

                  const currentTimestamp = serverTimestamp();
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
                        type: 'wall',
                        completed: false
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

                  const result = await createProject(projectData, thumbnailBlob);
                  
                  if (result.success && result.data) {
                    setProjectId(result.data); // 프로젝트 ID 저장
                    console.log('프로젝트 생성 완료:', result.data);
                    onNext();
                  } else {
                    alert(`프로젝트 생성 실패: ${result.error || '알 수 없는 오류'}`);
                  }
                } catch (error) {
                  console.error('프로젝트 생성 오류:', error);
                  alert('프로젝트 생성 중 오류가 발생했습니다.');
                } finally {
                  setSaving(false);
                }
              } else {
                // 이미 프로젝트가 있으면 다음 단계로
                console.log('✅ projectId가 있어서 다음 단계로 이동:', projectId);
                onNext();
              }
            }}
            disabled={!canProceed || saving}
          >
            {saving ? '저장 중...' : '다음 단계'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Step1BasicInfo;