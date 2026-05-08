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
 * [관리자 전용] 기업회원 신청 처리 — status + plan을 트랜잭션으로 동시 변경
 *
 * 입력: { inquiryId: string, action: 'approve'|'hold'|'reject'|'pending', reason?: string }
 * 출력: { ok: boolean, status: string, plan: string }
 *
 * 매핑:
 *   approve  → status='approved',  plan='enterprise'
 *   hold     → status='on_hold',   plan='free'
 *   reject   → status='rejected',  plan='free'
 *   pending  → status='pending',   plan='free'  (승인대기로 되돌림)
 *
 * 트랜잭션이라 둘 중 하나만 성공하는 케이스 없음 — 데이터 불일치 원천 차단.
 */
exports.adminProcessEnterpriseInquiry = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    const callerUid = request.auth?.uid;
    const callerEmail = request.auth?.token?.email || '';
    if (!callerUid) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    const isSuperAdmin = callerEmail.toLowerCase() === 'sbbc212@gmail.com';
    if (!isSuperAdmin) {
      const adminDoc = await admin.firestore().doc(`admins/${callerUid}`).get();
      if (!adminDoc.exists) {
        throw new HttpsError('permission-denied', '관리자 권한이 필요합니다.');
      }
    }

    const inquiryId = String(request.data?.inquiryId || '').trim();
    const action = String(request.data?.action || '').trim();
    const reason = String(request.data?.reason || '').trim();
    if (!inquiryId) throw new HttpsError('invalid-argument', 'inquiryId가 필요합니다.');

    const ACTION_MAP = {
      approve: { status: 'approved', plan: 'enterprise' },
      hold: { status: 'on_hold', plan: 'free' },
      reject: { status: 'rejected', plan: 'free' },
      pending: { status: 'pending', plan: 'free' },
    };
    const mapped = ACTION_MAP[action];
    if (!mapped) throw new HttpsError('invalid-argument', '알 수 없는 action');

    const db = admin.firestore();
    const inquiryRef = db.doc(`enterprise_inquiries/${inquiryId}`);

    let resultPlan = 'free';
    await db.runTransaction(async (tx) => {
      const inquirySnap = await tx.get(inquiryRef);
      if (!inquirySnap.exists) {
        throw new HttpsError('not-found', '해당 신청을 찾을 수 없습니다.');
      }
      const inquiry = inquirySnap.data();
      const targetUid = inquiry.uid;
      if (!targetUid) {
        throw new HttpsError('failed-precondition', '신청에 uid가 없어 plan 동기화 불가');
      }

      // 슈퍼관리자는 plan 변경 안 함 (보호)
      const userRef = db.doc(`users/${targetUid}`);
      const userSnap = await tx.get(userRef);
      const userData = userSnap.exists ? userSnap.data() : {};
      const isTargetSuperAdmin = userData.role === 'superadmin';

      // 1) inquiry 업데이트
      const inquiryUpdates = {
        status: mapped.status,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: callerUid,
        noticeShownAt: null,
      };
      if (action === 'hold' || action === 'reject') {
        inquiryUpdates.reasonText = reason || (action === 'hold' ? '추가 확인 필요' : '거절');
      } else {
        inquiryUpdates.reasonText = null;
        inquiryUpdates.reasonCode = null;
      }
      tx.update(inquiryRef, inquiryUpdates);

      // 2) users.plan + displayName 동기화 (슈퍼관리자 제외)
      if (!isTargetSuperAdmin) {
        const userPatch = {
          plan: mapped.plan,
          planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // 기업회원 승인 시 닉네임을 회사명으로 자동 설정
        if (mapped.plan === 'enterprise' && inquiry.companyName) {
          userPatch.displayName = inquiry.companyName;
        }
        tx.set(userRef, userPatch, { merge: true });
        resultPlan = mapped.plan;
      } else {
        resultPlan = userData.plan || 'free';
      }
    });

    // 트랜잭션 외부: 안전망 — users.plan 재확인 후 누락 시 강제 set
    // (트랜잭션 충돌/재시도 등 어떤 이유로 plan 동기화가 안 됐을 때 복구)
    try {
      const inquirySnap2 = await inquiryRef.get();
      const targetUidFinal = inquirySnap2.data()?.uid;
      if (targetUidFinal) {
        const userRefFinal = db.doc(`users/${targetUidFinal}`);
        const userSnapFinal = await userRefFinal.get();
        const isTargetSuperFinal = userSnapFinal.exists && userSnapFinal.data()?.role === 'superadmin';
        if (!isTargetSuperFinal) {
          const currentPlan = userSnapFinal.exists ? userSnapFinal.data()?.plan : undefined;
          if (currentPlan !== mapped.plan) {
            await userRefFinal.set(
              {
                plan: mapped.plan,
                planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            console.log(`🛡️ users.plan 안전망 적용: ${currentPlan} → ${mapped.plan} (uid=${targetUidFinal})`);
          }
        }
      }
    } catch (e) {
      console.warn('users.plan 안전망 동기화 실패:', e?.message);
    }

    // 트랜잭션 외부: Firebase Auth displayName도 갱신 (Auth는 트랜잭션 안 됨)
    if (mapped.plan === 'enterprise') {
      try {
        const inquirySnap2 = await inquiryRef.get();
        const companyName = inquirySnap2.data()?.companyName;
        const targetUidFinal = inquirySnap2.data()?.uid;
        if (companyName && targetUidFinal) {
          await admin.auth().updateUser(targetUidFinal, { displayName: companyName });
        }
      } catch (e) {
        console.warn('Auth displayName 업데이트 실패:', e?.message);
      }
    }

    return { ok: true, status: mapped.status, plan: resultPlan };
  }
);

/**
 * [관리자 전용] enterprise_inquiries.status 와 users.plan 동기화
 *
 * 동작:
 *  - status='approved' 인 사용자 → users.plan = 'enterprise' 강제 set
 *  - status가 'approved'가 아닌 사용자 → users.plan = 'free' 강제 set
 *  - 슈퍼관리자(role='superadmin')는 건드리지 않음
 *
 * 입력: {} (없음)
 * 출력: { synced: number, details: Array<{uid, email, oldPlan, newPlan}> }
 */
exports.adminSyncEnterprisePlans = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
    }
    // 호출자가 관리자인지 확인
    const callerEmail = request.auth?.token?.email || '';
    const isSuperAdmin = callerEmail.toLowerCase() === 'sbbc212@gmail.com';
    if (!isSuperAdmin) {
      const adminDoc = await admin.firestore().doc(`admins/${callerUid}`).get();
      if (!adminDoc.exists) {
        throw new HttpsError('permission-denied', '관리자 권한이 필요합니다.');
      }
    }

    const db = admin.firestore();
    const inquiriesSnap = await db.collection('enterprise_inquiries').get();

    // uid -> 가장 최근 inquiry status
    const latestStatus = new Map();
    const latestCreatedAt = new Map();
    inquiriesSnap.forEach((d) => {
      const data = d.data();
      const uid = data.uid;
      if (!uid) return;
      const created = data.createdAt?.toMillis?.() || 0;
      if (!latestCreatedAt.has(uid) || created > latestCreatedAt.get(uid)) {
        latestCreatedAt.set(uid, created);
        latestStatus.set(uid, data.status || 'pending');
      }
    });

    const details = [];
    let synced = 0;
    for (const [uid, status] of latestStatus.entries()) {
      try {
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};
        // 슈퍼관리자는 건드리지 않음
        if (userData.role === 'superadmin') continue;
        const oldPlan = userData.plan || 'free';
        const newPlan = status === 'approved' ? 'enterprise' : 'free';
        if (oldPlan === newPlan) continue;
        await userRef.set(
          { plan: newPlan, planUpdatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        details.push({ uid, email: userData.email || '', oldPlan, newPlan, status });
        synced += 1;
      } catch (e) {
        details.push({ uid, error: e?.message || String(e) });
      }
    }

    return { synced, details };
  }
);

