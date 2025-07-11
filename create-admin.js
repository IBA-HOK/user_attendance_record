// create-admin.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database('./management.db');

// --- ▼▼▼ 設定せよ ▼▼▼ ---
const adminUsername = 'admin';
const adminPassword = 'password123'; // ここに設定したいパスワードを入力
// --------------------------

const saltRounds = 10;

console.log(`管理者 '${adminUsername}' を作成します...`);

bcrypt.hash(adminPassword, saltRounds, (err, hash) => {
    if (err) {
        return console.error("パスワードのハッシュ化エラー:", err);
    }

    db.serialize(() => {
        // 管理者テーブルがなければ作成
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )`);

        // 管理者を登録（既にあれば無視）
        const sql = 'INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)';
        db.run(sql, [adminUsername, hash], function(err) {
            if (err) {
                return console.error("管理者作成エラー:", err.message);
            }
            if (this.changes > 0) {
                console.log("アッパレ！ 管理者が正常に作成されました。");
            } else {
                console.log("管理者 '${adminUsername}' は既に存在します。");
            }
            db.close();
        });
    });
});
