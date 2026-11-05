import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

/**
 * Behind the Button #12: page 1 is instant, page 50,000 isn't, and pages can
 * show a post twice. Every number in the video and the guide comes from here:
 *
 *   java Pages load    // 2,000,000 posts, three a second, newest first
 *   java Pages depth   // page 1 to page 100,000: OFFSET against keyset
 *   java Pages plan    // what Postgres reads for a deep page (EXPLAIN)
 *   java Pages drift   // posts arrive and vanish while someone pages
 *   java Pages ties    // a cursor without a tie-breaker skips posts
 *   java Pages count   // "page 3 of 100,000": what the total costs
 *
 * Needs Postgres in DATABASE_URL (default: demo@localhost:55432/pages).
 */
public class Pages {
    static final int PER_PAGE = 20;
    static final int TOTAL = 2_000_000;

    static final String TABLE = """
        CREATE TABLE posts (
          id         bigint PRIMARY KEY,
          author_id  int NOT NULL,
          created_at timestamptz NOT NULL,
          title      text NOT NULL
        )""";

    // The feed's order: newest first, and the id breaks ties in a second.
    static final String INDEX =
        "CREATE INDEX posts_feed ON posts (created_at, id)";

    // Page n the usual way: skip (n - 1) * 20 posts, keep 20.
    static final String BY_OFFSET = """
        SELECT id, created_at FROM posts
        ORDER BY created_at DESC, id DESC
        LIMIT 20 OFFSET ?""";

    // The next page by keyset: start just after the last post shown.
    static final String AFTER = """
        SELECT id, created_at FROM posts
        WHERE (created_at, id) < (?, ?)
        ORDER BY created_at DESC, id DESC
        LIMIT 20""";

    // The same, with only the time in the cursor.
    static final String AFTER_TIME_ONLY = """
        SELECT id, created_at FROM posts
        WHERE created_at < ?
        ORDER BY created_at DESC, id DESC
        LIMIT 20""";

    /** One row of a page, and the cursor for the next page. */
    record Post(long id, OffsetDateTime at) {}

    static void load(Connection c) throws SQLException {
        Db.run(c, "DROP TABLE IF EXISTS posts");
        Db.run(c, TABLE);
        long t = System.nanoTime();
        Db.run(c, """
            INSERT INTO posts
            SELECT g, g % 5000,
                   timestamptz '2026-01-01 00:00:00+00' + (g / 3) * interval '1 second',
                   'Post number ' || g
            FROM generate_series(1, TOTAL) g""".replace("TOTAL", String.valueOf(TOTAL)));
        Db.run(c, INDEX);
        Db.run(c, "VACUUM ANALYZE posts");
        System.out.printf("%,d posts loaded and indexed in %.1f s; table %s, index %s%n",
                TOTAL, (System.nanoTime() - t) / 1e9,
                Db.text(c, "SELECT pg_size_pretty(pg_table_size('posts'))"),
                Db.text(c, "SELECT pg_size_pretty(pg_relation_size('posts_feed'))"));
    }

    static List<Post> page(PreparedStatement s) throws SQLException {
        List<Post> out = new ArrayList<>();
        try (ResultSet r = s.executeQuery()) {
            while (r.next()) {
                out.add(new Post(r.getLong(1),
                        r.getObject(2, OffsetDateTime.class)));
            }
        }
        return out;
    }

    /** Page n by OFFSET: 1 is the newest. */
    static List<Post> byOffset(Connection c, int n) throws SQLException {
        try (PreparedStatement s = c.prepareStatement(BY_OFFSET)) {
            s.setInt(1, (n - 1) * PER_PAGE);
            return page(s);
        }
    }

    /** The page after `last`, by keyset: its time, and its id if asked. */
    static List<Post> after(Connection c, Post last, boolean tieBreaker)
            throws SQLException {
        String sql = tieBreaker ? AFTER : AFTER_TIME_ONLY;
        try (PreparedStatement s = c.prepareStatement(sql)) {
            s.setObject(1, last.at());
            if (tieBreaker) s.setLong(2, last.id());
            return page(s);
        }
    }

    interface Fetch { List<Post> get() throws SQLException; }

    /** The median of 5 timings, in ms, after one untimed run. */
    static double median(Fetch f) throws SQLException {
        f.get();
        double[] ms = new double[5];
        for (int i = 0; i < ms.length; i++) {
            long t = System.nanoTime();
            f.get();
            ms[i] = (System.nanoTime() - t) / 1e6;
        }
        Arrays.sort(ms);
        return ms[2];
    }

    static void depth(Connection c) throws SQLException {
        System.out.println("page       OFFSET    keyset   same 20 posts");
        for (int n : new int[] {1, 10, 100, 1_000, 10_000, 50_000, 100_000}) {
            double off = median(() -> byOffset(c, n));
            if (n == 1) {
                System.out.printf("%,7d %8.2f ms %8.2f ms  (page 1 has no cursor)%n", n, off, off);
                continue;
            }
            List<Post> before = byOffset(c, n - 1); // where page n - 1 ended
            Post last = before.get(before.size() - 1);
            double key = median(() -> after(c, last, true));
            boolean same = byOffset(c, n).equals(after(c, last, true));
            System.out.printf("%,7d %8.2f ms %8.2f ms  %s%n", n, off, key, same ? "yes" : "NO");
        }
    }

