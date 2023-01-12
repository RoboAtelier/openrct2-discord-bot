import { EOL } from 'os';
import {
  channelMention,
  italic,
  underscore,
  ChatInputCommandInteraction
} from 'discord.js';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { GuildInfo } from '@modules/discord/data/models/bot';
import { BotDataRepository } from '@modules/discord/data/repositories';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils';

type ChannelCommandOptions =
  | 'channel' // assign, unassign groups
  | 'server-id' // assign, unassign game-server
type ChannelCommandSubcommands =
  | 'check'
  | 'reset'
  | 'debug' | 'event' | 'scenario' | 'voting' | 'bot' | 'game-server' // assign, unassign
type ChannelCommandSubcommandGroups =
  | 'assign'
  | 'unassign'

const ChannelIdPropertyArray = [
  'debugChannelId',
  'eventChannelId',
  'scenarioChannelId',
  'votingChannelId'
] as const;
const MultiChannelIdPropertyArray = [
  'botChannelIds',
  'gameServerChannels'
] as const;

/** Represents a command for managing guild channels to be used by the bot. */
export class ChannelCommand extends BotCommand<
  ChannelCommandOptions,
  ChannelCommandSubcommands,
  ChannelCommandSubcommandGroups
> {
  private readonly botDataRepo: BotDataRepository;

  constructor(botDataRepo: BotDataRepository) {
    super(CommandPermissionLevel.Moderator);
    this.data
      .setName('channel')
      .setDescription('Manages Discord guild channels for bot use.')
      .addSubcommand(subcommand => 
        subcommand
          .setName(this.reflectSubcommandName('check'))
          .setDescription('Checks the current channel settings for this bot.')
      )
      .addSubcommandGroup(group =>
        group
          .setName(this.reflectSubcommandGroupName('assign'))
          .setDescription('Sets a channel type for a Discord guild channel.')
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('debug'))
              .setDescription('Assigns a channel to be the debug channel.')
              .addChannelOption(option => 
                option
                  .setName(this.reflectOptionName('channel'))
                  .setDescription('The channel to assign as the debug channel.')
                  .setRequired(true)
              )
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('event'))
              .setDescription('Assigns a channel to be the bot events channel.')
              .addChannelOption(option => 
                option
                  .setName(this.reflectOptionName('channel'))
                  .setDescription('The channel to assign as the bot events channel.')
                  .setRequired(true)
              )
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('scenario'))
              .setDescription('Assigns a channel to be the scenarios channel.')
              .addChannelOption(option => 
                option
                  .setName(this.reflectOptionName('channel'))
                  .setDescription('The channel to assign as the scenarios channel.')
                  .setRequired(true)
              )
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('voting'))
              .setDescription('Assigns a channel to be the vote channel.')
              .addChannelOption(option => 
                option
                  .setName(this.reflectOptionName('channel'))
                  .setDescription('The channel to assign as the vote channel.')
                  .setRequired(true)
              )
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('bot'))
              .setDescription('Assigns a channel to be a bot command channel.')
              .addChannelOption(option => 
                option
                  .setName(this.reflectOptionName('channel'))
                  .setDescription('The channel to assign as a bot command channel.')
                  .setRequired(true)
              )
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('game-server'))
              .setDescription('Assigns a channel to be an OpenRCT2 game server relay channel.')
              .addChannelOption(option => 
                option
                  .setName(this.reflectOptionName('channel'))
                  .setDescription('The channel to assign as a server relay channel.')
                  .setRequired(true)
              )
              .addIntegerOption(option => 
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id of the server that the relay channel is for.')
                  .setMinValue(1)
              )
          )
      )
      .addSubcommandGroup(group =>
        group
          .setName(this.reflectSubcommandGroupName('unassign'))
          .setDescription('Unsets a channel type for a Discord guild channel.')
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('debug'))
              .setDescription('Unassigns the current debug channel.')
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('event'))
              .setDescription('Unassigns the current bot events channel.')
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('scenario'))
              .setDescription('Unassigns the current scenarios channel.')
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('voting'))
              .setDescription('Unassigns the current vote channel.')
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('bot'))
              .setDescription('Unassigns a current bot command channel.')
              .addChannelOption(option => 
                option
                  .setName(this.reflectOptionName('channel'))
                  .setDescription('The channel to unassign.')
                  .setRequired(true)
              )
          )
          .addSubcommand(subcommand => 
            subcommand
              .setName(this.reflectSubcommandName('game-server'))
              .setDescription('Unassigns an OpenRCT2 game server relay channel.')
              .addIntegerOption(option => 
                option
                  .setName(this.reflectOptionName('server-id'))
                  .setDescription('The id of the server to unassign its relay channel.')
                  .setRequired(true)
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('reset'))
          .setDescription('Resets the guild channel types.')
      );

    this.botDataRepo = botDataRepo;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction, userLevel: CommandPermissionLevel) {
    let commandResponse = new CommandResponseBuilder();

    if (this.isInteractionUsingSubcommand(interaction, 'check')) {
      commandResponse = await this.showChannelInfo();
    } else if (this.isInteractionUnderSubcommandGroup(interaction, 'assign')) {
      const debugChannelId = this.isInteractionUsingSubcommand(interaction, 'debug')
        ? this.getInteractionOption(interaction, 'channel').value as string
        : null;
      const eventChannelId = this.isInteractionUsingSubcommand(interaction, 'event')
        ? this.getInteractionOption(interaction, 'channel').value as string
        : null;
      const scenarioChannelId = this.isInteractionUsingSubcommand(interaction, 'scenario')
        ? this.getInteractionOption(interaction, 'channel').value as string
        : null;
      const votingChannelId = this.isInteractionUsingSubcommand(interaction, 'voting')
        ? this.getInteractionOption(interaction, 'channel').value as string
        : null;
      const botChannelId = this.isInteractionUsingSubcommand(interaction, 'bot')
        ? this.getInteractionOption(interaction, 'channel').value as string
        : null;
      let gameServerChannel: { serverId: number , channelId: string } | null = null;
      if (this.isInteractionUsingSubcommand(interaction, 'game-server')) {
        const serverId = this.doesInteractionHaveOption(interaction, 'server-id')
          ? this.getInteractionOption(interaction, 'server-id').value as number
          : 1;
        gameServerChannel = { 
          serverId: serverId,
          channelId: this.getInteractionOption(interaction, 'channel').value as string
        };
      };
      commandResponse = await this.setChannelTypes(
        debugChannelId,
        eventChannelId,
        scenarioChannelId,
        votingChannelId,
        botChannelId,
        gameServerChannel
      );
    } else if (this.isInteractionUnderSubcommandGroup(interaction, 'unassign')) {
      const unsetDebug = this.isInteractionUsingSubcommand(interaction, 'debug');
      const unsetEvent = this.isInteractionUsingSubcommand(interaction, 'event');
      const unsetScenario = this.isInteractionUsingSubcommand(interaction, 'scenario');
      const unsetVoting = this.isInteractionUsingSubcommand(interaction, 'voting');
      const botChannelId = this.isInteractionUsingSubcommand(interaction, 'bot')
        ? this.getInteractionOption(interaction, 'channel').value as string
        : null;
      const serverId = this.isInteractionUsingSubcommand(interaction, 'game-server')
        ? this.getInteractionOption(interaction, 'server-id').value as number
        : null;
        commandResponse = await this.unsetChannelTypes(
          unsetDebug,
          unsetEvent,
          unsetScenario,
          unsetVoting,
          botChannelId,
          serverId
        );
    } else if (this.isInteractionUsingSubcommand(interaction, 'reset')) {
      commandResponse = await this.resetChannelTypes();
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };
    
    await interaction.reply(commandResponse.resolve());
  };

  private async setChannelTypes(
    debugChannelId: string | null,
    eventChannelId: string | null,
    scenarioChannelId: string | null,
    votingChannelId: string | null,
    botChannelId: string | null,
    gameServerChannel: { serverId: number, channelId: string } | null
  ) {
    const commandResponse = new CommandResponseBuilder();
    const guildInfo = await this.botDataRepo.getGuildInfo();

    if (debugChannelId !== null) {
      guildInfo.debugChannelId = debugChannelId;
      commandResponse.appendToMessage(`Set ${channelMention(debugChannelId)} as the ${italic('Debug Channel')}.`);
    };

    if (eventChannelId !== null) {
      guildInfo.eventChannelId = eventChannelId;
      commandResponse.appendToMessage(`Set ${channelMention(eventChannelId)} as the ${italic('Event Channel')}.`);
    };

    if (scenarioChannelId !== null) {
      guildInfo.scenarioChannelId = scenarioChannelId;
      commandResponse.appendToMessage(`Set ${channelMention(scenarioChannelId)} as the ${italic('Scenario Channel')}.`);
    };

    if (votingChannelId !== null) {
      guildInfo.votingChannelId = votingChannelId;
      commandResponse.appendToMessage(`Set ${channelMention(votingChannelId)} as the ${italic('Vote Channel')}.`);
    };

    if (botChannelId !== null) {
      if (guildInfo.botChannelIds.includes(botChannelId)) {
        commandResponse.appendToError(`${channelMention(botChannelId)} is already set as a ${italic('Bot Channel')}.`);
      } else {
        guildInfo.botChannelIds.push(botChannelId);
        commandResponse.appendToMessage(`Set ${channelMention(botChannelId)} as a ${italic('Bot Channel')}.`);
      };
    };

    if (gameServerChannel !== null) {
      if (guildInfo.gameServerChannels.some(channel => channel.channelId === gameServerChannel.channelId)) {
        commandResponse.appendToError(`${
          channelMention(gameServerChannel.channelId)
        } is already set assigned as a ${italic('Game Server Channel')}.`);
      } else {
        const index = guildInfo.gameServerChannels.findIndex(channel => channel.serverId === gameServerChannel.serverId);
        if (index < 0) {
          guildInfo.gameServerChannels.push(gameServerChannel);
        } else {
          guildInfo.gameServerChannels[index].channelId = gameServerChannel.channelId;
        };
        commandResponse.appendToMessage(`Set ${
          channelMention(gameServerChannel.channelId)
        } as a ${italic('Game Server Channel')} for ${underscore(italic(`Server ${gameServerChannel.serverId}`))}.`);
      };
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await this.botDataRepo.updateGuildInfo(guildInfo);
    };

    return commandResponse;
  };

  private async unsetChannelTypes(
    unsetDebug: boolean,
    unsetEvent: boolean,
    unsetScenario: boolean,
    unsetVoting: boolean,
    botChannelId: string | null,
    serverId: number | null
  ) {
    const commandResponse = new CommandResponseBuilder();
    const guildInfo = await this.botDataRepo.getGuildInfo();
    
    if (unsetDebug) {
      guildInfo.debugChannelId = '';
      commandResponse.appendToMessage(`Unset the ${italic('Debug Channel')}.`);
    };

    if (unsetEvent) {
      guildInfo.eventChannelId = '';
      commandResponse.appendToMessage(`Unset the ${italic('Event Channel')}.`);
    };

    if (unsetScenario) {
      guildInfo.scenarioChannelId = '';
      commandResponse.appendToMessage(`Unset the ${italic('Scenario Channel')}.`);
    };

    if (unsetVoting) {
      guildInfo.votingChannelId = '';
      commandResponse.appendToMessage(`Unset the ${italic('Vote Channel')}.`);
    };

    if (botChannelId !== null) {
      if (guildInfo.botChannelIds.includes(botChannelId)) {
        guildInfo.botChannelIds.splice(guildInfo.botChannelIds.indexOf(botChannelId), 1);
        commandResponse.appendToError(`Unset ${channelMention(botChannelId)} from being a ${italic('Bot Channel')}.`);
      } else {
        commandResponse.appendToError(`${channelMention(botChannelId)} is not set as a ${italic('Bot Channel')}.`);
      };
    };

    if (serverId !== null) {
      const index = guildInfo.gameServerChannels.findIndex(channel => channel.serverId === serverId);
      if (index < 0) {
        commandResponse.appendToError(`${
          underscore(italic(`Server ${serverId}`))
        } does not have a ${italic('Game Server Channel')} set.`);
      } else {
        guildInfo.gameServerChannels[index].channelId = '';
        commandResponse.appendToError(`Unset the current ${
          underscore(italic(`Server ${serverId}`))
        } ${italic('Game Server Channel')}.`);
      };
    };

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await this.botDataRepo.updateGuildInfo(guildInfo);
    };

    return commandResponse;
  };

  private async resetChannelTypes() {
    const commandResponse = new CommandResponseBuilder();
    const guildInfo = await this.botDataRepo.getGuildInfo();
    
    for (const prop of ChannelIdPropertyArray) {
      guildInfo[prop] = '';
    };
    for (const prop of MultiChannelIdPropertyArray) {
      guildInfo[prop] = [];
    };

    commandResponse.appendToMessage('The channel type values have been reset.');
    await this.botDataRepo.updateGuildInfo(guildInfo);
    return commandResponse;
  };

  private async showChannelInfo() {
    const commandResponse = new CommandResponseBuilder();

    const guildInfo = await this.botDataRepo.getGuildInfo();
    commandResponse.appendToMessage(this.formatChannelInfoMessage(guildInfo));

    return commandResponse;
  };

  /**
   * Constructs a message of guild channels in use by the bot.
   * @param guildInfo The current guild data to derive the channel information from.
   */
  private formatChannelInfoMessage(guildInfo: GuildInfo) {
    const channelMsgSegments = [`Current channels:${EOL}`];

    channelMsgSegments.push(`Debug Channel: ${isStringNullOrWhiteSpace(guildInfo.debugChannelId)
      ? italic('Not set')
      : channelMention(guildInfo.debugChannelId)
    }`);
    channelMsgSegments.push(`Event Channel: ${isStringNullOrWhiteSpace(guildInfo.eventChannelId)
      ? italic('Not set')
      : channelMention(guildInfo.eventChannelId)
    }`);
    channelMsgSegments.push(`Scenario Channel: ${isStringNullOrWhiteSpace(guildInfo.scenarioChannelId)
      ? italic('Not set')
      : channelMention(guildInfo.scenarioChannelId)
    }`);
    channelMsgSegments.push(`Vote Channel: ${isStringNullOrWhiteSpace(guildInfo.votingChannelId)
      ? italic('Not set')
      : channelMention(guildInfo.votingChannelId)
    }`);

    if (guildInfo.botChannelIds.length > 0) {
      const botChannelMentions = guildInfo.botChannelIds.map(botChannelId => `▸ ${channelMention(botChannelId)}`);
      channelMsgSegments.push(`Bot Channels:${EOL}${botChannelMentions.join(EOL)}`);
    } else {
      channelMsgSegments.push(`Bot Channels: ${italic('None')}`);
    };

    if (guildInfo.gameServerChannels.length > 0) {
      const gameServerChannelMentions = guildInfo.gameServerChannels.map(channel => 
        isStringNullOrWhiteSpace(channel.channelId)
          ? `▸ ${underscore(italic(`Server ${channel.serverId}`))}: ${channelMention(channel.channelId)}`
          : `▸ ${underscore(italic(`Server ${channel.serverId}`))}: ${italic('Not set')}`
      );
      channelMsgSegments.push(`Game Server Channels:${EOL}${gameServerChannelMentions.join(EOL)}`);
    } else {
      channelMsgSegments.push(`Game Server Channels: ${italic('None')}`);
    };

    return channelMsgSegments.join(EOL);
  };
};