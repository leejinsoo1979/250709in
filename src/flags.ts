export const FLAGS = {
  teamScope: true,      // 팀 스코프 경로(읽기 우선)
  dualWrite: true,      // 저장 이중쓰기는 후속 단계에서 ON
  newReadsFirst: true,  // 새 경로 우선, 없으면 레거시 폴백
  nestedDesigns: true   // 디자인을 프로젝트 하위 경로에 저장
};