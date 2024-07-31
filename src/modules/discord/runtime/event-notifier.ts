import { EOL } from 'os';
import { Mutex } from 'async-mutex';
import { 
  bold,
  italic,
  underscore,
  Client,
  Snowflake,
  TextBasedChannel,
  MessagePayload
} from 'discord.js';
import { fileByteSizeLimit, ResponseBuilder } from '@modules/discord/commands';
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
  private readonly openRCT2ServerController: OpenRCT2ServerController;
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
    this.openRCT2ServerController = openRCT2ServerController;

    openRCT2ServerController.on('server.start', args => this.onServerStart(args));
    openRCT2ServerController.on('server.restart', args => this.onServerRestart(args));
    openRCT2ServerController.on('server.stop', args => this.onServerStop(args));
    openRCT2ServerController.on('server.close', args => this.onServerClose(args));
    openRCT2ServerController.on('server.error', args => this.onServerError(args));
    openRCT2ServerController.on('server.network.chat', args => this.onServerNetworkChat(args));
    openRCT2ServerController.on('server.network.join', args => this.onServerNetworkJoin(args));
    openRCT2ServerController.on('server.network.leave', args => this.onServerNetworkLeave(args));
    openRCT2ServerController.on('server.start.defer', args => this.onServerStartDeferred(args));
    openRCT2ServerController.on('server.start.defer.cancel', args => this.onServerStartDeferredCancel(args));
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

  private async onServerNetworkChat(args: ServerEventArgs<{ playerName: string, message: string }>) {
    console.log(args);
    const sanitizedPlayer = args.data.playerName.replace(EventNotifier.formatCodeRegex, '');
    const sanitizedMsg = args.data.message.replace(EventNotifier.formatCodeRegex, '');
    await this.postGameServerChat(args.serverId, `${bold(`${sanitizedPlayer}:`)} ${sanitizedMsg}`);
  };

  private async onServerNetworkJoin(args: ServerEventArgs<{ playerName: string }>) {
    const eventMsg = `${bold(args.data.playerName)} has joined the game`;
    await this.postGameServerChat(args.serverId, eventMsg);
  };

  private async onServerNetworkLeave(args: ServerEventArgs<{ playerName: string }>) {
    const eventMsg = `${bold(args.data.playerName)} has disconnected`;
    await this.postGameServerChat(args.serverId, eventMsg);
  };

  private async onServerStartDeferred(args: ServerEventArgs<{ scenarioFile: ScenarioFile, delayDuration: number }>) {
    const eventMsg = `${underscore(italic(`Server ${args.serverId}`))} is starting the ${
      bold(args.data.scenarioFile.nameNoExtension)
    } scenario in ${args.data.delayDuration} ${args.data.delayDuration > 1 ? 'minutes' : 'minute'}.`;
    await this.postEvent(eventMsg);
  };

  private async onServerStartDeferredCancel(args: ServerEventArgs<ScenarioFile>) {
    const eventMsg = `${underscore(italic(`Server ${args.serverId}`))} is no longer starting the ${bold(args.data.nameNoExtension)} scenario.`;
    await this.postEvent(eventMsg);
  };

  private async onServerScenarioComplete(
    args: ServerEventArgs<{ 
      scenarioName?: string,
      scenarioStatus: 'completed' | 'failed',
      screenshot?: {
        screenshotFilePath: string,
        usedPlugin: boolean;
      },
      save?: {
        saveFilePath: string,
        saveFileName: string,
        usedPlugin: boolean;
      }
    }>
  ) {
    const eventMsg = `${underscore(italic(`Server ${args.serverId}`))} has ${args.data.scenarioStatus} ${
      args.data.scenarioName ? `the ${bold(args.data.scenarioName)} scenario` : 'its current scenario'
    }.`;
    await this.postEvent(eventMsg);

    if (args.data.save && args.data.save.saveFilePath) {
      const response = new ResponseBuilder();
      response.addText(
        `${underscore(italic(`Server ${args.serverId}`))} - ${
          bold(args.data.scenarioName ?? 'Scenario')
        } ${args.data.scenarioStatus.charAt(0).toUpperCase()}${args.data.scenarioStatus.slice(1)} - Snapshot`
      );

      let totalSize = 0;
      if (args.data.screenshot) {
        const screenshotFilePayload = {
          attachment: args.data.screenshot.screenshotFilePath,
          name: `${args.data.scenarioName ?? 'autosave'}.png`,
        };
        const screenshotAttachment = await MessagePayload.resolveFile(screenshotFilePayload);
        if ((screenshotAttachment.data as Buffer).length > fileByteSizeLimit) {
          await this.logger.writeLog(
            `Screenshot attachment was too big on auto-finalize for Server ${args.serverId}. ${args.data.screenshot.screenshotFilePath}`
          );
        } else {
          response.addFiles(screenshotFilePayload);
        };
        totalSize += (screenshotAttachment.data as Buffer).length;
      };
      const saveFilePayload = {
        attachment: args.data.save.saveFilePath,
        name: `s${args.serverId}_${args.data.save.saveFileName}`,
      };
      const saveAttachment = await MessagePayload.resolveFile(saveFilePayload);
      if ((saveAttachment.data as Buffer).length > fileByteSizeLimit) {
        await this.postDebug(`Could not post the finalized save file for ${underscore(italic(`Server ${args.serverId}`))} as the file size is too big.`);
        await this.logger.writeLog(
          `Save file attachment was too big on auto-finalize for Server ${args.serverId}. ${args.data.save.saveFilePath}`
        );
        return;
      } else {
        response.addFiles(saveFilePayload);
      };
      totalSize += (saveAttachment.data as Buffer).length;

      try {
        const guildInfo = await this.botDataRepo.getGuildInfo();
        const scenarioChannel = await this.resolveTextChannel(guildInfo.scenarioChannelId);
        const targetPayload = await response.resolve(scenarioChannel).resolveFiles();
        let success = false;

        if (totalSize > fileByteSizeLimit) {
          const secondFile = targetPayload.files?.pop()!;
          const firstMessage = await this.postMessage(scenarioChannel, targetPayload);
          ;
          await wait(1, 's');
          const secondMessage = await this.postMessage(
            scenarioChannel!,
            new MessagePayload(scenarioChannel, { files: [{ attachment: secondFile.data as Buffer, name: secondFile.name }]})
          );
          if (firstMessage && secondMessage) {
            await this.postEvent(`Snapshot - ${firstMessage.url}`);
            success = true;
          };
        } else {
          const message = await this.postMessage(scenarioChannel, targetPayload);
          if (message) {
            await this.postEvent(`Snapshot - ${message.url}`);
            success = true;
          };
        };

        if (success) {
          await this.openRCT2ServerController.startGameServerFromQueue(args.serverId, true);
        } else {
          await this.postDebug(`Failed to post a snapshot message for ${underscore(italic(`Server ${args.serverId}`))}.`);
        };
      } catch (err) {
        await this.logger.writeError(err as Error);
        await this.logger.writeError(`Failed to post auto-finalize results for Server ${args.serverId}. ${args.data.save.saveFilePath}`);
        await this.postDebug(`Auto-finalization attempt failed for ${underscore(italic(`Server ${args.serverId}`))}.`);
      };
    } else if (args.data.save) {
      await this.postDebug(`A finalized save file was not generated for ${underscore(italic(`Server ${args.serverId}`))}.`);
    };
  };

  private async postEvent(message: string | MessagePayload) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    if (!isStringNullOrWhiteSpace(guildInfo.eventChannelId)) {
      try {
        const textChannel = await this.resolveTextChannel(guildInfo.eventChannelId);
        return await this.postMessage(textChannel, message);
      } catch { };
    };
  };

  private async postDebug(message: string | MessagePayload) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    if (!isStringNullOrWhiteSpace(guildInfo.debugChannelId)) {
      try {
        const textChannel = await this.resolveTextChannel(guildInfo.debugChannelId);
        return await this.postMessage(textChannel, message);
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

  private async postMessage(textChannel: TextBasedChannel, message: string | MessagePayload) {
    try {
      return this.messageMutex.runExclusive(async () => {
        await this.logger.writeLog(`Channel Id: ${textChannel.id} | Message: ${message}`);
        const msg = await textChannel.send(message);
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
