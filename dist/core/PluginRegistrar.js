/**
 * Handles the registration of plugins with the DeviceManager.
 */
export class PluginRegistrar {
    plugins = [];
    /**
     * Registers a plugin with the DeviceManager.
     *
     * @param deviceManager - The DeviceManager (or compatible) instance.
     * @param plugin - The plugin to register.
     * @returns A `() => void` that unregisters the plugin and calls any teardown
     *   returned by `plugin.registerWith`.
     */
    register(deviceManager, plugin) {
        if (typeof plugin.registerWith !== "function") {
            throw new Error("Invalid plugin: Missing 'registerWith' method.");
        }
        const teardown = plugin.registerWith(deviceManager) ?? (() => { });
        this.plugins.push(plugin);
        return () => {
            teardown();
            this.plugins = this.plugins.filter((p) => p !== plugin);
        };
    }
    /**
     * Returns the list of currently registered (not yet unregistered) plugins.
     */
    getRegisteredPlugins() {
        return [...this.plugins];
    }
}
