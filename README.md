# Process Insight

Process Insight は、製造業向けプロジェクト・工程管理を支援するプロジェクト実行管理プラットフォームである。

## 主な機能

- 案件管理
- マイルストーン管理
- 工程パターン管理
- ガントチャート
- 複数案件俯瞰
- 予実管理
- 遅延可視化
- リスク管理

将来的には PMO Insight Platform の Process Management モジュールとして統合予定。

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

### 1. リポジトリ clone

```bash
git clone https://github.com/xiusheng-xj/process-schedule.git
cd process-schedule
```

### 2. 環境変数の設定

**Git Bash / macOS / Linux:**
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**Windows PowerShell:**
```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

`backend/.env` を開き、`DB_PASSWORD=your_password_here` を実際の PostgreSQL パスワードに変更してください。

### 3. データベース作成

**Git Bash / macOS / Linux:**
```bash
export PGPASSWORD=your_password
psql -U postgres -c 'CREATE DATABASE "process-schedule";'
```

**Windows PowerShell:**
```powershell
$env:PGPASSWORD = "your_password"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c 'CREATE DATABASE "process-schedule";'
```

### 4. スキーマ適用

`backend/src/db/` にある SQL ファイルを **番号順** に適用してください。

**Git Bash / macOS / Linux:**
```bash
export PGPASSWORD=your_password
for f in backend/src/db/schema.sql backend/src/db/schema_v{2..17}.sql; do
  echo "Applying $f..."
  psql -U postgres -d process-schedule -f "$f"
done
```

**Windows PowerShell（psql が PATH にない場合は絶対パスで）:**
```powershell
$env:PGPASSWORD = "your_password"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $psql -U postgres -d process-schedule -f backend/src/db/schema.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v2.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v3.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v4.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v5.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v6.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v7.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v8.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v9.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v10.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v11.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v12.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v13.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v14.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v15.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v16.sql
& $psql -U postgres -d process-schedule -f backend/src/db/schema_v17.sql
```

### 5. マスターデータ投入

```bash
# Git Bash / macOS / Linux
psql -U postgres -d process-schedule -f backend/src/db/seed.sql

# Windows PowerShell
& $psql -U postgres -d process-schedule -f backend/src/db/seed.sql
```

### 6. デモデータ投入（任意）

実際の画面表示を確認したい場合は demo_data.sql を追加で投入してください。

```bash
# Git Bash / macOS / Linux
psql -U postgres -d process-schedule -f backend/src/db/demo_data.sql

# Windows PowerShell
& $psql -U postgres -d process-schedule -f backend/src/db/demo_data.sql
```

デモデータの内容：

| 案件 | 内容 | 状態 |
|------|------|------|
| DEMO-001 | 標準案件 | 作業中（前半完了・後半未着） |
| DEMO-002 | 遅延案件 | 作業中（4件 overdue → 危険） |
| DEMO-003 | 完了案件 | 全イベント完了 |
| DEMO-004 | EOL案件  | カスタムイベント・前半完了 |

> demo_data.sql は CURRENT_DATE 基準で日付を計算するため、いつ実行しても同じ見た目になります。

### 7. 依存パッケージのインストール

```bash
# バックエンド
cd backend
npm install

# フロントエンド
cd ../frontend
npm install

# ルート（Playwright E2E テスト用）
cd ..
npm install
```

---

## 起動方法

### バックエンド

```bash
cd backend
npm start
# → http://localhost:6101 で起動
```

### フロントエンド（開発サーバー）

```bash
cd frontend
npm run dev
# → http://localhost:6100 で起動（vite.config.js でポート固定済み）
```

> 開発サーバーでは `/api` へのリクエストは自動的に `http://localhost:6101` へプロキシされます。

### プロダクションビルド

```bash
cd frontend
npm run build
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
process-schedule/
├── backend/
│   ├── src/
│   │   ├── index.js          # エントリーポイント
│   │   ├── db/               # DB接続・スキーマSQL (schema.sql〜schema_v15.sql)
│   │   ├── routes/           # APIルート
│   │   └── middleware/
│   ├── .env.example          # 環境変数テンプレート
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # ルーティング・ナビ
│   │   ├── api/              # API クライアント
│   │   ├── components/       # 共通コンポーネント
│   │   └── pages/            # ページコンポーネント
│   ├── .env.example          # 環境変数テンプレート
│   ├── vite.config.js        # Vite設定（ポート6100固定・APIプロキシ）
│   └── package.json
├── tests/
│   └── e2e/                  # Playwright E2E テスト
├── docs/
│   ├── GIT_WORKFLOW.md
│   ├── PORT_MANAGEMENT.md
│   └── sql/
│       └── archive/          # 実行済みSQLアーカイブ
├── scripts/                  # ポート管理ユーティリティ
├── samples/                  # サンプルデータ（Excel）
└── README.md
```

---

## サンプルデータ

`samples/process_insight_sample_data.xlsx` は、案件・マイルストーン・工程の入力イメージを示す **Excel 形式のサンプルデータ** です。

- 動作確認・データ移行の参考用であり、アプリケーションからは直接読み込まれません
- 実際の画面表示を確認したい場合は、上記「6. デモデータ投入」の `demo_data.sql` を利用してください

---

## デモ環境（動画撮影用）

操作デモ動画の撮影シナリオ（案件一覧・複数案件ガント・予実比較・新規登録・工程負荷）を
そのまま再現するためのデモ案件 10 件を投入できます。

```bash
cd backend
npm run seed:demo
```

- 投入スクリプト: [scripts/seed-demo.js](scripts/seed-demo.js)
- 案件 No は `PIDEMO-01`〜`PIDEMO-10`。**この接頭辞のみを対象**とし、既存案件
  （`DEMO-%` / 実データ / テストデータ）には一切触れません
- **冪等**: 再実行すると `PIDEMO-%` を削除してから再投入します
- 全日付は `CURRENT_DATE` 基準で計算され、いつ実行しても同じ見た目になります
- マイルストーンパターン3（リピート）/4（EOL）の工程定義が未登録の場合、
  シーン4（パターン選択→自動生成）が成立するよう自動で補完します
- 実行末尾に、画面と同一ロジックで算出した各案件の状態（正常/注意/遅延/保留/完了）を表示します

> 前提: `schema.sql`〜`schema_v17.sql` と `seed.sql`（マスターデータ）が適用済みであること。

---

## E2E テスト

backend と frontend が起動中の状態でルートから実行：

```bash
node tests/e2e/e2e-check.js
```

---

## 注意事項

- `.env` ファイルはコミット禁止（DB パスワード等を含む）
- `backend/.env` と `frontend/.env` はそれぞれ `.env.example` をコピーして作成
- 論理削除を採用（物理 DELETE は原則禁止）
- `project_events.diff_days` は PostgreSQL 生成列（手動更新不要）
- Windows で `cp` は Git Bash または PowerShell の `Copy-Item` を使用すること
