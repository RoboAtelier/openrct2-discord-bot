import { EOL } from 'os';
import {
  channelMention,
  italic,
  underscore,
  ChatInputCommandInteraction
} from 'discord.js';
import { 
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands/index.js';
import { GuildInfo } from '@modules/discord/data/models/bot/index.js';
import { BotDataRepository } from '@modules/discord/data/repositories/index.js';
import { isStringNullOrWhiteSpace } from '@modules/utils/string-utils.js';

type ChannelInput = {
  serverId?: number
  botChannelId?: string,
  debugChannelId?: string,
  eventChannelId?: string,
  gameServerChannelId?: string,
  scenarioChannelId?: string,
  votingChannelId?: string
};

const ChannelSubcommandGroups = <const>[
  {
    name: 'bot',
    subcommands: [
      { 
        name: 'set',
        description: 'Sets a channel to be used for this bot\'s commands.',
        options: [{ 
          name: 'channel',
          type: 'channel',
          description: 'The channel to set as a bot command channel.',
          required: true
        }]
      },
      { 
        name: 'clear',
        description: 'Clears a channel from being a bot command channel.',
        options: [{ 
          name: 'channel',
          type: 'channel',
          description: 'The channel to remove from being a bot command channel.',
          required: true
        }]
      }
    ]
  },
  {
    name: 'debug',
    subcommands: [
      { 
        name: 'set',
        description: 'Sets a channel to retain debugging messages for this bot.',
        options: [{ 
          name: 'channel',
          type: 'channel',
          description: 'The channel to set as the debug channel.',
          required: true
        }]
      },
      { 
        name: 'clear',
        description: 'Clears the current debug channel setting.',
        options: null
      }
    ]
  },
  {
    name: 'event',
    subcommands: [
      { 
        name: 'set',
        description: 'Sets a channel to monitor bot events.',
        options: [{ 
          name: 'channel',
          type: 'channel',
          description: 'The channel to set as the debug channel.',
          required: true
        }]
      },
      { 
        name: 'clear',
        description: 'Clears the current event channel setting.',
        options: null
      }
    ]
  },
  {
    name: 'game-server',
    subcommands: [
      {
        name: 'set',
        description: 'Sets a channel to be used to relay OpenRCT2 game server messages and commands.',
        options: [
          {
            name: 'channel',
            type: 'channel',
            description: 'The channel to set as an OpenRCT2 game server channel.',
            required: true
          },
          {
            name: 'server-id',
            type: 'integer',
            description: 'The id of the server that the channel is for.',
            required: true,
            minValue: 1
          }
        ]
      },
      { 
        name: 'clear',
        description: 'Clears a channel from being an OpenRCT2 game server channel.',
        options: [{ 
          name: 'server-id',
          type: 'integer',
          description: 'The id of the server associated to a channel to remove.',
          required: true,
          minValue: 1
        }]
      }
    ]
  },
  {
    name: 'scenario',
    subcommands: [
      { 
        name: 'set',
        description: 'Sets a channel to post scenario files.',
        options: [{ 
          name: 'channel',
          type: 'channel',
          description: 'The channel to set as the scenario channel.',
          required: true
        }]
      },
      { 
        name: 'clear',
        description: 'Clears the current scenario channel setting.',
        options: null
      }
    ]
  },
  {
    name: 'voting',
    subcommands: [
      { 
        name: 'set',
        description: 'Sets a channel to host votes.',
        options: [{ 
          name: 'channel',
          type: 'channel',
          description: 'The channel to set as the voting channel.',
          required: true
        }]
      },
      { 
        name: 'clear',
        description: 'Clears the current voting channel setting.',
        options: null
      }
    ]
  }
];
const ChannelSubcommands = <const>[
  {
    name: 'clear',
    description: 'Clears the current guild channel assignments for this bot.',
    options: null
  },
  { 
    name: 'settings',
    description: 'Shows the current channel assignments for this bot.',
    options: null
  }
];

/** Represents a command for managing guild channels to be used by the bot. */
export class ChannelCommand extends SubcommandsDiscordBotCommand<
  typeof ChannelSubcommandGroups[number],
  typeof ChannelSubcommands[number]
> {
  private readonly botDataRepo: BotDataRepository;

  constructor(botDataRepo: BotDataRepository) {
    super(
      'channel',
      'Manages Discord guild channels for bot use.',
      ChannelSubcommandGroups,
      ChannelSubcommands,
      CommandPermissionLevel.Moderator
    );

    this.botDataRepo = botDataRepo;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const groupName = this.getInteractionSubcommandGroupName(interaction);
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    if (subcommandName === 'settings') {
      await this.getChannelList(response);
    } else if (groupName == null && subcommandName === 'clear') {
      await this.clearAllChannelTypes(response);
    } else {
      const channelId = this.getInteractionOption(interaction, 'channel')?.value as string ?? '-1';
      const input: ChannelInput = {};

      switch (groupName) {
        case 'bot':
          input.botChannelId = channelId;
          break;
        case 'debug':
          input.debugChannelId = channelId;
          break;
        case 'event':
          input.eventChannelId = channelId;
          break;
        case 'game-server':
          input.serverId = this.getRequiredInteractionOption(interaction, 'server-id').value as number;
          input.gameServerChannelId = channelId;
          break;
        case 'scenario':
          input.scenarioChannelId = channelId;
          break;
        case 'voting':
          input.votingChannelId = channelId;
          break;
        default:
          break;
      };

      switch (subcommandName) {
        case 'set':
          await this.setChannelType(response, input);
          break;
        case 'clear':
          await this.clearChannelType(response, input);
          break;
        default:
          break;
      };
    };

    if (!response.hasContent) {
      interaction.deferred 
        ? await interaction.editReply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage)
        : await interaction.reply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage);
      return;
    };
    
    await interaction.reply(response.resolve(interaction));
  };

  private async setChannelType(response: ResponseBuilder, input: ChannelInput) {
    const guildInfo = await this.botDataRepo.getGuildInfo();

    if (input.botChannelId) {
      if (guildInfo.botChannelIds.includes(input.botChannelId)) {
        response.addErrorText(`${channelMention(input.botChannelId)} is already set as a ${italic('Bot Channel')}.`);
      } else {
        guildInfo.botChannelIds.push(input.botChannelId);
        response.addText(`Set ${channelMention(input.botChannelId)} as a ${italic('Bot Channel')}.`);
      };
    } else if (input.debugChannelId) {
      guildInfo.debugChannelId = input.debugChannelId;
      response.addText(`Set ${channelMention(input.debugChannelId)} as the ${italic('Debug Channel')}.`);
    } else if (input.eventChannelId) {
      guildInfo.eventChannelId = input.eventChannelId;
      response.addText(`Set ${channelMention(input.eventChannelId)} as the ${italic('Event Channel')}.`);
    } else if (input.gameServerChannelId && input.serverId) {
      if (guildInfo.gameServerChannels.some(channel => channel.channelId === input.gameServerChannelId)) {
        response.addErrorText(`${
          channelMention(input.gameServerChannelId)
        } is already set assigned as a ${italic('Game Server Channel')}.`);
      } else {
        const index = guildInfo.gameServerChannels.findIndex(channel => channel.serverId === input.serverId);
        if (!index) {
          guildInfo.gameServerChannels.push({
            channelId: input.gameServerChannelId,
            serverId: input.serverId,
            autoRelay: false
          });
        } else {
          guildInfo.gameServerChannels[index].channelId = input.gameServerChannelId;
        };
        response.addText(`Set ${
          channelMention(input.gameServerChannelId)
        } as a ${italic('Game Server Channel')} for ${underscore(italic(`Server ${input.serverId}`))}.`);
      };
    } else if (input.scenarioChannelId) {
      guildInfo.scenarioChannelId = input.scenarioChannelId;
      response.addText(`Set ${channelMention(input.scenarioChannelId)} as the ${italic('Scenario Channel')}.`);
    } else if (input.votingChannelId) {
      guildInfo.votingChannelId = input.votingChannelId;
      response.addText(`Set ${channelMention(input.votingChannelId)} as the ${italic('Vote Channel')}.`);
    };
    
    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await this.botDataRepo.updateGuildInfo(guildInfo);
    };
  };

  private async clearChannelType(response: ResponseBuilder, input: ChannelInput) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    
    if (input.botChannelId) {
      if (guildInfo.botChannelIds.includes(input.botChannelId)) {
        guildInfo.botChannelIds.splice(guildInfo.botChannelIds.indexOf(input.botChannelId), 1);
        response.addErrorText(`Cleared ${channelMention(input.botChannelId)} from being a ${italic('Bot Channel')}.`);
      } else {
        response.addErrorText(`${channelMention(input.botChannelId)} is not set as a ${italic('Bot Channel')}.`);
      };
    } else if (input.debugChannelId) {
      guildInfo.debugChannelId = '';
      response.addText(`Cleared the ${italic('Debug Channel')}.`);
    } else if (input.eventChannelId) {
      guildInfo.eventChannelId = '';
      response.addText(`Cleared the ${italic('Event Channel')}.`);
    } else if (input.gameServerChannelId && input.serverId) {
      const index = guildInfo.gameServerChannels.findIndex(channel => channel.serverId === input.serverId);
      if (index < 0) {
        response.addErrorText(`${
          underscore(italic(`Server ${input.serverId}`))
        } does not have a ${italic('Game Server Channel')} set.`);
      } else {
        guildInfo.gameServerChannels[index].channelId = '';
        response.addErrorText(`Cleared the current ${
          underscore(italic(`Server ${input.serverId}`))
        } ${italic('Game Server Channel')}.`);
      };
    } else if (input.scenarioChannelId) {
      guildInfo.scenarioChannelId = '';
      response.addText(`Cleared the ${italic('Scenario Channel')}.`);
    } else if (input.votingChannelId) {
      guildInfo.votingChannelId = '';
      response.addText(`Cleared the ${italic('Vote Channel')}.`);
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await this.botDataRepo.updateGuildInfo(guildInfo);
    };
  };

  private async clearAllChannelTypes(response: ResponseBuilder) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    
    guildInfo.botChannelIds = [];
    guildInfo.debugChannelId = '';
    guildInfo.eventChannelId = '';
    guildInfo.gameServerChannels = [];
    guildInfo.scenarioChannelId = '';
    guildInfo.votingChannelId = '';

    response.addText('Cleared all channel assignments for this bot.');
    await this.botDataRepo.updateGuildInfo(guildInfo);
  };

  private async getChannelList(response: ResponseBuilder) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    response.addText(this.formatChannelListMessage(guildInfo));
  };

  /**
   * Constructs a message of guild channels in use by the bot.
   * @param guildInfo The current guild data to derive the channel information from.
   */
  private formatChannelListMessage(guildInfo: GuildInfo) {
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
          ? `▸ ${underscore(italic(`Server ${channel.serverId}`))}: ${italic('Not set')}`
          : `▸ ${underscore(italic(`Server ${channel.serverId}`))}: ${channelMention(channel.channelId)}`
      );
      channelMsgSegments.push(`Game Server Channels:${EOL}${gameServerChannelMentions.join(EOL)}`);
    } else {
      channelMsgSegments.push(`Game Server Channels: ${italic('None')}`);
    };

    return channelMsgSegments.join(EOL);
  };
};