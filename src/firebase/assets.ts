import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '@/firebase/config';

export async function saveExportAsset({
  teamId, designId, versionId, buffer, ext, userId
}: {
  teamId:string; designId:string; versionId:string;
  buffer:ArrayBuffer; ext:'pdf'|'dxf'; userId:string;
}) {
  const assetId = crypto.randomUUID();
  const path = `teams/${teamId}/designs/${designId}/versions/${versionId}/${assetId}.${ext}`;
  const sref = ref(storage, path);
  await uploadBytes(sref, new Uint8Array(buffer));
  const url = await getDownloadURL(sref);
  await setDoc(doc(db, `teams/${teamId}/assets/${assetId}`), {
    owner_type:'version', owner_id:versionId, type:ext, path, url,
    teamId, designId, created_by:userId, created_at:serverTimestamp()
  });
  return { assetId, url, path };
}