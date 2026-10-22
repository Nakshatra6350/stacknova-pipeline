package hashmap;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Order and caching (episode 007, s08). HashMap iterates bucket by bucket; LinkedHashMap also links
 * its entries in insertion order, or in access order, which makes an LRU cache in a few lines.
 */
public final class LruCache<K, V> extends LinkedHashMap<K, V> {
    private final int max;

    public LruCache(int max) {
        super(16, 0.75f, true);   // true: access order, so every get moves the entry to the end
        this.max = max;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > max;      // past the limit, the least recently used entry goes
    }

    public static void main(String[] args) {
        var hash = new HashMap<String, Integer>();
        var linked = new LinkedHashMap<String, Integer>();
        for (var key : List.of("ana", "tom", "kai", "zoe")) {   // buckets 5, 3, 2 and 1
            hash.put(key, 1);
            linked.put(key, 1);
        }
        System.out.println(hash.keySet());     // [zoe, kai, tom, ana]: bucket order
        System.out.println(linked.keySet());   // [ana, tom, kai, zoe]: insertion order

        var cache = new LruCache<String, String>(3);
        cache.put("ana", "A");
        cache.put("bo", "B");
        cache.put("leo", "L");
        cache.get("ana");                      // ana becomes the most recently used
        cache.put("dee", "D");                 // a 4th entry: bo, the eldest, is dropped
        System.out.println(cache.keySet());    // [leo, ana, dee]
    }
}
