import { FPUserDataSet, FPDataSet } from "./types/data";
import { StorageAdapter, StoredFingerprint, DeviceMatch } from "./types/storage";
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
import { createInMemoryAdapter } from "./libs/storage";
import { DeviceManager } from "./core/DeviceManager";

export {
    type FPUserDataSet,
    type FPDataSet,
    type StorageAdapter,
    type StoredFingerprint,
    type DeviceMatch,
    calculateConfidence,
    createConfidenceCalculator,
    registerComparator,
    registerWeight,
    registerPlugin,
    unregisterComparator,
    unregisterWeight,
    setDefaultWeight,
    clearRegistry,
    initializeDefaultRegistry,
    createInMemoryAdapter,
    DeviceManager
};