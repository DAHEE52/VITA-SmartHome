from typing import Literal, Optional

from pydantic import BaseModel

DeviceType = Literal["env_sensor", "relay", "power_monitor"]
CommandName = Literal["on", "off"]
AckStatus = Literal["done", "failed"]
Period = Literal["year", "month", "day"]


class DeviceRegister(BaseModel):
    device_id: str
    type: DeviceType
    room: str
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


class HomeSummary(BaseModel):
    active_device_count: int
    humidity: Optional[float]
    temperature: Optional[float]


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
