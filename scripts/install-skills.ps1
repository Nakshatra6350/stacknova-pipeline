# Install the bundled project skills into .claude/skills so Claude Code loads them.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts/install-skills.ps1
# (Claude Code runs this for you as step 0 of KICKOFF_PROMPT.md.)
$ErrorActionPreference = "Stop"
$src = "skills-bundle"
$dst = ".claude/skills"
if (-not (Test-Path $src)) { Write-Host "No skills-bundle folder found - skills are probably already installed."; exit 0 }
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem $src -Directory | ForEach-Object {
  $target = Join-Path $dst $_.Name
  if (Test-Path $target) { Remove-Item $target -Recurse -Force }
  Copy-Item $_.FullName $target -Recurse
  Write-Host "installed skill: $($_.Name)"
}
Write-Host "Done. In Claude Code run /reload-skills, then /skills to confirm."
Write-Host "After checking, you can delete the skills-bundle folder (the skills now live in .claude/skills and get committed)."
