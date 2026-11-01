import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

/** The cases that need no database: what Java itself does at the limit. */
final class Counters {
    static final int N = 1000;
    static final Random RANDOM = new Random();

    /** One more view than an int can hold, then 999 more. */
    static void wrap() {
        int views = Integer.MAX_VALUE;
        long truth = Integer.MAX_VALUE;
        System.out.println("start    int " + views);
        views++;
        truth++;
        System.out.println("+1       int " + views + ", really " + truth);
        int wrong = 1;
        for (int i = 1; i < N; i++) {
            views++;
            truth++;
            if (views != truth) wrong++;
        }
        System.out.println("+1000    int " + views + ", really " + truth);
        System.out.println("int      " + wrong + " of " + N + " counts wrong");
        System.out.println("no error, no exception, no log line");
    }

    /** The same views, with the JDK's checked add. */
    static void exact() {
        int views = Integer.MAX_VALUE;
        int refused = 0;
        String message = "";
        for (int i = 0; i < N; i++) {
            try {
                views = Math.addExact(views, 1);
            } catch (ArithmeticException e) {
                refused++;
                message = e.getMessage();
            }
        }
        System.out.println("addExact " + refused + " of " + N
            + " refused: " + message);
        System.out.println("views    still " + views);

        long big = Integer.MAX_VALUE;
        for (int i = 0; i < N; i++) big = Math.addExact(big, 1L);
        System.out.println("long     " + big + ", 0 wrong");
    }

    /** Both sides are int, so it overflows before it reaches the long. */
    static void widen() {
        int wrong = 0;
        int right = 0;
        for (int i = 0; i < N; i++) {
            int views = 100_000 + RANDOM.nextInt(900_000);
            int bytes = 50_000 + RANDOM.nextInt(50_000);
            long late = views * bytes;         // int * int, then widened
            long early = (long) views * bytes; // long * int
            long truth = Math.multiplyExact((long) views, (long) bytes);
            if (late != truth) wrong++;
            if (early != truth) right++;
        }
        System.out.println("views * bytes        " + wrong + " of " + N
            + " wrong, into a long");
        System.out.println("(long) views * bytes " + right + " of " + N
            + " wrong");
        long fourGb = 4 * 1024 * 1024 * 1024;
        long fourGbRight = 4L * 1024 * 1024 * 1024;
        System.out.println("4 * 1024 * 1024 * 1024  = " + fourGb);
        System.out.println("4L * 1024 * 1024 * 1024 = " + fourGbRight);
    }

    /** A long squeezed back into an int: fine until it isn't. */
    static void narrow() {
        int wrong = 0;
        int refused = 0;
        for (int i = 0; i < N; i++) {
            long views = (1L << 31) + RANDOM.nextInt(2_000_000_000);
            int cast = (int) views;
            if (cast != views) wrong++;
            try {
                Math.toIntExact(views);
            } catch (ArithmeticException e) {
                refused++;
            }
        }
        System.out.println("(int) views        " + wrong + " of " + N
            + " silently wrong");
        System.out.println("(int) 3000000000L  = " + (int) 3_000_000_000L);
        System.out.println("Math.toIntExact    " + refused + " of " + N
            + " refused");
    }

    /** The midpoint bug that sat in the JDK's binary search for years. */
    static void midpoint() {
        int wrong = 0;
        int negative = 0;
        int safeWrong = 0;
        for (int i = 0; i < N; i++) {
            int lo = (1 << 30) + RANDOM.nextInt(1 << 29);
            int hi = lo + RANDOM.nextInt(Integer.MAX_VALUE - lo);
            long truth = ((long) lo + hi) / 2;
            int naive = (lo + hi) / 2;
            int safe = lo + (hi - lo) / 2;
            if (naive != truth) wrong++;
            if (naive < 0) negative++;
            if (safe != truth) safeWrong++;
        }
        System.out.println("(lo + hi) / 2      " + wrong + " of " + N
            + " wrong, " + negative + " negative");
        System.out.println("lo + (hi - lo) / 2 " + safeWrong + " of " + N
            + " wrong");
    }

