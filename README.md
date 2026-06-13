# Process Schedule

製造案件のマイルストーン・工程スケジュール管理システム。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 18 + Vite |
| バックエンド | Node.js + Express |
| データベース | PostgreSQL 18 |
| E2E テスト | Playwright |

## ポート構成

| サービス | ポート |
|---------|-------|
| フロントエンド (dev) | 6100 |
| バックエンド API | 6101 |
| PostgreSQL | 5432 |

---

## セットアップ

### 前提条件

- Node.js v18 以上
- PostgreSQL 18（ローカル起動済み）

### 1. 環境変数の設定

```bash
# バックエンド
cp backend/.env.example backend/.env
# backend/.env を編集して DB_PASSWORD などを設定

# フロントエンド
cp frontend/.env.example frontend/.env
```

### 2. データベース作成

```sql
-- psql で実行
CREATE DATABASE "process-schedule";
```

スキーマは `backend/src/db/schema*.sql` を順に適用してください。

```bash
# 例（PostgreSQL 18 on Windows）
set PGPASSWORD=your_password
psql -U postgres -d process-schedule -f backend/src/db/schema.sql
psql -U postgres -d process-schedule -f backend/src/db/schema_v2.sql
# ... schema_v15.sql まで順番に適用
```

### 3. 依存パッケージのインストール

```bash
# バックエンド
cd backend
npm install

# フロントエンド
cd ../frontend
npm install

# ルート（Playwright）
cd ..
npm install
```

---

## 起動方法

### バックエンド

```bash
cd backend
node src/index.js
# → http://localhost:6101 で起動
```

### フロントエンド（開発サーバー）

```bash
cd frontend
npx vite --port 6100
# → http://localhost:6100 で起動
```

### プロダクションビルド

```bash
cd frontend
npx vite build
# → frontend/dist/ に出力
```

---

## 主要機能

- **案件一覧** — 案件の登録・検索・ステータス管理
- **ガントチャート** — 案件詳細のイベント・工程バー表示
- **プログラムガント** — 全案件横断のガント表示（月/週/日スイッチ）
- **MSパターン管理** — マイルストーンパターンの CRUD・論理削除
- **工程パターン管理** — 工程ステップパターンの管理
- **アラート** — 遅延検知・自動アラート生成

---

## ディレクトリ構成

```
Process_Schedule/
├── backend/
│   ├── src/
│   │   ├── index.js          # エントリーポイント
│   │   ├── db/               # DB接続・スキーマSQL
│   │   ├── routes/           # APIルート
│   │   └── middleware/
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # ルーティング・ナビ
│   │   ├── api/              # API クライアント
│   │   ├── components/       # 共通コンポーネント
│   │   └── pages/            # ページコンポーネント
│   ├── .env.example
│   └── package.json
├── tests/
│   └── e2e/                  # Playwright E2E テスト
├── docs/
│   ├── GIT_WORKFLOW.md
│   ├── PORT_MANAGEMENT.md
│   └── sql/
│       └── archive/          # 実行済みSQLアーカイブ
├── scripts/                  # ユーティリティスクリプト
└── README.md
```

---

## E2E テスト

```bash
# ルートで実行（backend・frontend が起動中であること）
node tests/e2e/e2e-check.js
```

---

## 注意事項

- `.env` ファイルはコミット禁止（DB パスワード等を含む）
- `backend/.env` と `frontend/.env` はそれぞれ `.env.example` をコピーして作成
- 論理削除を採用（物理 DELETE は原則禁止）
- `project_events.diff_days` は PostgreSQL 生成列（手動更新不要）
