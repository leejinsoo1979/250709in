/**
 * 에디터에서 작업한 내용을 완벽한 DB 구조로 저장하는 서비스
 */

import {
  ProjectData,
  SpaceConfiguration,
  CustomLayoutConfiguration,
  UpdateProjectData,
  CreateProjectData
} from '@/types/project';
import { DEFAULT_DROPPED_CEILING_VALUES } from '@/store/core/spaceConfigStore';
import { 
  createProject, 
  updateProject, 
  getProject 
} from '@/services/projectDataService';
import { useProjectDataStore } from '@/store/core/projectDataStore';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useProjectStore } from '@/store/core/projectStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { captureProjectThumbnail, generateDefaultThumbnail, dataURLToBlob } from '@/editor/shared/utils/thumbnailCapture';

// ========================
// 타입 정의
// ========================

interface SaveResult {
  success: boolean;
  projectId?: string;
  error?: string;
}

interface EditorData {
  basicInfo: any;
  spaceInfo: any;
  placedModules: any[];
  customOptions?: any;
}

// ========================
// 에디터 데이터를 DB 구조로 변환
// ========================

const convertEditorDataToProjectData = (editorData: EditorData, userId: string): Partial<ProjectData> => {
  const { basicInfo, spaceInfo, placedModules, customOptions } = editorData;

  // STEP 2: 공간 설정 변환
  // spaceInfo를 그대로 전달하되, dimensions 구조로 변환
  const spaceConfig: any = {
    ...spaceInfo,
    dimensions: {
      width: spaceInfo.width || 4800,
      height: spaceInfo.height || 2400,
      depth: spaceInfo.depth || 1500,
    },
    installType: spaceInfo.installType || 'builtin',
    wallPosition: spaceInfo.wallPosition,
    damper: {
      agentPosition: spaceInfo.damperPosition || 'none',
      size: {
        width: spaceInfo.damperWidth || 900,
        height: spaceInfo.damperHeight || 200,
      },
    },
    floorFinish: {
      enabled: spaceInfo.hasFloorFinish || false,
      height: spaceInfo.floorFinish?.height || 10,
    },
    // 기존 필드들 유지
    surroundType: spaceInfo.surroundType,
    // 노서라운드 모드일 때는 frameSize를 0으로 설정
    frameSize: spaceInfo.frameSize || (spaceInfo.surroundType === 'no-surround' 
      ? { left: 0, right: 0, top: 0 } 
      : { left: 50, right: 50, top: 50 }), // undefined 방지
    gapConfig: spaceInfo.gapConfig,
    baseConfig: spaceInfo.baseConfig,
    materialConfig: spaceInfo.materialConfig,
    columns: spaceInfo.columns,
    walls: spaceInfo.walls,
    panelBs: spaceInfo.panelBs,
    droppedCeiling: spaceInfo.droppedCeiling,
    mainDoorCount: spaceInfo.mainDoorCount,
    droppedCeilingDoorCount: spaceInfo.droppedCeilingDoorCount,
    wallConfig: spaceInfo.wallConfig,
  };

  // STEP 3: 맞춤 배치 설정 변환
  const customLayout: CustomLayoutConfiguration = {
    wall: {
      type: customOptions?.wallType || spaceInfo.surroundType === 'surround' ? 'wall' : 'nowall',
      completed: true,
    },
    rack: {
      thickness: customOptions?.rackThickness || '2mm',
      completed: !!customOptions?.rackThickness,
      options: {
        isComposite: false,
      },
    },
    motor: {
      topHeight: customOptions?.motorSettings ? parseInt(customOptions.motorSettings) : (spaceInfo.frameSize?.top || 30),
      completed: !!customOptions?.motorSettings,
    },
    ventilation: {
      type: customOptions?.ventilationSettings || 'no',
      completed: true,
    },
    exhaust: {
      height: customOptions?.ventThickness ? parseInt(customOptions.ventThickness) : (spaceInfo.baseConfig?.height || 300),
      completed: !!customOptions?.ventThickness,
      fromFloor: true,
    },
  };

  return {
    basicInfo: {
      title: basicInfo.title || '새 프로젝트',
      location: basicInfo.location || '',
      description: basicInfo.description,
      version: '1.0.0',
      createdAt: basicInfo.createdAt,
      updatedAt: basicInfo.updatedAt, // Firebase에서 serverTimestamp()로 처리됨
    },
    spaceConfig,
    customLayout,
    metadata: {
      status: 'in_progress',
      priority: 'medium',
      tags: [],
      isFavorite: false,
    },
    stats: {
      designFileCount: 1,
      furnitureCount: placedModules.length,
      completionRate: calculateCompletionRate(spaceConfig, customLayout),
    },
    furniture: {
      placedModules: placedModules || []
    }
  };
};

