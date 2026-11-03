import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

// A connection, a statement, and one value: all the tests need.
final class Db {
    static Connection open() throws SQLException {
        String url = System.getenv("DATABASE_URL");
        if (url == null) url = "jdbc:postgresql://localhost:55432/drivers?user=demo";
        return DriverManager.getConnection(url);
    }

    static void run(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }

    static String text(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet r = s.executeQuery(sql)) {
            return r.next() ? r.getString(1) : null;
        }
    }
}
