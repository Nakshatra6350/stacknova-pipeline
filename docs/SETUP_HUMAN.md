# Human-only steps

Claude Code must never attempt these. Full click-by-click instructions live in the owner's
roadmap doc ("Setup guide" and "First video" tabs). Checklist so agents can tell what's missing:

- [x] Name chosen: **StackNova** → `config/brand.yaml`
- [ ] Handles confirmed (plain, else .dev style) → `config/brand.yaml: handles.confirmed`
- [ ] Brand Google account, YouTube channel, phone verification (custom thumbnails)
- [ ] Instagram Creator account
- [ ] GitHub: `stacknova-pipeline` (public), `stacknova-content` (private); Pages enabled on pipeline repo (branch gh-pages)
- [ ] Telegram bot created; owner pressed Start
- [ ] Google Cloud project, YouTube Data API v3 + YouTube Analytics API enabled, consent screen **published to production**, Web client with OAuth Playground redirect, refresh token
- [ ] YouTube API audit form submitted (answers in `docs/youtube_audit_answers.md`, written by Claude)
- [ ] Meta developer app, Instagram API with Instagram login, token + user id
- [ ] All secrets from `docs/SECRETS.md` added
- [ ] Voice reference recorded → private repo `voice/reference.wav` (30–60 s, quiet room, 44.1 kHz)
- [ ] Story bank session done → private repo `stories/*.md`
- [x] Plugins installed in Claude Code (`docs/SKILLS.md` §2): superpowers and document-skills (both from the start; paid-guide work stays Phase 2)
- [ ] Night agent scheduled task created with Automatically approve on
- [ ] Employment contract checked for side-work/IP clauses
