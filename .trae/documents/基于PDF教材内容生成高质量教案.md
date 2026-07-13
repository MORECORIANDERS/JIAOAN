# 基于 PDF 教材内容生成高质量教案

## Summary（目标）

让用户在浏览器端一键上传**文本版 PDF 教材**，自动提取全文文本，按课时切分并存储，生成教案时把该课时的**真实教材正文**注入 LLM prompt，从而让教案紧贴真实教材内容、显著提升质量。保持纯前端 GitHub Pages 架构，给朋友零门槛使用。

## Current State Analysis（现状分析）

经探索 [app.js](file:///workspace/app.js)、[data.js](file:///workspace/data.js)、[index.html](file:///workspace/index.html)、[styles.css](file:///workspace/styles.css)，现状：

1. **教材结构无正文**：`data.js` 中教材对象只有 `chapters:[{id,title,lessons:[string]}]`，lessons 是课时名字符串，**没有任何教材正文内容字段**。
2. **prompt 仅凭课时名**：`buildUserPrompt`（[app.js:173-185](file:///workspace/app.js#L173-L185)）只传入 `textbook.title`、`chapter.title`、`lessonTitle`，LLM 完全靠常识猜内容——这是教案质量不高的根本原因。
3. **存储用 localStorage**：`SK.TEXTBOOKS` / `SK.LESSONS` / `SK.CONFIG` 三个 key（[app.js:59-71](file:///workspace/app.js#L59-L71)），容量 5-10MB，整本教材正文（几十万字）会超限。
4. **添加教材仅手动表单**：`submitAddTextbook`（[app.js:415-446](file:///workspace/app.js#L415-L446)）只支持 `章节名 | 课时1,课时2` 文本录入，无 PDF 导入。
5. **架构约束**：纯前端、GitHub Pages 部署、给朋友用、文本版 PDF、纯浏览器一键导入（用户已确认）。

## Proposed Changes（改动方案）

### 决策与假设
- **PDF 类型**：文本版（pdf.js 可直接提取，无需 OCR）。
- **导入方式**：纯浏览器，引入 pdf.js（CDN）。
- **切分策略**：**页码范围映射法**——用户为每个课时指定 PDF 页码范围（如 `5-7`），系统按范围提取该课时正文存入 `content`。简单可靠，避免复杂正则切分出错。
- **捷径**：导入 PDF 时可"关联到已有教材"（复用预置教材的章节课时结构，只填页码）或"新建教材"（先填结构再填页码）。
- **存储**：教材正文存 **IndexedDB**（容量大），配置/教案元数据继续用 localStorage。
- **prompt 长度保护**：单课时正文一般 < 5000 字，直接全量注入；超 15000 字截断并提示。

### 文件 1：`index.html` — 增加 PDF 导入向导弹窗
在现有「添加教材」弹窗旁新增 PDF 导入向导，三步流程：
1. **步骤1 上传**：选择"关联已有教材"或"新建教材"+ 上传 PDF 文件。
2. **步骤2 切分**：展示该教材的章节/课时列表（每行一个课时），每个课时后跟"页码范围"输入框（如 `5-7`），并提供"提取预览"按钮查看该范围文本。
3. **步骤3 确认**：显示提取统计（共 N 课时、M 课时已填内容），确认导入。

具体新增 DOM：
- `#modalImportPdf`：导入向导弹窗容器（参照现有 `.modal-mask` / `.modal` 结构）
- 向导内分 `.import-step` 三段，用 `.hidden` 切换
- "关联已有教材"用一个 `<select id="ipLinkTextbook">`（填充预置+自定义教材列表）
- "新建教材"复用现有表单字段（学科/年级/版本/标题/章节文本）
- 步骤2 的课时列表渲染到 `#ipLessonPageMap`
- 在「添加教材」弹窗（`#modalAddTextbook`）内增加一个"从 PDF 导入"按钮，点击关闭当前弹窗并打开 `#modalImportPdf`

### 文件 2：`styles.css` — 导入向导样式
新增样式（沿用现有设计 token：`--primary`/`--card`/`--border`/`--radius` 等）：
- `.import-step`：步骤容器
- `.import-wizard-progress`：顶部 1→2→3 进度条（简化版，三个圆点+连线）
- `.lesson-page-map`：课时页码映射列表，每行 `[课时名] [页码输入框] [预览按钮]`
- `.page-preview`：提取文本预览浮层（小高度滚动框）
- `.import-summary`：步骤3 的统计卡片
- 移动端（≤900px 已有断点内）：向导弹窗全屏、映射列表纵向堆叠

### 文件 3：`app.js` — 核心逻辑（PDF 解析 + IndexedDB + prompt 注入）

#### 3.1 引入 pdf.js
在 `index.html` `<head>` 增加 `<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.js"></script>`，并配置 `pdfjsLib.GlobalWorkerOptions.workerSrc` 指向对应 worker CDN。在 app.js 顶部初始化。

#### 3.2 IndexedDB 封装（新增）
在 localStorage 读写区下方新增 IndexedDB helper：
- DB 名 `jiaoan_db`，store 名 `textbook_content`（keyPath: `textbook_id`）
- `idbPutContent(textbookId, contentMap)`：contentMap 结构 `{ "ch1|课时名": "正文文本", ... }`
- `idbGetContent(textbookId)` → 返回 contentMap 或 null
- `idbDeleteContent(textbookId)`
- `idbClearAll()`
- 全部返回 Promise，用原生 IndexedDB API（不引入第三方库，保持零依赖）

#### 3.3 数据结构扩展
- 教材对象增加 `has_content: boolean` 字段（标记是否含 PDF 提取的正文）
- 课时仍为字符串（保持向后兼容），正文按 `"chapterId|lessonName"` 存 IndexedDB contentMap
- 自定义教材元信息（无正文）继续存 localStorage `SK.TEXTBOOKS`，保证 `getAllTextbooks` 同步快速

#### 3.4 PDF 导入向导逻辑（新增函数群）
- `openImportPdfModal()` / `closeImportPdfModal()`
- `handlePdfUpload(file)`：用 pdf.js `getDocument` 逐页 `getTextContent()` 提取，按页缓存到内存 `pdfPagesCache = {1: "页1文本", 2: "页2文本", ...}`，显示总页数
- `renderLessonPageMap()`：根据所选教材（关联或新建）的章节课时结构，渲染课时列表 + 页码输入框
- `previewPageRange(start, end)`：从 `pdfPagesCache` 取指定页拼接，显示在预览框
- `confirmImport()`：遍历每个课时的页码范围，提取正文组装 contentMap，调 `idbPutContent` 存储；同时保存教材元信息到 localStorage（含 `has_content:true`）；关闭弹窗，刷新教材列表
- 页码解析：支持 `5`、`5-7`、`5,8,10` 三种格式

#### 3.5 生成教案时注入正文（质量提升关键）
改造 `submitGenerate`（[app.js:448](file:///workspace/app.js#L448)）：
- 生成前异步 `await idbGetContent(state.selectedTextbook.id)` 取 contentMap
- 用 key `${chapter.id}|${lessonTitle}` 查该课时正文
- 传给 `buildUserPrompt` 新增参数 `lessonContent`

改造 `buildUserPrompt`（[app.js:173](file:///workspace/app.js#L173)）：
```js
function buildUserPrompt(params, textbook, chapter, lessonTitle, lessonContent) {
  const lines = [ `教材：${textbook.title}（${textbook.subject} · ${textbook.grade} · ${textbook.version}）` ];
  if (chapter) lines.push(`章节：${chapter.title}`);
  lines.push(`课时：${lessonTitle}`);
  if (lessonContent) {
    const trimmed = lessonContent.length > 15000
      ? lessonContent.slice(0, 15000) + "\n…（原文过长已截断）"
      : lessonContent;
    lines.push(`\n【该课时教材原文】\n${trimmed}\n`);
  }
  // …其余参数不变
  lines.push("\n请严格基于上述教材原文生成教案，知识点与例题应与原文一致，不得编造原文未涉及的内容。");
  return lines.join("\n");
}
```

#### 3.6 教材卡片标记
`renderTextbooks` 中，若 `tb.has_content` 为 true，在卡片显示徽章"📄 含教材原文"。

#### 3.7 清空数据联动
`clearAllData`（[app.js:818](file:///workspace/app.js#L818)）增加 `await idbClearAll()`。
删除自定义教材时（如有该功能）同步 `idbDeleteContent`。

#### 3.8 导入向导事件绑定
在 `bindEvents` 增加：打开/关闭向导、文件上传 change、预览按钮、确认按钮、关联教材 select change 等。

### 文件 4：`data.js` — 无需改动
预置教材保持现状（不含 content），`has_content` 默认 false。

## Assumptions & Decisions（假设与决策）
1. **假设**：用户的 PDF 为文本版（可选中复制），pdf.js 能提取出可用文本。若个别 PDF 是扫描版，提取结果为空，向导会提示"未提取到文本，该 PDF 可能是扫描版"。
2. **决策**：正文按课时粒度存储与注入（而非整章），因教案生成是按课时的，粒度匹配、prompt 长度可控。
3. **决策**：页码映射用手动输入而非自动正则切分——教材版式各异，自动切分易错；手动映射虽繁琐但可靠，且一次导入长期使用。
4. **决策**：IndexedDB 只存正文 contentMap，元信息留 localStorage——保证列表加载同步快速，改动最小。
5. **决策**：不引入第三方 IndexedDB 库，用原生 API 封装，保持零依赖。
6. **决策**：prompt 注入上限 15000 字（约 2-3 个课时原文量），对 agnes-2.0-flash / glm-4-flash 长上下文模型均安全。

## Verification Steps（验证步骤）
1. **PDF 解析**：上传一个文本版 PDF，确认能提取出每页文本，预览正确。
2. **页码映射**：为某课时填页码范围 `5-7`，点预览确认显示第5-7页拼接文本。
3. **存储**：导入后用浏览器 DevTools → Application → IndexedDB → `jiaoan_db` 确认 contentMap 存入；localStorage `SK.TEXTBOOKS` 中该教材 `has_content:true`。
4. **教案生成质量**：配置 LLM，选已导入正文的教材+课时，生成教案，对比改造前后——改造后教案应包含原文知识点/例题，不再空泛。
5. **无正文兜底**：选未导入正文的预置教材生成，应正常工作（lessonContent 为空，回退原逻辑）。
6. **容量**：导入一本完整教材后，localStorage 未超限（正文在 IndexedDB），页面其他功能正常。
7. **清空**：设置页"清空所有数据"后，IndexedDB 与 localStorage 均清空。
8. **移动端**：≤900px 向导弹窗全屏可用，映射列表可滚动。
9. **语法/静态检查**：`node --check app.js` 通过；4 个静态资源 HTTP 200；浏览器控制台无报错。
10. **推送**：提交并 push 到 main，GitHub Pages 自动部署后朋友可访问。

## 实施顺序
1. index.html 加 pdf.js CDN + 导入向导 DOM
2. styles.css 加向导样式
3. app.js：IndexedDB helper → PDF 解析 → 向导逻辑 → prompt 注入 → 卡片徽章 → 清空联动
4. 本地 `python3 -m http.server` 验证全流程
5. 提交推送 main
