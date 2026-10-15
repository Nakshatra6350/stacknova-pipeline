package payments;

import static payments.Events.paidEvent;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;

/**
 * The outbox: the event is written as a row, in the same transaction as the business change, so
 * both commit or neither does. A relay (OutboxRelay) publishes it later.
 * Shown in segment s04 of episode 002.
 */
public final class OutboxPayments {
    private final DataSource db;

    public OutboxPayments(DataSource db) {
        this.db = db;
    }

    public void markPaid(long id) throws SQLException {
        try (var conn = db.getConnection()) {
            conn.setAutoCommit(false); // one transaction
            try {
              setPaid(conn, id);                   // UPDATE payments
              addEvent(conn, "payments.paid", id); // INSERT INTO outbox
              conn.commit();                       // both, or neither
            } catch (SQLException e) {
              conn.rollback();                     // or none
              throw e;
            }
        }
    }

    private static void setPaid(Connection conn, long id) throws SQLException {
        try (var update = conn.prepareStatement(
                "UPDATE payments SET status = 'paid' WHERE id = ?")) {
            update.setLong(1, id);
            update.executeUpdate();
        }
    }

    private static void addEvent(Connection conn, String topic, long id) throws SQLException {
        try (var insert = conn.prepareStatement(
                "INSERT INTO outbox (topic, payment_id, payload) VALUES (?, ?, ?::jsonb)")) {
            insert.setString(1, topic);
            insert.setLong(2, id);
            insert.setString(3, paidEvent(id));
            insert.executeUpdate();
        }
    }
}
