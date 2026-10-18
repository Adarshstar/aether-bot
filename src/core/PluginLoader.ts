/**
 * Plugin Loader – Mineflayer-inspired, with immediate injection option
 */

import type { Bot } from "./Bot";
import type { Plugin } from "../types";

export class PluginLoader {
  private plugins: Plugin[] = [];
  private loaded = false;
  private injected = new Set<Plugin>();

  constructor(private bot: Bot) {
    this.bot.once("inject_allowed", () => {
      this.loaded = true;
      this.injectAll();
    });
  }

  /**
   * @param immediate – inject now (for pure method plugins that don't need version/registry)
   */
  loadPlugin(plugin: Plugin, immediate = true): void {
    if (typeof plugin !== "function") throw new Error("Plugin must be a function");
    if (this.injected.has(plugin) || this.plugins.includes(plugin)) return;

    this.plugins.push(plugin);

    if (immediate || this.loaded) {
      this.inject(plugin);
    }
  }

  loadPlugins(plugins: Plugin[], immediate = true): void {
    for (const plugin of plugins) this.loadPlugin(plugin, immediate);
  }

  hasPlugin(plugin: Plugin): boolean {
    return this.injected.has(plugin) || this.plugins.includes(plugin);
  }

  private inject(plugin: Plugin): void {
    if (this.injected.has(plugin)) return;
    plugin(this.bot);
    this.injected.add(plugin);
  }

  private injectAll(): void {
    for (const plugin of this.plugins) this.inject(plugin);
  }
}
