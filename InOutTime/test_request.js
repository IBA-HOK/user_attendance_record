// test_request.js
// Node.jsの標準HTTPモジュールをインポートします
const http = require('http');

// 送信するデータをJSON形式の文字列として定義します
const data = JSON.stringify({
  // このIDを好きなものに変えてテストできます
  // Math.random()を使って毎回異なるIDを生成しています
  customerId: `client_node_${Math.floor(Math.random() * 1000)}`
});

// リクエストの各種オプションを設定します
const options = {
  hostname: 'localhost', // 接続先ホスト
  port: 3000,            // 接続先ポート
  path: '/log_customer', // エンドポイントのパス
  method: 'POST',        // HTTPメソッド
  headers: {
    'Content-Type': 'application/json', // コンテンツタイプをJSONに指定
    'Content-Length': Buffer.byteLength(data) // コンテンツの長さを指定
  }
};

// http.requestメソッドでリクエストオブジェクトを作成します
const req = http.request(options, (res) => {
  console.log(`サーバーからの応答ステータスコード: ${res.statusCode}`);
  
  // レスポンスのデータを受け取るための変数を初期化します
  let responseBody = '';
  // 'data'イベントでレスポンスの断片を受け取ります
  res.on('data', (chunk) => {
    responseBody += chunk;
  });
  
  // 'end'イベントでレスポンスの受信完了を検知します
  res.on('end', () => {
    console.log('サーバーから受信した応答ボディ:', responseBody);
    try {
      // 受信したJSON文字列をオブジェクトにパースします
      const parsedBody = JSON.parse(responseBody);
      // レスポンスに'success: true'が含まれているか確認します
      if (parsedBody.success) {
        console.log("テスト成功：データは正常に記録されました。");
      } else {
        console.error("テスト失敗：", parsedBody.error || "サーバーからエラーが返されました。");
      }
    } catch (e) {
      console.error("受信したデータのJSONパースに失敗しました。", e.message);
    }
  });
});

// リクエスト送信中にエラーが発生した場合の処理を定義します
req.on('error', (e) => {
  console.error(`リクエストの送信中に問題が発生しました: ${e.message}`);
  console.error("ヒント：Expressサーバー（index.js）が起動しているか確認してください。");
});

// リクエストボディにデータを書き込みます
req.write(data);
// リクエストを完了し、実際にサーバーへ送信します
req.end();