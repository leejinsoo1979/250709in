# 프로덕션 배포 가이드

이 문서는 프로덕션 환경에서 Firebase 백엔드를 완전히 설정하고 배포하는 방법을 안내합니다.

## 1. Firebase 프로젝트 설정

### 1.1 Firebase CLI 설치 및 로그인
```bash
npm install -g firebase-tools
firebase login
firebase init
```

### 1.2 Firebase 프로젝트 초기화
```bash
# 기존 프로젝트와 연결
firebase use --add

# 또는 새 프로젝트 생성
firebase projects:create your-project-id
firebase use your-project-id
```

## 2. Firebase 서비스 활성화

### 2.1 필수 서비스 활성화
Firebase Console에서 다음 서비스들을 활성화해주세요:

1. **Authentication**
   - Google, Email/Password 로그인 방식 활성화
   - 승인된 도메인 추가

2. **Firestore Database**
   - 프로덕션 모드로 생성
   - 지역 설정 (asia-northeast3 권장)

3. **Storage**
   - 기본 버킷 생성
   - 적절한 지역 설정

4. **Hosting** (선택사항)
   - 웹 앱 호스팅용

## 3. 보안 규칙 배포

### 3.1 Firestore 규칙 배포
```bash
firebase deploy --only firestore:rules
```

### 3.2 Storage 규칙 배포
```bash
firebase deploy --only storage
```

## 4. 인덱스 생성

### 4.1 자동 인덱스 생성
```bash
firebase deploy --only firestore:indexes
```

### 4.2 수동 인덱스 생성
필요한 경우 Firebase Console에서 수동으로 생성:

1. Firestore Database > 인덱스 탭
2. "복합 인덱스 생성" 클릭
3. 아래 인덱스들 생성:

#### 팀 초대 인덱스
- Collection: `teamInvitations`
- Fields: `inviteeEmail` (ASC), `status` (ASC), `createdAt` (DESC)

#### 프로젝트 공유 인덱스
- Collection: `projectShares`
- Fields: `isActive` (ASC), `sharedWith` (ASC), `createdAt` (DESC)

#### 사용자 프로젝트 인덱스
- Collection: `projects`
- Fields: `userId` (ASC), `updatedAt` (DESC)

## 5. 환경 변수 설정

### 5.1 Firebase 설정
`src/firebase/config.ts` 파일의 환경 변수를 프로덕션 값으로 업데이트:

```typescript
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};
```

### 5.2 .env 파일 설정
```env
# Firebase 설정
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

# 환경 설정
NODE_ENV=production
VITE_APP_ENV=production
```

## 6. 빌드 및 배포

### 6.1 프로덕션 빌드
```bash
npm run build
```

### 6.2 Firebase Hosting 배포 (선택사항)
```bash
firebase deploy --only hosting
```

### 6.3 전체 배포
```bash
firebase deploy
```

## 7. 모니터링 설정

### 7.1 Firebase Performance Monitoring
```bash
# Firebase Console에서 Performance Monitoring 활성화
```

### 7.2 Crashlytics 설정 (선택사항)
```typescript
// src/firebase/config.ts
import { getAnalytics } from 'firebase/analytics';
import { getPerformance } from 'firebase/performance';

export const analytics = getAnalytics(app);
export const performance = getPerformance(app);
```

## 8. 백업 및 복구 설정

### 8.1 Firestore 자동 백업
Firebase Console > Firestore > 백업에서 설정

### 8.2 수동 백업 스크립트
```bash
#!/bin/bash
# backup.sh
gcloud firestore export gs://your-backup-bucket/$(date +%Y-%m-%d)
```

## 9. 보안 검토사항

### 9.1 인증 보안
- [ ] 비밀번호 정책 설정
- [ ] 다중 인증 활성화
- [ ] 승인된 도메인만 허용

### 9.2 데이터베이스 보안
- [ ] Security Rules 검토
- [ ] 민감한 데이터 암호화
- [ ] 접근 로그 모니터링

### 9.3 API 보안
- [ ] API 키 제한 설정
- [ ] CORS 정책 설정
- [ ] Rate Limiting 구현

## 10. 성능 최적화

### 10.1 Firestore 최적화
- [ ] 인덱스 최적화
- [ ] 쿼리 최적화
- [ ] 데이터 구조 정규화

### 10.2 Frontend 최적화
- [ ] 코드 분할
- [ ] 이미지 최적화
- [ ] 캐싱 전략

## 11. 모니터링 대시보드

### 11.1 Firebase Console 모니터링
- Usage and billing
- Performance 탭
- Crashlytics 리포트

### 11.2 외부 모니터링 도구 (선택사항)
- Google Cloud Monitoring
- Sentry (에러 추적)
- LogRocket (사용자 세션 녹화)

## 12. 배포 후 체크리스트

- [ ] 모든 인덱스가 생성되었는지 확인
- [ ] Security Rules가 올바르게 적용되었는지 확인
- [ ] 인증 시스템이 정상 작동하는지 확인
- [ ] 프로젝트 CRUD 기능 테스트
- [ ] 팀 관리 기능 테스트
- [ ] 파일 업로드/다운로드 테스트
- [ ] 실시간 동기화 테스트
- [ ] 성능 메트릭 확인
- [ ] 에러 로깅 확인

## 13. 문제 해결

### 13.1 일반적인 문제
- **인덱스 생성 중**: 인덱스 생성에는 몇 분이 소요될 수 있습니다.
- **권한 오류**: Security Rules를 확인하고 사용자 권한을 검토하세요.
- **성능 이슈**: 쿼리 최적화와 인덱스 추가를 고려하세요.

### 13.2 지원 연락처
- Firebase 지원: Firebase Console > 지원 탭
- 개발팀 연락처: [개발팀 이메일]

---

이 가이드를 따라 배포하면 프로덕션 레벨의 안정적인 Firebase 백엔드를 구축할 수 있습니다.