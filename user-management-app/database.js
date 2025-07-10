// database.js
const sqlite3 = require('sqlite3').verbose();
// 以前の users.db があれば削除してから実行すること
const db = new sqlite3.Database('./users.db');

db.serialize(() => {
  console.log("データベースのセットアップを開始します...");
  // ユーザー情報を格納するテーブルを作成
  // id を手動で設定できるよう、TEXT型の主キーに変更
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  )`, (err) => {
    if (err) {
      return console.error("テーブル作成エラー:", err.message);
    }
    console.log("'users'テーブルが正常に作成または確認されました。");
  });
});

db.close();