# Refresh vendored open-source skills from upstream. Run from the repo root:
#   pwsh scripts/update-skills.ps1      (or: powershell -File scripts/update-skills.ps1)
# Review `git diff .claude/skills` before committing.
$ErrorActionPreference = "Stop"

$sources = @(
  @{ Repo = "https://github.com/anthropics/skills.git";        Skills = @("skill-creator", "frontend-design", "webapp-testing"); Sub = "skills"; License = $null },
  @{ Repo = "https://github.com/adithya-s-k/manim_skill.git";  Skills = @("manim-composer", "manimce-best-practices");             Sub = "skills"; License = "LICENSE" }
)

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("skills-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  foreach ($s in $sources) {
    $dir = Join-Path $tmp ([System.IO.Path]::GetFileNameWithoutExtension($s.Repo))
    git clone --depth 1 $s.Repo $dir | Out-Null
    $commit = (git -C $dir rev-parse --short HEAD).Trim()
    foreach ($name in $s.Skills) {
      $src = Join-Path (Join-Path $dir $s.Sub) $name
      $dst = Join-Path ".claude/skills" $name
      if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
      Copy-Item $src $dst -Recurse
      if ($s.License) { Copy-Item (Join-Path $dir $s.License) (Join-Path $dst "LICENSE-upstream.txt") }
      Write-Host "updated $name from $($s.Repo) @ $commit"
    }
  }
} finally {
  Remove-Item $tmp -Recurse -Force
}
Write-Host "Done. Update the commit hashes in docs/SKILLS.md, then review: git diff .claude/skills"
