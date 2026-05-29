import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf-8')
);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const snap = await db.collection('qna').orderBy('createdAt', 'desc').get();
console.log(`총 ${snap.size}건`);
snap.docs.forEach((d) => {
  const x = d.data();
  console.log('----------------------------------------');
  console.log('id:', d.id);
  console.log('status:', x.status);
  console.log('author:', x.authorName);
  console.log('title:', x.title);
  console.log('body:', (x.body || '').slice(0, 200));
});
process.exit(0);
