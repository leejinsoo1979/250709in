# Vercel 배포 시 구글 로그인 설정 가이드

## 문제
Vercel에 배포한 후 구글 로그인 시 "auth/unauthorized-domain" 에러가 발생합니다.

## 해결 방법

### 1. Firebase Console 접속
1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택 (in-f8873)

### 2. Authentication 설정
1. 왼쪽 메뉴에서 **Authentication** 클릭
2. 상단 탭에서 **Settings** 클릭
3. **Authorized domains** 탭 선택

### 3. Vercel 도메인 추가
다음 도메인들을 추가해주세요:

```
250709in.vercel.app
250709in-*.vercel.app
```

**추가 방법:**
1. "Add domain" 버튼 클릭
2. 도메인 입력
3. "Add" 클릭

### 4. 환경변수 확인 (Vercel Dashboard)
1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. 프로젝트 선택
3. Settings → Environment Variables
4. 다음 환경변수가 설정되어 있는지 확인:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

**중요:** `VITE_FIREBASE_AUTH_DOMAIN`은 `in-f8873.firebaseapp.com`으로 설정되어야 합니다.

### 5. 재배포
환경변수나 도메인 설정을 변경한 후:
1. Vercel Dashboard에서 "Redeploy" 클릭
2. 또는 터미널에서: `vercel --prod`

## 테스트
1. https://250709in.vercel.app 접속
2. 구글 로그인 시도
3. 정상적으로 로그인되는지 확인

## 추가 도메인 사용 시
커스텀 도메인을 사용하는 경우, 해당 도메인도 Firebase Console의 Authorized domains에 추가해야 합니다.

예시:
- `mydomain.com`
- `www.mydomain.com`

## 문제가 지속될 경우
1. 브라우저 캐시 삭제
2. Firebase Console에서 도메인이 정확히 추가되었는지 재확인
3. Vercel 환경변수가 Production에 적용되었는지 확인