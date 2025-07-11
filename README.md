# 🏠 가구 에디터 (Furniture Editor)

## 🌟 라이브 데모
**[🚀 여기서 실행해보기](https://jinsoolee.github.io/furniture-editor/)**

## 📝 프로젝트 소개
React와 Three.js를 활용한 인터랙티브 3D 가구 배치 에디터입니다. 드래그 앤 드롭으로 가구를 배치하고, 실시간으로 3D 렌더링을 확인할 수 있습니다.

## ✨ 주요 기능

### 🎨 3D 렌더링
- **전문급 렌더링 품질**: 실제 자연광 시스템으로 사실적인 조명
- **실시간 그림자**: 가구 내부 깊이감과 자연스러운 음영
- **고품질 재질**: 목재 질감과 메탈릭 표면의 사실적 표현

### 🏗️ 가구 배치 시스템
- **드래그 앤 드롭**: 직관적인 가구 배치
- **스마트 스냅**: 자동 정렬 및 충돌 감지
- **다양한 모듈**: 서랍, 선반, 도어 등 다양한 가구 구성

### 🔧 커스터마이징
- **공간 설정**: 폭, 높이, 깊이 자유 조정
- **재질 변경**: 다양한 마감재와 색상 선택
- **실시간 미리보기**: 변경사항 즉시 반영

### 📐 정밀한 설계
- **CAD 그리드**: 정확한 치수 기반 배치
- **치수 표시**: 실시간 dimension 라인
- **DXF 내보내기**: 설계 도면 파일 생성

## 🛠️ 기술 스택

### Frontend
- **React 19** - 최신 함수형 컴포넌트
- **TypeScript** - 타입 안정성
- **Three.js** - 3D 렌더링 엔진
- **React Three Fiber** - React와 Three.js 통합

### 상태 관리
- **Zustand** - 경량 상태 관리
- **React Context** - 컴포넌트 간 데이터 공유

### 빌드 도구
- **Vite** - 빠른 개발 서버
- **ESBuild** - 고성능 번들링

## 🚀 로컬 실행 방법

```bash
# 저장소 클론
git clone https://github.com/jinsoolee/furniture-editor.git
cd furniture-editor

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 브라우저에서 http://localhost:5173 접속
```

## 📦 빌드 및 배포

```bash
# 프로덕션 빌드
npm run build

# 미리보기
npm run preview

# GitHub Pages 배포
npm run deploy
```

## 🎯 사용법

1. **공간 설정**: 우측 패널에서 방 크기 조정
2. **가구 선택**: 좌측 갤러리에서 원하는 가구 모듈 선택
3. **배치**: 드래그 앤 드롭으로 3D 공간에 배치
4. **커스터마이징**: 재질, 색상, 크기 조정
5. **내보내기**: DXF 파일로 설계 도면 저장

## 🔍 주요 컴포넌트

### 3D 뷰어
- `Space3DView.tsx` - 메인 3D 렌더링 컨테이너
- `ThreeCanvas.tsx` - Three.js 캔버스 관리
- `Room.tsx` - 방 공간 렌더링 (그라데이션 벽면)

### 가구 모듈
- `FurnitureItem.tsx` - 개별 가구 아이템
- `ModuleGallery.tsx` - 가구 선택 갤러리
- `DoorModule.tsx`, `DrawerRenderer.tsx` - 각종 가구 타입

### 제어 패널
- `RightPanel.tsx` - 설정 및 속성 패널
- `MaterialPanel.tsx` - 재질 선택
- `ExportPanel.tsx` - DXF 내보내기

## 🎨 렌더링 품질 특징

### 전문급 조명 시스템
- **자연광 시뮬레이션**: 3200K 따뜻한 햇빛 + 6500K 차가운 스카이라이트
- **다중 광원**: 창문광, 천장 반사광, 바운스 라이트
- **고품질 그림자**: 4K 그림자맵, 부드러운 음영 처리

### 사실적 재질
- **목재 질감**: PBR 기반 물리적 렌더링
- **적절한 반사**: 자연스러운 빛 반사와 산란
- **깊이감**: 캐비넷 내부의 자연스러운 그라데이션

## 📱 브라우저 호환성
- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

## 🤝 기여하기
이슈나 개선 사항이 있으시면 언제든 Issue를 등록하거나 Pull Request를 보내주세요!

## 📄 라이선스
MIT License

---

**Made with ❤️ using React + Three.js**
