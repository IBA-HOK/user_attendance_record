const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const archiver = require('archiver');
const unzipper = require('unzipper');
const csv = require('csv-parser');
const multer = require('multer');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });

const app = express();
const port = 3000;

// ==================================================================
//  権限定義
// ==================================================================
const allPermissions = [
    { name: 'manage_users', description: '生徒の作成・編集・削除' },
    { name: 'view_users', description: '生徒の一覧・詳細表示' },
    { name: 'manage_schedules', description: 'スケジュールの作成・編集・削除' },
    { name: 'view_schedules', description: 'スケジュールの一覧表示' },
    { name: 'manage_masters', description: 'PC・授業コマの管理' },
    { name: 'view_masters', description: 'PC・授業コマの表示' },
    { name: 'perform_backup', description: 'バックアップの実行' },
    { name: 'manage_admins', description: '管理者とロールの管理' },
];

function createApp(db) {
    const app = express();

    // --- データベースのテーブル作成 ---
    db.serialize(() => {
        db.run("PRAGMA foreign_keys = ON;");

        // 1. 管理者テーブル (roleカラムは削除)
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )`);

        // 2. ロールテーブル (新規)
        db.run(`CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY,
            role_name TEXT UNIQUE NOT NULL
        )`);

        // 3. 権限テーブル (新規)
        db.run(`CREATE TABLE IF NOT EXISTS permissions (
            id INTEGER PRIMARY KEY,
            permission_name TEXT UNIQUE NOT NULL,
            description TEXT
        )`);

        // 4. 管理者とロールの紐付けテーブル (新規, 多対多)
        db.run(`CREATE TABLE IF NOT EXISTS admin_roles (
            admin_id INTEGER NOT NULL,
            role_id INTEGER NOT NULL,
            FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE,
            FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
            PRIMARY KEY (admin_id, role_id)
        )`);

        // 5. ロールと権限の紐付けテーブル (新規, 多対多)
        db.run(`CREATE TABLE IF NOT EXISTS role_permissions (
            role_id INTEGER NOT NULL,
            permission_id INTEGER NOT NULL,
            FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
            PRIMARY KEY (role_id, permission_id)
        )`);

        // 権限データをDBに挿入
        const stmt = db.prepare("INSERT OR IGNORE INTO permissions (permission_name, description) VALUES (?, ?)");
        allPermissions.forEach(p => stmt.run(p.name, p.description));
        stmt.finalize();

        // (その他のテーブルは変更なし)
        db.run(`CREATE TABLE IF NOT EXISTS pcs (pc_id TEXT PRIMARY KEY, pc_name TEXT NOT NULL, notes TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, user_level TEXT DEFAULT '通常', default_pc_id TEXT, FOREIGN KEY (default_pc_id) REFERENCES pcs(pc_id) ON DELETE SET NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS class_slots (slot_id INTEGER PRIMARY KEY, day_of_week INTEGER NOT NULL, period INTEGER NOT NULL, slot_name TEXT NOT NULL UNIQUE, start_time TEXT, end_time TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS schedules (schedule_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, class_date TEXT NOT NULL, slot_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT '通常', assigned_pc_id TEXT, notes TEXT, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE, FOREIGN KEY (slot_id) REFERENCES class_slots(slot_id) ON DELETE CASCADE, FOREIGN KEY (assigned_pc_id) REFERENCES pcs(pc_id) ON DELETE SET NULL)`);
        db.run(`CREATE TABLE IF NOT EXISTS entry_logs (log_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, log_time TEXT NOT NULL, log_type TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE)`);
    });

    // --- ミドルウェア設定 ---
    app.use(express.json());
    app.use(cookieParser());
    app.use(session({
        secret: 'a-much-more-secure-secret-key-than-before-is-needed',
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
    }));

    // --- 新しい権限チェックミドルウェア ---
    const checkPermission = (permissionName) => {
        return async (req, res, next) => {
            if (!req.session.user || !req.session.user.id) {
                return res.status(401).json({ error: '認証が必要です。' });
            }
            const adminId = req.session.user.id;

            try {
                // superadminロールを持つかチェック
                const superadminRole = await new Promise((resolve, reject) => {
                    db.get(`SELECT r.id FROM roles r JOIN admin_roles ar ON r.id = ar.role_id
                            WHERE r.role_name = 'superadmin' AND ar.admin_id = ?`, [adminId], (err, row) => {
                        if (err) reject(err);
                        resolve(row);
                    });
                });

                if (superadminRole) return next(); // superadminは全権限

                // 必要な権限を持っているかチェック
                const sql = `
                    SELECT 1 FROM admin_roles ar
                    JOIN role_permissions rp ON ar.role_id = rp.role_id
                    JOIN permissions p ON rp.permission_id = p.id
                    WHERE ar.admin_id = ? AND p.permission_name = ?
                `;
                const hasPermission = await new Promise((resolve, reject) => {
                    db.get(sql, [adminId, permissionName], (err, row) => {
                        if (err) reject(err);
                        resolve(row);
                    });
                });

                if (hasPermission) return next();

                return res.status(403).json({ error: 'この操作を行う権限がありません。' });

            } catch (error) {
                return res.status(500).json({ error: '権限の確認中にエラーが発生しました。' });
            }
        };
    };

    // --- ログイン・認証周り ---
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body;
        db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
            if (err || !admin) return res.status(401).json({ error: "ユーザー名またはパスワードが違います。" });
            const match = await bcrypt.compare(password, admin.password_hash);
            if (match) {
                req.session.user = { id: admin.id, username: admin.username }; // roleは削除
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

    app.use((req, res, next) => {
        // ログインページ自体や、そのページの動作に必要なファイルは、チェックせず通す
        const publicPaths = ['/login.html', '/login.js', '/styles.css'];
        if (publicPaths.includes(req.path)) {
            return next();
        }

        // セッション（許可証）があれば、通す
        if (req.session.user) {
            return next();
        }

        // 許可証がなく、かつAPIへのリクエストだった場合
        // 「認証が必要だ」というJSONを返し、処理を中断する
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: '認証が必要です。' });
        }

        // 許可証がなく、API以外へのリクエストだった場合（人間からのアクセスと判断）
        // ログインページへ送り返す
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
    // --- 【新規】権限(Permissions) API ---
    app.get('/api/permissions', checkPermission('manage_admins'), (req, res) => {
        db.all("SELECT id, permission_name, description FROM permissions ORDER BY id", (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    // --- 【新規】ロール(Roles) API ---
    app.get('/api/roles', checkPermission('manage_admins'), (req, res) => {
        db.all("SELECT id, role_name FROM roles", (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
    app.post('/api/roles', checkPermission('manage_admins'), (req, res) => {
        const { role_name } = req.body;
        db.run('INSERT INTO roles (role_name) VALUES (?)', [role_name], function(err) {
            if (err) return res.status(400).json({ error: 'ロール名が重複しています。' });
            res.status(201).json({ id: this.lastID, role_name });
        });
    });
    app.get('/api/roles/:id/permissions', checkPermission('manage_admins'), (req, res) => {
        const sql = "SELECT p.id, p.permission_name FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?";
        db.all(sql, [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(r => r.id)); // 権限IDの配列を返す
        });
    });
    app.post('/api/roles/:id/permissions', checkPermission('manage_admins'), (req, res) => {
        const roleId = req.params.id;
        const { permission_ids } = req.body; // [1, 3, 5] のようなIDの配列
        db.serialize(() => {
            db.run("DELETE FROM role_permissions WHERE role_id = ?", [roleId]);
            const stmt = db.prepare("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)");
            permission_ids.forEach(pid => stmt.run(roleId, pid));
            stmt.finalize(err => {
                if (err) return res.status(500).json({ error: '権限の更新に失敗しました。' });
                res.json({ success: true });
            });
        });
    });
    // --- 【更新】管理者(Admins) API ---
    app.get('/api/admins', checkPermission('manage_admins'), (req, res) => {
        const sql = `
            SELECT a.id, a.username, GROUP_CONCAT(r.role_name, ', ') as roles
            FROM admins a
            LEFT JOIN admin_roles ar ON a.id = ar.admin_id
            LEFT JOIN roles r ON ar.role_id = r.id
            GROUP BY a.id
        `;
        db.all(sql, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });
    app.post('/api/admins', checkPermission('manage_admins'), async (req, res) => {
        const { username, password, role_ids } = req.body;
        if (!username || !password || !role_ids || role_ids.length === 0) {
            return res.status(400).json({ error: "ユーザー名、パスワード、最低一つのロールは必須です。" });
        }
        try {
            const hash = await bcrypt.hash(password, 10);
            const adminSql = 'INSERT INTO admins (username, password_hash) VALUES (?, ?)';
            db.run(adminSql, [username, hash], function(err) {
                if (err) return res.status(400).json({ error: "このユーザー名は既に使用されています。" });
                const adminId = this.lastID;
                const roleStmt = db.prepare("INSERT INTO admin_roles (admin_id, role_id) VALUES (?, ?)");
                role_ids.forEach(rid => roleStmt.run(adminId, rid));
                roleStmt.finalize(err => {
                    if (err) return res.status(500).json({ error: '管理者のロール設定に失敗しました。' });
                    res.status(201).json({ id: adminId, username });
                });
            });
        } catch (error) {
            res.status(500).json({ error: "管理者作成中にエラーが発生しました。" });
        }
    });


    // --- ユーザー (users) CRUD API ---
    app.get('/api/users', checkPermission('view_users'), (req, res) => {
        const { name } = req.query;
        let sql = "SELECT u.*, p.pc_name as default_pc_name FROM users u LEFT JOIN pcs p ON u.default_pc_id = p.pc_id";
        const params = [];

        if (name) {
            sql += " WHERE u.name LIKE ?";
            params.push(`%${name}%`);
        }

        sql += " ORDER BY u.name";

        db.all(sql, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ users: rows });
        });
    });
    app.post('/api/users', checkPermission('manage_users'), (req, res) => {
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
        db.run(sql, [name, email, user_level, default_pc_id, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "ユーザーが見つかりません" });
            res.status(200).json({ message: "更新成功" });
        });
    });
    app.delete('/api/users/:id', (req, res) => {
        db.run('DELETE FROM users WHERE user_id = ?', req.params.id, function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "ユーザーが見つかりません" });
            res.status(200).json({ message: "削除成功" });
        });
    });

    /**
     * API: 特定の生徒の全情報を取得
     * GET /api/student-info/:id
     */
    app.get('/api/student-info/:id', (req, res) => {
        const { id } = req.params;
        const studentData = {};

        const userSql = "SELECT u.*, p.pc_name as default_pc_name FROM users u LEFT JOIN pcs p ON u.default_pc_id = p.pc_id WHERE u.user_id = ?";
        const scheduleSql = "SELECT s.*, c.slot_name FROM schedules s JOIN class_slots c ON s.slot_id = c.slot_id WHERE s.user_id = ? ORDER BY s.class_date DESC";
        const logSql = "SELECT * FROM entry_logs WHERE user_id = ? AND log_type = 'entry' ORDER BY log_time DESC";

        db.get(userSql, [id], (err, user) => {
            if (err || !user) return res.status(404).json({ error: "生徒が見つかりません。" });
            studentData.profile = user;

            db.all(scheduleSql, [id], (err, schedules) => {
                if (err) return res.status(500).json({ error: err.message });
                studentData.schedules = schedules;

                db.all(logSql, [id], (err, logs) => {
                    if (err) return res.status(500).json({ error: err.message });
                    studentData.logs = logs;
                    res.json(studentData);
                });
            });
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


    app.put('/api/pcs/:id', (req, res) => {
        const { pc_name, notes } = req.body;
        if (!pc_name) return res.status(400).json({ error: "PC名は必須です。" });
        db.run('UPDATE pcs SET pc_name = ?, notes = ? WHERE pc_id = ?', [pc_name, notes, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "PCが見つかりません。" });
            res.status(200).json({ message: "PC情報を更新しました。" });
        });
    });

    app.delete('/api/pcs/:id', (req, res) => {
        db.run('DELETE FROM pcs WHERE pc_id = ?', [req.params.id], function (err) {
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
        db.run(sql, [day_of_week, period, slot_name, start_time, end_time], function (err) {
            if (err) return res.status(400).json({ error: "そのコマ名は既に使用されています。" });
            res.status(201).json({ slot_id: this.lastID });
        });
    });

    app.get('/api/class_slots', (req, res) => {
        const { dayOfWeek } = req.query; //曜日をクエリパラメータで受け取る

        let sql = "SELECT * FROM class_slots";
        const params = [];

        if (dayOfWeek) {
            sql += " WHERE day_of_week = ?";
            params.push(dayOfWeek);
        }

        sql += " ORDER BY day_of_week, period";

        db.all(sql, params, (err, rows) => {
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
        db.run(sql, [day_of_week, period, slot_name, start_time, end_time, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "コマが見つかりません。" });
            res.status(200).json({ message: "コマ情報を更新しました。" });
        });
    });

    app.delete('/api/class_slots/:id', (req, res) => {
        db.run('DELETE FROM class_slots WHERE slot_id = ?', [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "コマが見つかりません。" });
            res.status(200).json({ message: "コマを削除しました。" });
        });
    });
    // ... 他のコマ用API(PUT, DELETE)も同様に作成 ...

    /**
     * API: 全データのCSVエクスポート (ZIP圧縮)
     * GET /api/export
     */
    app.get('/api/export', (req, res) => {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const zipFileName = `backup-${timestamp}.zip`;

        // ダウンロード用のヘッダーを設定
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);

        const archive = archiver('zip', {
            zlib: { level: 9 } // 圧縮レベルを最大に設定
        });

        // エラーハンドリング
        archive.on('error', function (err) {
            throw err;
        });

        // レスポンスにZIPストリームをパイプ
        archive.pipe(res);

        const tables = ['admins', 'pcs', 'users', 'class_slots', 'schedules', 'entry_logs'];
        let completed = 0;

        // 各テーブルを非同期で処理
        tables.forEach(table => {
            db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
                if (err) {
                    console.error(`テーブル ${table} のエクスポートエラー:`, err);
                    // エラーが発生しても処理を続行し、最終的にZIPを閉じる
                } else if (rows.length > 0) {
                    // JSONからCSVへの変換
                    const keys = Object.keys(rows[0]);
                    const header = keys.join(',') + '\n';
                    const csvRows = rows.map(row => {
                        return keys.map(key => {
                            let val = row[key];
                            if (val === null || val === undefined) {
                                return '';
                            }
                            // カンマやダブルクォートを含む場合はダブルクォートで囲む
                            val = val.toString();
                            if (val.includes(',') || val.includes('"')) {
                                return `"${val.replace(/"/g, '""')}"`;
                            }
                            return val;
                        }).join(',');
                    }).join('\n');

                    const csvData = header + csvRows;
                    // CSVデータをファイルとしてZIPに追加
                    archive.append(csvData, { name: `${table}.csv` });
                }

                completed++;
                // 全てのテーブルの処理が終わったらZIPをファイナライズ
                if (completed === tables.length) {
                    archive.finalize();
                }
            });
        });
    });
    /**
     * API: 全データのインポート (ZIP形式のCSVファイルから)
     * POST /api/import
     */
    app.post('/api/import', upload.single('backupFile'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'バックアップファイルがアップロードされていません。' });
        }

        const filePath = req.file.path;
        const tablesInOrder = ['admins', 'pcs', 'users', 'class_slots', 'schedules', 'entry_logs'];

        const run = (sql, params = []) => new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) return reject(err);
                resolve(this);
            });
        });

        try {
            const importData = {};
            await new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(unzipper.Parse())
                    .on('entry', function (entry) {
                        const tableName = entry.path.replace('.csv', '');
                        if (tablesInOrder.includes(tableName)) {
                            importData[tableName] = [];
                            entry.pipe(csv()).on('data', (data) => importData[tableName].push(data));
                        } else {
                            entry.autodrain();
                        }
                    })
                    .on('finish', resolve)
                    .on('error', reject);
            });

            await run("BEGIN TRANSACTION");

            for (const table of [...tablesInOrder].reverse()) {
                await run(`DELETE FROM ${table}`);
            }

            // sqlite_sequence テーブルが存在しない場合のエラーを握りつぶす
            try {
                await run("DELETE FROM sqlite_sequence");
            } catch (e) {
                // 「no such table」エラーは、テーブルがまだ存在しない正常なケースなので無視する
                if (!e.message.includes('no such table: sqlite_sequence')) {
                    throw e; // それ以外の予期せぬエラーは再スローしてトランザクションを失敗させる
                }
            }

            for (const table of tablesInOrder) {
                const records = importData[table];
                if (records && records.length > 0) {
                    const keys = Object.keys(records[0]);
                    const placeholders = keys.map(() => '?').join(',');
                    const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;

                    const stmt = db.prepare(sql);
                    for (const record of records) {
                        const values = keys.map(key => (record[key] === '' || record[key] === null || record[key] === undefined) ? null : record[key]);
                        await new Promise((resolve, reject) => {
                            stmt.run(values, err => {
                                if (err) return reject(err);
                                resolve();
                            });
                        });
                    }
                    await new Promise((resolve, reject) => {
                        stmt.finalize(err => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                }
            }

            await run("COMMIT");
            res.json({ message: "データのインポートが正常に完了しました。" });

        } catch (error) {
            await run("ROLLBACK").catch(rbError => console.error("Rollback failed:", rbError));
            res.status(500).json({ error: `インポート失敗: ${error.message}` });
        } finally {
            fs.unlinkSync(filePath);
        }
    });
    // --- スケジュール (schedules) API ---

    // 【強化版】スケジュールを取得（日付範囲、ステータスでの絞り込みに対応）
    app.get('/api/schedules', (req, res) => {
        // ▼▼▼ `date` をクエリパラメータとして受け取る ▼▼▼
        const { date, startDate, endDate, status, userId, name } = req.query;

        let sql = `
        SELECT s.schedule_id, s.class_date, s.status, s.notes, 
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

        // ▼▼▼ `date`パラメータを処理するロジックを追加 ▼▼▼
        if (date) {
            conditions.push("s.class_date = ?");
            params.push(date);
        } else {
            // 従来の範囲指定
            if (startDate) {
                conditions.push("s.class_date >= ?");
                params.push(startDate);
            }
            if (endDate) {
                conditions.push("s.class_date <= ?");
                params.push(endDate);
            }
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
        // ▼▼▼ notes を受け取る ▼▼▼
        const { user_id, class_date, slot_id, status, assigned_pc_id, notes } = req.body;
        if (!user_id || !class_date || !slot_id || !status) return res.status(400).json({ error: "必須項目が不足しています。" });
        // ▼▼▼ notes をSQLに追加 ▼▼▼
        const sql = 'INSERT INTO schedules (user_id, class_date, slot_id, status, assigned_pc_id, notes) VALUES (?, ?, ?, ?, ?, ?)';
        db.run(sql, [user_id, class_date, slot_id, status, assigned_pc_id, notes], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ schedule_id: this.lastID });
        });
    });

    // スケジュールを一件更新
    app.put('/api/schedules/:id', (req, res) => {
        // ▼▼▼ notes を受け取る ▼▼▼
        const { class_date, slot_id, status, assigned_pc_id, notes } = req.body;
        if (!class_date || !slot_id || !status) return res.status(400).json({ error: "必須項目が不足しています。" });
        // ▼▼▼ notes をSQLに追加 ▼▼▼
        const sql = 'UPDATE schedules SET class_date = ?, slot_id = ?, status = ?, assigned_pc_id = ?, notes = ? WHERE schedule_id = ?';
        db.run(sql, [class_date, slot_id, status, assigned_pc_id, notes, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "対象のスケジュールが見つかりません。" });
            res.status(200).json({ message: "スケジュールを更新しました。" });
        });
    });
    app.get('/api/users/:id', (req, res) => {
        const sql = "SELECT u.*, p.pc_name as default_pc_name FROM users u LEFT JOIN pcs p ON u.default_pc_id = p.pc_id WHERE u.user_id = ?";
        db.get(sql, [req.params.id], (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!row) {
                // ここで404エラーを返すことで、フロントエンドは「ユーザーが見つからない」と判断できる
                return res.status(404).json({ error: "ユーザーが見つかりません。" });
            }
            res.json(row);
        });
    });

    // 【実装】スケジュールを一件削除
    app.delete('/api/schedules/:id', (req, res) => {
        db.run('DELETE FROM schedules WHERE schedule_id = ?', [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: "対象のスケジュールが見つかりません。" });
            res.status(200).json({ message: "スケジュールを削除しました。" });
        });
    });
    app.put('/api/schedules/:id/status', (req, res) => {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: "ステータスが指定されていません。" });
        }
        const sql = 'UPDATE schedules SET status = ? WHERE schedule_id = ?';
        db.run(sql, [status, req.params.id], function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: "対象のスケジュールが見つかりません。" });
            }
            res.status(200).json({ message: "ステータスを正常に更新しました。" });
        });
    });

    /**
     * API: 指定した日付の全スケジュール情報を取得（end_timeも完全に取得）
     */
    app.get('/api/daily-roster', (req, res) => {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: "日付が指定されていません。" });
        }

        // JSTでの日付から曜日を計算
        const dayOfWeek = new Date(date + 'T00:00:00').getDay();

        const sql = `
        SELECT
            s.schedule_id, s.status, s.notes,
            u.user_id, u.name as user_name, u.user_level,
            c.slot_id, c.slot_name, c.start_time, c.end_time, c.period, -- ▼▼▼ c.end_time を追加 ▼▼▼
            p.pc_name,
            (SELECT log_time FROM entry_logs 
             WHERE user_id = s.user_id AND log_type = 'entry' AND date(log_time, '+9 hours') = ?
             ORDER BY log_time DESC LIMIT 1) as entry_log_time
        FROM class_slots c
        LEFT JOIN schedules s ON c.slot_id = s.slot_id AND s.class_date = ?
        LEFT JOIN users u ON s.user_id = u.user_id
        LEFT JOIN pcs p ON s.assigned_pc_id = p.pc_id
        WHERE c.day_of_week = ?
        ORDER BY c.period, u.name
    `;

        // パラメータが3つあることに注意
        db.all(sql, [date, date, dayOfWeek], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(row => ({ ...row, is_present: !!row.entry_log_time })));
        });
    });
    // --- 入退室ログ (entry_logs) API ---

    app.post('/api/entry_logs', (req, res) => {
        const { user_id, log_time, log_type } = req.body;
        if (!user_id || !log_type) return res.status(400).json({ error: "user_idとlog_typeは必須です。" });
        const timeToLog = log_time || new Date().toISOString();
        db.run('INSERT INTO entry_logs (user_id, log_time, log_type) VALUES (?, ?, ?)', [user_id, timeToLog, log_type], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: "ログを記録しました。" });
        });
    });
    /**
     * API: ライブダッシュボードから生徒を「欠席」にする
     * POST /api/live/make-absent
     */
    app.post('/api/live/make-absent', (req, res) => {
        const { user_id } = req.body;
        if (!user_id) {
            return res.status(400).json({ error: "user_idが指定されていません。" });
        }

        // 現在のコマ情報を特定する
        const now = new Date();
        const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const dayOfWeek = jstNow.getUTCDay();
        const currentTime = jstNow.getUTCHours().toString().padStart(2, '0') + ':' + jstNow.getUTCMinutes().toString().padStart(2, '0');
        const todayDate = jstNow.toISOString().split('T')[0];

        const findSlotSql = `SELECT * FROM class_slots WHERE day_of_week = ? AND start_time <= ? AND end_time > ? ORDER BY start_time DESC LIMIT 1`;
        db.get(findSlotSql, [dayOfWeek, currentTime, currentTime], (err, slot) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!slot) return res.status(404).json({ error: "現在、授業時間外です。" });

            // 対象のスケジュールを特定してステータスを更新
            const updateSql = `
            UPDATE schedules 
            SET status = '欠席' 
            WHERE user_id = ? AND class_date = ? AND slot_id = ? AND status != '欠席'
        `;
            db.run(updateSql, [user_id, todayDate, slot.slot_id], function (err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ error: "対象のスケジュールが見つからないか、既に欠席としてマークされています。" });
                }
                res.status(200).json({ message: "ステータスを「欠席」に更新しました。" });
            });
        });
    });
    /**
     * API: 今日の入室ログを削除する（出席取り消し用）
     * DELETE /api/entry_logs/today
     */
    app.delete('/api/entry_logs/today', (req, res) => {
        const { user_id } = req.body;
        if (!user_id) {
            return res.status(400).json({ error: "user_idが指定されていません。" });
        }

        // JSTでの今日の日付を取得
        const now = new Date();
        const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const todayDate = jstNow.toISOString().split('T')[0];

        const sql = `
        DELETE FROM entry_logs 
        WHERE user_id = ? AND log_type = 'entry' AND date(log_time, '+9 hours') = ?
    `;

        db.run(sql, [user_id, todayDate], function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: "削除対象の出席記録が見つかりません。" });
            }
            res.status(200).json({ message: "出席記録を取り消しました。" });
        });
    });
    app.get('/api/live/current-class', (req, res) => {
        const now = new Date();
        const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const dayOfWeek = jstNow.getUTCDay();
        const currentTime = jstNow.getUTCHours().toString().padStart(2, '0') + ':' + jstNow.getUTCMinutes().toString().padStart(2, '0');
        const todayDate = jstNow.toISOString().split('T')[0];

        const findSlotSql = `SELECT * FROM class_slots WHERE day_of_week = ? AND start_time <= ? AND end_time > ? ORDER BY start_time DESC LIMIT 1`;
        db.get(findSlotSql, [dayOfWeek, currentTime, currentTime], (err, slot) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!slot) return res.json({ message: "現在、授業時間外です。" });

            // ▼▼▼ SELECT句に s.status を追加 ▼▼▼
            const getAttendeesSql = `
            SELECT
                s.user_id, s.notes, s.status,
                u.name, u.user_level,
                p.pc_name,
                (SELECT log_time FROM entry_logs 
                 WHERE user_id = s.user_id AND log_type = 'entry' AND date(log_time, '+9 hours') = ?
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
                    attendees: attendees.map(a => ({ ...a, is_present: !!a.entry_log_time }))
                });
            });
        });
    });
    /**
     * API: 指定した日に出席記録のない出席予定者を取得
     * GET /api/unaccounted
     */
    app.get('/api/unaccounted', (req, res) => {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: "日付が指定されていません。" });
        }

        const sql = `
        SELECT 
            s.schedule_id, s.class_date, s.status,
            u.user_id, u.name AS user_name,
            c.slot_name
        FROM schedules s
        JOIN users u ON s.user_id = u.user_id
        JOIN class_slots c ON s.slot_id = c.slot_id
        WHERE
            s.class_date = ?
            AND s.status != '欠席'
            AND NOT EXISTS (
                SELECT 1 FROM entry_logs el 
                WHERE el.user_id = s.user_id 
                AND date(el.log_time, '+9 hours') = s.class_date
                AND el.log_type = 'entry'
            )
        ORDER BY c.period, u.name -- 
    `;

        db.all(sql, [date], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        });
    });


    /**
     * API: 入退室ログを一件記録
     */
    app.post('/api/entry_logs', (req, res) => {
        const { user_id, log_type } = req.body;
        if (!user_id || !log_type) return res.status(400).json({ error: "user_idとlog_typeは必須です。" });
        // JSTでの現在時刻を記録
        const log_time = new Date().toISOString();

        // 退室記録の場合は、同じ日の入室記録を消す、などのロジックも追加可能
        // 今回はシンプルにログを追加するだけ
        db.run('INSERT INTO entry_logs (user_id, log_time, log_type) VALUES (?, ?, ?)', [user_id, log_time, log_type], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: "ログを記録しました。" });
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

        db.get('SELECT * FROM class_slots WHERE slot_id = ?', [slot_id], (err, slot) => {
            if (err || !slot) return res.status(404).json({ error: "指定されたコマが見つかりません。" });

            const schedulesToCreate = [];
            let currentDate = new Date(); // 今日から開始
            const endDate = new Date(term_end_date);
            const targetDay = slot.day_of_week;

            while (currentDate <= endDate) {
                if (currentDate.getDay() === targetDay) {
                    // ▼▼▼ この日付フォーマット部分を修正 ▼▼▼
                    const year = currentDate.getFullYear();
                    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
                    const day = currentDate.getDate().toString().padStart(2, '0');
                    const dateString = `${year}-${month}-${day}`;
                    // ▲▲▲ toISOString()の使用をやめ、ローカル日付を直接使用 ▲▲▲

                    schedulesToCreate.push([user_id, dateString, slot_id, '通常', pc_id]);
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }

            if (schedulesToCreate.length === 0) {
                return res.status(400).json({ error: "指定された期間に該当する授業日がありません。" });
            }

            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                try {
                    db.run("DELETE FROM schedules WHERE user_id = ? AND status = '通常'", [user_id]);
                    const stmt = db.prepare('INSERT INTO schedules (user_id, class_date, slot_id, status, assigned_pc_id) VALUES (?, ?, ?, ?, ?)');
                    schedulesToCreate.forEach(schedule => {
                        stmt.run(schedule);
                    });
                    stmt.finalize((err) => {
                        if (err) throw err;
                        db.run("COMMIT", (commitErr) => {
                            if (commitErr) throw commitErr;
                            res.status(201).json({ message: `${schedulesToCreate.length}件の通常授業スケジュールを登録しました。` });
                        });
                    });
                } catch (e) {
                    db.run("ROLLBACK");
                    res.status(500).json({ error: `一括登録中にエラーが発生しました: ${e.message}` });
                }
            });
        });
    });

    return app;
}

module.exports = { createApp }; // 関数をエクスポート
// --- サーバー起動と終了処理 ---
if (require.main === module) {
    const db = new sqlite3.Database('./management.db');
    const app = createApp(db);
    const server = app.listen(3000, () => {
        console.log(`サーバーがポート3000で起動しました。`);
        // superadminロールの存在を確認し、なければ作成
        db.get("SELECT id FROM roles WHERE role_name = 'superadmin'", (err, row) => {
            if (!row) {
                console.log("初回起動: 'superadmin'ロールを作成します。");
                db.run("INSERT INTO roles (role_name) VALUES ('superadmin')");
            }
        });
    });

    process.on('SIGINT', () => {
        console.log("サーバーをシャットダウンします。");
        server.close(() => db.close(() => process.exit(0)));
    });
}
