import { FirebaseError } from 'firebase/app';
import { FirestoreError } from 'firebase/firestore';

export class AppError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public technicalMessage?: string,
    public statusCode: number = 500
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}

export const FirebaseErrorMap = {
  // Authentication Errors
  'auth/user-not-found': '사용자를 찾을 수 없습니다.',
  'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
  'auth/email-already-in-use': '이미 사용 중인 이메일입니다.',
  'auth/weak-password': '비밀번호가 너무 약합니다.',
  'auth/invalid-email': '올바르지 않은 이메일 형식입니다.',
  'auth/user-disabled': '비활성화된 계정입니다.',
  'auth/operation-not-allowed': '허용되지 않은 작업입니다.',
  'auth/requires-recent-login': '최근 로그인이 필요합니다.',
  'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
  'auth/too-many-requests': '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',

  // Firestore Errors
  'permission-denied': '접근 권한이 없습니다.',
  'not-found': '요청한 리소스를 찾을 수 없습니다.',
  'already-exists': '이미 존재하는 데이터입니다.',
  'resource-exhausted': '요청 한도를 초과했습니다.',
  'failed-precondition': '사전 조건을 충족하지 못했습니다.',
  'aborted': '작업이 중단되었습니다.',
  'out-of-range': '유효하지 않은 범위입니다.',
  'unimplemented': '구현되지 않은 기능입니다.',
  'internal': '내부 서버 오류가 발생했습니다.',
  'unavailable': '서비스를 일시적으로 사용할 수 없습니다.',
  'data-loss': '데이터 손실이 발생했습니다.',
  'unauthenticated': '로그인이 필요합니다.',
  'cancelled': '작업이 취소되었습니다.',
  'deadline-exceeded': '요청 시간이 초과되었습니다.',
  'invalid-argument': '잘못된 인수가 제공되었습니다.',

  // Custom Application Errors
  'team/member-limit-exceeded': '팀 멤버 수 제한을 초과했습니다.',
  'team/invitation-expired': '초대가 만료되었습니다.',
  'team/already-member': '이미 팀 멤버입니다.',
  'project/max-limit-exceeded': '프로젝트 생성 한도를 초과했습니다.',
  'project/invalid-share-permission': '올바르지 않은 공유 권한입니다.',
  'storage/upload-failed': '파일 업로드에 실패했습니다.',
  'storage/file-too-large': '파일 크기가 너무 큽니다.'
};

export const handleFirebaseError = (error: any): AppError => {
  console.error('🔥 Firebase Error:', error);

  let code = 'unknown';
  let technicalMessage = 'Unknown error';

  // Firebase Error (Auth, Firestore, etc.)
  if (error instanceof FirebaseError) {
    code = error.code;
    technicalMessage = error.message;
  }
  // Firestore Error
  else if (error.code) {
    code = error.code;
    technicalMessage = error.message;
  }
  // Custom App Error (already handled)
  else if (error instanceof AppError) {
    return error;
  }
  // Generic Error
  else if (error instanceof Error) {
    technicalMessage = error.message;
    code = 'app/generic-error';
  }

  const userMessage = FirebaseErrorMap[code as keyof typeof FirebaseErrorMap] || 
    '알 수 없는 오류가 발생했습니다. 문제가 지속되면 관리자에게 문의해주세요.';

  // Log for monitoring
  logError(code, userMessage, technicalMessage, error);

  return new AppError(code, userMessage, technicalMessage);
};

export const logError = (
  code: string, 
  userMessage: string, 
  technicalMessage: string, 
  originalError: any
) => {
  // In production, this would send to error tracking service (Sentry, LogRocket, etc.)
  const errorLog = {
    timestamp: new Date().toISOString(),
    code,
    userMessage,
    technicalMessage,
    stack: originalError?.stack,
    userAgent: navigator.userAgent,
    url: window.location.href,
    userId: null // Would be filled from auth context
  };

  console.error('📊 Error logged:', errorLog);
  
  // Send to monitoring service in production
  // sendToMonitoring(errorLog);
};

export const createBusinessError = (
  code: string,
  userMessage: string,
  technicalMessage?: string
): AppError => {
  return new AppError(code, userMessage, technicalMessage, 400);
};

// Utility function to check if error is retryable
export const isRetryableError = (error: AppError): boolean => {
  const retryableCodes = [
    'unavailable',
    'internal',
    'deadline-exceeded',
    'resource-exhausted',
    'auth/network-request-failed'
  ];
  
  return retryableCodes.includes(error.code);
};

// Utility function for error boundaries
export const formatErrorForUser = (error: any): string => {
  const appError = handleFirebaseError(error);
  return appError.userMessage;
};

export default handleFirebaseError;