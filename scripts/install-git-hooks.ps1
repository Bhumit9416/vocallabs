# Install prepare-commit-msg hook (strips Co-authored-by trailers)
$hookSrc = Join-Path $PSScriptRoot "hooks\prepare-commit-msg"
$hookDst = Join-Path (git rev-parse --git-dir) "hooks\prepare-commit-msg"
Copy-Item $hookSrc $hookDst -Force
Write-Host "Installed prepare-commit-msg hook -> $hookDst"
