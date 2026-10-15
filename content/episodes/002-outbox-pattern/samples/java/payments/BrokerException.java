package payments;

/** The broker did not acknowledge a message: it may or may not have it. */
public final class BrokerException extends Exception {
    public BrokerException(String message, Throwable cause) {
        super(message, cause);
    }
}
