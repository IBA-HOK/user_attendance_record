// server.js (True Final Gatekeeper Edition)

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');

const app = express();
const port = 3000;

// --- データベース設定 ---
const db = new sqlite3.Database('./management.db');
// (テーブル作成処理は変更なし)
db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON;");
    db.run(`CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS pcs (pc_id TEXT PRIMARY KEY, pc_name TEXT NOT NULL, notes TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, user_level TEXT DEFAULT '通常', default_pc_id TEXT, FOREIGN KEY (default_pc_id) REFERENCES pcs(pc_id) ON DELETE SET NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS class_slots (slot_id INTEGER PRIMARY KEY, day_of_week INTEGER NOT NULL, period INTEGER NOT NULL, slot_name TEXT NOT NULL UNIQUE, start_time TEXT, end_time TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS schedules (schedule_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, class_date TEXT NOT NULL, slot_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT '通常', assigned_pc_id TEXT, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE, FOREIGN KEY (slot_id) REFERENCES class_slots(slot_id) ON DELETE CASCADE, FOREIGN KEY (assigned_pc_id) REFERENCES pcs(pc_id) ON DELETE SET NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS entry_logs (log_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, log_time TEXT NOT NULL, log_type TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
});

// --- ミドルウェア設定 ---
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: 'this-is-the-final-secret-key-for-our-castle-for-real',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));


// ==================================================================
//  ルーティングとアクセス制御
// ==================================================================

// --- ログイン/ログアウトAPI (誰でもアクセス可能) ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
        if (err || !admin) return res.status(401).json({ error: "ユーザー名またはパスワードが違います。" });
        const match = await bcrypt.compare(password, admin.password_hash);
        if (match) {
            req.session.user = { id: admin.id, username: admin.username };
            res.json({ success: true, redirectTo: '/' });
        } else {
            res.status(401).json({ error: "ユーザー名またはパスワードが違います。" });
        }
    });
});
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: "ログアウト失敗" });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// --- ▼▼▼ ここが最重要の変更点：絶対的検問所の設置 ▼▼▼ ---

// まず、全てのアクセスに対する検問所を設置する
app.use((req, res, next) => {
    // ログインページ自体や、そのページの動作に必要なファイルは、チェックせず通す
    // (このリストにあるパスは、ログインしていなくてもアクセスできる)
    const publicPaths = ['/login.html', '/login.js', '/styles.css'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    // それ以外の全てのアクセスに対して、セッション（許可証）を確認する
    if (req.session.user) {
        return next(); // 許可証あり、通れ
    }

    // 許可証なし、容赦なくログインページへ送り返す
    res.redirect('/login.html');
});

// 検問所を抜けた者だけが、この先のファイルにアクセスできる
app.use(express.static(path.join(__dirname, 'public')));


// ==================================================================
// APIエンドポイント
// ==================================================================

// --- ログイン/ログアウトAPI ---
// app.post('/api/login', (req, res) => {
//     const { username, password } = req.body;
//     db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
//         if (err || !admin) return res.status(401).json({ error: "ユーザー名またはパスワードが違います。" });
//         const match = await bcrypt.compare(password, admin.password_hash);
//         if (match) {
//             req.session.user = { id: admin.id, username: admin.username };
//             res.json({ success: true });
//         } else {
//             res.status(401).json({ error: "ユーザー名またはパスワードが違います。" });
//         }
//     });
// });
// app.post('/api/logout', (req, res) => {
//     req.session.destroy(err => {
//         if (err) return res.status(500).json({ error: "ログアウト失敗" });
//         res.clearCookie('connect.sid');
//         res.json({ success: true });
//     });
// });


// --- ユーザー (users) CRUD API ---
app.get('/api/users', (req, res) => {
    const { name } = req.query;
    let sql = "SELECT u.*, p.pc_name as default_pc_name FROM users u LEFT JOIN pcs p ON u.default_pc_id = p.pc_id";
    const params = [];
    if (name) { sql += " WHERE u.name LIKE ?"; params.push(`%${name}%`); }
    sql += " ORDER BY u.name";
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/users', (req, res) => {
    const { user_id, name, email, user_level, default_pc_id } = req.body;
    if (!user_id || !name) return res.status(400).json({ error: "IDと名前は必須" });
    const sql = 'INSERT INTO users (user_id, name, email, user_level, default_pc_id) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [user_id, name, email, user_level, default_pc_id], (err) => {
        if (err) return res.status(400).json({ error: "IDが重複" });
        res.status(201).json({ user_id });
    });
});
app.put('/api/users/:id', (req, res) => {
    const { name, email, user_level, default_pc_id } = req.body;
    if (!name) return res.status(400).json({ error: "名前は必須" });
    const sql = `UPDATE users SET name = ?, email = ?, user_level = ?, default_pc_id = ? WHERE user_id = ?`;
    db.run(sql, [name, email, user_level, default_pc_id, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "ユーザーが見つかりません" });
        res.status(200).json({ message: "更新成功" });
    });
});
app.delete('/api/users/:id', (req, res) => {
    db.run('DELETE FROM users WHERE user_id = ?', req.params.id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "ユーザーが見つかりません" });
        res.status(200).json({ message: "削除成功" });
    });
});

// --- PC (pcs) CRUD API ---
app.get('/api/pcs', (req, res) => {
    db.all("SELECT * FROM pcs ORDER BY pc_id", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/pcs', (req, res) => {
    const { pc_id, pc_name, notes } = req.body;
    if (!pc_id || !pc_name) return res.status(400).json({ error: "PC IDと名前は必須" });
    db.run('INSERT INTO pcs (pc_id, pc_name, notes) VALUES (?, ?, ?)', [pc_id, pc_name, notes], (err) => {
        if (err) return res.status(400).json({ error: "PC IDが重複" });
        res.status(201).json({ pc_id });
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
app.get('/api/live/current-class', (req, res) => {
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const dayOfWeek = jstNow.getUTCDay();
    const currentTime = jstNow.getUTCHours().toString().padStart(2, '0') + ':' + jstNow.getUTCMinutes().toString().padStart(2, '0');
    const todayDate = jstNow.toISOString().split('T')[0];
    const findSlotSql = `SELECT * FROM class_slots WHERE day_of_week = ? AND start_time <= ? AND end_time > ? LIMIT 1`;
    db.get(findSlotSql, [dayOfWeek, currentTime, currentTime], (err, slot) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!slot) return res.json({ message: "現在、授業時間外です。" });

        const getAttendeesSql = `
            SELECT s.user_id, u.name, s.status, p.pc_name,
                   (SELECT log_time FROM entry_logs WHERE user_id = s.user_id AND log_type = 'entry' AND date(log_time) = ?) as entry_log_time
            FROM schedules s JOIN users u ON s.user_id = u.user_id LEFT JOIN pcs p ON s.assigned_pc_id = p.pc_id
            WHERE s.class_date = ? AND s.slot_id = ? AND s.status != '欠席'`;
        db.all(getAttendeesSql, [todayDate, todayDate, slot.slot_id], (err, attendees) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                current_class: slot,
                attendees: attendees.map(a => ({...a, is_present: !!a.entry_log_time }))
            });
        });
    });
});


// --- サーバー起動と終了処理 ---
const server = app.listen(port, () => {
    console.log(`サーバーがポート${port}で起動しました。`);
});
process.on('SIGINT', () => {
    console.log("サーバーをシャットダウンします。");
    server.close(() => db.close(() => process.exit(0)));
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
