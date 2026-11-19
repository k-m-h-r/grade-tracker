const MISTAKE_TAGS = ["計算ミス", "時間不足", "暗記抜け", "読解ミス", "応用力"];

const PRESETS = {
  regular5: ["英語", "数学", "国語", "理科", "社会"],
  regular9: ["英語", "数学", "国語", "理科", "社会", "音楽", "美術", "保健体育", "技術・家庭"],
  science: ["英語", "数学", "物理", "化学", "国語"]
};

let records = [];
let simWeights = {};
let simTargets = {};
let selectedChartSubject = "ALL";
let editingRecordId = null;
let lastDeletedRecord = null;
let toastTimer = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  records = StorageManager.loadRecords();
  initInputForm();
  bindEvents();
  refreshAll();
});

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tabName}`);
  });
  refreshCharts();
}

function showToast(message, canUndo = false) {
  const bar = document.getElementById("toast-bar");
  const msgEl = document.getElementById("toast-message");
  const undoBtn = document.getElementById("btn-toast-undo");
  if (!bar || !msgEl || !undoBtn) return;

  msgEl.textContent = message;
  undoBtn.classList.toggle("hidden", !canUndo);
  bar.classList.remove("hidden");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    bar.classList.add("hidden");
    if (canUndo) lastDeletedRecord = null;
  }, canUndo ? 8000 : 3500);
}

function bindEvents() {
  // タブ切り替え
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  // プライバシーぼかし切替
  document.getElementById("btn-privacy").addEventListener("click", (e) => {
    document.body.classList.toggle("privacy-mode");
    const isHidden = document.body.classList.contains("privacy-mode");
    e.currentTarget.textContent = isHidden ? "🙈 表示" : "👁️‍🗨️ 隠す";
  });

  // ダーク/ライトテーマ切替
  document.getElementById("btn-theme").addEventListener("click", () => {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    refreshCharts();
  });

  // JSONエクスポート / インポート
  document.getElementById("btn-export").addEventListener("click", () => {
    StorageManager.exportJSON();
  });

  document.getElementById("input-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      records = await StorageManager.importJSON(file);
      cancelEditMode(true);
      refreshAll();
      showToast("JSONデータを復元しました！");
    } catch (err) {
      alert("読み込みエラー: " + err.message);
    }
    e.target.value = "";
  });

  // サンプルリセット
  document.getElementById("btn-clear-sample").addEventListener("click", () => {
    if (confirm("データを初期サンプル状態に戻しますか？")) {
      records = StorageManager.resetToSample();
      cancelEditMode(true);
      refreshAll();
      showToast("サンプルデータに初期化しました");
    }
  });

  // 全データ消去
  document.getElementById("btn-clear-all").addEventListener("click", () => {
    if (!records.length) {
      alert("消去するテストデータがありません。");
      return;
    }
    if (confirm("記録されているすべてのテストデータを消去しますか？\n（※必要な場合は先に「💾 保存」でバックアップしてください）")) {
      records = StorageManager.clearAllRecords();
      lastDeletedRecord = null;
      cancelEditMode(true);
      refreshAll();
      showToast("すべてのテストデータを消去しました");
    }
  });

  // 削除取り消し（Undo）
  document.getElementById("btn-toast-undo").addEventListener("click", () => {
    if (!lastDeletedRecord) return;
    records = StorageManager.addRecord(lastDeletedRecord);
    const restoredName = lastDeletedRecord.name;
    lastDeletedRecord = null;
    refreshAll();
    showToast(`「${restoredName}」を復元しました`);
  });

  // 編集キャンセルボタン（上部・下部）
  document.getElementById("btn-cancel-edit").addEventListener("click", () => {
    cancelEditMode(true);
    showToast("編集をキャンセルしました");
  });
  document.getElementById("btn-cancel-edit-bottom").addEventListener("click", () => {
    cancelEditMode(true);
    showToast("編集をキャンセルしました");
  });

  // 推移グラフ指標切替
  document.getElementById("trend-metric-select").addEventListener("change", (e) => {
    ChartManager.renderTrendChart(records, e.target.value);
  });

  // 教科別グラフドロップダウン切替
  document.getElementById("subject-chart-select").addEventListener("change", (e) => {
    setSelectedChartSubject(e.target.value);
  });

  // テスト平均点直接入力時のリアルタイム更新
  document.getElementById("test-avg").addEventListener("input", updateLiveSummary);

  // プリセットボタン
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = PRESETS[btn.dataset.preset] || [];
      renderSubjectInputRows(
        list.map((name) => ({ name, score: "", classAvg: "", maxScore: 100, studyHours: 0, mistakes: [] }))
      );
    });
  });

  // 科目追加ボタン
  document.getElementById("btn-add-subject").addEventListener("click", () => {
    appendSubjectRow({ name: "", score: "", classAvg: "", maxScore: 100, studyHours: 0, mistakes: [] });
  });

  // 成績保存ボタン
  document.getElementById("btn-save-test").addEventListener("click", handleSaveTest);

  // シミュレーター目標平均入力
  document.getElementById("sim-target-avg").addEventListener("input", renderSimulator);

  // モーダル閉じる＆画像保存
  document.getElementById("btn-close-modal").addEventListener("click", () => {
    document.getElementById("modal-result").classList.add("hidden");
  });

  document.getElementById("btn-download-card").addEventListener("click", () => {
    const canvas = document.getElementById("result-card-canvas");
    const link = document.createElement("a");
    link.download = `result-card-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

