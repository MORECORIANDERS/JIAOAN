# 添加教材自动填充——从 PDF 识别章节与元信息

## 一、Summary（总览）

用户在"从 PDF 导入教材"向导的**新建模式**下，需要手动填写学科、年级、版本、教材名称、章节。本计划在上传 PDF 成功解析后，自动从 PDF 识别并填充这些字段，用户可在此基础上修改：

- **章节**：优先 `pdf.getOutline()`（PDF 书签，结构化、最可靠）；取不到时回退到目录页文本解析（找"目录"页，按缩进/编号识别章节和课时）。
- **教材名称**：`pdf.getMetadata().info.Title`（取不到或为乱码/空则留空）。
- **学科 / 年级 / 版本**：从教材名 + 目录页文本中用关键词正则猜测（数学/语文/英语/物理/化学/生物/历史/地理/政治/科学；一年级~九年级/高一~高三/一年级~六年级；人教版/北师大版/苏教版/沪教版等）。猜测结果填入但用户可改。

触发时机：上传 PDF 解析成功后立即自动填充（仅新建模式；关联模式不动，因章节结构已由预置教材提供）。

## 二、Current State Analysis（现状分析，基于 Phase 1 审阅）

### 现有流程（[app.js:802-868](file:///workspace/app.js#L802-868) handlePdfUpload）

1. 上传 PDF → `pdfjsLib.getDocument` → 逐页 `getTextContent` + `cleanPdfPageText` 清洗
2. `detectHeaderFooter` + `stripHeaderFooter` 移除页眉页脚
3. 文本 <50 字时询问 OCR
4. 状态写入 `importState.pdfPagesCache` + `importState.pdfPageCount`
5. **未做任何元信息识别**——解析完只显示"已解析 N 页，约 X 字"

### 现有新建模式字段（[app.js:913-944](file:///workspace/app.js#L913-944) goImportStep2）

手动从 `#ipSubject`、`#ipGrade`、`#ipVersion`、`#ipTitle`、`#ipChapters` 读取，章节文本框格式为"每行：章节名 | 课时1,课时2,…"。

### 关键 API 可用性

- `pdf.getOutline()`：返回 `[{title, items: [...], dest}]` 嵌套结构，对应 PDF 书签。多数正式出版教材 PDF 有书签。
- `pdf.getMetadata()`：返回 `{info: {Title, Author, ...}}`。Title 常为空或为文件名。
- 目录页文本：清洗后的 `pdfPagesCache` 前 3-5 页通常含"目录"二字，可作为回退来源。

### 预置教材数据规律（[data.js](file:///workspace/data.js)）

- 学科：数学/语文/英语/物理/化学/生物/历史/地理/政治/科学
- 年级：一年级~六年级（小学）、七年级~九年级（初中）、高一~高三（高中）
- 版本：人教版/北师大版/苏教版/沪教版/华东师大版/青岛版/西师版
- 章节标题模式：`第一章 XXX`、`第X单元`、`Unit N`、纯标题（如"时、分、秒"）

## 三、Proposed Changes（具体改动）

全部改动集中在 `/workspace/app.js` 一个文件。

### 改动 1：新增 PDF 元信息识别函数群

