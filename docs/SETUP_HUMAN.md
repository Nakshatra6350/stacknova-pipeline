# Human-only steps

Claude Code must never attempt these. Full click-by-click instructions live in the owner's
roadmap doc ("Setup guide" and "First video" tabs). Checklist so agents can tell what's missing:

- [x] Name chosen: **StackNova** → `config/brand.yaml`
- [x] Handles confirmed (plain, else .dev style) → `config/brand.yaml: handles.confirmed`
- [x] Logo, avatars and banner confirmed → `brand-assets/`, `config/brand.yaml: logo`
- [x] YouTube channel (on the owner's personal Google account), phone verification (custom thumbnails) — 16 Oct 2026; advanced features in review
- [x] Instagram Creator account (category Education) — 16 Oct 2026
- [x] GitHub: `stacknova-pipeline` (public), `stacknova-content` (private)
- [x] GitHub Pages enabled on the pipeline repo (branch gh-pages): https://nakshatra6350.github.io/stacknova-pipeline/ (app homepage + privacy.html for the consent screen) — 16 Oct 2026
- [ ] Telegram bot created; owner pressed Start
- [x] Google Cloud project `stacknova-pipeline` (number 882687809280), YouTube Data API v3 + YouTube Analytics API enabled, consent screen "StackNova Publisher" **published to production** (unverified; no logo), Web client with OAuth Playground redirect, refresh token for the StackNova channel; `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` set — 16 Oct 2026
- [x] YouTube API audit form submitted — 16 Oct 2026 (answers in `docs/youtube_audit_answers.md`; demo recording on the owner's Google Drive; evidence: homepage, privacy policy, terms, OAuth and upload screenshots; default 10k quota). Waiting for Google's reply; until it passes, API uploads stay private. Any new use of the API not described in the form must be told to YouTube first.
- [ ] Meta developer app, Instagram API with Instagram login, token + user id
- [ ] All secrets from `docs/SECRETS.md` added (`CONTENT_REPO_TOKEN` added 9 October 2026; the rest come with M4-M6)
- [x] Voice reference recorded → private repo `voice/reference.wav` (30–60 s, quiet room, 44.1 kHz)
- [ ] Story bank session done → private repo `stories/*.md`
- [x] Plugins installed in Claude Code (`docs/SKILLS.md` §2): superpowers and document-skills (both from the start; paid-guide work stays Phase 2)
- [ ] Night agent scheduled task created with Automatically approve on
- [ ] Employment contract checked for side-work/IP clauses
