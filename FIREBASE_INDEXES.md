# Firebase Firestore 인덱스 설정 가이드

이 프로젝트에서는 다음과 같은 Firestore 복합 인덱스가 필요합니다.

## 필요한 인덱스

### 1. 팀 초대 (teamInvitations)
- **Collection**: `teamInvitations`
- **Fields**:
  - `inviteeEmail` (Ascending)
  - `status` (Ascending)
  - `createdAt` (Descending)

### 2. 공유 프로젝트 (projectShares)
- **Collection**: `projectShares`
- **Fields**:
  - `isActive` (Ascending)
  - `sharedWith` (Ascending)
  - `createdAt` (Descending)

## 인덱스 생성 방법

1. [Firebase Console](https://console.firebase.google.com)에 접속합니다.
2. 프로젝트 선택 후 Firestore Database로 이동합니다.
3. 좌측 메뉴에서 "인덱스" 탭을 클릭합니다.
4. "인덱스 만들기" 버튼을 클릭합니다.
5. 위에 명시된 필드와 정렬 순서를 설정합니다.
6. "만들기" 버튼을 클릭하여 인덱스를 생성합니다.

## 대안: 자동 인덱스 생성

콘솔에 출력되는 에러 메시지에 포함된 URL을 클릭하면 자동으로 필요한 인덱스를 생성할 수 있습니다.

예시:
```
The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/...
```

이 URL을 클릭하면 Firebase Console에서 자동으로 인덱스 생성 화면이 열립니다.

## 주의사항

- 인덱스 생성에는 몇 분이 소요될 수 있습니다.
- 인덱스가 생성되기 전까지는 해당 쿼리가 작동하지 않습니다.
- 인덱스가 없어도 애플리케이션은 정상적으로 작동하며, 해당 기능만 제한됩니다.