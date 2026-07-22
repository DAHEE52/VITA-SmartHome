from app.schemas import DailyItemCreate, ScheduleDate, ScheduleItemOut, SpecialItemCreate
from app.supabase_client import get_supabase
from fastapi import APIRouter

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _row_to_item(row: dict) -> ScheduleItemOut:
    date = None
    if row.get("item_year") is not None:
        date = ScheduleDate(year=row["item_year"], month=row["item_month"], day=row["item_day"])
    return ScheduleItemOut(
        id=row["id"],
        time=row["time"],
        label=row["label"],
        kind=row.get("special_kind"),
        date=date,
        weekdays=row.get("weekdays"),
    )


@router.get("/daily", response_model=list[ScheduleItemOut])
def get_daily():
    supabase = get_supabase()
    res = supabase.table("schedule_items").select("*").eq("list_kind", "daily").order("id").execute()
    return [_row_to_item(row) for row in res.data]


@router.post("/daily", response_model=ScheduleItemOut)
def create_daily(body: DailyItemCreate):
    supabase = get_supabase()
    res = (
        supabase.table("schedule_items")
        .insert({"list_kind": "daily", "time": body.time, "label": body.label, "weekdays": body.weekdays})
        .execute()
    )
    return _row_to_item(res.data[0])


@router.get("/special", response_model=list[ScheduleItemOut])
def get_special():
    supabase = get_supabase()
    res = supabase.table("schedule_items").select("*").eq("list_kind", "special").order("id").execute()
    return [_row_to_item(row) for row in res.data]


@router.post("/special", response_model=ScheduleItemOut)
def create_special(body: SpecialItemCreate):
    supabase = get_supabase()
    res = (
        supabase.table("schedule_items")
        .insert(
            {
                "list_kind": "special",
                "time": body.time,
                "label": body.label,
                "special_kind": body.kind,
                "item_year": body.date.year,
                "item_month": body.date.month,
                "item_day": body.date.day,
            }
        )
        .execute()
    )
    return _row_to_item(res.data[0])


@router.delete("/{item_id}")
def delete_item(item_id: int):
    supabase = get_supabase()
    supabase.table("schedule_items").delete().eq("id", item_id).execute()
    return {"ok": True}
