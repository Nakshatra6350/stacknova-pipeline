# YouTube API audit — draft answers (owner submits; replace links)

Submit via the "YouTube API Services — Audit and Quota Extension Form" while signed in as the
brand Google account. Attach a 60–90 s screen recording showing: the OAuth consent screen for
your project → granting access to your own channel → a video appearing in YouTube Studio as
uploaded by the app.

**Organisation / developer:** Individual creator (Nakshatra), operating the StackNova channel.

**API client name / project number:** stacknova-pipeline / <project number from Cloud console>

**Which channels will the client access?** Only my own channel, <channel URL>. No third-party users.

**Describe your use case.** An internal publishing tool for my own educational channel. I produce
technical videos (backend engineering). The tool uploads my finished videos and Shorts, sets
titles, descriptions, thumbnails, captions and localizations, schedules publication, and reads
my channel's analytics for a weekly report. Every upload is reviewed and approved by me before
it is made public.

**Which API methods do you use?** videos.insert, videos.update, thumbnails.set, captions.insert,
playlistItems.insert, channels.list, videos.list; YouTube Analytics API reports.query (own channel).

**Do you store API data?** Only video IDs, publish status and aggregate analytics for my own
channel, in the project's repository, to produce weekly reports. No data about other users.

**Will users other than you sign in?** No. The OAuth client is used solely by me.

**Expected daily uploads:** 1–3 (two long videos per week and one or two Shorts per day).

**Link to the source code (public):** <https://github.com/<owner>/stacknova-pipeline>