    /** Picking a shard from a hash: hashCode() is negative half the time. */
    static void shards() {
        int shards = 10;
        int negative = 0;
        int absNegative = 0;
        int floorNegative = 0;
        for (int i = 0; i < N; i++) {
            int h = UUID.randomUUID().toString().hashCode();
            if (h % shards < 0) negative++;
            if (Math.abs(h) % shards < 0) absNegative++;
            if (Math.floorMod(h, shards) < 0) floorNegative++;
        }
        System.out.println("h % 10             " + negative + " of " + N
            + " negative");
        System.out.println("Math.abs(h) % 10   " + absNegative + " of " + N
            + " negative");
        System.out.println("Math.floorMod(h,10) " + floorNegative + " of " + N
            + " negative");

        String unlucky = "polygenelubricants";
        int h = unlucky.hashCode();
        System.out.println("\"" + unlucky + "\".hashCode() = " + h);
        System.out.println("Math.abs of it     = " + Math.abs(h));
        System.out.println("Math.abs(h) % 10   = " + Math.abs(h) % shards);
        System.out.println("Math.floorMod(h,10) = "
            + Math.floorMod(h, shards));
    }

    static int plainViews;

    /** Eight threads, one counter. Not overflow: the counter's other bug. */
    static void lost() throws InterruptedException {
        int threads = 8;
        int each = 1_000_000;
        long expected = (long) threads * each;

        plainViews = 0;
        long took = together(threads, () -> {
            for (int i = 0; i < each; i++) plainViews++;
        });
        System.out.println("int ++     " + (expected - plainViews) + " of "
            + expected + " views lost, " + took + " ms");

        AtomicLong atomic = new AtomicLong();
        took = together(threads, () -> {
            for (int i = 0; i < each; i++) atomic.incrementAndGet();
        });
        System.out.println("AtomicLong " + (expected - atomic.get()) + " of "
            + expected + " views lost, " + took + " ms");

        LongAdder adder = new LongAdder();
        took = together(threads, () -> {
            for (int i = 0; i < each; i++) adder.increment();
        });
        System.out.println("LongAdder  " + (expected - adder.sum()) + " of "
            + expected + " views lost, " + took + " ms");
    }

    static long together(int threads, Runnable work)
        throws InterruptedException {
        List<Thread> all = new ArrayList<>();
        long start = System.nanoTime();
        for (int i = 0; i < threads; i++) {
            Thread t = new Thread(work);
            all.add(t);
            t.start();
        }
        for (Thread t : all) t.join();
        return (System.nanoTime() - start) / 1_000_000;
    }

    /** The same number, counting seconds and milliseconds. */
    static void time() {
        int seconds = Integer.MAX_VALUE;
        System.out.println("int seconds  " + seconds + " = "
            + Instant.ofEpochSecond(seconds));
        seconds++;
        System.out.println("one more     " + seconds + " = "
            + Instant.ofEpochSecond(seconds));

        int firstBad = 0;
        for (int days = 1; days <= 60 && firstBad == 0; days++) {
            int ms = days * 24 * 60 * 60 * 1000;
            if (ms < 0) firstBad = days;
        }
        int ms = firstBad * 24 * 60 * 60 * 1000;
        long fine = firstBad * 24L * 60 * 60 * 1000;
        System.out.println("days to ms   first negative at " + firstBad
            + " days: " + ms + " (really " + fine + ")");
        System.out.println("2^31 / 100 per second = "
            + (1L << 31) / 100 / 86_400 + " days");
    }

    /** A 64-bit id through a double, which is what JSON numbers are in JS. */
    static void json() {
        long limit = 1L << 53;
        int wrong = 0;
        int stringWrong = 0;
        for (int i = 0; i < N; i++) {
            long id = limit + 1 + 2L * RANDOM.nextInt(1_000_000_000);
            double asNumber = id;
            if ((long) asNumber != id) wrong++;
            String asString = Long.toString(id);
            if (Long.parseLong(asString) != id) stringWrong++;
        }
        System.out.println("id as a double  " + wrong + " of " + N
            + " changed");
        System.out.println("id as a string  " + stringWrong + " of " + N
            + " changed");
        System.out.println("largest safe    " + (limit - 1));
    }

    private Counters() {}
}
