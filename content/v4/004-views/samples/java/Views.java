import java.sql.Connection;

/**
 * Behind the Button #4. Every number in the video and guide comes from here.
 *
 *   javac -cp postgresql-42.7.4.jar -d out *.java
 *   DATABASE_URL="jdbc:postgresql://localhost:5432/views?user=demo"
 *   java -cp "out:postgresql-42.7.4.jar" Views wrap
 *
 * No database: wrap, exact, widen, narrow, midpoint, shards, lost, time, json.
 * Postgres: counter-sql, out-of-ids, on-fire, alter-only, identity, fk-left,
 *           burn, read-int, runway, hot-row, alter-lock, online.
 * (On Windows the class path separator is ; not :)
 */
public final class Views {
    interface Sql {
        void run(Connection c) throws Exception;
    }

    static void withDb(Sql body) throws Exception {
        try (Connection c = Db.open()) {
            body.run(c);
        }
    }

    public static void main(String[] args) throws Exception {
        switch (args[0]) {
            case "wrap" -> Counters.wrap();
            case "exact" -> Counters.exact();
            case "widen" -> Counters.widen();
            case "narrow" -> Counters.narrow();
            case "midpoint" -> Counters.midpoint();
            case "shards" -> Counters.shards();
            case "lost" -> Counters.lost();
            case "time" -> Counters.time();
            case "json" -> Counters.json();
            case "counter-sql" -> withDb(Limits::counterSql);
            case "out-of-ids" -> withDb(Limits::outOfIds);
            case "on-fire" -> withDb(Limits::onFire);
            case "alter-only" -> withDb(Limits::alterOnly);
            case "identity" -> withDb(Limits::identity);
            case "fk-left" -> withDb(Limits::fkLeft);
            case "burn" -> withDb(Limits::burn);
            case "read-int" -> withDb(Limits::readInt);
            case "runway" -> withDb(Limits::runway);
            case "hot-row" -> withDb(Limits::hotRow);
            case "alter-lock" -> withDb(Migrate::alterInPlace);
            case "online" -> withDb(Migrate::online);
            default -> throw new IllegalArgumentException(args[0]);
        }
    }

    private Views() {}
}
