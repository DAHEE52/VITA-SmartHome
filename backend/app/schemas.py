from typing import Literal, Optional

from pydantic import BaseModel, field_validator

DeviceType = Literal["env_sensor", "relay", "power_monitor", "presence_cam"]
CommandName = Literal["on", "off"]
AckStatus = Literal["done", "failed"]
Period = Literal["year", "month", "day"]


class DeviceRegister(BaseModel):
    device_id: str
    type: DeviceType
    label: Optional[str] = None
    # 릴레이가 달린 기기(relay, 또는 릴레이+전력측정을 겸하는 스마트 콘센트형 power_monitor)가
    # 부팅 직후 보내는 실제 물리 상태. ESP32는 재부팅/정전 복구 시 릴레이가 항상 꺼진 채로
    # 시작하는데, 이 값이 없으면 DB의 state가 정전 전 값(예: "on")에 그대로 머물러 앱에
    # 실제와 다른 상태가 표시된다. 릴레이가 없는 순수 센서 기기는 보내지 않아도 된다.
    state: Optional[CommandName] = None


class Reading(BaseModel):
    metric: str
    value: float


class ReadingsIn(BaseModel):
    readings: list[Reading]


class PendingCommand(BaseModel):
    id: int
    command: str


class CommandAck(BaseModel):
    status: AckStatus


class ControlRequest(BaseModel):
    # "on"/"off" 외에, 밝기 조절이 되는 조명(예: living-light-01)은 "0"~"100" 숫자 문자열도
    # 허용한다 - device_commands.command는 원래 자유 텍스트라 스키마 변경 없이 그대로 재사용.
    command: str

    @field_validator("command")
    @classmethod
    def validate_command(cls, v: str) -> str:
        if v in ("on", "off"):
            return v
        if v.isdigit() and 0 <= int(v) <= 100:
            return v
        raise ValueError('command must be "on", "off", or a brightness string "0"-"100"')


class DeviceStatus(BaseModel):
    id: str
    label: Optional[str]
    type: DeviceType
    state: str


class RoomStatus(BaseModel):
    room: str
    active: bool
    devices: list[DeviceStatus]


class RoomCreate(BaseModel):
    name: str


class RoomUpdate(BaseModel):
    name: str


class RoomCreated(BaseModel):
    id: int
    name: str


class RoomWithDevices(BaseModel):
    id: int
    name: str
    devices: list[DeviceStatus]


class DeviceOut(BaseModel):
    id: str
    label: Optional[str]
    type: DeviceType
    state: str
    room_id: Optional[int] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    room_id: Optional[int] = None


class MockDeviceRegister(BaseModel):
    name: Optional[str] = None


class WeatherOut(BaseModel):
    # 기상청 데이터가 없으면(키 미설정/조회 실패) null - 프론트는 온습도처럼 "-"로 표시한다.
    condition: Optional[str] = None


class HomeSummary(BaseModel):
    active_device_count: int
    humidity: Optional[float]
    temperature: Optional[float]
    presence: Optional[bool] = None
    last_motion_at: Optional[str] = None


class SeriesPoint(BaseModel):
    x_label: str
    value: float
    # 정렬/병합 전용 원본 버킷 키(예: "2026", "2026-07-30", "2026-07-30 21") - x_label은 표시용으로
    # 정보가 손실돼 있어(연도 없는 "MM/DD", 날짜 없는 "HH시") 여러 기기의 시리즈를 하나로 합칠 때
    # x_label만으로는 시간 순서를 복원할 수 없다. 문자열 그대로 정렬하면 항상 시간순이 된다.
    sort_key: str


class EnergySeries(BaseModel):
    device_id: str
    label: str
    points: list[SeriesPoint]


class EnergyUsage(BaseModel):
    series: list[EnergySeries]


SpecialKind = Literal["general", "outing", "overnight"]


class ScheduleDate(BaseModel):
    year: int
    month: int
    day: int


class ScheduleItemOut(BaseModel):
    id: int
    time: str
    label: str
    kind: Optional[SpecialKind] = None
    date: Optional[ScheduleDate] = None
    weekdays: Optional[list[int]] = None


class DailyItemCreate(BaseModel):
    time: str
    label: str
    weekdays: Optional[list[int]] = None


class SpecialItemCreate(BaseModel):
    time: str
    label: str
    kind: SpecialKind = "general"
    date: ScheduleDate


class ScheduleItemUpdate(BaseModel):
    time: Optional[str] = None
    label: Optional[str] = None
    kind: Optional[SpecialKind] = None
    date: Optional[ScheduleDate] = None
    weekdays: Optional[list[int]] = None


class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    read: bool
    created_at: str


class NotificationCreate(BaseModel):
    title: str
    message: str


HouseholdSize = Literal[1, 2, 3, 4, 5]
FontSizeOption = Literal["small", "medium", "large"]


class AppSettingsOut(BaseModel):
    household_size: Optional[HouseholdSize] = None
    goal_kwh: Optional[float] = None
    address: str
    guidebook_font_size: FontSizeOption
    # 화재 위험 감지(고위험 기기/센서 급상승) 시 긴급 SMS를 받을 번호. 비어있으면 SMS를 안 보낸다.
    emergency_phone: str = ""


class AppSettingsUpdate(BaseModel):
    household_size: Optional[HouseholdSize] = None
    goal_kwh: Optional[float] = None
    address: Optional[str] = None
    guidebook_font_size: Optional[FontSizeOption] = None
    emergency_phone: Optional[str] = None


class AutomationRuleCreate(BaseModel):
    trigger: dict
    offset_minutes: int = 0
    room_id: int
    action: dict
    enabled: bool = True


class AutomationRuleUpdate(BaseModel):
    trigger: Optional[dict] = None
    offset_minutes: Optional[int] = None
    room_id: Optional[int] = None
    action: Optional[dict] = None
    enabled: Optional[bool] = None


class AutomationRuleOut(BaseModel):
    id: int
    trigger: dict
    offset_minutes: int
    room_id: int
    action: dict
    enabled: bool


class SleepDeviceConfig(BaseModel):
    device_id: str
    on: bool


class SleepPresetOut(BaseModel):
    devices: list[SleepDeviceConfig]
    bedtime_hour: int
    no_motion_seconds: int
    confirm_wait_minutes: int


class SleepPresetUpdate(BaseModel):
    devices: Optional[list[SleepDeviceConfig]] = None
    bedtime_hour: Optional[int] = None
    no_motion_seconds: Optional[int] = None
    confirm_wait_minutes: Optional[int] = None


class ClassifyIn(BaseModel):
    model: Literal["life_pattern"]
    label: str
    confidence: Optional[float] = None


AnomalyLevel = Literal["normal", "caution", "warning", "danger"]
AnomalyAction = Literal["none", "notify", "confirm_request", "auto_off_and_alert"]


class AnomalyConditionOut(BaseModel):
    name: str
    triggered: bool
    weight: int
    detail: str


class AnomalyStatusOut(BaseModel):
    device_id: str
    score: int
    level: AnomalyLevel
    action: AnomalyAction
    is_learning: bool
    conditions: list[AnomalyConditionOut]


class AnomalyEventOut(BaseModel):
    id: int
    device_id: str
    room_id: Optional[int] = None
    score: int
    level: AnomalyLevel
    action: AnomalyAction
    reasons: list[str]
    created_at: str
