/**
 * Firebase Cloud Functions 진입점
 *
 * 배포: firebase deploy --only functions
 * 환경변수 설정: firebase functions:config:set nts.api_key="발급받은_서비스키"
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const axios = require('axios');

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
