import { EOL } from 'os';
import {
  channelMention,
  italic,
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
  | 'debug' | 'event' | 'scenario' | 'voting' | 'bot'
type ChannelCommandSubcommands =
  | 'check'
  | 'set'
  | 'unset'
  | 'reset'

const ChannelIdPropertyArray = [
  'debugChannelId',
  'eventChannelId',
  'scenarioChannelId',
  'votingChannelId'
] as const;
const MultiChannelIdPropertyArray = [
  'botChannelIds'
] as const;

/** Represents a command for managing guild channels to be used by the bot. */
export class ChannelCommand extends BotCommand<
  ChannelCommandOptions,
  ChannelCommandSubcommands,
  null
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
      .addSubcommand(subcommand => 
        subcommand
          .setName(this.reflectSubcommandName('set'))
          .setDescription('Sets guild channel types for the bot.')
          .addChannelOption(option => 
            option
              .setName(this.reflectOptionName('debug'))
              .setDescription('The channel to assign as the debug channel.')
          )
          .addChannelOption(option => 
            option
              .setName(this.reflectOptionName('event'))
              .setDescription('The channel to assign as the event channel.')
          )
          .addChannelOption(option => 
            option
              .setName(this.reflectOptionName('scenario'))
              .setDescription('The channel to assign as the scenario channel.')
          )
          .addChannelOption(option => 
            option
              .setName(this.reflectOptionName('voting'))
              .setDescription('The channel to assign as the vote channel.')
          )
          .addChannelOption(option => 
            option
              .setName(this.reflectOptionName('bot'))
              .setDescription('The channel to assign as a bot command channel.')
          )
      )
      .addSubcommand(subcommand => 
        subcommand
          .setName(this.reflectSubcommandName('unset'))
          .setDescription('Unsets guild channel types.')
          .addBooleanOption(option => 
            option
              .setName(this.reflectOptionName('debug'))
              .setDescription('Unsets the current debug channel.')
          )
          .addBooleanOption(option => 
            option
              .setName(this.reflectOptionName('event'))
              .setDescription('Unsets the current event channel.')
          )
          .addBooleanOption(option => 
            option
              .setName(this.reflectOptionName('scenario'))
              .setDescription('Unsets the current scenario channel.')
          )
          .addBooleanOption(option => 
            option
              .setName(this.reflectOptionName('voting'))
              .setDescription('Unsets the current vote channel.')
          )
          .addChannelOption(option => 
            option
              .setName(this.reflectOptionName('bot'))
              .setDescription('Unsets a bot channel.')
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
    } else if (this.isInteractionUsingSubcommand(interaction, 'set')) {
      const debugChannelId = this.doesInteractionHaveOption(interaction, 'debug')
        ? this.getInteractionOption(interaction, 'debug').value as string
        : null;
      const eventChannelId = this.doesInteractionHaveOption(interaction, 'event')
        ? this.getInteractionOption(interaction, 'event').value as string
        : null;
      const scenarioChannelId = this.doesInteractionHaveOption(interaction, 'scenario')
        ? this.getInteractionOption(interaction, 'scenario').value as string
        : null;
      const votingChannelId = this.doesInteractionHaveOption(interaction, 'voting')
        ? this.getInteractionOption(interaction, 'voting').value as string
        : null;
      const botChannelId = this.doesInteractionHaveOption(interaction, 'bot')
        ? this.getInteractionOption(interaction, 'bot').value as string
        : null;
      commandResponse = await this.setChannelTypes(debugChannelId, eventChannelId, scenarioChannelId, votingChannelId, botChannelId);
    } else if (this.isInteractionUsingSubcommand(interaction, 'unset')) {
      const unsetDebug = this.doesInteractionHaveOption(interaction, 'debug')
        ? this.getInteractionOption(interaction, 'debug').value as boolean
        : null;
      const unsetEvent = this.doesInteractionHaveOption(interaction, 'event')
        ? this.getInteractionOption(interaction, 'event').value as boolean
        : null;
      const unsetScenario = this.doesInteractionHaveOption(interaction, 'scenario')
        ? this.getInteractionOption(interaction, 'scenario').value as boolean
        : null;
      const unsetVoting = this.doesInteractionHaveOption(interaction, 'voting')
        ? this.getInteractionOption(interaction, 'voting').value as boolean
        : null;
      const botChannelId = this.doesInteractionHaveOption(interaction, 'bot')
        ? this.getInteractionOption(interaction, 'bot').value as string
        : null;
        commandResponse = await this.unsetChannelTypes(unsetDebug, unsetEvent, unsetScenario, unsetVoting, botChannelId);
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
    botChannelId: string | null
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

    if (isStringNullOrWhiteSpace(commandResponse.message)) {
      commandResponse.appendToMessage('No changes were made.');
    } else if (!commandResponse.hasError) {
      await this.botDataRepo.updateGuildInfo(guildInfo);
    };

    return commandResponse;
  };

  private async unsetChannelTypes(
    unsetDebug: boolean | null,
    unsetEvent: boolean | null,
    unsetScenario: boolean | null,
    unsetVoting: boolean | null,
    botChannelId: string | null
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
      const botChannelMentions = guildInfo.botChannelIds.map(botChannelId => channelMention(botChannelId));
      channelMsgSegments.push(`Bot Channels: ${botChannelMentions.join(', ')}`);
    } else {
      channelMsgSegments.push(`Bot Channels: ${italic('None')}`);
    };

    return channelMsgSegments.join(EOL);
  };
};