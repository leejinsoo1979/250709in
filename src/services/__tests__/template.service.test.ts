/**
 * Template Service Tests - 템플릿 서비스 단위 테스트
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as templateService from '../template.service';
import * as firestoreService from '../firebase/firestore.service';
import * as authService from '../firebase/auth.service';
import { 
  Template, 
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateListOptions
} from '../types/template.types';

// Mock Firebase 서비스
vi.mock('../firebase/firestore.service');
vi.mock('../firebase/auth.service');

describe('Template Service', () => {
  const mockUserId = 'test-user-123';
  const mockTemplateId = 'test-template-456';
  
  const mockTemplateInput: CreateTemplateInput = {
    metadata: {
      name: 'Test Template',
      description: 'A test template',
      category: 'space',
      tags: ['test', 'sample'],
      isPublic: false,
      version: '1.0.0'
    },
    data: {
      spaceConfig: {
        width: 3000,
        height: 2400,
        depth: 600
      }
    }
  };

  const mockFirestoreDoc = {
    id: mockTemplateId,
    userId: mockUserId,
    metadata: mockTemplateInput.metadata,
    data: mockTemplateInput.data,
    createdAt: { toDate: () => new Date('2024-01-01') },
    updatedAt: { toDate: () => new Date('2024-01-01') },
    usageCount: 0
  };

  beforeEach(() => {
    vi.clearAllMocks();
    templateService.clearTemplateCache();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createTemplate', () => {
    it('should create a template successfully', async () => {
      vi.mocked(authService.getCurrentUserId).mockResolvedValue(mockUserId);
      vi.mocked(firestoreService.createDocument).mockResolvedValue(mockTemplateId);
      vi.mocked(firestoreService.readDocument).mockResolvedValue(mockFirestoreDoc);

      const result = await templateService.createTemplate(mockTemplateInput);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe(mockTemplateId);
      expect(result.data?.userId).toBe(mockUserId);
      expect(result.data?.metadata.name).toBe('Test Template');
    });

    it('should fail if user is not authenticated', async () => {
      vi.mocked(authService.getCurrentUserId).mockResolvedValue(null);

      const result = await templateService.createTemplate(mockTemplateInput);

      expect(result.success).toBe(false);
      expect(result.error).toBe('인증이 필요합니다');
    });

    it('should validate template input', async () => {
      vi.mocked(authService.getCurrentUserId).mockResolvedValue(mockUserId);

      const invalidInput: CreateTemplateInput = {
        metadata: {
          name: '', // 빈 이름
          category: 'invalid' as any, // 잘못된 카테고리
          isPublic: false,
          version: '1.0.0'
        },
        data: {
          spaceConfig: {
            width: 50, // 범위 밖
            height: 2400,
            depth: 600
          }
        }
      };

      const result = await templateService.createTemplate(invalidInput);

      expect(result.success).toBe(false);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors?.length).toBeGreaterThan(0);
    });
  });

  describe('getTemplate', () => {
    it('should get a public template successfully', async () => {
      const publicDoc = {
        ...mockFirestoreDoc,
        metadata: { ...mockFirestoreDoc.metadata, isPublic: true }
      };
      vi.mocked(firestoreService.readDocument).mockResolvedValue(publicDoc);

      const result = await templateService.getTemplate(mockTemplateId);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(mockTemplateId);
    });

    it('should get own private template successfully', async () => {
      vi.mocked(authService.getCurrentUserId).mockResolvedValue(mockUserId);
      vi.mocked(firestoreService.readDocument).mockResolvedValue(mockFirestoreDoc);

      const result = await templateService.getTemplate(mockTemplateId);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(mockTemplateId);
    });

    it('should fail to get others private template', async () => {
      vi.mocked(authService.getCurrentUserId).mockResolvedValue('other-user');
      vi.mocked(firestoreService.readDocument).mockResolvedValue(mockFirestoreDoc);

      const result = await templateService.getTemplate(mockTemplateId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('템플릿에 접근할 권한이 없습니다');
    });

    it('should use cache for subsequent calls', async () => {
      const publicDoc = {
        ...mockFirestoreDoc,
        metadata: { ...mockFirestoreDoc.metadata, isPublic: true }
      };
      vi.mocked(firestoreService.readDocument).mockResolvedValue(publicDoc);

      // 첫 번째 호출
      await templateService.getTemplate(mockTemplateId);
      
      // 두 번째 호출 (캐시 사용)
      const result = await templateService.getTemplate(mockTemplateId);

      expect(result.success).toBe(true);
      expect(firestoreService.readDocument).toHaveBeenCalledTimes(1); // 한 번만 호출
    });
  });

  describe('updateTemplate', () => {
    it('should update template successfully', async () => {
      vi.mocked(authService.checkPermission).mockResolvedValue(true);
      vi.mocked(firestoreService.readDocument)
        .mockResolvedValueOnce(mockFirestoreDoc)
        .mockResolvedValueOnce({
          ...mockFirestoreDoc,
          metadata: { ...mockFirestoreDoc.metadata, name: 'Updated Template' }
        });

      const updateInput: UpdateTemplateInput = {
        metadata: { name: 'Updated Template' }
      };

      const result = await templateService.updateTemplate(mockTemplateId, updateInput);

      expect(result.success).toBe(true);
      expect(result.data?.metadata.name).toBe('Updated Template');
    });

    it('should fail without permission', async () => {
      vi.mocked(authService.checkPermission).mockResolvedValue(false);
      vi.mocked(firestoreService.readDocument).mockResolvedValue(mockFirestoreDoc);

      const result = await templateService.updateTemplate(mockTemplateId, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('템플릿을 수정할 권한이 없습니다');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template successfully', async () => {
      vi.mocked(authService.checkPermission).mockResolvedValue(true);
      vi.mocked(firestoreService.readDocument).mockResolvedValue(mockFirestoreDoc);
      vi.mocked(firestoreService.deleteDocument).mockResolvedValue(undefined);

      const result = await templateService.deleteTemplate(mockTemplateId);

      expect(result.success).toBe(true);
      expect(firestoreService.deleteDocument).toHaveBeenCalledWith(
        'templates',
        mockTemplateId
      );
    });

    it('should fail without permission', async () => {
      vi.mocked(authService.checkPermission).mockResolvedValue(false);
      vi.mocked(firestoreService.readDocument).mockResolvedValue(mockFirestoreDoc);

      const result = await templateService.deleteTemplate(mockTemplateId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('템플릿을 삭제할 권한이 없습니다');
    });
  });

  describe('listTemplates', () => {
    it('should list templates with pagination', async () => {
      const mockDocuments = [
        mockFirestoreDoc,
        { ...mockFirestoreDoc, id: 'template-2', metadata: { ...mockFirestoreDoc.metadata, name: 'Template 2' } },
        { ...mockFirestoreDoc, id: 'template-3', metadata: { ...mockFirestoreDoc.metadata, name: 'Template 3' } }
      ];

      vi.mocked(authService.getCurrentUserId).mockResolvedValue(mockUserId);
      vi.mocked(firestoreService.queryDocuments).mockResolvedValue(mockDocuments);

      const options: TemplateListOptions = {
        filter: { category: 'space' },
        pageSize: 10,
        page: 1
      };

      const result = await templateService.listTemplates(options);

      expect(result.success).toBe(true);
      expect(result.data?.templates.length).toBe(3);
      expect(result.data?.pageSize).toBe(10);
    });

    it('should filter by category', async () => {
      vi.mocked(authService.getCurrentUserId).mockResolvedValue(mockUserId);
      vi.mocked(firestoreService.queryDocuments).mockResolvedValue([mockFirestoreDoc]);

      const options: TemplateListOptions = {
        filter: { category: 'furniture' }
      };

      await templateService.listTemplates(options);

      expect(firestoreService.queryDocuments).toHaveBeenCalledWith(
        'templates',
        expect.objectContaining({
          where: expect.arrayContaining([
            { field: 'metadata.category', operator: '==', value: 'furniture' }
          ])
        })
      );
    });
  });

  describe('applyTemplate', () => {
    it('should apply template to project', async () => {
      vi.mocked(authService.getCurrentUserId).mockResolvedValue(mockUserId);
      vi.mocked(firestoreService.readDocument).mockResolvedValue({
        ...mockFirestoreDoc,
        metadata: { ...mockFirestoreDoc.metadata, isPublic: true }
      });
      vi.mocked(firestoreService.updateDocument).mockResolvedValue(undefined);

      const result = await templateService.applyTemplate({
        projectId: 'project-123',
        templateId: mockTemplateId,
        mergeStrategy: 'replace'
      });

      expect(result.success).toBe(true);
      expect(result.data?.projectId).toBe('project-123');
      
      // 사용 횟수 증가 확인
      expect(firestoreService.updateDocument).toHaveBeenCalledWith(
        'templates',
        mockTemplateId,
        expect.objectContaining({
          usageCount: 1
        })
      );
    });

    it('should fail if not authenticated', async () => {
      vi.mocked(authService.getCurrentUserId).mockResolvedValue(null);

      const result = await templateService.applyTemplate({
        projectId: 'project-123',
        templateId: mockTemplateId,
        mergeStrategy: 'replace'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('인증이 필요합니다');
    });
  });

  describe('getPopularTemplates', () => {
    it('should return popular templates ordered by usage', async () => {
      const popularTemplates = [
        { ...mockFirestoreDoc, id: 't1', usageCount: 100 },
        { ...mockFirestoreDoc, id: 't2', usageCount: 50 },
        { ...mockFirestoreDoc, id: 't3', usageCount: 25 }
      ];

      vi.mocked(firestoreService.queryDocuments).mockResolvedValue(popularTemplates);

      const result = await templateService.getPopularTemplates(3);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);
      expect(result.data?.[0].usageCount).toBe(100);
    });
  });

  describe('searchTemplates', () => {
    it('should search templates by name', async () => {
      const templates = [
        { ...mockFirestoreDoc, id: 't1', metadata: { ...mockFirestoreDoc.metadata, name: 'Kitchen Template' } },
        { ...mockFirestoreDoc, id: 't2', metadata: { ...mockFirestoreDoc.metadata, name: 'Bedroom Template' } },
        { ...mockFirestoreDoc, id: 't3', metadata: { ...mockFirestoreDoc.metadata, name: 'Kitchen Modern' } }
      ];

      vi.mocked(authService.getCurrentUserId).mockResolvedValue(mockUserId);
      vi.mocked(firestoreService.queryDocuments).mockResolvedValue(templates);

      const result = await templateService.searchTemplates('kitchen');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2); // Kitchen Template과 Kitchen Modern
    });

    it('should search templates by tags', async () => {
      const templates = [
        { ...mockFirestoreDoc, id: 't1', metadata: { ...mockFirestoreDoc.metadata, tags: ['modern', 'minimal'] } },
        { ...mockFirestoreDoc, id: 't2', metadata: { ...mockFirestoreDoc.metadata, tags: ['classic', 'luxury'] } },
        { ...mockFirestoreDoc, id: 't3', metadata: { ...mockFirestoreDoc.metadata, tags: ['modern', 'scandinavian'] } }
      ];

      vi.mocked(authService.getCurrentUserId).mockResolvedValue(mockUserId);
      vi.mocked(firestoreService.queryDocuments).mockResolvedValue(templates);

      const result = await templateService.searchTemplates('modern');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2); // modern 태그를 가진 템플릿들
    });
  });

  describe('Cache Management', () => {
    it('should clear all cache', async () => {
      const publicDoc = {
        ...mockFirestoreDoc,
        metadata: { ...mockFirestoreDoc.metadata, isPublic: true }
      };
      vi.mocked(firestoreService.readDocument).mockResolvedValue(publicDoc);

      // 캐시 생성
      await templateService.getTemplate(mockTemplateId);
      
      // 캐시 클리어
      templateService.clearTemplateCache();
      
      // 다시 조회 (캐시 없음)
      await templateService.getTemplate(mockTemplateId);

      expect(firestoreService.readDocument).toHaveBeenCalledTimes(2);
    });

    it('should invalidate specific template cache', async () => {
      const publicDoc = {
        ...mockFirestoreDoc,
        metadata: { ...mockFirestoreDoc.metadata, isPublic: true }
      };
      vi.mocked(firestoreService.readDocument).mockResolvedValue(publicDoc);

      // 캐시 생성
      await templateService.getTemplate(mockTemplateId);
      
      // 특정 캐시 무효화
      templateService.invalidateTemplateCache(mockTemplateId);
      
      // 다시 조회 (캐시 없음)
      await templateService.getTemplate(mockTemplateId);

      expect(firestoreService.readDocument).toHaveBeenCalledTimes(2);
    });
  });
});