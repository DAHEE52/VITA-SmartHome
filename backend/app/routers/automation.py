from app.schemas import AutomationRuleCreate, AutomationRuleOut, AutomationRuleUpdate
from app.supabase_client import get_supabase
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/automation-rules", tags=["automation"])


@router.get("", response_model=list[AutomationRuleOut])
def list_rules():
    supabase = get_supabase()
    res = supabase.table("automation_rules").select("*").order("id").execute()
    return res.data


@router.post("", response_model=AutomationRuleOut, status_code=201)
def create_rule(body: AutomationRuleCreate):
    supabase = get_supabase()
    res = supabase.table("automation_rules").insert(body.model_dump()).execute()
    return res.data[0]


@router.patch("/{rule_id}", response_model=AutomationRuleOut)
def update_rule(rule_id: int, body: AutomationRuleUpdate):
    supabase = get_supabase()
    existing = supabase.table("automation_rules").select("id").eq("id", rule_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="automation rule not found")

    update = body.model_dump(exclude_unset=True)
    if update:
        res = supabase.table("automation_rules").update(update).eq("id", rule_id).execute()
        row = res.data[0]
    else:
        row = supabase.table("automation_rules").select("*").eq("id", rule_id).execute().data[0]
    return row


@router.delete("/{rule_id}")
def delete_rule(rule_id: int):
    supabase = get_supabase()
    supabase.table("automation_rules").delete().eq("id", rule_id).execute()
    return {"ok": True}
