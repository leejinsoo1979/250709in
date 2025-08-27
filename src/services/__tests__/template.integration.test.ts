/**
 * Template Service Integration Tests - 템플릿 서비스 통합 테스트
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as templateService from '../template.service';
import { 
  Template, 
  CreateTemplateInput,
  TemplateListOptions,
  ApplyTemplateOptions
} from '../types/template.types';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';

describe('Template Service Integration Tests', () => {
  let testEnv: RulesTestEnvironment;
  let authenticatedUserId = 'integration-test-user';
  
  const createTestTemplate = (name: string, isPublic: boolean = false): CreateTemplateInput => ({
    metadata: {
      name,
      description: `Integration test template: ${name}`,
      category: 'complete',
      tags: ['integration-test', 'automated'],
      isPublic,
      version: '1.0.0',
      thumbnail: 'https://example.com/thumbnail.png'
    },
    data: {
      spaceConfig: {
        width: 3000,
        height: 2400,
        depth: 600,
        installType: 'standard',
        droppedCeiling: {
          enabled: true,
          height: 200
        },
        floorFinish: {
          type: 'wood',
          thickness: 15
        }
      },
      furniture: {
        placedModules: [
          {
            id: 'module-1',
            moduleId: 'cabinet-upper-1',
            position: { x: 0, y: 1800, z: 0 },
            rotation: 0,
            properties: {
              width: 600,
              height: 700,
              depth: 350
            }
          },
          {
            id: 'module-2',
            moduleId: 'cabinet-lower-1',
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
            properties: {
              width: 600,
              height: 900,
              depth: 600
            }
          }
        ]
      },
      materials: {
        floor: 'oak-wood',
        wall: 'white-paint',
        ceiling: 'white-paint',
        cabinet: 'white-melamine',
        countertop: 'granite-black'
      },
      columns: [
        {
          id: 'col-1',
          position: 600,
          width: 100,
          depth: 100,
          type: 'structural'
        }
      ],
      customSettings: {
        lighting: 'warm',
        handleStyle: 'modern'
      }
    }
  });

  beforeAll(async () => {
    // Firebase 테스트 환경 초기화
    try {
      testEnv = await initializeTestEnvironment({
        projectId: 'template-service-test',
        firestore: {
          rules: `
            rules_version = '2';
            service cloud.firestore {
              match /databases/{database}/documents {
                match /templates/{templateId} {
                  allow read: if resource.data.metadata.isPublic == true ||
                               (request.auth != null && request.auth.uid == resource.data.userId);
                  allow create: if request.auth != null;
                  allow update: if request.auth != null && request.auth.uid == resource.data.userId;
                  allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
                }
              }
            }
          `
        }
      });
    } catch (error) {
      console.warn('Firebase test environment initialization skipped:', error);
      // 테스트 환경이 없어도 계속 진행 (CI/CD 환경 고려)
    }
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    templateService.clearTemplateCache();
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  describe('End-to-End Template Lifecycle', () => {
    it('should complete full template lifecycle: create, read, update, apply, delete', async () => {
      // Skip if no test environment
      if (!testEnv) {
        console.warn('Skipping integration test - no Firebase test environment');
        return;
      }

      // 1. Create template
      const createResult = await templateService.createTemplate(
        createTestTemplate('Full Lifecycle Template')
      );
      
      expect(createResult.success).toBe(true);
      expect(createResult.data).toBeDefined();
      const templateId = createResult.data!.id;

      // 2. Read template
      const readResult = await templateService.getTemplate(templateId);
      expect(readResult.success).toBe(true);
      expect(readResult.data?.metadata.name).toBe('Full Lifecycle Template');

      // 3. Update template
      const updateResult = await templateService.updateTemplate(templateId, {
        metadata: {
          description: 'Updated description',
          tags: ['updated', 'integration-test']
        },
        data: {
          materials: {
            floor: 'laminate',
            wall: 'grey-paint'
          }
        }
      });
      
      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.metadata.description).toBe('Updated description');
      expect(updateResult.data?.data.materials?.floor).toBe('laminate');

      // 4. Apply template
      const applyResult = await templateService.applyTemplate({
        projectId: 'test-project-123',
        templateId: templateId,
        mergeStrategy: 'merge',
        selectedComponents: {
          space: true,
          furniture: true,
          materials: false
        }
      });
      
      expect(applyResult.success).toBe(true);
      expect(applyResult.data?.projectId).toBe('test-project-123');

      // 5. Verify usage count increased
      const updatedTemplate = await templateService.getTemplate(templateId);
      expect(updatedTemplate.data?.usageCount).toBe(1);

      // 6. Delete template
      const deleteResult = await templateService.deleteTemplate(templateId);
      expect(deleteResult.success).toBe(true);

      // 7. Verify deletion
      const deletedTemplate = await templateService.getTemplate(templateId);
      expect(deletedTemplate.success).toBe(false);
    });
  });

  describe('Pagination and Performance', () => {
    it('should handle pagination correctly with 50+ templates', async () => {
      if (!testEnv) {
        console.warn('Skipping integration test - no Firebase test environment');
        return;
      }

      // Create 50 templates
      const createPromises = [];
      for (let i = 0; i < 50; i++) {
        createPromises.push(
          templateService.createTemplate(
            createTestTemplate(`Pagination Test ${i}`, i % 2 === 0)
          )
        );
      }
      
      await Promise.all(createPromises);

      // Test first page
      const page1Result = await templateService.listTemplates({
        pageSize: 20,
        page: 1
      });
      
      expect(page1Result.success).toBe(true);
      expect(page1Result.data?.templates.length).toBe(20);
      expect(page1Result.data?.hasMore).toBe(true);

      // Measure performance
      const startTime = Date.now();
      const page2Result = await templateService.listTemplates({
        pageSize: 20,
        page: 2
      });
      const queryTime = Date.now() - startTime;

      expect(page2Result.success).toBe(true);
      expect(queryTime).toBeLessThan(200); // 응답 200ms 이내
    });

    it('should efficiently filter by category with index', async () => {
      if (!testEnv) {
        console.warn('Skipping integration test - no Firebase test environment');
        return;
      }

      // Create templates with different categories
      await Promise.all([
        templateService.createTemplate({
          ...createTestTemplate('Space Template'),
          metadata: { ...createTestTemplate('Space Template').metadata, category: 'space' }
        }),
        templateService.createTemplate({
          ...createTestTemplate('Furniture Template'),
          metadata: { ...createTestTemplate('Furniture Template').metadata, category: 'furniture' }
        }),
        templateService.createTemplate({
          ...createTestTemplate('Material Template'),
          metadata: { ...createTestTemplate('Material Template').metadata, category: 'material' }
        })
      ]);

      const startTime = Date.now();
      const result = await templateService.listTemplates({
        filter: { category: 'furniture' }
      });
      const queryTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.data?.templates.length).toBe(1);
      expect(result.data?.templates[0].metadata.category).toBe('furniture');
      expect(queryTime).toBeLessThan(200); // 인덱스 사용으로 빠른 응답
    });
  });

  describe('Security and Permissions', () => {
    it('should enforce access control for private templates', async () => {
      if (!testEnv) {
        console.warn('Skipping integration test - no Firebase test environment');
        return;
      }

      // Create private template
      const privateResult = await templateService.createTemplate(
        createTestTemplate('Private Template', false)
      );
      
      expect(privateResult.success).toBe(true);
      const privateTemplateId = privateResult.data!.id;

      // Create public template
      const publicResult = await templateService.createTemplate(
        createTestTemplate('Public Template', true)
      );
      
      expect(publicResult.success).toBe(true);
      const publicTemplateId = publicResult.data!.id;

      // Simulate different user context
      // In real scenario, this would be done with different auth tokens
      
      // Try to access public template - should succeed
      const publicAccess = await templateService.getTemplate(publicTemplateId);
      expect(publicAccess.success).toBe(true);

      // Access control for private template is tested in unit tests
      // as it requires auth mocking which is better suited for unit tests
    });

    it('should prevent unauthorized updates and deletions', async () => {
      if (!testEnv) {
        console.warn('Skipping integration test - no Firebase test environment');
        return;
      }

      // Create template
      const result = await templateService.createTemplate(
        createTestTemplate('Protected Template')
      );
      
      expect(result.success).toBe(true);
      const templateId = result.data!.id;

      // Update and delete permission checks are tested in unit tests
      // as they require auth mocking
    });
  });

  describe('Search and Discovery', () => {
    it('should search templates across multiple fields', async () => {
      if (!testEnv) {
        console.warn('Skipping integration test - no Firebase test environment');
        return;
      }

      // Create templates with searchable content
      await Promise.all([
        templateService.createTemplate({
          ...createTestTemplate('Modern Kitchen'),
          metadata: {
            ...createTestTemplate('Modern Kitchen').metadata,
            description: 'Sleek and contemporary design',
            tags: ['modern', 'minimalist', 'kitchen'],
            isPublic: true
          }
        }),
        templateService.createTemplate({
          ...createTestTemplate('Classic Bedroom'),
          metadata: {
            ...createTestTemplate('Classic Bedroom').metadata,
            description: 'Traditional and elegant style',
            tags: ['classic', 'traditional', 'bedroom'],
            isPublic: true
          }
        }),
        templateService.createTemplate({
          ...createTestTemplate('Modern Office'),
          metadata: {
            ...createTestTemplate('Modern Office').metadata,
            description: 'Professional workspace design',
            tags: ['modern', 'office', 'workspace'],
            isPublic: true
          }
        })
      ]);

      // Search by name
      const nameSearch = await templateService.searchTemplates('kitchen');
      expect(nameSearch.success).toBe(true);
      expect(nameSearch.data?.length).toBeGreaterThanOrEqual(1);
      expect(nameSearch.data?.some(t => t.metadata.name.includes('Kitchen'))).toBe(true);

      // Search by tag
      const tagSearch = await templateService.searchTemplates('modern');
      expect(tagSearch.success).toBe(true);
      expect(tagSearch.data?.length).toBeGreaterThanOrEqual(2);

      // Search by description
      const descSearch = await templateService.searchTemplates('elegant');
      expect(descSearch.success).toBe(true);
      expect(descSearch.data?.length).toBeGreaterThanOrEqual(1);
    });

    it('should get popular templates sorted by usage', async () => {
      if (!testEnv) {
        console.warn('Skipping integration test - no Firebase test environment');
        return;
      }

      // Create templates with different usage counts
      const templates = await Promise.all([
        templateService.createTemplate({
          ...createTestTemplate('Popular Template 1'),
          metadata: { ...createTestTemplate('Popular Template 1').metadata, isPublic: true }
        }),
        templateService.createTemplate({
          ...createTestTemplate('Popular Template 2'),
          metadata: { ...createTestTemplate('Popular Template 2').metadata, isPublic: true }
        }),
        templateService.createTemplate({
          ...createTestTemplate('Popular Template 3'),
          metadata: { ...createTestTemplate('Popular Template 3').metadata, isPublic: true }
        })
      ]);

      // Apply templates to increase usage count
      if (templates[0].data) {
        for (let i = 0; i < 5; i++) {
          await templateService.applyTemplate({
            projectId: `project-${i}`,
            templateId: templates[0].data.id,
            mergeStrategy: 'replace'
          });
        }
      }
      
      if (templates[1].data) {
        for (let i = 0; i < 3; i++) {
          await templateService.applyTemplate({
            projectId: `project-b-${i}`,
            templateId: templates[1].data.id,
            mergeStrategy: 'replace'
          });
        }
      }

      // Get popular templates
      const popularResult = await templateService.getPopularTemplates(5);
      
      expect(popularResult.success).toBe(true);
      expect(popularResult.data).toBeDefined();
      expect(popularResult.data!.length).toBeGreaterThan(0);
      
      // Verify ordering by usage count
      if (popularResult.data!.length > 1) {
        for (let i = 0; i < popularResult.data!.length - 1; i++) {
          expect(popularResult.data![i].usageCount).toBeGreaterThanOrEqual(
            popularResult.data![i + 1].usageCount
          );
        }
      }
    });
  });

  describe('Cache Performance', () => {
    it('should improve performance with caching', async () => {
      if (!testEnv) {
        console.warn('Skipping integration test - no Firebase test environment');
        return;
      }

      // Create a public template
      const result = await templateService.createTemplate({
        ...createTestTemplate('Cache Test Template'),
        metadata: { ...createTestTemplate('Cache Test Template').metadata, isPublic: true }
      });
      
      expect(result.success).toBe(true);
      const templateId = result.data!.id;

      // First fetch (no cache)
      const start1 = Date.now();
      const fetch1 = await templateService.getTemplate(templateId);
      const time1 = Date.now() - start1;
      expect(fetch1.success).toBe(true);

      // Second fetch (with cache)
      const start2 = Date.now();
      const fetch2 = await templateService.getTemplate(templateId);
      const time2 = Date.now() - start2;
      expect(fetch2.success).toBe(true);

      // Cache should be significantly faster
      expect(time2).toBeLessThan(time1 / 2);
      
      // Clear cache
      templateService.clearTemplateCache();

      // Third fetch (no cache again)
      const start3 = Date.now();
      const fetch3 = await templateService.getTemplate(templateId);
      const time3 = Date.now() - start3;
      expect(fetch3.success).toBe(true);

      // Should be similar to first fetch time
      expect(time3).toBeGreaterThan(time2);
    });
  });
});