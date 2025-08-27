/**
 * Template Service - 템플릿 CRUD 및 적용 서비스
 * 보안: 소유자/권한 검사 포함
 * 성능: 페이지네이션, 인덱스 최적화
 */

import {
  createDocument,
  readDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  queryDocumentsPaginated,
  FirestoreDocument,
  WhereCondition,
  OrderByCondition,
  QueryOptions
} from './firebase/firestore.service';

import {
  getCurrentUserId,
  checkPermission,
  isAuthenticated
} from './firebase/auth.service';

import {
  Template,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateFilter,
  TemplateListOptions,
  TemplateListResult,
  ApplyTemplateOptions,
  TemplateOperationResult,
  TemplateValidationError
} from './types/template.types';

const TEMPLATES_COLLECTION = 'templates';
const TEMPLATE_CACHE_TIME = 5 * 60 * 1000; // 5분

// 메모리 캐시
const templateCache = new Map<string, { template: Template; timestamp: number }>();

/**
 * 템플릿 유효성 검사
 */
function validateTemplate(input: CreateTemplateInput): TemplateValidationError[] {
  const errors: TemplateValidationError[] = [];

  // 메타데이터 검증
  if (!input.metadata.name || input.metadata.name.trim().length === 0) {
    errors.push({ field: 'metadata.name', message: '템플릿 이름은 필수입니다' });
  }

  if (input.metadata.name && input.metadata.name.length > 100) {
    errors.push({ field: 'metadata.name', message: '템플릿 이름은 100자 이내여야 합니다' });
  }

  if (!['space', 'furniture', 'material', 'complete'].includes(input.metadata.category)) {
    errors.push({ field: 'metadata.category', message: '유효하지 않은 카테고리입니다' });
  }

  // 데이터 검증
  if (input.data.spaceConfig) {
    const { width, height, depth } = input.data.spaceConfig;
    
    if (width && (width < 100 || width > 10000)) {
      errors.push({ field: 'data.spaceConfig.width', message: '너비는 100mm ~ 10000mm 사이여야 합니다' });
    }
    
    if (height && (height < 100 || height > 5000)) {
      errors.push({ field: 'data.spaceConfig.height', message: '높이는 100mm ~ 5000mm 사이여야 합니다' });
    }
    
    if (depth && (depth < 100 || depth > 10000)) {
      errors.push({ field: 'data.spaceConfig.depth', message: '깊이는 100mm ~ 10000mm 사이여야 합니다' });
    }
  }

  return errors;
}

/**
 * Firestore 문서를 Template 타입으로 변환
 */
function documentToTemplate(doc: FirestoreDocument): Template {
  return {
    id: doc.id,
    userId: doc.userId,
    metadata: doc.metadata,
    data: doc.data,
    createdAt: doc.createdAt?.toDate() || new Date(),
    updatedAt: doc.updatedAt?.toDate() || new Date(),
    usageCount: doc.usageCount || 0,
    lastUsedAt: doc.lastUsedAt?.toDate()
  };
}

/**
 * 템플릿 생성
 */
export async function createTemplate(
  input: CreateTemplateInput
): Promise<TemplateOperationResult<Template>> {
  try {
    // 인증 확인
    const userId = await getCurrentUserId();
    if (!userId) {
      return {
        success: false,
        error: '인증이 필요합니다'
      };
    }

    // 유효성 검사
    const validationErrors = validateTemplate(input);
    if (validationErrors.length > 0) {
      return {
        success: false,
        validationErrors
      };
    }

    // 문서 생성
    const templateData = {
      userId,
      metadata: {
        ...input.metadata,
        version: input.metadata.version || '1.0.0'
      },
      data: input.data,
      usageCount: 0
    };

    const templateId = await createDocument(TEMPLATES_COLLECTION, templateData);
    
    // 생성된 템플릿 조회
    const createdTemplate = await readDocument(TEMPLATES_COLLECTION, templateId);
    
    if (!createdTemplate) {
      throw new Error('템플릿 생성 후 조회 실패');
    }

    const template = documentToTemplate(createdTemplate);
    
    // 캐시 저장
    templateCache.set(templateId, {
      template,
      timestamp: Date.now()
    });

    return {
      success: true,
      data: template
    };
  } catch (error) {
    console.error('Template creation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '템플릿 생성 실패'
    };
  }
}

