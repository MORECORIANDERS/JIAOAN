"""教案模板结构定义。

模板以有序字段列表形式定义，既用于：
- 拼装发送给 LLM 的 prompt（约束输出结构）
- 前端渲染与编辑时的字段顺序参考
"""
from __future__ import annotations

# 教案各章节字段定义（顺序即展示顺序）
# 每个字段：key=字段键, label=显示名, hint=给AI的写作提示
LESSON_TEMPLATE: list[dict] = [
    {
        "key": "title",
        "label": "课题",
        "hint": "本节课的课题名称，可包含教材版本/章节信息",
    },
    {
        "key": "objectives",
        "label": "教学目标",
        "hint": "分三条写出：1. 知识与技能目标；2. 过程与方法目标；3. 情感态度与价值观目标。每条具体、可达成。",
    },
    {
        "key": "key_points",
        "label": "教学重点",
        "hint": "本节课必须掌握的核心内容，1-3 条。",
    },
    {
        "key": "difficulties",
        "label": "教学难点",
        "hint": "学生理解或掌握起来较困难的内容，1-2 条，并简要说明突破策略。",
    },
    {
        "key": "preparation",
        "label": "教学准备",
        "hint": "教师准备（教具/课件/挂图等）与学生准备（学具/预习等）。",
    },
    {
        "key": "process",
        "label": "教学过程",
        "hint": (
            "按四个环节展开，每个环节标注时间分配，并区分【教师活动】与【学生活动】："
            "（1）导入（约5分钟）；（2）新授（约20分钟）；"
            "（3）巩固练习（约10分钟）；（4）课堂小结（约5分钟）。"
        ),
    },
    {
        "key": "blackboard",
        "label": "板书设计",
        "hint": "简明的板书结构示意，体现本课核心知识点之间的逻辑关系。",
    },
    {
        "key": "homework",
        "label": "作业布置",
        "hint": "分层作业：基础题（全体）+ 提升题（选做），并注明完成建议。",
    },
    {
        "key": "reflection",
        "label": "教学反思",
        "hint": "（课后填写）",
    },
]


def build_system_prompt() -> str:
    """构造 LLM 的 system prompt，约束其按模板结构输出 Markdown 教案。"""
    fields_desc = "\n".join(
        f"- **{f['label']}**：{f['hint']}" for f in LESSON_TEMPLATE
    )
    return (
        "你是一位经验丰富的中学/小学一线教师与教研专家，擅长编写结构规范、"
        "可落地执行的中文教案。\n\n"
        "请严格按以下模板结构输出一份完整的教案，使用 Markdown 格式。"
        "每个字段用二级标题（## 字段名）标注，内容紧随其后。\n\n"
        f"模板字段：\n{fields_desc}\n\n"
        "要求：\n"
        "1. 内容紧贴所选教材与课时的实际知识点，避免空泛套话；\n"
        "2. 教学过程要具体到师生活动，时间分配合理；\n"
        "3. 语言规范、专业，符合中国中小学教学用语习惯；\n"
        "4. 教学反思字段留空，写一句\"（课后填写）\"即可；\n"
        "5. 只输出教案内容本身，不要输出额外解释。"
    )


def build_user_prompt(params: dict, textbook: dict, chapter: dict | None,
                      lesson_title: str) -> str:
    """构造 LLM 的 user prompt，给出具体教材与课时信息。"""
    lines = [
        f"教材：{textbook.get('title', '')}"
        f"（{textbook.get('subject', '')} · {textbook.get('grade', '')} · "
        f"{textbook.get('version', '')}）",
    ]
    if chapter:
        lines.append(f"章节：{chapter.get('title', '')}")
    lines.append(f"课时：{lesson_title}")
    lines.append(f"课时时长：{params.get('duration_minutes', 40)} 分钟")

    if params.get("student_level"):
        lines.append(f"班级学情：{params['student_level']}")
    if params.get("extra_objectives"):
        lines.append(f"补充教学目标/要求：{params['extra_objectives']}")
    if params.get("style"):
        lines.append(f"教学风格倾向：{params['style']}")

    lines.append("\n请根据以上信息生成完整教案。")
    return "\n".join(lines)
