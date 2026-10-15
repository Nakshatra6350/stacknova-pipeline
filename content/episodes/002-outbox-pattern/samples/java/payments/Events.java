package payments;

import java.util.UUID;
import java.util.regex.Pattern;

/** The "payments.paid" event and how a consumer reads it. A real service uses a JSON library. */
public final class Events {
    private static final Pattern FIELDS =
            Pattern.compile("\"event_id\":\"([0-9a-f-]{36})\",\"payment_id\":(\\d+)");

    private Events() {}

    /** One event, with an id of its own so every consumer can tell a duplicate. */
    public record Event(UUID id, long paymentId) {}

    /** The message for "this payment is paid". Each call makes a new event id. */
    public static String paidEvent(long paymentId) {
        return "{\"event_id\":\"" + UUID.randomUUID() + "\",\"payment_id\":" + paymentId
                + ",\"status\":\"paid\"}";
    }

    public static Event parse(String value) {
        var found = FIELDS.matcher(value);
        if (!found.find()) {
            throw new IllegalArgumentException("not a payments.paid event: " + value);
        }
        return new Event(UUID.fromString(found.group(1)), Long.parseLong(found.group(2)));
    }
}
