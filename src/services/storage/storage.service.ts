import {
  Storage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  uploadString,
  getDownloadURL,
  deleteObject,
  listAll,
  list,
  getMetadata,
  updateMetadata,
  UploadTask,
  UploadMetadata,
  SettableMetadata,
  StorageReference,
  ListResult,
  UploadResult,
} from 'firebase/storage';
import { storage as firebaseStorage } from '../../firebase/config';

export interface UploadOptions {
  metadata?: UploadMetadata;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  onComplete?: (downloadURL: string) => void;
  generateThumbnail?: boolean;
  maxSizeBytes?: number;
}

export interface FileMetadata {
  name: string;
  size: number;
  contentType?: string;
  customMetadata?: { [key: string]: string };
  timeCreated: string;
  updated: string;
  downloadURL?: string;
}

export interface ListOptions {
  maxResults?: number;
  pageToken?: string;
}

export class StorageService {
  private storage: Storage;
  private activeUploads: Map<string, UploadTask> = new Map();
  private cdnBaseUrl?: string;

  constructor(cdnBaseUrl?: string) {
    this.storage = firebaseStorage;
    this.cdnBaseUrl = cdnBaseUrl;
  }

  /**
   * 스토리지 경로 생성 헬퍼
   */
  private createStoragePath(
    bucket: 'projects' | 'assets' | 'thumbnails' | 'users',
    ...paths: string[]
  ): string {
    return [bucket, ...paths].filter(Boolean).join('/');
  }

