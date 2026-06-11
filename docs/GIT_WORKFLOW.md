# Git ワークフローガイド

## チェックポイント一覧

| タグ | 内容 | 日付 |
|:---|:---|:---|
| v0.1-20process-template | 20工程テンプレート完了・schema_v4適用 | 2026-06-11 |

---

## セットアップ（初回）

```powershell
# リポジトリをクローン（リモート追加後）
git clone <repository_url>
cd Process_Schedule

# 依存パッケージのインストール
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..

# 環境変数ファイルを作成（.env.example をコピーして編集）
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
# → backend/.env の DB_PASSWORD を実際のパスワードに変更する

# DB スキーマの適用
$env:PGPASSWORD = "your_password"
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $psql -U postgres -d "process-schedule" -f backend/src/db/schema.sql
& $psql -U postgres -d "process-schedule" -f backend/src/db/schema_v2.sql
& $psql -U postgres -d "process-schedule" -f backend/src/db/schema_v3.sql
& $psql -U postgres -d "process-schedule" -f backend/src/db/schema_v4.sql
```

---

## 日常開発フロー

### 起動

```powershell
# バックエンド
cd backend
npm run start:safe      # ポート競合チェックしてから起動

# フロントエンド（別ターミナル）
cd frontend
npm run dev:safe        # ポート競合チェックしてから起動
```

### 最新取得

```powershell
git pull origin main
```

---

## コミット手順

### 機能単位でコミット

```powershell
git add <変更ファイル>       # 個別指定推奨（git add -A は非推奨）
git status                  # 秘密情報・node_modules が含まれていないか確認
git commit -m "fix: unknown lock display"
```

### コミットメッセージ規則

| プレフィックス | 用途 | 例 |
|:---|:---|:---|
| `feat:` | 新機能追加 | `feat: excel full field mapping` |
| `fix:` | バグ修正 | `fix: unknown lock display` |
| `chore:` | 設定変更・依存更新 | `chore: update port to 6101` |
| `db:` | DBスキーマ変更 | `db: add project_members table (schema_v5)` |
| `docs:` | ドキュメント更新 | `docs: add PORT_MANAGEMENT guide` |
| `refactor:` | リファクタリング | `refactor: extract event form component` |

---

## チェックポイントタグの作成

### 大型機能完了時・DB変更後に必ずタグを打つ

```powershell
# タグ作成
git tag v0.2-lock-fix

# タグ一覧確認
git tag -l

# リモートにプッシュ（リモート設定後）
git push origin --tags
```

### 推奨タグ命名規則

```
v<メジャー>.<マイナー>-<機能名>

v0.1-20process-template
v0.2-lock-fix
v0.3-excel-mapping
v0.4-excel-import
v1.0-mvp-release
```

---

## 復旧方法

### チェックポイントに戻す（作業中の変更を破棄）

```powershell
# 現在の変更を確認
git status
git diff

# 特定のタグに戻す（注意: 変更が消える）
git checkout v0.1-20process-template

# 最新状態（main）に戻す
git checkout main
```

### 特定ファイルだけ戻す

```powershell
git checkout v0.1-20process-template -- backend/src/routes/events.js
```

### コミット履歴から探す

```powershell
git log --oneline
git show <commit-hash>
```

---

## DB スキーマ変更ルール

### 原則: 毎回新しい migration ファイルを作る

```
backend/src/db/
├── schema.sql      # 初期スキーマ（触らない）
├── schema_v2.sql   # event_master / template 追加
├── schema_v3.sql   # 3世代実績日・delivery_status 等
├── schema_v4.sql   # 20工程テンプレート移行
├── schema_v5.sql   # 次回変更
└── ...
```

### 既存ファイルを編集しない理由

- 他環境で適用済みの場合に差分が生じる
- `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` で冪等にする

### DBコミット時のチェックリスト

- [ ] migration ファイルを `backend/src/db/schema_vN.sql` に作成済み
- [ ] `BEGIN` / `COMMIT` でトランザクション囲み済み
- [ ] ローカルで適用確認済み
- [ ] コミットメッセージに `db:` プレフィックスを付けた

---

## PID 確認・ポート kill

詳細は [PORT_MANAGEMENT.md](PORT_MANAGEMENT.md) を参照。

```powershell
# ポート確認（プロジェクトルートで）
node scripts/check-port.js 6100 6101

# 強制停止
node scripts/kill-port.js 6100
node scripts/kill-port.js 6101
```

---

## .gitignore 管理

`.env` ファイルは **コミットしない**。代わりに `.env.example` をコミットする。

```powershell
# 間違えて .env を add した場合
git reset HEAD backend/.env
```

環境変数の実体は各自の `.env` で管理し、パスワードは共有しない。
