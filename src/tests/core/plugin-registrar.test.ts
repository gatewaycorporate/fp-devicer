import { describe, it, expect, vi } from 'vitest';
import { PluginRegistrar } from '../../core/PluginRegistrar';
import type { DeviceManagerPlugin } from '../../core/PluginRegistrar';
import type { DeviceManagerLike } from '../../core/DeviceManager';

function makeDeviceManager(): DeviceManagerLike {
  return {
    registerIdentifyPostProcessor: vi.fn(() => () => {}),
  };
}

function makePlugin(teardown?: () => void): DeviceManagerPlugin {
  return {
    registerWith: vi.fn((_dm: DeviceManagerLike) => teardown),
  };
}

describe('PluginRegistrar', () => {
  describe('register', () => {
    it('calls plugin.registerWith with the deviceManager', () => {
      const registrar = new PluginRegistrar();
      const dm = makeDeviceManager();
      const plugin = makePlugin();

      registrar.register(dm, plugin);

      expect(plugin.registerWith).toHaveBeenCalledOnce();
      expect(plugin.registerWith).toHaveBeenCalledWith(dm);
    });

    it('throws if plugin.registerWith is not a function', () => {
      const registrar = new PluginRegistrar();
      const dm = makeDeviceManager();
      const bad = { registerWith: 'not-a-function' } as unknown as DeviceManagerPlugin;

      expect(() => registrar.register(dm, bad)).toThrow(
        "Invalid plugin: Missing 'registerWith' method."
      );
    });

    it('returns a function', () => {
      const registrar = new PluginRegistrar();
      const unregister = registrar.register(makeDeviceManager(), makePlugin());
      expect(typeof unregister).toBe('function');
    });

    it('adds the plugin to getRegisteredPlugins after registration', () => {
      const registrar = new PluginRegistrar();
      const plugin = makePlugin();

      registrar.register(makeDeviceManager(), plugin);

      expect(registrar.getRegisteredPlugins()).toContain(plugin);
    });

    it('can register multiple distinct plugins', () => {
      const registrar = new PluginRegistrar();
      const p1 = makePlugin();
      const p2 = makePlugin();

      registrar.register(makeDeviceManager(), p1);
      registrar.register(makeDeviceManager(), p2);

      expect(registrar.getRegisteredPlugins()).toHaveLength(2);
    });
  });

  describe('unregister (returned teardown fn)', () => {
    it('removes the plugin from getRegisteredPlugins', () => {
      const registrar = new PluginRegistrar();
      const plugin = makePlugin();

      const unregister = registrar.register(makeDeviceManager(), plugin);
      expect(registrar.getRegisteredPlugins()).toHaveLength(1);

      unregister();
      expect(registrar.getRegisteredPlugins()).toHaveLength(0);
    });

    it("calls the plugin's returned teardown function", () => {
      const registrar = new PluginRegistrar();
      const teardown = vi.fn();
      const plugin = makePlugin(teardown);

      const unregister = registrar.register(makeDeviceManager(), plugin);
      unregister();

      expect(teardown).toHaveBeenCalledOnce();
    });

    it('only removes the unregistered plugin, not others', () => {
      const registrar = new PluginRegistrar();
      const p1 = makePlugin();
      const p2 = makePlugin();

      const unregister1 = registrar.register(makeDeviceManager(), p1);
      registrar.register(makeDeviceManager(), p2);

      unregister1();

      expect(registrar.getRegisteredPlugins()).not.toContain(p1);
      expect(registrar.getRegisteredPlugins()).toContain(p2);
    });

    it('does not throw if plugin returned no teardown', () => {
      const registrar = new PluginRegistrar();
      const plugin = makePlugin(undefined); // registerWith returns void

      const unregister = registrar.register(makeDeviceManager(), plugin);
      expect(() => unregister()).not.toThrow();
    });
  });

  describe('getRegisteredPlugins', () => {
    it('returns an empty list initially', () => {
      const registrar = new PluginRegistrar();
      expect(registrar.getRegisteredPlugins()).toHaveLength(0);
    });

    it('returns a readonly snapshot (mutation does not affect internal list)', () => {
      const registrar = new PluginRegistrar();
      registrar.register(makeDeviceManager(), makePlugin());

      const list = registrar.getRegisteredPlugins() as DeviceManagerPlugin[];
      list.splice(0, 1); // attempt mutation

      expect(registrar.getRegisteredPlugins()).toHaveLength(1);
    });
  });
});
