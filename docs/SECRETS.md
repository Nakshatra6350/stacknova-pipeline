# Secrets (names only — never values)

Set in the public pipeline repo → Settings → Secrets and variables → Actions.

| Name | Used by | Where the owner gets it |
|---|---|---|
| `YT_CLIENT_ID` | publish, report | Google Cloud → Clients (Setup guide 6c) |
| `YT_CLIENT_SECRET` | publish, report | same |
| `YT_REFRESH_TOKEN` | publish, report | OAuth Playground (6d), scopes `youtube.upload youtube yt-analytics.readonly` |
| `IG_ACCESS_TOKEN` | publish, report, refresh | Meta app → Instagram → API setup with Instagram login (7.5) |
| `IG_USER_ID` | publish, report | same screen |
| `TELEGRAM_BOT_TOKEN` | notify, approvals, alerts | @BotFather (5.4) |
| `TELEGRAM_CHAT_ID` | notify, approvals | @userinfobot (5.6) |
| `CONTENT_REPO_TOKEN` | render (fetch voice reference + stories) | GitHub fine-grained PAT: read-only, contents, private content repo only |
| `SECRETS_PAT` | refresh-tokens (writes IG token back) | GitHub fine-grained PAT: pipeline repo only, permission "Secrets: read and write" |

Rules: secrets are read only from env vars; never logged; `::add-mask::` any derived token.
