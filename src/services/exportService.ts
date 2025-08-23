/**
 * Export service for handling DXF/PDF exports with asset persistence
 */

import { saveExportAsset } from '@/firebase/assets';
import { auth } from '@/firebase/auth';

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