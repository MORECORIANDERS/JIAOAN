# 教材教案生成器

一个纯前端 Web 应用：选择教材 → 选择课时 → 配置参数 → AI 自动生成结构完整的中文教案，支持在线编辑与导出。

- **纯前端**：无后端，可直接部署到 GitHub Pages
- **数据本地化**：所有数据（教材、教案、API Key）存浏览器 localStorage，天然隐私隔离
- **AI 接入**：OpenAI 兼容接口，用户自备 API Key，支持智谱 GLM / OpenAI / DeepSeek 等
- **生成方式**：预设教案模板结构 + AI 填充内容

## 功能

- 内置常用教材库（数学/语文/英语/物理，覆盖小学到初中），支持按学科/年级/版本筛选
- 支持添加自定义教材（手动录入章节与课时）
- 分步引导：选教材 → 选课时 → 配参数（课时时长/学情/教学风格/补充目标）→ 生成预览
- 生成的教案按教学规范结构输出（教学目标/重难点/教学过程/板书设计/作业布置等）
- 支持在线编辑、保存、查看历史教案
- 支持导出 Markdown 文件、浏览器打印另存 PDF
- 支持全量数据导出/导入（JSON 文件），便于备份与迁移

## 目录结构

```
/workspace
├── index.html       # 单页应用入口
├── styles.css       # 样式
├── app.js           # 交互逻辑、LLM 调用、本地存储
├── data.js          # 预置教材库 + LLM 服务预设
└── README.md
```

## 部署到 GitHub Pages

### 方式一：直接推送根目录（推荐）

1. 在 GitHub 创建仓库（如 `lesson-plan-generator`）
2. 把本目录所有文件推送到 `main` 分支根目录：
   ```bash
   git add .
   git commit -m "纯前端教案生成器"
   git push origin main
   ```
3. 仓库 `Settings` → `Pages` → `Build and deployment`：
   - Source 选 `Deploy from a branch`
   - Branch 选 `main`，文件夹选 `/(root)`
   - 保存
4. 等待约 1 分钟，访问 `https://<你的用户名>.github.io/<仓库名>/`

### 方式二：放入 docs 子目录

如果想保留根目录的其他文件，可把 `index.html`、`styles.css`、`app.js`、`data.js` 放到 `docs/` 目录，Pages 设置里 Branch 文件夹选 `/docs`。

## 使用流程（给朋友的说明）

1. 打开网站，首次访问会提示"尚未配置 LLM API"
2. 点击右上角「⚙ 设置」
3. 选择服务预设（如智谱 GLM / OpenAI），填写：
   - **Base URL**：默认自动填充，也可改任意 OpenAI 兼容端点
   - **模型名称**：如 `glm-4-flash` / `gpt-4o-mini`
   - **API Key**：到对应平台申请（设置页有申请链接）
4. 点击「测试连接」验证是否可用 → 保存
5. 回到首页选教材 → 选课时 → 配参数 → 生成教案

## 隐私保护说明

- **API Key**：仅保存在你当前浏览器的 localStorage，不会上传到任何第三方服务器（除你选择的 LLM 服务外）
- **教案数据**：仅保存在你当前浏览器，他人无法访问
- **数据隔离**：每个浏览器/设备独立存储，朋友之间互不可见
- **公共电脑警示**：请勿在公共/共享电脑上保存 Key，使用后请到「设置」→「清空所有数据」
- **备份建议**：定期用「我的教案」→「导出全部」备份（导出文件包含 API Key，请妥善保管）

## 关于 CORS 跨域的重要说明

浏览器直调 LLM API 可能遇到 **CORS 跨域拦截**，这是浏览器安全策略，不是 bug。

**各服务支持情况**：
| 服务 | 浏览器直调 CORS | 备注 |
|------|---------------|------|
| OpenAI 官方 | ✅ 支持 | 需海外网络 |
| 智谱 GLM | ⚠ 不确定 | 建议用「测试连接」实测 |
| DeepSeek | ⚠ 不确定 | 建议用「测试连接」实测 |

**如果遇到 CORS 错误（请求失败且提示"跨域"）**，可选：
1. 换用支持 CORS 的服务（如 OpenAI）
2. 自建 Cloudflare Worker 代理（免费）：在 Worker 中转发请求并添加 CORS 头，将 Worker URL 填入 Base URL
3. 使用本地代理启动（如 `cors-anywhere`）

**Cloudflare Worker 代理示例**（粘贴到 Worker 编辑器即可）：
```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = "https://open.bigmodel.cn/api/paas/v4" + url.pathname;
    const headers = new Headers(request.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }});
    }
    const resp = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body
    });
    const newHeaders = new Headers(resp.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(resp.body, { status: resp.status, headers: newHeaders });
  }
};
```
部署后，在设置里把 Base URL 改为你的 Worker URL（如 `https://your-worker.workers.dev`）。

## API 兼容性

应用使用标准 OpenAI Chat Completions 接口（`POST /chat/completions`），兼容：
- OpenAI 官方 API
- 智谱 GLM（Open 兼容模式）
- DeepSeek
- 月之暗面 Kimi
- 任何提供 OpenAI 兼容端点的服务

## 本地预览

无需构建，直接用任意静态服务器：
```bash
# Python
python3 -m http.server 8000

# 或 Node
npx serve .
```
访问 http://localhost:8000/

## 备注

- 预置教材为示例数据，可在 `data.js` 中扩充
- 教案模板结构定义在 `app.js` 的 `LESSON_TEMPLATE` 常量中，可按需调整
- localStorage 容量约 5-10MB，存几十到上百份教案无压力；超量请用导出功能备份后清理
- 无用户系统、无数据库、无服务器成本
