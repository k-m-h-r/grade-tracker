const STORAGE_KEY = "gradequest_records_v1";

const DEFAULT_SAMPLE_DATA = [
  {
    id: "sample-1",
    name: "1学期 中間考査",
    date: "2026-05-20",
    type: "定期考査",
    goalAvg: 80,
    memo: "数学の計算ミスが痛かった。次回は検算時間を5分確保する。",
    subjects: [
      { name: "英語", score: 78, maxScore: 100, studyHours: 12, mistakes: ["時間不足"] },
      { name: "数学", score: 72, maxScore: 100, studyHours: 15, mistakes: ["計算ミス"] },
      { name: "国語", score: 75, maxScore: 100, studyHours: 6, mistakes: ["読解ミス"] },
      { name: "物理", score: 81, maxScore: 100, studyHours: 10, mistakes: ["応用力"] },
      { name: "化学", score: 74, maxScore: 100, studyHours: 9, mistakes: ["暗記抜け"] }
    ]
  },
  {
    id: "sample-2",
    name: "1学期 期末考査",
    date: "2026-07-08",
    type: "定期考査",
    goalAvg: 82,
    memo: "物理と数学が大きく伸びた！英語の長文スピードも改善。",
    subjects: [
      { name: "英語", score: 83, maxScore: 100, studyHours: 14, mistakes: ["暗記抜け"] },
      { name: "数学", score: 86, maxScore: 100, studyHours: 18, mistakes: [] },
      { name: "国語", score: 77, maxScore: 100, studyHours: 7, mistakes: ["読解ミス"] },
      { name: "物理", score: 89, maxScore: 100, studyHours: 13, mistakes: ["計算ミス"] },
      { name: "化学", score: 80, maxScore: 100, studyHours: 11, mistakes: ["暗記抜け"] }
    ]
  }
];

const StorageManager = {
  loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.saveRecords(DEFAULT_SAMPLE_DATA);
        return [...DEFAULT_SAMPLE_DATA];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("データ読み込みエラー:", e);
      return [];
    }
  },

  saveRecords(records) {
    // 日付昇順でソートして保存
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    return sorted;
  },

  addRecord(record) {
    const records = this.loadRecords();
    records.push(record);
    return this.saveRecords(records);
  },

  deleteRecord(id) {
    const records = this.loadRecords().filter((r) => r.id !== id);
    return this.saveRecords(records);
  },

  resetToSample() {
    return this.saveRecords(DEFAULT_SAMPLE_DATA);
  },

  exportJSON() {
    const records = this.loadRecords();
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `gradequest-backup-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data)) {
            throw new Error("不正なJSONフォーマットです");
          }
          const saved = this.saveRecords(data);
          resolve(saved);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
      reader.readAsText(file);
    });
  }
};
