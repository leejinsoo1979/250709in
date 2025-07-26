# Vercel 배포 시 Google 로그인 설정 가이드

## 1. Vercel 환경 변수 설정

Vercel 대시보드에서 프로젝트 설정으로 이동하여 다음 환경 변수를 추가하세요:

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 2. Firebase Console 설정

### 2.1 인증된 도메인 추가
1. [Firebase Console](https://console.firebase.google.com) 접속
2. 프로젝트 선택
3. Authentication → Settings → Authorized domains
4. 다음 도메인 추가:
   - `localhost` (이미 있을 것)
   - `your-project-name.vercel.app`
   - `your-project-name-*.vercel.app` (preview 배포용)
   - `*.vercel.app` (모든 Vercel 배포용)

## 3. Google Cloud Console 설정

### 3.1 OAuth 2.0 클라이언트 설정
1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 프로젝트 선택
3. APIs & Services → Credentials
4. OAuth 2.0 Client IDs에서 웹 애플리케이션 클릭
5. Authorized JavaScript origins에 추가:
   - `https://your-project-name.vercel.app`
   - `https://your-project-name-*.vercel.app`
6. Authorized redirect URIs에 추가:
   - `https://your-project-name.vercel.app/__/auth/handler`
   - `https://your-project-name-*.vercel.app/__/auth/handler`

## 4. 배포 확인 사항

### 4.1 vercel.json 설정 확인
- CORS 헤더가 올바르게 설정되어 있는지 확인
- SPA 라우팅을 위한 rewrites 설정 확인

### 4.2 환경 변수 확인
- Vercel 대시보드에서 모든 환경 변수가 제대로 설정되었는지 확인
- Production, Preview, Development 환경에 모두 적용되었는지 확인

### 4.3 배포 후 테스트
1. 배포된 URL로 접속
2. 개발자 도구 콘솔에서 에러 확인
3. Network 탭에서 Firebase 인증 요청 확인

## 5. 일반적인 문제 해결

### 문제: "Error: This domain is not authorized"
- Firebase Console에서 도메인이 추가되었는지 확인
- 도메인 추가 후 몇 분 기다려야 할 수 있음

### 문제: "Error: redirect_uri_mismatch"
- Google Cloud Console에서 리디렉션 URI가 정확히 일치하는지 확인
- HTTPS 프로토콜 사용 확인

### 문제: "Cross-Origin-Opener-Policy" 에러
- vercel.json의 headers 설정 확인
- Firebase Auth 관련 경로에 대한 CORS 설정 확인

## 6. 추가 보안 설정 (선택사항)

### 6.1 도메인 제한
Firebase Console에서 특정 도메인만 허용하도록 설정 가능

### 6.2 API 키 제한
Google Cloud Console에서 API 키 사용을 특정 도메인으로 제한 가능