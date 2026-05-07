/**
 * Firebase Cloud Functions 진입점
 *
 * 배포: firebase deploy --only functions
 * 환경변수 설정: firebase functions:config:set nts.api_key="발급받은_서비스키"
 */

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const axios = require('axios');
const admin = require('firebase-admin');

// Firebase Admin 초기화 (한 번만)
if (!admin.apps.length) {
  admin.initializeApp();
}

// 국세청 API 키 (Firebase Secret으로 보관)
// 설정: firebase functions:secrets:set NTS_API_KEY
const NTS_API_KEY = defineSecret('NTS_API_KEY');

// 텔레그램 봇 토큰 (Firebase Secret으로 보관)
// 설정: firebase functions:secrets:set TELEGRAM_BOT_TOKEN
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
// 관리자 chat_id (텔레그램에서 메시지 받을 채팅방)
const TELEGRAM_CHAT_ID = defineSecret('TELEGRAM_CHAT_ID');

// ─────────────────────────────────────────────
// 텔레그램 헬퍼
// ─────────────────────────────────────────────
async function tgApi(token, method, body) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  return res.data;
}

/**
 * 사업자등록번호 진위 및 영업상태 조회
 *
 * 입력: { businessNumber: "0000000000" } (하이픈 없는 10자리)
 * 출력: {
 *   ok: boolean,
 *   status: 'active' | 'inactive' | 'closed' | 'not_found' | 'invalid',
 *   statusText: string,
 *   taxType: string,         // 과세유형
 *   raw: any,                // 국세청 원본 응답 (디버깅용)
 * }
 *
 * status 코드 매핑:
 *  - active: 계속사업자 (정상)
 *  - inactive: 휴업자
 *  - closed: 폐업자
 *  - not_found: 등록되지 않은 번호
 *  - invalid: 형식 오류 등
 */
exports.verifyBusinessNumber = onCall(
  { secrets: [NTS_API_KEY], region: 'asia-northeast3' },
  async (request) => {
    const businessNumber = String(request.data?.businessNumber || '').replace(/\D/g, '');

    if (businessNumber.length !== 10) {
      throw new HttpsError('invalid-argument', '사업자등록번호는 숫자 10자리여야 합니다.');
    }

    const apiKey = NTS_API_KEY.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'NTS_API_KEY 시크릿이 설정되지 않았습니다.');
    }

    try {
      // 국세청 사업자등록상태 조회 API (공공데이터포털)
      const url = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
      const response = await axios.post(
        `${url}?serviceKey=${encodeURIComponent(apiKey)}`,
        { b_no: [businessNumber] },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );

      const data = response.data?.data?.[0];
      if (!data) {
        return {
          ok: false,
          status: 'not_found',
          statusText: '등록되지 않은 사업자번호입니다.',
          taxType: '',
          raw: response.data,
        };
      }

      // 국세청 응답: b_stt_cd 01=계속사업자, 02=휴업자, 03=폐업자
      const sttCode = data.b_stt_cd;
      const sttText = data.b_stt || '';
      const taxType = data.tax_type || '';

      let status = 'invalid';
      if (sttCode === '01') status = 'active';
      else if (sttCode === '02') status = 'inactive';
      else if (sttCode === '03') status = 'closed';
      else if (!sttCode || sttCode === '') status = 'not_found';

      return {
        ok: status === 'active',
        status,
        statusText: sttText || (status === 'not_found' ? '등록되지 않은 사업자번호입니다.' : ''),
        taxType,
        raw: data,
      };
    } catch (err) {
      console.error('국세청 API 호출 실패:', err?.response?.data || err?.message);
      throw new HttpsError(
        'internal',
        '사업자등록번호 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      );
    }
  }
);

/**
 * 관리자 회원 Auth 계정 삭제
 *
 * 입력: { targetUid: string }
 * 출력: { ok: boolean, message?: string }
 *
 * 권한: 호출자가 admins 컬렉션에 등록된 관리자여야 함
 *
 * 동작:
 *  - Firebase Auth 계정(targetUid) 영구 삭제 → 동일 이메일로 재가입 가능
 *  - Firestore 데이터는 별도로 클라이언트(adminDeleteUserData)가 처리
 */
