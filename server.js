// server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

// --- データベース設定 ---
const db = new sqlite3.Database('./management.db', (err) => {
    if (err) return console.error('データベースへの接続に失敗！', err.message);
    console.log('入退室管理データベースへの接続に成功！');
});

// テーブルをセットアップ
db.serialize(() => {
    // usersテーブルに新しいカラムを追加
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        standard_slot TEXT,
        standard_seat TEXT
    )`, (err) => {
        if (err) console.error("usersテーブル作成エラー:", err.message);
        else console.log("'users'テーブルの準備完了。");
    });

    // entry_logsテーブル（変更なし）
    db.run(`CREATE TABLE IF NOT EXISTS entry_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        entry_time TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) console.error("entry_logsテーブル作成エラー:", err.message);
        else console.log("'entry_logs'テーブルの準備完了。");
    });
});

// --- ミドルウェア設定 ---
app.use(express.json());
app.use(express.static('public'));

// --- APIエンドポイント定義 ---

// API: 全ユーザーの一覧を取得
app.get('/api/users', (req, res) => {
    const sql = "SELECT * FROM users ORDER BY name";
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ "error": err.message });
        res.json({ users: rows });
    });
});

// API: WebUIから新規ユーザーを登録
app.post('/api/users', (req, res) => {
    const { id, name, email, standard_slot, standard_seat } = req.body;

    if (!id || !name) {
        return res.status(400).json({ "error": "IDと名前は必須です。" });
    }

    const emailToStore = email && email.trim() !== '' ? email.trim() : null;
    const slotToStore = standard_slot && standard_slot.trim() !== '' ? standard_slot.trim() : null;
    const seatToStore = standard_seat && standard_seat.trim() !== '' ? standard_seat.trim() : null;

    const sql = 'INSERT INTO users (id, name, email, standard_slot, standard_seat) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [id, name, emailToStore, slotToStore, seatToStore], function(err) {
        if (err) {
            return res.status(400).json({ "error": "そのIDは既に使用されています。" });
        }
        res.status(201).json({ id, name, email: emailToStore, standard_slot: slotToStore, standard_seat: seatToStore });
    });
});

// API: ユーザー情報を更新
app.put('/api/users/:id', (req, res) => {
    const { name, email, standard_slot, standard_seat } = req.body;
    const { id } = req.params;

    if (!name) {
        return res.status(400).json({ "error": "名前は必須です。" });
    }

    const emailToStore = email && email.trim() !== '' ? email.trim() : null;
    const slotToStore = standard_slot && standard_slot.trim() !== '' ? standard_slot.trim() : null;
    const seatToStore = standard_seat && standard_seat.trim() !== '' ? standard_seat.trim() : null;

    const sql = 'UPDATE users SET name = ?, email = ?, standard_slot = ?, standard_seat = ? WHERE id = ?';
    db.run(sql, [name, emailToStore, slotToStore, seatToStore, id], function(err) {
        if (err) return res.status(500).json({ "error": err.message });
        if (this.changes === 0) return res.status(404).json({ "error": "指定されたIDのユーザーが見つかりません。" });
        res.status(200).json({ message: 'ユーザー情報が正常に更新されました。' });
    });
});

// API: ユーザーを削除
app.delete('/api/users/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM users WHERE id = ?', id, function(err) {
        if (err) return res.status(500).json({ "error": err.message });
        if (this.changes === 0) return res.status(404).json({ "error": "指定されたIDのユーザーが見つかりません。" });
        res.status(200).json({ message: 'ユーザーが正常に削除されました。' });
    });
});

// ... (QRコード入退室管理用のAPIは変更なし) ...

const server = app.listen(port, () => {
    console.log(`サーバーがポート${port}で起動！`);
});

process.on('SIGINT', () => {
    console.log('\nサーバーをシャットダウンします。');
    server.close(() => {
        db.close((err) => {
            if (err) console.error('データベース切断エラー', err.message);
            else console.log('データベース接続を正常に切断しました。');
            process.exit(0);
        });
    });
});
