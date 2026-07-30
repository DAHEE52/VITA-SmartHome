// 스마트 취침 감지 - 4단계 상태머신(VITA-Final-Feature-Specification-Document.md 2번 항목).
// FireSafetyContext와 같은 이유로 네비게이터보다 위(App.tsx)에서 한 번만 마운트해서, 사용자가 이
// 화면을 보고 있지 않아도 계속 감시하고 자동으로 취침 모드를 켜고 끈다.
//
// 상태: idle(평상시) → waiting(취침 대기, 기본 조건 충족) → confirming(사용자 확인 대기)
//      → active(취침 모드 활성화) → (기상 감지) → idle
//
// 별도의 취침 전용 카메라 모델(이불 덮음/자는 중 분류) 없이도, 이미 있는 재실 카메라(presence)와
// PIR 모션 센서(motion, env_presence_node가 push)만으로 명세서의 판정 로직을 그대로 구현할 수 있다:
// "30분 무움직임"은 last_motion_at(가장 최근 motion=1 시각) 기준으로 매 tick마다 재계산한다 -
// waiting 진입 시점을 따로 카운트하지 않아도, 실제 마지막 움직임 이후 경과 시간이 곧 정답이라
// 도중에 움직이면 자연히 그 시점부터 다시 30분을 채워야 한다.
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import * as api from '../api/client';
import { usePresence } from './PresenceContext';
import { useRooms } from './RoomsContext';
import { useNotifications } from './NotificationsContext';
import { useHomeSummary } from './HomeSummaryContext';
import { getDeviceType } from '../utils/energy';

const TICK_INTERVAL_MS = 10000;
// 취침 대기 진입 후에도 새벽 활동을 "취침 시간"으로 계속 취급하기 위한 이른 새벽 경계.
const EARLY_MORNING_HOUR_CUTOFF = 6;
// "확인"을 누르면 이 시간 동안은 조건이 다시 충족돼도 재질문하지 않는다.
const CONFIRM_SUPPRESS_HOURS = 12;

export type SleepState = 'idle' | 'waiting' | 'confirming' | 'active';

type SleepContextValue = {
  state: SleepState;
  preset: api.SleepPreset | null;
  confirmStartedAt: number | null; // 취침 확인 알림이 뜬 시각(ms)
  sleepStartedAt: number | null; // 취침 모드가 활성화된 시각(ms)
  confirm: () => void; // "확인" 버튼 - 즉시 취침 모드 활성화하고, 이후 12시간은 재질문하지 않음
  dismiss: () => void; // "나중에" 버튼 - 알림을 닫고, 다시 무움직임 시간만큼 조용해야 재질문함
  setPreset: (patch: Partial<api.SleepPreset>) => void;
};

const SleepContext = createContext<SleepContextValue | null>(null);

function findDevices(rooms: ReturnType<typeof useRooms>['rooms'], type: string) {
  return rooms.flatMap((room) =>
    room.devices.filter((d) => getDeviceType(d.name) === type).map((d) => ({ roomId: room.id, device: d }))
  );
}

// preset.devices는 백엔드 기기 id로 저장되므로(사용자가 원룸에 실제 등록한 기기를 직접 고른 것),
// 적용할 땐 그 id로 현재 방/기기 목록에서 실제 기기를 찾아야 한다(이름은 자유 텍스트라 기기 종류를
// 짐작하는 대신 id로만 매칭한다).
function findDeviceById(rooms: ReturnType<typeof useRooms>['rooms'], deviceId: string) {
  for (const room of rooms) {
    const device = room.devices.find((d) => d.id === deviceId);
    if (device) return { roomId: room.id, device };
  }
  return null;
}

