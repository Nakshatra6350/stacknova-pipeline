package payments;

import static payments.Events.paidEvent;

import javax.sql.DataSource;

/**
 * Save, then publish: the dual write most of us write first. The update is committed on its own
 * (auto-commit is on); the publish is a second write. If the process is restarted, or the broker
 * is down, between the two, the payment is paid and nobody else is ever told.
 * Shown in segment s02 of episode 002.
 */
public final class NaivePayments {
    private final DataSource db;
    private final Broker broker;

    public NaivePayments(DataSource db, Broker broker) {
        this.db = db;
        this.broker = broker;
    }

    public void markPaid(long id) throws Exception {
        try (var conn = db.getConnection();
             var update = conn.prepareStatement(
               "UPDATE payments SET status='paid' WHERE id=?")) {
            update.setLong(1, id);
            update.executeUpdate(); // committed
        }
        broker.publish("payments.paid", id, paidEvent(id));
    }
}
