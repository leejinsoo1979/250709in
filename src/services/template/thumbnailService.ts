/**
 * Thumbnail Service
 * 
 * Handles thumbnail generation from the 3D workspace canvas.
 * Utilizes existing thumbnail capture utilities and provides clean API for template service.
 */

import { 
  findThreeCanvas, 
  find3DViewerContainer,
  captureThumbnail as existingCaptureThumbnail 
} from '@/editor/shared/utils/thumbnailCapture';

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'png' | 'jpeg' | 'webp';
  backgroundColor?: string;
}

/**
 * Thumbnail Service Class
 * Provides methods for capturing and processing thumbnails from 3D workspace
 */
class ThumbnailService {
  private readonly DEFAULT_WIDTH = 400;
  private readonly DEFAULT_HEIGHT = 300;
  private readonly DEFAULT_QUALITY = 0.8;
  private readonly DEFAULT_FORMAT = 'jpeg';

  /**
   * Capture thumbnail from current workspace
   * Returns base64 data URL of the captured image
   */
  async captureWorkspace(options?: ThumbnailOptions): Promise<string> {
    try {
      // Find the Three.js canvas
      const canvas = findThreeCanvas();
      
      if (!canvas) {
        throw new Error('3D canvas not found. Make sure the workspace is rendered.');
      }

      // Wait a frame to ensure render is complete
      await this.waitForNextFrame();

      // Capture the canvas
      const dataUrl = await this.captureCanvas(canvas, options);
      
      return dataUrl;
    } catch (error) {
      console.error('Failed to capture workspace thumbnail:', error);
      throw new Error('Failed to generate thumbnail from workspace');
    }
  }

  /**
   * Capture thumbnail from a specific HTML element
   * Useful for capturing specific views or components
   */
  async captureElement(element: HTMLElement, options?: ThumbnailOptions): Promise<string> {
    try {
      // Use html2canvas or similar library for HTML element capture
      // For now, we'll focus on canvas capture
      const canvas = element.querySelector('canvas') as HTMLCanvasElement;
      
      if (!canvas) {
        throw new Error('No canvas found in the specified element');
      }

      return this.captureCanvas(canvas, options);
    } catch (error) {
      console.error('Failed to capture element thumbnail:', error);
      throw new Error('Failed to generate thumbnail from element');
    }
  }

  /**
   * Process and optimize thumbnail data
   * Reduces file size while maintaining quality
   */
  async optimizeThumbnail(dataUrl: string, options?: ThumbnailOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to create canvas context'));
            return;
          }

          // Set dimensions
          const width = options?.width || this.DEFAULT_WIDTH;
          const height = options?.height || this.DEFAULT_HEIGHT;
          
          canvas.width = width;
          canvas.height = height;

          // Calculate scaling to maintain aspect ratio
          const scale = Math.min(width / img.width, height / img.height);
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          const x = (width - scaledWidth) / 2;
          const y = (height - scaledHeight) / 2;

          // Fill background if specified
          if (options?.backgroundColor) {
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(0, 0, width, height);
          }

          // Draw scaled image
          ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

          // Convert to data URL with specified format and quality
          const format = options?.format || this.DEFAULT_FORMAT;
          const quality = options?.quality || this.DEFAULT_QUALITY;
          const optimizedDataUrl = canvas.toDataURL(`image/${format}`, quality);
          