exports.adminDeleteAuthUser = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }

    // 호출자가 관리자인지 확인
    try {
      const adminDoc = await admin.firestore().doc(`admins/${callerUid}`).get();
      if (!adminDoc.exists) {
        throw new HttpsError('permission-denied', '관리자 권한이 필요합니다.');
      }
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error('관리자 권한 확인 실패:', e);
      throw new HttpsError('internal', '관리자 권한 확인 중 오류가 발생했습니다.');
    }

    const targetUid = String(request.data?.targetUid || '').trim();
    if (!targetUid) {
      throw new HttpsError('invalid-argument', '대상 UID가 필요합니다.');
    }

    if (targetUid === callerUid) {
      throw new HttpsError('failed-precondition', '본인 계정은 삭제할 수 없습니다.');
    }

    try {
      await admin.auth().deleteUser(targetUid);
      console.log('✅ Auth 계정 삭제 완료:', targetUid, '(요청자:', callerUid, ')');
      return { ok: true };
    } catch (err) {
      const code = err?.code;
      if (code === 'auth/user-not-found') {
        // Auth 계정이 이미 없으면 성공으로 처리 (Firestore만 남은 경우)
        console.log('Auth 계정 이미 없음 (이미 삭제됨):', targetUid);
        return { ok: true, message: 'Auth 계정이 이미 삭제되어 있습니다.' };
      }
      console.error('❌ Auth 계정 삭제 실패:', err);
      throw new HttpsError('internal', `Auth 계정 삭제 실패: ${err?.message || code || 'unknown'}`);
    }
  }
);

/**
 * 텔레그램 봇 Webhook
 *
 * 기업회원 가입 신청 메시지의 [승인/보류/거절] 버튼 callback 처리.
 *
 * 셋업 (1회만):
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://asia-northeast3-in-f8873.cloudfunctions.net/telegramWebhook"
 *
 * callback_data 포맷:
 *   approve:<inquiryId>:<uid>
 *   hold_menu:<inquiryId>:<uid>          → 보류 사유 선택 메뉴 표시
 *   hold:<reasonCode>:<inquiryId>:<uid>  → 사유 선택 후 보류 처리
 *   reject_menu:<inquiryId>:<uid>        → 거절 사유 선택 메뉴 표시
 *   reject:<reasonCode>:<inquiryId>:<uid>→ 사유 선택 후 거절 처리
 *   cancel_menu:<inquiryId>:<uid>        → 사유 메뉴 취소 → 원래 버튼으로
 */

// 보류 사유 (코드 → 사용자에게 보여줄 메시지)
const HOLD_REASONS = {
  doc_mismatch: '사업자등록증과 입력 정보 불일치',
  doc_unclear: '사업자등록증 식별 곤란',
  more_info: '추가 정보 확인 필요',
  contact_required: '담당자 직접 연락 필요',
  other: '기타 사유',
};
const REJECT_REASONS = {
  not_business: '사업자 등록 미확인',
  fake_doc: '허위 또는 위변조 문서',
  duplicate: '중복 가입 시도',
  policy: '정책 위반',
  other: '기타 사유',
};

function buildReasonKeyboard(prefix, inquiryId, uid, reasonsObj) {
  const rows = Object.entries(reasonsObj).map(([code, label]) => ([
    { text: label, callback_data: `${prefix}:${code}:${inquiryId}:${uid}` },
  ]));
  rows.push([{ text: '↩ 취소', callback_data: `cancel_menu:${inquiryId}:${uid}` }]);
  return { inline_keyboard: rows };
}

function buildInitialKeyboard(inquiryId, uid) {
  return {
    inline_keyboard: [[
      { text: '✅ 승인', callback_data: `approve:${inquiryId}:${uid}` },
      { text: '⏸ 보류', callback_data: `hold_menu:${inquiryId}:${uid}` },
      { text: '❌ 거절', callback_data: `reject_menu:${inquiryId}:${uid}` },
    ]],
  };
}

