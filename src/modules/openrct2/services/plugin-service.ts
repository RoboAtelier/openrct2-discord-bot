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

  resetServerSync(serverId: number) {
    this.synced.delete(serverId);
  };

  async syncServerPluginVariables(serverId: number) {
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
        switch (plugin.name) {
          case OpenRCT2.PluginFileName.Messaging:
            await plugin.setGlobalVariables(
              ['serverId', serverId],
              ['port', pluginOptions.messagingPluginPort]
            );
            break;
          case OpenRCT2.PluginFileName.Welcome:
            const welcomeKeyValues =
              (Object.getOwnPropertyNames(pluginOptions.welcomeMessage) as [keyof typeof pluginOptions.welcomeMessage])
              .map(property => [property, pluginOptions.welcomeMessage[property]] as [string, any]);
            await plugin.setGlobalVariables(...welcomeKeyValues);
            break;
        };
      };
      this.synced.add(serverId);
    };
  };
};