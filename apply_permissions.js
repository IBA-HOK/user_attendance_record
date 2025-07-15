const fs = require('fs');
const path = require('path');
const readline = require('readline');

// --- 設定 ---
const serverJsPath = path.join(__dirname, 'server.js');
const backupPath = path.join(__dirname, 'server.js.bak');

// --- APIルートと権限のマッピング ---
const permissionMap = {
    // Admins & Roles
    'GET /api/permissions': 'manage_admins',
    'GET /api/roles': 'manage_admins',
    'POST /api/roles': 'manage_admins',
    'GET /api/roles/:id/permissions': 'manage_admins',
    'POST /api/roles/:id/permissions': 'manage_admins',
    'GET /api/admins': 'manage_admins',
    'POST /api/admins': 'manage_admins',
    // Users
    'GET /api/users': 'view_users',
    'POST /api/users': 'manage_users',
    'PUT /api/users/:id': 'manage_users',
    'DELETE /api/users/:id': 'manage_users',
    'GET /api/student-info/:id': 'view_users',
    'GET /api/users/:id': 'view_users',
    // PCs & Class Slots
    'GET /api/pcs': 'view_masters',
    'POST /api/pcs': 'manage_masters',
    'PUT /api/pcs/:id': 'manage_masters',
    'DELETE /api/pcs/:id': 'manage_masters',
    'GET /api/class_slots': 'view_masters',
    'POST /api/class_slots': 'manage_masters',
    'PUT /api/class_slots/:id': 'manage_masters',
    'DELETE /api/class_slots/:id': 'manage_masters',
    // Schedules & Logs
    'GET /api/schedules': 'view_schedules',
    'POST /api/schedules': 'manage_schedules',
    'PUT /api/schedules/:id': 'manage_schedules',
    'DELETE /api/schedules/:id': 'manage_schedules',
    'PUT /api/schedules/:id/status': 'manage_schedules',
    'POST /api/schedules/bulk': 'manage_schedules',
    'POST /api/entry_logs': 'manage_schedules',
    'DELETE /api/entry_logs/today': 'manage_schedules',
    // Dashboard/Utility
    'GET /api/daily-roster': 'view_schedules',
    'POST /api/live/make-absent': 'manage_schedules',
    'GET /api/live/current-class': 'view_schedules',
    'GET /api/unaccounted': 'view_schedules',
    // Backup/Import
    'GET /api/export': 'perform_backup',
    'POST /api/import': 'perform_backup'
};

// --- メイン処理 ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const main = async () => {
    console.log('=================================================================');
    console.log('server.js のAPIエンドポイントに権限チェックを自動で追加します。');
    console.log('=================================================================');
    console.log(`\n対象ファイル: ${serverJsPath}\n`);

    if (!fs.existsSync(serverJsPath)) {
        console.error(`\nエラー: server.js が見つかりません。`);
        rl.close();
        return;
    }

    const answer = await new Promise(resolve => {
        rl.question('よろしいですか？ (y/N) ', resolve);
    });

    if (answer.toLowerCase() !== 'y') {
        console.log('キャンセルしました。');
        rl.close();
        return;
    }

    try {
        console.log(`\nバックアップを作成しています: ${backupPath}`);
        fs.copyFileSync(serverJsPath, backupPath);

        console.log('権限チェックの挿入を開始します...');
        let content = fs.readFileSync(serverJsPath, 'utf-8');
        let changes = 0;

        for (const [routeKey, permission] of Object.entries(permissionMap)) {
            const [method, route] = routeKey.split(' ');
            const lowerMethod = method.toLowerCase();

            // 正規表現用にルートのパスをエスケープ
            const escapedRoute = route.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

            // 検索する正規表現パターン
            // 例: app.get('/api/users', (req, res) => {
            // checkPermissionがまだ挿入されていない行を対象とする
            const pattern = new RegExp(`(app\\.${lowerMethod}\\s*\\(\\s*['\`"]${escapedRoute}['\`"]\\s*,\\s*)(?!checkPermission\\()`, 'g');

            // 置換後の文字列
            const replacement = `$1checkPermission('${permission}'), `;

            const newContent = content.replace(pattern, replacement);

            if (content !== newContent) {
                content = newContent;
                console.log(`  \x1b[32m[OK]\x1b[0m ${method} ${route} に '${permission}' を設定しました。`);
                changes++;
            } else {
                console.log(`  \x1b[33m[SKIP]\x1b[0m ${method} ${route} は既に設定済みか、対象が見つかりません。`);
            }
        }

        console.log('\nファイルに書き込んでいます...');
        fs.writeFileSync(serverJsPath, content, 'utf-8');

        console.log(`\n\x1b[36m処理が完了しました。${changes}箇所の変更が行われました。\x1b[0m`);

    } catch (error) {
        console.error('\nエラーが発生しました:', error);
    } finally {
        rl.close();
    }
};

main();
