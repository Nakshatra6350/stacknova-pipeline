// The nearest driver, in milliseconds (look v4 #8): reading every driver, cells
// on a map and the edge problem, degrees that aren't kilometres, and the index
// that does it properly. Five real cities, made-up drivers, real arithmetic.
//
//   java Drivers grid      // own cell only, the 9 around it, and a safe search
//   java Drivers degrees   // nearest by degrees, against nearest by km
//   java Drivers edge      // two points 10 m apart with nothing in common
//   java Drivers dateline  // a search box across 180 degrees
//   java Drivers load      // 1,000,000 drivers into Postgres
//   java Drivers scan      // every driver, every time
//   java Drivers knn       // Postgres indexes: geohash cells, GiST, earthdistance
//   java Drivers moving    // drivers move: what each index costs a write
//
// Needs Postgres in DATABASE_URL for load, scan, knn and moving.
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

public class Drivers {
    record City(String name, double lat, double lon) {}

    static final City[] CITIES = {
        new City("Singapore", 1.3521, 103.8198),
        new City("Mumbai", 19.0760, 72.8777),
        new City("Sao Paulo", -23.5505, -46.6333),
        new City("London", 51.5072, -0.1276),
        new City("Oslo", 59.9139, 10.7522),
    };
    static final double HALF_KM = 15; // each city is a 30 km square

    /** n random points in a city's square, the same every run for one seed. */
    static double[][] points(City c, int n, long seed) {
        Random r = new Random(seed);
        double dLat = HALF_KM / 111.2;
        double dLon = HALF_KM / (111.2 * Math.cos(Math.toRadians(c.lat())));
        double[][] p = new double[n][2];
        for (int i = 0; i < n; i++) {
            p[i][0] = c.lat() + (r.nextDouble() * 2 - 1) * dLat;
            p[i][1] = c.lon() + (r.nextDouble() * 2 - 1) * dLon;
        }
        return p;
    }

    /** The truth: measure the real distance to every driver. */
    static int nearest(double[][] d, double lat, double lon) {
        int best = -1;
        double bestKm = Double.MAX_VALUE;
        for (int i = 0; i < d.length; i++) {
            double km = Geo.km(lat, lon, d[i][0], d[i][1]);
            if (km < bestKm) {
                bestKm = km;
                best = i;
            }
        }
        return best;
    }

    static Map<String, List<Integer>> cells(double[][] d, int len) {
        Map<String, List<Integer>> m = new HashMap<>();
        for (int i = 0; i < d.length; i++) {
            m.computeIfAbsent(Geo.geohash(d[i][0], d[i][1], len),
                    k -> new ArrayList<>()).add(i);
        }
        return m;
    }

    static int bestIn(double[][] d, List<Integer> ids, double lat, double lon) {
        int best = -1;
        double bestKm = Double.MAX_VALUE;
        for (int i : ids) {
            double km = Geo.km(lat, lon, d[i][0], d[i][1]);
            if (km < bestKm) {
                bestKm = km;
                best = i;
            }
        }
        return best;
    }

    /** Own cell, then ring after ring, until no cell further out can win. */
    static int safeNearest(double[][] d, Map<String, List<Integer>> grid,
                           String cell, double lat, double lon, int[] looked) {
        List<Integer> seen = new ArrayList<>(grid.getOrDefault(cell, List.of()));
        looked[0] = 1;
        for (int k = 1; ; k++) {
            int best = bestIn(d, seen, lat, lon);
            // a driver further out than ring k-1 is at least this far away
            if (best >= 0 && Geo.km(lat, lon, d[best][0], d[best][1])
                    <= Geo.safeKm(cell, k - 1, lat, lon)) {
                return best;
            }
            for (String h : Geo.ring(cell, k)) {
                seen.addAll(grid.getOrDefault(h, List.of()));
                looked[0]++;
            }
            if (k > 40) return bestIn(d, seen, lat, lon);
        }
    }

