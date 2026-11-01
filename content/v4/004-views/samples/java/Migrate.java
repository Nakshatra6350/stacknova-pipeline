import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;

/** Moving a busy table from INTEGER to BIGINT, two ways, under real load. */
final class Migrate {
    static final int ROWS = 5_000_000;
    static final int BATCH = 10_000;

    /** Four writers and one reader, as a live app would be, timing it all. */
    static final class Load implements AutoCloseable {
        final AtomicLong writes = new AtomicLong();
        final AtomicLong reads = new AtomicLong();
        final AtomicLong failed = new AtomicLong();
        final AtomicLong worstWrite = new AtomicLong();
        final AtomicLong worstRead = new AtomicLong();
        final List<Thread> threads = new ArrayList<>();
        volatile boolean stop;
        volatile String firstError = "";

        Load() {
            for (int i = 0; i < 4; i++) add(this::write);
            add(this::read);
        }

        interface Step {
            void run(Connection db) throws SQLException;
        }

        void add(Step step) {
            Thread t = new Thread(() -> {
                try (Connection db = Db.open()) {
                    while (!stop) {
                        try {
                            step.run(db);
                        } catch (SQLException e) {
                            failed.incrementAndGet();
                            if (firstError.isEmpty()) {
                                firstError = e.getMessage();
                            }
                        }
                        Thread.sleep(20);
                    }
                } catch (SQLException | InterruptedException e) {
                    throw new IllegalStateException(e);
                }
            });
            threads.add(t);
            t.start();
        }

        void write(Connection db) throws SQLException {
            long start = System.nanoTime();
            if (ThreadLocalRandom.current().nextInt(4) == 0) {
                Db.run(db, "INSERT INTO videos (title) VALUES ('new')");
            } else {
                long id = 1 + ThreadLocalRandom.current().nextInt(ROWS);
                Db.run(db, "UPDATE videos SET views = views + 1"
                    + " WHERE id = " + id);
            }
            worstWrite.accumulateAndGet(System.nanoTime() - start, Math::max);
            writes.incrementAndGet();
        }

        void read(Connection db) throws SQLException {
            long start = System.nanoTime();
            long id = 1 + ThreadLocalRandom.current().nextInt(ROWS);
            Db.one(db, "SELECT count(*) FROM videos WHERE id = " + id);
            worstRead.accumulateAndGet(System.nanoTime() - start, Math::max);
            reads.incrementAndGet();
        }

        @Override
        public void close() throws InterruptedException {
            stop = true;
            for (Thread t : threads) t.join();
        }
    }

    static void build(Connection c) throws SQLException {
        Db.run(c, "DROP TABLE IF EXISTS comments, videos CASCADE",
            "CREATE TABLE videos (id SERIAL PRIMARY KEY, title TEXT NOT NULL,"
                + " views BIGINT NOT NULL DEFAULT 0)",
            "INSERT INTO videos (title) SELECT 'video ' || g"
                + " FROM generate_series(1, " + ROWS + ") g",
            "VACUUM ANALYZE videos");
    }

    /** The one-line fix: rewrites the table and blocks everything meanwhile. */
    static void alterInPlace(Connection c) throws Exception {
        build(c);
        long took;
        try (Load load = new Load()) {
            Thread.sleep(2000);
            long start = System.nanoTime();
            Db.run(c, "ALTER TABLE videos ALTER COLUMN id TYPE BIGINT",
                "ALTER SEQUENCE videos_id_seq AS BIGINT");
            took = (System.nanoTime() - start) / 1_000_000;
            Thread.sleep(2000);
            report("ALTER in place", load, took);
        }
        check(c);
    }

