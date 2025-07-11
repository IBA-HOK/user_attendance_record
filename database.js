// database.js
const sqlite3 = require('sqlite3').verbose();
// 以前の users.db があれば削除してから実行すること
const db = new sqlite3.Database('./users.db');

db.serialize(() => {
  console.log("データベースのセットアップを開始します...");
  // emailカラムから UNIQUE 制約を削除
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT
  )`, (err) => {
    if (err) {
      return console.error("テーブル作成エラー:", err.message);
    }
    console.log("'users'テーブルが正常に作成または確認されました。");
  });
});

db.close();