    static void plan(Connection c) throws SQLException {
        List<Post> before = byOffset(c, 49_999);
        Post last = before.get(before.size() - 1);
        String deep = BY_OFFSET.replace("?", String.valueOf(49_999 * PER_PAGE));
        String cursor = AFTER.replaceFirst("\\?", "'" + last.at() + "'")
                .replaceFirst("\\?", String.valueOf(last.id()));
        for (String[] q : new String[][] {{"page 50,000 by OFFSET", deep},
                {"page 50,000 by keyset", cursor}}) {
            System.out.println("== " + q[0]);
            try (var s = c.createStatement();
                 ResultSet r = s.executeQuery("EXPLAIN (ANALYZE, BUFFERS) " + q[1])) {
                while (r.next()) System.out.println("  " + r.getString(1));
            }
        }
    }

    /**
     * 200 people each read 10 pages. Between pages, new posts arrive (0 to 5)
     * or the author deletes posts already shown (0 to 2). Each session runs
     * in a transaction that is rolled back, so the table never changes.
     */
    static void drift(Connection c) throws SQLException {
        c.setAutoCommit(false);
        for (String change : new String[] {"new posts arrive", "shown posts deleted"}) {
            for (boolean keyset : new boolean[] {false, true}) {
                int repeated = 0, missed = 0, changes = 0;
                Random r = new Random(12);
                for (int session = 0; session < 200; session++) {
                    List<Long> shown = new ArrayList<>();
                    Post last = null;
                    long nextId = TOTAL + 1;
                    for (int p = 1; p <= 10; p++) {
                        List<Post> rows = keyset && last != null ? after(c, last, true) : byOffset(c, p);
                        rows.forEach(x -> shown.add(x.id()));
                        last = rows.get(rows.size() - 1);
                        if (change.startsWith("new")) {
                            int k = r.nextInt(6);
                            changes += k;
                            for (int i = 0; i < k; i++) {
                                Db.run(c, "INSERT INTO posts VALUES (" + nextId++
                                        + ", 1, now() + interval '" + nextId + " ms', 'new')");
                            }
                        } else {
                            int k = r.nextInt(3);
                            changes += k;
                            for (int i = 0; i < k; i++) {
                                long gone = shown.get(r.nextInt(shown.size()));
                                Db.run(c, "DELETE FROM posts WHERE id = " + gone);
                            }
                        }
                    }
                    repeated += shown.size() - new HashSet<>(shown).size();
                    // every original post newer than the last one shown, still there
                    try (PreparedStatement s = c.prepareStatement(
                            "SELECT id FROM posts WHERE (created_at, id) >= (?, ?) AND id <= ?")) {
                        s.setObject(1, last.at());
                        s.setLong(2, last.id());
                        s.setLong(3, TOTAL);
                        Set<Long> seen = new HashSet<>(shown);
                        try (ResultSet rs = s.executeQuery()) {
                            while (rs.next()) if (!seen.contains(rs.getLong(1))) missed++;
                        }
                    }
                    c.rollback();
                }
                System.out.printf("%-20s %-7s %,5d changes: %,5d posts shown twice, %,5d never shown%n",
                        change, keyset ? "keyset" : "OFFSET", changes, repeated, missed);
            }
        }
        c.setAutoCommit(true);
    }

    /** Page through the newest 10,000 posts with each kind of cursor. */
    static void ties(Connection c) throws SQLException {
        for (boolean tieBreaker : new boolean[] {false, true}) {
            Set<Long> seen = new HashSet<>();
            List<Post> rows = byOffset(c, 1);
            int pages = 1;
            seen.addAll(rows.stream().map(Post::id).toList());
            while (seen.size() < 10_000 && pages < 1_000) {
                rows = after(c, rows.get(rows.size() - 1), tieBreaker);
                rows.forEach(x -> seen.add(x.id()));
                pages++;
            }
            long newest = TOTAL, oldestShown = seen.stream().mapToLong(Long::longValue).min().orElseThrow();
            long skipped = (newest - oldestShown + 1) - seen.size();
            System.out.printf("cursor %-18s %,d pages, %,d posts shown, %,d skipped%n",
                    tieBreaker ? "(created_at, id):" : "created_at only:", pages, seen.size(), skipped);
        }
    }

    static void count(Connection c) throws SQLException {
        double exact = median(() -> List.of(new Post(Long.parseLong(
                Db.text(c, "SELECT count(*) FROM posts")), null)));
        double guess = median(() -> List.of(new Post(Long.parseLong(
                Db.text(c, "SELECT reltuples::bigint FROM pg_class WHERE relname = 'posts'")), null)));
        System.out.printf("count(*): %s rows in %.1f ms; the planner's estimate: %s in %.2f ms%n",
                Db.text(c, "SELECT count(*) FROM posts"), exact,
                Db.text(c, "SELECT reltuples::bigint FROM pg_class WHERE relname = 'posts'"), guess);
    }

    public static void main(String[] args) throws Exception {
        String mode = args.length > 0 ? args[0] : "depth";
        try (Connection c = Db.open()) {
            switch (mode) {
                case "load" -> load(c);
                case "depth" -> depth(c);
                case "plan" -> plan(c);
                case "drift" -> drift(c);
                case "ties" -> ties(c);
                case "count" -> count(c);
                default -> throw new IllegalArgumentException("no mode " + mode);
            }
        }
    }
}
