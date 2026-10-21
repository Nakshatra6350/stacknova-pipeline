package hashmap;

import java.util.Objects;

/**
 * A small hash map, written for episode 007 to show how java.util.HashMap finds a key in one
 * jump, keeps colliding keys in a chain, and splits every chain in two when the table doubles.
 * No null keys, no trees and no removal, to stay short (java.util.HashMap has all three).
 */
public final class MiniMap<K, V> {
    static final class Node<K, V> {
        final int hash;   // stored once, when the key is put
        final K key;
        V value;
        Node<K, V> next;

        Node(int hash, K key, V value, Node<K, V> next) {
            this.hash = hash;
            this.key = key;
            this.value = value;
            this.next = next;
        }
    }

    private Node<K, V>[] table = newTable(16);   // always a power of two
    private int size;

    @SuppressWarnings("unchecked")
    private static <K, V> Node<K, V>[] newTable(int n) {
        return (Node<K, V>[]) new Node[n];
    }

    static int spread(Object key) {
        int h = key.hashCode();
        return h ^ (h >>> 16);   // top bits into bottom
    }

    public V get(Object key) {
        int hash = spread(key);
        Node<K, V> e = table[hash & (table.length - 1)];
        while (e != null) {
            if (e.hash == hash && Objects.equals(e.key, key))
                return e.value;
            e = e.next;
        }
        return null;
    }

    public V put(K key, V value) {
        int hash = spread(key);
        int i = hash & (table.length - 1);
        for (Node<K, V> e = table[i]; e != null; e = e.next) {
            if (e.hash == hash && Objects.equals(e.key, key)) {
                V old = e.value;
                e.value = value;
                return old;
            }
        }
        table[i] = new Node<>(hash, key, value, table[i]);   // newest first (HashMap appends)
        if (++size > table.length * 3 / 4) resize();        // load factor 0.75
        return null;
    }

    private void resize() {
        Node<K, V>[] old = table;
        int oldCap = old.length;
        table = newTable(oldCap * 2);
        Node<K, V> next;
        for (int j = 0; j < oldCap; j++) {
            for (Node<K, V> e = old[j]; e != null; e = next) {
                next = e.next;
                int i = (e.hash & oldCap) == 0 ? j : j + oldCap;
                e.next = table[i];
                table[i] = e;
            }
        }
    }

    public int size() {
        return size;
    }

    public int capacity() {
        return table.length;
    }

    public static void main(String[] args) {
        MiniMap<String, String> users = new MiniMap<>();
        users.put("user:42", "alice");
        users.put("user:97", "bob");   // same bucket as user:42 in a table of 16
        System.out.println(users.get("user:42") + " " + users.get("user:97"));
        for (int n = 0; n < 11; n++) users.put("order:" + n, "new");
        System.out.println(users.size() + " entries, " + users.capacity() + " buckets");
    }
}