          resolve(optimizedDataUrl);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for optimization'));
      };

      img.src = dataUrl;
    });
  }

  /**
   * Generate placeholder thumbnail when capture fails
   * Returns a simple SVG placeholder
   */
  generatePlaceholder(text: string = 'No Preview'): string {
    const width = this.DEFAULT_WIDTH;
    const height = this.DEFAULT_HEIGHT;
    
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#f0f0f0"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#999" font-family="Arial, sans-serif" font-size="16">
          ${text}
        </text>
      </svg>
    `;
    
    // Convert SVG to data URL
    const encoded = btoa(svg);
    return `data:image/svg+xml;base64,${encoded}`;
  }

  /**
   * Validate thumbnail data URL
   * Checks if the data URL is valid and contains image data
   */
  validateThumbnail(dataUrl: string): boolean {
    if (!dataUrl || typeof dataUrl !== 'string') {
      return false;
    }

    // Check if it's a valid data URL
    const dataUrlPattern = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/;
    if (!dataUrlPattern.test(dataUrl)) {
      return false;
    }

    // Check minimum size (rough estimate)
    const minSize = 100; // Minimum expected base64 string length
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data || base64Data.length < minSize) {
      return false;
    }

    return true;
  }

  /**
   * Extract metadata from thumbnail
   * Returns dimensions and format information
   */
  async getThumbnailMetadata(dataUrl: string): Promise<{
    width: number;
    height: number;
    format: string;
    sizeInBytes: number;
  }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        // Extract format from data URL
        const formatMatch = dataUrl.match(/data:image\/(\w+);/);
        const format = formatMatch ? formatMatch[1] : 'unknown';
        
        // Calculate approximate size in bytes
        const base64Data = dataUrl.split(',')[1];
        const sizeInBytes = Math.floor((base64Data.length * 3) / 4);
        
        resolve({
          width: img.width,
          height: img.height,
          format,
          sizeInBytes
        });
      };

      img.onerror = () => {
        reject(new Error('Failed to load thumbnail for metadata extraction'));
      };

      img.src = dataUrl;
    });
  }

  // ============= Private Helper Methods =============

  /**
   * Capture canvas to data URL with options
   */
  private async captureCanvas(
    canvas: HTMLCanvasElement, 
    options?: ThumbnailOptions
  ): Promise<string> {
    // If we need to resize, create a new canvas
    if (options?.width || options?.height) {
      return this.captureAndResize(canvas, options);
    }

    // Direct capture with format and quality
    const format = options?.format || this.DEFAULT_FORMAT;
    const quality = options?.quality || this.DEFAULT_QUALITY;
    
    return canvas.toDataURL(`image/${format}`, quality);
  }

  /**
   * Capture and resize canvas
   */
  private async captureAndResize(
    sourceCanvas: HTMLCanvasElement,
    options?: ThumbnailOptions
  ): Promise<string> {
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to create temporary canvas context');
    }

    // Set target dimensions
    const targetWidth = options?.width || this.DEFAULT_WIDTH;
    const targetHeight = options?.height || this.DEFAULT_HEIGHT;
    
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;

    // Calculate scaling to maintain aspect ratio
    const scale = Math.min(
      targetWidth / sourceCanvas.width,
      targetHeight / sourceCanvas.height
    );
    
    const scaledWidth = sourceCanvas.width * scale;
    const scaledHeight = sourceCanvas.height * scale;
    const x = (targetWidth - scaledWidth) / 2;
    const y = (targetHeight - scaledHeight) / 2;

    // Fill background if specified
    if (options?.backgroundColor) {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    } else {
      // Default white background for JPEG
      if (options?.format === 'jpeg' || !options?.format) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      }
    }

    // Draw scaled source canvas
    ctx.drawImage(sourceCanvas, x, y, scaledWidth, scaledHeight);

    // Convert to data URL
    const format = options?.format || this.DEFAULT_FORMAT;
    const quality = options?.quality || this.DEFAULT_QUALITY;
    
    return tempCanvas.toDataURL(`image/${format}`, quality);
  }

  /**
   * Wait for next animation frame
   * Ensures render is complete before capture
   */
  private waitForNextFrame(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }

  /**
   * Convert blob to data URL
   */
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert data URL to blob
   */
  private dataUrlToBlob(dataUrl: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1];
      
      if (!mime) {
        reject(new Error('Invalid data URL format'));
        return;
      }

      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      
      resolve(new Blob([u8arr], { type: mime }));
    });
  }
}

// Export singleton instance
export const thumbnailService = new ThumbnailService();