# 教材教案生成器 项目设计方案

## 概述

一个 Web 应用：用户选择教材（学科/年级/版本/章节），配置教学参数后，系统结合**预设教案模板结构**与 **AI 大模型内容生成**，输出一份结构完整、可编辑、可导出的教案。

- 技术栈：前端（HTML/CSS/JS 单页）+ Python 后端（FastAPI）
- 生成方式：模板框架 + AI 填充内容
- 教材来源：预置常用教材库 + 用户可添加自定义教材
- AI 接入：OpenAI 兼容接口（可配置 GLM/OpenAI 等），密钥通过后端 `.env` 管理，前端不接触密钥

---

## 当前状态分析

- 工作区 `/workspace` 为空项目，仅含 Python 风格 `.gitignore` 与 `LICENSE`，无既有代码约束。
- `.gitignore` 已覆盖 `.env`、`__pycache__`、`venv` 等，可直接沿用。
- 需从零搭建前后端，但保持轻量：无构建步骤的前端 + 单文件路由的后端。

---

## 目录结构

```
/workspace
├── backend/
│   ├── main.py                 # FastAPI 入口，注册路由 + 静态文件挂载
│   ├── config.py               # 读取 .env，集中配置（API key/base_url/model）
│   ├── llm.py                  # LLM 调用封装（OpenAI 兼容）
│   ├── templates_def.py        # 教案模板结构定义（各章节字段）
│   ├── store.py                # JSON 文件持久化（教材/教案 CRUD）
│   ├── data/
│   │   └── textbooks.json      # 预置教材库（学科/年级/版本/章节）
│   ├── saved/
│   │   ├── textbooks.json      # 用户自定义教材（运行时写入）
│   │   └── lessons.json        # 生成的教案存档（运行时写入）
│   ├── requirements.txt        # fastapi, uvicorn, openai, python-dotenv
│   └── .env.example            # API 配置示例（实际 .env 被 gitignore）
├── frontend/
│   ├── index.html              # 单页应用
│   ├── styles.css              # 样式
│   └── app.js                  # 交互逻辑、API 调用、状态管理
└── README.md                   # 运行说明（仅在此处创建，因项目需可运行）
```

> 说明：按规则仅在必要时创建文件。`README.md` 因项目需提供运行指引而创建，其余均为功能必需文件。

---

## 后端设计（FastAPI）

### 配置 `backend/config.py`
- 通过 `python-dotenv` 读取 `.env`
- 配置项：`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_TIMEOUT`
- 默认指向智谱 GLM 兼容端点，但可改 `base_url` 切换其他 OpenAI 兼容服务

### LLM 封装 `backend/llm.py`
- 函数 `generate_lesson(prompt: str) -> str`
- 使用 `openai` SDK（兼容模式：`base_url` 指向 GLM/OpenAI）
- 构造 system prompt：要求按教案模板结构输出 Markdown
- 错误处理：超时/限流/鉴权失败时返回结构化错误，前端可提示

### 教案模板定义 `backend/templates_def.py`
预设教案结构字段（中文教学规范）：
1. 课题
2. 教学目标（知识目标 / 能力目标 / 情感目标）
3. 教学重点
4. 教学难点
5. 教学准备（教具/学具）
6. 教学过程（导入 → 新授 → 巩固练习 → 课堂小结，每段含教师活动/学生活动/时间分配）
7. 板书设计
8. 作业布置
9. 教学反思（生成时留空，供教师课后填写）

模板以 Python dict 定义，同时作为 AI 输出的结构约束。

### 持久化 `backend/store.py`
- 基于 JSON 文件读写（轻量，无需数据库）
- 函数：`list_textbooks()`、`add_textbook()`、`get_textbook()`、`list_lessons()`、`save_lesson()`、`get_lesson()`、`update_lesson()`
- 预置教材从 `data/textbooks.json` 加载（只读基线），自定义教材与教案写入 `saved/`

### 预置教材库 `backend/data/textbooks.json`
内置若干常用教材示例（覆盖小学/初中各一两本），结构：
```json
{
  "id": "math_grade3_pep",
  "subject": "数学",
  "grade": "三年级",
  "version": "人教版",
  "title": "义务教育教科书·数学（三年级上册）",
  "chapters": [
    { "id": "ch1", "title": "时、分、秒", "lessons": ["秒的认识","时间的计算"] },
    { "id": "ch2", "title": "万以内的加法和减法（一）", "lessons": ["两位数加两位数","两位数减两位数"] }
  ]
}
```
> 预置数据为示例性内容，便于演示；用户可自行扩展。