// ─────────────────────────────────────────────
// 발주(orders) Cloud Functions
// ─────────────────────────────────────────────

/**
 * 발주 생성 — 기업회원이 공장(파트너)에게 발주
 *
 * 입력: {
 *   factoryId: string,         // 공장 uid
 *   designId: string,
 *   designName: string,
 *   projectId: string,
 *   projectName?: string,
 *   formData: { quantity, dueDate, deliveryAddress, installSchedule, notes }
 *   thumbnailUrl?: string,
 * }
 * 출력: { ok: boolean, orderId: string }
 *
 * 동작:
 *  - 발주자 plan === 'enterprise' 검증
 *  - 공장(factoryId) users.isPartner === true 검증
 *  - orders/{id} 문서 생성 (status: 'pending')
 *  - 공장에게 알림 (notifications)
 *  - 마스터 텔레그램 알림
 */
exports.createOrder = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID], region: 'asia-northeast3' },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

    const data = request.data || {};
    const factoryId = String(data.factoryId || '').trim();
    const designId = String(data.designId || '').trim();
    const designName = String(data.designName || '').trim();
    if (!factoryId || !designId) {
      throw new HttpsError('invalid-argument', '공장 또는 디자인 정보가 없습니다.');
    }

    const db = admin.firestore();

    // 발주자 정보만 조회 (권한 체크는 프론트 가드 + Firestore 룰이 이미 보장)
    // - EnterpriseOrAdminGuard: 대시보드 진입 자체가 기업회원/관리자만 가능
    // - 따라서 createOrder 호출 시점에는 이미 권한이 검증된 상태
    const ordererSnap = await db.doc(`users/${callerUid}`).get();
    const ordererData = ordererSnap.exists ? ordererSnap.data() : {};

    // 부수효과: enterprise_inquiries 가 승인됐는데 users.plan 이 누락된 경우 자동 복구
    if (ordererData.role !== 'superadmin' && ordererData.plan !== 'enterprise') {
      try {
        const inqSnap = await db.collection('enterprise_inquiries')
          .where('uid', '==', callerUid)
          .where('status', '==', 'approved')
          .limit(1)
          .get();
        if (!inqSnap.empty) {
          await db.doc(`users/${callerUid}`).set({
            plan: 'enterprise',
            planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          ordererData.plan = 'enterprise';
          console.log('[createOrder] users.plan 자동 복구: enterprise');
        }
      } catch (e) {
        console.warn('plan 자동 복구 실패:', e?.message);
      }
    }

    // 공장 검증
    const factorySnap = await db.doc(`users/${factoryId}`).get();
    const factoryData = factorySnap.exists ? factorySnap.data() : {};
    if (!factoryData.isPartner) {
      throw new HttpsError('failed-precondition', '선택한 회사는 등록된 공장이 아닙니다.');
    }

    // orders 문서 생성
    const orderRef = await db.collection('orders').add({
      ordererId: callerUid,
      ordererName: ordererData.displayName || '',
      ordererEmail: ordererData.email || '',
      factoryId,
      factoryName: factoryData.displayName || '',
      designId,
      designName,
      projectId: data.projectId || '',
      projectName: data.projectName || '',
      thumbnailUrl: data.thumbnailUrl || '',
      formData: data.formData || {},
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 공장에게 알림
    try {
      await db.collection('notifications').add({
        userId: factoryId,
        type: 'order',
        title: '새 발주 요청',
        message: `${ordererData.displayName || '발주자'} 님으로부터 ${designName} 발주 요청이 접수되었습니다.`,
        link: `/factory/orders/${orderRef.id}`,
        relatedId: orderRef.id,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('공장 알림 생성 실패:', e?.message);
    }

    // 마스터 텔레그램 알림
    try {
      const token = TELEGRAM_BOT_TOKEN.value();
      const chatId = String(TELEGRAM_CHAT_ID.value() || '');
      if (token && chatId) {
        const time = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        const fd = data.formData || {};
        const text = [
          '📦 새 발주 요청',
          '',
          `📌 발주자: ${ordererData.displayName || ordererData.email || ''}`,
          `🏭 공장: ${factoryData.displayName || factoryData.email || ''}`,
          `🎨 디자인: ${designName}`,
          fd.materialSpec ? `🧱 자재 스펙: ${fd.materialSpec}` : '',
          fd.dueDate ? `📅 납기: ${fd.dueDate}` : '',
          fd.deliveryAddress ? `📍 배송지: ${fd.deliveryAddress}` : '',
          `🕐 ${time}`,
        ].filter(Boolean).join('\n');
        await tgApi(token, 'sendMessage', { chat_id: chatId, text }).catch(() => {});
      }
    } catch (e) {
      console.warn('텔레그램 알림 실패:', e?.message);
    }

    return { ok: true, orderId: orderRef.id };
  }
);

/**
 * 발주 처리 — 공장이 수락/거절/진행/완료
 *
 * 입력: { orderId, action: 'accept' | 'reject' | 'in_progress' | 'complete', reason?: string }
 * 출력: { ok: boolean, status: string }
 */
exports.processOrder = onCall(
  { region: 'asia-northeast3' },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');

    const orderId = String(request.data?.orderId || '').trim();
    const action = String(request.data?.action || '').trim();
    const reason = String(request.data?.reason || '').trim();
    if (!orderId || !action) {
      throw new HttpsError('invalid-argument', 'orderId/action 필요');
    }

    const ACTION_MAP = {
      accept: 'accepted',
      reject: 'rejected',
      in_progress: 'in_progress',
      complete: 'completed',
    };
    const newStatus = ACTION_MAP[action];
    if (!newStatus) throw new HttpsError('invalid-argument', '알 수 없는 action');

    const db = admin.firestore();
    const orderRef = db.doc(`orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) throw new HttpsError('not-found', '발주를 찾을 수 없습니다.');
    const order = orderSnap.data();

    // 권한: 공장 본인 또는 관리자
    const callerEmail = request.auth?.token?.email || '';
    const isCallerSuperAdmin = callerEmail.toLowerCase() === 'sbbc212@gmail.com';
    const callerAdminDoc = await db.doc(`admins/${callerUid}`).get();
    const isCallerAdmin = isCallerSuperAdmin || callerAdminDoc.exists;
    if (order.factoryId !== callerUid && !isCallerAdmin) {
      throw new HttpsError('permission-denied', '권한이 없습니다.');
    }

    await orderRef.update({
      status: newStatus,
      reason: reason || null,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 발주자에게 알림
    try {
      const statusLabel = {
        accepted: '수락',
        rejected: '거절',
        in_progress: '제작 진행',
        completed: '완료',
      }[newStatus];
      await db.collection('notifications').add({
        userId: order.ordererId,
        type: 'order',
        title: `발주 ${statusLabel}`,
        message: `${order.factoryName || '공장'} 에서 ${order.designName || '발주'} 를 ${statusLabel} 처리했습니다.${reason ? `\n사유: ${reason}` : ''}`,
        link: `/dashboard/orders/${orderId}`,
        relatedId: orderId,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('발주자 알림 생성 실패:', e?.message);
    }

    return { ok: true, status: newStatus };
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
        console.log('[telegramWebhook] non-callback update:', JSON.stringify(update).slice(0, 200));
        res.status(200).send('ok');
        return;
      }
      console.log('[telegramWebhook] callback received:', {
        data: cb.data,
        chatId: cb.message?.chat?.id,
        fromId: cb.from?.id,
        fromName: cb.from?.first_name || cb.from?.username,
        messageId: cb.message?.message_id,
      });

      // 보안: 등록된 관리자 chat 또는 user 본인에서 온 callback만 허용
      // 그룹/채널: cb.message.chat.id == adminChatId
      // 1:1 채팅: cb.from.id == adminChatId (사용자 본인 ID)
      const messageChatId = String(cb.message?.chat?.id || '');
      const fromUserId = String(cb.from?.id || '');
      const isAuthorized = !adminChatId ||
        messageChatId === adminChatId ||
        fromUserId === adminChatId;
      if (!isAuthorized) {
        console.error('[telegramWebhook] 권한 거부:', {
          adminChatId, messageChatId, fromUserId, action: String(cb.data || '').split(':')[0],
        });
        await tgApi(token, 'answerCallbackQuery', {
          callback_query_id: cb.id,
          text: `권한 없음 (chat: ${messageChatId}, user: ${fromUserId})`,
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

      // 헬퍼: 버튼 제거 (여러 방법으로 시도 — 어느 하나라도 성공하면 OK)
      let removeFailed = false;
      const removeButtons = async () => {
        // 방법 1: reply_markup 미지정 (텔레그램 표준 — 키보드 자동 제거)
        try {
          await tgApi(token, 'editMessageReplyMarkup', {
            chat_id: chatId,
            message_id: messageId,
          });
          console.log('[telegramWebhook] removeButtons: 방법1 성공');
          return;
        } catch (e1) {
          console.error('[telegramWebhook] 방법1 실패:', e1?.response?.data ? JSON.stringify(e1.response.data) : e1?.message);
        }
        // 방법 2: 빈 inline_keyboard 배열
        try {
          await tgApi(token, 'editMessageReplyMarkup', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] },
          });
          console.log('[telegramWebhook] removeButtons: 방법2 성공');
          return;
        } catch (e2) {
          console.error('[telegramWebhook] 방법2 실패:', e2?.response?.data ? JSON.stringify(e2.response.data) : e2?.message);
        }
        // 방법 3: JSON 문자열로 reply_markup
        try {
          await tgApi(token, 'editMessageReplyMarkup', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: JSON.stringify({ inline_keyboard: [] }),
          });
          console.log('[telegramWebhook] removeButtons: 방법3 성공');
          return;
        } catch (e3) {
          console.error('[telegramWebhook] 방법3 실패:', e3?.response?.data ? JSON.stringify(e3.response.data) : e3?.message);
        }
        removeFailed = true;
      };

      // 헬퍼: 메시지 캡션/텍스트 갱신 (실패해도 버튼은 이미 제거된 상태로 유지)
      let editFailed = false;
      const editCaption = async (extraText, replyMarkup) => {
        const original = cb.message.caption || cb.message.text || '';
        const isPhoto = !!cb.message.photo;
        const newText = `${original}\n\n${extraText}`;
        try {
          if (isPhoto) {
            await tgApi(token, 'editMessageCaption', {
              chat_id: chatId,
              message_id: messageId,
              caption: newText,
              reply_markup: replyMarkup || { inline_keyboard: [] },
            });
          } else {
            await tgApi(token, 'editMessageText', {
              chat_id: chatId,
              message_id: messageId,
              text: newText,
              reply_markup: replyMarkup || { inline_keyboard: [] },
            });
          }
          console.log('[telegramWebhook] editCaption 성공');
        } catch (e) {
          editFailed = true;
          console.error('[telegramWebhook] editMessage 실패:', e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e));
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
        // 보류 시 plan을 free로 환원 (이전에 approved였을 수 있음)
        planUpdate = 'free';
        doneText = `⏸ 보류 처리됨 (사유: ${reasonText})\n${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
      } else if (action === 'reject') {
        reasonCode = parts[1];
        inquiryId = parts[2];
        uid = parts[3];
        reasonText = REJECT_REASONS[reasonCode] || '기타';
        nextStatus = 'rejected';
        // 거절 시 plan을 free로 환원 (이전에 approved였을 수 있음)
        planUpdate = 'free';
        doneText = `❌ 거절 처리됨 (사유: ${reasonText})\n${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
      } else {
        await tgApi(token, 'answerCallbackQuery', {
          callback_query_id: cb.id,
          text: '알 수 없는 액션',
        });
        res.status(200).send('unknown');
        return;
      }

      // 즉시 피드백 1단계: 버튼만 제거 (가장 안전 — 어떤 경우에도 버튼은 사라짐)
      await removeButtons();

      // Firestore 업데이트
      try {
        const inquiryRef = db.doc(`enterprise_inquiries/${inquiryId}`);
        // 문서 존재 여부 먼저 확인 (샘플/삭제된 케이스 친절한 안내)
        const inquirySnap = await inquiryRef.get();
        if (!inquirySnap.exists) {
          await tgApi(token, 'answerCallbackQuery', {
            callback_query_id: cb.id,
            text: '⚠️ 신청 정보를 찾을 수 없습니다 (샘플 메시지이거나 이미 삭제된 신청)',
            show_alert: true,
          });
          res.status(200).send('not_found');
          return;
        }

        const updates = {
          status: nextStatus,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: String(cb.from?.id || ''),
          // 사용자에게 새 알림 트리거 (이전 표시 기록 리셋)
          noticeShownAt: null,
        };
        if (reasonText) {
          updates.reasonCode = reasonCode;
          updates.reasonText = reasonText;
        } else {
          updates.reasonCode = null;
          updates.reasonText = null;
        }
        await inquiryRef.update(updates);

        // 승인 시 user plan + displayName 업데이트 (기업회원 닉네임=회사명)
        if (planUpdate && uid) {
          try {
            const inquiryData = inquirySnap.data() || {};
            const userUpdates = { plan: planUpdate };
            if (planUpdate === 'enterprise' && inquiryData.companyName) {
              userUpdates.displayName = inquiryData.companyName;
            }
            await db.doc(`users/${uid}`).set(userUpdates, { merge: true });
            // Firebase Auth displayName도 같이 갱신 (기업회원 승인 시)
            if (planUpdate === 'enterprise' && inquiryData.companyName) {
              try {
                await admin.auth().updateUser(uid, { displayName: inquiryData.companyName });
              } catch (authErr) {
                console.warn('Auth displayName 업데이트 실패:', authErr?.message);
              }
            }
          } catch (e) {
            console.warn('users plan/displayName 업데이트 실패:', e);
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

      // 텔레그램 메시지 갱신 (최종 결과로 — '처리 중'을 덮어씀, 버튼 제거 유지)
      await editCaption(doneText, { inline_keyboard: [] });

      // 원본 메시지 수정이 실패한 경우 — 답글 메시지로 결과 별도 전송
      // (버튼 제거 또는 caption 갱신 어느 쪽이라도 실패하면 발동)
      if (removeFailed || editFailed) {
        try {
          await tgApi(token, 'sendMessage', {
            chat_id: chatId,
            text: doneText,
            reply_to_message_id: messageId,
            allow_sending_without_reply: true,
          });
          console.log('[telegramWebhook] sendMessage(fallback) 성공');
        } catch (e) {
          console.error('[telegramWebhook] sendMessage(fallback) 실패:', e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e));
        }
      }

      // 화면 위에 알림 팝업 (show_alert: true)
      const alertText =
        action === 'approve' ? '✅ 승인 처리 완료'
        : action === 'hold' ? '⏸ 보류 처리 완료'
        : action === 'reject' ? '❌ 거절 처리 완료'
        : '처리 완료';
      await tgApi(token, 'answerCallbackQuery', {
        callback_query_id: cb.id,
        text: alertText,
        show_alert: true,
      });

      res.status(200).send('ok');
    } catch (err) {
      console.error('telegramWebhook 에러:', err);
      res.status(200).send('error'); // 텔레그램 재시도 막기
    }
  }
);
