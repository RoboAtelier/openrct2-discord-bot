import {
  PluginRepository,
  ServerRepository
} from '@modules/openrct2/data/repositories';

export class PluginService {
  private readonly pluginRepo: PluginRepository;
  private readonly serverHostRepo: ServerRepository;

  constructor(
    pluginRepo: PluginRepository,
    serverHostRepo: ServerRepository
  ) {
    this.pluginRepo = pluginRepo;
    this.serverHostRepo = serverHostRepo;
  };

  async syncServerPluginSettings(serverId: number) {
    const serverDir = await this.serverHostRepo.getServerDirectoryById(serverId);
    const pluginOptions = await serverDir.getPluginOptions();
    const availablePlugins = await this.pluginRepo.getPluginFiles();

    const pluginsToSet = availablePlugins.filter(plugin => (pluginOptions.plugins as string[]).includes(plugin.name));
    if (pluginsToSet.length) {
      await serverDir.addPluginFiles(...pluginsToSet);
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
      if (plugin.name === OpenRCT2Module.PluginFileName.ServerAdapter) {
        await plugin.setGlobalVariables(
          ['serverId', serverId],
          ['port', pluginOptions.adapterPluginPort]
        );
      };
    };
  };
};