// check_db.js
// 必要なモジュールをインポート
const sqlite3 = require('sqlite3').verbose();

// 接続するデータベースファイル
const dbFile = './customer_data.db';

// 読み取り専用でデータベースに接続
const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        // 接続に失敗した場合はエラーを出力
        console.error(`データベースファイル（${dbFile}）への接続に失敗しました。\nヒント: 先にサーバーを起動してデータを記録したか確認してください。`, err.message);
        return;
    }
    console.log(`データベースファイル（${dbFile}）への接続に成功しました。データの読み込みを開始します。`);
});

// データを取得するためのSQLクエリ
// customer_logsテーブルから全てのデータをタイムスタンプの降順（新しい順）で取得
const sql = `SELECT id, customer_id, timestamp FROM customer_logs ORDER BY timestamp DESC`;

// db.all() を使って全ての行を取得する
db.all(sql, [], (err, rows) => {
    if (err) {
        // クエリ実行に失敗した場合はエラーを出力
        console.error('データの取得に失敗しました。', err.message);
        return;
    }

    // 取得したデータを表示
    console.log('------------ データベースのログ ------------');
    if (rows.length === 0) {
        console.log('ログはまだ記録されていません。');
    } else {
        rows.forEach((row) => {
            console.log(`ID: ${row.id}, 顧客ID: ${row.customer_id}, 時刻: ${row.timestamp}`);
        });
    }
    console.log('----------------------------------------');
    console.log('読み込みが完了しました。');
});

// データベース接続を閉じる
db.close((err) => {
    if (err) {
        console.error('データベース接続のクローズ中にエラーが発生しました。', err.message);
    }
});