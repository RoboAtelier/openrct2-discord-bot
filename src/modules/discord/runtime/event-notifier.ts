import { EOL } from 'os';
import { Mutex } from 'async-mutex';
import { 
  bold,
  italic,
  underscore,
  Client,
  Snowflake,
  TextBasedChannel
} from 'discord.js';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { Logger } from '@modules/logging';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import { ServerEventArgs } from '@modules/openrct2/runtime';
import { ScenarioFile } from '@modules/openrct2/data/models';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';
import { wait } from '@modules/utils/runtime-utils';

export class EventNotifier {
  private static readonly formatCodeRegex = /{[A-Z0-9_]+}/g;
  private static readonly messageIntervalMs = 250;
  private static readonly deferredMessageIntervalMs = 5000;

  private readonly discordClient: Client<true>;
  private readonly logger: Logger;
  private readonly botDataRepo: BotDataRepository;
  private readonly deferTimeouts = new Map<Snowflake, NodeJS.Timeout>();
  private readonly deferredMessages = new Map<Snowflake, string>();
  private readonly messageMutex = new Mutex();
  private readonly deferredMessageMutex = new Mutex();

  constructor(
    discordClient: Client<true>,
    logger: Logger,
    botDataRepo: BotDataRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    this.discordClient = discordClient;
    this.logger = logger;
    this.botDataRepo = botDataRepo;

    openRCT2ServerController.on('server.start', args => this.onServerStart(args));
    openRCT2ServerController.on('server.restart', args => this.onServerRestart(args));
    openRCT2ServerController.on('server.stop', args => this.onServerStop(args));
    openRCT2ServerController.on('server.close', args => this.onServerClose(args));
    openRCT2ServerController.on('server.error', args => this.onServerError(args));
    openRCT2ServerController.on('server.network.chat', args => this.onServerNetworkChat(args));
    openRCT2ServerController.on('server.network.join', args => this.onServerNetworkJoin(args));
    openRCT2ServerController.on('server.network.leave', args => this.onServerNetworkLeave(args));
    openRCT2ServerController.on('server.defer.start', args => this.onServerDeferStart(args));
    openRCT2ServerController.on('server.defer.stop', args => this.onServerDeferStop(args));
    openRCT2ServerController.on('server.scenario.complete', args => this.onServerScenarioComplete(args));
  };

  private async onServerStart(args: ServerEventArgs<ScenarioFile>) {
    const eventMsg = `${
      underscore(italic(`Server ${args.serverId}`))
    } is hosting the ${bold(args.data.nameNoExtension)} scenario.`;
    await this.postEvent(eventMsg);
  };

  private async onServerRestart(args: ServerEventArgs<{ autosaveIndex: number }>) {
    const eventMsg = 0 === args.data.autosaveIndex
      ? `${underscore(italic(`Server ${args.serverId}`))} was restarted on the latest autosave.`
      : `${underscore(italic(`Server ${args.serverId}`))} was restarted on autosave ${args.data.autosaveIndex + 1}.`;
    await this.postEvent(eventMsg);
  };

  private async onServerStop(args: ServerEventArgs<{ success: boolean }>) {
    if (args.data.success) {
      const eventMsg = `${underscore(italic(`Server ${args.serverId}`))} has been stopped.`;
      await this.postEvent(eventMsg);
    };
    const log = `Server ${args.serverId} was manually stopped.`;
    await this.logger.writeLog(log);
  };

  private async onServerClose(args: ServerEventArgs<{ code: number | null, signal: NodeJS.Signals | null }>) {
    const log = `Server ${args.serverId} was terminated. Exit code: ${args.data.code} | Termination signal: ${args.data.signal}`;
    await this.logger.writeLog(log);
  };

  private async onServerError(args: ServerEventArgs<Error>) {
    await this.logger.writeError(args.data);
  };

  private async onServerNetworkChat(args: ServerEventArgs<string>) {
    const sanitizedChat = args.data.replace(EventNotifier.formatCodeRegex, '');
    await this.postGameServerChat(args.serverId, sanitizedChat);
  };

  private async onServerNetworkJoin(args: ServerEventArgs<string>) {
    await this.postGameServerChat(args.serverId, args.data);
  };

