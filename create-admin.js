// create-admin.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database('./management.db');

// --- ▼▼▼ 設定せよ ▼▼▼ ---
const adminUsername = 'admin';
const adminPassword = 'password123'; // ここに設定したい初期パスワードを入力
// --------------------------

const saltRounds = 10;

console.log(`初期管理者 '${adminUsername}' を作成し、全権限を持つ 'superadmin' ロールを割り当てます...`);

bcrypt.hash(adminPassword, saltRounds, (err, hash) => {
    if (err) {
        console.error("パスワードのハッシュ化エラー:", err);
        db.close();
        return;
    }

    db.serialize(() => {
        // --- 1. 必要なテーブルがなければ作成 ---
        // このスクリプトがサーバー初回起動より先に実行される場合を想定
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY,
            role_name TEXT UNIQUE NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS admin_roles (
            admin_id INTEGER NOT NULL,
            role_id INTEGER NOT NULL,
            FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE,
            FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
            PRIMARY KEY (admin_id, role_id)
        )`);

        // --- 2. 'superadmin' ロールがなければ作成 ---
        db.run("INSERT OR IGNORE INTO roles (role_name) VALUES ('superadmin')");

        // --- 3. 管理者ユーザーを作成 ---
        const adminSql = 'INSERT INTO admins (username, password_hash) VALUES (?, ?)';
        db.run(adminSql, [adminUsername, hash], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    console.log(`管理者 '${adminUsername}' は既に存在します。`);
                    // 既存ユーザーにsuperadminロールを割り当てる試み
                    assignSuperadminRole(adminUsername, () => db.close());
                } else {
                    console.error("管理者作成エラー:", err.message);
                    db.close();
                }
                return;
            }

            const adminId = this.lastID;
            console.log(`管理者 '${adminUsername}' (ID: ${adminId}) を作成しました。`);

            // --- 4. 作成した管理者に 'superadmin' ロールを割り当て ---
            assignSuperadminRole(adminUsername, () => db.close());
        });
    });
});

/**
 * 指定されたユーザー名を持つ管理者に 'superadmin' ロールを割り当てる関数
 * @param {string} username - 対象の管理者ユーザー名
 * @param {function} [callback] - 処理完了後に実行されるコールバック
 */
function assignSuperadminRole(username, callback) {
    const assignSql = `
        INSERT OR IGNORE INTO admin_roles (admin_id, role_id)
        SELECT
            (SELECT id FROM admins WHERE username = ?),
            (SELECT id FROM roles WHERE role_name = 'superadmin')
    `;
    db.run(assignSql, [username], function(err) {
        if (err) {
            console.error(`'${username}'へのロール割り当てエラー:`, err.message);
        } else if (this.changes > 0) {
            console.log(`管理者 '${username}' に 'superadmin' ロールを正常に割り当てました。`);
        } else {
            console.log(`管理者 '${username}' には既に 'superadmin' ロールが割り当てられています。`);
        }
        if (callback) callback();
    });
}
