package limits;

import java.util.List;

/**
 * The simplest shared limiter: count requests per client per minute in Redis (INCR, and EXPIRE
 * on the first one). Its flaw: 100 requests at 0:59 and 100 more at 1:00 all pass, twice the
 * limit within two seconds. Episode 005, "Design a rate limiter". Shown in segment s03.
 */
public final class FixedWindow {
    static final String SCRIPT = """
            local n = redis.call('INCR', KEYS[1])
            if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end
            return n
            """;

    private final RedisRateLimiter.Redis redis;
    private final long limit;

    public FixedWindow(RedisRateLimiter.Redis redis, long limitPerMinute) {
        this.redis = redis;
        this.limit = limitPerMinute;
    }

    public boolean allow(String apiKey, long epochMinute) {
        var key = List.of("fw:" + apiKey + ":" + epochMinute); // this client, this minute
        return redis.evalLong(SCRIPT, key, List.of()) <= limit;
    }
}
