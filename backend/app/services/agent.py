import json

from ..db import get_db
from ..roles import can_assign_others, can_see_all
from ..serialize import dump, oid
from .llm import chat_complete, _content_text

TOOLS = [
    {"type": "function", "function": {"name": "list_projects", "description": "List projects visible to the current user.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "list_users", "description": "Admin only. List team members.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "list_tasks", "description": "List open tasks.", "parameters": {"type": "object", "properties": {"projectId": {"type": "string"}}}}},
]


def system_prompt(user) -> str:
    role = "You are assisting a company ADMIN or MANAGER." if can_see_all(user) else "You are assisting a TEAM MEMBER. Only their own tasks."
    return (
        "You are ProjectFlow AI, a project management assistant. "
        f"{role} Use tools for real data. Keep answers concise. "
        f"Current user: {user.get('username')} ({user.get('role')}). "
        f"Company: {(user.get('company') or {}).get('name') or 'company'}."
    )


async def run_tool(user, name: str, args: dict) -> str:
    db = get_db()
    company = (user.get("company") or {}).get("_id") or user.get("company")
    if name == "list_projects":
        docs = await db.projects.find({"company": company}, {"title": 1, "description": 1}).sort("createdAt", -1).to_list(30)
        return json.dumps([{"id": str(p["_id"]), "title": p.get("title"), "description": p.get("description")} for p in docs])
    if name == "list_users":
        if not can_see_all(user):
            return json.dumps({"error": "Only admins can list team users."})
        docs = await db.users.find({"company": company}, {"username": 1, "email": 1, "role": 1}).to_list(100)
        return json.dumps([{"id": str(u["_id"]), "username": u.get("username"), "email": u.get("email"), "role": u.get("role")} for u in docs])
    if name == "list_tasks":
        filt = {"column": {"$ne": "done"}}
        if args.get("projectId"):
            filt["project"] = oid(args["projectId"])
        else:
            pids = await db.projects.distinct("_id", {"company": company})
            filt["project"] = {"$in": pids}
        if not can_see_all(user):
            filt["assignee"] = user["_id"]
        docs = await db.tasks.find(filt, {"title": 1, "column": 1, "priority": 1}).to_list(40)
        return json.dumps(dump(docs))
    return json.dumps({"error": "Unknown tool"})


async def run_project_agent(user, message: str, history: list) -> dict:
    messages = [{"role": "system", "content": system_prompt(user)}]
    for item in (history or [])[-12]:
        if item.get("content") and item.get("role") in ("user", "assistant"):
            messages.append({"role": item["role"], "content": item["content"]})
    messages.append({"role": "user", "content": message})
    used = []
    for _ in range(6):
        choice = await chat_complete((user.get("company") or {}).get("_id"), messages, TOOLS)
        tool_calls = choice.get("tool_calls") or []
        if tool_calls:
            messages.append(choice)
            for call in tool_calls:
                fn = (call.get("function") or {})
                name = fn.get("name") or ""
                used.append(name)
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                result = await run_tool(user, name, args)
                messages.append({"role": "tool", "tool_call_id": call.get("id"), "content": result})
            continue
        return {"reply": _content_text(choice.get("content")) or "Done.", "toolsUsed": list(dict.fromkeys(used))}
    return {"reply": "I need a bit more detail to finish that.", "toolsUsed": list(dict.fromkeys(used))}
