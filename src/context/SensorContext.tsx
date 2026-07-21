// 방마다 온도/습도 센서 값을 시뮬레이션하는 Context.
// 실제 하드웨어 센서가 아직 없어서 지금은 더미 값을 주기적으로 생성해 채우지만, FireSafetyContext(화재
// 판정)와 FirePreventionScreen(화면 표시)은 이 Context가 내놓는 RoomSensorReading 모양만 보고 동작하므로,
// 나중에 실제 센서를 연동할 때는 아래 "더미 데이터 생성부"만 실제 센서 값을 읽어오는 코드로 바꾸면 되고
// 나머지 로직은 손댈 필요가 없다.
//
// 주의: DemoRoomsContext(시뮬레이션 방 목록)를 참조한다 — 실제 백엔드 BME280 센서 데이터
// (MainScreen의 getHomeSummary())와는 별개다.
import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { useDemoRooms } from './DemoRoomsContext';
import { RoomSensorReading, SENSOR_DANGER_TEMP_C } from '../utils/fireRisk';

const UPDATE_INTERVAL_MS = 4000; // 4초마다 값을 갱신한다 - 나중에 실제 센서를 붙일 때도 비슷한 주기로 폴링/구독하면 됨.

type SensorContextValue = {
  readings: Record<string, RoomSensorReading>; // roomId -> 최신 센서 값
  isSimulatingFire: (roomId: string) => boolean;
  // 카메라/센서가 실제로 붙기 전까지, "이렇게 감지됐다고 치고" 위험 범위 더미 값을 강제로 내보내
  // 화재 감지 → 자동 차단 → 긴급 배너로 이어지는 전체 흐름을 확인해볼 수 있게 하는 테스트용 스위치.
  simulateFire: (roomId: string) => void;
  clearSimulation: (roomId: string) => void;
};

const SensorContext = createContext<SensorContextValue | null>(null);

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// 이전 값 주변에서 살짝만 흔들어, 매번 완전히 새로운 값이 아니라 "실시간으로 변하는 센서 값"처럼 보이게 한다.
function jitter(prev: number, delta: number, min: number, max: number): number {
  return clamp(prev + (Math.random() * 2 - 1) * delta, min, max);
}

// ── 더미 데이터 생성부 ──────────────────────────────────────────────────────
// 실제 센서를 연동할 때는 이 두 함수 호출부를 하드웨어/센서 API에서 읽은 실제 값으로 바꾸면 된다.
function generateNormalReading(prev?: RoomSensorReading): RoomSensorReading {
  const temperatureC = prev ? jitter(prev.temperatureC, 0.3, 18, 28) : 20 + Math.random() * 5;
  const humidityPct = prev ? jitter(prev.humidityPct, 1.5, 30, 60) : 35 + Math.random() * 15;
  return {
    temperatureC: Math.round(temperatureC * 10) / 10,
    humidityPct: Math.round(humidityPct),
    updatedAt: Date.now(),
  };
}

// "화재 상황 시뮬레이션"이 켜진 방에 쓰는 위험 범위 더미 값 - 온도는 서서히 오르고 습도는 떨어지게.
function generateDangerReading(prev?: RoomSensorReading): RoomSensorReading {
  const wasAlreadyDanger = !!prev && prev.temperatureC >= SENSOR_DANGER_TEMP_C;
  const temperatureC = jitter(wasAlreadyDanger ? prev!.temperatureC : 40, 3, 45, 80);
  const humidityPct = jitter(wasAlreadyDanger ? prev!.humidityPct : 28, 2, 8, 25);
  return {
    temperatureC: Math.round(temperatureC * 10) / 10,
    humidityPct: Math.round(humidityPct),
    updatedAt: Date.now(),
  };
}
// ────────────────────────────────────────────────────────────────────────

export function SensorProvider({ children }: { children: ReactNode }) {
  const { rooms } = useDemoRooms();
  const [readings, setReadings] = useState<Record<string, RoomSensorReading>>({});
  const [simulatedRoomIds, setSimulatedRoomIds] = useState<Set<string>>(new Set());

  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const simulatedRef = useRef(simulatedRoomIds);
  simulatedRef.current = simulatedRoomIds;

  // 방이 추가/삭제될 때마다 readings의 키를 맞춘다 - 새 방은 정상 범위 더미 값으로 시작.
  const roomIdsKey = rooms.map((r) => r.id).join(',');
  useEffect(() => {
    const currentIds = roomIdsKey ? roomIdsKey.split(',') : [];
    setReadings((prev) => {
      if (currentIds.length === Object.keys(prev).length && currentIds.every((id) => id in prev)) {
        return prev; // 방 목록이 실제로는 안 바뀐 갱신(기기 on/off 등)이면 그대로 둔다.
      }
      const next: Record<string, RoomSensorReading> = {};
      for (const id of currentIds) {
        next[id] = prev[id] ?? generateNormalReading();
      }
      return next;
    });
  }, [roomIdsKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      setReadings((prev) => {
        const next: Record<string, RoomSensorReading> = { ...prev };
        for (const room of roomsRef.current) {
          const isSimulating = simulatedRef.current.has(room.id);
          next[room.id] = isSimulating
            ? generateDangerReading(prev[room.id])
            : generateNormalReading(prev[room.id]);
        }
        return next;
      });
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  const isSimulatingFire = (roomId: string) => simulatedRoomIds.has(roomId);

  const simulateFire = (roomId: string) => {
    setSimulatedRoomIds((prev) => new Set(prev).add(roomId));
  };

  const clearSimulation = (roomId: string) => {
    setSimulatedRoomIds((prev) => {
      const next = new Set(prev);
      next.delete(roomId);
      return next;
    });
  };

  return (
    <SensorContext.Provider value={{ readings, isSimulatingFire, simulateFire, clearSimulation }}>
      {children}
    </SensorContext.Provider>
  );
}

export function useSensors() {
  const ctx = useContext(SensorContext);
  if (!ctx) throw new Error('useSensors must be used within a SensorProvider');
  return ctx;
}