/**
 * 템플릿 조회
 */
export async function getTemplate(
  templateId: string
): Promise<TemplateOperationResult<Template>> {
  try {
    // 캐시 확인
    const cached = templateCache.get(templateId);
    if (cached && Date.now() - cached.timestamp < TEMPLATE_CACHE_TIME) {
      return {
        success: true,
        data: cached.template
      };
    }

    // DB 조회
    const doc = await readDocument(TEMPLATES_COLLECTION, templateId);
    
    if (!doc) {
      return {
        success: false,
        error: '템플릿을 찾을 수 없습니다'
      };
    }

    const template = documentToTemplate(doc);
    
    // 권한 확인 (비공개 템플릿의 경우)
    if (!template.metadata.isPublic) {
      const currentUserId = await getCurrentUserId();
      if (!currentUserId || currentUserId !== template.userId) {
        return {
          success: false,
          error: '템플릿에 접근할 권한이 없습니다'
        };
      }
    }

    // 캐시 갱신
    templateCache.set(templateId, {
      template,
      timestamp: Date.now()
    });

    return {
      success: true,
      data: template
    };
  } catch (error) {
    console.error('Template fetch error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '템플릿 조회 실패'
    };
  }
}

/**
 * 템플릿 업데이트
 */
export async function updateTemplate(
  templateId: string,
  input: UpdateTemplateInput
): Promise<TemplateOperationResult<Template>> {
  try {
    // 기존 템플릿 조회
    const existingDoc = await readDocument(TEMPLATES_COLLECTION, templateId);
    
    if (!existingDoc) {
      return {
        success: false,
        error: '템플릿을 찾을 수 없습니다'
      };
    }

    // 권한 확인
    const hasPermission = await checkPermission(existingDoc.userId);
    if (!hasPermission) {
      return {
        success: false,
        error: '템플릿을 수정할 권한이 없습니다'
      };
    }

    // 업데이트 데이터 준비
    const updateData: any = {};
    
    if (input.metadata) {
      updateData.metadata = {
        ...existingDoc.metadata,
        ...input.metadata
      };
    }
    
    if (input.data) {
      updateData.data = {
        ...existingDoc.data,
        ...input.data
      };
    }

    // 문서 업데이트
    await updateDocument(TEMPLATES_COLLECTION, templateId, updateData);
    
    // 업데이트된 템플릿 조회
    const updatedDoc = await readDocument(TEMPLATES_COLLECTION, templateId);
    
    if (!updatedDoc) {
      throw new Error('템플릿 업데이트 후 조회 실패');
    }

    const template = documentToTemplate(updatedDoc);
    
    // 캐시 갱신
    templateCache.set(templateId, {
      template,
      timestamp: Date.now()
    });

    return {
      success: true,
      data: template
    };
  } catch (error) {
    console.error('Template update error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '템플릿 업데이트 실패'
    };
  }
}

/**
 * 템플릿 삭제
 */
export async function deleteTemplate(
  templateId: string
): Promise<TemplateOperationResult<void>> {
  try {
    // 템플릿 조회
    const doc = await readDocument(TEMPLATES_COLLECTION, templateId);
    
    if (!doc) {
      return {
        success: false,
        error: '템플릿을 찾을 수 없습니다'
      };
    }

    // 권한 확인
    const hasPermission = await checkPermission(doc.userId);
    if (!hasPermission) {
      return {
        success: false,
        error: '템플릿을 삭제할 권한이 없습니다'
      };
    }

    // 문서 삭제
    await deleteDocument(TEMPLATES_COLLECTION, templateId);
    
    // 캐시 삭제
    templateCache.delete(templateId);

    return {
      success: true
    };
  } catch (error) {
    console.error('Template deletion error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '템플릿 삭제 실패'
    };
  }
}