// ========================
// 완료율 계산
// ========================

const calculateCompletionRate = (
  spaceConfig: SpaceConfiguration,
  customLayout: CustomLayoutConfiguration
): number => {
  let completedItems = 0;
  let totalItems = 0;

  // 기본 정보 확인 (외부에서 체크됨)
  totalItems += 2; // title, location
  completedItems += 2; // 저장 시점에는 이미 완료된 것으로 가정

  // 공간 설정 확인
  totalItems += 3; // width, height, installType
  if (spaceConfig.dimensions.width > 0) completedItems++;
  if (spaceConfig.dimensions.height > 0) completedItems++;
  if (spaceConfig.installType) completedItems++;

  // 맞춤 배치 설정 확인
  totalItems += 5; // wall, rack, motor, ventilation, exhaust
  if (customLayout.wall.completed) completedItems++;
  if (customLayout.rack.completed) completedItems++;
  if (customLayout.motor.completed) completedItems++;
  if (customLayout.ventilation.completed) completedItems++;
  if (customLayout.exhaust.completed) completedItems++;

  return Math.round((completedItems / totalItems) * 100);
};

// ========================
// 메인 저장 함수
// ========================

export const saveEditorProject = async (
  projectId: string | null,
  editorData: EditorData,
  userId: string,
  options: { skipThumbnail?: boolean } = {}
): Promise<SaveResult> => {
  try {
    console.log('💾 [EditorSave] 저장 시작:', {
      projectId,
      hasBasicInfo: !!editorData.basicInfo,
      hasSpaceInfo: !!editorData.spaceInfo,
      furnitureCount: editorData.placedModules.length
    });

    // 썸네일 생성 (옵션에 따라 스킵 가능)
    let thumbnailBlob: Blob | undefined;
    if (!options.skipThumbnail) {
      try {
        const thumbnail = await captureProjectThumbnail();
        thumbnailBlob = typeof thumbnail === 'string' ? undefined : (thumbnail || undefined);
        console.log('💾 [EditorSave] 3D 썸네일 캡처 성공:', !!thumbnailBlob);
      } catch (thumbnailError) {
        console.error('💾 [EditorSave] 3D 썸네일 캡처 실패:', thumbnailError);
      }

      if (!thumbnailBlob) {
        try {
          const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
          const furnitureCount = useFurnitureStore.getState().placedModules.length;
          const defaultThumbnailDataURL = generateDefaultThumbnail(spaceInfo, furnitureCount);
          thumbnailBlob = dataURLToBlob(defaultThumbnailDataURL);
          console.log('💾 [EditorSave] 기본 썸네일 생성 성공');
        } catch (fallbackError) {
          console.error('💾 [EditorSave] 기본 썸네일 생성 실패:', fallbackError);
        }
      }
    } else {
      console.log('💾 [EditorSave] 썸네일 생성 스킵 (빠른 저장 모드)');
    }

    console.log('💾 [EditorSave] 최종 썸네일 상태:', {
      hasBlob: !!thumbnailBlob,
      blobSize: thumbnailBlob?.size || 0
    });

    // 에디터 데이터를 DB 구조로 변환
    const projectData = convertEditorDataToProjectData(editorData, userId);
    console.log('💾 [EditorSave] 데이터 변환 완료:', {
      spaceConfig: projectData.spaceConfig,
      customLayout: projectData.customLayout,
      completionRate: projectData.stats?.completionRate
    });

    let result: SaveResult;

    if (projectId) {
      // 기존 프로젝트 업데이트
      console.log('💾 [EditorSave] 기존 프로젝트 업데이트:', projectId);
      
      const updateResult = await updateProject(projectId, projectData as UpdateProjectData, thumbnailBlob, options);
      
      if (updateResult.success) {
        result = { success: true, projectId };
        console.log('✅ [EditorSave] 프로젝트 업데이트 성공');
      } else {
        result = { success: false, error: updateResult.error };
        console.error('❌ [EditorSave] 프로젝트 업데이트 실패:', updateResult.error);
      }
    } else {
      // 새 프로젝트 생성
      console.log('💾 [EditorSave] 새 프로젝트 생성');
      
      const createResult = await createProject({
        userId,
        basicInfo: projectData.basicInfo!,
        spaceConfig: projectData.spaceConfig!,
        customLayout: projectData.customLayout!,
      } as CreateProjectData, thumbnailBlob, options);
      
      if (createResult.success && createResult.data) {
        result = { success: true, projectId: createResult.data };
        console.log('✅ [EditorSave] 새 프로젝트 생성 성공:', createResult.data);
      } else {
        result = { success: false, error: createResult.error };
        console.error('❌ [EditorSave] 새 프로젝트 생성 실패:', createResult.error);
      }
    }

    // 통합 스토어에 결과 반영
    if (result.success) {
      const projectDataStore = useProjectDataStore.getState();
      projectDataStore.markAsSaved();
      
      // BroadcastChannel로 다른 창에 알림
      try {
        const channel = new BroadcastChannel('project-updates');
        channel.postMessage({
          type: 'PROJECT_SAVED',
          projectId: result.projectId,
          timestamp: Date.now()
        });
        channel.close();
        console.log('💾 [EditorSave] BroadcastChannel 알림 전송 완료');
      } catch (broadcastError) {
        console.warn('💾 [EditorSave] BroadcastChannel 전송 실패:', broadcastError);
      }
    }

    return result;
  } catch (error) {
    console.error('❌ [EditorSave] 저장 중 예외 발생:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.'
    };
  }
};

