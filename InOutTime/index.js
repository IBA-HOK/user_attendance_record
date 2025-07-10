// index.js
// 必要なモジュールをインポート
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

// Expressアプリを初期化
const app = express();
const port = 3000;

// JSON形式のリクエストボディをパースするためのミドルウェアを使用
app.use(express.json());

// SQLiteデータベースに接続
const db = new sqlite3.Database('./customer_data.db', (err) => {
    if (err) {
        // 接続に失敗した場合はエラーを出力してプロセスを終了
        console.error('データベースへの接続に失敗しました:', err.message);
        process.exit(1);
    }
    console.log('データベースへの接続に成功しました。');
    // 'customer_logs'テーブルが存在しない場合にのみ作成
    db.run(`CREATE TABLE IF NOT EXISTS customer_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        timestamp TEXT NOT NULL
    )`, (err) => {
        if (err) {
            // テーブル作成に失敗した場合はエラーを出力
            console.error('テーブルの作成に失敗しました:', err.message);
        } else {
            console.log('テーブルの準備が完了しました。');
        }
    });
});

// '/log_customer'エンドポイントでPOSTリクエストを処理
app.post('/log_customer', (req, res) => {
    // リクエストボディからcustomerIdを取得
    const { customerId } = req.body;

    // customerIdが存在しない場合は400エラーを返す
    if (!customerId) {
        return res.status(400).json({ error: 'customerIdが指定されていません。' });
    }

    // 現在時刻をISO 8601形式の文字列で取得
    const timestamp = new Date().toISOString();

    // SQLインジェクションを防ぐためにプレースホルダを使用
    const sql = `INSERT INTO customer_logs (customer_id, timestamp) VALUES (?, ?)`;

    // データベースにデータを挿入
    db.run(sql, [customerId, timestamp], function(err) {
        if (err) {
            // データベースエラーの場合は500エラーを返す
            console.error('データベースへの書き込みに失敗しました:', err.message);
            return res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
        }
        // 成功した場合は201ステータスと成功メッセージを返す
        console.log(`顧客ID '${customerId}' の記録に成功しました。新しい行IDは ${this.lastID} です。`);
        res.status(201).json({ success: true, message: `記録に成功しました。`, entryId: this.lastID });
    });
});

// 指定したポートでサーバーを起動
app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});

// アプリケーション終了時にデータベース接続を閉じる
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('データベース接続のクローズ中にエラーが発生しました:', err.message);
        }
        console.log('データベース接続が正常にクローズされました。');
        process.exit(0);
    });
});