function getAllSubjectNames() {
  const names = [];
  records.forEach((r) => {
    r.subjects.forEach((s) => {
      if (s.name && !names.includes(s.name)) names.push(s.name);
    });
  });
  return names;
}

function setSelectedChartSubject(subj) {
  selectedChartSubject = subj;
  renderSubjectChartControls();
  ChartManager.renderSubjectTrendChart(records, selectedChartSubject);
  // マスタリーカードの選択状態も同期
  document.querySelectorAll(".subj-lv-item").forEach((el) => {
    el.classList.toggle("selected", el.dataset.subject === selectedChartSubject);
  });
}

function renderSubjectChartControls() {
  const subjectNames = getAllSubjectNames();
  if (selectedChartSubject !== "ALL" && !subjectNames.includes(selectedChartSubject)) {
    selectedChartSubject = "ALL";
  }

  // ドロップダウン更新
  const selectEl = document.getElementById("subject-chart-select");
  if (selectEl) {
    selectEl.innerHTML =
      `<option value="ALL">全教科まとめて比較</option>` +
      subjectNames
        .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} の推移</option>`)
        .join("");
    selectEl.value = selectedChartSubject;
  }

  // クイック切り替えチップ更新
  const chipsEl = document.getElementById("subject-chart-chips");
  if (chipsEl) {
    chipsEl.innerHTML = "";
    const options = [{ value: "ALL", label: "全教科比較" }].concat(
      subjectNames.map((name) => ({ value: name, label: name }))
    );

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `chip-btn ${selectedChartSubject === opt.value ? "active" : ""}`;
      btn.textContent = opt.label;
      btn.addEventListener("click", () => setSelectedChartSubject(opt.value));
      chipsEl.appendChild(btn);
    });
  }

  updateSubjectChartStats();
}

function updateSubjectChartStats() {
  const statsEl = document.getElementById("subject-chart-stats");
  if (!statsEl) return;

  if (!records.length) {
    statsEl.innerHTML = `<span>テストを記録すると教科ごとの統計が表示されます。</span>`;
    return;
  }

  if (selectedChartSubject === "ALL") {
    const subjectNames = getAllSubjectNames();
    let bestSubj = null;
    let bestAvg = -1;
    subjectNames.forEach((name) => {
      let sum = 0;
      let cnt = 0;
      records.forEach((r) => {
        const found = r.subjects.find((s) => s.name === name);
        if (found && found.maxScore > 0) {
          sum += (found.score / found.maxScore) * 100;
          cnt++;
        }
      });
      if (cnt > 0 && sum / cnt > bestAvg) {
        bestAvg = sum / cnt;
        bestSubj = name;
      }
    });

    statsEl.innerHTML = `
      <div>登録教科数: <strong>${subjectNames.length}教科</strong></div>
      ${
        bestSubj
          ? `<div>平均トップ教科: <strong>${escapeHtml(bestSubj)}</strong> (<strong class="sensitive">${bestAvg.toFixed(1)}点</strong>)</div>`
          : ""
      }
      <div>※ 各教科をタップすると「教科平均点」「学習時間(h)」との詳細比較に切り替わります</div>
    `;
    return;
  }

  let normSum = 0;
  let count = 0;
  let bestScore = 0;
  let totalHours = 0;
  let diffSum = 0;
  let diffCount = 0;

  records.forEach((r) => {
    const found = r.subjects.find((s) => s.name === selectedChartSubject);
    if (found && found.maxScore > 0) {
      const norm = (found.score / found.maxScore) * 100;
      normSum += norm;
      count++;
      if (norm > bestScore) bestScore = norm;
      totalHours += Number(found.studyHours) || 0;

      if (found.classAvg !== null && found.classAvg !== undefined && found.classAvg !== "") {
        const cNorm = (Number(found.classAvg) / found.maxScore) * 100;
        diffSum += norm - cNorm;
        diffCount++;
      }
    }
  });

  const avg = count > 0 ? (normSum / count).toFixed(1) : "--";
  const avgDiffHtml =
    diffCount > 0
      ? (() => {
          const d = Number((diffSum / diffCount).toFixed(1));
          const sign = d >= 0 ? "+" : "";
          return `<div>教科平均との平均差: <strong class="sensitive">${sign}${d}点</strong></div>`;
        })()
      : "";

  statsEl.innerHTML = `
    <div>選択教科: <strong>${escapeHtml(selectedChartSubject)}</strong> (${count}回分)</div>
    <div>平均点(換算): <strong class="sensitive">${avg}点</strong></div>
    <div>自己ベスト: <strong class="sensitive">${Math.round(bestScore)}点</strong></div>
    ${avgDiffHtml}
    <div>累計学習: <strong>${totalHours.toFixed(1)}h</strong></div>
  `;
}

function initInputForm() {
  document.getElementById("test-name").value = "";
  document.getElementById("test-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("test-type").value = "定期考査";
  document.getElementById("test-goal").value = 80;
  document.getElementById("test-avg").value = "";
  document.getElementById("test-memo").value = "";
  renderSubjectInputRows(
    PRESETS.science.map((name) => ({ name, score: "", classAvg: "", maxScore: 100, studyHours: 0, mistakes: [] }))
  );
}

function startEditRecord(rec) {
  editingRecordId = rec.id;
  document.getElementById("input-form-title").textContent = "✏️ テスト成績の編集";
  document.getElementById("editing-test-title").textContent = rec.name;
  document.getElementById("edit-mode-banner").classList.remove("hidden");
  document.getElementById("btn-cancel-edit-bottom").classList.remove("hidden");
  document.getElementById("btn-save-test").textContent = "💾 変更を保存する";

  document.getElementById("test-name").value = rec.name || "";
  document.getElementById("test-date").value = rec.date || new Date().toISOString().slice(0, 10);
  document.getElementById("test-type").value = rec.type || "定期考査";
  document.getElementById("test-goal").value = rec.goalAvg ?? 80;
  document.getElementById("test-avg").value = rec.testAvg ?? "";
  document.getElementById("test-memo").value = rec.memo || "";

  const clonedSubjects = (rec.subjects || []).map((s) => ({
    name: s.name || "",
    score: s.score ?? "",
    classAvg: s.classAvg ?? "",
    maxScore: s.maxScore || 100,
    studyHours: s.studyHours || 0,
    mistakes: Array.isArray(s.mistakes) ? [...s.mistakes] : []
  }));
  renderSubjectInputRows(clonedSubjects);

  switchTab("input");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function duplicateRecordToForm(rec) {
  cancelEditMode(false);
  document.getElementById("test-name").value = `${rec.name} (コピー)`;
  document.getElementById("test-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("test-type").value = rec.type || "定期考査";
  document.getElementById("test-goal").value = rec.goalAvg ?? 80;
  document.getElementById("test-avg").value = "";
  document.getElementById("test-memo").value = "";

  const templateSubjects = (rec.subjects || []).map((s) => ({
    name: s.name || "",
    score: "",
    classAvg: "",
    maxScore: s.maxScore || 100,
    studyHours: 0,
    mistakes: []
  }));
  renderSubjectInputRows(templateSubjects);

  switchTab("input");
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast(`「${rec.name}」の教科構成をコピーしました`);
}

function cancelEditMode(resetForm = true) {
  editingRecordId = null;
  document.getElementById("input-form-title").textContent = "⚡ テスト成績の記録";
  document.getElementById("edit-mode-banner").classList.add("hidden");
  document.getElementById("btn-cancel-edit-bottom").classList.add("hidden");
  document.getElementById("btn-save-test").textContent = "✅ この成績を保存する";
  if (resetForm) {
    initInputForm();
  }
}

function renderSubjectInputRows(subjects) {
  const tbody = document.getElementById("score-input-tbody");
  tbody.innerHTML = "";
  subjects.forEach((s) => appendSubjectRow(s));
  updateLiveSummary();
}

function appendSubjectRow(subj) {
  const tbody = document.getElementById("score-input-tbody");
  const tr = document.createElement("tr");

  const chipsHtml = MISTAKE_TAGS.map(
    (tag) => `<span class="m-chip ${(subj.mistakes || []).includes(tag) ? "selected" : ""}" data-tag="${tag}">${tag}</span>`
  ).join("");

  tr.innerHTML = `
    <td><input type="text" class="inp-name" value="${escapeHtml(subj.name)}" placeholder="教科名" /></td>
    <td><input type="number" class="inp-score" value="${escapeHtml(subj.score)}" min="0" max="1000" placeholder="得点" /></td>
    <td><input type="number" class="inp-class-avg" value="${escapeHtml(subj.classAvg ?? "")}" min="0" max="1000" step="0.1" placeholder="任意" /></td>
    <td><input type="number" class="inp-max" value="${escapeHtml(subj.maxScore || 100)}" min="1" max="1000" /></td>
    <td><input type="number" class="inp-hours" value="${escapeHtml(subj.studyHours || 0)}" min="0" max="500" step="0.5" /></td>
    <td><div class="mistake-chips">${chipsHtml}</div></td>
    <td><button type="button" class="icon-btn btn-del-row" title="行削除">✕</button></td>
  `;

  // 失点タグのトグル
  tr.querySelectorAll(".m-chip").forEach((chip) => {
    chip.addEventListener("click", () => chip.classList.toggle("selected"));
  });

  // リアルタイム計算更新
  tr.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", updateLiveSummary);
  });

  // Enterキーで次の行の点数欄へフォーカス移動（爆速入力）
  const scoreInput = tr.querySelector(".inp-score");
  scoreInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const allScores = Array.from(document.querySelectorAll(".inp-score"));
      const idx = allScores.indexOf(e.target);
      if (idx >= 0 && idx < allScores.length - 1) {
        allScores[idx + 1].focus();
        allScores[idx + 1].select();
      }
    }
  });

  tr.querySelector(".btn-del-row").addEventListener("click", () => {
    tr.remove();
    updateLiveSummary();
  });

  tbody.appendChild(tr);
}

function collectInputSubjects(includeEmptyScore = false) {
  const rows = Array.from(document.querySelectorAll("#score-input-tbody tr"));
  return rows
    .map((tr) => {
      const name = tr.querySelector(".inp-name").value.trim();
      const scoreRaw = tr.querySelector(".inp-score").value;
      const classAvgRaw = tr.querySelector(".inp-class-avg").value;
      const maxScore = Number(tr.querySelector(".inp-max").value) || 100;
      const studyHours = Number(tr.querySelector(".inp-hours").value) || 0;
      const mistakes = Array.from(tr.querySelectorAll(".m-chip.selected")).map((c) => c.dataset.tag);
      return {
        name,
        score: scoreRaw === "" ? null : Number(scoreRaw),
        classAvg: classAvgRaw === "" ? null : Number(classAvgRaw),
        maxScore,
        studyHours,
        mistakes
      };
    })
    .filter((s) => s.name !== "" && (includeEmptyScore || s.score !== null));
}

function updateLiveSummary() {
  const subjects = collectInputSubjects(false);
  const allRows = collectInputSubjects(true);
  const manualTestAvgRaw = document.getElementById("test-avg").value;
  const manualTestAvg = manualTestAvgRaw === "" ? null : Number(manualTestAvgRaw);

  // 教科別平均点からの自動算出プレビューをplaceholderに反映
  const autoStats = Calculator.calcTestStats({ subjects: allRows, testAvg: null });
  const testAvgInput = document.getElementById("test-avg");
  testAvgInput.placeholder =
    autoStats.testAvgNormalized !== null ? `自動算出: ${autoStats.testAvgNormalized}` : "教科平均から自動計算";

  const st = Calculator.calcTestStats({ subjects, testAvg: manualTestAvg });
  document.getElementById("live-total").textContent = st.totalScore;
  document.getElementById("live-avg").textContent = st.avgNormalized.toFixed(1);

  const liveTestAvgEl = document.getElementById("live-test-avg");
  const liveDiffEl = document.getElementById("live-avg-diff");
  if (st.testAvgNormalized !== null) {
    liveTestAvgEl.textContent = `${st.testAvgNormalized.toFixed(1)} 点`;
    if (subjects.length > 0 && st.diffFromTestAvg !== null) {
      const sign = st.diffFromTestAvg >= 0 ? "+" : "";
      liveDiffEl.textContent = `(${sign}${st.diffFromTestAvg})`;
      liveDiffEl.style.color = st.diffFromTestAvg >= 0 ? "var(--accent)" : "var(--danger)";
    } else {
      liveDiffEl.textContent = "";
    }
  } else {
    liveTestAvgEl.textContent = "--";
    liveDiffEl.textContent = "";
  }

  document.getElementById("live-rank").textContent = subjects.length ? Calculator.getRank(st.avgNormalized) : "-";
}

function handleSaveTest() {
  const name = document.getElementById("test-name").value.trim() || "無題のテスト";
  const date = document.getElementById("test-date").value || new Date().toISOString().slice(0, 10);
  const type = document.getElementById("test-type").value;
  const goalAvg = Number(document.getElementById("test-goal").value) || 80;
  const testAvgRaw = document.getElementById("test-avg").value;
  const testAvg = testAvgRaw === "" ? null : Number(testAvgRaw);
  const memo = document.getElementById("test-memo").value.trim();
  const subjects = collectInputSubjects(false);

  if (!subjects.length) {
    alert("少なくとも1教科の点数と教科名を入力してください。");
    return;
  }

  const isEditing = Boolean(editingRecordId);
  const recordData = {
    id: editingRecordId || "rec-" + Date.now(),
    name,
    date,
    type,
    goalAvg,
    testAvg,
    memo,
    subjects
  };

  if (isEditing) {
    records = StorageManager.updateRecord(recordData);
  } else {
    records = StorageManager.addRecord(recordData);
  }

  cancelEditMode(true);
  refreshAll();
  switchTab("dashboard");
  showToast(isEditing ? `「${name}」を更新しました` : `「${name}」を記録しました`);
}

function handleDeleteRecord(rec) {
  if (!confirm(`「${rec.name}」を削除しますか？`)) return;
  lastDeletedRecord = rec;
  if (editingRecordId === rec.id) {
    cancelEditMode(true);
  }
  records = StorageManager.deleteRecord(rec.id);
  refreshAll();
  showToast(`「${rec.name}」を削除しました`, true);
}

function refreshAll() {
  renderDashboard();
  renderSubjectChartControls();
  renderSimulator();
  refreshCharts();
}

function refreshCharts() {
  const metric = document.getElementById("trend-metric-select").value;
  ChartManager.renderTrendChart(records, metric);
  ChartManager.renderRadarChart(records);
  ChartManager.renderSubjectTrendChart(records, selectedChartSubject);
  ChartManager.renderMistakesChart(records);
  ChartManager.renderScatterChart(records);
}

function renderDashboard() {
  const rpg = Calculator.calcOverallRPG(records);

  // ヘッダーRPGバー
  document.getElementById("player-level").textContent = rpg.level;
  document.getElementById("exp-bar-fill").style.width = `${rpg.expPercent}%`;

  // KPI
  document.getElementById("kpi-latest-avg").textContent = records.length ? `${rpg.latestAvg}点` : "--";
  if (rpg.diffPrev === null) {
    document.getElementById("kpi-diff-prev").textContent = "前回比 --";
  } else {
    const sign = rpg.diffPrev >= 0 ? "+" : "";
    document.getElementById("kpi-diff-prev").textContent = `前回比 ${sign}${rpg.diffPrev}点`;
  }

  const diffTestAvgEl = document.getElementById("kpi-diff-testavg");
  if (rpg.latestTestAvg === null || rpg.diffTestAvg === null) {
    diffTestAvgEl.textContent = "テスト平均比 --";
  } else {
    const sign = rpg.diffTestAvg >= 0 ? "+" : "";
    diffTestAvgEl.textContent = `テスト平均(${rpg.latestTestAvg})比 ${sign}${rpg.diffTestAvg}点`;
  }

  document.getElementById("kpi-rank").textContent = rpg.rank;
  document.getElementById("kpi-pb-count").textContent = `自己ベスト更新: ${rpg.pbCount}回`;

  document.getElementById("kpi-goal-target").textContent = rpg.goalTarget.toFixed(1);
  if (!records.length) {
    document.getElementById("kpi-goal-gap").textContent = "--";
  } else if (rpg.goalGap <= 0) {
    document.getElementById("kpi-goal-gap").textContent = "達成済！🎉";
  } else {
    document.getElementById("kpi-goal-gap").textContent = `あと +${rpg.goalGap}点`;
  }

  document.getElementById("kpi-total-hours").textContent = `${rpg.totalHours}h`;
  document.getElementById("kpi-test-count").textContent = `記録テスト数: ${records.length}件`;

  // 教科別レベル（タップで上の教科別グラフへ連動）
  const lvGrid = document.getElementById("subject-levels-grid");
  lvGrid.innerHTML = "";
  const subjKeys = Object.keys(rpg.subjectLevels);
  if (!subjKeys.length) {
    lvGrid.innerHTML = `<div class="hint-text">テストを記録すると教科別レベルが表示されます。</div>`;
  } else {
    subjKeys.forEach((subj) => {
      const info = rpg.subjectLevels[subj];
      const div = document.createElement("div");
      div.className = `subj-lv-item ${selectedChartSubject === subj ? "selected" : ""}`;
      div.dataset.subject = subj;
      div.innerHTML = `
        <div class="subj-lv-top">
          <span>${escapeHtml(subj)}</span>
          <span class="subj-lv-badge">Lv.${info.level}</span>
        </div>
        <div class="subj-lv-avg">平均 <span class="sensitive">${info.avg}</span>点 / 最高 <span class="sensitive">${info.best}</span></div>
      `;
      div.addEventListener("click", () => {
        setSelectedChartSubject(subj);
        const card = document.getElementById("subject-trend-card");
        if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      lvGrid.appendChild(div);
    });
  }

  // テスト履歴一覧（新しい順に表示）
  const listEl = document.getElementById("history-list");
  listEl.innerHTML = "";

  if (!records.length) {
    listEl.innerHTML = `<div class="empty-state-box">記録されたテストがありません。「⚡ 成績入力」タブから新しいテストを記録してください。</div>`;
    return;
  }

  [...records].reverse().forEach((rec) => {
    const st = Calculator.calcTestStats(rec);
    const rank = Calculator.getRank(st.avgNormalized);
    const subjSummary = rec.subjects
      .map((s) => {
        const cAvgStr =
          s.classAvg !== null && s.classAvg !== undefined && s.classAvg !== "" ? `(平${s.classAvg})` : "";
        return `${escapeHtml(s.name)}:${s.score}${cAvgStr}`;
      })
      .join(" / ");

    let testAvgBadgeHtml = "";
    if (st.testAvgNormalized !== null) {
      const sign = st.diffFromTestAvg >= 0 ? "+" : "";
      testAvgBadgeHtml = `<span class="avg-pill">テスト平均 ${st.testAvgNormalized}点 (<span class="sensitive">${sign}${st.diffFromTestAvg}</span>)</span>`;
    }

    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div>
        <div class="history-meta">
          <span class="tag-badge">${escapeHtml(rec.type)}</span>
          <span class="history-title">${escapeHtml(rec.name)}</span>
          <span class="history-date">${escapeHtml(rec.date)}</span>
          <strong>[Rank ${rank}]</strong>
          ${testAvgBadgeHtml}
        </div>
        <div class="history-scores sensitive">自分平均 ${st.avgNormalized}点（${subjSummary}）</div>
        ${rec.memo ? `<div class="hint-text" style="margin-top:4px;">📝 ${escapeHtml(rec.memo)}</div>` : ""}
      </div>
      <div class="history-actions">
        <button type="button" class="icon-btn btn-edit-rec" title="このテストを編集">✏️ 編集</button>
        <button type="button" class="icon-btn btn-dup-rec" title="教科構成をコピーして新規入力">📋 複製</button>
        <button type="button" class="icon-btn btn-card-gen" title="リザルトカード画像を生成">🏆 カード</button>
        <button type="button" class="icon-btn danger-btn btn-del-rec" title="このテストを削除">🗑️ 削除</button>
      </div>
    `;

    item.querySelector(".btn-edit-rec").addEventListener("click", () => {
      startEditRecord(rec);
    });

    item.querySelector(".btn-dup-rec").addEventListener("click", () => {
      duplicateRecordToForm(rec);
    });

    item.querySelector(".btn-card-gen").addEventListener("click", () => {
      const isPrivacy = document.body.classList.contains("privacy-mode");
      ChartManager.drawResultCard(rec, isPrivacy);
      document.getElementById("modal-result").classList.remove("hidden");
    });

    item.querySelector(".btn-del-rec").addEventListener("click", () => {
      handleDeleteRecord(rec);
    });

    listEl.appendChild(item);
  });
}