export function SleepProvider({ children }: { children: ReactNode }) {
  const { isHome } = usePresence();
  const { rooms, setDevicePower } = useRooms();
  const { pushNotification } = useNotifications();
  const { summary } = useHomeSummary();

  const [preset, setPresetState] = useState<api.SleepPreset | null>(null);
  const [state, setState] = useState<SleepState>('idle');
  const [confirmStartedAt, setConfirmStartedAt] = useState<number | null>(null);
  const [sleepStartedAt, setSleepStartedAt] = useState<number | null>(null);
  const [lastMotionAtMs, setLastMotionAtMs] = useState<number>(0);
  const sleepRecordIdRef = useRef<number | null>(null);
  // "나중에"를 누른 시각 - 여기서부터 다시 no_motion_minutes만큼 조용해야 재질문한다.
  const dismissedAtRef = useRef<number | null>(null);
  // "확인"을 누르면 이 시각까지는 조건이 충족돼도 재질문을 건너뛴다.
  const suppressedUntilRef = useRef<number>(0);

  // setInterval 콜백이 항상 최신 값을 보도록 ref로 들고 있는다(FireSafetyContext와 동일한 패턴).
  const isHomeRef = useRef(isHome);
  isHomeRef.current = isHome;
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const stateRef = useRef(state);
  stateRef.current = state;
  const confirmStartedAtRef = useRef(confirmStartedAt);
  confirmStartedAtRef.current = confirmStartedAt;
  const sleepStartedAtRef = useRef(sleepStartedAt);
  sleepStartedAtRef.current = sleepStartedAt;
  const lastMotionAtMsRef = useRef(lastMotionAtMs);
  lastMotionAtMsRef.current = lastMotionAtMs;

  useEffect(() => {
    api.getSleepPreset().then(setPresetState).catch((err) => console.warn('취침 프리셋 조회 실패:', err));
  }, []);

  // 최근 움직임 시각 - HomeSummaryContext(/home/summary를 한 곳에서만 폴링)가 갱신할 때마다 반영한다.
  useEffect(() => {
    if (summary?.last_motion_at) setLastMotionAtMs(new Date(summary.last_motion_at).getTime());
  }, [summary]);

  // preset.devices에 등록된 기기들을 각자 지정된 on/off 상태로 맞춘다(사용자가 자동화 규칙
  // 화면의 "🛏 취침 모드" 버튼에서 직접 고른 기기와 목표 상태). invert=true면 그 반대로 맞춘다 - 기상 시 취침 모드가 바꿔놓은
  // 상태를 되돌리는 용도.
  const applySleepDevices = (invert: boolean) => {
    const p = presetRef.current;
    if (!p) return;
    for (const { device_id, on } of p.devices) {
      const found = findDeviceById(roomsRef.current, device_id);
      if (!found) continue; // 취침 모드 설정 이후 삭제된 기기는 조용히 건너뛴다.
      setDevicePower(found.roomId, found.device.name, invert ? !on : on);
    }
  };

  const activateSleepMode = () => {
    const p = presetRef.current;
    if (!p) return;
    applySleepDevices(false);

    const now = Date.now();
    setState('active');
    setSleepStartedAt(now);
    setConfirmStartedAt(null);
    api
      .startSleepRecord(new Date(now).toISOString())
      .then((record) => {
        sleepRecordIdRef.current = record.id;
      })
      .catch((err) => console.warn('취침 기록 시작 실패:', err));
    pushNotification(
      '✅ 취침 모드 활성화됨',
      p.devices.length > 0 ? '좋은 밤 되세요! 🌙 설정한 기기들이 지정한 상태로 조정됐어요.' : '좋은 밤 되세요! 🌙'
    );
  };

  const wakeUp = () => {
    applySleepDevices(true);

    const startedAt = sleepStartedAtRef.current;
    const recordId = sleepRecordIdRef.current;
    if (recordId != null) {
      api.endSleepRecord(recordId, new Date().toISOString()).catch((err) => console.warn('취침 기록 종료 실패:', err));
    }
    sleepRecordIdRef.current = null;

    const durationText =
      startedAt != null
        ? (() => {
            const mins = Math.round((Date.now() - startedAt) / 60000);
            return `수면 시간: ${Math.floor(mins / 60)}시간 ${mins % 60}분`;
          })()
        : '';
    setState('idle');
    setSleepStartedAt(null);
    setConfirmStartedAt(null);
    pushNotification('☀️ 좋은 아침입니다!', durationText || '오늘도 좋은 하루 보내세요.');
  };

  const enterConfirming = () => {
    setState('confirming');
    setConfirmStartedAt(Date.now());
    const p = presetRef.current;
    pushNotification('취침 중이신가요?', `${p?.no_motion_minutes ?? 30}분간 움직임이 없었어요`);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      const p = presetRef.current;
      if (!p) return;
      const now = Date.now();
      const hour = new Date(now).getHours();
      const isBedtimeWindow = hour >= p.bedtime_hour || hour < EARLY_MORNING_HOUR_CUTOFF;
      const lightDevices = findDevices(roomsRef.current, '조명');
      const lightOff = lightDevices.every(({ device }) => !device.on);
      const baseConditionsMet = isHomeRef.current && lightOff && isBedtimeWindow;
      // "나중에"를 누른 시각도 무움직임 계산의 기준점으로 삼는다 - 그래야 실제 센서 움직임이 없어도
      // 다시 no_motion_minutes가 통째로 지나야 재질문한다("나중에 누르고 30분 뒤 다시 질문").
      const motionBaselineMs = Math.max(lastMotionAtMsRef.current, dismissedAtRef.current ?? 0);
      const noMotionMs = now - motionBaselineMs;
      const suppressed = now < suppressedUntilRef.current;

      switch (stateRef.current) {
        case 'idle':
          if (baseConditionsMet) {
            if (noMotionMs >= p.no_motion_minutes * 60000 && !suppressed) enterConfirming();
            else setState('waiting');
          }
          break;
        case 'waiting':
          if (!baseConditionsMet) {
            setState('idle');
          } else if (noMotionMs >= p.no_motion_minutes * 60000 && !suppressed) {
            enterConfirming();
          }
          break;
        case 'confirming': {
          const confirmStart = confirmStartedAtRef.current ?? now;
          // 확인 알림이 뜬 뒤에 새로 움직임이 감지되면 "깨어있다"는 뜻이므로 대기 상태로 복귀.
          // (이 상태는 "나중에"/"확인" 버튼으로만 벗어난다 - 응답 없다고 자동으로 활성화하지 않는다.)
          if (lastMotionAtMsRef.current > confirmStart) {
            setState('idle');
            setConfirmStartedAt(null);
          }
          break;
        }
        case 'active':
          if (lastMotionAtMsRef.current > (sleepStartedAtRef.current ?? now)) {
            wakeUp();
          }
          break;
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  // "확인" - 즉시 취침 모드를 활성화하고, 이후 12시간 동안은 조건이 다시 충족돼도 재질문하지 않는다.
  const confirm = () => {
    if (stateRef.current !== 'confirming') return;
    suppressedUntilRef.current = Date.now() + CONFIRM_SUPPRESS_HOURS * 60 * 60 * 1000;
    activateSleepMode();
  };

  // "나중에" - 알림 창을 닫고 대기 상태로 되돌린다. 지금 이 순간을 새 기준점으로 삼아서, 다시
  // no_motion_minutes만큼 조용해야만 재질문한다(그 전에 실제 움직임이 감지되면 기준점이 그걸로 대체됨).
  const dismiss = () => {
    if (stateRef.current !== 'confirming') return;
    dismissedAtRef.current = Date.now();
    setConfirmStartedAt(null);
    setState('waiting');
  };

  const setPreset = (patch: Partial<api.SleepPreset>) => {
    const prev = preset;
    setPresetState((p) => (p ? { ...p, ...patch } : p));
    api.updateSleepPreset(patch).catch((err) => {
      console.warn('취침 프리셋 저장 실패:', err);
      setPresetState(prev);
      pushNotification('저장 실패', '취침 모드 설정이 서버에 반영되지 않았어요. 다시 시도해 주세요.');
    });
  };

  return (
    <SleepContext.Provider
      value={{ state, preset, confirmStartedAt, sleepStartedAt, confirm, dismiss, setPreset }}
    >
      {children}
    </SleepContext.Provider>
  );
}

export function useSleep() {
  const ctx = useContext(SleepContext);
  if (!ctx) throw new Error('useSleep must be used within a SleepProvider');
  return ctx;
}
