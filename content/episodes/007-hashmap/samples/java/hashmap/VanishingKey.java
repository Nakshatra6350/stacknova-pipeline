package hashmap;

import java.util.HashMap;
import java.util.Map;

/** A key whose hashCode changes after put cannot be found again (episode 007, part 3). */
public final class VanishingKey {
    static final class User {
        String email;   // can change: the bug

        User(String email) {
            this.email = email;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof User u && u.email.equals(email);
        }

        @Override
        public int hashCode() {
            return email.hashCode();
        }
    }

    record SafeUser(String email) {}   // fields are final: a safe key

    public static void main(String[] args) {
        Map<User, String> map = new HashMap<>();
        User ana = new User("ana@mail.com");
        map.put(ana, "Ana");
        ana.email = "ana@corp.dev";                    // hashCode changes after the put
        System.out.println(map.get(ana));              // null: wrong bucket
        System.out.println(map.containsKey(ana));      // false
        System.out.println(map.size());                // 1: she is still in there

        Map<SafeUser, String> safe = HashMap.newHashMap(100);   // Java 19+: sized for 100 entries
        safe.put(new SafeUser("ana@mail.com"), "Ana");
        System.out.println(safe.get(new SafeUser("ana@mail.com")));
    }
}
