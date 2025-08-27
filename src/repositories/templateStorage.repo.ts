/**
 * Template Storage Repository
 * 
 * Infrastructure layer for template file storage operations.
 * Handles Firebase Storage operations for template thumbnails.
 * NO business logic should be in this layer.
 */

import {
  ref,
  uploadString,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll
} from 'firebase/storage';
import { storage } from '@/firebase/config';
import { ITemplateStorageRepository } from '@/types/template';
import { getActiveTeamId } from '@/firebase/collections';

/**
 * Template Storage Repository Implementation
 * Handles all storage operations for template assets
 */
class TemplateStorageRepository implements ITemplateStorageRepository {
  private readonly STORAGE_BASE_PATH = 'template-thumbnails';
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  /**
   * Get the storage path for a template's thumbnail
   */
  private getThumbnailPath(templateId: string): string {
    const teamId = getActiveTeamId();
    
    if (teamId) {
      // Team-scoped path
      return `${this.STORAGE_BASE_PATH}/teams/${teamId}/${templateId}`;
    } else {
      // User-scoped path (fallback)
      return `${this.STORAGE_BASE_PATH}/users/${templateId}`;
    }
  }

  /**
   * Upload thumbnail for a template
   * Accepts base64 data URL and returns the storage URL
   */
  async uploadThumbnail(templateId: string, dataUrl: string): Promise<string> {
    try {
      // Validate data URL
      if (!this.isValidDataUrl(dataUrl)) {
        throw new Error('Invalid data URL format');
      }

      // Check file size (rough estimate)
      const sizeEstimate = this.estimateDataUrlSize(dataUrl);
      if (sizeEstimate > this.MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      // Get storage reference
      const storagePath = this.getThumbnailPath(templateId);
      const storageRef = ref(storage, storagePath);

      // Upload the data URL string
      const snapshot = await uploadString(storageRef, dataUrl, 'data_url');

      // Get the download URL
      const downloadUrl = await getDownloadURL(snapshot.ref);

      return downloadUrl;
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      throw new Error(`Failed to upload thumbnail: ${error}`);
    }
  }

  /**
   * Upload thumbnail as blob
   * Alternative method for blob/file uploads
   */
  async uploadThumbnailBlob(templateId: string, blob: Blob): Promise<string> {
    try {
      // Validate file size
      if (blob.size > this.MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
      }

      // Get storage reference
      const storagePath = this.getThumbnailPath(templateId);
      const storageRef = ref(storage, storagePath);

      // Upload the blob
      const snapshot = await uploadBytes(storageRef, blob, {
        contentType: blob.type || 'image/jpeg'
      });

      // Get the download URL
      const downloadUrl = await getDownloadURL(snapshot.ref);

      return downloadUrl;
    } catch (error) {
      console.error('Error uploading thumbnail blob:', error);
      throw new Error(`Failed to upload thumbnail: ${error}`);
    }
  }

  /**
   * Delete thumbnail for a template
   */
  async deleteThumbnail(templateId: string): Promise<void> {
    try {
      const storagePath = this.getThumbnailPath(templateId);
      const storageRef = ref(storage, storagePath);

      await deleteObject(storageRef);
    } catch (error: any) {
      // Ignore 'object-not-found' errors
      if (error?.code === 'storage/object-not-found') {
        console.log('Thumbnail already deleted or does not exist');
        return;
      }

      console.error('Error deleting thumbnail:', error);
      throw new Error(`Failed to delete thumbnail: ${error}`);
    }
  }

  /**
   * Get thumbnail URL for a template
   * Returns null if thumbnail doesn't exist
   */
  async getThumbnailUrl(templateId: string): Promise<string | null> {
    try {
      const storagePath = this.getThumbnailPath(templateId);
      const storageRef = ref(storage, storagePath);

      const url = await getDownloadURL(storageRef);
      return url;
    } catch (error: any) {
      // Return null if file doesn't exist
      if (error?.code === 'storage/object-not-found') {
        return null;
      }

      console.error('Error getting thumbnail URL:', error);
      return null;
    }
  }

  /**
   * Check if thumbnail exists for a template
   */
  async thumbnailExists(templateId: string): Promise<boolean> {
    try {
      const url = await this.getThumbnailUrl(templateId);
      return url !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Copy thumbnail from one template to another
   * Useful for template duplication
   */
  async copyThumbnail(sourceId: string, destinationId: string): Promise<string | null> {
    try {
      // Get source URL
      const sourceUrl = await this.getThumbnailUrl(sourceId);
      
      if (!sourceUrl) {
        return null;
      }

      // Fetch the image data
      const response = await fetch(sourceUrl);
      const blob = await response.blob();

      // Upload to new location
      const newUrl = await this.uploadThumbnailBlob(destinationId, blob);
      
      return newUrl;
    } catch (error) {
      console.error('Error copying thumbnail:', error);
      return null;
    }
  }

  /**
   * Clean up orphaned thumbnails
   * Removes thumbnails that don't have corresponding templates
   */
  async cleanupOrphanedThumbnails(validTemplateIds: string[]): Promise<number> {
    try {
      const teamId = getActiveTeamId();
      const basePath = teamId 
        ? `${this.STORAGE_BASE_PATH}/teams/${teamId}`
        : `${this.STORAGE_BASE_PATH}/users`;

      const listRef = ref(storage, basePath);
      const result = await listAll(listRef);

      let deletedCount = 0;

      for (const itemRef of result.items) {
        // Extract template ID from path
        const templateId = itemRef.name;

        // Check if this template ID is valid
        if (!validTemplateIds.includes(templateId)) {
          try {
            await deleteObject(itemRef);
            deletedCount++;
          } catch (deleteError) {
            console.warn(`Failed to delete orphaned thumbnail: ${templateId}`, deleteError);
          }
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up orphaned thumbnails:', error);
      return 0;
    }
  }

  /**
   * Get storage usage statistics
   * Returns information about storage usage for monitoring
   */
  async getStorageStats(): Promise<{
    count: number;
    estimatedSize: number;
    paths: string[];
  }> {
    try {
      const teamId = getActiveTeamId();
      const basePath = teamId 
        ? `${this.STORAGE_BASE_PATH}/teams/${teamId}`
        : `${this.STORAGE_BASE_PATH}/users`;

      const listRef = ref(storage, basePath);
      const result = await listAll(listRef);

      const paths = result.items.map(item => item.fullPath);

      // Note: Firebase Storage doesn't provide file sizes directly
      // This is an estimate based on typical thumbnail sizes
      const estimatedSizePerFile = 50 * 1024; // 50KB average
      const estimatedSize = result.items.length * estimatedSizePerFile;

      return {
        count: result.items.length,
        estimatedSize,
        paths
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        count: 0,
        estimatedSize: 0,
        paths: []
      };
    }
  }

  // ============= Private Helper Methods =============

  /**
   * Validate data URL format
   */
  private isValidDataUrl(dataUrl: string): boolean {
    if (!dataUrl || typeof dataUrl !== 'string') {
      return false;
    }

    // Check for valid data URL pattern
    const pattern = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/;
    return pattern.test(dataUrl);
  }

  /**
   * Estimate the size of a base64 data URL in bytes
   */
  private estimateDataUrlSize(dataUrl: string): number {
    // Remove the data URL prefix
    const base64String = dataUrl.split(',')[1] || '';
    
    // Calculate the approximate size
    // Base64 encoding increases size by ~33%
    const sizeInBytes = (base64String.length * 3) / 4;
    
    return sizeInBytes;
  }

  /**
   * Convert data URL to Blob
   * Utility method for data URL manipulation
   */
  private dataUrlToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Optimize image data URL
   * Reduces quality and size if needed
   */
  private async optimizeDataUrl(dataUrl: string, maxWidth: number = 800): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to create canvas context'));
          return;
        }

        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG with 80% quality for better compression
        const optimized = canvas.toDataURL('image/jpeg', 0.8);
        resolve(optimized);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for optimization'));
      };

      img.src = dataUrl;
    });
  }
}

// Export singleton instance
export const templateStorageRepository = new TemplateStorageRepository();