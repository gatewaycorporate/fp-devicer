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
export class PluginRegistrar {
  private plugins: DeviceManagerPlugin[] = [];

  /**
   * Registers a plugin with the DeviceManager.
   *
   * @param deviceManager - The DeviceManager (or compatible) instance.
   * @param plugin - The plugin to register.
   * @returns A `() => void` that unregisters the plugin and calls any teardown
   *   returned by `plugin.registerWith`.
   */
  register(deviceManager: DeviceManagerLike, plugin: DeviceManagerPlugin): () => void {
    if (typeof plugin.registerWith !== "function") {
      throw new Error("Invalid plugin: Missing 'registerWith' method.");
    }

    const teardown = plugin.registerWith(deviceManager) ?? (() => {});
    this.plugins.push(plugin);

    return () => {
      teardown();
      this.plugins = this.plugins.filter((p) => p !== plugin);
    };
  }

  /**
   * Returns the list of currently registered (not yet unregistered) plugins.
   */
  getRegisteredPlugins(): readonly DeviceManagerPlugin[] {
    return [...this.plugins];
  }
}