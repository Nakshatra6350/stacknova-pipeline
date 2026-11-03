// Distances on the Earth, and geohash cells: the two ideas every nearest-driver
// search is built from. No libraries.
final class Geo {
    static final double EARTH_KM = 6371.0088; // mean radius

    /** Great-circle distance in km: the real distance between two points. */
    static double km(double lat1, double lon1, double lat2, double lon2) {
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = p2 - p1, dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2)
                + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
    }

    /** The shortcut: treat degrees as if they were a flat grid. Wrong. */
    static double degrees(double lat1, double lon1, double lat2, double lon2) {
        double dLat = lat2 - lat1, dLon = lon2 - lon1;
        return Math.sqrt(dLat * dLat + dLon * dLon);
    }

    private static final String BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    /** A geohash: halve the world again and again, longitude first. */
    static String geohash(double lat, double lon, int length) {
        double[] la = {-90, 90}, lo = {-180, 180};
        StringBuilder out = new StringBuilder();
        int bits = 0, ch = 0;
        boolean even = true; // even bits split longitude, odd bits latitude
        while (out.length() < length) {
            double[] r = even ? lo : la;
            double v = even ? lon : lat, mid = (r[0] + r[1]) / 2;
            ch <<= 1;
            if (v >= mid) {
                ch |= 1;
                r[0] = mid;
            } else {
                r[1] = mid;
            }
            even = !even;
            if (++bits == 5) {
                out.append(BASE32.charAt(ch));
                bits = 0;
                ch = 0;
            }
        }
        return out.toString();
    }

    /** The box a geohash stands for: {minLat, maxLat, minLon, maxLon}. */
    static double[] box(String hash) {
        double[] la = {-90, 90}, lo = {-180, 180};
        boolean even = true;
        for (char c : hash.toCharArray()) {
            int ch = BASE32.indexOf(c);
            for (int bit = 4; bit >= 0; bit--) {
                double[] r = even ? lo : la;
                double mid = (r[0] + r[1]) / 2;
                if (((ch >> bit) & 1) == 1) r[0] = mid; else r[1] = mid;
                even = !even;
            }
        }
        return new double[] {la[0], la[1], lo[0], lo[1]};
    }

    /** The cells around one: ring 1 is the 8 neighbours, ring 2 the 16 after. */
    static java.util.List<String> ring(String hash, int k) {
        double[] b = box(hash);
        double h = b[1] - b[0], w = b[3] - b[2];
        double lat = (b[0] + b[1]) / 2, lon = (b[2] + b[3]) / 2;
        java.util.List<String> out = new java.util.ArrayList<>();
        for (int dy = -k; dy <= k; dy++) {
            for (int dx = -k; dx <= k; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) != k) continue;
                double x = lon + dx * w;
                x = ((x + 540) % 360) - 180; // across the date line
                out.add(geohash(lat + dy * h, x, hash.length()));
            }
        }
        return out;
    }

    /** How far a point is from the nearest edge of the k-ring block, in km. */
    static double safeKm(String hash, int k, double lat, double lon) {
        double[] b = box(hash);
        double h = b[1] - b[0], w = b[3] - b[2];
        double south = lat - (b[0] - k * h), north = (b[1] + k * h) - lat;
        double west = lon - (b[2] - k * w), east = (b[3] + k * w) - lon;
        double kmLat = 111.2, kmLon = 111.2 * Math.cos(Math.toRadians(Math.abs(lat) + h * (k + 1)));
        return Math.min(Math.min(south, north) * kmLat, Math.min(west, east) * kmLon);
    }

    static int common(String a, String b) {
        int n = 0;
        while (n < Math.min(a.length(), b.length()) && a.charAt(n) == b.charAt(n)) n++;
        return n;
    }
}
