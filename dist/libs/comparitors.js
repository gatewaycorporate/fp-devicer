export function levenshteinSimilarity(a, b) {
    if (a === b)
        return 1;
    if (!a || !b)
        return 0;
    const maxLen = Math.max(a.length, b.length);
    let distance = Math.abs(a.length - b.length);
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) {
        if (a[i] !== b[i])
            distance++;
    }
    return Math.max(0, 1 - distance / maxLen);
}
