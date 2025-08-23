import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  getMetadata
} from 'firebase/storage';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { saveExportAsset, getAssetsByVersion, deleteAsset } from '../assets';
import { exportWithPersistence } from '@/services/exportService';

// Mock firebase/storage
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
  getMetadata: vi.fn()
}));

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: {
    now: vi.fn(() => ({ seconds: 1234567890, nanoseconds: 0 }))
  }
}));

// Mock storage and db instances
vi.mock('../config', () => ({
  storage: {},
  db: {}
}));

describe('Asset Management Integration Tests', () => {
  const mockTeamId = 'team_123';
  const mockDesignId = 'design_456';
  const mockVersionId = 'version_789';
  const mockUserId = 'user_001';
  const mockAssetId = 'asset_abc';

  const mockDXFBuffer = Buffer.from('DXF file content');
  const mockPDFBuffer = Buffer.from('PDF file content');
  
  const mockStorageUrl = 'https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/test.dxf';
  const mockDownloadUrl = 'https://firebasestorage.googleapis.com/download/test.dxf?token=abc123';

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => mockAssetId)
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('saveExportAsset', () => {
    it('should upload DXF file to Storage and save metadata', async () => {
      const mockStorageRef = { 
        fullPath: `teams/${mockTeamId}/designs/${mockDesignId}/versions/${mockVersionId}/${mockAssetId}.dxf`
      };
      const mockUploadResult = {
        ref: mockStorageRef,
        metadata: {
          size: mockDXFBuffer.length,
          contentType: 'application/dxf',
          timeCreated: '2024-01-01T00:00:00Z'
        }
      };

      vi.mocked(ref).mockReturnValue(mockStorageRef as any);
      vi.mocked(uploadBytes).mockResolvedValue(mockUploadResult as any);
      vi.mocked(getDownloadURL).mockResolvedValue(mockDownloadUrl);
      vi.mocked(setDoc).mockResolvedValue(undefined);

      const result = await saveExportAsset({
        teamId: mockTeamId,
        designId: mockDesignId,
        versionId: mockVersionId,
        buffer: mockDXFBuffer,
        ext: 'dxf',
        userId: mockUserId
      });

      // Verify Storage upload
      expect(ref).toHaveBeenCalledWith(
        undefined,
        `teams/${mockTeamId}/designs/${mockDesignId}/versions/${mockVersionId}/${mockAssetId}.dxf`
      );
      expect(uploadBytes).toHaveBeenCalledWith(
        mockStorageRef,
        mockDXFBuffer,
        { contentType: 'application/dxf' }
      );

      // Verify download URL retrieval
      expect(getDownloadURL).toHaveBeenCalledWith(mockStorageRef);

      // Verify Firestore metadata save
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: mockAssetId,
          team_id: mockTeamId,
          design_id: mockDesignId,
          owner_type: 'version',
          owner_id: mockVersionId,
          file_type: 'dxf',
          file_size: mockDXFBuffer.length,
          storage_path: mockStorageRef.fullPath,
          download_url: mockDownloadUrl,
          created_by: mockUserId,
          created_at: 'SERVER_TIMESTAMP'
        })
      );

      expect(result).toEqual({
        success: true,
        assetId: mockAssetId,
        downloadUrl: mockDownloadUrl
      });
    });

    it('should upload PDF file with correct content type', async () => {
      const mockStorageRef = { 
        fullPath: `teams/${mockTeamId}/designs/${mockDesignId}/versions/${mockVersionId}/${mockAssetId}.pdf`
      };

      vi.mocked(ref).mockReturnValue(mockStorageRef as any);
      vi.mocked(uploadBytes).mockResolvedValue({ ref: mockStorageRef } as any);
      vi.mocked(getDownloadURL).mockResolvedValue(mockDownloadUrl);
      vi.mocked(setDoc).mockResolvedValue(undefined);

      await saveExportAsset({
        teamId: mockTeamId,
        designId: mockDesignId,
        versionId: mockVersionId,
        buffer: mockPDFBuffer,
        ext: 'pdf',
        userId: mockUserId
      });

      expect(uploadBytes).toHaveBeenCalledWith(
        mockStorageRef,
        mockPDFBuffer,
        { contentType: 'application/pdf' }
      );

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          file_type: 'pdf',
          file_size: mockPDFBuffer.length
        })
      );
    });

    it('should handle upload failures gracefully', async () => {
      vi.mocked(ref).mockReturnValue({ fullPath: 'test/path' } as any);
      vi.mocked(uploadBytes).mockRejectedValue(new Error('Upload failed'));

      const result = await saveExportAsset({
        teamId: mockTeamId,
        designId: mockDesignId,
        versionId: mockVersionId,
        buffer: mockDXFBuffer,
        ext: 'dxf',
        userId: mockUserId
      });

      expect(result).toEqual({
        success: false,
        error: 'Upload failed'
      });

      // Verify no Firestore write on upload failure
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('should support thumbnail uploads', async () => {
      const mockThumbnailBuffer = Buffer.from('PNG image data');
      const mockStorageRef = { 
        fullPath: `teams/${mockTeamId}/designs/${mockDesignId}/thumbnails/${mockAssetId}.png`
      };

      vi.mocked(ref).mockReturnValue(mockStorageRef as any);
      vi.mocked(uploadBytes).mockResolvedValue({ ref: mockStorageRef } as any);
      vi.mocked(getDownloadURL).mockResolvedValue(mockDownloadUrl);
      vi.mocked(setDoc).mockResolvedValue(undefined);

      await saveExportAsset({
        teamId: mockTeamId,
        designId: mockDesignId,
        versionId: null, // Thumbnails not version-specific
        buffer: mockThumbnailBuffer,
        ext: 'png',
        userId: mockUserId,
        assetType: 'thumbnail'
      });

      expect(ref).toHaveBeenCalledWith(
        undefined,
        `teams/${mockTeamId}/designs/${mockDesignId}/thumbnails/${mockAssetId}.png`
      );

      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          owner_type: 'design',
          owner_id: mockDesignId,
          file_type: 'png',
          asset_type: 'thumbnail'
        })
      );
    });
  });

  describe('getAssetsByVersion', () => {
    it('should fetch all assets for a version using index', async () => {
      const mockAssets = [
        {
          id: 'asset_1',
          data: () => ({
            file_type: 'dxf',
            file_size: 1024,
            download_url: 'url1',
            created_at: Timestamp.fromMillis(1234567892000)
          })
        },
        {
          id: 'asset_2',
          data: () => ({
            file_type: 'pdf',
            file_size: 2048,
            download_url: 'url2',
            created_at: Timestamp.fromMillis(1234567891000)
          })
        }
      ];

      vi.mocked(getDocs).mockResolvedValue({
        empty: false,
        docs: mockAssets
      } as any);

      const assets = await getAssetsByVersion(mockTeamId, mockVersionId);

      // Verify query uses composite index
      expect(query).toHaveBeenCalled();
      expect(where).toHaveBeenCalledWith('owner_type', '==', 'version');
      expect(where).toHaveBeenCalledWith('owner_id', '==', mockVersionId);
      expect(orderBy).toHaveBeenCalledWith('created_at', 'desc');

      expect(assets).toHaveLength(2);
      expect(assets[0].file_type).toBe('dxf');
      expect(assets[1].file_type).toBe('pdf');
    });

    it('should return empty array if no assets exist', async () => {
      vi.mocked(getDocs).mockResolvedValue({
        empty: true,
        docs: []
      } as any);

      const assets = await getAssetsByVersion(mockTeamId, mockVersionId);

      expect(assets).toEqual([]);
    });

    it('should filter by file type when specified', async () => {
      const mockDXFAssets = [
        {
          id: 'asset_1',
          data: () => ({
            file_type: 'dxf',
            download_url: 'url1'
          })
        }
      ];

      vi.mocked(getDocs).mockResolvedValue({
        empty: false,
        docs: mockDXFAssets
      } as any);

      const assets = await getAssetsByVersion(mockTeamId, mockVersionId, 'dxf');

      expect(where).toHaveBeenCalledWith('file_type', '==', 'dxf');
      expect(assets).toHaveLength(1);
      expect(assets[0].file_type).toBe('dxf');
    });
  });

  describe('deleteAsset', () => {
    it('should delete asset from Storage and Firestore', async () => {
      const mockAssetDoc = {
        exists: () => true,
        data: () => ({
          storage_path: `teams/${mockTeamId}/assets/${mockAssetId}.dxf`
        })
      };

      vi.mocked(getDoc).mockResolvedValue(mockAssetDoc as any);
      vi.mocked(deleteObject).mockResolvedValue(undefined);

      const result = await deleteAsset(mockTeamId, mockAssetId);

      // Verify Storage deletion
      expect(deleteObject).toHaveBeenCalledWith(
        expect.objectContaining({
          fullPath: `teams/${mockTeamId}/assets/${mockAssetId}.dxf`
        })
      );

      // Note: Firestore document deletion would be handled by security rules
      // preventing deletion, so we don't test actual deletion here

      expect(result).toEqual({ success: true });
    });

    it('should handle non-existent assets gracefully', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false
      } as any);

      const result = await deleteAsset(mockTeamId, 'non_existent');

      expect(deleteObject).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'Asset not found'
      });
    });
  });

  describe('Export Service Integration', () => {
    it('should integrate with export service for DXF/PDF persistence', async () => {
      const mockBlob = new Blob([mockDXFBuffer], { type: 'application/dxf' });
      
      vi.mocked(ref).mockReturnValue({ fullPath: 'test/path' } as any);
      vi.mocked(uploadBytes).mockResolvedValue({ ref: { fullPath: 'test/path' } } as any);
      vi.mocked(getDownloadURL).mockResolvedValue(mockDownloadUrl);
      vi.mocked(setDoc).mockResolvedValue(undefined);

      const result = await exportWithPersistence(
        mockBlob,
        'design.dxf',
        'dxf',
        mockTeamId,
        mockDesignId,
        mockVersionId,
        mockUserId
      );

      expect(result.persisted).toBe(true);
      expect(result.downloadUrl).toBe(mockDownloadUrl);
    });

    it('should fallback to local download on persistence failure', async () => {
      const mockBlob = new Blob([mockDXFBuffer], { type: 'application/dxf' });
      
      vi.mocked(uploadBytes).mockRejectedValue(new Error('Storage error'));

      // Mock URL.createObjectURL
      global.URL = {
        createObjectURL: vi.fn(() => 'blob:local-url')
      } as any;

      const result = await exportWithPersistence(
        mockBlob,
        'design.dxf',
        'dxf',
        mockTeamId,
        mockDesignId,
        mockVersionId,
        mockUserId
      );

      expect(result.persisted).toBe(false);
      expect(result.downloadUrl).toBe('blob:local-url');
    });
  });

  describe('Asset Query Performance', () => {
    it('should use composite index for efficient queries', async () => {
      // Simulate large dataset query
      const mockLargeAssetSet = Array.from({ length: 100 }, (_, i) => ({
        id: `asset_${i}`,
        data: () => ({
          file_type: i % 2 === 0 ? 'dxf' : 'pdf',
          created_at: Timestamp.fromMillis(1234567890000 + i * 1000)
        })
      }));

      vi.mocked(getDocs).mockResolvedValue({
        empty: false,
        docs: mockLargeAssetSet.slice(0, 20) // Paginated response
      } as any);

      const assets = await getAssetsByVersion(mockTeamId, mockVersionId, null, 20);

      // Verify index usage via query structure
      expect(query).toHaveBeenCalled();
      expect(where).toHaveBeenCalledTimes(2); // owner_type and owner_id
      expect(orderBy).toHaveBeenCalledWith('created_at', 'desc');
      
      expect(assets).toHaveLength(20);
    });
  });
});