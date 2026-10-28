ROLES = ["admin", "manager", "team_lead", "member"]


def is_admin(user) -> bool:
    return (user or {}).get("role") == "admin"


def is_manager(user) -> bool:
    return (user or {}).get("role") == "manager"


def is_team_lead(user) -> bool:
    return (user or {}).get("role") == "team_lead"


def can_see_all(user) -> bool:
    return is_admin(user) or is_manager(user)


def can_assign_others(user) -> bool:
    return is_admin(user) or is_manager(user) or is_team_lead(user)


def can_view_team_analytics(user) -> bool:
    return can_see_all(user) or is_team_lead(user)


def can_manage_users(user) -> bool:
    return can_assign_others(user)


def creatable_roles(actor) -> list[str]:
    if is_admin(actor) or is_manager(actor):
        return list(ROLES)
    if is_team_lead(actor):
        return ["member"]
    return []


async def team_member_ids(db, team_lead_id, company_id) -> list:
    cursor = db.users.find({"company": company_id, "teamLead": team_lead_id}, {"_id": 1})
    return [row["_id"] async for row in cursor]


async def scope_user_ids(db, user):
    if can_see_all(user):
        return None
    if is_team_lead(user):
        company_id = user.get("company", {}).get("_id") or user.get("company")
        members = await team_member_ids(db, user["_id"], company_id)
        return [user["_id"], *members]
    return [user["_id"]]


def task_filter_for_user(user, mine_only=False) -> dict:
    if str(mine_only) in ("true", "1", "True"):
        return {"assignee": user["_id"]}
    scope = user.get("scopeUserIds")
    if can_see_all(user) and not (str(mine_only) in ("true", "1", "True")):
        return {}
    if scope is None and can_see_all(user):
        return {}
    ids = scope if isinstance(scope, list) else [user["_id"]]
    if len(ids) == 1:
        return {"assignee": ids[0]}
    return {"assignee": {"$in": ids}}


def in_scope(user, assignee) -> bool:
    if can_see_all(user) and str(user.get("mineOnly") or "") not in ("true", "1"):
        scope = user.get("scopeUserIds")
        if scope is None:
            return True
    scope = user.get("scopeUserIds")
    if can_see_all(user) and scope is None:
        return True
    if not assignee:
        return False
    target = str(assignee.get("_id") if isinstance(assignee, dict) else assignee)
    ids = scope if isinstance(scope, list) else [user["_id"]]
    return any(str(item) == target for item in ids)
