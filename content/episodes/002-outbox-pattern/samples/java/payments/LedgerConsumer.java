package payments;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;

/**
 * An idempotent consumer. The outbox delivers at least once, so the same event can arrive twice.
 * Before applying an event, the ledger records (consumer, event id) in a table whose primary key
 * is that pair: each consumer keeps its own record, so the ledger and the email service can each
 * handle the same event once. The record and the effect commit together.
 * Shown in segment s06 of episode 002.
 */
public final class LedgerConsumer {
    static final String SEEN = """
            INSERT INTO processed_events (consumer, event_id)
            VALUES (?, ?) ON CONFLICT DO NOTHING""";

    private final DataSource db;

    public LedgerConsumer(DataSource db) {
        this.db = db;
    }

    public void onPaymentPaid(String value) throws SQLException {
        var event = Events.parse(value);
        try (var conn = db.getConnection()) {
            conn.setAutoCommit(false);
            try (var seen = conn.prepareStatement(SEEN)) {
                seen.setString(1, "ledger");          // this consumer
                seen.setObject(2, event.id());        // this event
                if (seen.executeUpdate() == 0) {      // seen before
                  conn.rollback();                    // a duplicate:
                  return;                             // do nothing
                }
                addLedgerEntry(conn, event);          // the effect
                conn.commit();                        // both, or neither
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            }
        }
    }

    private static void addLedgerEntry(Connection conn, Events.Event event) throws SQLException {
        try (var insert = conn.prepareStatement(
                "INSERT INTO ledger (payment_id, entry) VALUES (?, 'paid')")) {
            insert.setLong(1, event.paymentId());
            insert.executeUpdate();
        }
    }
}
