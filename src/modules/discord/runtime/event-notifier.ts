import { Mutex } from 'async-mutex';
import { 
  bold,
  italic,
  underscore,
  Client,
  MessagePayload,
  Snowflake
} from 'discord.js';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { OpenRCT2ServerController } from '@modules/openrct2/controllers';
import { ServerEventArgs } from '@modules/openrct2/runtime';
import { ScenarioFile } from '@modules/openrct2/data/models';

export class EventNotifier {
  private static readonly messageIntervalMs = 250;

  private readonly discordClient: Client<true>;
  private readonly messageMutex = new Mutex();
  private readonly botDataRepo: BotDataRepository;
  private readonly openRCT2ServerController: OpenRCT2ServerController;

  constructor(
    discordClient: Client<true>,
    botDataRepo: BotDataRepository,
    openRCT2ServerController: OpenRCT2ServerController
  ) {
    this.discordClient = discordClient;
    this.botDataRepo = botDataRepo;
    this.openRCT2ServerController = openRCT2ServerController;
    this.openRCT2ServerController.on('server.start', args => this.onServerStart(args));
    this.openRCT2ServerController.on('server.restart', args => this.onServerRestart(args));
    this.openRCT2ServerController.on('server.stop', args => this.onServerStop(args));
    this.openRCT2ServerController.on('server.close', args => this.onServerClose(args));
  };

  private async onServerStart(args: ServerEventArgs<ScenarioFile>) {
    const serverMsg = `${
      underscore(italic(`Server ${args.serverId}`))
    } is hosting the ${bold(args.data.nameNoExtension)} scenario.`;
    await this.postEvent(serverMsg);
  };

  private async onServerRestart(args: ServerEventArgs<{ autosaveIndex: number }>) {
    const serverMsg = 0 === args.data.autosaveIndex
      ? `${underscore(italic(`Server ${args.serverId}`))} was restarted on the latest autosave.`
      : `${underscore(italic(`Server ${args.serverId}`))} was restarted on autosave ${args.data.autosaveIndex + 1}.`
    await this.postEvent(serverMsg);
  };

  private async onServerStop(args: ServerEventArgs<{ success: boolean }>) {
    if (args.data.success) {
      const serverMsg = `${underscore(italic(`Server ${args.serverId}`))} has been stopped.`;
      await this.postEvent(serverMsg);
    };
  };

  private async onServerClose(args: ServerEventArgs<{ code: number | null, signal: NodeJS.Signals | null }>) {
    // logging
  };

  // private async onServerChat(args: ServerEventArgs<string>) {
  //   try {
  //     const guildInfo = await this.botDataRepo.getGuildInfo();
  //     const serverChannel = guildInfo.gameServerChannelIds.find(channel => {
  //       return channel.serverId === args.serverId;
  //     });
  //     if (serverChannel) {
  //       await this.discordMessenger.sendMessageToTextChannel(serverChannel.channelId, args.data);
  //     };
  //   } catch (err) {
  //     // logging
  //   };
  // };

  private async postEvent(messagePayload: MessagePayload | string) {
    try {
      const guildInfo = await this.botDataRepo.getGuildInfo();
      const channel = await this.resolveTextChannel(guildInfo.eventChannelId);
      return this.messageMutex.runExclusive(async () => {
        const msg = await channel.send(messagePayload);
        await new Promise(resolve => {
          setTimeout(resolve, EventNotifier.messageIntervalMs);
        });
        return msg;
      });
    } catch (err) {
      // logging
    };
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
