# Firebase Google 로그인 설정 가이드

## 🚨 긴급: Vercel 배포 환경에서 Google 로그인 설정

### 1. Firebase Console 접속
1. https://console.firebase.google.com 접속
2. 프로젝트 선택: `in-f8873`

### 2. Authentication 설정
1. 왼쪽 메뉴에서 **Authentication** 클릭
2. **Sign-in method** 탭 선택
3. **Google** 제공자 활성화 확인
4. **Authorized domains** 섹션 확인

### 3. 승인된 도메인 추가 (중요!)
**Authorized domains**에 다음 도메인들이 모두 추가되어 있는지 확인:
- `localhost`
- `in-f8873.firebaseapp.com`
- `250709in.vercel.app`
- `250709in-*.vercel.app` (와일드카드)
- `250709in-ajliwxm44-lee-jin-soos-projects.vercel.app` (현재 배포 URL)

### 4. Google Cloud Console OAuth 설정
1. https://console.cloud.google.com 접속
2. 프로젝트 선택: `in-f8873`
3. **APIs & Services** > **Credentials** 이동
4. OAuth 2.0 Client IDs에서 Web client 선택
5. **Authorized JavaScript origins**에 추가:
   - `https://250709in.vercel.app`
   - `https://250709in-ajliwxm44-lee-jin-soos-projects.vercel.app`
6. **Authorized redirect URIs**에 추가:
   - `https://250709in.vercel.app/__/auth/handler`
   - `https://250709in-ajliwxm44-lee-jin-soos-projects.vercel.app/__/auth/handler`

### 5. Vercel 환경변수 확인
이미 설정되어 있음 (확인 완료):
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID

### 6. 배포 후 테스트
1. https://250709in-ajliwxm44-lee-jin-soos-projects.vercel.app 접속
2. Google 로그인 시도
3. 브라우저 콘솔에서 에러 메시지 확인

## 트러블슈팅
- **Error: auth/unauthorized-domain**: Firebase Console에서 도메인 추가 필요
- **Error: auth/operation-not-allowed**: Google 로그인 제공자 활성화 필요
- **Error: 403 Forbidden**: Google Cloud Console에서 OAuth 설정 필요