  /**
   * 파일 확장자 추출
   */
  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  /**
   * MIME 타입 추측
   */
  private guessMimeType(filename: string): string {
    const ext = this.getFileExtension(filename);
    const mimeTypes: { [key: string]: string } = {
      // 이미지
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      // 문서
      pdf: 'application/pdf',
      json: 'application/json',
      // 3D 모델
      gltf: 'model/gltf+json',
      glb: 'model/gltf-binary',
      obj: 'model/obj',
      fbx: 'model/fbx',
      // 기타
      txt: 'text/plain',
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 파일 업로드 (진행률 포함)
   */
  async uploadFile(
    file: File | Blob,
    path: string,
    options?: UploadOptions
  ): Promise<string> {
    try {
      // 파일 크기 체크
      if (options?.maxSizeBytes && file.size > options.maxSizeBytes) {
        throw new Error(`File size exceeds maximum allowed size of ${options.maxSizeBytes} bytes`);
      }

      const storageRef = ref(this.storage, path);
      
      // 메타데이터 설정
      const metadata: UploadMetadata = {
        contentType: file.type || this.guessMimeType(path),
        ...options?.metadata,
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          originalName: (file as File).name || 'unknown',
          ...options?.metadata?.customMetadata
        }
      };

      // 진행률 추적이 필요한 경우
      if (options?.onProgress) {
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);
        
        // 업로드 태스크 저장
        this.activeUploads.set(path, uploadTask);

        return new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              options.onProgress?.(progress);
            },
            (error) => {
              this.activeUploads.delete(path);
              options.onError?.(error);
              reject(error);
            },
            async () => {
              this.activeUploads.delete(path);
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              options.onComplete?.(downloadURL);
              
              // 썸네일 생성이 필요한 경우
              if (options.generateThumbnail && file.type?.startsWith('image/')) {
                await this.generateThumbnail(file, path);
              }
              
              resolve(downloadURL);
            }
          );
        });
      } else {
        // 단순 업로드
        const result = await uploadBytes(storageRef, file, metadata);
        const downloadURL = await getDownloadURL(result.ref);
        
        // 썸네일 생성이 필요한 경우
        if (options?.generateThumbnail && file.type?.startsWith('image/')) {
          await this.generateThumbnail(file, path);
        }
        
        return downloadURL;
      }
    } catch (error) {
      console.error(`Error uploading file to ${path}:`, error);
      throw error;
    }
  }

  /**
   * Base64 문자열 업로드
   */
  async uploadString(
    data: string,
    path: string,
    format: 'raw' | 'base64' | 'base64url' | 'data_url',
    metadata?: UploadMetadata
  ): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      const result = await uploadString(storageRef, data, format, metadata);
      return await getDownloadURL(result.ref);
    } catch (error) {
      console.error(`Error uploading string to ${path}:`, error);
      throw error;
    }
  }

  /**
   * 썸네일 생성 (클라이언트 사이드)
   */
  private async generateThumbnail(
    file: File | Blob,
    originalPath: string
  ): Promise<string> {
    try {
      // Canvas를 사용한 썸네일 생성
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      return new Promise((resolve, reject) => {
        img.onload = async () => {
          // 썸네일 크기 설정 (최대 200x200)
          const maxWidth = 200;
          const maxHeight = 200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Canvas를 Blob으로 변환
          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error('Failed to create thumbnail blob'));
              return;
            }

            // 썸네일 경로 생성
            const pathParts = originalPath.split('/');
            pathParts[0] = 'thumbnails'; // 첫 번째 경로를 thumbnails로 변경
            const thumbnailPath = pathParts.join('/');

            // 썸네일 업로드
            const storageRef = ref(this.storage, thumbnailPath);
            const result = await uploadBytes(storageRef, blob, {
              contentType: 'image/jpeg',
              customMetadata: {
                originalPath: originalPath,
                generatedAt: new Date().toISOString()
              }
            });
            
            const thumbnailURL = await getDownloadURL(result.ref);
            resolve(thumbnailURL);
          }, 'image/jpeg', 0.8);
        };

        img.onerror = () => {
          reject(new Error('Failed to load image for thumbnail'));
        };

        // 이미지 로드
        if (file instanceof File) {
          img.src = URL.createObjectURL(file);
        } else {
          const reader = new FileReader();
          reader.onload = (e) => {
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(file);
        }
      });
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      throw error;
    }
  }

  /**
   * 파일 다운로드 URL 가져오기
   */
  async getDownloadURL(path: string): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      const url = await getDownloadURL(storageRef);
      
      // CDN URL로 변환 (설정된 경우)
      if (this.cdnBaseUrl) {
        return this.convertToCDNUrl(url);
      }
      
      return url;
    } catch (error) {
      console.error(`Error getting download URL for ${path}:`, error);
      throw error;
    }
  }

  /**
   * CDN URL로 변환
   */
  private convertToCDNUrl(firebaseUrl: string): string {
    if (!this.cdnBaseUrl) return firebaseUrl;
    
    try {
      const url = new URL(firebaseUrl);
      const path = url.pathname.split('/o/')[1];
      if (path) {
        return `${this.cdnBaseUrl}/${decodeURIComponent(path.split('?')[0])}`;
      }
    } catch (error) {
      console.error('Error converting to CDN URL:', error);
    }
    
    return firebaseUrl;
  }

  /**
   * 파일 삭제
   */
  async deleteFile(path: string): Promise<void> {
    try {
      const storageRef = ref(this.storage, path);
      await deleteObject(storageRef);
      
      // 썸네일도 함께 삭제 시도
      const thumbnailPath = path.replace(/^[^\/]+/, 'thumbnails');
      try {
        const thumbnailRef = ref(this.storage, thumbnailPath);
        await deleteObject(thumbnailRef);
      } catch {
        // 썸네일이 없을 수 있으므로 에러 무시
      }
    } catch (error) {
      console.error(`Error deleting file ${path}:`, error);
      throw error;
    }
  }

  /**
   * 여러 파일 삭제
   */
  async deleteFiles(paths: string[]): Promise<void> {
    const deletePromises = paths.map(path => this.deleteFile(path));
    await Promise.all(deletePromises);
  }

  /**
   * 폴더 내 모든 파일 목록
   */
  async listFiles(
    folderPath: string,
    options?: ListOptions
  ): Promise<{ files: FileMetadata[]; nextPageToken?: string }> {
    try {
      const folderRef = ref(this.storage, folderPath);
      
      let result: ListResult;
      if (options?.maxResults || options?.pageToken) {
        result = await list(folderRef, options);
      } else {
        result = await listAll(folderRef);
      }

      const files: FileMetadata[] = await Promise.all(
        result.items.map(async (itemRef) => {
          const metadata = await getMetadata(itemRef);
          const downloadURL = await getDownloadURL(itemRef);
          
          return {
            name: metadata.name,
            size: metadata.size,
            contentType: metadata.contentType,
            customMetadata: metadata.customMetadata,
            timeCreated: metadata.timeCreated,
            updated: metadata.updated,
            downloadURL
          };
        })
      );

      return {
        files,
        nextPageToken: result.nextPageToken
      };
    } catch (error) {
      console.error(`Error listing files in ${folderPath}:`, error);
      throw error;
    }
  }

  /**
   * 파일 메타데이터 가져오기
   */
  async getFileMetadata(path: string): Promise<FileMetadata> {
    try {
      const storageRef = ref(this.storage, path);
      const metadata = await getMetadata(storageRef);
      const downloadURL = await getDownloadURL(storageRef);
      
      return {
        name: metadata.name,
        size: metadata.size,
        contentType: metadata.contentType,
        customMetadata: metadata.customMetadata,
        timeCreated: metadata.timeCreated,
        updated: metadata.updated,
        downloadURL
      };
    } catch (error) {
      console.error(`Error getting metadata for ${path}:`, error);
      throw error;
    }
  }

  /**
   * 파일 메타데이터 업데이트
   */
  async updateFileMetadata(
    path: string,
    metadata: SettableMetadata
  ): Promise<void> {
    try {
      const storageRef = ref(this.storage, path);
      await updateMetadata(storageRef, metadata);
    } catch (error) {
      console.error(`Error updating metadata for ${path}:`, error);
      throw error;
    }
  }

  /**
   * 업로드 취소
   */
  cancelUpload(path: string): boolean {
    const uploadTask = this.activeUploads.get(path);
    if (uploadTask) {
      uploadTask.cancel();
      this.activeUploads.delete(path);
      return true;
    }
    return false;
  }

  /**
   * 모든 업로드 취소
   */
  cancelAllUploads(): void {
    this.activeUploads.forEach((task) => task.cancel());
    this.activeUploads.clear();
  }

  /**
   * 고아 파일 정리 (참조되지 않는 파일 삭제)
   */
  async cleanupOrphanedFiles(
    validPaths: Set<string>,
    folderPath: string
  ): Promise<number> {
    try {
      const { files } = await this.listFiles(folderPath);
      let deletedCount = 0;

      for (const file of files) {
        const fullPath = `${folderPath}/${file.name}`;
        if (!validPaths.has(fullPath)) {
          await this.deleteFile(fullPath);
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up orphaned files:', error);
      throw error;
    }
  }

  /**
   * 파일 이동/복사 (새 위치로 업로드 후 기존 파일 삭제)
   */
  async moveFile(
    sourcePath: string,
    destinationPath: string,
    deleteSource: boolean = true
  ): Promise<string> {
    try {
      // 원본 파일 메타데이터 가져오기
      const sourceRef = ref(this.storage, sourcePath);
      const metadata = await getMetadata(sourceRef);
      
      // 원본 파일 다운로드
      const downloadURL = await getDownloadURL(sourceRef);
      const response = await fetch(downloadURL);
      const blob = await response.blob();
      
      // 새 위치에 업로드
      const destRef = ref(this.storage, destinationPath);
      const result = await uploadBytes(destRef, blob, {
        contentType: metadata.contentType,
        customMetadata: {
          ...metadata.customMetadata,
          movedFrom: sourcePath,
          movedAt: new Date().toISOString()
        }
      });
      
      const newDownloadURL = await getDownloadURL(result.ref);
      
      // 원본 삭제 (옵션)
      if (deleteSource) {
        await deleteObject(sourceRef);
      }
      
      return newDownloadURL;
    } catch (error) {
      console.error(`Error moving file from ${sourcePath} to ${destinationPath}:`, error);
      throw error;
    }
  }

  /**
   * 스토리지 사용량 계산
   */
  async calculateStorageUsage(folderPath: string): Promise<{
    totalSize: number;
    fileCount: number;
    sizeByType: { [key: string]: number };
  }> {
    try {
      const { files } = await this.listFiles(folderPath);
      
      let totalSize = 0;
      const sizeByType: { [key: string]: number } = {};
      
      files.forEach(file => {
        totalSize += file.size;
        
        const type = file.contentType?.split('/')[0] || 'unknown';
        sizeByType[type] = (sizeByType[type] || 0) + file.size;
      });
      
      return {
        totalSize,
        fileCount: files.length,
        sizeByType
      };
    } catch (error) {
      console.error('Error calculating storage usage:', error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스
export const storageService = new StorageService();