package hashmap;

import java.util.HashMap;
import java.util.Map;

/**
 * Sizing a map (episode 007, s08). new HashMap<>(100) asks for a capacity of 100: the table is
 * rounded up to 128 buckets and resizes after 96 entries (0.75 load factor). HashMap.newHashMap(100)
 * (Java 19+) sizes it for 100 entries: 256 buckets, so 100 entries fit without a resize.
 */
public final class Sizing {
    public static void main(String[] args) {
        Map<Integer, String> capacity = new HashMap<>(100);       // 128 buckets: entry 97 resizes
        Map<Integer, String> entries = HashMap.newHashMap(100);   // 256 buckets: no resize
        for (int i = 0; i < 100; i++) {
            capacity.put(i, "x");
            entries.put(i, "x");
        }
        System.out.println(capacity.size() + " " + entries.size());   // 100 100
    }
}
