// 教材教案生成器 - 前端逻辑
(function () {
  "use strict";

  // 配置 marked
  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
  }

  // ---------- 状态 ----------
  const state = {
    view: "generate", // generate | lessons
    step: 1,
    textbooks: [],
    selectedTextbook: null,
    selectedChapter: null,
    selectedLesson: "",
    currentLessonId: null, // 生成后/查看中的教案 id
    editMode: false,
  };

  // ---------- 工具 ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  async function api(path, options = {}) {
    const opts = Object.assign(
      {
        headers: { "Content-Type": "application/json" },
      },
      options
    );
    if (opts.body && typeof opts.body !== "string") {
      opts.body = JSON.stringify(opts.body);
    }
    const resp = await fetch(path, opts);
    let data;
    try {
      data = await resp.json();
    } catch (e) {
      data = null;
    }
    if (!resp.ok) {
      const msg =
        (data && (data.detail || data.error)) ||
        `请求失败 (${resp.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function toast(msg, type = "") {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast" + (type ? " " + type : "");
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 3000);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ---------- 视图切换 ----------
  function switchView(name) {
    state.view = name;
    $$("#viewGenerate, #viewLessons").forEach((el) => el.classList.remove("active"));
    if (name === "generate") {
      $("#viewGenerate").classList.add("active");
    } else {
      $("#viewLessons").classList.add("active");
      loadLessons();
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

  // ---------- 教材列表 ----------
  async function loadTextbooks() {
    try {
      const list = await api("/api/textbooks");
      state.textbooks = list;
      renderFilters();
      renderTextbooks();
    } catch (e) {
      $("#textbookGrid").innerHTML = `<div class="empty-hint">加载失败：${escapeHtml(e.message)}</div>`;
    }
  }

  function renderFilters() {
    const subjects = [...new Set(state.textbooks.map((t) => t.subject).filter(Boolean))];
    const grades = [...new Set(state.textbooks.map((t) => t.grade).filter(Boolean))];
    const versions = [...new Set(state.textbooks.map((t) => t.version).filter(Boolean))];

    const fillSelect = (sel, items, cur) => {
      const first = sel.options[0].outerHTML;
      sel.innerHTML = first + items
        .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`)
        .join("");
      if (cur) sel.value = cur;
    };
    fillSelect($("#filterSubject"), subjects);
    fillSelect($("#filterGrade"), grades);
    fillSelect($("#filterVersion"), versions);
  }

  function renderTextbooks() {
    const fs = $("#filterSubject").value;
    const fg = $("#filterGrade").value;
    const fv = $("#filterVersion").value;
    const list = state.textbooks.filter(
      (t) =>
        (!fs || t.subject === fs) &&
        (!fg || t.grade === fg) &&
        (!fv || t.version === fv)
    );
    const grid = $("#textbookGrid");
    if (list.length === 0) {
      grid.innerHTML = `<div class="empty-hint">没有符合条件的教材</div>`;
      return;
    }
    grid.innerHTML = list
      .map(
        (t) => `
      <div class="textbook-card" data-id="${escapeHtml(t.id)}">
        <span class="tc-subject">${escapeHtml(t.subject || "教材")}</span>
        <div class="tc-title">${escapeHtml(t.title)}</div>
        <div class="tc-meta">
          ${t.grade ? `<span>${escapeHtml(t.grade)}</span>` : ""}
          ${t.version ? `<span>· ${escapeHtml(t.version)}</span>` : ""}
        </div>
        ${t.custom ? `<div class="tc-badge">自定义</div>` : ""}
      </div>`
      )
      .join("");
    grid.querySelectorAll(".textbook-card").forEach((card) => {
      card.addEventListener("click", () => selectTextbook(card.dataset.id));
    });
  }

  async function selectTextbook(id) {
    try {
      const tb = await api(`/api/textbooks/${encodeURIComponent(id)}`);
      state.selectedTextbook = tb;
      state.selectedChapter = null;
      state.selectedLesson = "";
      $("#tbTitleLabel").textContent = `— ${tb.title}`;
      renderChapters(tb);
      goStep(2);
    } catch (e) {
      toast(`加载教材详情失败：${e.message}`, "error");
    }
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

  async function submitAddTextbook(e) {
    e.preventDefault();
    const chaptersText = $("#atChapters").value.trim();
    const chapters = chaptersText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, lessonsStr] = line.split("|").map((s) => s.trim());
        return {
          title: title || "",
          lessons: (lessonsStr || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
      });
    const payload = {
      subject: $("#atSubject").value.trim(),
      grade: $("#atGrade").value.trim(),
      version: $("#atVersion").value.trim(),
      title: $("#atTitle").value.trim(),
      chapters,
    };
    if (!payload.subject || !payload.grade || !payload.title) {
      toast("请填写必填项", "error");
      return;
    }
    try {
      await api("/api/textbooks", { method: "POST", body: payload });
      toast("教材添加成功", "success");
      closeAddTextbookModal();
      await loadTextbooks();
    } catch (e) {
      toast(`添加失败：${e.message}`, "error");
    }
  }

  // ---------- 生成教案 ----------
  async function submitGenerate(e) {
    e.preventDefault();
    const payload = {
      textbook_id: state.selectedTextbook.id,
      chapter_id: state.selectedChapter ? state.selectedChapter.id : null,
      lesson_title: $("#fLessonTitle").value.trim(),
      duration_minutes: parseInt($("#fDuration").value, 10) || 40,
      student_level: $("#fStudentLevel").value.trim(),
      extra_objectives: $("#fExtraObjectives").value.trim(),
      style: $("#fStyle").value,
    };
    if (!payload.lesson_title) {
      toast("请填写课时名称", "error");
      return;
    }
    $("#genLoading").classList.remove("hidden");
    $("#lessonPreview").classList.add("hidden");
    $("#lessonEditor").classList.add("hidden");
    goStep(4);
    try {
      const result = await api("/api/lessons/generate", {
        method: "POST",
        body: payload,
      });
      if (!result.ok) {
        throw new Error(result.error || "生成失败");
      }
      state.currentLessonId = result.lesson.id;
      renderLessonPreview(result.lesson.content);
      toast("教案生成成功", "success");
    } catch (e) {
      $("#genLoading").classList.add("hidden");
      toast(`生成失败：${e.message}`, "error");
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
    state.editMode = true;
    const md = $("#lessonPreview").innerHTML;
    // 取原始 markdown：通过 fetch 获取最新内容
    api(`/api/lessons/${state.currentLessonId}`)
      .then((lesson) => {
        $("#lessonEditorArea").value = lesson.content || "";
        $("#lessonPreview").classList.add("hidden");
        $("#lessonEditor").classList.remove("hidden");
      })
      .catch((e) => toast(`加载失败：${e.message}`, "error"));
  }

  function exitEditMode() {
    state.editMode = false;
    $("#lessonEditor").classList.add("hidden");
    $("#lessonPreview").classList.remove("hidden");
  }

  async function saveLessonEdit() {
    if (!state.currentLessonId) return;
    const content = $("#lessonEditorArea").value;
    try {
      const updated = await api(`/api/lessons/${state.currentLessonId}`, {
        method: "PUT",
        body: { content },
      });
      renderLessonPreview(updated.content);
      toast("保存成功", "success");
    } catch (e) {
      toast(`保存失败：${e.message}`, "error");
    }
  }

  function downloadMarkdown() {
    if (!state.currentLessonId) return;
    api(`/api/lessons/${state.currentLessonId}`)
      .then((lesson) => {
        const blob = new Blob([lesson.content || ""], {
          type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${lesson.title || "教案"}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch((e) => toast(`下载失败：${e.message}`, "error"));
  }

  function printLesson() {
    window.print();
  }

  // ---------- 我的教案 ----------
  async function loadLessons() {
    const list = $("#lessonsList");
    list.innerHTML = `<div class="empty-hint">加载中…</div>`;
    try {
      const items = await api("/api/lessons");
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
        card
          .querySelector('[data-act="delete"]')
          .addEventListener("click", () => deleteLesson(id));
      });
    } catch (e) {
      list.innerHTML = `<div class="empty-hint">加载失败：${escapeHtml(e.message)}</div>`;
    }
  }

  async function openLesson(id) {
    try {
      const lesson = await api(`/api/lessons/${encodeURIComponent(id)}`);
      state.currentLessonId = lesson.id;
      switchView("generate");
      goStep(4);
      $("#genLoading").classList.add("hidden");
      $("#lessonEditor").classList.add("hidden");
      renderLessonPreview(lesson.content);
    } catch (e) {
      toast(`打开失败：${e.message}`, "error");
    }
  }

  async function deleteLesson(id) {
    if (!confirm("确定删除该教案？此操作不可撤销。")) return;
    try {
      await api(`/api/lessons/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast("已删除", "success");
      loadLessons();
    } catch (e) {
      toast(`删除失败：${e.message}`, "error");
    }
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $("#brandHome").addEventListener("click", () => {
      switchView("generate");
      goStep(1);
    });
    $("#navGenerate").addEventListener("click", () => switchView("generate"));
    $("#navLessons").addEventListener("click", () => switchView("lessons"));

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
    $("#btnNew").addEventListener("click", () => {
      goStep(3);
    });
    $("#refreshLessons").addEventListener("click", loadLessons);
  }

  // ---------- 初始化 ----------
  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadTextbooks();
  });
})();
