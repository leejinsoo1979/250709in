/**
 * Export service for handling DXF/PDF exports with asset persistence
 */

import { saveExportAsset } from '@/firebase/assets';
import { auth } from '@/firebase/auth';
import { getCurrentVersionId } from '@/services/designs.repo';

/**
 * Process and save export to Firebase Storage
 * @param blob The export blob (DXF or PDF)
 * @param ext The file extension
 * @param teamId Team ID
 * @param designId Design ID  
 * @param versionId Version ID
 * @returns Asset info with download URL
 */
export async function processExport(
  blob: Blob,
  ext: 'pdf' | 'dxf',
  teamId: string,
  designId: string,
  versionId: string
): Promise<{ assetId: string; url: string; path: string } | null> {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.error('No authenticated user for export');
      return null;
    }

    // Convert blob to ArrayBuffer
    const buffer = await blob.arrayBuffer();

    // Save to Firebase Storage and register in assets collection
    const result = await saveExportAsset({
      teamId,
      designId,
      versionId,
      buffer,
      ext,
      userId: user.uid
    });

    console.log(`✅ Export saved to Storage: ${result.path}`);
    console.log(`✅ Asset registered: ${result.assetId}`);
    
    return result;
  } catch (error) {
    console.error('Failed to process export:', error);
    // Fallback to direct download (existing behavior)
    return null;
  }
}

/**
 * Helper to trigger download from URL or blob
 */
export function triggerDownload(urlOrBlob: string | Blob, filename: string): void {
  let url: string;
  let needsRevoke = false;

  if (urlOrBlob instanceof Blob) {
    url = URL.createObjectURL(urlOrBlob);
    needsRevoke = true;
  } else {
    url = urlOrBlob;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (needsRevoke) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Export with persistence - wraps existing export logic
 * Falls back to direct download if persistence fails
 */
export async function exportWithPersistence(
  blob: Blob,
  filename: string,
  ext: 'pdf' | 'dxf',
  teamId: string,
  designId: string,
  versionId: string
): Promise<void> {
  try {
    // Try to save to Storage first
    const asset = await processExport(blob, ext, teamId, designId, versionId);
    
    if (asset && asset.url) {
      // Download from Storage URL
      console.log(`📥 Downloading from Storage: ${asset.url}`);
      triggerDownload(asset.url, filename);
    } else {
      // Fallback to direct blob download
      console.log('⚠️ Storage save failed, using direct download');
      triggerDownload(blob, filename);
    }
  } catch (error) {
    console.error('Export failed:', error);
    // Final fallback - just download the blob
    triggerDownload(blob, filename);
  }
}

/**
 * TEST FUNCTION - 실제 Storage 업로드 테스트
 * 콘솔에서 실행: window.testExportAsset('team_id', 'design_id')
 */
export async function testExportAsset(teamId: string, designId: string): Promise<void> {
  try {
    console.log('🧪 테스트 시작: Export Asset Upload');
    
    // 1. 현재 버전 ID 가져오기
    const versionId = await getCurrentVersionId(teamId, designId) || 'test_version_001';
    console.log('📌 Version ID:', versionId);
    
    // 2. 테스트 PDF 생성
    const testContent = `Test PDF Export\nTeam: ${teamId}\nDesign: ${designId}\nVersion: ${versionId}\nTimestamp: ${new Date().toISOString()}`;
    const blob = new Blob([testContent], { type: 'application/pdf' });
    
    // 3. Storage 업로드 시도
    const result = await processExport(blob, 'pdf', teamId, designId, versionId);
    
    if (result) {
      console.log('✅ Storage 업로드 성공!');
      console.log('📁 Storage 경로:', result.path);
      console.log('🔗 다운로드 URL:', result.url);
      console.log('📄 Asset ID:', result.assetId);
      console.log('');
      console.log('Firestore 확인:');
      console.log(`teams/${teamId}/assets/${result.assetId}`);
    } else {
      console.error('❌ Storage 업로드 실패');
    }
  } catch (error) {
    console.error('❌ 테스트 실패:', error);
  }
}

// 브라우저 콘솔에서 테스트할 수 있도록 window에 노출
if (typeof window !== 'undefined') {
  (window as any).testExportAsset = testExportAsset;
}