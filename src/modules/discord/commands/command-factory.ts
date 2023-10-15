import { Configuration } from '@modules/configuration';
import * as Commands from '@modules/discord/commands';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import * as OpenRCT2Repositories from '@modules/openrct2/data/repositories';
import {
  OpenRCT2BuildDownloader,
  OpenRCT2MasterServer
} from '@modules/openrct2/web';

export class CommandFactory {
  private readonly commandCache = new Map<string, Commands.BotCommand<string | null, string | null, string | null>>();

  constructor(
    config: Configuration,
    logger: Logger,
    botDataRepo: BotDataRepository,
    gameBuildRepo: OpenRCT2Repositories.OpenRCT2BuildRepository,
    pluginRepo: OpenRCT2Repositories.PluginRepository,
    scenarioRepo: OpenRCT2Repositories.ScenarioRepository,
    serverHostRepo: OpenRCT2Repositories.ServerHostRepository,
    openRCT2BuildDownloader: OpenRCT2BuildDownloader,
    openRCT2MasterServer: OpenRCT2MasterServer,
    openRCT2ServerController: OpenRCT2ServerController,
  ) {
    const commands: Commands.BotCommand<string | null, string | null, string | null>[] = [
      new Commands.ServerCommand(gameBuildRepo, pluginRepo, scenarioRepo, serverHostRepo, openRCT2ServerController),
      new Commands.MasterServerCommand(config, openRCT2MasterServer),
      new Commands.VoteCommand(logger, botDataRepo, scenarioRepo, serverHostRepo, openRCT2ServerController),
      new Commands.ScenarioCommand(scenarioRepo),
      new Commands.SnapshotCommand(logger, botDataRepo, serverHostRepo, openRCT2ServerController),
      new Commands.ChannelCommand(botDataRepo),
      new Commands.ChatCommand(logger, botDataRepo, openRCT2ServerController),
      new Commands.PlayerCommand(logger, botDataRepo, openRCT2ServerController),
      new Commands.GameBuildCommand(logger, gameBuildRepo, openRCT2BuildDownloader)
    ];
    commands.push(new Commands.HelpCommand(commands.map(command => command.data)));
    for (const command of commands) {
      if (this.commandCache.has(command.data.name)) {
        throw new Error(`A command with the name '${command.data.name}' already exists.`);
      };
      this.commandCache.set(command.data.name, command);
    };
  };

  /** Gets the current command data array. */
  get commandDataArray() {
    return [...this.commandCache.values()].map(command => {
      return command.data.toJSON();
    });
  };

  /**
   * Returns a command by name.
   * @param name The name of the command to get.
   */
  getCommand(name: string) {
    return this.commandCache.get(name);
  };
};