    // ------------------------------------------------------------------ grid
    static void grid() {
        final int riders = 1000, len = 6;
        System.out.println("geohash cells of 6 characters; 1,000 riders a city");
        for (int[] busy : new int[][] {{500, 0}, {5_000, 0}, {50_000, 1}}) {
            int wrongOwn = 0, emptyOwn = 0, wrong9 = 0, wrongSafe = 0, total = 0;
            double extraOwn = 0, extra9 = 0, cellsSafe = 0;
            for (City c : CITIES) {
                double[][] d = points(c, busy[0], c.name().hashCode());
                double[][] r = points(c, riders, c.name().hashCode() + 1);
                Map<String, List<Integer>> grid = cells(d, len);
                for (double[] p : r) {
                    total++;
                    int truth = nearest(d, p[0], p[1]);
                    double truthKm = Geo.km(p[0], p[1], d[truth][0], d[truth][1]);
                    String cell = Geo.geohash(p[0], p[1], len);
                    int own = bestIn(d, grid.getOrDefault(cell, List.of()), p[0], p[1]);
                    if (own < 0) {
                        emptyOwn++;
                    } else if (own != truth) {
                        wrongOwn++;
                        extraOwn += Geo.km(p[0], p[1], d[own][0], d[own][1]) - truthKm;
                    }
                    List<Integer> nine = new ArrayList<>(grid.getOrDefault(cell, List.of()));
                    for (String h : Geo.ring(cell, 1)) {
                        nine.addAll(grid.getOrDefault(h, List.of()));
                    }
                    int n9 = bestIn(d, nine, p[0], p[1]);
                    if (n9 != truth) {
                        wrong9++;
                        if (n9 >= 0) extra9 += Geo.km(p[0], p[1], d[n9][0], d[n9][1]) - truthKm;
                    }
                    int[] looked = {0};
                    if (safeNearest(d, grid, cell, p[0], p[1], looked) != truth) wrongSafe++;
                    cellsSafe += looked[0];
                }
            }
            System.out.printf("%,d drivers a city: own cell wrong %d, empty %d of %d " +
                    "(%.0f m further on average when wrong)%n", busy[0], wrongOwn,
                    emptyOwn, total, wrongOwn == 0 ? 0 : extraOwn * 1000 / wrongOwn);
            System.out.printf("   9 cells wrong %d (%.0f m further); safe search wrong %d, " +
                    "%.1f cells looked at on average%n", wrong9,
                    wrong9 == 0 ? 0 : extra9 * 1000 / wrong9, wrongSafe, cellsSafe / total);
        }
    }

    // --------------------------------------------------------------- degrees
    static void degrees() {
        System.out.println("nearest by degrees, against nearest by real distance; " +
                "5,000 drivers, 1,000 riders a city");
        for (City c : CITIES) {
            double[][] d = points(c, 5_000, c.name().hashCode());
            double[][] r = points(c, 1000, c.name().hashCode() + 1);
            int wrong = 0;
            double extra = 0;
            for (double[] p : r) {
                int truth = nearest(d, p[0], p[1]);
                int best = -1;
                double bestDeg = Double.MAX_VALUE;
                for (int i = 0; i < d.length; i++) {
                    double deg = Geo.degrees(p[0], p[1], d[i][0], d[i][1]);
                    if (deg < bestDeg) {
                        bestDeg = deg;
                        best = i;
                    }
                }
                if (best != truth) {
                    wrong++;
                    extra += Geo.km(p[0], p[1], d[best][0], d[best][1])
                            - Geo.km(p[0], p[1], d[truth][0], d[truth][1]);
                }
            }
            double oneDegLon = 111.2 * Math.cos(Math.toRadians(c.lat()));
            System.out.printf("%-10s lat %6.1f: 1 degree of longitude is %5.1f km. Wrong " +
                    "driver %3d of 1000 (%.0f m further on average)%n", c.name(), c.lat(),
                    oneDegLon, wrong, wrong == 0 ? 0 : extra * 1000 / wrong);
        }
    }

    // ------------------------------------------------------------------ edge
    static void edge() {
        double[][] pairs = {
            {51.4779, -0.00005, 51.4779, 0.00005}, // Greenwich, either side of 0
            {0.00005, 103.0, -0.00005, 103.0},     // either side of the equator
            {51.5072, -0.1276, 51.5072, -0.1275},  // central London, 7 m apart
        };
        for (double[] p : pairs) {
            String a = Geo.geohash(p[0], p[1], 9), b = Geo.geohash(p[2], p[3], 9);
            System.out.printf("%.0f m apart: %s and %s, %d characters in common%n",
                    Geo.km(p[0], p[1], p[2], p[3]) * 1000, a, b, Geo.common(a, b));
        }
    }