### API 路由（注册于 `main.py`）
| 方法 | 路径 | 功能 |
|------|------|------|
| GET  | `/api/textbooks` | 列出预置+自定义教材 |
| POST | `/api/textbooks` | 新增自定义教材 |
| GET  | `/api/textbooks/{id}` | 获取教材详情（含章节） |
| POST | `/api/lessons/generate` | 生成教案：入参含教材id/章节/课时/教学目标补充/班级学情/课时长度等 |
| GET  | `/api/lessons` | 列出已存档教案 |
| GET  | `/api/lessons/{id}` | 获取某教案 |
| PUT  | `/api/lessons/{id}` | 编辑保存教案 |
| DELETE | `/api/lessons/{id}` | 删除教案 |

- `main.py` 同时挂载 `frontend/` 为静态目录，访问 `/` 直接返回 `index.html`，实现单服务部署。

### 生成端点核心逻辑 `/api/lessons/generate`
1. 接收参数：`textbook_id`、`chapter_id`、`lesson_title`、`duration_minutes`、`student_level`、`extra_objectives`、`style`（如：讲授式/探究式）
2. 查教材信息，组装上下文
3. 构造 prompt：system 指定"按给定 Markdown 模板结构输出教案"，user 给出教材+章节+参数
4. 调 `llm.generate_lesson()`
5. 将返回的 Markdown 存档并返回（含 `id`）

---

## 前端设计（单页应用）

### 页面结构 `frontend/index.html`
三栏式 / 步骤式布局，无框架依赖（原生 JS）：

1. **顶部导航**：标题 + "我的教案"入口
2. **主区域（分步）**：
   - **步骤1 选教材**：卡片网格展示教材（学科/年级/版本筛选）+ "添加自定义教材"按钮（弹窗表单：学科/年级/版本/书名/章节列表）
   - **步骤2 选课时**：展示该教材章节树，点选具体一课
   - **步骤3 配置参数**：表单——课时时长、学情描述、补充教学目标、教学风格选择
   - **步骤4 生成与预览**：点击"生成教案"，loading 动画，完成后渲染 Markdown 为 HTML 预览
3. **教案查看/编辑**：支持在线编辑（textarea 或 contenteditable），保存到后端
4. **导出**：浏览器打印（另存 PDF）+ 下载 Markdown 文件

### 交互逻辑 `frontend/app.js`
- 状态机管理当前步骤
- `fetch` 调用后端 API
- Markdown 渲染：引入轻量库 `marked`（CDN）
- 代码高亮可选，保持轻量

### 样式 `frontend/styles.css`
- 简洁现代风格，响应式
- 教材卡片、章节树、表单、教案预览统一视觉

---

## 假设与决策

1. **AI 服务**：采用 OpenAI 兼容接口，默认配置指向智谱 GLM；用户在 `.env` 中填入自己的 `LLM_API_KEY` 即可。后端代理调用，前端永不接触密钥。
2. **存储**：使用 JSON 文件持久化，避免引入数据库；满足单机/小范围使用。若后续需多用户并发，可升级为 SQLite。
3. **无构建步骤**：前端为原生 HTML/CSS/JS + CDN（marked），降低部署门槛。
4. **预置教材**：为示例数据（非完整教材内容），重点演示流程；用户可添加自定义教材补充。
5. **教案格式**：以 Markdown 为载体，便于编辑与导出；模板结构由后端统一定义并约束 AI 输出。
6. **单服务部署**：FastAPI 同时托管 API 与前端静态文件，`uvicorn` 一条命令启动。

---

## 实现步骤

1. 创建目录结构与配置文件（`requirements.txt`、`.env.example`、`config.py`）
2. 编写预置教材数据 `data/textbooks.json`
3. 编写教案模板定义 `templates_def.py`
4. 实现 LLM 封装 `llm.py`
5. 实现存储层 `store.py`
6. 实现 API 路由与静态挂载 `main.py`
7. 编写前端 `index.html` / `styles.css` / `app.js`
8. 本地启动验证（`uvicorn backend.main:app --reload`），走通完整流程
9. 编写 `README.md` 运行说明

---

## 验证步骤

- 启动后端：`cd /workspace && pip install -r backend/requirements.txt && uvicorn backend.main:app --reload`
- 浏览器访问 `http://127.0.0.1:8000/`
- 验证用例：
  1. GET `/api/textbooks` 返回预置教材列表
  2. 选择教材 → 章节 → 填写参数 → 点击生成，返回完整教案 Markdown
  3. 编辑教案 → 保存 → 重新打开内容一致
  4. 导出 Markdown 文件 / 打印为 PDF
  5. 添加自定义教材 → 出现在列表中 → 可用于生成
- 错误路径：未配置 API key 时，生成端点返回友好错误提示

---

## 备注

- 本方案聚焦"能用、可演示、结构清晰"，未引入用户系统与数据库；如需扩展可在此基础上加 SQLite + 认证层。
- AI 生成质量依赖模型与 prompt，`llm.py` 中 prompt 已按教学规范精心构造。
