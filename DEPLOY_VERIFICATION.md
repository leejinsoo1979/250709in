# Firebase 규칙 배포 및 검증 가이드

## 1. 배포 명령어

```bash
# 1) Firebase 로그인
firebase login

# 2) 프로젝트 선택
firebase use [PROJECT_ID]

# 3) 규칙과 인덱스 배포
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## 2. 검증 시나리오

### A) 팀 멤버 접근 테스트
```javascript
// 로그인한 사용자가 팀 멤버인 경우
const teamId = `personal_${auth.currentUser.uid}`;
const designsRef = collection(db, `teams/${teamId}/designs`);
await getDocs(designsRef); // ✅ 성공해야 함
await addDoc(designsRef, { name: 'Test Design' }); // ✅ 성공해야 함
```

### B) 버전 불변성 테스트
```javascript
// 버전 문서 생성 (성공)
const versionRef = doc(collection(db, `teams/${teamId}/designs/${designId}/versions`));
await setDoc(versionRef, { version_no: 1, state_json: {} }); // ✅ 성공

// 버전 문서 수정 시도 (실패해야 함)
await updateDoc(versionRef, { state_json: { modified: true } }); // ❌ 거부되어야 함

// 버전 문서 삭제 시도 (실패해야 함)
await deleteDoc(versionRef); // ❌ 거부되어야 함
```

### C) 비멤버 접근 테스트
```javascript
// 다른 팀의 데이터 접근 시도
const otherTeamId = 'other_team_id';
const otherTeamRef = doc(db, `teams/${otherTeamId}/designs/some_design`);
await getDoc(otherTeamRef); // ❌ 거부되어야 함
```

### D) 에셋 쿼리 테스트
```javascript
// 에셋 쿼리 (인덱스 사용)
const assetsQuery = query(
  collection(db, `teams/${teamId}/assets`),
  where('owner_type', '==', 'version'),
  where('owner_id', '==', versionId),
  orderBy('created_at', 'desc')
);
await getDocs(assetsQuery); // ✅ 성공해야 함
```

### E) Legacy 접근 테스트
```javascript
// 본인 문서 접근 (성공)
const myProjectRef = doc(db, 'projects', 'my_project_id');
await getDoc(myProjectRef); // ✅ userId가 일치하면 성공

// 타인 문서 접근 (실패)
const otherProjectRef = doc(db, 'projects', 'other_project_id');
await getDoc(otherProjectRef); // ❌ userId가 다르면 거부
```

## 3. Firebase Console에서 수동 배포

Firebase Console (https://console.firebase.google.com) 에서:

1. **Firestore 규칙**:
   - Firestore Database → Rules 탭
   - `firestore.rules` 내용 복사/붙여넣기
   - Publish 클릭

2. **Storage 규칙**:
   - Storage → Rules 탭
   - `storage.rules` 내용 복사/붙여넣기
   - Publish 클릭

3. **인덱스**:
   - Firestore Database → Indexes 탭
   - Create Index 클릭
   - Collection: assets
   - Fields: 
     - owner_type (Ascending)
     - owner_id (Ascending)
     - created_at (Descending)
   - Create 클릭

## 4. 검증 로그 예시

```
✅ A) 팀 멤버 teams/{teamId}/designs 읽기/쓰기: OK
✅ B) versions 문서 update/delete 거부: OK (Permission denied)
✅ C) 비멤버 teams/{teamId}/** 접근 거부: OK (Permission denied)
✅ D) assets 쿼리 인덱스 동작: OK
✅ E) legacy projects 본인 문서만 접근: OK
```