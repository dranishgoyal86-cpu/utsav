# push-changes.ps1 — run this in the Utsav folder after Claude has made
# code changes, to push both the app (EAS Update) and the webapp
# (Cloudflare) in one go.
#
# Usage:  .\push-changes.ps1 "short message about what changed"
#
# Claude can't run this for you automatically (no working terminal access
# to this machine right now), but this collapses the two separate deploy
# steps into one command so you only have to run one thing each time.

param(
    [string]$Message = "Update"
)

Write-Host "== 1/3: Pushing app update via EAS ==" -ForegroundColor Cyan
eas update --branch development --message $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "EAS update failed — check you're logged in as the right account (eas whoami)." -ForegroundColor Red
    exit 1
}

Write-Host "== 2/3: Rebuilding web export ==" -ForegroundColor Cyan
npx expo export -p web
if ($LASTEXITCODE -ne 0) {
    Write-Host "Web export failed." -ForegroundColor Red
    exit 1
}

Write-Host "== 3/3: Committing + pushing to git (for Cloudflare Pages) ==" -ForegroundColor Cyan
git add .
git commit -m $Message
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git push failed or nothing to commit — check git status." -ForegroundColor Yellow
}

Write-Host "Done. Check the Cloudflare Pages dashboard for the new deployment." -ForegroundColor Green
