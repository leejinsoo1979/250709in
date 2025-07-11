# 🗂️ Store 데이터 구조 문서

가구 에디터 프로젝트의 Zustand Store들에 포함된 데이터 구조와 변수들을 정리한 문서입니다.

## 📋 목차
- [1. ProjectStore](#1-projectstore)
- [2. SpaceConfigStore](#2-spaceconfigstore)
- [3. DerivedSpaceStore](#3-derivedspacestore)
- [4. UIStore](#4-uistore)

---

## 1. ProjectStore
> **파일 위치**: `src/store/core/projectStore.ts`  
> **역할**: 프로젝트의 기본 정보와 전체 상태 관리

### 📊 데이터 구조

#### **basicInfo: BasicInfo**
프로젝트의 기본 정보를 담는 객체
- `title: string` - 프로젝트 제목
- `location: string` - 프로젝트 위치/장소

#### **isDirty: boolean**
프로젝트에 저장되지 않은 변경사항이 있는지 표시
- `true`: 변경사항 있음 (저장 필요)
- `false`: 변경사항 없음 (최신 저장 상태)

### 🔧 주요 액션들
- `setBasicInfo()` - 기본 정보 설정
- `resetBasicInfo()` - 기본 정보 초기화
- `resetAll()` - 전체 상태 초기화
- `markAsSaved()` - 저장 완료 상태로 마킹

---

## 2. SpaceConfigStore
> **파일 위치**: `src/store/core/spaceConfigStore.ts`  
> **역할**: 공간 설정과 가구 배치 관련 설정 관리

### 📊 데이터 구조

#### **spaceInfo: SpaceInfo**
공간의 모든 설정 정보를 담는 메인 객체

##### 🏠 **기본 치수**
- `width: number` - 공간 폭 (mm 단위, 기본값: 3600)
- `height: number` - 공간 높이 (mm 단위, 기본값: 2400)
- `depth: number` - 공간 깊이 (mm 단위, 기본값: 580)

##### 🔧 **설치 타입**
- `installType: InstallType` - 설치 방식
  - `'built-in'`: 빌트인 방식
  - `'stand-alone'`: 독립형 방식

##### 🧱 **벽 설정**
- `wallConfig: { left: boolean, right: boolean }` - 좌우 벽면 존재 여부
  - `left: boolean` - 왼쪽 벽 존재 여부 (기본값: true)
  - `right: boolean` - 오른쪽 벽 존재 여부 (기본값: true)

##### 🏢 **바닥 마감**
- `hasFloorFinish: boolean` - 바닥 마감재 사용 여부 (기본값: false)
- `floorFinish?: FloorFinishConfig` - 바닥 마감재 설정
  - `height: number` - 마감재 높이 (기본값: 50mm)

##### 🖼️ **테두리 설정 (Configurator 전용)**
- `surroundType?: SurroundType` - 테두리 타입
  - `'surround'`: 테두리 있음 (기본값)
  - `'no-surround'`: 테두리 없음
- `frameSize?: FrameSize` - 프레임 크기 설정
  - `left: number` - 왼쪽 프레임 크기 (기본값: 50mm)
  - `right: number` - 오른쪽 프레임 크기 (기본값: 50mm)
  - `top: number` - 상단 프레임 크기 (기본값: 50mm)

##### 📏 **간격 설정**
- `gapConfig?: GapConfig` - 모듈 간 간격 설정
  - `size: 2 | 3` - 간격 크기 (2mm 또는 3mm)

##### 🏗️ **받침대 설정**
- `baseConfig?: BaseConfig` - 받침대 관련 설정
  - `type: 'floor' | 'stand'` - 받침대 타입 (기본값: 'floor')
  - `height: number` - 받침대 높이 (기본값: 65mm)
  - `placementType?: 'ground' | 'float'` - 배치 방식 (기본값: 'ground')
  - `floatHeight?: number` - 띄워서 배치 시 높이

##### 📐 **컬럼 설정**
- `customColumnCount?: number` - 사용자 지정 컬럼 수

##### 🎨 **재질 설정**
- `materialConfig?: MaterialConfig` - 재질 및 색상 설정
  - `interiorColor: string` - 내부 색상 (기본값: '#FFFFFF')
  - `doorColor: string` - 도어 색상 (기본값: '#FFFFFF')

#### **isDirty: boolean**
공간 설정에 저장되지 않은 변경사항이 있는지 표시

### 🔧 주요 액션들
- `setSpaceInfo()` - 공간 정보 설정
- `resetSpaceInfo()` - 공간 정보 초기화
- `resetMaterialConfig()` - 재질 설정 초기화
- `resetAll()` - 전체 상태 초기화
- `markAsSaved()` - 저장 완료 상태로 마킹

---

## 3. DerivedSpaceStore
> **파일 위치**: `src/store/derivedSpaceStore.ts`  
> **역할**: SpaceInfo를 기반으로 계산된 파생 데이터들을 캐시

### 📊 데이터 구조

#### **🏠 내부 공간 치수**
- `internalWidth: number` - 실제 가구 배치 가능한 내부 폭 (프레임 제외)
- `internalHeight: number` - 실제 가구 배치 가능한 내부 높이
- `internalDepth: number` - 실제 가구 배치 가능한 내부 깊이

#### **📐 컬럼 관련 데이터**
- `columnCount: number` - 계산된 컬럼 개수
- `columnWidth: number` - 각 컬럼의 폭
- `columnPositions: number[]` - 각 컬럼의 X 좌표 배열
- `columnBoundaries: number[]` - 컬럼 경계선 위치 배열
- `dualColumnPositions: number[]` - 듀얼 컬럼 가능 위치 배열

#### **🎯 3단위 모듈 위치**
- `threeUnitPositions: number[]` - 3단위 모듈 배치 가능한 위치 배열

#### **⚙️ 계산 상태 관리**
- `isCalculated: boolean` - 파생 데이터가 계산되었는지 여부
- `lastCalculatedSpaceInfo: SpaceInfo | null` - 마지막으로 계산에 사용된 SpaceInfo

### 🔧 주요 액션들
- `recalculateFromSpaceInfo()` - SpaceInfo 기반으로 모든 파생 데이터 재계산
- `reset()` - 모든 파생 데이터 초기화

### 🎯 편의 함수들
- `getDerivedSpaceData()` - 모든 파생 데이터 한번에 가져오기
- `useInternalWidth()` - 내부 폭만 구독
- `useColumnData()` - 컬럼 관련 데이터만 구독
- `useInternalSpace()` - 내부 공간 치수만 구독

---

## 4. UIStore
> **파일 위치**: `src/store/uiStore.ts`  
> **역할**: 사용자 인터페이스 상태 관리 (localStorage 연동)

### 📊 데이터 구조

#### **👀 뷰어 모드**
- `viewMode: '2D' | '3D'` - 현재 뷰어 모드
  - `'2D'`: 2D 뷰 (기본값)
  - `'3D'`: 3D 뷰

#### **🚪 문 상태**
- `doorsOpen: boolean` - 가구 도어의 열림/닫힘 상태
  - `true`: 문 열림 상태 (기본값)
  - `false`: 문 닫힘 상태

#### **🎯 선택된 모듈**
- `selectedModuleForProperties: string | null` - 속성 패널에서 선택된 모듈 ID
  - `string`: 선택된 모듈의 ID
  - `null`: 선택된 모듈 없음

### 🔧 주요 액션들
- `setViewMode()` - 뷰 모드 변경
- `toggleDoors()` - 문 열림/닫힘 토글
- `setSelectedModuleForProperties()` - 속성 패널용 모듈 선택
- `resetUI()` - UI 상태 초기화

### 💾 localStorage 연동
- `viewMode`만 localStorage에 저장됨
- `doorsOpen`, `selectedModuleForProperties`는 세션별로 초기화

---

## 🔄 Store 간 관계도

```
ProjectStore (프로젝트 기본 정보)
    ↓
SpaceConfigStore (공간 설정)
    ↓
DerivedSpaceStore (계산된 파생 데이터)
    ↓
UIStore (독립적인 UI 상태)
```

## 📝 주요 특징

1. **단일 책임 원칙**: 각 Store는 명확한 역할 분리
2. **캐싱 최적화**: DerivedSpaceStore는 계산 결과를 캐시하여 성능 향상
3. **타입 안정성**: 모든 데이터는 TypeScript 인터페이스로 타입 정의
4. **상태 동기화**: isDirty 플래그로 저장 상태 추적
5. **선택적 구독**: 필요한 데이터만 구독할 수 있는 셀렉터 제공 