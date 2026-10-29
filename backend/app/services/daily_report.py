from datetime import datetime, timezone
from html import escape

from ..db import get_db
from ..duration import IST, current_time_in_zone, format_ist, today_in_zone
from ..roles import can_see_all, is_team_lead, team_member_ids
from ..serialize import oid
from ..services.email import send_mail
from ..services.notify import create_many


def _hours(start, end, breaks=None):
    if not start:
        return None
    stop = end or datetime.now(timezone.utc)
    if getattr(stop, "tzinfo", None) is None:
        stop = stop.replace(tzinfo=timezone.utc)
    start_dt = start if getattr(start, "tzinfo", None) else start.replace(tzinfo=timezone.utc)
    ms = (stop - start_dt).total_seconds() * 1000
    for item in breaks or []:
        if not item.get("startAt"):
            continue
        b_end = item.get("endAt") or stop
        ms -= max(0, (b_end - item["startAt"]).total_seconds() * 1000)
    if ms <= 0:
        return 0
    return round(ms / 3600000, 2)


def _due(settings) -> bool:
    report = (settings or {}).get("report") or {}
    if report.get("enabled") is False:
        return False
    tz_name = ((settings or {}).get("digest") or {}).get("timezone") or IST
    today = today_in_zone(tz_name)
    if str(report.get("lastSentDate") or "") == today:
        return False
    want = str(report.get("time") or "19:30")[:5]
    now = current_time_in_zone(tz_name)
    return now >= want


async def _people_for_leader(db, company, leader):
    if can_see_all(leader):
        return await db.users.find(
            {"company": company},
            {"username": 1, "email": 1, "role": 1, "teamLead": 1},
        ).sort("username", 1).to_list(500)
    if is_team_lead(leader):
        members = await team_member_ids(db, leader["_id"], company)
        ids = list({*members})
        if not ids:
            return []
        return await db.users.find(
            {"company": company, "_id": {"$in": ids}},
            {"username": 1, "email": 1, "role": 1, "teamLead": 1},
        ).sort("username", 1).to_list(500)
    return []


async def build_rows(db, company, people, day):
    ids = [p["_id"] for p in people]
    if not ids:
        return []
    attendances = await db.attendances.find({"company": company, "date": day, "user": {"$in": ids}}).to_list(500)
    by_att = {str(row.get("user")): row for row in attendances}
    updates = await db.taskupdates.find({
        "company": company,
        "author": {"$in": ids},
        "updateDate": day,
    }).sort("createdAt", 1).to_list(2000)
    task_ids = list({u.get("task") for u in updates if u.get("task")})
    tasks = {}
    if task_ids:
        for task in await db.tasks.find({"_id": {"$in": task_ids}}, {"title": 1, "project": 1}).to_list(500):
            tasks[str(task["_id"])] = task
    project_ids = list({t.get("project") for t in tasks.values() if t.get("project")})
    projects = {}
    if project_ids:
        for project in await db.projects.find({"_id": {"$in": project_ids}}, {"title": 1}).to_list(200):
            projects[str(project["_id"])] = project
    by_updates = {}
    for item in updates:
        task = tasks.get(str(item.get("task"))) or {}
        project = projects.get(str(task.get("project"))) or {}
        by_updates.setdefault(str(item.get("author")), []).append({
            "content": item.get("content") or "",
            "progressPercent": item.get("progressPercent") or 0,
            "blockers": item.get("blockers") or "",
            "nextPlan": item.get("nextPlan") or "",
            "task": task.get("title") or "Task",
            "project": project.get("title") or "",
        })
    rows = []
    for person in people:
        att = by_att.get(str(person["_id"])) or {}
        confirmed = bool(att.get("endAt") or att.get("status") == "completed")
        rows.append({
            "username": person.get("username") or "Someone",
            "role": person.get("role") or "member",
            "confirmed": confirmed,
            "hours": _hours(att.get("startAt"), att.get("endAt"), att.get("breaks")),
            "endAt": att.get("endAt"),
            "updates": by_updates.get(str(person["_id"])) or [],
        })
    return rows


