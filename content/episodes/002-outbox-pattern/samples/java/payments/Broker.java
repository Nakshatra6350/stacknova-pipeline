package payments;

/**
 * The message broker (Kafka, in the next episode), as the payments service sees it.
 * Episode 002, "The outbox pattern".
 */
public interface Broker {
    /**
     * Sends one message and returns once the broker has acknowledged it. Messages with the same
     * key (here, the payment's id) stay in order on the broker.
     */
    void publish(String topic, long key, String value) throws BrokerException;
}
