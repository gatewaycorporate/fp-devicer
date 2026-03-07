import { registerPlugin } from "./registry";
import type { Comparator } from "../types/data";
import { levenshteinSimilarity } from "./comparitors";

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