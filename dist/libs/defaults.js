import { registerPlugin } from "./registry.js";
import { jaccardSimilarity, levenshteinSimilarity } from "./comparitors.js";
const BUILT_IN_PLUGINS = [
    {
        path: "userAgent",
        weight: 20,
        comparator: (a, b) => levenshteinSimilarity(String(a || "").toLowerCase(), String(b || "").toLowerCase())
    },
    {
        path: "platform",
        weight: 15,
        comparator: (a, b) => levenshteinSimilarity(String(a || "").toLowerCase(), String(b || "").toLowerCase())
    },
    {
        path: "fonts",
        weight: 15,
        comparator: (a, b) => jaccardSimilarity(Array.isArray(a) ? a : [], Array.isArray(b) ? b : [])
    },
    {
        path: "languages",
        weight: 20,
        comparator: (a, b) => jaccardSimilarity(Array.isArray(a) ? a : [], Array.isArray(b) ? b : [])
    },
    {
        path: "plugins",
        weight: 15,
        comparator: (a, b) => jaccardSimilarity(Array.isArray(a) ? a : [], Array.isArray(b) ? b : [])
    },
    {
        path: "mimeTypes",
        weight: 15,
        comparator: (a, b) => jaccardSimilarity(Array.isArray(a) ? a : [], Array.isArray(b) ? b : [])
    }
];
export function initializeDefaultRegistry() {
    for (const plugin of BUILT_IN_PLUGINS) {
        registerPlugin(plugin.path, { weight: plugin.weight, comparator: plugin.comparator });
    }
}
