"""FastAPI 入口：注册 API 路由 + 挂载前端静态文件。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, store
from .llm import LLMConfigError, LLMError, generate_lesson
from .templates_def import build_system_prompt, build_user_prompt

app = FastAPI(title="教材教案生成器", version="1.0.0")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ---------- 数据模型 ----------

class TextbookCreate(BaseModel):
    subject: str
    grade: str
    version: str = ""
    title: str
    chapters: list[dict] = Field(default_factory=list)


class LessonGenerate(BaseModel):
    textbook_id: str
    chapter_id: str | None = None
    lesson_title: str
    duration_minutes: int = 40
    student_level: str = ""
    extra_objectives: str = ""
    style: str = ""


class LessonUpdate(BaseModel):
    title: str | None = None
    content: str | None = None


# ---------- 教材 API ----------

@app.get("/api/textbooks")
def api_list_textbooks() -> list[dict]:
    return store.list_textbooks()


@app.post("/api/textbooks")
def api_add_textbook(payload: TextbookCreate) -> dict:
    data = payload.model_dump()
    return store.add_textbook(data)


@app.get("/api/textbooks/{textbook_id}")
def api_get_textbook(textbook_id: str) -> dict:
    tb = store.get_textbook(textbook_id)
    if not tb:
        raise HTTPException(status_code=404, detail="教材不存在")
    return tb


# ---------- 教案 API ----------

@app.get("/api/lessons")
def api_list_lessons() -> list[dict]:
    return store.list_lessons()


@app.get("/api/lessons/{lesson_id}")
def api_get_lesson(lesson_id: str) -> dict:
    ls = store.get_lesson(lesson_id)
    if not ls:
        raise HTTPException(status_code=404, detail="教案不存在")
    return ls


@app.put("/api/lessons/{lesson_id}")
def api_update_lesson(lesson_id: str, payload: LessonUpdate) -> dict:
    updated = store.update_lesson(lesson_id, payload.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="教案不存在")
    return updated


@app.delete("/api/lessons/{lesson_id}")
def api_delete_lesson(lesson_id: str) -> dict:
    ok = store.delete_lesson(lesson_id)
    if not ok:
        raise HTTPException(status_code=404, detail="教案不存在")
    return {"ok": True}


@app.post("/api/lessons/generate")
def api_generate_lesson(payload: LessonGenerate) -> Any:
    textbook = store.get_textbook(payload.textbook_id)
    if not textbook:
        raise HTTPException(status_code=404, detail="教材不存在")

    chapter = None
    if payload.chapter_id:
        chapter = next(
            (ch for ch in textbook.get("chapters", [])
             if ch.get("id") == payload.chapter_id),
            None,
        )

    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(
        params=payload.model_dump(),
        textbook=textbook,
        chapter=chapter,
        lesson_title=payload.lesson_title,
    )

    try:
        content = generate_lesson(system_prompt, user_prompt)
    except LLMConfigError as e:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(e), "code": "config_missing"},
        )
    except LLMError as e:
        return JSONResponse(
            status_code=502,
            content={"ok": False, "error": str(e), "code": "llm_error"},
        )

    title = f"{textbook.get('subject', '')}·{payload.lesson_title} 教案"
    record = store.save_lesson({
        "title": title,
        "textbook_id": payload.textbook_id,
        "textbook_title": textbook.get("title", ""),
        "chapter_title": chapter.get("title", "") if chapter else "",
        "lesson_title": payload.lesson_title,
        "content": content,
        "params": payload.model_dump(),
    })
    return {"ok": True, "lesson": record}


# ---------- 静态前端 ----------

@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR),
    name="static",
)
