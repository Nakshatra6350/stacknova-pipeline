package hashmap;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Strings built from "Aa" and "BB" all share one hashCode: the raw material of the 2011 hash
 * flooding attack (episode 007). Every key lands in the same bucket.
 */
public final class Collide {
    static List<String> colliding(int pairs) {
        List<String> keys = new ArrayList<>(List.of(""));
        for (int i = 0; i < pairs; i++) {
            List<String> longer = new ArrayList<>();
            for (String k : keys) {
                longer.add(k + "Aa");   // "Aa".hashCode() == 2112
                longer.add(k + "BB");   // "BB".hashCode() == 2112
            }
            keys = longer;
        }
        return keys;
    }

    public static void main(String[] args) {
        List<String> keys = colliding(14);   // 16,384 keys
        int first = keys.get(0).hashCode();
        boolean same = keys.stream().allMatch(k -> k.hashCode() == first);
        System.out.println(keys.size() + " keys, all one hashCode: " + same);
        var map = new HashMap<String, Integer>();
        for (String k : keys) map.put(k, k.length());   // one bucket; a tree since Java 8
        System.out.println(map.size() + " entries in the map");
    }
}
