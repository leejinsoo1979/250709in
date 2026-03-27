import type { VercelRequest, VercelResponse } from '@vercel/node';

const BOT_TOKEN = process.env.VITE_TELEGRAM_BOT_TOKEN || '';
const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'in-f8873';

// Firestore REST API로 문서 업데이트
async function updateFirestoreDoc(collection: string, docId: string, fields: Record<string, any>) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?updateMask.fieldPaths=${Object.keys(fields).join('&updateMask.fieldPaths=')}`;

  const firestoreFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') {
      firestoreFields[key] = { stringValue: value };
    } else if (typeof value === 'boolean') {
      firestoreFields[key] = { booleanValue: value };
    }
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: firestoreFields }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore update failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Firestore REST API로 문서 조회 (쿼리)
async function queryFirestore(collection: string, fieldPath: string, value: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: { stringValue: value },
          },
        },
        limit: 1,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore query failed: ${res.status} ${text}`);
  }
  return res.json();
}

// 텔레그램 메시지 수정
async function editTelegramMessage(chatId: number, messageId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    }),
  });
}

// 텔레그램 callback_query 응답
async function answerCallbackQuery(callbackQueryId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // callback_query 처리 (버튼 클릭)
    if (body.callback_query) {
      const { id: callbackId, data, message } = body.callback_query;
      const chatId = message.chat.id;
      const messageId = message.message_id;

      // data 형식: "approve:uid" 또는 "reject:uid"
      const [action, uid] = (data || '').split(':');

      if (!uid || !['approve', 'reject'].includes(action)) {
        await answerCallbackQuery(callbackId, '잘못된 요청입니다.');
        return res.status(200).json({ ok: true });
      }

      // Firestore에서 해당 uid의 enterprise_inquiries 문서 찾기
      const queryResult = await queryFirestore('enterprise_inquiries', 'uid', uid);

      if (!queryResult || !queryResult[0]?.document) {
        await answerCallbackQuery(callbackId, '기업 가입 신청을 찾을 수 없습니다.');
        return res.status(200).json({ ok: true });
      }

      const docPath = queryResult[0].document.name;
      // 경로: projects/{projectId}/databases/(default)/documents/enterprise_inquiries/{docId}
      const docId = docPath.split('/').pop();
      const fields = queryResult[0].document.fields;
      const companyName = fields?.companyName?.stringValue || '알 수 없음';
      const contactName = fields?.contactName?.stringValue || '알 수 없음';
      const loginEmail = fields?.loginEmail?.stringValue || '알 수 없음';

      if (action === 'approve') {
        await updateFirestoreDoc('enterprise_inquiries', docId, { status: 'approved' });
        await answerCallbackQuery(callbackId, '승인 완료!');
        await editTelegramMessage(
          chatId,
          messageId,
          `✅ <b>기업계정 승인 완료</b>\n\n🏢 ${companyName}\n👤 ${contactName}\n📧 ${loginEmail}\n\n승인자가 승인하였습니다.`
        );
      } else {
        await updateFirestoreDoc('enterprise_inquiries', docId, { status: 'rejected' });
        await answerCallbackQuery(callbackId, '거절 완료');
        await editTelegramMessage(
          chatId,
          messageId,
          `❌ <b>기업계정 거절됨</b>\n\n🏢 ${companyName}\n👤 ${contactName}\n📧 ${loginEmail}\n\n승인자가 거절하였습니다.`
        );
      }

      return res.status(200).json({ ok: true });
    }

    // 기타 메시지는 무시
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return res.status(200).json({ ok: true }); // 텔레그램은 200을 받아야 재시도 안 함
  }
}