def render_report(day, rows, leader_name, tz_name=IST):
    confirmed = [r for r in rows if r["confirmed"]]
    pending = [r for r in rows if not r["confirmed"]]
    lines = [
        f"Daily report for {day}",
        f"For: {leader_name}",
        f"EOD confirmed: {len(confirmed)}  ·  Not confirmed: {len(pending)}",
        "",
    ]
    html_parts = [
        f"<h2 style='margin:0 0 8px'>Daily report · {escape(day)}</h2>",
        f"<p style='color:#475569;font-size:14px'>EOD confirmed: <strong>{len(confirmed)}</strong> · Not confirmed: <strong>{len(pending)}</strong></p>",
    ]
    if not rows:
        lines.append("No team members in this report.")
        html_parts.append("<p>No team members in this report.</p>")
    for row in rows:
        hours = f"{row['hours']}h" if row["hours"] is not None else "—"
        eod = f"EOD {format_ist(row['endAt'], tz_name)}" if row["confirmed"] and row.get("endAt") else ("EOD confirmed" if row["confirmed"] else "EOD not completed")
        lines.append(f"{row['username']} ({row['role']}) — {eod} — {hours}")
        html_parts.append(
            "<div style='border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:12px 0'>"
            f"<p style='margin:0 0 6px'><strong>{escape(row['username'])}</strong> · {escape(row['role'])}</p>"
            f"<p style='margin:0 0 8px;font-size:13px;color:{'#166534' if row['confirmed'] else '#b45309'}'>{escape(eod)} · {escape(hours)}</p>"
        )
        if not row["updates"]:
            lines.append("  No daily update submitted.")
            html_parts.append("<p style='margin:0;font-size:13px;color:#64748b'>No daily update submitted.</p>")
        for item in row["updates"]:
            lines.append(f"  • {item['project'] + ' / ' if item['project'] else ''}{item['task']} ({item['progressPercent']}%)")
            lines.append(f"    {item['content']}")
            if item["blockers"]:
                lines.append(f"    Blocker: {item['blockers']}")
            html_parts.append(
                "<div style='background:#f8fafc;border-radius:8px;padding:10px;margin-top:8px'>"
                f"<p style='margin:0 0 4px;font-size:12px;color:#64748b'>{escape(item['project'] + ' / ' if item['project'] else '')}{escape(item['task'])} · {int(item['progressPercent'])}%</p>"
                f"<p style='margin:0;font-size:14px;white-space:pre-wrap'>{escape(item['content'])}</p>"
                + (f"<p style='margin:6px 0 0;font-size:12px;color:#b45309'><strong>Blocker:</strong> {escape(item['blockers'])}</p>" if item["blockers"] else "")
                + "</div>"
            )
        lines.append("")
        html_parts.append("</div>")
    html = (
        "<div style='font-family:Arial,sans-serif;color:#0f172a;max-width:640px'>"
        + "".join(html_parts)
        + "<p style='font-size:12px;color:#94a3b8'>Sent after people confirm EOD. Default send time 7:30 PM IST.</p>"
        "</div>"
    )
    return "\n".join(lines).strip(), html


async def send_for_company(db, company, settings, *, force=False):
    if not force and not _due(settings):
        return {"sent": 0, "skipped": True}
    tz_name = ((settings or {}).get("digest") or {}).get("timezone") or IST
    day = today_in_zone(tz_name)
    leaders = await db.users.find(
        {"company": company, "role": {"$in": ["admin", "manager", "team_lead"]}},
        {"username": 1, "email": 1, "role": 1},
    ).to_list(200)
    sent = 0
    notes = []
    for leader in leaders:
        people = await _people_for_leader(db, company, leader)
        rows = await build_rows(db, company, people, day)
        subject = f"Daily report {day}"
        text, html = render_report(day, rows, leader.get("username") or "Leader", tz_name)
        emailed = False
        if leader.get("email"):
            emailed = await send_mail(company, to=leader["email"], subject=subject, text=text, html=html)
            if emailed:
                sent += 1
        notes.append({
            "leader": leader.get("username"),
            "role": leader.get("role"),
            "people": len(people),
            "emailed": emailed,
        })
        try:
            await create_many(db, [{
                "user": leader["_id"],
                "company": company,
                "type": "daily_report",
                "title": subject,
                "body": f"{sum(1 for r in rows if r['confirmed'])} EOD confirmed for {day}",
                "link": "/attendance",
            }])
        except Exception:
            pass
    await db.companysettings.update_one(
        {"company": company},
        {"$set": {
            "report.lastSentAt": datetime.now(timezone.utc),
            "report.lastSentDate": day,
        }},
        upsert=True,
    )
    return {"sent": sent, "day": day, "leaders": notes}


async def run_daily_reports(*, force=False, company=None):
    db = get_db()
    filt = {"company": oid(company)} if company else {}
    settings_rows = await db.companysettings.find(filt).to_list(200)
    companies = {str(row.get("company")): row for row in settings_rows if row.get("company")}
    if company and str(company) not in companies:
        companies[str(company)] = {"company": oid(company), "report": {"enabled": True, "time": "19:30"}}
    if not company:
        extra = await db.users.distinct("company")
        for item in extra:
            key = str(item)
            if key not in companies:
                companies[key] = {"company": item, "report": {"enabled": True, "time": "19:30"}}
    results = []
    for row in companies.values():
        try:
            results.append(await send_for_company(db, row["company"], row, force=force))
        except Exception as exc:
            results.append({"error": str(exc), "company": str(row.get("company"))})
    return results
