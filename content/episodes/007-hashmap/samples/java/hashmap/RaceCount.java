package hashmap;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

/**
 * Threads counting into one map (episode 007, s08). HashMap.merge is read, add, write: two threads
 * can read the same count and one update is lost. ConcurrentHashMap.merge runs atomically per key.
 */
public final class RaceCount {
    static int count(Map<String, Integer> counts) {
        Runnable inc = () -> counts.merge("order", 1, Integer::sum);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {   // Java 21+
            for (int i = 0; i < 100_000; i++) {
                pool.submit(inc);
            }
        }   // close() waits for every task
        return counts.getOrDefault("order", 0);
    }

    public static void main(String[] args) {
        System.out.println("HashMap:           " + count(new HashMap<>()));            // often short
        System.out.println("ConcurrentHashMap: " + count(new ConcurrentHashMap<>()));  // 100000
    }
}
