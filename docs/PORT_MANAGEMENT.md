# ポート管理ガイド

## ポート体系

| システム        | Frontend | Backend |
|:--------------|:--------:|:-------:|
| ProcessSchedule | **6100** | **6101** |
| PMO Insight    | 6200     | 6201    |
| EOL Insight    | 6300     | 6301    |
| BPMN           | 6400     | 6401    |
| DTM            | 6500     | 6501    |

定義ファイル: [`ports.config.js`](../ports.config.js)

---

## 起動方法

### 通常起動（ポートが空きの場合）

```powershell
# バックエンド（backend/ で実行）
npm run dev

# フロントエンド（frontend/ で実行）
npm run dev
```

### 安全起動 — 推奨（古いプロセスを自動停止してから起動）

```powershell
# バックエンド
npm run dev:safe

# フロントエンド
npm run dev:safe
```

`dev:safe` の動作:
1. 対象ポートに node/vite プロセスがいれば自動で `taskkill`
2. node/vite 以外のプロセスが使っていれば **エラー終了**（手動停止を促す）
3. ポートが空いたら通常起動

---

## 停止方法

### ターミナルで Ctrl+C

起動したターミナルで `Ctrl+C` を押す（正常終了）。

### 強制停止（ポート指定）

```powershell
# バックエンド（6101）を強制停止
cd backend
npm run kill:6101

# フロントエンド（6100）を強制停止
cd frontend
npm run kill:6100
```

### プロジェクトルートから直接実行

```powershell
cd Process_Schedule
node scripts/kill-port.js 6100
node scripts/kill-port.js 6101
```

---

## ポート確認方法

### npm コマンドで確認

```powershell
# バックエンド側
cd backend
npm run check:ports

# フロントエンド側
cd frontend
npm run check:ports
```

### コマンドラインで確認（複数ポート一括）

```powershell
cd Process_Schedule
node scripts/check-port.js 6100 6101
```

出力例:
```
[OK]    Port 6100 : 空きあり
[ERROR] Port 6101 : 使用中
        PID      : 19004
        Process  : node.exe
        Kill cmd : node scripts/kill-port.js 6101
```

### netstat で直接確認

```powershell
netstat -ano | findstr ":6100"
netstat -ano | findstr ":6101"
```

---

## トラブルシュート

### Vite が "Port already in use" で起動しない

```powershell
cd frontend
npm run kill:6100
npm run dev
```

### Node (backend) が "Port 6101 is already in use" で起動しない

```powershell
cd backend
npm run kill:6101
npm run start
```

### kill コマンドが失敗する（Administratorが必要）

```powershell
# PID を確認
netstat -ano | findstr ":6101"

# 管理者権限で PowerShell を開いて実行
taskkill /F /PID <PID>
```

### FIN_WAIT_2 / CLOSE_WAIT が残っている

TCP の状態が残っていても `LISTENING` でなければ新たな `listen()` は成功する。
`netstat -ano` で `LISTENING` でないことを確認してから起動。

```powershell
netstat -ano | findstr ":6101"
# → LISTENING がなければ起動可能
```

### check:ports が誤判定する（LISTENING なのに空きと報告）

本実装は `net.Server` bind 試行ではなく `netstat -ano` を直接パースするため、
Windows の IPv4/IPv6 バインディング差異による誤検出は発生しない。

---

## Kill コマンド一覧

```powershell
# プロジェクトルートから
node scripts/kill-port.js 6100   # ProcessSchedule Frontend
node scripts/kill-port.js 6101   # ProcessSchedule Backend
node scripts/kill-port.js 6200   # PMO Insight Frontend
node scripts/kill-port.js 6201   # PMO Insight Backend
node scripts/kill-port.js 6300   # EOL Insight Frontend
node scripts/kill-port.js 6301   # EOL Insight Backend

# npm コマンドから（各パッケージディレクトリで）
cd frontend && npm run kill:6100
cd backend  && npm run kill:6101
```

---

## 実装の仕組み

### なぜ net.Server bind ではなく netstat を使うか

Windows では `0.0.0.0:PORT` (全インターフェース) を LISTENING しているポートに
`127.0.0.1:PORT` (loopback) で bind を試みると **競合を検出しない** ことがある。

本実装は `netstat -ano` の出力から `LISTENING` 状態を直接パースするため、
IPv4・IPv6 両方のバインディングを確実に検出できる。

### ポート定義の一元管理

`ports.config.js` を唯一の正としてポートを管理する。
`.env` はランタイム設定、`ports.config.js` はスクリプト設定と役割を分けている。

---

## 関連ファイル

```
Process_Schedule/
├── ports.config.js              # ポート定義（全システム共通）
├── scripts/
│   ├── port-utils.js            # ポート検出・終了コアロジック
│   ├── check-port.js            # ポート確認 CLI
│   └── kill-port.js             # ポート強制解放 CLI
├── frontend/
│   ├── .env                     # VITE_API_BASE_URL=http://localhost:6101/api
│   ├── vite.config.js           # port: 6100, strictPort: true
│   └── scripts/check-ports.cjs  # npm run check:ports のラッパー
└── backend/
    ├── .env                     # PORT=6101, CORS_ORIGIN=http://localhost:6100
    └── scripts/check-ports.js   # npm run check:ports のラッパー
```
