from ..duration import format_duration, format_ist
from ..serialize import oid


async def create_notification(db, item: dict):
    if not item.get("user") or not item.get("company"):
        return None
    from datetime import datetime, timezone
    item = {
        "read": False,
        "readAt": None,
        "createdAt": datetime.now(timezone.utc),
        "body": "",
        "link": "",
        "actor": None,
        "meta": {},
        **item,
    }
    await db.notifications.insert_one(item)
    return item


async def create_many(db, items: list[dict]):
    if not items:
        return []
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    for item in items:
        item.setdefault("read", False)
        item.setdefault("createdAt", now)
    try:
        await db.notifications.insert_many(items, ordered=False)
    except Exception:
        pass
    return items


async def notify_task_assigned(db, *, company_id, assignee, task, project, assigned_by):
    assignee_id = assignee.get("_id") if isinstance(assignee, dict) else assignee
    actor_id = assigned_by.get("_id") if isinstance(assigned_by, dict) else assigned_by
    if not assignee_id or (actor_id and str(assignee_id) == str(actor_id)):
        return None
    parts = []
    duration = (task or {}).get("duration") or {}
    if duration.get("value"):
        parts.append(f"Complete within {format_duration(duration)}")
    if task.get("deadlineAt"):
        parts.append(f"Deadline: {format_ist(task.get('deadlineAt'))}")
    elif task.get("dueDate"):
        parts.append(f"Due: {format_ist(task.get('dueDate'))}")
    parts.append(f"Priority: {task.get('priority')}")
    return await create_notification(db, {
        "user": oid(assignee_id),
        "company": oid(company_id),
        "type": "task_assigned",
        "title": f"New task: {task.get('title')}",
        "body": f"{assigned_by.get('username') if isinstance(assigned_by, dict) else 'Someone'} assigned you a task in {(project or {}).get('title') or 'a project'}. {' · '.join(parts)}",
        "link": f"/kanban/{project.get('_id')}" if project and project.get("_id") else "",
        "actor": oid(actor_id),
        "meta": {"taskId": str(task.get("_id")), "projectId": str((project or {}).get("_id") or "")},
    })


async def notify_new_message(db, *, company_id, recipients, sender, conversation, preview):
    sender_id = str(sender.get("_id"))
    items = []
    for recipient in recipients:
        if str(recipient) == sender_id:
            continue
        items.append({
            "user": oid(recipient),
            "company": oid(company_id),
            "type": "message",
            "title": f"{sender.get('username')} in #{conversation.get('name') or 'company'}" if conversation.get("type") == "company" else f"Message from {sender.get('username')}",
            "body": preview,
            "link": f"/messages/{conversation.get('_id')}",
            "actor": oid(sender.get("_id")),
            "meta": {"conversationId": str(conversation.get("_id"))},
        })
    return await create_many(db, items)


async def notify_leave_requested(db, *, company_id, request, requester, reviewer_ids):
    items = [{
        "user": oid(rid),
        "company": oid(company_id),
        "type": "leave",
        "title": f"Leave request from {requester.get('username') or 'a teammate'}",
        "body": f"{request.get('startDate')} → {request.get('endDate')}" + (f" · {request.get('reason')}" if request.get("reason") else ""),
        "link": "/leaves",
        "actor": oid(requester.get("_id")),
    } for rid in reviewer_ids if rid]
    return await create_many(db, items)


async def notify_leave_decision(db, *, company_id, request, member_id, approved, reviewer):
    return await create_notification(db, {
        "user": oid(member_id),
        "company": oid(company_id),
        "type": "leave",
        "title": "Leave approved" if approved else "Leave rejected",
        "body": f"{request.get('startDate')} → {request.get('endDate')}",
        "link": "/leaves",
        "actor": oid(reviewer.get("_id")),
    })


async def notify_meeting_invite(db, *, company_id, meeting, host, invitee_ids):
    host_id = str(host.get("_id") or host.get("id") or "")
    items = []
    for invitee in invitee_ids or []:
        if str(invitee) == host_id:
            continue
        items.append({
            "user": oid(invitee),
            "company": oid(company_id),
            "type": "meeting",
            "title": f"Meeting: {meeting.get('title') or 'Team meeting'}",
            "body": f"{host.get('username') or 'Someone'} invited you to a live meeting",
            "link": "/meet",
            "actor": oid(host.get("_id")),
        })
    return await create_many(db, items)
