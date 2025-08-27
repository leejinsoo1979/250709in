import { doc, setDoc, getDoc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '@/firebase/config';

export async function saveDesignSnapshot({
  teamId, designId, userId, state, options = {}, bom = {}, cutList = {}
}:{ teamId:string; designId:string; userId:string; state:any; options?:any; bom?:any; cutList?:any; }) {
  const designRef = doc(db, `teams/${teamId}/designs/${designId}`);
  const versionsRef = collection(db, `teams/${teamId}/designs/${designId}/versions`);
  await runTransaction(db, async (tx) => {
    const dSnap = await tx.get(designRef);
    const nextNo = (dSnap.exists() && (dSnap.data() as any).version_seq ? (dSnap.data() as any).version_seq : 0) + 1;
    const vRef = doc(versionsRef); // auto id
    tx.set(vRef, {
      version_no: nextNo,
      state_json: state,
      options_json: options,
      bom_json: bom,
      cut_list_json: cutList,
      teamId, designId,
      created_by: userId,
      created_at: serverTimestamp()
    });
    tx.set(designRef, {
      teamId,
      version_seq: nextNo,
      current_version_id: vRef.id,
      updated_by: userId,
      updated_at: serverTimestamp()
    }, { merge: true });
  });
}