<#
  Back up the daily_orders table from Railway Postgres to a local .sql file.

  Railway's Backups / PITR tab is Pro-only, so this is the safety net to run
  BEFORE a Replace-mode "Order History" import in the app's Import/Export panel
  (Replace mode runs TRUNCATE daily_orders CASCADE).

  Usage:
    .\scripts\backup-orders.ps1 -Url "postgresql://postgres:...@...proxy.rlwy.net:PORT/railway"
    .\scripts\backup-orders.ps1              # uses $env:DATABASE_URL if set
    .\scripts\backup-orders.ps1 -Full        # whole database, not just daily_orders

  Get the URL with:  railway variables --service Postgres
  Use DATABASE_PUBLIC_URL — plain DATABASE_URL is the *.railway.internal host and
  only resolves from inside Railway.

  Restore (into an empty table — i.e. after the truncate, before re-importing):
    psql <url> -f <the .sql file>
#>
param(
  [string]$Url    = $env:DATABASE_URL,
  [string]$OutDir = "$HOME\Documents\bakery-backups",
  [switch]$Full
)

$ErrorActionPreference = 'Stop'

if (-not $Url) {
  Write-Error "No connection string. Pass -Url '...' or set `$env:DATABASE_URL. Get it with: railway variables --service Postgres (use DATABASE_PUBLIC_URL)."
}
if ($Url -match 'railway\.internal') {
  Write-Error "That is the internal URL - it only resolves inside Railway. Use DATABASE_PUBLIC_URL (*.proxy.rlwy.net)."
}

# Newest installed PostgreSQL client tools
$bin = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
       Sort-Object { if ($_.Directory.Parent.Name -match '^\d+') { [int]$matches[0] } else { 0 } } -Descending |
       Select-Object -First 1
if (-not $bin) { Write-Error "pg_dump not found under C:\Program Files\PostgreSQL\*\bin" }
$pgDump = $bin.FullName
$psql   = Join-Path $bin.Directory "psql.exe"

New-Item -ItemType Directory -Force $OutDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"

Write-Host "Source:  $($Url -replace '://[^@]+@', '://***@')"
Write-Host "Tooling: $pgDump"
& $psql $Url -At -c "SELECT COUNT(*) || ' rows in daily_orders, ' || COALESCE(MIN(ordr_dt)::text,'-') || ' .. ' || COALESCE(MAX(ordr_dt)::text,'-') FROM daily_orders"
if ($LASTEXITCODE -ne 0) { Write-Error "Could not connect to the database." }

if ($Full) {
  $out = Join-Path $OutDir "bakery_full_$stamp.dump"
  Write-Host "Dumping the entire database -> $out"
  & $pgDump --format=custom --file=$out $Url
} else {
  $out = Join-Path $OutDir "daily_orders_$stamp.sql"
  Write-Host "Dumping daily_orders -> $out"
  & $pgDump --data-only --table=public.daily_orders --file=$out $Url
}
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump failed - nothing usable was written." }

Write-Host ("Done: {0} ({1:N1} MB)" -f $out, ((Get-Item $out).Length / 1MB))
Write-Host "Restore with: psql <url> -f `"$out`""
