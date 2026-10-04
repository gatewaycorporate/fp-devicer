export function vectorSimilarity(left, right, dimension) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length
        || dimension !== undefined && left.length !== dimension)
        return Number.NaN;
    let leftScale = 0;
    let rightScale = 0;
    for (let index = 0; index < left.length; index += 1) {
        if (typeof left[index] !== 'number' || !Number.isFinite(left[index])
            || typeof right[index] !== 'number' || !Number.isFinite(right[index]))
            return Number.NaN;
        leftScale = Math.max(leftScale, Math.abs(left[index]));
        rightScale = Math.max(rightScale, Math.abs(right[index]));
    }
    if (leftScale === 0 || rightScale === 0)
        return Number.NaN;
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index] / leftScale;
        const rightValue = right[index] / rightScale;
        dot += leftValue * rightValue;
        leftMagnitude += leftValue ** 2;
        rightMagnitude += rightValue ** 2;
    }
    return Math.max(0, Math.min(1, (dot / Math.sqrt(leftMagnitude * rightMagnitude) + 1) / 2));
}
