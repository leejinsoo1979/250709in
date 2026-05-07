/**
 * Firebase Cloud Functions 진입점
 *
 * 배포: firebase deploy --only functions
 * 환경변수 설정: firebase functions:config:set nts.api_key="발급받은_서비스키"
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
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