    // -------------------------------------------------------------- dateline
    static void dateline() {
        // Fiji's Taveuni island sits on 180 degrees
        double lat = -16.8, lon = 179.999;
        Random r = new Random(7);
        double[][] d = new double[1000][2];
        for (int i = 0; i < d.length; i++) {
            d[i][0] = lat + (r.nextDouble() - 0.5) * 0.04;
            double x = lon + (r.nextDouble() - 0.5) * 0.04;
            d[i][1] = x > 180 ? x - 360 : x; // past 180 is -180 and counting up
        }
        double box = 0.02;
        int inside = 0, insideWrapped = 0, real = 0;
        for (double[] p : d) {
            if (Geo.km(lat, lon, p[0], p[1]) <= 1.5) real++;
            boolean naive = Math.abs(p[0] - lat) <= box && Math.abs(p[1] - lon) <= box;
            double dLon = Math.abs(((p[1] - lon + 540) % 360) - 180);
            boolean wrapped = Math.abs(p[0] - lat) <= box && dLon <= box;
            if (naive && Geo.km(lat, lon, p[0], p[1]) <= 1.5) inside++;
            if (wrapped && Geo.km(lat, lon, p[0], p[1]) <= 1.5) insideWrapped++;
        }
        System.out.printf("drivers within 1.5 km of a rider on 180 degrees: %d really, " +
                "naive box finds %d, box that wraps finds %d%n", real, inside, insideWrapped);
    }

    // ------------------------------------------------------------- database
    static final int TOTAL = 1_000_000;

    static void load(Connection c) throws Exception {
        Db.run(c, "CREATE EXTENSION IF NOT EXISTS cube");
        Db.run(c, "CREATE EXTENSION IF NOT EXISTS earthdistance");
        Db.run(c, "DROP TABLE IF EXISTS drivers");
        Db.run(c, DRIVERS_TABLE);
        StringBuilder csv = new StringBuilder();
        int per = TOTAL / CITIES.length, id = 0;
        for (City city : CITIES) {
            for (double[] p : points(city, per, city.name().hashCode() + 9)) {
                csv.append(++id).append(',').append(city.name()).append(',')
                   .append(p[0]).append(',').append(p[1]).append(',')
                   .append(Geo.geohash(p[0], p[1], 6)).append('\n');
            }
        }
        long t = System.nanoTime();
        new org.postgresql.copy.CopyManager((org.postgresql.core.BaseConnection) c)
            .copyIn("COPY drivers (id, city, lat, lon, cell) FROM STDIN (FORMAT csv)",
                    new java.io.StringReader(csv.toString()));
        System.out.printf("%,d drivers copied in %.1f s%n", TOTAL, (System.nanoTime() - t) / 1e9);
        for (String[] idx : INDEXES) {
            t = System.nanoTime();
            Db.run(c, idx[1]);
            System.out.printf("%-18s built in %4.1f s, %s%n", idx[0],
                    (System.nanoTime() - t) / 1e9,
                    Db.text(c, "SELECT pg_size_pretty(pg_relation_size('" + idx[2] + "'))"));
        }
        Db.run(c, "VACUUM ANALYZE drivers");
        System.out.println("table " + Db.text(c, "SELECT pg_size_pretty(pg_table_size('drivers'))"));
    }

    static final String DRIVERS_TABLE = """
        CREATE TABLE drivers (
          id   BIGINT PRIMARY KEY,
          city TEXT NOT NULL,
          lat  DOUBLE PRECISION NOT NULL,
          lon  DOUBLE PRECISION NOT NULL,
          cell TEXT NOT NULL            -- its 6-character geohash
        )""";

    static final String[][] INDEXES = {
        {"geohash cell", "CREATE INDEX drivers_cell ON drivers (cell)", "drivers_cell"},
        {"GiST on degrees", "CREATE INDEX drivers_pt ON drivers USING gist "
            + "(point(lon, lat))", "drivers_pt"},
        {"GiST on the Earth", "CREATE INDEX drivers_earth ON drivers USING gist "
            + "(ll_to_earth(lat, lon))", "drivers_earth"},
    };

