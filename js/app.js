const MISTAKE_TAGS = ["計算ミス", "時間不足", "暗記抜け", "読解ミス", "応用力"];

const PRESETS = {
  regular5: ["英語", "数学", "国語", "理科", "社会"],
  regular9: ["英語", "数学", "国語", "理科", "社会", "音楽", "美術", "保健体育", "技術・家庭"],
  science: ["英語", "数学", "物理", "化学", "国語"]
};

let records = [];
let simWeights = {};
let simTargets = {};

document.addEventListener("DOMContentLoaded", () => {
  records = StorageManager.loadRecords();
  initInputForm();
  bindEvents();
  refreshAll();
});

function bindEvents() {
  // タブ切り替え
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const targetId = `tab-${btn.dataset.tab}`;
      document.getElementById(targetId).classList.add("active");
      refreshCharts();
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
      refreshAll();
      alert("JSONデータを復元しました！");
    } catch (err) {
      alert("読み込みエラー: " + err.message);
    }
    e.target.value = "";
  });

  // サンプルリセット
  document.getElementById("btn-clear-sample").addEventListener("click", () => {
    if (confirm("データを初期サンプル状態に戻しますか？")) {
      records = StorageManager.resetToSample();
      refreshAll();
    }
  });

  // 推移グラフ指標切替
  document.getElementById("trend-metric-select").addEventListener("change", (e) => {
    ChartManager.renderTrendChart(records, e.target.value);
  });

  // プリセットボタン
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = PRESETS[btn.dataset.preset] || [];
      renderSubjectInputRows(list.map((name) => ({ name, score: "", maxScore: 100, studyHours: 0, mistakes: [] })));
    });
  });

  // 科目追加ボタン
  document.getElementById("btn-add-subject").addEventListener("click", () => {
    appendSubjectRow({ name: "", score: "", maxScore: 100, studyHours: 0, mistakes: [] });
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
    link.click();
  });
}

