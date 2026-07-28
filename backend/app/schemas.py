from typing import Literal, Optional

from pydantic import BaseModel

DeviceType = Literal["env_sensor", "relay", "power_monitor", "presence_cam"]
CommandName = Literal["on", "off"]
AckStatus = Literal["done", "failed"]
Period = Literal["year", "month", "day"]


class DeviceRegister(BaseModel):
    device_id: str
    type: DeviceType
    label: Optional[str] = None


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
    command: CommandName


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


class HomeSummary(BaseModel):
    active_device_count: int
    humidity: Optional[float]
    temperature: Optional[float]
    presence: Optional[bool] = None


class SeriesPoint(BaseModel):
    x_label: str
    value: float


class EnergySeries(BaseModel):
    device_id: str
    label: str
    points: list[SeriesPoint]


class EnergyUsage(BaseModel):
    series: list[EnergySeries]
    year_over_year_pct: Optional[float]


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


class AppSettingsUpdate(BaseModel):
    household_size: Optional[HouseholdSize] = None
    goal_kwh: Optional[float] = None
    address: Optional[str] = None
    guidebook_font_size: Optional[FontSizeOption] = None


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
