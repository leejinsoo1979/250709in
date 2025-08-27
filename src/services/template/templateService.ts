/**
 * Template Service
 * 
 * Orchestrates template business logic and coordinates between UI and repository layers.
 * This service ensures clean separation of concerns and enforces business rules.
 */

import { 
  Template, 
  CreateTemplateDTO, 
  UpdateTemplateDTO, 
  TemplateListItemDTO,
  ApplyTemplateDTO,
  TemplateFilters,
  ITemplateService,
  TemplateError,
  TemplateErrorCode,
  FirebaseTemplate
} from '@/types/template';
import { templateRepository } from '@/repositories/template.repo';
import { templateStorageRepository } from '@/repositories/templateStorage.repo';
import { thumbnailService } from './thumbnailService';
import { useSpaceConfigStore } from '@/store/core/spaceConfigStore';
import { useFurnitureStore } from '@/store/core/furnitureStore';
import { getCurrentUserAsync } from '@/firebase/auth';
import { getActiveTeamId } from '@/firebase/collections';

/**
 * Template Service Implementation
 * Handles all business logic for template operations
 */
class TemplateService implements ITemplateService {
  private readonly MAX_TEMPLATES_PER_USER = 50;
  private readonly MAX_TEMPLATE_NAME_LENGTH = 100;
  private readonly MAX_DESCRIPTION_LENGTH = 500;
  private readonly MAX_TAGS = 10;

  /**
   * Create a new template from current workspace
   */
  async create(dto: CreateTemplateDTO): Promise<Template> {
    try {
      // Validate input
      this.validateCreateDTO(dto);

      // Get current user and team
      const user = await getCurrentUserAsync();
      if (!user) {
        throw new TemplateError(
          'User must be authenticated to create templates',
          TemplateErrorCode.PERMISSION_DENIED
        );
      }

      const teamId = getActiveTeamId();

      // Check user quota
      await this.checkUserQuota(user.uid);

      // Process thumbnail if provided
      let thumbnailUrl: string | undefined;
      if (dto.thumbnail) {
        try {
          // Generate a temporary ID for storage
          const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          thumbnailUrl = await templateStorageRepository.uploadThumbnail(tempId, dto.thumbnail);
        } catch (error) {
          console.warn('Failed to upload thumbnail, continuing without it:', error);
          // Continue without thumbnail rather than failing the entire operation
        }
      }

      // Prepare Firebase document
      const firebaseData: Omit<FirebaseTemplate, 'id'> = {
        userId: user.uid,
        teamId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        thumbnailUrl,
        category: dto.category,
        tags: dto.tags?.slice(0, this.MAX_TAGS),
        usageCount: 0,
        isPublic: dto.isPublic ?? false,
        spaceConfig: dto.spaceConfig,
        furniture: {
          placedModules: dto.furniture
        },
        createdAt: new Date() as any, // Will be converted to Timestamp by repo
        updatedAt: new Date() as any,
        createdBy: user.uid,
        version: '1.0.0'
      };

      // Save to repository
      const saved = await templateRepository.create(firebaseData);

      // Convert to domain model
      return this.toDomainModel(saved);
    } catch (error) {
      if (error instanceof TemplateError) throw error;
      throw new TemplateError(
        'Failed to create template',
        TemplateErrorCode.INVALID_DATA,
        error
      );
    }
  }

  /**
   * List templates with optional filters
   */
  async list(filters?: TemplateFilters): Promise<TemplateListItemDTO[]> {
    try {
      const user = await getCurrentUserAsync();
      const teamId = getActiveTeamId();

      // Add user/team context to filters
      const contextFilters: TemplateFilters = {
        ...filters,
        userId: filters?.isPublic ? undefined : user?.uid,
        teamId
      };

      // Query repository
      const templates = await templateRepository.findAll(contextFilters);

      // Convert to DTOs
      return templates.map(this.toListItemDTO);
    } catch (error) {
      console.error('Failed to list templates:', error);
      return []; // Return empty list on error for better UX
    }
  }

  /**
   * Get template by ID
   */
  async getById(id: string): Promise<Template> {
    try {
      const template = await templateRepository.findById(id);
      
      if (!template) {
        throw new TemplateError(
          `Template with ID ${id} not found`,
          TemplateErrorCode.NOT_FOUND
        );
      }

      // Check access permissions
      await this.checkAccessPermission(template);

      return this.toDomainModel(template);
    } catch (error) {
      if (error instanceof TemplateError) throw error;
      throw new TemplateError(
        'Failed to get template',
        TemplateErrorCode.INVALID_DATA,
        error
      );
    }
  }