位置：`handlePdfUpload` 上方（[app.js:801](file:///workspace/app.js#L801) 之前），与现有清洗函数群并列。

```js
// ---------- PDF 元信息自动识别 ----------

// 1. 从 PDF 书签提取章节结构（优先方案）
async function extractChaptersFromOutline(pdf) {
  let outline;
  try {
    outline = await pdf.getOutline();
  } catch (e) {
    return null;
  }
  if (!outline || !outline.length) return null;
  // 书签通常两层：第一层=章节，第二层=课时。也有一层（直接是课时）的情况。
  const chapters = [];
  outline.forEach((node, idx) => {
    const title = String(node.title || "").trim();
    if (!title) return;
    const lessons = (node.items || [])
      .map((it) => String(it.title || "").trim())
      .filter(Boolean);
    if (lessons.length) {
      // 两层结构：章节 + 课时
      chapters.push({ id: `ch${idx + 1}`, title, lessons });
    } else {
      // 单层结构：把该项作为课时，归入一个默认章节
      if (!chapters.length) chapters.push({ id: "ch1", title: "目录", lessons: [] });
      chapters[chapters.length - 1].lessons.push(title);
    }
  });
  return chapters.length ? chapters : null;
}

// 2. 从目录页文本提取章节结构（回退方案）
function extractChaptersFromToc(pagesCache) {
  // 找"目录"页：前 5 页中含"目录"且行数 >=3 的页
  let tocText = "";
  for (let i = 1; i <= Math.min(5, Object.keys(pagesCache).length); i++) {
    const t = pagesCache[i] || "";
    if (/目\s*录/.test(t) && t.split("\n").length >= 3) {
      tocText = t;
      break;
    }
  }
  if (!tocText) return null;
  const lines = tocText.split("\n").map((l) => l.trim()).filter(Boolean);
  const chapters = [];
  let curChapter = null;
  // 章节行模式：第X章/第X单元/Unit N/第X节；课时行通常较短或带页码
  const chapterRe = /^第[一二三四五六七八九十\d]+[章单元节部分]|^Unit\s+\d+|^Lesson\s+\d+/i;
  // 页码后缀（如 "3" 或 "……3" 或 "...... 15"）
  const pageNumSuffix = /[\.…\s]*\d{1,3}\s*$/;
  for (const line of lines) {
    if (chapterRe.test(line)) {
      const title = line.replace(pageNumSuffix, "").trim();
      curChapter = { id: `ch${chapters.length + 1}`, title, lessons: [] };
      chapters.push(curChapter);
    } else if (curChapter && line.length >= 2 && line.length <= 30) {
      // 作为课时（去掉尾部页码）
      const lesson = line.replace(pageNumSuffix, "").trim();
      if (lesson) curChapter.lessons.push(lesson);
    }
  }
  // 过滤掉没有课时的章节
  const valid = chapters.filter((c) => c.lessons.length > 0);
  return valid.length ? valid : null;
}

// 3. 从文本猜测学科
function guessSubject(text) {
  const rules = [
    [/数学|代数|几何|有理数|方程|函数|乘除|加减|分数|小数/, "数学"],
    [/语文|课文|生字|古诗|文言文|阅读|写作|拼音|汉字/, "语文"],
    [/英语|English|Unit|Lesson|word|sentence|grammar/i, "英语"],
    [/物理|力学|电学|光学|声现象|机械运动|能量/, "物理"],
    [/化学|分子|原子|元素|化合物|溶液|酸碱|化学反应/, "化学"],
    [/生物|细胞|植物|动物|遗传|生态系统|人体/, "生物"],
    [/历史|朝代|古代|近代|革命|战争|文明|帝国/, "历史"],
    [/地理|地图|气候|地形|大洲|国家|经纬|人口/, "地理"],
    [/政治|道德|法治|宪法|公民|社会|价值观/, "政治"],
    [/科学|观察|实验|物质|生命|地球与宇宙/, "科学"],
  ];
  for (const [re, subj] of rules) {
    if (re.test(text)) return subj;
  }
  return "";
}

// 4. 从文本猜测年级
function guessGrade(text) {
  // 小学
  const m1 = text.match(/([一二三四五六])年级/);
  if (m1) return `${m1[1]}年级`;
  // 初中
  const m2 = text.match(/([七八九])年级/);
  if (m2) return `${m2[1]}年级`;
  // 高中
  const m3 = text.match(/(高一|高二|高三)/);
  if (m3) return m3[1];
  return "";
}

// 5. 从文本猜测版本
function guessVersion(text) {
  const rules = [
    [/人教版|人民教育出版社/, "人教版"],
    [/北师大版|北京师范大学出版社/, "北师大版"],
    [/苏教版|江苏教育出版社/, "苏教版"],
    [/沪教版|上海教育出版社/, "沪教版"],
    [/华东师大版|华东师范大学出版社/, "华东师大版"],
    [/青岛版/, "青岛版"],
    [/西师版|西南师范大学出版社/, "西师版"],
    [/鲁教版/, "鲁教版"],
    [/湘教版/, "湘教版"],
  ];
  for (const [re, v] of rules) {
    if (re.test(text)) return v;
  }
  return "人教版"; // 默认值
}

// 6. 把章节结构转为文本框格式（每行：章节名 | 课时1,课时2,…）
function chaptersToText(chapters) {
  return chapters
    .map((ch) => `${ch.title} | ${ch.lessons.join(",")}`)
    .join("\n");
}

// 7. 主入口：从 PDF 识别元信息，填充新建模式表单
async function autoFillFromPdf(pdf, pagesCache) {
  // 教材名称：优先元数据 Title
  let title = "";
  try {
    const meta = await pdf.getMetadata();
    title = String(meta?.info?.Title || "").trim();
    // 元数据 Title 常为乱码或文件名，简单过滤：含中文且长度 >=4 才用
    if (title && !/[\u4e00-\u9fa5]/.test(title)) title = "";
  } catch (e) {}
  // 章节：优先书签，回退目录页
  let chapters = await extractChaptersFromOutline(pdf);
  if (!chapters) chapters = extractChaptersFromToc(pagesCache);
  // 拼接用于猜测的文本：标题 + 前 5 页 + 章节文本
  const samplePages = Object.keys(pagesCache)
    .slice(0, 5)
    .map((k) => pagesCache[k])
    .join("\n");
  const guessText = `${title}\n${samplePages}\n${chapters ? chaptersToText(chapters) : ""}`;
  const subject = guessSubject(guessText);
  const grade = guessGrade(guessText);
  const version = guessVersion(guessText);
  // 填入表单（仅新建模式；关联模式不动）
  if (importState.mode !== "new") return { filled: false };
  if (title) $("#ipTitle").value = title;
  if (subject) $("#ipSubject").value = subject;
  if (grade) $("#ipGrade").value = grade;
  $("#ipVersion").value = version; // 总有默认值
  if (chapters) $("#ipChapters").value = chaptersToText(chapters);
  return { filled: true, hasChapters: !!chapters, hasTitle: !!title };
}
```

### 改动 2：handlePdfUpload 解析成功后调用 autoFillFromPdf

位置：[app.js:860-863](file:///workspace/app.js#L860-863)，文本版 PDF 成功分支（`else` 块内）。

```js
} else {
  $("#ipPdfStatus").textContent =
    `✓ 已解析 ${pdf.numPages} 页，共约 ${totalChars} 字（已清洗段落、过滤页眉页脚）。`;
  // 新建模式下自动填充元信息
  if (importState.mode === "new") {
    try {
      const r = await autoFillFromPdf(pdf, cache);
      if (r.filled) {
        const parts = [];
        if (r.hasChapters) parts.push("章节结构");
        if (r.hasTitle) parts.push("教材名称");
        parts.push("学科/年级/版本");
        $("#ipPdfStatus").textContent += ` 已自动识别${parts.join("、")}，请核对后继续。`;
      }
    } catch (e) {
      console.error("[autofill]", e);
      // 自动填充失败不影响主流程，静默跳过
    }
  }
}
```

同样在 OCR 成功分支（[app.js:846-848](file:///workspace/app.js#L846-848)）也加上 autoFillFromPdf 调用（OCR 完成后 PDF 书签仍可用，且 OCR 文本可用于猜测）：

```js
} else {
  $("#ipPdfStatus").textContent =
    `✓ OCR 识别完成，共 ${pdf.numPages} 页，约 ${totalChars} 字。`;
  if (importState.mode === "new") {
    try {
      const r = await autoFillFromPdf(pdf, cache);
      if (r.filled) {
        $("#ipPdfStatus").textContent += " 已自动识别章节与元信息，请核对后继续。";
      }
    } catch (e) { console.error("[autofill]", e); }
  }
}
```

### 改动 3：关联模式切换时不覆盖已填充内容（无代码改动，仅说明）

`onImportModeChange`（[app.js:632-637](file:///workspace/app.js#L632-637)）切换到"关联"时隐藏新建字段，切回"新建"时显示。autoFillFromPdf 只在 `mode === "new"` 时执行，不会污染关联模式。用户从关联切到新建后再上传 PDF 仍会触发填充——符合预期。

## 四、Assumptions & Decisions（假设与决策）

1. **仅新建模式自动填充**：关联模式章节结构来自预置教材，不需要也不应覆盖。
2. **章节识别两级回退**：`getOutline` 优先（结构化最可靠），失败回退目录页文本解析。两者都失败则留空让用户手填。
3. **学科/年级/版本用关键词猜测**：从标题+前5页+章节文本中匹配。版本取不到时默认"人教版"（最常见，用户可改）。
4. **教材名称用元数据 Title**：仅当含中文且非空时采用，否则留空（PDF 元数据常不可靠，不强填乱码）。
5. **自动填充失败静默跳过**：不影响 PDF 解析主流程，用户仍可手填。
6. **不修改添加教材弹窗**（[app.js:576-592](file:///workspace/app.js#L576-592) 的手动添加流程）：那里没有 PDF，自动填充不适用。
7. **目录页识别仅看前 5 页**：教材目录通常在前 5 页，避免误判正文中的"目录"字样。
8. **章节标题保留原文**：不做"第X章"→"X"的清洗，用户可在文本框自行修改。
9. **版本默认值**：取不到时默认"人教版"而非空，因 most common 且用户改一个值比从头选容易。

## 五、Verification（验证步骤）

### 静态验证
1. `node --check /workspace/app.js` 语法通过。
2. Grep 确认 `autoFillFromPdf` 在 handlePdfUpload 的两个成功分支（文本版 + OCR 版）都被调用。
3. Grep 确认 `extractChaptersFromOutline`、`extractChaptersFromToc`、`guessSubject`、`guessGrade`、`guessVersion`、`chaptersToText` 均已定义。

### 逻辑验证（纯函数测试）
提取以下函数到临时测试文件，验证：
1. **extractChaptersFromOutline**：
   - 输入两层书签 `[{title:"第一章 有理数", items:[{title:"正数和负数"},{title:"有理数的加减法"}]}]` → 输出 `[{id:"ch1", title:"第一章 有理数", lessons:["正数和负数","有理数的加减法"]}]`
   - 输入单层书签 `[{title:"观潮"},{title:"走月亮"}]` → 输出 `[{id:"ch1", title:"目录", lessons:["观潮","走月亮"]}]`
   - 输入空书签 `[]` → 输出 `null`
2. **extractChaptersFromToc**：
   - 输入含"目录"页文本（含"第一章 有理数 ……3\n正数和负数 ……4"）→ 输出正确章节结构
   - 输入无"目录"页 → 输出 `null`
3. **guessSubject**：
   - "义务教育教科书·数学（三年级上册）" → "数学"
   - "Unit 1 What's he like?" → "英语"
   - "第一章 机械运动" → "物理"
4. **guessGrade**：
   - "三年级上册" → "三年级"
   - "七年级" → "七年级"
   - "高一" → "高一"
5. **guessVersion**：
   - "人教版" → "人教版"
   - "北师大版" → "北师大版"
   - 无版本信息 → "人教版"（默认）
6. **chaptersToText**：
   - 输入 `[{title:"第一章 有理数", lessons:["正数和负数","有理数的加减法"]}]` → 输出 `"第一章 有理数 | 正数和负数,有理数的加减法"`

### 浏览器手动验证
1. 新建模式下上传一本带书签的教材 PDF（如人教版数学）→ 确认学科、年级、版本、教材名称、章节文本框被自动填充。
2. 上传一本无书签但有目录页的 PDF → 确认章节从目录页文本识别填充。
3. 上传一本既无书签也无清晰目录的 PDF → 确认字段留空（版本默认"人教版"），不报错，用户可手填。
4. 关联模式下上传 PDF → 确认不触发自动填充（章节来自预置教材）。
5. 自动填充后手动修改章节文本框 → 确认修改生效，点"下一步"进入页码映射时使用修改后的结构。

## 六、实施顺序（Todo）

1. app.js: 新增 PDF 元信息识别函数群（extractChaptersFromOutline / extractChaptersFromToc / guessSubject / guessGrade / guessVersion / chaptersToText / autoFillFromPdf）。
2. app.js: handlePdfUpload 文本版成功分支调用 autoFillFromPdf + 状态提示。
3. app.js: handlePdfUpload OCR 版成功分支调用 autoFillFromPdf + 状态提示。
4. 静态检查 + 纯函数逻辑测试。
5. 推送 main。
