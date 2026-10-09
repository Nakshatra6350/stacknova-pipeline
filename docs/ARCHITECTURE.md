# Architecture

## Components

| # | Component | Runs on | Trigger | Input | Output |
|---|---|---|---|---|---|
| 1 | Night agent | Claude scheduled task (cloud) | cron 01:00 IST daily | backlog, analytics, rejects, private content repo | `content/episodes/<id>/episode.yaml`, `scenes/*.py`, updated `backlog.yaml`, git push |
| 2 | `render.yml` | GitHub Actions `ubuntu-latest` | push touching `content/episodes/**/episode.yaml` with `status: ready_to_render` | episode.yaml, voice reference (from private repo via deploy key) | `out/<id>/` long.mp4, short-*.mp4, reel-*.mp4, carousel-*/NN.jpg, thumb-*.jpg, en.srt, *.vtt translations, manifest.json → uploaded as workflow artifact + GitHub Release `ep-<id>` (assets ≤ 2 GB each) |
| 3 | `notify.yml` | Actions | `workflow_run` of render (success) | manifest.json | Telegram previews, `state/queue.json` entries → `pending_approval` |
| 4 | `watch-approvals.yml` | Actions | cron `*/10 * * * *` | Telegram `getUpdates` (offset in state) | state transitions → `approved` / `rejected`; dispatches `publish.yml` |
| 5 | `publish.yml` | Actions | `workflow_dispatch` (from 4) + cron `*/15` for scheduled slots | approved assets whose slot ≤ now | YouTube video id / IG media id saved in state; Telegram "posted" message with links |
| 6 | `refresh-tokens.yml` | Actions | cron monthly (1st, 03:00 UTC) | IG long-lived token | refreshed token written back via GitHub API to the repo secret (needs `SECRETS_PAT`) |
| 7 | `weekly-report.yml` | Actions | cron Sunday 04:30 UTC (10:00 IST) | YouTube Analytics, IG insights | Telegram report + `reports/YYYY-WW.md` |
| 8 | `ci.yml` | Actions | push / PR | code | tests, lint, types, schema validation, code-sample compile |

## Data flow for one episode

```
night agent ──push episode.yaml (ready_to_render)──▶ render.yml
render.yml ──manifest.json + release assets──▶ notify.yml
notify.yml ──Telegram preview + buttons──▶ OWNER
OWNER taps ──callback_query──▶ Telegram servers (held until polled)
watch-approvals.yml ──getUpdates──▶ state: approved | rejected(reason)
approved ──▶ publish.yml at slot ──▶ YouTube API / Instagram API ──▶ Telegram "posted ✅ links"
rejected ──▶ night agent reads reason next run ──▶ revised episode (version+1) ──▶ render …
```

## Why each choice

- **Public pipeline repo**: GitHub Actions minutes are free for public repos; rendering a 12-min video on CPU takes ~1 h.
- **Chatterbox on CPU**: free and MIT-licensed; slow but unattended. If render > 5 h, split narration by segment across a job matrix.
- **Polling instead of webhook**: no server to host; ≤10 min latency is fine overnight.
- **GitHub Pages temp hosting for Instagram**: Instagram API with Instagram Login only accepts a public `video_url`/`image_url`. `pages_host.py` commits the file to branch `gh-pages` under `tmp/<random>/`, waits until the URL returns 200, publishes, then removes the file with a force-pushed orphan commit (no history growth). If Meta rejects Pages URLs in the dry run, switch to Cloudflare R2 (spec stays the same: `PublicHost.put(path) -> url`, `PublicHost.delete(url)`).
- **YouTube private-until-audit**: until the API project passes Google's audit, `videos.insert` results are private. `publish.youtube` uploads as private at render time (so the owner can preview long videos by link), and on approval calls `videos.update(status.privacyStatus=public | publishAt=slot)`. While unaudited this call fails with a policy error → send Telegram message "Tap to make public: <studio link>" and mark `published_manual_pending`. Detect audit approval automatically when the update succeeds.

## State

`state/queue.json` on branch `state` (so state commits never trigger renders). Schema and
transitions: `docs/APPROVAL_FLOW.md`. All writers use optimistic concurrency: read file SHA,
write with that SHA via GitHub contents API, retry on 409. Workflows use
`concurrency: group: state` so only one writer runs at a time.

## Limits to respect

- YouTube: uploads via `videos.insert` are quota-limited per project per day; one long + up to 5 Shorts/day is well within limits. Shorts: vertical 9:16, ≤ 60 s for safe classification, `#Shorts` in title or description; `thumbnails.set` is not allowed on Shorts.
- Instagram: max 100 API-published posts per 24 h (a carousel counts as 1). Reels: 9:16 MP4 H.264/AAC. Carousel: up to 10 items.
- Telegram: bots can send files ≤ 50 MB → send Shorts/Reels as video; long video as the private YouTube link + 3 thumbnails + script PDF.
- GitHub Actions: a job may run up to 6 h. Release assets ≤ 2 GB.
