import { EOL } from 'os';
import {
  ChatInputCommandInteraction,
  Client,
  inlineCode,
  italic,
  roleMention,
  underscore
} from 'discord.js';
import { 
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands/index.js';
import { GuildInfo } from '@modules/discord/data/models/bot/index.js';
import { BotDataRepository } from '@modules/discord/data/repositories/index.js';

type RoleInput = {
  trustedRoleId?: string
};

const RoleSubcommandGroups = <const>[
  {
    name: 'trusted',
    subcommands: [
      { 
        name: 'set',
        description: 'Sets a role to be designated as a trusted role for bot commands.',
        options: [{ 
          name: 'role',
          type: 'role',
          description: 'The role to set as a trusted role.',
          required: true
        }]
      },
      { 
        name: 'clear',
        description: 'Clears a role from being a trusted role.',
        options: [{ 
          name: 'role',
          type: 'role',
          description: 'The role to remove from being a trusted role.',
          required: true
        }]
      }
    ]
  }
];
const RoleSubcommands = <const>[
  {
    name: 'clear',
    description: 'Clears the current guild role assignments for this bot.',
    options: null
  },
  { 
    name: 'settings',
    description: 'Shows the current role assignments for this bot.',
    options: null
  }
];

/** Represents a command for managing guild channels to be used by the bot. */
export class RoleCommand extends SubcommandsDiscordBotCommand<
  typeof RoleSubcommandGroups[number],
  typeof RoleSubcommands[number]
> {
  constructor(
    private readonly discordClient: Client<true>,
    private readonly botDataRepo: BotDataRepository
  ) {
    super(
      'role',
      'Manages Discord guild roles for bot use.',
      RoleSubcommandGroups,
      RoleSubcommands,
      CommandPermissionLevel.Moderator
    );
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const groupName = this.getInteractionSubcommandGroupName(interaction);
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    if (subcommandName === 'settings') {
      await this.getRoleList(response);
    } else if (groupName == null && subcommandName === 'clear') {
      await this.clearAllRoleTypes(response);
    } else {
      const roleId = this.getInteractionOption(interaction, 'role')?.value as string ?? '-1';
      const input: RoleInput = {};

      switch (groupName) {
        case 'trusted':
          input.trustedRoleId = roleId;
          break;
        default:
          break;
      };

      switch (subcommandName) {
        case 'set':
          await this.setRoleType(response, input);
          break;
        case 'clear':
          await this.clearRoleType(response, input);
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

  private async setRoleType(response: ResponseBuilder, input: RoleInput) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    const guild = await this.discordClient.guilds.fetch(guildInfo.guildId);

    if (input.trustedRoleId) {
      const trustedRole = await guild.roles.fetch(input.trustedRoleId);
      if (guildInfo.trustedRoleIds.includes(input.trustedRoleId)) {
        response.addErrorText(`${trustedRole?.name ?? 'Unknown Role'} is already set as a ${italic('Trusted Role')}.`);
      } else {
        guildInfo.trustedRoleIds.push(input.trustedRoleId);
        response.addText(`Set ${trustedRole?.name ?? 'Unknown Role'} as a ${italic('Trusted Role')}.`);
      };
    };
    
    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await this.botDataRepo.updateGuildInfo(guildInfo);
    };
  };

  private async clearRoleType(response: ResponseBuilder, input: RoleInput) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    const guild = await this.discordClient.guilds.fetch(guildInfo.guildId);
    
    if (input.trustedRoleId) {
      const trustedRole = await guild.roles.fetch(input.trustedRoleId);
      if (guildInfo.trustedRoleIds.includes(input.trustedRoleId)) {
        guildInfo.trustedRoleIds.splice(guildInfo.botChannelIds.indexOf(input.trustedRoleId), 1);
        response.addErrorText(`Cleared ${trustedRole?.name ?? 'Unknown Role'} from being a ${italic('Trusted Role')}.`);
      } else {
        response.addErrorText(`${trustedRole?.name ?? 'Unknown Role'} is not set as a ${italic('Trusted Role')}.`);
      };
    };

    if (!response.hasText) {
      response.addText('No changes were made.');
    } else if (!response.hasError) {
      await this.botDataRepo.updateGuildInfo(guildInfo);
    };
  };

  private async clearAllRoleTypes(response: ResponseBuilder) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    
    guildInfo.trustedRoleIds = [];

    response.addText('Cleared all role assignments for this bot.');
    await this.botDataRepo.updateGuildInfo(guildInfo);
  };

  private async getRoleList(response: ResponseBuilder) {
    const guildInfo = await this.botDataRepo.getGuildInfo();
    response.addText(await this.formatRoleListMessage(guildInfo));
  };

  private async formatRoleListMessage(guildInfo: GuildInfo) {
    const guild = await this.discordClient.guilds.fetch(guildInfo.guildId);
    const channelMsgSegments = ['Current roles:', ''];

    if (guildInfo.trustedRoleIds.length > 0) {
      const trustedRoles = await Promise.all(guildInfo.trustedRoleIds.map(async trustedRoleId => {
        const role = await guild.roles.fetch(trustedRoleId);
        return `▸ ${role?.name ?? 'Unknown Role'}`;
      }));
      channelMsgSegments.push('Trusted:', `${trustedRoles.join(EOL)}`);
    } else {
      channelMsgSegments.push(`Trusted: ${italic('None')}`);
    };

    return channelMsgSegments.join(EOL);
  };
};