/**
 * 템플릿 목록 조회 (페이지네이션 지원)
 */
export async function listTemplates(
  options?: TemplateListOptions
): Promise<TemplateOperationResult<TemplateListResult>> {
  try {
    const currentUserId = await getCurrentUserId();
    const pageSize = options?.pageSize || 20;
    const page = options?.page || 1;

    // 쿼리 조건 구성
    const whereConditions: WhereCondition[] = [];
    
    // 필터 조건
    if (options?.filter) {
      if (options.filter.userId) {
        whereConditions.push({
          field: 'userId',
          operator: '==',
          value: options.filter.userId
        });
      }
      
      if (options.filter.category) {
        whereConditions.push({
          field: 'metadata.category',
          operator: '==',
          value: options.filter.category
        });
      }
      
      if (typeof options.filter.isPublic === 'boolean') {
        whereConditions.push({
          field: 'metadata.isPublic',
          operator: '==',
          value: options.filter.isPublic
        });
      }
    }

    // 비공개 템플릿은 본인 것만 조회 가능
    if (!options?.filter?.isPublic && currentUserId) {
      whereConditions.push({
        field: 'userId',
        operator: '==',
        value: currentUserId
      });
    }

    // 정렬 조건
    const orderByConditions: OrderByCondition[] = [];
    if (options?.sort) {
      orderByConditions.push({
        field: options.sort.field === 'name' ? 'metadata.name' : options.sort.field,
        direction: options.sort.direction
      });
    } else {
      orderByConditions.push({
        field: 'updatedAt',
        direction: 'desc'
      });
    }

    // 쿼리 실행
    const queryOptions: QueryOptions = {
      where: whereConditions,
      orderBy: orderByConditions,
      limit: pageSize
    };

    const documents = await queryDocuments(TEMPLATES_COLLECTION, queryOptions);
    const templates = documents.map(documentToTemplate);

    return {
      success: true,
      data: {
        templates,
        total: templates.length, // 실제로는 별도 카운트 쿼리 필요
        page,
        pageSize,
        hasMore: templates.length === pageSize
      }
    };
  } catch (error) {
    console.error('Template list error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '템플릿 목록 조회 실패'
    };
  }
}

/**
 * 템플릿 적용
 */
export async function applyTemplate(
  options: ApplyTemplateOptions
): Promise<TemplateOperationResult<{ projectId: string }>> {
  try {
    // 인증 확인
    const userId = await getCurrentUserId();
    if (!userId) {
      return {
        success: false,
        error: '인증이 필요합니다'
      };
    }

    // 템플릿 조회
    const templateResult = await getTemplate(options.templateId);
    if (!templateResult.success || !templateResult.data) {
      return {
        success: false,
        error: templateResult.error || '템플릿을 찾을 수 없습니다'
      };
    }

    const template = templateResult.data;

    // 사용 횟수 증가
    await updateDocument(TEMPLATES_COLLECTION, options.templateId, {
      usageCount: (template.usageCount || 0) + 1,
      lastUsedAt: new Date()
    });

    // 프로젝트에 템플릿 데이터 적용
    // 이 부분은 프로젝트 서비스와 연동 필요
    const projectData = await applyTemplateToProject(
      options.projectId,
      template,
      options.mergeStrategy,
      options.selectedComponents
    );

    return {
      success: true,
      data: { projectId: options.projectId }
    };
  } catch (error) {
    console.error('Template apply error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '템플릿 적용 실패'
    };
  }
}

/**
 * 프로젝트에 템플릿 데이터 적용 (내부 헬퍼)
 */
