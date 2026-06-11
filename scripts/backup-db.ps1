# backup-db.ps1
# PostgreSQL データベースを pg_dump でバックアップする
# 使用例:
#   .\scripts\backup-db.ps1
#   .\scripts\backup-db.ps1 -DbName "process-schedule" -BackupDir "backups"

param(
    [string]$DbName    = "process-schedule",
    [string]$DbUser    = "postgres",
    [string]$BackupDir = "backups"
)

$ErrorActionPreference = "Stop"

# backups/ ディレクトリがなければ作成
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Force $BackupDir | Out-Null
    Write-Host "[INFO] $BackupDir ディレクトリを作成しました。"
}

# ファイル名: <DbName>_YYYYMMDD_HHMMSS.dump
$timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$outputFile = Join-Path $BackupDir "${DbName}_${timestamp}.dump"

Write-Host "[INFO] バックアップ開始: $DbName → $outputFile"

# pg_dump でカスタム形式 (-Fc) に出力
# PGPASSWORD が設定されていない場合は .pgpass か対話入力が必要
$pgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if (-not (Test-Path $pgDump)) {
    # バージョンが異なる場合は自動検出
    $pgDump = (Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "pg_dump.exe" |
               Select-Object -First 1).FullName
    if (-not $pgDump) {
        Write-Error "[ERROR] pg_dump.exe が見つかりません。PostgreSQL をインストールしてください。"
        exit 1
    }
}
& $pgDump -U $DbUser -Fc -d $DbName -f $outputFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] pg_dump が失敗しました (exit code: $LASTEXITCODE)"
    exit 1
}

# ファイルサイズ確認
$size = (Get-Item $outputFile).Length
$sizeKb = [math]::Round($size / 1KB, 1)
Write-Host "[OK]   バックアップ完了: $outputFile ($sizeKb KB)"

# 古いバックアップを自動削除（30日以上前のもの）
$cutoff = (Get-Date).AddDays(-30)
$old = Get-ChildItem $BackupDir -Filter "${DbName}_*.dump" |
       Where-Object { $_.LastWriteTime -lt $cutoff }
if ($old.Count -gt 0) {
    $old | Remove-Item -Force
    Write-Host "[INFO] $($old.Count) 件の古いバックアップを削除しました（30日以上前）。"
}
