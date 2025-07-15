# 塾運営・総合管理システム (Attendance and Schedule Management System)

Node.jsとexpress.jsで構築された、教育機関向けの出席・スケジュール・権限管理を行うフルスタックWebアプリケーションです。

## 主な機能

### コア機能
- **ロールベース・アクセス制御 (RBAC):** カスタムロールを作成し、各ロールに詳細な権限を割り当て、管理者に複数のロールを付与できます。
- **生徒情報管理 (SIS):** 生徒のプロファイル、スケジュール、出席記録を一元管理します。
- **スケジュール管理:** 通常授業、振替、欠席など、柔軟なスケジュール調整に対応します。
- **マスターデータ管理:** 授業コマやPCなど、運営の基礎となるデータを定義します。
- **システム管理:** 管理者アカウントの管理や、データのバックアップ・リストア機能を提供します。

### 機能詳細
- **ライブダッシュボード:** 授業の出席状況をリアルタイムに表示します。
- **出席漏れ一括処理:** 未記録の出席データを効率的に処理します。
- **生徒カルテ:** スケジュール、出席ログ、備考を含む生徒の全履歴をカレンダー形式で確認できます。
- **スケジュール一括生成:** 定期的な授業スケジュールを指定日まで自動で作成します。
- **データポータビリティ:** データベース全体をCSVファイルのZIPアーカイブとしてエクスポート・インポートできます。

## 技術スタック
- **バックエンド:** Node.js, Express.js
- **データベース:** SQLite3
- **フロントエンド:** HTML, CSS, JavaScript
- **主要ライブラリ:**
  - `express-session`, `cookie-parser`: セッション管理
  - `bcrypt`: パスワードハッシュ化
  - `multer`: ファイルアップロード
  - `archiver`, `unzipper`, `csv-parser`: データI/O

## インストールとセットアップ

### 1. 前提条件
- Node.js (v18以降を推奨)

### 2. インストール
リポジトリをクローンし、依存パッケージをインストールします。
```sh
# プロジェクトディレクトリへ移動
cd user_attendance_record-main

# 依存パッケージをインストール
npm install
```

### 3. 初期管理者アカウントのセットアップ
全権限を持つスーパー管理者アカウントを作成します。
1.  プロジェクトルートの `create-admin.js` を開きます。
2.  `adminPassword` 変数を任意の安全なパスワードに変更します。
3.  ターミナルで以下のコマンドを実行します。
```sh
node create-admin.js
```
これにより `management.db` ファイルが生成され、`superadmin` ロールが割り当てられた管理者が作成されます。

### 4. サーバーの起動
```sh
node server.js
```
サーバーが `http://localhost:3000` で起動します。

## 利用方法
ブラウザで `http://localhost:3000/login.html` にアクセスし、セットアップ時に作成した認証情報でログインします。ログインユーザーに割り当てられたロールの権限に基づき、利用可能なメニューが表示されます。

## APIエンドポイント
システムは全操作に対してRESTful APIを提供します。各エンドポイントへのアクセスは、ユーザーのロールに紐づく権限に基づき、ミドルウェアによって制御されます。

| メソッド | パス | 説明 | 必要な権限 |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/login` | ユーザー認証を行い、セッションを開始します。 | (なし) |
| `GET` | `/api/my-permissions` | 現在のユーザーが持つ全権限を取得します。 | (認証のみ) |
| `GET` | `/api/admins` | 全管理者の一覧を取得します。 | `manage_admins` |
| `POST` | `/api/admins` | 新規管理者を作成します。 | `manage_admins` |
| `DELETE` | `/api/admins/:id` | 管理者を削除します。 | `manage_admins` |
| `GET` | `/api/roles` | 全ロールの一覧を取得します。 | `manage_admins` |
| `POST` | `/api/roles` | 新規ロールを作成します。 | `manage_admins` |
| `DELETE` | `/api/roles/:id` | ロールを削除します。 | `manage_admins` |
| `POST` | `/api/roles/:id/permissions` | ロールに権限を割り当てます。 | `manage_admins` |
| `GET` | `/api/users` | 全生徒の一覧を取得します。 | `view_users` |
| `POST` | `/api/users` | 新規生徒を作成します。 | `manage_users` |
| `GET` | `/api/schedules` | 条件に基づきスケジュールを検索します。 | `view_schedules` |
| `POST` | `/api/schedules/bulk` | 定期スケジュールを一括作成します。 | `manage_schedules` |
| `GET` | `/api/live/current-class` | リアルタイムの出席状況を取得します。 | `view_schedules` |
| `GET` | `/api/export` | 全データをZIPファイルにエクスポートします。 | `perform_backup` |
| `POST` | `/api/import` | ZIPファイルからデータをインポートします。 | `perform_backup` |
| ... | ... | (その他多数) | ... |