async function applyTemplateToProject(
  projectId: string,
  template: Template,
  mergeStrategy: 'replace' | 'merge' | 'selective',
  selectedComponents?: ApplyTemplateOptions['selectedComponents']
): Promise<void> {
  // 프로젝트 서비스와 연동하여 실제 적용 로직 구현
  // 현재는 placeholder
  
  const applyData: any = {};

  if (selectedComponents?.space !== false && template.data.spaceConfig) {
    applyData.spaceConfig = template.data.spaceConfig;
  }

  if (selectedComponents?.furniture !== false && template.data.furniture) {
    applyData.furniture = template.data.furniture;
  }

  if (selectedComponents?.materials !== false && template.data.materials) {
    applyData.materials = template.data.materials;
  }

  if (selectedComponents?.columns !== false && template.data.columns) {
    applyData.columns = template.data.columns;
  }

  if (selectedComponents?.customSettings !== false && template.data.customSettings) {
    applyData.customSettings = template.data.customSettings;
  }

  // TODO: 실제 프로젝트 업데이트 로직
  console.log(`Applying template to project ${projectId} with strategy ${mergeStrategy}:`, applyData);
}

/**
 * 인기 템플릿 조회
 */
export async function getPopularTemplates(
  limit: number = 10
): Promise<TemplateOperationResult<Template[]>> {
  try {
    const queryOptions: QueryOptions = {
      where: [
        { field: 'metadata.isPublic', operator: '==', value: true }
      ],
      orderBy: [
        { field: 'usageCount', direction: 'desc' }
      ],
      limit
    };

    const documents = await queryDocuments(TEMPLATES_COLLECTION, queryOptions);
    const templates = documents.map(documentToTemplate);

    return {
      success: true,
      data: templates
    };
  } catch (error) {
    console.error('Popular templates error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '인기 템플릿 조회 실패'
    };
  }
}

/**
 * 사용자별 템플릿 조회
 */
export async function getUserTemplates(
  userId?: string
): Promise<TemplateOperationResult<Template[]>> {
  try {
    const targetUserId = userId || await getCurrentUserId();
    
    if (!targetUserId) {
      return {
        success: false,
        error: '사용자 ID가 필요합니다'
      };
    }

    const queryOptions: QueryOptions = {
      where: [
        { field: 'userId', operator: '==', value: targetUserId }
      ],
      orderBy: [
        { field: 'updatedAt', direction: 'desc' }
      ]
    };

    const documents = await queryDocuments(TEMPLATES_COLLECTION, queryOptions);
    const templates = documents.map(documentToTemplate);

    return {
      success: true,
      data: templates
    };
  } catch (error) {
    console.error('User templates error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '사용자 템플릿 조회 실패'
    };
  }
}

/**
 * 템플릿 검색
 */
export async function searchTemplates(
  searchTerm: string,
  filter?: Omit<TemplateFilter, 'searchTerm'>
): Promise<TemplateOperationResult<Template[]>> {
  try {
    // Firestore는 전문 검색을 지원하지 않으므로
    // 클라이언트 측 필터링 또는 외부 검색 서비스 필요
    
    const result = await listTemplates({
      filter: {
        ...filter,
        isPublic: true
      }
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error
      };
    }

    // 클라이언트 측 검색 (이름과 설명에서)
    const searchLower = searchTerm.toLowerCase();
    const filtered = result.data.templates.filter(template => 
      template.metadata.name.toLowerCase().includes(searchLower) ||
      template.metadata.description?.toLowerCase().includes(searchLower) ||
      template.metadata.tags?.some(tag => tag.toLowerCase().includes(searchLower))
    );

    return {
      success: true,
      data: filtered
    };
  } catch (error) {
    console.error('Template search error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '템플릿 검색 실패'
    };
  }
}

/**
 * 캐시 초기화
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

/**
 * 특정 템플릿 캐시 삭제
 */
export function invalidateTemplateCache(templateId: string): void {
  templateCache.delete(templateId);
}