    /** New column, copy in small batches, swap in one short transaction. */
    static void addColumnAndSwap(Connection c) throws SQLException {
        // 1. Instant: a new column, and a trigger to keep new writes in it.
        Db.run(c, "ALTER TABLE videos ADD COLUMN id_big BIGINT",
            """
            CREATE FUNCTION copy_id() RETURNS trigger AS $$
            BEGIN
                NEW.id_big := NEW.id;
                RETURN NEW;
            END $$ LANGUAGE plpgsql""",
            """
            CREATE TRIGGER copy_id BEFORE INSERT OR UPDATE ON videos
            FOR EACH ROW EXECUTE FUNCTION copy_id()""");

        // 2. Copy the old rows. Each batch is its own short transaction.
        long top = Db.one(c, "SELECT max(id) FROM videos");
        String copy = "UPDATE videos SET id_big = id"
            + " WHERE id >= ? AND id < ? AND id_big IS NULL";
        try (PreparedStatement p = c.prepareStatement(copy)) {
            for (long from = 1; from <= top; from += BATCH) {
                p.setLong(1, from);
                p.setLong(2, from + BATCH);
                p.executeUpdate();
            }
        }

        // 3. Build what the swap needs, without blocking writes.
        Db.run(c, "CREATE UNIQUE INDEX CONCURRENTLY videos_id_big_key"
                + " ON videos (id_big)",
            "ALTER TABLE videos ADD CONSTRAINT id_big_set"
                + " CHECK (id_big IS NOT NULL) NOT VALID",
            "ALTER TABLE videos VALIDATE CONSTRAINT id_big_set");

        // 4. The swap. Give up fast rather than queue up all the writes.
        c.setAutoCommit(false);
        Db.run(c, "SET LOCAL lock_timeout = '2s'",
            "LOCK TABLE videos IN ACCESS EXCLUSIVE MODE",
            "ALTER SEQUENCE videos_id_seq AS BIGINT",
            "ALTER TABLE videos ALTER COLUMN id DROP DEFAULT",
            "ALTER TABLE videos DROP CONSTRAINT videos_pkey",
            "DROP TRIGGER copy_id ON videos",
            "ALTER TABLE videos RENAME COLUMN id TO id_int",
            "ALTER TABLE videos RENAME COLUMN id_big TO id",
            "ALTER TABLE videos ALTER COLUMN id SET NOT NULL",
            "ALTER TABLE videos ADD CONSTRAINT videos_pkey"
                + " PRIMARY KEY USING INDEX videos_id_big_key",
            "ALTER TABLE videos ALTER COLUMN id"
                + " SET DEFAULT nextval('videos_id_seq')",
            "ALTER SEQUENCE videos_id_seq OWNED BY videos.id",
            "ALTER TABLE videos DROP CONSTRAINT id_big_set",
            "ALTER TABLE videos DROP COLUMN id_int",
            "DROP FUNCTION copy_id()");
        c.commit();
        c.setAutoCommit(true);
    }

    static void online(Connection c) throws Exception {
        build(c);
        long took;
        try (Load load = new Load()) {
            Thread.sleep(2000);
            long start = System.nanoTime();
            addColumnAndSwap(c);
            took = (System.nanoTime() - start) / 1_000_000;
            Thread.sleep(2000);
            report("add column, copy, swap", load, took);
        }
        Db.run(c, "VACUUM ANALYZE videos");
        check(c);
    }

    static void report(String name, Load load, long took) {
        System.out.println(name + ": took " + took + " ms");
        System.out.println("  longest write wait "
            + load.worstWrite.get() / 1_000_000 + " ms, longest read wait "
            + load.worstRead.get() / 1_000_000 + " ms");
        System.out.println("  writes " + load.writes.get() + ", reads "
            + load.reads.get() + ", failed " + load.failed.get()
            + " " + load.firstError);
    }

    /** No row lost, every id unchanged, and the limit really is gone. */
    static void check(Connection c) throws SQLException {
        long total = Db.one(c, "SELECT count(*) FROM videos");
        long same = Db.one(c, "SELECT count(*) FROM videos"
            + " WHERE title = 'video ' || id");
        long added = Db.one(c, "SELECT count(*) FROM videos"
            + " WHERE title = 'new'");
        System.out.println("  rows " + total + ": " + same
            + " old with the same id, " + added + " new");
        System.out.println("  id is " + Limits.columnType(c, "videos", "id")
            + ", sequence is " + Limits.sequenceType(c));
        Db.run(c, "SELECT setval('videos_id_seq', " + Limits.INT_MAX + ")");
        Limits.tryInserts(c, "  past the limit");
        try (Statement s = c.createStatement();
             ResultSet r = s.executeQuery("SELECT max(id) FROM videos")) {
            r.next();
            System.out.println("  largest id " + r.getLong(1));
        }
    }

    private Migrate() {}
}