function renderSimulator() {
  const tbody = document.getElementById("sim-tbody");
  tbody.innerHTML = "";
  const neededEl = document.getElementById("sim-needed-total");
  if (!records.length) {
    neededEl.textContent = "--";
    return;
  }

  const latest = records[records.length - 1];
  const targetAvg = Number(document.getElementById("sim-target-avg").value) || 82;

  let weightedCurrentSum = 0;
  let weightTotal = 0;

  latest.subjects.forEach((s) => {
    const norm = s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0;
    const w = simWeights[s.name] !== undefined ? simWeights[s.name] : 1.0;
    const t = simTargets[s.name] !== undefined ? simTargets[s.name] : Math.min(100, Math.round(targetAvg));

    weightedCurrentSum += norm * w;
    weightTotal += w;

    const diff = t - norm;
    const diffStr = diff > 0 ? `+${diff}点` : `${diff}点`;
    const refAvgStr =
      s.classAvg !== null && s.classAvg !== undefined && s.classAvg !== ""
        ? ` <span class="hint-text">(平均 ${s.classAvg}点)</span>`
        : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td><span class="sensitive">${norm}点</span>${refAvgStr}</td>
      <td><input type="number" class="sim-w" value="${w}" min="0.5" max="5" step="0.5" style="width:75px;" /></td>
      <td><input type="number" class="sim-t" value="${t}" min="0" max="100" style="width:85px;" /></td>
      <td class="sensitive" style="color:${diff > 0 ? "var(--warning)" : "var(--accent)"}; font-weight:700;">${diffStr}</td>
    `;

    tr.querySelector(".sim-w").addEventListener("input", (e) => {
      simWeights[s.name] = Number(e.target.value) || 1.0;
      renderSimulator();
    });
    tr.querySelector(".sim-t").addEventListener("input", (e) => {
      simTargets[s.name] = Number(e.target.value) || 0;
      renderSimulator();
    });

    tbody.appendChild(tr);
  });

  const currentWeightedAvg = weightTotal > 0 ? weightedCurrentSum / weightTotal : 0;
  const neededAvgDiff = Number((targetAvg - currentWeightedAvg).toFixed(1));
  if (neededAvgDiff <= 0) {
    neededEl.textContent = "現在の実力で目標圏内！";
  } else {
    neededEl.textContent = `換算平均あと +${neededAvgDiff}点`;
  }
}
