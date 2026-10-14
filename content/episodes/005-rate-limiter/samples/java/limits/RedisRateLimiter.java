package limits;

import java.util.List;

/**
 * A token bucket shared by every API server: the bucket lives in Redis, one per API key, and the
 * whole read-refill-take-write runs as one Lua script, so two servers can never both take the
 * last token. The time comes from Redis, not from each server's clock.
 * Episode 005, "Design a rate limiter". Shown in segment s06.
 */
public final class RedisRateLimiter {
    /** The one call this needs from a Redis client (Lettuce, Jedis and others all offer EVAL). */
    public interface Redis {
        long evalLong(String script, List<String> keys, List<String> args);
    }

    // KEYS[1] = the bucket; ARGV[1] = capacity (burst); ARGV[2] = refill rate, tokens per ms.
    static final String SCRIPT = """
            local c, r = tonumber(ARGV[1]), tonumber(ARGV[2])
            local t = redis.call('TIME')          -- Redis's clock
            local now = t[1] * 1000 + t[2] / 1000 -- in ms
            local b = redis.call('HMGET', KEYS[1], 'tok', 'ts')
            local tok = tonumber(b[1]) or c
            local ts = tonumber(b[2]) or now
            tok = math.min(c, tok + (now - ts) * r) -- refill
            local ok = tok >= 1
            if ok then tok = tok - 1 end
            redis.call('HSET', KEYS[1], 'tok', tok, 'ts', now)
            redis.call('PEXPIRE', KEYS[1], math.ceil(c / r))
            return ok and 1 or 0
            """;

    private final Redis redis;
    private final List<String> limits;

    public RedisRateLimiter(Redis redis, double capacity, double perSecond) {
        this.redis = redis;
        this.limits = List.of(Double.toString(capacity), Double.toString(perSecond / 1000.0));
    }

    public boolean allow(String apiKey) {
      try {
        var key = List.of("rl:" + apiKey); // per API key
        return redis.evalLong(SCRIPT, key, limits) == 1;
      } catch (RuntimeException e) {
        return true; // Redis is down: fail open
      }
    }
}
