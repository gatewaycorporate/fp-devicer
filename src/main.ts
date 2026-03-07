import { FPUserDataSet, FPDataSet } from "./types/data";
import { calculateConfidence, createConfidenceCalculator } from "./libs/confidence";
import {
    registerComparator,
    registerWeight,
    registerPlugin,
    unregisterComparator,
    unregisterWeight,
    setDefaultWeight,
    clearRegistry,
    initializeDefaultRegistry
} from "./libs/registry";

export {
    type FPUserDataSet,
    type FPDataSet,
    calculateConfidence,
    createConfidenceCalculator,
    registerComparator,
    registerWeight,
    registerPlugin,
    unregisterComparator,
    unregisterWeight,
    setDefaultWeight,
    clearRegistry,
    initializeDefaultRegistry
};