function initInputForm() {
  document.getElementById("test-date").value = new Date().toISOString().slice(0, 10);
  renderSubjectInputRows(
    PRESETS.science.map((name) => ({ name, score: "", maxScore: 100, studyHours: 0, mistakes: [] }))
  );
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
    <td><input type="text" class="inp-name" value="${subj.name}" placeholder="教科名" /></td>
    <td><input type="number" class="inp-score" value="${subj.score}" min="0" max="1000" placeholder="点数" /></td>
    <td><input type="number" class="inp-max" value="${subj.maxScore || 100}" min="1" max="1000" /></td>
    <td><input type="number" class="inp-hours" value="${subj.studyHours || 0}" min="0" max="500" step="0.5" /></td>
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

function collectInputSubjects() {
  const rows = Array.from(document.querySelectorAll("#score-input-tbody tr"));
  return rows
    .map((tr) => {
      const name = tr.querySelector(".inp-name").value.trim();
      const scoreRaw = tr.querySelector(".inp-score").value;
      const maxScore = Number(tr.querySelector(".inp-max").value) || 100;
      const studyHours = Number(tr.querySelector(".inp-hours").value) || 0;
      const mistakes = Array.from(tr.querySelectorAll(".m-chip.selected")).map((c) => c.dataset.tag);
      return {
        name,
        score: scoreRaw === "" ? null : Number(scoreRaw),
        maxScore,
        studyHours,
        mistakes
      };
    })
    .filter((s) => s.name !== "" && s.score !== null);
}

function updateLiveSummary() {
  const subjects = collectInputSubjects();
  const st = Calculator.calcTestStats({ subjects });
  document.getElementById("live-total").textContent = st.totalScore;
  document.getElementById("live-avg").textContent = st.avgNormalized.toFixed(1);
  document.getElementById("live-rank").textContent = subjects.length ? Calculator.getRank(st.avgNormalized) : "-";
}

function handleSaveTest() {
  const name = document.getElementById("test-name").value.trim() || "無題のテスト";
  const date = document.getElementById("test-date").value || new Date().toISOString().slice(0, 10);
  const type = document.getElementById("test-type").value;
  const goalAvg = Number(document.getElementById("test-goal").value) || 80;
  const memo = document.getElementById("test-memo").value.trim();
  const subjects = collectInputSubjects();

  if (!subjects.length) {
    alert("少なくとも1教科の点数と教科名を入力してください。");
    return;
  }

  const newRecord = {
    id: "rec-" + Date.now(),
    name,
    date,
    type,
    goalAvg,
    memo,
    subjects
  };

  records = StorageManager.addRecord(newRecord);
  document.getElementById("test-name").value = "";
  document.getElementById("test-memo").value = "";
  refreshAll();

  // ダッシュボードへ自動遷移
  document.querySelector('[data-tab="dashboard"]').click();
}

function refreshAll() {
  renderDashboard();
  renderSimulator();
  refreshCharts();
}

function refreshCharts() {
  const metric = document.getElementById("trend-metric-select").value;
  ChartManager.renderTrendChart(records, metric);
  ChartManager.renderRadarChart(records);
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

  // 教科別レベル
  const lvGrid = document.getElementById("subject-levels-grid");
  lvGrid.innerHTML = "";
  Object.keys(rpg.subjectLevels).forEach((subj) => {
    const info = rpg.subjectLevels[subj];
    const div = document.createElement("div");
    div.className = "subj-lv-item";
    div.innerHTML = `
      <div class="subj-lv-top">
        <span>${subj}</span>
        <span class="subj-lv-badge">Lv.${info.level}</span>
      </div>
      <div class="subj-lv-avg">平均 <span class="sensitive">${info.avg}</span>点 / 最高 <span class="sensitive">${info.best}</span></div>
    `;
    lvGrid.appendChild(div);
  });

  // テスト履歴一覧（新しい順に表示）
  const listEl = document.getElementById("history-list");
  listEl.innerHTML = "";
  [...records].reverse().forEach((rec) => {
    const st = Calculator.calcTestStats(rec);
    const rank = Calculator.getRank(st.avgNormalized);
    const subjSummary = rec.subjects.map((s) => `${s.name}:${s.score}`).join(" / ");

    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div>
        <div class="history-meta">
          <span class="tag-badge">${rec.type}</span>
          <span class="history-title">${rec.name}</span>
          <span class="history-date">${rec.date}</span>
          <strong>[Rank ${rank}]</strong>
        </div>
        <div class="history-scores sensitive">平均 ${st.avgNormalized}点（${subjSummary}）</div>
        ${rec.memo ? `<div class="hint-text" style="margin-top:4px;">📝 ${rec.memo}</div>` : ""}
      </div>
      <div class="history-actions">
        <button type="button" class="icon-btn btn-card-gen">🏆 カード</button>
        <button type="button" class="icon-btn btn-del-rec" style="color:var(--danger);">削除</button>
      </div>
    `;

    item.querySelector(".btn-card-gen").addEventListener("click", () => {
      const isPrivacy = document.body.classList.contains("privacy-mode");
      ChartManager.drawResultCard(rec, isPrivacy);
      document.getElementById("modal-result").classList.remove("hidden");
    });

    item.querySelector(".btn-del-rec").addEventListener("click", () => {
      if (confirm(`「${rec.name}」を削除しますか？`)) {
        records = StorageManager.deleteRecord(rec.id);
        refreshAll();
      }
    });

    listEl.appendChild(item);
  });
}

function renderSimulator() {
  const tbody = document.getElementById("sim-tbody");
  tbody.innerHTML = "";
  if (!records.length) return;

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

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${s.name}</strong></td>
      <td class="sensitive">${norm}点</td>
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
  const neededEl = document.getElementById("sim-needed-total");
  if (neededAvgDiff <= 0) {
    neededEl.textContent = "現在の実力で目標圏内！";
  } else {
    neededEl.textContent = `換算平均あと +${neededAvgDiff}点`;
  }
}
