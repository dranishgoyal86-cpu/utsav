# push-changes.ps1 — run this in the Utsav folder after Claude has made
# code changes, to push the app (EAS Update, BOTH development and
# production channels — production is what your installed Play Store app
# actually listens to) and the webapp (Cloudflare) in one go.
#
# Usage:  .\push-changes.ps1 "short message about what changed"
#         .\push-changes.ps1 "test only" -DevOnly    # skip production
#
# Claude can't run this for you automatically (Cowork sessions have no
# working terminal access to this machine — a local Claude Code terminal
# session can, if you're using one), but this collapses the deploy steps
# into one command so you only have to run one thing each time.

param(
    [string]$Message = "Update",
    [switch]$DevOnly
)

# Pushes to BOTH the development channel (your own test/dev-client builds)
# and production (the actual Play Store app's channel, per eas.json) —
# previously this only pushed development, which meant the live Play
# Store app never received JS updates through this script at all. Pass
# -DevOnly if you deliberately want to skip production for a given push
# (e.g. testing something risky before it goes live).
Write-Host "== 1/4: Pushing app update via EAS (development) ==" -ForegroundColor Cyan
eas update --branch development --message $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "EAS update (development) failed — check you're logged in as the right account (eas whoami)." -ForegroundColor Red
    exit 1
}

if (-not $DevOnly) {
    Write-Host "== 2/4: Pushing app update via EAS (production — Play Store app) ==" -ForegroundColor Cyan
    eas update --branch production --message $Message
    if ($LASTEXITCODE -ne 0) {
        Write-Host "EAS update (production) failed — check you're logged in as the right account (eas whoami)." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "== Skipping production push (-DevOnly) ==" -ForegroundColor Yellow
}

Write-Host "== 3/4: Rebuilding web export ==" -ForegroundColor Cyan
npx expo export -p web
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web export failed." -ForegroundColor Red
    exit 1
}

Write-Host "== 4/4: Committing + pushing to git (for Cloudflare Pages) ==" -ForegroundColor Cyan
git add .
git commit -m $Message
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git push failed or nothing to commit — check git status." -ForegroundColor Yellow
}

Write-Host "Done. Check the Cloudflare Pages dashboard for the new deployment." -ForegroundColor Green
