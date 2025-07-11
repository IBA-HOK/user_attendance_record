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
app.get('/api/live/current-class', (req, res) => {
    const now = new Date();
    // JSTに合わせる（サーバー環境に依存しないよう、明示的に+9時間）
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));

    const dayOfWeek = jstNow.getUTCDay(); // 0=日曜, 1=月曜...
    const currentTime = jstNow.getUTCHours().toString().padStart(2, '0') + ':' + jstNow.getUTCMinutes().toString().padStart(2, '0');
    const todayDate = jstNow.toISOString().split('T')[0];

    // 1. 現在時刻に合致するコマを見つける
    const findSlotSql = `
        SELECT * FROM class_slots 
        WHERE day_of_week = ? AND start_time <= ? AND end_time > ? 
        ORDER BY start_time DESC LIMIT 1
    `;
    db.get(findSlotSql, [dayOfWeek, currentTime, currentTime], (err, slot) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!slot) return res.json({ message: "現在、授業時間外です。" });

        // 2. そのコマの出席予定者と、今日の入室ログを結合して取得
        const getAttendeesSql = `
            SELECT
                s.user_id,
                u.name,
                s.status,
                p.pc_name,
                (SELECT log_time FROM entry_logs 
                 WHERE user_id = s.user_id AND log_type = 'entry' AND date(log_time) = ? 
                 ORDER BY log_time DESC LIMIT 1) as entry_log_time
            FROM schedules s
            JOIN users u ON s.user_id = u.user_id
            LEFT JOIN pcs p ON s.assigned_pc_id = p.pc_id
            WHERE s.class_date = ? AND s.slot_id = ? AND s.status != '欠席'
            ORDER BY u.name
        `;
        db.all(getAttendeesSql, [todayDate, todayDate, slot.slot_id], (err, attendees) => {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
                current_class: slot,
                attendees: attendees.map(a => ({...a, is_present: !!a.entry_log_time }))
            });
        });
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
app.put('/api/class_slots/:id', (req, res) => {
    const { day_of_week, period, slot_name, start_time, end_time } = req.body;
    if (day_of_week == null || !period || !slot_name) return res.status(400).json({ error: "曜日、時限、コマ名は必須です。" });
    const sql = `UPDATE class_slots SET 
        day_of_week = ?, period = ?, slot_name = ?, start_time = ?, end_time = ?
        WHERE slot_id = ?`;
    db.run(sql, [day_of_week, period, slot_name, start_time, end_time, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "コマが見つかりません。" });
        res.status(200).json({ message: "コマ情報を更新しました。" });
    });
});

app.delete('/api/class_slots/:id', (req, res) => {
    db.run('DELETE FROM class_slots WHERE slot_id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "コマが見つかりません。" });
        res.status(200).json({ message: "コマを削除しました。" });
    });
});
// ... 他のコマ用API(PUT, DELETE)も同様に作成 ...


// --- スケジュール (schedules) API ---

// 【強化版】スケジュールを取得（日付範囲、ステータスでの絞り込みに対応）
app.get('/api/schedules', (req, res) => {
    // name を受け取れるようにする
    const { startDate, endDate, status, userId, name } = req.query;

    let sql = `
        SELECT s.schedule_id, s.class_date, s.status,
               u.user_id, u.name as user_name,
               c.slot_id, c.slot_name,
               p.pc_id as assigned_pc_id, p.pc_name
        FROM schedules s
                 JOIN users u ON s.user_id = u.user_id
                 JOIN class_slots c ON s.slot_id = c.slot_id
                 LEFT JOIN pcs p ON s.assigned_pc_id = p.pc_id
    `;
    const params = [];
    const conditions = [];

    if (startDate) {
        conditions.push("s.class_date >= ?");
        params.push(startDate);
    }
    if (endDate) {
        conditions.push("s.class_date <= ?");
        params.push(endDate);
    }
    if (status) {
        conditions.push("s.status = ?");
        params.push(status);
    }
    if (userId) {
        conditions.push("s.user_id = ?");
        params.push(userId);
    }
    if (name) {
        conditions.push("u.name LIKE ?");
        params.push(`%${name}%`);
    }

    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY s.class_date, c.start_time";

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// スケジュールを一件登録 (振替用)
app.post('/api/schedules', (req, res) => {
    const { user_id, class_date, slot_id, status, assigned_pc_id } = req.body;
    if (!user_id || !class_date || !slot_id || !status) return res.status(400).json({ error: "必須項目が不足しています。" });
    const sql = 'INSERT INTO schedules (user_id, class_date, slot_id, status, assigned_pc_id) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [user_id, class_date, slot_id, status, assigned_pc_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ schedule_id: this.lastID });
    });
});

// 【実装】スケジュールを一件更新
app.put('/api/schedules/:id', (req, res) => {
    const { class_date, slot_id, status, assigned_pc_id } = req.body;
    if (!class_date || !slot_id || !status) return res.status(400).json({ error: "必須項目が不足しています。" });
    const sql = 'UPDATE schedules SET class_date = ?, slot_id = ?, status = ?, assigned_pc_id = ? WHERE schedule_id = ?';
    db.run(sql, [class_date, slot_id, status, assigned_pc_id, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "対象のスケジュールが見つかりません。" });
        res.status(200).json({ message: "スケジュールを更新しました。" });
    });
});

// 【実装】スケジュールを一件削除
app.delete('/api/schedules/:id', (req, res) => {
    db.run('DELETE FROM schedules WHERE schedule_id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "対象のスケジュールが見つかりません。" });
        res.status(200).json({ message: "スケジュールを削除しました。" });
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
/**
 * API: 生徒の通常スケジュールを一括登録
 * POST /api/schedules/bulk
 * 指定された生徒とコマで、未来のスケジュールを生成する
 */
app.post('/api/schedules/bulk', (req, res) => {
    const { user_id, slot_id, pc_id, term_end_date } = req.body;

    if (!user_id || !slot_id || !term_end_date) {
        return res.status(400).json({ error: "必須項目が不足しています。" });
    }

    // 1. 対象のコマ情報を取得
    db.get('SELECT * FROM class_slots WHERE slot_id = ?', [slot_id], (err, slot) => {
        if (err || !slot) return res.status(404).json({ error: "指定されたコマが見つかりません。" });

        // 2. スケジュールを生成
        const schedulesToCreate = [];
        let currentDate = new Date(); // 今日から開始
        const endDate = new Date(term_end_date);
        const targetDay = slot.day_of_week;

        while (currentDate <= endDate) {
            if (currentDate.getDay() === targetDay) {
                // YYYY-MM-DD形式にフォーマット
                const dateString = currentDate.toISOString().split('T')[0];
                schedulesToCreate.push([user_id, dateString, slot_id, '通常', pc_id]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (schedulesToCreate.length === 0) {
            return res.status(400).json({ error: "指定された期間に該当する授業日がありません。" });
        }

        // 3. トランザクションで一括登録
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare('INSERT INTO schedules (user_id, class_date, slot_id, status, assigned_pc_id) VALUES (?, ?, ?, ?, ?)');
            schedulesToCreate.forEach(schedule => {
                stmt.run(schedule);
            });
            stmt.finalize((err) => {
                if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: "スケジュールの一括登録中にエラーが発生しました。" });
                }
                db.run("COMMIT");
                res.status(201).json({ message: `${schedulesToCreate.length}件の通常授業スケジュールを登録しました。` });
            });
        });
    });
});