    // The real distance, in km, worked out in SQL: haversine.
    static final String KM = "2 * 6371.0088 * asin(sqrt(power(sin(radians(lat - ?) / 2), 2)"
        + " + cos(radians(?)) * cos(radians(lat)) * power(sin(radians(lon - ?) / 2), 2)))";

    // Nearest first, straight out of the index, on the curved Earth.
    static final String NEAREST = """
        SELECT id FROM drivers
        ORDER BY ll_to_earth(lat, lon) <-> ll_to_earth(?, ?)
        LIMIT 1""";

    // The same, with lat and lon treated as a flat grid of degrees.
    static final String NEAREST_DEGREES = """
        SELECT id FROM drivers
        ORDER BY point(lon, lat) <-> point(?, ?)
        LIMIT 1""";

    record Rider(String city, double lat, double lon) {}

    static List<Rider> riders(int perCity) {
        List<Rider> out = new ArrayList<>();
        for (City city : CITIES) {
            for (double[] p : points(city, perCity, city.name().hashCode() + 2)) {
                out.add(new Rider(city.name(), p[0], p[1]));
            }
        }
        return out;
    }

    static long exact(Connection c, Rider r) throws Exception {
        try (PreparedStatement s = c.prepareStatement(
                "SELECT id FROM drivers ORDER BY " + KM + " LIMIT 1")) {
            s.setDouble(1, r.lat());
            s.setDouble(2, r.lat());
            s.setDouble(3, r.lon());
            try (ResultSet rs = s.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }

    static void scan(Connection c) throws Exception {
        Db.run(c, "SET enable_indexscan = off; SET enable_bitmapscan = off");
        List<Rider> rs = riders(4);
        exact(c, rs.get(0));
        long t = System.nanoTime();
        for (Rider r : rs) exact(c, r);
        double ms = (System.nanoTime() - t) / 1e6 / rs.size();
        System.out.printf("every driver, every time: %,d drivers, %.0f ms a rider (%d riders)%n",
                TOTAL, ms, rs.size());
        // and in the app's own memory, no database
        double[][] all = new double[TOTAL][];
        int i = 0;
        for (City city : CITIES) {
            for (double[] p : points(city, TOTAL / CITIES.length, city.name().hashCode() + 9)) {
                all[i++] = p;
            }
        }
        List<Rider> many = riders(4);
        nearest(all, many.get(0).lat(), many.get(0).lon());
        t = System.nanoTime();
        for (Rider r : many) nearest(all, r.lat(), r.lon());
        System.out.printf("the same scan in Java's own memory: %.1f ms a rider (%d riders)%n",
                (System.nanoTime() - t) / 1e6 / many.size(), many.size());
        Db.run(c, "RESET enable_indexscan; RESET enable_bitmapscan");
    }

    static long one(PreparedStatement s, double a, double b) throws Exception {
        s.setDouble(1, a);
        s.setDouble(2, b);
        try (ResultSet rs = s.executeQuery()) {
            rs.next();
            return rs.getLong(1);
        }
    }

    static void knn(Connection c) throws Exception {
        List<Rider> rs = riders(200);
        Map<Integer, Long> truth = new HashMap<>();
        Db.run(c, "SET enable_indexscan = off; SET enable_bitmapscan = off");
        for (int i = 0; i < rs.size(); i += 20) truth.put(i, exact(c, rs.get(i)));
        Db.run(c, "RESET enable_indexscan; RESET enable_bitmapscan");
        String nine = "SELECT id FROM drivers WHERE cell = ANY(?) ORDER BY " + KM + " LIMIT 1";
        record Way(String label, String sql) {}
        for (Way w : new Way[] {
                new Way("GiST on the Earth", NEAREST),
                new Way("GiST on degrees", NEAREST_DEGREES),
                new Way("9 geohash cells", nine)}) {
            try (PreparedStatement s = c.prepareStatement(w.sql())) {
                Map<String, Integer> wrong = new HashMap<>();
                long t = 0;
                for (int pass = 0; pass < 2; pass++) { // the first pass warms up
                    t = System.nanoTime();
                    for (int i = 0; i < rs.size(); i++) {
                        Rider r = rs.get(i);
                        long id;
                        if (w.sql() == nine) {
                            String cell = Geo.geohash(r.lat(), r.lon(), 6);
                            List<String> cells = new ArrayList<>(Geo.ring(cell, 1));
                            cells.add(cell);
                            s.setArray(1, c.createArrayOf("text", cells.toArray()));
                            s.setDouble(2, r.lat());
                            s.setDouble(3, r.lat());
                            s.setDouble(4, r.lon());
                            try (ResultSet x = s.executeQuery()) {
                                x.next();
                                id = x.getLong(1);
                            }
                        } else if (w.sql() == NEAREST_DEGREES) {
                            id = one(s, r.lon(), r.lat());
                        } else {
                            id = one(s, r.lat(), r.lon());
                        }
                        if (pass == 1 && truth.containsKey(i) && truth.get(i) != id) {
                            wrong.merge(r.city(), 1, Integer::sum);
                        }
                    }
                }
                double ms = (System.nanoTime() - t) / 1e6 / rs.size();
                System.out.printf("%-18s %.3f ms a rider; wrong driver (of %d checked): %s%n",
                        w.label(), ms, truth.size(), wrong.isEmpty() ? "none" : wrong);
            }
        }
        System.out.println(plan(c, "EXPLAIN (ANALYZE, BUFFERS) " + NEAREST.replace("?", "51.5")));
    }

    static String plan(Connection c, String sql) throws Exception {
        StringBuilder out = new StringBuilder();
        try (var s = c.createStatement(); ResultSet r = s.executeQuery(sql)) {
            while (r.next()) {
                String line = r.getString(1).trim();
                if (line.contains("Scan") || line.startsWith("Buffers") || line.startsWith("Execution")) {
                    out.append("  ").append(line).append('\n');
                }
            }
        }
        return out.toString();
    }

    // ---------------------------------------------------------------- moving
    static void moving(Connection c) throws Exception {
        final int n = 20_000;
        Random r = new Random(3);
        for (String[] cfg : new String[][] {
                {"no index", ""},
                {"geohash cell", INDEXES[0][1].replace("drivers", "m_drivers")},
                {"GiST on the Earth", INDEXES[2][1].replace("drivers", "m_drivers")}}) {
            Db.run(c, "DROP TABLE IF EXISTS m_drivers");
            Db.run(c, "CREATE TABLE m_drivers AS SELECT * FROM drivers WHERE id <= 200000");
            Db.run(c, "ALTER TABLE m_drivers ADD PRIMARY KEY (id)");
            if (!cfg[1].isEmpty()) Db.run(c, cfg[1]);
            Db.run(c, "CHECKPOINT");
            try (PreparedStatement s = c.prepareStatement(
                    "UPDATE m_drivers SET lat = lat + ?, lon = lon + ?, cell = ? WHERE id = ?")) {
                long t = System.nanoTime();
                for (int i = 0; i < n; i++) {
                    s.setDouble(1, (r.nextDouble() - 0.5) * 0.001);
                    s.setDouble(2, (r.nextDouble() - 0.5) * 0.001);
                    s.setString(3, "u10hb7"); // a new cell, so its index changes too
                    s.setLong(4, 1 + r.nextInt(200_000));
                    s.executeUpdate();
                }
                double sec = (System.nanoTime() - t) / 1e9;
                System.out.printf("%-18s %,6.0f location updates a second%n", cfg[0], n / sec);
            }
        }
        Db.run(c, "DROP TABLE m_drivers");
    }

    public static void main(String[] args) throws Exception {
        String mode = args.length > 0 ? args[0] : "grid";
        switch (mode) {
            case "grid" -> grid();
            case "degrees" -> degrees();
            case "edge" -> edge();
            case "dateline" -> dateline();
            default -> {
                try (Connection c = Db.open()) {
                    switch (mode) {
                        case "load" -> load(c);
                        case "scan" -> scan(c);
                        case "knn" -> knn(c);
                        case "moving" -> moving(c);
                        default -> throw new IllegalArgumentException("no mode " + mode);
                    }
                }
            }
        }
    }
}
