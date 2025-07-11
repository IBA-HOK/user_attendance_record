// server.js (Ultimate & Unabridged Edition)

const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

// --- データベース設定 ---
// 必ず古い management.db を削除してから起動すること
const db = new sqlite3.Database('./management.db', (err) => {
    if (err) {
        console.error('データベース接続エラー:', err.message);
        process.exit(1);
    }
    console.log('Wasshoi! 最終形態データベースへの接続に成功！');
});

// 5つのテーブルを全てセットアップ
db.serialize(() => {
    // 外部キー制約を有効にする
    db.run("PRAGMA foreign_keys = ON;");

    // 1. pcs テーブル (先に作成)
    db.run(`CREATE TABLE IF NOT EXISTS pcs (
        pc_id TEXT PRIMARY KEY NOT NULL,
        pc_name TEXT NOT NULL,
        notes TEXT
    )`);

    // 2. users テーブル
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        user_level TEXT DEFAULT '通常',
        default_pc_id TEXT,
        FOREIGN KEY (default_pc_id) REFERENCES pcs(pc_id) ON DELETE SET NULL
    )`);

    // 3. class_slots テーブル
    db.run(`CREATE TABLE IF NOT EXISTS class_slots (
        slot_id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_of_week INTEGER NOT NULL, -- 0=日曜, 1=月曜...
        period INTEGER NOT NULL,
        slot_name TEXT NOT NULL UNIQUE,
        start_time TEXT,
        end_time TEXT
    )`);

    // 4. schedules テーブル
    db.run(`CREATE TABLE IF NOT EXISTS schedules (
        schedule_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        class_date TEXT NOT NULL,
        slot_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT '通常', -- '通常', '振替', '欠席'
        assigned_pc_id TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (slot_id) REFERENCES class_slots(slot_id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_pc_id) REFERENCES pcs(pc_id) ON DELETE SET NULL
    )`);

    // 5. entry_logs テーブル
    db.run(`CREATE TABLE IF NOT EXISTS entry_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        log_time TEXT NOT NULL,
        log_type TEXT NOT NULL, -- 'entry' or 'exit'
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`);

    console.log("全5テーブルのセットアップを検証・完了しました。");
});


// --- ミドルウェア ---
app.use(express.json());
app.use(express.static('public'));


// ==================================================================
// APIエンドポイント
// ==================================================================

// --- ユーザー (users) CRUD API ---

app.post('/api/users', (req, res) => {
    const { user_id, name, email, user_level, default_pc_id } = req.body;
    if (!user_id || !name) return res.status(400).json({ error: "ユーザーIDと名前は必須です。" });
    const sql = `INSERT INTO users (user_id, name, email, user_level, default_pc_id) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [user_id, name, email, user_level, default_pc_id], function(err) {
        if (err) return res.status(400).json({ error: "そのユーザーIDは既に使用されています。" });
        res.status(201).json({ user_id, name });
    });
});

// server.js の修正後

// server.js 内のこの部分を置き換え

app.get('/api/users', (req, res) => {
    const { name } = req.query;
    let sql = "SELECT u.*, p.pc_name as default_pc_name FROM users u LEFT JOIN pcs p ON u.default_pc_id = p.pc_id";
    const params = [];

    if (name) {
        sql += " WHERE u.name LIKE ?";
        params.push(`%${name}%`);
    }

    sql += " ORDER BY u.name";

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ users: rows }); // データ形式を { users: [...] } に統一
    });
});

app.get('/api/users/:id', (req, res) => {
    const sql = "SELECT u.*, p.pc_name as default_pc_name FROM users u LEFT JOIN pcs p ON u.default_pc_id = p.pc_id WHERE u.user_id = ?";
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: "ユーザーが見つかりません。" });
        res.json(row);
    });
});

app.put('/api/users/:id', (req, res) => {
    const { name, email, user_level, default_pc_id } = req.body;
    if (!name) return res.status(400).json({ error: "名前は必須です。" });
    const sql = `UPDATE users SET name = ?, email = ?, user_level = ?, default_pc_id = ? WHERE user_id = ?`;
    db.run(sql, [name, email, user_level, default_pc_id, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "ユーザーが見つかりません。" });
        res.status(200).json({ message: "ユーザー情報を更新しました。" });
    });
});

app.delete('/api/users/:id', (req, res) => {
    db.run('DELETE FROM users WHERE user_id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "ユーザーが見つかりません。" });
        res.status(200).json({ message: "ユーザーを削除しました。" });
    });
});


