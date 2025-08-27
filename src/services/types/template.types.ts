/**
 * Template Types - 템플릿 관련 타입 정의
 */

export interface TemplateMetadata {
  name: string;
  description?: string;
  category: 'space' | 'furniture' | 'material' | 'complete';
  tags?: string[];
  thumbnail?: string;
  isPublic: boolean;
  version: string;
}

export interface TemplateData {
  // Space 설정
  spaceConfig?: {
    width: number;
    height: number;
    depth: number;
    installType?: string;
    droppedCeiling?: {
      enabled: boolean;
      height?: number;
    };
    floorFinish?: {
      type: string;
      thickness?: number;
    };
  };
  
  // Furniture 설정
  furniture?: {
    placedModules: Array<{
      id: string;
      moduleId: string;
      position: { x: number; y: number; z: number };
      rotation?: number;
      properties?: Record<string, any>;
    }>;
  };
  
  // Material 설정  
  materials?: {
    floor?: string;
    wall?: string;
    ceiling?: string;
    cabinet?: string;
    countertop?: string;
  };
  
  // Column 설정
  columns?: Array<{
    id: string;
    position: number;
    width: number;
    depth: number;
    type: string;
  }>;
  
  // 기타 설정
  customSettings?: Record<string, any>;
}

export interface Template {
  id: string;
  userId: string;
  metadata: TemplateMetadata;
  data: TemplateData;
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  lastUsedAt?: Date;
}

export interface CreateTemplateInput {
  metadata: TemplateMetadata;
  data: TemplateData;
}

export interface UpdateTemplateInput {
  metadata?: Partial<TemplateMetadata>;
  data?: Partial<TemplateData>;
}

export interface TemplateFilter {
  userId?: string;
  category?: TemplateMetadata['category'];
  tags?: string[];
  isPublic?: boolean;
  searchTerm?: string;
}

export interface TemplateSortOptions {
  field: 'createdAt' | 'updatedAt' | 'usageCount' | 'name';
  direction: 'asc' | 'desc';
}

export interface TemplateListOptions {
  filter?: TemplateFilter;
  sort?: TemplateSortOptions;
  pageSize?: number;
  page?: number;
}

export interface TemplateListResult {
  templates: Template[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApplyTemplateOptions {
  projectId: string;
  templateId: string;
  mergeStrategy: 'replace' | 'merge' | 'selective';
  selectedComponents?: {
    space?: boolean;
    furniture?: boolean;
    materials?: boolean;
    columns?: boolean;
    customSettings?: boolean;
  };
}

export interface TemplateValidationError {
  field: string;
  message: string;
}

export interface TemplateOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  validationErrors?: TemplateValidationError[];
}