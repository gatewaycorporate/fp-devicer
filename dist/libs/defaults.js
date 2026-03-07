"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDefaultRegistry = initializeDefaultRegistry;
const registry_1 = require("./registry");
const comparitors_1 = require("./comparitors");
const BUILT_IN_PLUGINS = [
    {
        path: "userAgent",
        weight: 20,
        comparator: (a, b) => (0, comparitors_1.levenshteinSimilarity)(String(a || "").toLowerCase(), String(b || "").toLowerCase())
    },
    {
        path: "platform",
        weight: 15,
        comparator: (a, b) => (0, comparitors_1.levenshteinSimilarity)(String(a || "").toLowerCase(), String(b || "").toLowerCase())
    }
];
function initializeDefaultRegistry() {
    for (const plugin of BUILT_IN_PLUGINS) {
        (0, registry_1.registerPlugin)(plugin.path, { weight: plugin.weight, comparator: plugin.comparator });
    }
}
