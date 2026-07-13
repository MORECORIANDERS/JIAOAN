# 教材教案生成器

一个 Web 应用：选择教材 → 选择课时 → 配置参数 → AI 自动生成结构完整的中文教案，支持在线编辑与导出。

- **生成方式**：预设教案模板结构 + AI 大模型填充内容
- **技术栈**：FastAPI（后端）+ 原生 HTML/CSS/JS（前端，无构建步骤）
- **AI 接入**：OpenAI 兼容接口，默认配置指向智谱 GLM，可切换其他兼容服务

## 功能

- 内置常用教材库（数学/语文/英语/物理，覆盖小学到初中），支持按学科/年级/版本筛选
- 支持添加自定义教材（手动录入章节与课时）
- 分步引导：选教材 → 选课时 → 配参数（课时时长/学情/教学风格/补充目标）→ 生成预览
- 生成的教案按教学规范结构输出（教学目标/重难点/教学过程/板书设计/作业布置等）
- 支持在线编辑、保存、查看历史教案
- 支持导出 Markdown 文件、浏览器打印另存 PDF

## 目录结构

```
/workspace
├── backend/
│   ├── main.py              # FastAPI 入口，API 路由 + 静态文件挂载
│   ├── config.py            # 读取 .env 配置
│   ├── llm.py               # LLM 调用封装（OpenAI 兼容）
│   ├── templates_def.py     # 教案模板结构与 prompt 构造
│   ├── store.py             # JSON 文件持久化
│   ├── data/textbooks.json  # 预置教材库
│   ├── saved/               # 运行时存档（自定义教材、生成的教案）
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
cd /workspace
pip install -r backend/requirements.txt
```

### 2. 配置 LLM API 密钥

复制示例配置并填入你的 API Key：

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`：

```env
LLM_API_KEY=你的_api_key
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4-flash
LLM_TIMEOUT=60
```

> 默认配置对接智谱 GLM（需在 https://open.bigmodel.cn 申请 key）。
> 也可切换为 OpenAI 或任意 OpenAI 兼容服务，只需修改 `LLM_BASE_URL` 与 `LLM_MODEL`。

### 3. 启动服务

```bash
cd /workspace
uvicorn backend.main:app --reload
```

### 4. 访问

浏览器打开 http://127.0.0.1:8000/

## 使用流程

1. 首页展示教材卡片，可按学科/年级/版本筛选，或点击「+ 添加自定义教材」录入
2. 选中教材 → 展示章节树 → 点击具体课时
3. 填写生成参数（课时时长、学情描述、补充目标、教学风格）
4. 点击「生成教案」→ AI 按模板结构输出 Markdown 教案
5. 可在线编辑、保存，或下载 Markdown / 打印为 PDF
6. 顶部「我的教案」可查看、打开、删除历史存档

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/textbooks` | 列出预置+自定义教材 |
| POST | `/api/textbooks` | 新增自定义教材 |
| GET | `/api/textbooks/{id}` | 获取教材详情 |
| POST | `/api/lessons/generate` | 生成教案 |
| GET | `/api/lessons` | 列出已存档教案 |
| GET | `/api/lessons/{id}` | 获取教案详情 |
| PUT | `/api/lessons/{id}` | 编辑保存教案 |
| DELETE | `/api/lessons/{id}` | 删除教案 |

## 备注

- 数据使用 JSON 文件持久化（`backend/saved/`），适合单机/小范围使用
- 前端不接触 API 密钥，所有 LLM 调用由后端代理
- 未配置 `LLM_API_KEY` 时，生成端点会返回友好错误提示，其余功能正常
- 预置教材为示例数据，可在 `backend/data/textbooks.json` 中扩充
