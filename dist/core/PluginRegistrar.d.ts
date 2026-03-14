import type { DeviceManagerLike } from "./DeviceManager.js";
/**
 * Interface that all plugins must implement to be registered with the DeviceManager.
 */
export interface DeviceManagerPlugin {
    /**
     * Registers the plugin with the provided DeviceManager instance.
     *
     * May optionally return a teardown function that is called when the plugin
     * is unregistered via the function returned by {@link PluginRegistrar.register}.
     *
     * @param deviceManager - The DeviceManager instance to register the plugin with.
     * @returns An optional teardown `() => void`, or nothing.
     */
    registerWith(deviceManager: DeviceManagerLike): (() => void) | void;
}
/**
 * Handles the registration of plugins with the DeviceManager.
 */
export declare class PluginRegistrar {
    private plugins;
    /**
     * Registers a plugin with the DeviceManager.
     *
     * @param deviceManager - The DeviceManager (or compatible) instance.
     * @param plugin - The plugin to register.
     * @returns A `() => void` that unregisters the plugin and calls any teardown
     *   returned by `plugin.registerWith`.
     */
    register(deviceManager: DeviceManagerLike, plugin: DeviceManagerPlugin): () => void;
    /**
     * Returns the list of currently registered (not yet unregistered) plugins.
     */
    getRegisteredPlugins(): readonly DeviceManagerPlugin[];
}
//# sourceMappingURL=PluginRegistrar.d.ts.map