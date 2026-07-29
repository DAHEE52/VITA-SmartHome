// 여러 Context(Calendar/Rooms/Automation/Settings/Sleep 등)가 "먼저 화면에 반영하고, 그 뒤
// 백엔드에도 저장한다"는 낙관적 업데이트 패턴을 쓰는데, 지금까지는 저장이 실패해도 console.warn만
// 찍고 화면은 그대로 둬서 사용자가 성공한 줄 알지만 서버엔 반영 안 된 "유령 상태"가 생겼다
// (예: 삭제한 캘린더 일정이 다음에 목록을 다시 불러오면 되살아남).
//
// 이 헬퍼는 실패 시 (1) 직전 상태로 되돌리고 (2) 원하면 사용자에게 보이는 알림까지 띄운다.
// prevValue는 낙관적으로 바꾸기 "직전"의 전체 상태 스냅샷이어야 한다 - 롤백은 항상 그 값으로
// 통째로 되돌리는 단순 교체이므로, 호출부에서 매번 "실패하면 뭘 어떻게 되돌릴지"를 새로 짤 필요가 없다.
export function rollbackOnFailure<T>(
  apiCall: Promise<unknown>,
  prevValue: T,
  setState: (value: T) => void,
  logLabel: string,
  notifyFailure?: () => void
): void {
  apiCall.catch((err) => {
    console.warn(`${logLabel} 실패:`, err);
    setState(prevValue);
    notifyFailure?.();
  });
}
