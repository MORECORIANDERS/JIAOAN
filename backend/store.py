"""基于 JSON 文件的轻量持久化层。

- 预置教材：backend/data/textbooks.json（只读基线）
- 自定义教材：backend/saved/textbooks.json（运行时读写）
- 生成的教案：backend/saved/lessons.json（运行时读写）
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from . import config

_TEXTBOOKS_FILE = config.SAVED_DIR / "textbooks.json"
_LESSONS_FILE = config.SAVED_DIR / "lessons.json"


# ---------- 通用读写 ----------

def _read_json(path: Path) -> Any:
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def _write_json(path: Path, data: Any) -> None:
    config.SAVED_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------- 教材 ----------

def _load_preset_textbooks() -> list[dict]:
    preset_path = config.DATA_DIR / "textbooks.json"
    return _read_json(preset_path)


def list_textbooks() -> list[dict]:
    """返回预置 + 自定义教材列表（不含章节详情以减小体积）。"""
    preset = _load_preset_textbooks()
    custom = _read_json(_TEXTBOOKS_FILE)
    summary = []
    for tb in preset + custom:
        summary.append({
            "id": tb.get("id"),
            "subject": tb.get("subject", ""),
            "grade": tb.get("grade", ""),
            "version": tb.get("version", ""),
            "title": tb.get("title", ""),
            "custom": tb in custom,
        })
    return summary


def get_textbook(textbook_id: str) -> dict | None:
    """按 id 查找教材（含章节详情）。"""
    for tb in _load_preset_textbooks() + _read_json(_TEXTBOOKS_FILE):
        if tb.get("id") == textbook_id:
            return tb
    return None


def add_textbook(data: dict) -> dict:
    """新增自定义教材。data 需包含 subject/grade/version/title/chapters。"""
    textbooks = _read_json(_TEXTBOOKS_FILE)
    # 若未提供 id，则生成一个
    tb_id = data.get("id") or f"custom_{uuid.uuid4().hex[:8]}"
    if any(t.get("id") == tb_id for t in textbooks) or \
       any(t.get("id") == tb_id for t in _load_preset_textbooks()):
        tb_id = f"{tb_id}_{uuid.uuid4().hex[:4]}"
    data["id"] = tb_id
    # 规整 chapters 结构
    chapters = []
    for idx, ch in enumerate(data.get("chapters", []), start=1):
        chapters.append({
            "id": ch.get("id") or f"ch{idx}",
            "title": ch.get("title", ""),
            "lessons": ch.get("lessons", []),
        })
    data["chapters"] = chapters
    textbooks.append(data)
    _write_json(_TEXTBOOKS_FILE, textbooks)
    return data


# ---------- 教案 ----------

def list_lessons() -> list[dict]:
    """返回所有已存档教案（不含正文，仅元信息）。"""
    lessons = _read_json(_LESSONS_FILE)
    summary = []
    for ls in lessons:
        summary.append({
            "id": ls.get("id"),
            "title": ls.get("title", ""),
            "textbook_title": ls.get("textbook_title", ""),
            "lesson_title": ls.get("lesson_title", ""),
            "created_at": ls.get("created_at"),
            "updated_at": ls.get("updated_at"),
        })
    # 按更新时间倒序
    summary.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
    return summary


def get_lesson(lesson_id: str) -> dict | None:
    for ls in _read_json(_LESSONS_FILE):
        if ls.get("id") == lesson_id:
            return ls
    return None


def save_lesson(data: dict) -> dict:
    """新建教案存档。返回带 id 的完整记录。"""
    lessons = _read_json(_LESSONS_FILE)
    now = int(time.time())
    lesson_id = data.get("id") or f"lesson_{uuid.uuid4().hex[:10]}"
    record = {
        "id": lesson_id,
        "title": data.get("title", ""),
        "textbook_id": data.get("textbook_id", ""),
        "textbook_title": data.get("textbook_title", ""),
        "chapter_title": data.get("chapter_title", ""),
        "lesson_title": data.get("lesson_title", ""),
        "content": data.get("content", ""),
        "params": data.get("params", {}),
        "created_at": now,
        "updated_at": now,
    }
    lessons.append(record)
    _write_json(_LESSONS_FILE, lessons)
    return record


def update_lesson(lesson_id: str, data: dict) -> dict | None:
    """更新已有教案（标题/正文）。返回更新后记录。"""
    lessons = _read_json(_LESSONS_FILE)
    for ls in lessons:
        if ls.get("id") == lesson_id:
            if "title" in data:
                ls["title"] = data["title"]
            if "content" in data:
                ls["content"] = data["content"]
            ls["updated_at"] = int(time.time())
            _write_json(_LESSONS_FILE, lessons)
            return ls
    return None


def delete_lesson(lesson_id: str) -> bool:
    lessons = _read_json(_LESSONS_FILE)
    new_list = [ls for ls in lessons if ls.get("id") != lesson_id]
    if len(new_list) == len(lessons):
        return False
    _write_json(_LESSONS_FILE, new_list)
    return True
