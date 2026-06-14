# CLAUDE.md — Process Schedule 開発ルール

共通ルールは [`CLAUDE_COMMON.md`](../CLAUDE_COMMON.md) を参照すること。

---

## リポジトリ概要

- **GitHub**: https://github.com/xiusheng-xj/process-schedule
- **技術スタック**: Node.js (Express) + PostgreSQL + React
- **DB**: PostgreSQL (本番・開発とも)
- **マイグレーション**: `schema_vXX.sql` ファイル方式

---

## Process Schedule 固有ルール

### DB 変更ルール (最重要)

- **PostgreSQL 前提** — SQLite や他のDBへの変更禁止
- **手動 ALTER 禁止**
- スキーマ変更は必ず `scripts/schema_vXX.sql` 形式でマイグレーションを作成すること:

```
scripts/
  schema_v01.sql   # 初期スキーマ
  schema_v02.sql   # 変更内容のみ（差分）
  schema_v03.sql   # ...
```

- ファイル名は連番で管理。既存ファイルを上書きしない
- 各ファイルには変更内容のコメントを先頭に記載すること:

```sql
-- schema_v03.sql
-- 変更内容: tasks テーブルに priority カラム追加
-- 適用日: 2026-XX-XX

ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 0;
```

### コミット禁止ファイル

```
.env          # 環境変数実値 (DB接続情報等)
```

`.env.example` に項目のみ記載すること。

### GitHub 正本ルール

- **GitHub を正本とする**
- 全ての変更は `git push` まで実施して完了とする
- マイグレーションファイルは必ず GitHub に含める

### README 更新ルール

以下が変更された場合は `README.md` を同時に更新すること:

- 起動手順
- 環境変数 (`.env.example` も更新)
- DB スキーマ変更 (マイグレーション適用手順も記載)
- ポート番号変更

---

## 起動手順 (DR 確認用)

```bash
git clone https://github.com/xiusheng-xj/process-schedule.git
cd process-schedule
cp .env.example .env  # DB接続情報を設定
npm install
# PostgreSQLにスキーマを適用
psql -U <user> -d <db> -f scripts/schema_v01.sql
# 以降の差分も順番に適用
npm run build
npm start
```

---

*最終更新: 2026-06-14*
