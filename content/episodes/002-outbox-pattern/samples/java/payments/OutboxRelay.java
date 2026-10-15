package payments;

import java.sql.SQLException;
import javax.sql.DataSource;

/**
 * The relay: publishes outbox rows, oldest first, and marks them published. Several relays can
 * run at once: SKIP LOCKED hands each one rows no other relay holds. A crash before the commit
 * leaves the whole batch unpublished, so it is sent again: delivery is at least once.
 * Shown in segment s05 of episode 002.
 */
public final class OutboxRelay {
    static final String PICK = """
            SELECT id, topic, payment_id, payload FROM outbox
            WHERE published_at IS NULL
            ORDER BY id LIMIT 100
            FOR UPDATE SKIP LOCKED""";
    static final String DONE = "UPDATE outbox SET published_at = now() WHERE id = ?";

    private final DataSource db;
    private final Broker broker;

    public OutboxRelay(DataSource db, Broker broker) {
        this.db = db;
        this.broker = broker;
    }

    /** Publishes one batch of up to 100 events. */
    public void publishBatch() throws SQLException, BrokerException {
        try (var conn = db.getConnection()) {
            conn.setAutoCommit(false);
            try (var pick = conn.prepareStatement(PICK);
                 var done = conn.prepareStatement(DONE);
                 var rows = pick.executeQuery()) {
                while (rows.next()) {
                  broker.publish(rows.getString("topic"),
                                 rows.getLong("payment_id"),
                                 rows.getString("payload"));
                  done.setLong(1, rows.getLong("id"));
                  done.executeUpdate();      // published_at = now()
                }
                conn.commit();               // all marked, together
            } catch (SQLException | BrokerException e) {
                conn.rollback(); // the rows stay unpublished; the next run sends them again
                throw e;
            }
        }
    }
}
