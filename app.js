// 教材教案生成器 - 纯前端逻辑（无后端，数据存 localStorage，LLM 直调）
(function () {
  "use strict";

  // 配置 marked
  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
  }

  // ---------- 存储 Key ----------
  const SK = {
    CONFIG: "lp_config", // LLM 配置
    TEXTBOOKS: "lp_textbooks", // 自定义教材
    LESSONS: "lp_lessons", // 生成的教案
  };

  // ---------- 状态 ----------
  const state = {
    view: "generate",
    step: 1,
    textbooks: [], // 预置 + 自定义合并
    selectedTextbook: null,
    selectedChapter: null,
    selectedLesson: "",
    currentLessonId: null,
    editMode: false,
  };

  // ---------- 工具 ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function toast(msg, type = "") {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast" + (type ? " " + type : "");
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 3500);
  }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function uuid(prefix) {
    return `${prefix || "id"}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------- localStorage 读写 ----------
  function lsGet(key, def) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) {
      return def;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      toast("存储失败：可能超出浏览器容量限制", "error");
      return false;
    }
  }

  // ---------- 配置 ----------
  function getConfig() {
    return lsGet(SK.CONFIG, null);
  }

  function saveConfig(cfg) {
    return lsSet(SK.CONFIG, cfg);
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c && c.base_url && c.model && c.api_key);
  }

  function updateSetupBanner() {
    $("#setupBanner").classList.toggle("hidden", isConfigured());
  }

  // ---------- 教材 ----------
  function getAllTextbooks() {
    const custom = lsGet(SK.TEXTBOOKS, []);
    return (window.PRESET_TEXTBOOKS || []).concat(custom);
  }

  function getCustomTextbooks() {
    return lsGet(SK.TEXTBOOKS, []);
  }

  function addCustomTextbook(data) {
    const list = getCustomTextbooks();
    list.push(data);
    lsSet(SK.TEXTBOOKS, list);
  }

  // ---------- 教案 ----------
  function getLessons() {
    return lsGet(SK.LESSONS, []);
  }

  function saveLesson(record) {
    const list = getLessons();
    list.push(record);
    lsSet(SK.LESSONS, list);
  }

  function updateLesson(id, patch) {
    const list = getLessons();
    const idx = list.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    list[idx] = Object.assign({}, list[idx], patch, { updated_at: Date.now() });
    lsSet(SK.LESSONS, list);
    return list[idx];
  }

  function deleteLessonById(id) {
    const list = getLessons();
    const next = list.filter((l) => l.id !== id);
    if (next.length === list.length) return false;
    lsSet(SK.LESSONS, next);
    return true;
  }

  function getLessonById(id) {
    return getLessons().find((l) => l.id === id) || null;
  }

  // ---------- 教案模板与 prompt 构造 ----------
  const LESSON_TEMPLATE = [
    { label: "课题", hint: "本节课的课题名称，可包含教材版本/章节信息" },
    { label: "教学目标", hint: "分三条写出：1. 知识与技能目标；2. 过程与方法目标；3. 情感态度与价值观目标。每条具体、可达成。" },
    { label: "教学重点", hint: "本节课必须掌握的核心内容，1-3 条。" },
    { label: "教学难点", hint: "学生理解或掌握起来较困难的内容，1-2 条，并简要说明突破策略。" },
    { label: "教学准备", hint: "教师准备（教具/课件/挂图等）与学生准备（学具/预习等）。" },
    { label: "教学过程", hint: "按四个环节展开，每个环节标注时间分配，并区分【教师活动】与【学生活动】：（1）导入（约5分钟）；（2）新授（约20分钟）；（3）巩固练习（约10分钟）；（4）课堂小结（约5分钟）。" },
    { label: "板书设计", hint: "简明的板书结构示意，体现本课核心知识点之间的逻辑关系。" },
    { label: "作业布置", hint: "分层作业：基础题（全体）+ 提升题（选做），并注明完成建议。" },
    { label: "教学反思", hint: "（课后填写）" },
  ];

  function buildSystemPrompt() {
    const fields = LESSON_TEMPLATE.map((f) => `- **${f.label}**：${f.hint}`).join("\n");
    return (
      "你是一位经验丰富的中学/小学一线教师与教研专家，擅长编写结构规范、可落地执行的中文教案。\n\n" +
      "请严格按以下模板结构输出一份完整的教案，使用 Markdown 格式。每个字段用二级标题（## 字段名）标注，内容紧随其后。\n\n" +
      `模板字段：\n${fields}\n\n` +
      "要求：\n" +
      "1. 内容紧贴所选教材与课时的实际知识点，避免空泛套话；\n" +
      "2. 教学过程要具体到师生活动，时间分配合理；\n" +
      "3. 语言规范、专业，符合中国中小学教学用语习惯；\n" +
      "4. 教学反思字段留空，写一句\"（课后填写）\"即可；\n" +
      "5. 只输出教案内容本身，不要输出额外解释。"
    );
  }

  function buildUserPrompt(params, textbook, chapter, lessonTitle) {
    const lines = [
      `教材：${textbook.title}（${textbook.subject} · ${textbook.grade} · ${textbook.version}）`,
    ];
    if (chapter) lines.push(`章节：${chapter.title}`);
    lines.push(`课时：${lessonTitle}`);
    lines.push(`课时时长：${params.duration_minutes} 分钟`);
    if (params.student_level) lines.push(`班级学情：${params.student_level}`);
    if (params.extra_objectives) lines.push(`补充教学目标/要求：${params.extra_objectives}`);
    if (params.style) lines.push(`教学风格倾向：${params.style}`);
    lines.push("\n请根据以上信息生成完整教案。");
    return lines.join("\n");
  }

  // ---------- LLM 直调 ----------
  // 错误分类：CORS / 网络 / 鉴权 / 限流 / 其他
  async function callLLM(systemPrompt, userPrompt, onProgress) {
    const cfg = getConfig();
    if (!cfg || !cfg.api_key) {
      throw { type: "config", message: "未配置 API Key，请先到「设置」填写。" };
    }
    const url = cfg.base_url.replace(/\/+$/, "") + "/chat/completions";
    const body = {
      model: cfg.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      stream: false,
    };
    const controller = new AbortController();
    const timeoutMs = (cfg.timeout || 60) * 1000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.api_key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") {
        throw { type: "timeout", message: `请求超时（${cfg.timeout || 60}s）。模型响应较慢，可尝试增加超时时间。` };
      }
      // 大概率是 CORS 或网络不通
      throw {
        type: "network_or_cors",
        message:
          "请求失败。最常见原因：1) CORS 跨域被拦截（该 LLM 服务不允许浏览器直调）；2) 网络不通。建议：换用支持浏览器 CORS 的服务（如 OpenAI），或自建 Cloudflare Worker 代理。",
        raw: e.message,
      };
    }
    clearTimeout(timer);

    if (!resp.ok) {
      let detail = "";
      try {
        const err = await resp.json();
        detail = err.error?.message || err.error || err.detail || JSON.stringify(err);
      } catch (e) {
        detail = await resp.text().catch(() => "");
      }
      if (resp.status === 401 || resp.status === 403) {
        throw { type: "auth", message: `鉴权失败（${resp.status}）：API Key 无效或权限不足。${detail}` };
      }
      if (resp.status === 429) {
        throw { type: "rate_limit", message: `触发限流（429）：请求过于频繁或额度用尽。${detail}` };
      }
      throw { type: "http", message: `服务返回错误（${resp.status}）：${detail}` };
    }

    let data;
    try {
      data = await resp.json();
    } catch (e) {
      throw { type: "parse", message: "响应解析失败：服务返回了非 JSON 内容。" };
    }
    const content = data?.choices?.[0]?.message?.content || "";
    if (!content) {
      throw { type: "empty", message: "模型返回了空内容，请重试。" };
    }
    return content.trim();
  }

  // ---------- 视图切换 ----------
  function switchView(name) {
    state.view = name;
    $$("#viewGenerate, #viewLessons").forEach((el) => el.classList.remove("active"));
    if (name === "generate") {
      $("#viewGenerate").classList.add("active");
    } else {
      $("#viewLessons").classList.add("active");
      renderLessons();
    }
  }

  function goStep(step) {
    state.step = step;
    $$(".step").forEach((el) => {
      const n = parseInt(el.dataset.step, 10);
      el.classList.toggle("active", n === step);
      el.classList.toggle("done", n < step);
    });
    $$(".step-panel").forEach((el) => el.classList.add("hidden"));
    $(`#panel${step}`).classList.remove("hidden");
  }

  // ---------- 教材渲染 ----------
  function loadTextbooks() {
    state.textbooks = getAllTextbooks();
    renderFilters();
    renderTextbooks();
  }

  function renderFilters() {
    const list = state.textbooks;
    const subjects = [...new Set(list.map((t) => t.subject).filter(Boolean))];
    const grades = [...new Set(list.map((t) => t.grade).filter(Boolean))];
    const versions = [...new Set(list.map((t) => t.version).filter(Boolean))];
    const fill = (sel, items) => {
      const first = sel.options[0].outerHTML;
      sel.innerHTML = first + items.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    };
    fill($("#filterSubject"), subjects);
    fill($("#filterGrade"), grades);
    fill($("#filterVersion"), versions);
  }

  function renderTextbooks() {
    const fs = $("#filterSubject").value;
    const fg = $("#filterGrade").value;
    const fv = $("#filterVersion").value;
    const presetIds = new Set((window.PRESET_TEXTBOOKS || []).map((t) => t.id));
    const list = state.textbooks.filter(
      (t) => (!fs || t.subject === fs) && (!fg || t.grade === fg) && (!fv || t.version === fv)
    );
    const grid = $("#textbookGrid");
    if (list.length === 0) {
      grid.innerHTML = `<div class="empty-hint">没有符合条件的教材</div>`;
      return;
    }
    grid.innerHTML = list
      .map((t) => {
        const isCustom = !presetIds.has(t.id);
        return `
        <div class="textbook-card" data-id="${escapeHtml(t.id)}">
          <span class="tc-subject">${escapeHtml(t.subject || "教材")}</span>
          <div class="tc-title">${escapeHtml(t.title)}</div>
          <div class="tc-meta">
            ${t.grade ? `<span>${escapeHtml(t.grade)}</span>` : ""}
            ${t.version ? `<span>· ${escapeHtml(t.version)}</span>` : ""}
          </div>
          ${isCustom ? `<div class="tc-badge">自定义</div>` : ""}
        </div>`;
      })
      .join("");
    grid.querySelectorAll(".textbook-card").forEach((card) => {
      card.addEventListener("click", () => selectTextbook(card.dataset.id));
    });
  }

  function selectTextbook(id) {
    const tb = state.textbooks.find((t) => t.id === id);
    if (!tb) {
      toast("教材不存在", "error");
      return;
    }
    state.selectedTextbook = tb;
    state.selectedChapter = null;
    state.selectedLesson = "";
    $("#tbTitleLabel").textContent = `— ${tb.title}`;
    renderChapters(tb);
    goStep(2);
  }

  function renderChapters(tb) {
    const tree = $("#chapterTree");
    const chapters = tb.chapters || [];
    if (chapters.length === 0) {
      tree.innerHTML = `<div class="empty-hint">该教材暂无章节信息</div>`;
      return;
    }
    tree.innerHTML = chapters
      .map(
        (ch) => `
      <div class="chapter-item">
        <div class="ch-title">${escapeHtml(ch.title)}</div>
        <div class="lessons-list-inline">
          ${(ch.lessons || [])
            .map(
              (ln) => `
            <div class="lesson-item" data-ch="${escapeHtml(ch.id)}" data-lesson="${escapeHtml(ln)}">
              <span class="li-icon">▸</span><span>${escapeHtml(ln)}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>`
      )
      .join("");
    tree.querySelectorAll(".lesson-item").forEach((el) => {
      el.addEventListener("click", () => {
        const chId = el.dataset.ch;
        const lesson = el.dataset.lesson;
        const ch = chapters.find((c) => c.id === chId);
        state.selectedChapter = ch;
        state.selectedLesson = lesson;
        $("#lessonPathLabel").textContent = `— ${ch.title} / ${lesson}`;
        $("#fLessonTitle").value = lesson;
        goStep(3);
      });
    });
  }

  // ---------- 添加教材 ----------
  function openAddTextbookModal() {
    $("#modalAddTextbook").classList.remove("hidden");
  }
  function closeAddTextbookModal() {
    $("#modalAddTextbook").classList.add("hidden");
    $("#addTextbookForm").reset();
  }

  function submitAddTextbook(e) {
    e.preventDefault();
    const chaptersText = $("#atChapters").value.trim();
    const chapters = chaptersText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const [title, lessonsStr] = line.split("|").map((s) => s.trim());
        return {
          id: `ch${idx + 1}`,
          title: title || "",
          lessons: (lessonsStr || "").split(",").map((s) => s.trim()).filter(Boolean),
        };
      });
    const data = {
      id: uuid("custom"),
      subject: $("#atSubject").value.trim(),
      grade: $("#atGrade").value.trim(),
      version: $("#atVersion").value.trim(),
      title: $("#atTitle").value.trim(),
      chapters,
    };
    if (!data.subject || !data.grade || !data.title) {
      toast("请填写必填项", "error");
      return;
    }
    addCustomTextbook(data);
    toast("教材添加成功", "success");
    closeAddTextbookModal();
    loadTextbooks();
  }

  // ---------- 生成教案 ----------
  async function submitGenerate(e) {
    e.preventDefault();
    if (!isConfigured()) {
      toast("请先在「设置」中配置 LLM API", "error");
      openSettingsModal();
      return;
    }
    const params = {
      textbook_id: state.selectedTextbook.id,
      chapter_id: state.selectedChapter ? state.selectedChapter.id : null,
      lesson_title: $("#fLessonTitle").value.trim(),
      duration_minutes: parseInt($("#fDuration").value, 10) || 40,
      student_level: $("#fStudentLevel").value.trim(),
      extra_objectives: $("#fExtraObjectives").value.trim(),
      style: $("#fStyle").value,
    };
    if (!params.lesson_title) {
      toast("请填写课时名称", "error");
      return;
    }
    $("#genLoading").classList.remove("hidden");
    $("#lessonPreview").classList.add("hidden");
    $("#lessonEditor").classList.add("hidden");
    goStep(4);
    try {
      const sys = buildSystemPrompt();
      const user = buildUserPrompt(params, state.selectedTextbook, state.selectedChapter, params.lesson_title);
      const content = await callLLM(sys, user);
      const now = Date.now();
      const record = {
        id: uuid("lesson"),
        title: `${state.selectedTextbook.subject}·${params.lesson_title} 教案`,
        textbook_id: params.textbook_id,
        textbook_title: state.selectedTextbook.title,
        chapter_title: state.selectedChapter ? state.selectedChapter.title : "",
        lesson_title: params.lesson_title,
        content,
        params,
        created_at: now,
        updated_at: now,
      };
      saveLesson(record);
      state.currentLessonId = record.id;
      renderLessonPreview(content);
      toast("教案生成成功", "success");
    } catch (e) {
      $("#genLoading").classList.add("hidden");
      const msg = e?.message || String(e);
      toast(msg, "error");
      console.error("[generate error]", e);
    }
  }

  function renderLessonPreview(markdown) {
    $("#genLoading").classList.add("hidden");
    const html = window.marked ? marked.parse(markdown) : `<pre>${escapeHtml(markdown)}</pre>`;
    $("#lessonPreview").innerHTML = html;
    $("#lessonPreview").classList.remove("hidden");
    state.editMode = false;
  }

  function enterEditMode() {
    if (!state.currentLessonId) return;
    const lesson = getLessonById(state.currentLessonId);
    if (!lesson) return;
    state.editMode = true;
    $("#lessonEditorArea").value = lesson.content || "";
    $("#lessonPreview").classList.add("hidden");
    $("#lessonEditor").classList.remove("hidden");
  }

  function exitEditMode() {
    state.editMode = false;
    $("#lessonEditor").classList.add("hidden");
    $("#lessonPreview").classList.remove("hidden");
  }

  function saveLessonEdit() {
    if (!state.currentLessonId) return;
    const content = $("#lessonEditorArea").value;
    const updated = updateLesson(state.currentLessonId, { content });
    if (updated) {
      renderLessonPreview(updated.content);
      toast("保存成功", "success");
    } else {
      toast("保存失败：教案不存在", "error");
    }
  }

  function downloadMarkdown() {
    if (!state.currentLessonId) return;
    const lesson = getLessonById(state.currentLessonId);
    if (!lesson) return;
    const blob = new Blob([lesson.content || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lesson.title || "教案"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function printLesson() {
    window.print();
  }

  // ---------- 我的教案 ----------
  function renderLessons() {
    const list = $("#lessonsList");
    const items = getLessons().slice().sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    if (items.length === 0) {
      list.innerHTML = `<div class="empty-hint">还没有教案，去生成一份吧～</div>`;
      return;
    }
    list.innerHTML = items
      .map(
        (ls) => `
      <div class="lesson-card" data-id="${escapeHtml(ls.id)}">
        <div class="lc-info">
          <div class="lc-title">${escapeHtml(ls.title)}</div>
          <div class="lc-meta">
            ${ls.textbook_title ? escapeHtml(ls.textbook_title) : ""}
            ${ls.lesson_title ? ` · ${escapeHtml(ls.lesson_title)}` : ""}
            ${ls.updated_at ? ` · 更新于 ${formatTime(ls.updated_at)}` : ""}
          </div>
        </div>
        <div class="lc-actions">
          <button class="btn btn-ghost" data-act="open">查看</button>
          <button class="btn btn-ghost btn-danger" data-act="delete">删除</button>
        </div>
      </div>`
      )
      .join("");
    list.querySelectorAll(".lesson-card").forEach((card) => {
      const id = card.dataset.id;
      card.querySelector('[data-act="open"]').addEventListener("click", () => openLesson(id));
      card.querySelector('[data-act="delete"]').addEventListener("click", () => deleteLesson(id));
    });
  }

  function openLesson(id) {
    const lesson = getLessonById(id);
    if (!lesson) {
      toast("教案不存在", "error");
      return;
    }
    state.currentLessonId = lesson.id;
    switchView("generate");
    goStep(4);
    $("#genLoading").classList.add("hidden");
    $("#lessonEditor").classList.add("hidden");
    renderLessonPreview(lesson.content);
  }

  function deleteLesson(id) {
    if (!confirm("确定删除该教案？此操作不可撤销。")) return;
    if (deleteLessonById(id)) {
      toast("已删除", "success");
      renderLessons();
    } else {
      toast("删除失败", "error");
    }
  }

  // ---------- 设置弹窗 ----------
  function openSettingsModal() {
    fillPresets();
    const cfg = getConfig();
    if (cfg) {
      $("#sBaseUrl").value = cfg.base_url || "";
      $("#sModel").value = cfg.model || "";
      $("#sApiKey").value = cfg.api_key || "";
      $("#sTimeout").value = cfg.timeout || 60;
      // 反查预设
      const presetSel = $("#sPreset");
      let matched = false;
      for (const opt of presetSel.options) {
        if (opt.dataset.base === cfg.base_url) {
          presetSel.value = opt.value;
          matched = true;
          break;
        }
      }
      if (!matched) presetSel.value = "自定义";
      onPresetChange();
    } else {
      // 默认选第一个预设
      $("#sPreset").value = (window.LLM_PRESETS || [])[0]?.name || "";
      onPresetChange();
    }
    $("#testResult").textContent = "";
    $("#modalSettings").classList.remove("hidden");
  }

  function closeSettingsModal() {
    $("#modalSettings").classList.add("hidden");
  }

  function fillPresets() {
    const sel = $("#sPreset");
    const presets = window.LLM_PRESETS || [];
    sel.innerHTML = presets
      .map((p) => `<option value="${escapeHtml(p.name)}" data-base="${escapeHtml(p.base_url)}">${escapeHtml(p.name)}</option>`)
      .join("");
  }

  function onPresetChange() {
    const name = $("#sPreset").value;
    const preset = (window.LLM_PRESETS || []).find((p) => p.name === name);
    if (!preset) return;
    // 仅在用户切换预设时填充空字段，避免覆盖已输入内容
    if (preset.base_url && !$("#sBaseUrl").value) $("#sBaseUrl").value = preset.base_url;
    if (preset.model && !$("#sModel").value) $("#sModel").value = preset.model;
    $("#presetNote").textContent = preset.note || "";
    if (preset.key_url) {
      $("#keyUrlHint").innerHTML = `申请 Key：<a href="${escapeHtml(preset.key_url)}" target="_blank" rel="noopener">${escapeHtml(preset.key_url)}</a>`;
    } else {
      $("#keyUrlHint").textContent = "";
    }
  }

  function applyPresetFully() {
    // 用户主动选预设时，强制覆盖 base_url 和 model
    const name = $("#sPreset").value;
    const preset = (window.LLM_PRESETS || []).find((p) => p.name === name);
    if (!preset) return;
    if (preset.name !== "自定义") {
      $("#sBaseUrl").value = preset.base_url || "";
      $("#sModel").value = preset.model || "";
    }
    $("#presetNote").textContent = preset.note || "";
    if (preset.key_url) {
      $("#keyUrlHint").innerHTML = `申请 Key：<a href="${escapeHtml(preset.key_url)}" target="_blank" rel="noopener">${escapeHtml(preset.key_url)}</a>`;
    } else {
      $("#keyUrlHint").textContent = "";
    }
  }

  function saveSettings(e) {
    e.preventDefault();
    const cfg = {
      base_url: $("#sBaseUrl").value.trim().replace(/\/+$/, ""),
      model: $("#sModel").value.trim(),
      api_key: $("#sApiKey").value.trim(),
      timeout: parseInt($("#sTimeout").value, 10) || 60,
    };
    if (!cfg.base_url || !cfg.model || !cfg.api_key) {
      toast("请填写完整：Base URL / 模型 / API Key", "error");
      return;
    }
    if (saveConfig(cfg)) {
      toast("设置已保存", "success");
      updateSetupBanner();
      closeSettingsModal();
    }
  }

  async function testConnection() {
    const cfg = {
      base_url: $("#sBaseUrl").value.trim().replace(/\/+$/, ""),
      model: $("#sModel").value.trim(),
      api_key: $("#sApiKey").value.trim(),
      timeout: parseInt($("#sTimeout").value, 10) || 60,
    };
    if (!cfg.base_url || !cfg.model || !cfg.api_key) {
      $("#testResult").textContent = "请先填写完整配置。";
      $("#testResult").className = "hint-line error-text";
      return;
    }
    const result = $("#testResult");
    result.textContent = "测试中…";
    result.className = "hint-line";
    try {
      const content = await callLLM(
        "你是一个测试助手。",
        "请回复「连接成功」四个字。"
      );
      result.textContent = `✓ 连接成功。模型返回：${content.slice(0, 50)}`;
      result.className = "hint-line success-text";
    } catch (e) {
      let hint = "";
      if (e.type === "network_or_cors") {
        hint = "（很可能是 CORS 跨域拦截，建议换用支持浏览器调用的服务，或自建 Cloudflare Worker 代理）";
      } else if (e.type === "auth") {
        hint = "（请检查 API Key 是否正确）";
      }
      result.textContent = `✗ ${e.message || e} ${hint}`;
      result.className = "hint-line error-text";
    }
  }

  // ---------- 数据导入导出 ----------
  function exportAllData() {
    const data = {
      version: 1,
      exported_at: new Date().toISOString(),
      config: getConfig(),
      textbooks: getCustomTextbooks(),
      lessons: getLessons(),
    };
    // 导出时包含 api_key 便于迁移，但用户需自行保管文件
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lesson-plan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("已导出（含 API Key，请妥善保管文件）", "success");
  }

  function triggerImport() {
    $("#importFileInput").click();
  }

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || typeof data !== "object") throw new Error("文件格式不正确");
        let merged = 0;
        if (Array.isArray(data.textbooks)) {
          const cur = getCustomTextbooks();
          data.textbooks.forEach((tb) => {
            if (tb && tb.id && !cur.find((t) => t.id === tb.id)) {
              cur.push(tb);
              merged++;
            }
          });
          lsSet(SK.TEXTBOOKS, cur);
        }
        if (Array.isArray(data.lessons)) {
          const cur = getLessons();
          data.lessons.forEach((ls) => {
            if (ls && ls.id && !cur.find((l) => l.id === ls.id)) {
              cur.push(ls);
              merged++;
            }
          });
          lsSet(SK.LESSONS, cur);
        }
        if (data.config && data.config.base_url) {
          if (!isConfigured() || confirm("是否覆盖当前 LLM 配置？")) {
            saveConfig(data.config);
            updateSetupBanner();
          }
        }
        toast(`导入完成，新增 ${merged} 条记录`, "success");
        loadTextbooks();
        if (state.view === "lessons") renderLessons();
      } catch (err) {
        toast(`导入失败：${err.message}`, "error");
      }
      $("#importFileInput").value = "";
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!confirm("将清空所有自定义教材、教案和 LLM 配置。此操作不可撤销，建议先导出备份。继续？")) return;
    if (!confirm("再次确认：真的要清空所有数据吗？")) return;
    localStorage.removeItem(SK.CONFIG);
    localStorage.removeItem(SK.TEXTBOOKS);
    localStorage.removeItem(SK.LESSONS);
    toast("已清空所有数据", "success");
    updateSetupBanner();
    loadTextbooks();
    closeSettingsModal();
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $("#brandHome").addEventListener("click", () => {
      switchView("generate");
      goStep(1);
    });
    $("#navGenerate").addEventListener("click", () => switchView("generate"));
    $("#navLessons").addEventListener("click", () => switchView("lessons"));
    $("#navSettings").addEventListener("click", openSettingsModal);
    $("#bannerSetup").addEventListener("click", openSettingsModal);

    $("#btnAddTextbook").addEventListener("click", openAddTextbookModal);
    $("#closeModal").addEventListener("click", closeAddTextbookModal);
    $("#cancelAddTextbook").addEventListener("click", closeAddTextbookModal);
    $("#addTextbookForm").addEventListener("submit", submitAddTextbook);
    $("#modalAddTextbook").addEventListener("click", (e) => {
      if (e.target.id === "modalAddTextbook") closeAddTextbookModal();
    });

    ["#filterSubject", "#filterGrade", "#filterVersion"].forEach((sel) => {
      $(sel).addEventListener("change", renderTextbooks);
    });

    $("#backTo1").addEventListener("click", () => goStep(1));
    $("#backTo2").addEventListener("click", () => goStep(2));
    $("#genForm").addEventListener("submit", submitGenerate);

    $("#btnEdit").addEventListener("click", enterEditMode);
    $("#btnPreview").addEventListener("click", exitEditMode);
    $("#btnSaveLesson").addEventListener("click", saveLessonEdit);
    $("#btnCancelEdit").addEventListener("click", exitEditMode);
    $("#btnDownloadMd").addEventListener("click", downloadMarkdown);
    $("#btnPrint").addEventListener("click", printLesson);
    $("#btnNew").addEventListener("click", () => goStep(3));

    // 设置弹窗
    $("#closeSettings").addEventListener("click", closeSettingsModal);
    $("#modalSettings").addEventListener("click", (e) => {
      if (e.target.id === "modalSettings") closeSettingsModal();
    });
    $("#sPreset").addEventListener("change", applyPresetFully);
    $("#settingsForm").addEventListener("submit", saveSettings);
    $("#btnTestConnection").addEventListener("click", testConnection);

    // 数据管理
    $("#btnExportData").addEventListener("click", exportAllData);
    $("#btnExportAll").addEventListener("click", exportAllData);
    $("#btnImport").addEventListener("click", triggerImport);
    $("#importFileInput").addEventListener("change", handleImport);
    $("#btnClearData").addEventListener("click", clearAllData);
  }

  // ---------- 初始化 ----------
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    updateSetupBanner();
    loadTextbooks();
  });
})();
