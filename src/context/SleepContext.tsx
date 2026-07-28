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
import { getDeviceType } from '../utils/energy';

const TICK_INTERVAL_MS = 10000;
const SUMMARY_POLL_MS = 10000;
// 취침 대기 진입 후에도 새벽 활동을 "취침 시간"으로 계속 취급하기 위한 이른 새벽 경계.
const EARLY_MORNING_HOUR_CUTOFF = 6;

export type SleepState = 'idle' | 'waiting' | 'confirming' | 'active';

type SleepContextValue = {
  state: SleepState;
  preset: api.SleepPreset | null;
  confirmStartedAt: number | null; // 취침 확인 알림이 뜬 시각(ms) - 카운트다운 표시용
  sleepStartedAt: number | null; // 취침 모드가 활성화된 시각(ms)
  confirm: () => void; // "확인" 버튼 - 즉시 취침 모드 활성화
  dismiss: () => void; // "나중에" 버튼 - 대기 상태로 되돌림(자동 활성화 타이머는 계속 흐름)
  setPreset: (patch: Partial<api.SleepPreset>) => void;
};

const SleepContext = createContext<SleepContextValue | null>(null);

function findDevices(rooms: ReturnType<typeof useRooms>['rooms'], type: string) {
  return rooms.flatMap((room) =>
    room.devices.filter((d) => getDeviceType(d.name) === type).map((d) => ({ roomId: room.id, device: d }))
  );
}

export function SleepProvider({ children }: { children: ReactNode }) {
  const { isHome } = usePresence();
  const { rooms, setDevicePower } = useRooms();
  const { pushNotification } = useNotifications();

  const [preset, setPresetState] = useState<api.SleepPreset | null>(null);
  const [state, setState] = useState<SleepState>('idle');
  const [confirmStartedAt, setConfirmStartedAt] = useState<number | null>(null);
  const [sleepStartedAt, setSleepStartedAt] = useState<number | null>(null);
  const [lastMotionAtMs, setLastMotionAtMs] = useState<number>(0);
  const sleepRecordIdRef = useRef<number | null>(null);

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

  // 최근 움직임 시각을 주기적으로 갱신한다 - /home/summary.last_motion_at.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .getHomeSummary()
        .then((summary) => {
          if (cancelled) return;
          if (summary.last_motion_at) setLastMotionAtMs(new Date(summary.last_motion_at).getTime());
        })
        .catch((err) => console.warn('최근 움직임 조회 실패:', err));
    };
    poll();
    const timer = setInterval(poll, SUMMARY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const applyDeviceType = (type: string, on: boolean) => {
    for (const { roomId, device } of findDevices(roomsRef.current, type)) {
      setDevicePower(roomId, device.name, on);
    }
  };

  const activateSleepMode = () => {
    const p = presetRef.current;
    if (!p) return;
    applyDeviceType('조명', p.light_on);
    applyDeviceType('에어컨', p.aircon_on);
    applyDeviceType('가습기', p.humidifier_on);
    if (p.tv_off) applyDeviceType('TV', false);
    if (p.pc_off) applyDeviceType('컴퓨터', false);

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
    pushNotification('✅ 취침 모드 활성화됨', '좋은 밤 되세요! 🌙 조명·에어컨·가습기가 설정한 대로 조정됐어요.');
  };

  const wakeUp = () => {
    applyDeviceType('조명', true);
    applyDeviceType('에어컨', false);
    applyDeviceType('가습기', false);

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
      const noMotionMs = now - lastMotionAtMsRef.current;

      switch (stateRef.current) {
        case 'idle':
          if (baseConditionsMet) {
            if (noMotionMs >= p.no_motion_minutes * 60000) enterConfirming();
            else setState('waiting');
          }
          break;
        case 'waiting':
          if (!baseConditionsMet) {
            setState('idle');
          } else if (noMotionMs >= p.no_motion_minutes * 60000) {
            enterConfirming();
          }
          break;
        case 'confirming': {
          const confirmStart = confirmStartedAtRef.current ?? now;
          // 확인 알림이 뜬 뒤에 새로 움직임이 감지되면 "깨어있다"는 뜻이므로 대기 상태로 복귀.
          if (lastMotionAtMsRef.current > confirmStart) {
            setState('idle');
            setConfirmStartedAt(null);
          } else if (now - confirmStart >= p.confirm_wait_minutes * 60000) {
            activateSleepMode();
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

  const confirm = () => {
    if (stateRef.current === 'confirming') activateSleepMode();
  };

  // "나중에" - 확인 대기 타이머는 그대로 흐르게 두고(응답 없으면 스펙대로 자동 활성화), 배너만 닫는
  // 용도로만 쓰인다. 상태 자체는 confirming을 유지한다.
  const dismiss = () => {};

  const setPreset = (patch: Partial<api.SleepPreset>) => {
    setPresetState((prev) => (prev ? { ...prev, ...patch } : prev));
    api.updateSleepPreset(patch).catch((err) => console.warn('취침 프리셋 저장 실패:', err));
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
