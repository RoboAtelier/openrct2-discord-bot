import { OpenRCT2 } from '@modules/openrct2/index.js';
import {
  PluginRepository,
  ServerRepository
} from '@modules/openrct2/data/repositories/index.js';

export class PluginService {
  private readonly synced = new Set<number>();

  constructor(
    private readonly pluginRepo: PluginRepository,
    private readonly serverHostRepo: ServerRepository
  ) { };

  async syncServerPluginSettings(serverId: number) {
    const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();
    const availablePlugins = await this.pluginRepo.getPluginFiles();
    const serverSynced = this.synced.has(serverId);

    if (!serverSynced) {
      const pluginsToSet = availablePlugins.filter(plugin => (pluginOptions.plugins as string[]).includes(plugin.name));
      if (pluginsToSet.length) {
        await serverDir.addPluginFiles(true, ...pluginsToSet);
      };
  
      let currentPlugins = await serverDir.getPluginFiles();
      const pluginsToRemove = currentPlugins
        .filter(plugin => !pluginsToSet.find(toSet => toSet.name === plugin.name))
        .map(plugin => plugin.name);
      if (pluginsToRemove.length) {
        await serverDir.removePluginFiles(...pluginsToRemove);
        currentPlugins = currentPlugins.filter(plugin => !pluginsToRemove.includes(plugin.name));
      };
  
      for (const plugin of currentPlugins) {
        if (plugin.name === OpenRCT2.PluginFileName.Messaging) {
          await plugin.setGlobalVariables(
            ['serverId', serverId],
            ['port', pluginOptions.messagingPluginPort]
          );
        };
      };
      this.synced.add(serverId);
    };
  };
};