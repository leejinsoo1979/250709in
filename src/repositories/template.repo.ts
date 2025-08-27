/**
 * Template Repository
 * 
 * Infrastructure layer for template data persistence.
 * Handles all Firebase Firestore operations for templates.
 * NO business logic should be in this layer.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  QueryConstraint,
  serverTimestamp,
  increment,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { 
  FirebaseTemplate, 
  ITemplateRepository, 
  TemplateFilters 
} from '@/types/template';
import { getActiveTeamId } from '@/firebase/collections';

/**
 * Template Repository Implementation
 * Handles all database operations for templates
 */
class TemplateRepository implements ITemplateRepository {
  private readonly COLLECTION_NAME = 'templates';
  
  /**
   * Get the collection path for templates
   * Supports both team-scoped and user-scoped templates
   */
  private getCollectionPath(): string {
    const teamId = getActiveTeamId();
    
    if (teamId) {
      // Team-scoped templates
      return `teams/${teamId}/templates`;
    } else {
      // Global templates collection (fallback)
      return this.COLLECTION_NAME;
    }
  }

  /**
   * Get collection reference
   */
  private getCollectionRef() {
    return collection(db, this.getCollectionPath());
  }

  /**
   * Get document reference
   */
  private getDocRef(id: string) {
    return doc(db, this.getCollectionPath(), id);
  }

  /**
   * Create a new template
   */
  async create(data: Omit<FirebaseTemplate, 'id'>): Promise<FirebaseTemplate> {
    try {
      // Prepare data with Firebase timestamps
      const firebaseData = {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Add document to collection
      const docRef = await addDoc(this.getCollectionRef(), firebaseData);

      // Get the created document
      const snapshot = await getDoc(docRef);
      
      if (!snapshot.exists()) {
        throw new Error('Failed to retrieve created template');
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as FirebaseTemplate;
    } catch (error) {
      console.error('Error creating template:', error);
      throw new Error(`Failed to create template: ${error}`);
    }
  }

  /**
   * Find template by ID
   */
  async findById(id: string): Promise<FirebaseTemplate | null> {
    try {
      const docRef = this.getDocRef(id);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as FirebaseTemplate;
    } catch (error) {
      console.error('Error finding template by ID:', error);
      return null;
    }
  }

  /**
   * Find all templates with optional filters
   */
  async findAll(filters?: TemplateFilters): Promise<FirebaseTemplate[]> {
    try {
      const constraints: QueryConstraint[] = [];

      // Apply filters
      if (filters) {
        // User filter
        if (filters.userId) {
          constraints.push(where('userId', '==', filters.userId));
        }

        // Team filter
        if (filters.teamId) {
          constraints.push(where('teamId', '==', filters.teamId));
        }

        // Category filter
        if (filters.category) {
          constraints.push(where('category', '==', filters.category));
        }

        // Public filter
        if (filters.isPublic !== undefined) {
          constraints.push(where('isPublic', '==', filters.isPublic));
        }

        // Tags filter (Firebase array-contains for single tag)
        if (filters.tags && filters.tags.length === 1) {
          constraints.push(where('tags', 'array-contains', filters.tags[0]));
        }

        // Sorting
        const sortField = filters.sortBy || 'updatedAt';
        const sortDirection = filters.sortOrder || 'desc';
        
        switch (sortField) {
          case 'name':
            constraints.push(orderBy('name', sortDirection));
            break;
          case 'createdAt':
            constraints.push(orderBy('createdAt', sortDirection));
            break;
          case 'usageCount':
            constraints.push(orderBy('usageCount', sortDirection));
            break;
          default:
            constraints.push(orderBy('updatedAt', sortDirection));
        }

        // Limit
        if (filters.limit) {
          constraints.push(limit(filters.limit));
        }
      } else {
        // Default sorting
        constraints.push(orderBy('updatedAt', 'desc'));
      }

      // Execute query
      const q = query(this.getCollectionRef(), ...constraints);
      const snapshot = await getDocs(q);

      const templates: FirebaseTemplate[] = [];
      snapshot.forEach((doc) => {
        templates.push({
          id: doc.id,
          ...doc.data()
        } as FirebaseTemplate);
      });

      // Client-side filtering for multiple tags (if needed)
      if (filters?.tags && filters.tags.length > 1) {
        return templates.filter(template => 
          filters.tags!.every(tag => template.tags?.includes(tag))
        );
      }

      // Client-side search term filtering
      if (filters?.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        return templates.filter(template =>
          template.name.toLowerCase().includes(searchLower) ||
          template.description?.toLowerCase().includes(searchLower) ||
          template.tags?.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }

      return templates;
    } catch (error) {
      console.error('Error finding templates:', error);
      
      // Return empty array instead of throwing to prevent UI crashes
      return [];
    }
  }

  /**
   * Update a template
   */
  async update(id: string, data: Partial<FirebaseTemplate>): Promise<void> {
    try {
      const docRef = this.getDocRef(id);
      
      // Ensure updatedAt is always updated
      const updateData = {
        ...data,
        updatedAt: serverTimestamp()
      };

      // Remove undefined fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key as keyof typeof updateData] === undefined) {
          delete updateData[key as keyof typeof updateData];
        }
      });

      await updateDoc(docRef, updateData);
    } catch (error) {
      console.error('Error updating template:', error);
      throw new Error(`Failed to update template: ${error}`);
    }
  }

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    try {
      const docRef = this.getDocRef(id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting template:', error);
      throw new Error(`Failed to delete template: ${error}`);
    }
  }

