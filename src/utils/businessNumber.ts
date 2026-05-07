/**
 * 한국 사업자등록번호 유틸리티
 * - 형식 검증 (체크섬 알고리즘): 외부 API 없이 즉시 검증 가능
 * - 포맷팅: 000-00-00000
 */

/**
 * 입력값에서 숫자만 추출 (10자리)
 */
export function getDigitsOnly(input: string): string {
  return (input || '').replace(/\D/g, '').slice(0, 10);
}

/**
 * 000-00-00000 포맷으로 변환
 */
export function formatBusinessNumber(input: string): string {
  const digits = getDigitsOnly(input);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/**
 * 사업자등록번호 체크섬 검증
 *
 * 알고리즘 (국세청 공식):
 *   가중치: [1, 3, 7, 1, 3, 7, 1, 3, 5]
 *   1) 앞 9자리 × 가중치를 각각 곱하고
 *   2) 9번째 자리(d[8])에는 곱한 결과의 (d[8]*5 / 10)을 더함
 *   3) 합계 % 10 의 보수가 마지막 자리(d[9])와 같아야 유효
 *
 * @returns true: 유효한 형식, false: 잘못된 번호
 */
export function isValidBusinessNumberFormat(input: string): boolean {
  const digits = getDigitsOnly(input);
  if (digits.length !== 10) return false;

  const nums = digits.split('').map((c) => parseInt(c, 10));
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += nums[i] * weights[i];
  }
  // 9번째 자리(d[8]) × 5 의 십의 자리 추가
  sum += Math.floor((nums[8] * 5) / 10);

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === nums[9];
}
