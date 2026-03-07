import { registerPlugin } from "./registry.js";
import type { Comparator } from "../types/data.js";
import { levenshteinSimilarity } from "./comparitors.js";

const BUILT_IN_PLUGINS = [
    {
        path: "userAgent",
        weight: 20,
        comparator: (a: any, b: any) => levenshteinSimilarity(String(a || "").toLowerCase(), String(b || "").toLowerCase())
    },
    {
        path: "platform",
        weight: 15,
        comparator: (a: any, b: any) => levenshteinSimilarity(String(a || "").toLowerCase(), String(b || "").toLowerCase())
    }
]

export function initializeDefaultRegistry() {
    for (const plugin of BUILT_IN_PLUGINS) {
        registerPlugin(plugin.path, { weight: plugin.weight, comparator: plugin.comparator as Comparator });
    }
}