  private async onServerNetworkLeave(args: ServerEventArgs<string>) {
    await this.postGameServerChat(args.serverId, args.data);
  };

  private async onServerDeferStart(args: ServerEventArgs<{ scenarioFile: ScenarioFile, delayDuration: number }>) {
    const eventMsg = `${underscore(italic(`Server ${args.serverId}`))} is starting the ${
      bold(args.data.scenarioFile.nameNoExtension)
    } scenario in ${args.data.delayDuration} ${args.data.delayDuration > 1 ? 'minutes' : 'minute'}.`;
    await this.postEvent(eventMsg);
  };

  private async onServerDeferStop(args: ServerEventArgs<ScenarioFile>) {
    const eventMsg = `${underscore(italic(`Server ${args.serverId}`))} is no longer starting the ${bold(args.data.nameNoExtension)} scenario.`;
    await this.postEvent(eventMsg);
  };

  private async onServerScenarioComplete(
    args: ServerEventArgs<{ 
      scenarioFile: ScenarioFile | undefined,
      scenarioStatus: 'completed' | 'failed'
    }>
  ) {
    const eventMsg = `${underscore(italic(`Server ${args.serverId}`))} has ${args.data.scenarioStatus} ${
      args.data.scenarioFile ? `the ${bold(args.data.scenarioFile.nameNoExtension)} scenario` : 'its current scenario'
    }.`;
    await this.postEvent(eventMsg);
  };

  private async postEvent(messageString: string) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    if (!isStringNullOrWhiteSpace(guildInfo.eventChannelId)) {
      try {
        const textChannel = await this.resolveTextChannel(guildInfo.eventChannelId);
        await this.postMessage(textChannel, messageString);
      } catch { };
    };
  };

  private async postGameServerChat(serverId: number, messageString: string) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    const gameServerChannel = guildInfo.gameServerChannels.find(channel => channel.serverId === serverId);
    if (gameServerChannel && !isStringNullOrWhiteSpace(gameServerChannel.channelId)) {
      try {
        const textChannel = await this.resolveTextChannel(gameServerChannel.channelId);
        await this.postDeferredMessage(textChannel, messageString);
      } catch { };
    };
  };

  private async postMessage(textChannel: TextBasedChannel, messageString: string) {
    try {
      return this.messageMutex.runExclusive(async () => {
        await this.logger.writeLog(`Channel Id: ${textChannel.id} | Message: ${messageString}`);
        const msg = await textChannel.send(messageString);
        await wait(EventNotifier.messageIntervalMs);
        return msg;
      });
    } catch (err) {
      await this.logger.writeError(err as Error);
    };
  };

  private async postDeferredMessage(textChannel: TextBasedChannel, messageString: string) {
    await this.deferredMessageMutex.runExclusive(() => {
      const currentTimeout = this.deferTimeouts.get(textChannel.id);
      if (currentTimeout) {
        const deferredMessage = this.deferredMessages.get(textChannel.id)!;
        this.deferredMessages.set(textChannel.id, `${deferredMessage}${EOL}${messageString}`);
      } else {
        const timeout = setTimeout(() => {
          this.deferredMessageMutex.runExclusive(async () => {
            try {
              const deferredMessage = this.deferredMessages.get(textChannel.id)!;
              await this.logger.writeLog(`Channel Id: ${textChannel.id} | Deferred Message: ${deferredMessage}`);
              await textChannel.send(deferredMessage);
            } catch (err) {
              await this.logger.writeError(err as Error);
            };
            this.deferTimeouts.delete(textChannel.id);
            this.deferredMessages.delete(textChannel.id);
          });
        }, EventNotifier.deferredMessageIntervalMs);
        this.deferTimeouts.set(textChannel.id, timeout);
        this.deferredMessages.set(textChannel.id, messageString);
      };
    });
  };

  private async resolveTextChannel(channelId: Snowflake) {
    const channel = await this.discordClient.channels.fetch(channelId);
    if (channel) {
      if (channel.isTextBased()) {
        return channel;
      };
      throw new Error('Specified channel is not a text channel.');
    };
    throw new Error('Channel id could not be resolved to a valid channel.');
  };
};
