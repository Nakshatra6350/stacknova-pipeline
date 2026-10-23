# Free packs by auto-DM (Instagram, from 2 Nov 2026)

The owner's decision of 23 Oct 2026 (`docs/PHASES.md`): every Instagram post offers one free PDF
pack. A viewer follows @stacknova.dev and comments the pack's KEYWORD; an automated DM checks the
follow, asks for an email and sends the PDF in the same chat. Nobody sends anything by hand. At the
end of November the owner looks at the demand and decides whether a paid pack is worth making.

## What the pipeline does

- `content/episodes/<id>/pack.yaml`: the pack (keyword, sections, Q&A, checklist); every claim is in
  the episode's fact check and every code excerpt is a line range of the tested samples.
- `studio/scripts/pack.py <id>`: prints `out/release/packs/<file>.pdf` (A5 pages, readable on a phone).
- A post offers a pack with `gift: <episode id>` in its `studio/films/<id>/post-v2.yaml`, and a Reel's
  film with `gift: {keyword: KEYWORD}` in its `film.yaml`. Then:
  - the Instagram Reel ends on "Comment KEYWORD" (the YouTube Short keeps "Subscribe for …");
  - `upload_day.py` puts the offer under the caption's first line and above its hashtags, copies the
    PDF next to the post ("<post> - free pack.pdf") and writes an AUTO-DM block in "00 WHAT TO POST.txt";
  - the posting board shows the same keyword and DM texts, ready to copy.

## One-time setup (owner, about 15 minutes)

The tool is ReplyKaro: it works through Meta's official API (Instagram's own login, never your
password) and says it is verified by Meta as a Tech Provider. Its free plan includes the follow gate
(1,000 DMs and 3 automations a month); ₹99 a month gives 30,000 DMs and 10 automations.

1. Open replykaro.com and sign up with your own email.
2. Connect Instagram: choose @stacknova.dev and allow the permissions on Instagram's own screen.
3. Check that the plan you pick can **attach a PDF** and **collect an email** in a DM (ReplyKaro says
   both are on "plans with attachment storage"). If the free plan can't, take the ₹99 plan for November.

## For each post (about 1 minute, when you post it)

The post's "00 WHAT TO POST.txt" (and the board) has an AUTO-DM block. In ReplyKaro:

1. New automation → Comment on a post → pick the post you just published.
2. Keyword: the KEYWORD from the block.
3. Turn on "reply under the comment" and paste the reply text.
4. Turn on the follow gate and paste the follow-gate message.
5. Add the email question, then the PDF ("<post> - free pack.pdf" in the day's folder) with its message.
6. Save and comment the keyword yourself from a second account to test it once.

## What to look at in November

ReplyKaro shows how many people commented, passed the follow gate and gave an email. With Instagram
Insights (followers gained per post) that answers the question for the paid pack: how many people
want this, and how many are willing to give an email for it.