  /**
   * Increment usage count for a template
   */
  async incrementUsageCount(id: string): Promise<void> {
    try {
      const docRef = this.getDocRef(id);
      await updateDoc(docRef, {
        usageCount: increment(1),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error incrementing usage count:', error);
      // Don't throw error for usage count updates
      // This is not critical for the main operation
    }
  }

  /**
   * Batch create templates (for migration or import)
   */
  async batchCreate(templates: Omit<FirebaseTemplate, 'id'>[]): Promise<string[]> {
    try {
      const createdIds: string[] = [];
      
      // Use Promise.all for parallel creation
      const promises = templates.map(async (template) => {
        const result = await this.create(template);
        return result.id;
      });

      const ids = await Promise.all(promises);
      return ids;
    } catch (error) {
      console.error('Error batch creating templates:', error);
      throw new Error(`Failed to batch create templates: ${error}`);
    }
  }

  /**
   * Check if user has access to template
   * Used for permission checking
   */
  async hasAccess(templateId: string, userId: string): Promise<boolean> {
    try {
      const template = await this.findById(templateId);
      
      if (!template) {
        return false;
      }

      // Public templates are accessible to all
      if (template.isPublic) {
        return true;
      }

      // Check ownership
      if (template.userId === userId) {
        return true;
      }

      // Check team membership (if applicable)
      const teamId = getActiveTeamId();
      if (teamId && template.teamId === teamId) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking template access:', error);
      return false;
    }
  }

  /**
   * Get user's template count
   * Used for quota checking
   */
  async getUserTemplateCount(userId: string): Promise<number> {
    try {
      const constraints: QueryConstraint[] = [
        where('userId', '==', userId)
      ];

      const q = query(this.getCollectionRef(), ...constraints);
      const snapshot = await getDocs(q);
      
      return snapshot.size;
    } catch (error) {
      console.error('Error getting user template count:', error);
      return 0;
    }
  }

  /**
   * Search templates by name (for autocomplete)
   */
  async searchByName(searchTerm: string, limit: number = 10): Promise<FirebaseTemplate[]> {
    try {
      // Firebase doesn't support full-text search natively
      // This is a simple implementation that gets all and filters client-side
      // For production, consider using Algolia or ElasticSearch
      
      const allTemplates = await this.findAll({
        sortBy: 'name',
        sortOrder: 'asc'
      });

      const searchLower = searchTerm.toLowerCase();
      const filtered = allTemplates
        .filter(template => 
          template.name.toLowerCase().includes(searchLower)
        )
        .slice(0, limit);

      return filtered;
    } catch (error) {
      console.error('Error searching templates:', error);
      return [];
    }
  }

  /**
   * Get most used templates
   * Useful for suggestions and recommendations
   */
  async getMostUsed(limit: number = 10): Promise<FirebaseTemplate[]> {
    try {
      return this.findAll({
        sortBy: 'usageCount',
        sortOrder: 'desc',
        limit
      });
    } catch (error) {
      console.error('Error getting most used templates:', error);
      return [];
    }
  }

  /**
   * Get recently created templates
   */
  async getRecent(limit: number = 10): Promise<FirebaseTemplate[]> {
    try {
      return this.findAll({
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit
      });
    } catch (error) {
      console.error('Error getting recent templates:', error);
      return [];
    }
  }
}

// Export singleton instance
export const templateRepository = new TemplateRepository();