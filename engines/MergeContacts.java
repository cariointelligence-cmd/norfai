import java.io.*;
import java.util.*;

/** Merge contact JSON arrays. Prefer published over inferred. Stdin: {"items":[{value,classification}...]}. */
public class MergeContacts {
    static String field(String obj, String key) {
        String needle = "\"" + key + "\"";
        int i = obj.indexOf(needle);
        if (i < 0) return "";
        int colon = obj.indexOf(':', i);
        int q = obj.indexOf('"', colon + 1);
        if (q < 0) return "";
        int q2 = obj.indexOf('"', q + 1);
        if (q2 < 0) return "";
        return obj.substring(q + 1, q2);
    }

    public static void main(String[] args) throws Exception {
        StringBuilder sb = new StringBuilder();
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        String raw = sb.toString();
        Map<String, String> best = new LinkedHashMap<>();
        int idx = 0;
        while (true) {
            int a = raw.indexOf('{', idx);
            if (a < 0) break;
            int b = raw.indexOf('}', a);
            if (b < 0) break;
            String obj = raw.substring(a, b + 1);
            idx = b + 1;
            String value = field(obj, "value").toLowerCase(Locale.ROOT).trim();
            if (value.isEmpty()) continue;
            String cls = field(obj, "classification");
            if (cls.isEmpty()) cls = "inferred";
            String prev = best.get(value);
            if (prev == null || "published".equals(cls) || "obfuscated".equals(cls) && !"published".equals(prev)) {
                best.put(value, cls);
            }
        }
        StringBuilder out = new StringBuilder("{\"items\":[");
        boolean first = true;
        for (Map.Entry<String, String> e : best.entrySet()) {
            if (!first) out.append(',');
            first = false;
            out.append("{\"value\":\"").append(e.getKey().replace("\"", "")).append("\",\"classification\":\"")
                .append(e.getValue()).append("\"}");
        }
        out.append("]}");
        System.out.print(out);
    }
}
