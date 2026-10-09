# Approval flow (Telegram)

## Asset states

```
draft → rendering → pending_approval ─┬─▶ approved → scheduled → published
                                      │                  └────▶ published_manual_pending (YouTube unaudited) → published
                                      ├─▶ rejected → (night agent revises) → draft (version+1)
                                      └─▶ expired (no answer in 7 days; re-notify once at day 3)
any state ──error──▶ failed (reason) ──retry next run──▶ previous state
```

Allowed transitions are enforced in `src/channel_os/state/queue.py`; any other transition raises.
`publish` may only read assets in `approved` or `scheduled`.

## queue.json shape

```json
{
  "telegram_offset": 123456789,
  "assets": {
    "001-idempotency/long": {
      "episode": "001-idempotency",
      "kind": "long",               
      "version": 1,
      "state": "pending_approval",
      "platforms": ["youtube"],
      "slot_utc": "2026-10-26T13:30:00Z",
      "telegram_message_id": 42,
      "youtube_video_id": "abc123",   
      "instagram_media_id": null,
      "reject_reason": null,
      "history": [{"at": "2026-10-20T19:31:02Z", "from": "rendering", "to": "pending_approval", "by": "notify"}]
    }
  }
}
```

`kind` ∈ `long | short | reel | carousel | story | guide`.

## Telegram message per asset

1. Media: Short/Reel → `sendVideo` (≤ 50 MB); carousel → `sendMediaGroup` (≤ 10 images); long → `sendPhoto` (thumbnail A) + private YouTube link.
2. Text (HTML parse mode), ≤ 4096 chars:
   ```
   <b>[001] Why your payment got charged twice</b> — Short 1/3 · v1
   Platforms: YouTube Shorts + Instagram Reel
   Slot: Sun 26 Oct, 19:30 IST (14:00 UTC)
   Title: …
   Caption: …
   Sources: 3 (tap "Script" to read)
   ```
3. Inline keyboard (callback_data ≤ 64 bytes, format `a:<asset_key_hash>` / `r:<hash>` / `s:<hash>`):
   `[✅ Approve] [❌ Reject] [📄 Script]` and for long videos `[🕒 Post now]`.
4. On Reject the bot replies "Why? (one line)" with `force_reply`; the next text message from the owner is stored as `reject_reason`. No reply in 1 h → reason `"(none given)"`.
5. On Approve the bot edits the message: "✅ Approved — posting Sun 19:30 IST (14:00 UTC)".
6. Only callbacks/messages whose `from.id == TELEGRAM_CHAT_ID` are honoured; everything else is ignored and logged.

## Publishing slots (`config/schedule.yaml`)

The publisher picks the next free slot for the asset kind from `config/schedule.yaml`
(stored in UTC, chosen for a global audience, shown to the owner in IST). Analytics re-tunes them weekly.
- "Post now" overrides the slot.
