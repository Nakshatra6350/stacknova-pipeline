import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/** The few JDBC helpers every case uses. */
final class Db {
    static Connection open() throws SQLException {
        return DriverManager.getConnection(System.getenv("DATABASE_URL"));
    }

    static void run(Connection c, String... statements) throws SQLException {
        try (Statement s = c.createStatement()) {
            for (String sql : statements) s.execute(sql);
        }
    }

    static long one(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement();
             ResultSet r = s.executeQuery(sql)) {
            r.next();
            return r.getLong(1);
        }
    }

    static String text(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement();
             ResultSet r = s.executeQuery(sql)) {
            r.next();
            return r.getString(1);
        }
    }

    private Db() {}
}
