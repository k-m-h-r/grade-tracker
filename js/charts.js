const ChartManager = {
  instances: {},

  destroyIfExists(key) {
    if (this.instances[key]) {
      this.instances[key].destroy();
      delete this.instances[key];
    }
  },

  getThemeColors() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
      text: isDark ? "#cbd5e1" : "#334155",
      grid: isDark ? "rgba(148, 163, 184, 0.15)" : "rgba(100, 116, 139, 0.15)",
      primary: isDark ? "#60a5fa" : "#3b82f6",
      accent: isDark ? "#34d399" : "#10b981",
      warning: isDark ? "#fbbf24" : "#f59e0b",
      danger: isDark ? "#f87171" : "#ef4444"
    };
  },

  // 1. 成績推移＆目標ライン折れ線グラフ
  renderTrendChart(records, metric = "avg") {
    this.destroyIfExists("trend");
    const ctx = document.getElementById("chart-trend");
    if (!ctx) return;
    const c = this.getThemeColors();

    const labels = records.map((r) => r.name);
    const values = records.map((r) => {
      const st = Calculator.calcTestStats(r);
      return metric === "avg" ? st.avgNormalized : st.totalScore;
    });
    const goals = records.map((r) => {
      if (metric === "avg") return Number(r.goalAvg) || 80;
      const st = Calculator.calcTestStats(r);
      return Math.round(((Number(r.goalAvg) || 80) / 100) * st.totalMax);
    });

    this.instances.trend = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: metric === "avg" ? "平均点 (100点換算)" : "合計点",
            data: values,
            borderColor: c.primary,
            backgroundColor: c.primary,
            borderWidth: 3,
            tension: 0.25,
            pointRadius: 5
          },
          {
            label: "目標ライン",
            data: goals,
            borderColor: c.warning,
            borderDash: [6, 6],
            borderWidth: 2,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: c.text } }
        },
        scales: {
          x: { ticks: { color: c.text }, grid: { color: c.grid } },
          y: { ticks: { color: c.text }, grid: { color: c.grid }, beginAtZero: false }
        }
      }
    });
  },

  // 2. 教科バランスレーダーチャート
  renderRadarChart(records) {
    this.destroyIfExists("radar");
    const ctx = document.getElementById("chart-radar");
    if (!ctx || !records.length) return;
    const c = this.getThemeColors();

    const latest = records[records.length - 1];
    const prev = records.length >= 2 ? records[records.length - 2] : null;

    const labels = latest.subjects.map((s) => s.name);
    const latestData = latest.subjects.map((s) =>
      s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0
    );

    const datasets = [
      {
        label: `最新 (${latest.name})`,
        data: latestData,
        borderColor: c.accent,
        backgroundColor: "rgba(52, 211, 153, 0.22)",
        borderWidth: 2.5
      }
    ];

    if (prev) {
      const prevData = labels.map((name) => {
        const found = prev.subjects.find((s) => s.name === name);
        return found && found.maxScore > 0 ? Math.round((found.score / found.maxScore) * 100) : 0;
      });
      datasets.push({
        label: `前回 (${prev.name})`,
        data: prevData,
        borderColor: c.primary,
        backgroundColor: "rgba(96, 165, 250, 0.12)",
        borderWidth: 1.5,
        borderDash: [4, 4]
      });
    }

    this.instances.radar = new Chart(ctx, {
      type: "radar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: c.text } }
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { color: c.text, backdropColor: "transparent", stepSize: 20 },
            grid: { color: c.grid },
            angleLines: { color: c.grid },
            pointLabels: { color: c.text, font: { size: 12, weight: "bold" } }
          }
        }
      }
    });
  },

  // 3. 失点原因カルテ円グラフ
  renderMistakesChart(records) {
    this.destroyIfExists("mistakes");
    const ctx = document.getElementById("chart-mistakes");
    if (!ctx) return;
    const c = this.getThemeColors();

    const counts = {};
    records.forEach((r) => {
      r.subjects.forEach((s) => {
        (s.mistakes || []).forEach((m) => {
          counts[m] = (counts[m] || 0) + 1;
        });
      });
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);

    this.instances.mistakes = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels.length ? labels : ["失点記録なし"],
        datasets: [
          {
            data: data.length ? data : [1],
            backgroundColor: ["#f87171", "#fbbf24", "#60a5fa", "#a78bfa", "#34d399"]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: c.text } }
        }
      }
    });
  },

  // 4. 勉強時間 × 得点 相関散布図
  renderScatterChart(records) {
    this.destroyIfExists("scatter");
    const ctx = document.getElementById("chart-scatter");
    if (!ctx) return;
    const c = this.getThemeColors();

    const points = [];
    records.forEach((r) => {
      r.subjects.forEach((s) => {
        const norm = s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0;
        points.push({
          x: Number(s.studyHours) || 0,
          y: norm,
          label: `${r.name} - ${s.name}`
        });
      });
    });

    this.instances.scatter = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "教科別 (勉強時間h, 得点率%)",
            data: points,
            backgroundColor: c.primary,
            pointRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: c.text } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const raw = ctx.raw;
                return `${raw.label}: ${raw.x}時間 / ${raw.y}点`;
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: "学習時間 (h)", color: c.text },
            ticks: { color: c.text },
            grid: { color: c.grid },
            beginAtZero: true
          },
          y: {
            title: { display: true, text: "得点率 (%)", color: c.text },
            ticks: { color: c.text },
            grid: { color: c.grid },
            min: 0,
            max: 100
          }
        }
      }
    });
  },

  // 5. HTML5 Canvas リザルトカード生成
  drawResultCard(test, isPrivacy) {
    const canvas = document.getElementById("result-card-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const st = Calculator.calcTestStats(test);
    const rank = Calculator.getRank(st.avgNormalized);

    // 背景グラデーション
    const grad = ctx.createLinearGradient(0, 0, 800, 450);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(1, "#1e293b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 450);

    // 装飾ライン
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, 764, 414);

    // タイトル・日付
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(`GRADEQUEST BATTLE RESULT  |  ${test.date}  [${test.type}]`, 42, 60);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText(test.name, 42, 106);

    // ランク表示
    ctx.fillStyle = "#34d399";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("RANK", 650, 72);
    ctx.font = "bold 96px sans-serif";
    ctx.fillText(rank, 642, 162);

    // 平均・合計
    const avgText = isPrivacy ? "**.*" : `${st.avgNormalized}`;
    const totText = isPrivacy ? "*** / ***" : `${st.totalScore} / ${st.totalMax}`;
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(`AVG: ${avgText} pt    TOTAL: ${totText}    STUDY: ${st.totalHours}h`, 42, 155);

    // 各教科スコアボックス
    const cols = Math.min(test.subjects.length, 5);
    const boxW = Math.floor((716 - (cols - 1) * 12) / cols);
    test.subjects.slice(0, 10).forEach((s, idx) => {
      const col = idx % 5;
      const row = Math.floor(idx / 5);
      const x = 42 + col * (boxW + 12);
      const y = 195 + row * 105;

      ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
      ctx.fillRect(x, y, boxW, 90);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, boxW, 90);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText(s.name, x + 12, y + 28);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px sans-serif";
      const scStr = isPrivacy ? "**" : `${s.score}`;
      ctx.fillText(scStr, x + 12, y + 68);
      const scWidth = ctx.measureText(scStr).width;

      ctx.fillStyle = "#64748b";
      ctx.font = "13px sans-serif";
      ctx.fillText(`/${s.maxScore}`, x + 16 + scWidth, y + 68);
    });
  }
};
