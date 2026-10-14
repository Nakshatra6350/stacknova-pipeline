package limits;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.IOException;

/**
 * Rate limiting in front of an HTTP handler (the JDK's built-in server). The limit is per
 * authenticated client, never global and never by IP alone: one noisy key must not spend another
 * customer's quota. A rejected request gets 429 Too Many Requests and a Retry-After header.
 * Episode 005, "Design a rate limiter". Shown in segment s08.
 */
public final class RateLimitFilter implements HttpHandler {
    private final RedisRateLimiter limiter;
    private final HttpHandler next;

    public RateLimitFilter(RedisRateLimiter limiter, HttpHandler next) {
        this.limiter = limiter;
        this.next = next;
    }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        var client = clientId(ex); // the authenticated caller
        if (client == null) {
            ex.sendResponseHeaders(401, -1);
            ex.close();
            return;
        }
        if (!limiter.allow(client)) {
          ex.getResponseHeaders().set("Retry-After", "1");
          ex.sendResponseHeaders(429, -1); // Too Many Requests
          ex.close();
          return;
        }
        next.handle(ex);
    }

    /** Which customer is calling. A real service checks the key; this sketch only reads it. */
    private static String clientId(HttpExchange ex) {
        var auth = ex.getRequestHeaders().getFirst("Authorization");
        return auth == null || !auth.startsWith("Bearer ") ? null : auth.substring(7);
    }
}
