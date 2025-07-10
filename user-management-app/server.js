// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;
const db = new sqlite3.Database('./users.db');

app.use(express.json());
app.use(express.static('public'));

// API: 全ユーザーを取得
app.get('/api/users', (req, res) => {
  db.all("SELECT * FROM users ORDER BY name", [], (err, rows) => {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    res.json({ users: rows });
  });
});

// API: 新規ユーザーを登録 (idを手動設定)
app.post('/api/users', (req, res) => {
  const { id, name, email } = req.body;
  if (!id || !name || !email) {
    return res.status(400).json({ "error": "ID、名前、メールアドレスは必須です。" });
  }
  const sql = 'INSERT INTO users (id, name, email) VALUES (?, ?, ?)';
  db.run(sql, [id, name, email], function(err) {
    if (err) {
      res.status(400).json({ "error": "そのIDまたはメールアドレスは既に使用されています。" });
      return;
    }
    res.status(201).json({ id, name, email });
  });
});

// API: ユーザー情報を更新 (PUT /api/users/:id)
app.put('/api/users/:id', (req, res) => {
    const { name, email } = req.body;
    const { id } = req.params;

    if (!name || !email) {
        return res.status(400).json({ "error": "名前とメールアドレスは必須です。" });
    }

    const sql = 'UPDATE users SET name = ?, email = ? WHERE id = ?';
    db.run(sql, [name, email, id], function(err) {
        if (err) {
            res.status(400).json({ "error": "そのメールアドレスは既に使用されています。" });
            return;
        }
        if (this.changes === 0) {
            return res.status(404).json({ "error": "指定されたIDのユーザーが見つかりません。" });
        }
        res.status(200).json({ message: 'ユーザー情報が正常に更新されました。' });
    });
});


// API: ユーザーを削除
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM users WHERE id = ?', id, function(err) {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    if (this.changes === 0) {
      return res.status(404).json({ "error": "指定されたIDのユーザーが見つかりません。" });
    }
    res.status(200).json({ message: 'ユーザーが正常に削除されました。' });
  });
});

app.listen(port, () => {
  console.log(`Wasshoi! サーバーがポート${port}で起動！ http://localhost:${port} でUIにアクセスせよ！`);
});