// ========================
// 에디터 데이터 로드
// ========================

export const loadEditorProject = async (projectId: string): Promise<{
  success: boolean;
  data?: {
    basicInfo: any;
    spaceInfo: any;
    placedModules: any[];
    customOptions: any;
  };
  error?: string;
}> => {
  try {
    console.log('📁 [EditorLoad] 프로젝트 로드 시작:', projectId);

    const result = await getProject(projectId);
    
    console.log('📁 [EditorLoad] getProject 결과:', {
      hasResult: !!result,
      hasSuccess: result?.success,
      hasData: !!result?.data,
      hasError: !!result?.error,
      errorMessage: result?.error,
      resultKeys: result ? Object.keys(result) : []
    });
    
    console.log('📁 [EditorLoad] getProject 전체 결과:', result);
    
    // 임시로 두 형식 모두 처리
    let projectData;
    if (result.success !== undefined) {
      // projectDataService의 {success, data, error} 형식
      if (!result.success || !result.data) {
        console.error('❌ [EditorLoad] 프로젝트 로드 실패:', result.error);
        return { success: false, error: result.error || '프로젝트를 찾을 수 없습니다.' };
      }
      projectData = result.data;
    } else {
      // firebase/projects의 {project, error} 형식
      if (!result.project) {
        console.error('❌ [EditorLoad] 프로젝트 로드 실패:', result.error);
        return { success: false, error: result.error || '프로젝트를 찾을 수 없습니다.' };
      }
      projectData = result.project;
    }
    
    console.log('📁 [EditorLoad] Firebase 반환 결과:', {
      hasData: !!projectData,
      hasError: !!result.error,
      errorMessage: result.error,
      resultType: result.success !== undefined ? 'projectDataService' : 'firebase/projects'
    });
    
    console.log('📁 [EditorLoad] Firebase 프로젝트 데이터 구조:', {
      hasBasicInfo: !!projectData.basicInfo,
      hasTitle: !!projectData.title || !!projectData.basicInfo?.title,
      hasSpaceConfig: !!projectData.spaceConfig,
      hasFurniture: !!projectData.furniture,
      keys: Object.keys(projectData),
      projectData: projectData
    });

    // Firebase 데이터 구조를 에디터 데이터로 변환
    const editorData = {
      basicInfo: {
        title: projectData.basicInfo?.title || projectData.title || '새 프로젝트',
        location: projectData.basicInfo?.location || projectData.location || '',
        description: projectData.basicInfo?.description || projectData.description || '',
        createdAt: projectData.basicInfo?.createdAt || projectData.createdAt,
        updatedAt: projectData.basicInfo?.updatedAt || projectData.updatedAt,
      },
      spaceInfo: {
        // dimensions에서 값 가져오기
        width: projectData.spaceConfig?.dimensions?.width || projectData.spaceConfig?.width || 3000,
        height: projectData.spaceConfig?.dimensions?.height || projectData.spaceConfig?.height || 2400,
        depth: projectData.spaceConfig?.dimensions?.depth || projectData.spaceConfig?.depth || 600,
        installType: projectData.spaceConfig?.installType || projectData.spaceConfig?.installationType || 'builtin',
        wallPosition: projectData.spaceConfig?.wallPosition || 'back',
        // damper에서 값 가져오기
        damperPosition: projectData.spaceConfig?.damper?.agentPosition || projectData.spaceConfig?.damperPosition || 'left',
        damperWidth: projectData.spaceConfig?.damper?.size?.width || projectData.spaceConfig?.damperWidth || 200,
        damperHeight: projectData.spaceConfig?.damper?.size?.height || projectData.spaceConfig?.damperHeight || 200,
        // floorFinish에서 값 가져오기
        hasFloorFinish: projectData.spaceConfig?.floorFinish?.enabled || projectData.spaceConfig?.hasFloorFinish || false,
        floorFinish: projectData.spaceConfig?.floorFinish || null,
        surroundType: projectData.spaceConfig?.surroundType || 'surround',
        frameSize: projectData.spaceConfig?.frameSize || {
          top: 50,
          left: 50,
          right: 50
        },
        baseConfig: projectData.spaceConfig?.baseConfig || {
          type: 'floor',
          height: 100,
          placementType: 'ground'
        },
        materialConfig: projectData.spaceConfig?.materialConfig || {
          interiorColor: '#FFFFFF',
          doorColor: '#E0E0E0',  // 기본값 변경
        },
        columns: projectData.spaceConfig?.columns || [],
        wallConfig: projectData.spaceConfig?.wallConfig || {
          left: true,
          right: true,
          top: true
        },
        gapConfig: projectData.spaceConfig?.gapConfig || {
          left: 0,
          right: 0
        },
        // 단내림 설정 추가
        droppedCeiling: projectData.spaceConfig?.droppedCeiling || {
          enabled: false,
          position: DEFAULT_DROPPED_CEILING_VALUES.POSITION,
          width: DEFAULT_DROPPED_CEILING_VALUES.WIDTH,
          dropHeight: DEFAULT_DROPPED_CEILING_VALUES.DROP_HEIGHT
        },
        mainDoorCount: projectData.spaceConfig?.mainDoorCount || 0,
        droppedCeilingDoorCount: projectData.spaceConfig?.droppedCeilingDoorCount || 0
      },
      placedModules: projectData.furniture?.placedModules || [],
      customOptions: {
        wallType: 'standard',
        rackThickness: 50,
        motorSettings: '80',
        ventilationSettings: 'standard',
        ventThickness: '100',
      },
    };

    console.log('✅ [EditorLoad] 프로젝트 로드 완료:', {
      title: editorData.basicInfo.title,
      dimensions: `${editorData.spaceInfo.width}x${editorData.spaceInfo.height}x${editorData.spaceInfo.depth}`,
      placedModulesCount: editorData.placedModules.length,
      hasColumns: editorData.spaceInfo.columns.length > 0
    });

    // 통합 스토어에 로드된 데이터 설정
    try {
      const projectDataStore = useProjectDataStore.getState();
      projectDataStore.loadProject(projectData);
    } catch (storeError) {
      console.warn('⚠️ [EditorLoad] 스토어 로드 실패, 계속 진행:', storeError);
    }

    return { success: true, data: editorData };
  } catch (error) {
    console.error('❌ [EditorLoad] 로드 중 예외 발생:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '프로젝트 로드 중 오류가 발생했습니다.'
    };
  }
};

// ========================
// 유틸리티 함수들
// ========================

/** undefined 값들을 제거하는 헬퍼 함수 */
export const removeUndefinedValues = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedValues);

  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = removeUndefinedValues(value);
    }
  }
  return cleaned;
};

/** 현재 에디터 상태를 가져오는 헬퍼 함수 */
export const getCurrentEditorData = (): EditorData => {
  const basicInfo = useProjectStore.getState().basicInfo;
  const spaceInfo = useSpaceConfigStore.getState().spaceInfo;
  const { placedModules } = useFurnitureStore.getState();

  return {
    basicInfo: removeUndefinedValues(basicInfo),
    spaceInfo: removeUndefinedValues(spaceInfo),
    placedModules: removeUndefinedValues(placedModules),
  };
};