exports.telegramWebhook = onRequest(
  {
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID],
    region: 'asia-northeast3',
    cors: false,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const token = TELEGRAM_BOT_TOKEN.value();
    const adminChatId = String(TELEGRAM_CHAT_ID.value() || '');

    try {
      const update = req.body;
      const cb = update?.callback_query;
      if (!cb) {
        res.status(200).send('ok');
        return;
      }

      // 보안: 등록된 관리자 chat에서 온 callback만 허용
      const fromChatId = String(cb.message?.chat?.id || cb.from?.id || '');
      if (adminChatId && fromChatId !== adminChatId) {
        await tgApi(token, 'answerCallbackQuery', {
          callback_query_id: cb.id,
          text: '권한 없음',
          show_alert: true,
        });
        res.status(200).send('forbidden');
        return;
      }

      const data = String(cb.data || '');
      const parts = data.split(':');
      const action = parts[0];
      const messageId = cb.message.message_id;
      const chatId = cb.message.chat.id;

      // 헬퍼: 메시지 캡션/텍스트 갱신
      const editCaption = async (extraText, replyMarkup) => {
        const original = cb.message.caption || cb.message.text || '';
        const isPhoto = !!cb.message.photo;
        const newText = `${original}\n\n${extraText}`;
        if (isPhoto) {
          await tgApi(token, 'editMessageCaption', {
            chat_id: chatId,
            message_id: messageId,
            caption: newText,
            reply_markup: replyMarkup || { inline_keyboard: [] },
          }).catch(() => {});
        } else {
          await tgApi(token, 'editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text: newText,
            reply_markup: replyMarkup || { inline_keyboard: [] },
          }).catch(() => {});
        }
      };

      // 사유 선택 메뉴 표시 (보류/거절)
      if (action === 'hold_menu' || action === 'reject_menu') {
        const inquiryId = parts[1];
        const uid = parts[2];
        const isHold = action === 'hold_menu';
        const kb = buildReasonKeyboard(
          isHold ? 'hold' : 'reject',
          inquiryId,
          uid,
          isHold ? HOLD_REASONS : REJECT_REASONS
        );
        await tgApi(token, 'editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: kb,
        }).catch(() => {});
        await tgApi(token, 'answerCallbackQuery', {
          callback_query_id: cb.id,
          text: isHold ? '보류 사유를 선택하세요' : '거절 사유를 선택하세요',
        });
        res.status(200).send('ok');
        return;
      }

      if (action === 'cancel_menu') {
        const inquiryId = parts[1];
        const uid = parts[2];
        await tgApi(token, 'editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: buildInitialKeyboard(inquiryId, uid),
        }).catch(() => {});
        await tgApi(token, 'answerCallbackQuery', { callback_query_id: cb.id });
        res.status(200).send('ok');
        return;
      }

      // 실제 처리: approve / hold / reject
      const db = admin.firestore();
      let inquiryId, uid, reasonCode, reasonText;
      let nextStatus, planUpdate, doneText;

      if (action === 'approve') {
        inquiryId = parts[1];
        uid = parts[2];
        nextStatus = 'approved';
        planUpdate = 'enterprise';
        doneText = `✅ 승인 처리됨 (by ${cb.from?.first_name || cb.from?.username || '관리자'})\n${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
      } else if (action === 'hold') {
        reasonCode = parts[1];
        inquiryId = parts[2];
        uid = parts[3];
        reasonText = HOLD_REASONS[reasonCode] || '기타';
        nextStatus = 'on_hold';
        doneText = `⏸ 보류 처리됨 (사유: ${reasonText})\n${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
      } else if (action === 'reject') {
        reasonCode = parts[1];
        inquiryId = parts[2];
        uid = parts[3];
        reasonText = REJECT_REASONS[reasonCode] || '기타';
        nextStatus = 'rejected';
        doneText = `❌ 거절 처리됨 (사유: ${reasonText})\n${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
      } else {
        await tgApi(token, 'answerCallbackQuery', {
          callback_query_id: cb.id,
          text: '알 수 없는 액션',
        });
        res.status(200).send('unknown');
        return;
      }

      // Firestore 업데이트
      try {
        const inquiryRef = db.doc(`enterprise_inquiries/${inquiryId}`);
        const updates = {
          status: nextStatus,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: String(cb.from?.id || ''),
        };
        if (reasonText) {
          updates.reasonCode = reasonCode;
          updates.reasonText = reasonText;
        }
        await inquiryRef.update(updates);

        // 승인 시 user plan 업데이트
        if (planUpdate && uid) {
          try {
            await db.doc(`users/${uid}`).set({ plan: planUpdate }, { merge: true });
          } catch (e) {
            console.warn('users plan 업데이트 실패:', e);
          }
        }
      } catch (e) {
        console.error('Firestore 업데이트 실패:', e);
        await tgApi(token, 'answerCallbackQuery', {
          callback_query_id: cb.id,
          text: '처리 실패: ' + (e?.message || ''),
          show_alert: true,
        });
        res.status(200).send('error');
        return;
      }

      // 텔레그램 메시지 갱신
      await editCaption(doneText, { inline_keyboard: [] });
      await tgApi(token, 'answerCallbackQuery', {
        callback_query_id: cb.id,
        text: '처리 완료',
      });

      res.status(200).send('ok');
    } catch (err) {
      console.error('telegramWebhook 에러:', err);
      res.status(200).send('error'); // 텔레그램 재시도 막기
    }
  }
);