  /**
   * Update an existing template
   */
  async update(id: string, dto: UpdateTemplateDTO): Promise<Template> {
    try {
      // Validate input
      this.validateUpdateDTO(dto);

      // Get existing template
      const existing = await templateRepository.findById(id);
      if (!existing) {
        throw new TemplateError(
          `Template with ID ${id} not found`,
          TemplateErrorCode.NOT_FOUND
        );
      }

      // Check edit permissions
      await this.checkEditPermission(existing);

      // Handle thumbnail update
      let thumbnailUrl = existing.thumbnailUrl;
      if (dto.thumbnail !== undefined) {
        if (dto.thumbnail) {
          // Upload new thumbnail
          thumbnailUrl = await templateStorageRepository.uploadThumbnail(id, dto.thumbnail);
        } else {
          // Delete existing thumbnail
          if (existing.thumbnailUrl) {
            await templateStorageRepository.deleteThumbnail(id);
            thumbnailUrl = undefined;
          }
        }
      }

      // Prepare update data
      const updateData: Partial<FirebaseTemplate> = {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.tags !== undefined && { tags: dto.tags?.slice(0, this.MAX_TAGS) }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        thumbnailUrl,
        updatedAt: new Date() as any
      };

      // Update in repository
      await templateRepository.update(id, updateData);

      // Get updated template
      const updated = await templateRepository.findById(id);
      return this.toDomainModel(updated!);
    } catch (error) {
      if (error instanceof TemplateError) throw error;
      throw new TemplateError(
        'Failed to update template',
        TemplateErrorCode.INVALID_DATA,
        error
      );
    }
  }

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    try {
      // Get template
      const template = await templateRepository.findById(id);
      if (!template) {
        throw new TemplateError(
          `Template with ID ${id} not found`,
          TemplateErrorCode.NOT_FOUND
        );
      }

      // Check delete permissions
      await this.checkEditPermission(template);

      // Delete thumbnail if exists
      if (template.thumbnailUrl) {
        try {
          await templateStorageRepository.deleteThumbnail(id);
        } catch (error) {
          console.warn('Failed to delete thumbnail:', error);
          // Continue with deletion even if thumbnail deletion fails
        }
      }

      // Delete from repository
      await templateRepository.delete(id);
    } catch (error) {
      if (error instanceof TemplateError) throw error;
      throw new TemplateError(
        'Failed to delete template',
        TemplateErrorCode.INVALID_DATA,
        error
      );
    }
  }

  /**
   * Apply a template to the current workspace
   */
  async apply(dto: ApplyTemplateDTO): Promise<void> {
    try {
      // Get template
      const template = await this.getById(dto.templateId);

      // Increment usage count
      await templateRepository.incrementUsageCount(dto.templateId);

      // Get store instances
      const spaceStore = useSpaceConfigStore.getState();
      const furnitureStore = useFurnitureStore.getState();

      // Apply space configuration if requested
      if (dto.applySpace !== false) {
        spaceStore.setSpaceInfo(template.spaceConfig);
      }

      // Apply furniture placement if requested
      if (dto.applyFurniture !== false) {
        if (!dto.preserveExisting) {
          // Clear existing furniture
          furnitureStore.clearAllModules();
        }

        // Add template furniture
        template.furniture.forEach(module => {
          furnitureStore.addModule({
            ...module,
            // Generate new IDs to avoid conflicts
            id: `${module.moduleId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          });
        });
      }
    } catch (error) {
      if (error instanceof TemplateError) throw error;
      throw new TemplateError(
        'Failed to apply template',
        TemplateErrorCode.APPLY_ERROR,
        error
      );
    }
  }

  /**
   * Duplicate an existing template
   */
  async duplicate(id: string, newName: string): Promise<Template> {
    try {
      // Get original template
      const original = await this.getById(id);

      // Create a copy with new name
      const dto: CreateTemplateDTO = {
        name: newName,
        description: original.metadata.isPublic 
          ? `Duplicated from "${original.name}"` 
          : original.description,
        category: original.metadata.category,
        tags: original.metadata.tags,
        isPublic: false, // Duplicates are private by default
        thumbnail: original.thumbnail, // Will be re-uploaded with new ID
        spaceConfig: original.spaceConfig,
        furniture: original.furniture
      };

      return this.create(dto);
    } catch (error) {
      if (error instanceof TemplateError) throw error;
      throw new TemplateError(
        'Failed to duplicate template',
        TemplateErrorCode.INVALID_DATA,
        error
      );
    }
  }

  /**
   * Generate thumbnail for current workspace
   */
  async generateThumbnail(): Promise<string> {
    return thumbnailService.captureWorkspace();
  }

  // ============= Private Helper Methods =============

  private validateCreateDTO(dto: CreateTemplateDTO): void {
    if (!dto.name?.trim()) {
      throw new TemplateError(
        'Template name is required',
        TemplateErrorCode.INVALID_DATA
      );
    }

    if (dto.name.length > this.MAX_TEMPLATE_NAME_LENGTH) {
      throw new TemplateError(
        `Template name must be less than ${this.MAX_TEMPLATE_NAME_LENGTH} characters`,
        TemplateErrorCode.INVALID_DATA
      );
    }

    if (dto.description && dto.description.length > this.MAX_DESCRIPTION_LENGTH) {
      throw new TemplateError(
        `Description must be less than ${this.MAX_DESCRIPTION_LENGTH} characters`,
        TemplateErrorCode.INVALID_DATA
      );
    }

    if (dto.tags && dto.tags.length > this.MAX_TAGS) {
      throw new TemplateError(
        `Maximum ${this.MAX_TAGS} tags allowed`,
        TemplateErrorCode.INVALID_DATA
      );
    }

    if (!dto.spaceConfig || !dto.furniture) {
      throw new TemplateError(
        'Template must include space configuration and furniture data',
        TemplateErrorCode.INVALID_DATA
      );
    }
  }

  private validateUpdateDTO(dto: UpdateTemplateDTO): void {
    if (dto.name !== undefined) {
      if (!dto.name.trim()) {
        throw new TemplateError(
          'Template name cannot be empty',
          TemplateErrorCode.INVALID_DATA
        );
      }

      if (dto.name.length > this.MAX_TEMPLATE_NAME_LENGTH) {
        throw new TemplateError(
          `Template name must be less than ${this.MAX_TEMPLATE_NAME_LENGTH} characters`,
          TemplateErrorCode.INVALID_DATA
        );
      }
    }

    if (dto.description && dto.description.length > this.MAX_DESCRIPTION_LENGTH) {
      throw new TemplateError(
        `Description must be less than ${this.MAX_DESCRIPTION_LENGTH} characters`,
        TemplateErrorCode.INVALID_DATA
      );
    }

    if (dto.tags && dto.tags.length > this.MAX_TAGS) {
      throw new TemplateError(
        `Maximum ${this.MAX_TAGS} tags allowed`,
        TemplateErrorCode.INVALID_DATA
      );
    }
  }

  private async checkUserQuota(userId: string): Promise<void> {
    const filters: TemplateFilters = {
      userId,
      limit: this.MAX_TEMPLATES_PER_USER + 1
    };

    const userTemplates = await templateRepository.findAll(filters);
    
    if (userTemplates.length >= this.MAX_TEMPLATES_PER_USER) {
      throw new TemplateError(
        `Maximum ${this.MAX_TEMPLATES_PER_USER} templates allowed per user`,
        TemplateErrorCode.QUOTA_EXCEEDED
      );
    }
  }

  private async checkAccessPermission(template: FirebaseTemplate): Promise<void> {
    const user = await getCurrentUserAsync();
    
    // Public templates are accessible to all
    if (template.isPublic) return;

    // Check if user owns the template or belongs to the same team
    if (user?.uid !== template.userId) {
      const teamId = getActiveTeamId();
      if (!teamId || teamId !== template.teamId) {
        throw new TemplateError(
          'You do not have permission to access this template',
          TemplateErrorCode.PERMISSION_DENIED
        );
      }
    }
  }

  private async checkEditPermission(template: FirebaseTemplate): Promise<void> {
    const user = await getCurrentUserAsync();
    
    if (user?.uid !== template.userId) {
      throw new TemplateError(
        'You do not have permission to modify this template',
        TemplateErrorCode.PERMISSION_DENIED
      );
    }
  }

  private toDomainModel(firebase: FirebaseTemplate): Template {
    return {
      id: firebase.id!,
      name: firebase.name,
      description: firebase.description,
      thumbnail: firebase.thumbnailUrl,
      spaceConfig: firebase.spaceConfig,
      furniture: firebase.furniture.placedModules,
      metadata: {
        category: firebase.category,
        tags: firebase.tags,
        usageCount: firebase.usageCount,
        isPublic: firebase.isPublic,
        createdBy: firebase.createdBy,
        createdAt: firebase.createdAt.toDate(),
        updatedAt: firebase.updatedAt.toDate()
      }
    };
  }

  private toListItemDTO(firebase: FirebaseTemplate): TemplateListItemDTO {
    return {
      id: firebase.id!,
      name: firebase.name,
      description: firebase.description,
      thumbnail: firebase.thumbnailUrl,
      category: firebase.category,
      tags: firebase.tags,
      usageCount: firebase.usageCount,
      isPublic: firebase.isPublic,
      createdAt: firebase.createdAt.toDate(),
      updatedAt: firebase.updatedAt.toDate()
    };
  }
}

// Export singleton instance
export const templateService = new TemplateService();