// --- PC (pcs) CRUD API ---

app.post('/api/pcs', (req, res) => {
    const { pc_id, pc_name, notes } = req.body;
    if (!pc_id || !pc_name) return res.status(400).json({ error: "PC IDとPC名は必須です。" });
    db.run('INSERT INTO pcs (pc_id, pc_name, notes) VALUES (?, ?, ?)', [pc_id, pc_name, notes], function(err) {
        if (err) return res.status(400).json({ error: "そのPC IDは既に使用されています。" });
        res.status(201).json({ pc_id, pc_name });
    });
});

app.get('/api/pcs', (req, res) => {
    db.all("SELECT * FROM pcs ORDER BY pc_id", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/pcs/:id', (req, res) => {
    const { pc_name, notes } = req.body;
    if (!pc_name) return res.status(400).json({ error: "PC名は必須です。" });
    db.run('UPDATE pcs SET pc_name = ?, notes = ? WHERE pc_id = ?', [pc_name, notes, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "PCが見つかりません。" });
        res.status(200).json({ message: "PC情報を更新しました。" });
    });
});

app.delete('/api/pcs/:id', (req, res) => {
    db.run('DELETE FROM pcs WHERE pc_id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "PCが見つかりません。" });
        res.status(200).json({ message: "PCを削除しました。" });
    });
});


// --- 授業コマ (class_slots) CRUD API ---

app.post('/api/class_slots', (req, res) => {
    const { day_of_week, period, slot_name, start_time, end_time } = req.body;
    if (day_of_week == null || !period || !slot_name) return res.status(400).json({ error: "曜日、時限、コマ名は必須です。" });
    const sql = 'INSERT INTO class_slots (day_of_week, period, slot_name, start_time, end_time) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [day_of_week, period, slot_name, start_time, end_time], function(err) {
        if (err) return res.status(400).json({ error: "そのコマ名は既に使用されています。" });
        res.status(201).json({ slot_id: this.lastID });
    });
});

app.get('/api/class_slots', (req, res) => {
    db.all("SELECT * FROM class_slots ORDER BY day_of_week, period", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ... 他のコマ用API(PUT, DELETE)も同様に作成 ...


// --- スケジュール (schedules) API ---

app.get('/api/schedules', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "日付(date)クエリは必須です。" });
    const sql = `
        SELECT s.schedule_id, s.class_date, s.status,
               u.user_id, u.name as user_name, u.user_level,
               c.slot_id, c.slot_name,
               p.pc_id, p.pc_name
        FROM schedules s
        JOIN users u ON s.user_id = u.user_id
        JOIN class_slots c ON s.slot_id = c.slot_id
        LEFT JOIN pcs p ON s.assigned_pc_id = p.pc_id
        WHERE s.class_date = ?
        ORDER BY c.period`;
    db.all(sql, [date], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/schedules', (req, res) => {
    const { user_id, class_date, slot_id, status, assigned_pc_id } = req.body;
    if (!user_id || !class_date || !slot_id || !status) return res.status(400).json({ error: "user_id, class_date, slot_id, statusは必須です。" });
    const sql = 'INSERT INTO schedules (user_id, class_date, slot_id, status, assigned_pc_id) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [user_id, class_date, slot_id, status, assigned_pc_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ schedule_id: this.lastID });
    });
});

app.put('/api/schedules/:id/status', (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "statusは必須です。" });
    db.run('UPDATE schedules SET status = ? WHERE schedule_id = ?', [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "スケジュールが見つかりません。" });
        res.status(200).json({ message: "ステータスを更新しました。" });
    });
});


// --- 入退室ログ (entry_logs) API ---

app.post('/api/entry_logs', (req, res) => {
    const { user_id, log_time, log_type } = req.body;
    if (!user_id || !log_type) return res.status(400).json({ error: "user_idとlog_typeは必須です。" });
    const timeToLog = log_time || new Date().toISOString();
    db.run('INSERT INTO entry_logs (user_id, log_time, log_type) VALUES (?, ?, ?)', [user_id, timeToLog, log_type], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: "ログを記録しました。" });
    });
});


// --- サーバー起動 ---
const server = app.listen(port, () => {
    console.log(`サーバーがポート${port}で起動しました。`);
});
process.on('SIGINT', () => {
    console.log("サーバーをシャットダウンします。");
    server.close(() => {
        db.close((err) => {
            if (err) console.error("DBクローズエラー", err);
            process.exit(0);
        });
    });
});
