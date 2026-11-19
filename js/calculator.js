const Calculator = {
  // 1回分のテスト統計を算出（満点が異なる場合も100点換算平均を算出）
  calcTestStats(test) {
    if (!test || !test.subjects || test.subjects.length === 0) {
      return {
        totalScore: 0,
        totalMax: 0,
        avgNormalized: 0,
        totalHours: 0,
        testAvgNormalized: null,
        testAvgTotal: null,
        diffFromTestAvg: null
      };
    }
    let totalScore = 0;
    let totalMax = 0;
    let normSum = 0;
    let totalHours = 0;

    let subjAvgNormSum = 0;
    let subjAvgCount = 0;

    test.subjects.forEach((s) => {
      const sc = Number(s.score) || 0;
      const mx = Number(s.maxScore) || 100;
      totalScore += sc;
      totalMax += mx;
      normSum += mx > 0 ? (sc / mx) * 100 : 0;
      totalHours += Number(s.studyHours) || 0;

      if (s.classAvg !== null && s.classAvg !== undefined && s.classAvg !== "" && !Number.isNaN(Number(s.classAvg))) {
        const cAvg = Number(s.classAvg);
        subjAvgNormSum += mx > 0 ? (cAvg / mx) * 100 : 0;
        subjAvgCount++;
      }
    });

    const avgNormalized = Number((normSum / test.subjects.length).toFixed(1));

    // テスト平均点の決定：明示入力(test.testAvg)優先、未入力なら教科別平均点から自動算出
    let testAvgNormalized = null;
    if (test.testAvg !== null && test.testAvg !== undefined && test.testAvg !== "" && !Number.isNaN(Number(test.testAvg))) {
      testAvgNormalized = Number(Number(test.testAvg).toFixed(1));
    } else if (subjAvgCount > 0) {
      testAvgNormalized = Number((subjAvgNormSum / subjAvgCount).toFixed(1));
    }

    const diffFromTestAvg =
      testAvgNormalized !== null ? Number((avgNormalized - testAvgNormalized).toFixed(1)) : null;

    const testAvgTotal =
      testAvgNormalized !== null ? Math.round((testAvgNormalized / 100) * totalMax) : null;

    return {
      totalScore,
      totalMax,
      avgNormalized,
      totalHours: Number(totalHours.toFixed(1)),
      testAvgNormalized,
      testAvgTotal,
      diffFromTestAvg
    };
  },

  // 平均点に応じたRPGランク判定
  getRank(avg) {
    if (avg >= 90) return "S";
    if (avg >= 80) return "A";
    if (avg >= 70) return "B";
    if (avg >= 60) return "C";
    return "D";
  },

  // 全テスト履歴からRPGステータス＆サマリーを算出
  calcOverallRPG(records) {
    if (!records.length) {
      return {
        level: 1,
        expPercent: 0,
        latestAvg: 0,
        diffPrev: null,
        diffTestAvg: null,
        latestTestAvg: null,
        rank: "-",
        pbCount: 0,
        goalGap: 0,
        goalTarget: 80,
        totalHours: 0,
        subjectLevels: {}
      };
    }

    let totalExp = 0;
    let totalHours = 0;
    let pbCount = 0;
    let maxAvgSoFar = -1;
    const subjMap = {};

    records.forEach((rec) => {
      const st = this.calcTestStats(rec);
      totalHours += st.totalHours;
      // 経験値 = テスト平均点×2 + 勉強時間×10
      totalExp += Math.round(st.avgNormalized * 2 + st.totalHours * 10);

      if (maxAvgSoFar >= 0 && st.avgNormalized > maxAvgSoFar) {
        pbCount++;
      }
      if (st.avgNormalized > maxAvgSoFar) {
        maxAvgSoFar = st.avgNormalized;
      }

      rec.subjects.forEach((s) => {
        if (!subjMap[s.name]) {
          subjMap[s.name] = { count: 0, normSum: 0, hours: 0, best: 0 };
        }
        const norm = s.maxScore > 0 ? (s.score / s.maxScore) * 100 : 0;
        subjMap[s.name].count++;
        subjMap[s.name].normSum += norm;
        subjMap[s.name].hours += Number(s.studyHours) || 0;
        if (norm > subjMap[s.name].best) subjMap[s.name].best = norm;
      });
    });

    const level = Math.floor(totalExp / 250) + 1;
    const expPercent = Math.round(((totalExp % 250) / 250) * 100);

    const latest = records[records.length - 1];
    const latestStats = this.calcTestStats(latest);
    const prevStats = records.length >= 2 ? this.calcTestStats(records[records.length - 2]) : null;
    const diffPrev = prevStats ? Number((latestStats.avgNormalized - prevStats.avgNormalized).toFixed(1)) : null;

    const goalTarget = Number(latest.goalAvg) || 80;
    const goalGap = Number((goalTarget - latestStats.avgNormalized).toFixed(1));

    const subjectLevels = {};
    Object.keys(subjMap).forEach((name) => {
      const item = subjMap[name];
      const avg = item.normSum / item.count;
      const lv = Math.max(1, Math.floor((avg * item.count + item.hours * 4) / 40));
      subjectLevels[name] = {
        level: lv,
        avg: Number(avg.toFixed(1)),
        best: Math.round(item.best)
      };
    });

    return {
      level,
      expPercent,
      latestAvg: latestStats.avgNormalized,
      diffPrev,
      diffTestAvg: latestStats.diffFromTestAvg,
      latestTestAvg: latestStats.testAvgNormalized,
      rank: this.getRank(latestStats.avgNormalized),
      pbCount,
      goalGap,
      goalTarget,
      totalHours: Number(totalHours.toFixed(1)),
      subjectLevels
    };
  }
};
