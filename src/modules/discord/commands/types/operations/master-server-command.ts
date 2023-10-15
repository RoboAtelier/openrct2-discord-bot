import {
  ChatInputCommandInteraction,
  bold,
  italic
} from 'discord.js';
import { EOL } from 'os';
import { Configuration } from '@modules/configuration';
import { 
  BotCommand,
  CommandPermissionLevel,
  CommandResponseBuilder
} from '@modules/discord/commands';
import { 
  OpenRCT2MasterServer,
  PublicOpenRCT2ServerInfo
} from '@modules/openrct2/web';
import { getArraySectionWithDetails } from '@modules/utils/array-utils';

type ServersCommandOptions =
  | 'ip' // search
  | 'name' // search
  | 'page' // list, search
type ServersCommandSubcommands =
  | 'here'
  | 'list'
  | 'search'

/** 
 * Represents a command for retrieving information about OpenRCT2 game servers
 * from the OpenRCT2 master server.
 */
export class MasterServerCommand extends BotCommand<
  ServersCommandOptions,
  ServersCommandSubcommands,
  null
> {
  private static readonly ipAddressKey = 'ipAddress';
  private static readonly detailMax = 7;

  private readonly hostingIPAddress: string;
  private readonly openRCT2MasterServer: OpenRCT2MasterServer;

  constructor(
    config: Configuration,
    openRCT2MasterServer: OpenRCT2MasterServer
  ) {
    super(CommandPermissionLevel.User);
    this.data
      .setName('master-server')
      .setDescription('Looks up OpenRCT2 game server information from the master server.')
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('here'))
          .setDescription('Gets information about the OpenRCT2 game servers here.')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('list'))
          .setDescription('Gets the current list of all public OpenRCT2 game servers.')
          .addIntegerOption(option => 
            option
              .setName(this.reflectOptionName('page'))
              .setDescription('The starting page of the server listing.')
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName(this.reflectSubcommandName('search'))
          .setDescription('Searches for specific public OpenRCT2 game servers.')
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('name'))
              .setDescription('The name of the server to match.')
          )
          .addStringOption(option =>
            option
              .setName(this.reflectOptionName('ip'))
              .setDescription('The IP address to match.')
          )
          .addIntegerOption(option => 
            option
              .setName(this.reflectOptionName('page'))
              .setDescription('The starting page of the search result listing.')
              .setMinValue(1)
          )
      );

    this.hostingIPAddress = config.getValue<string>(MasterServerCommand.ipAddressKey);
    this.openRCT2MasterServer = openRCT2MasterServer;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    let commandResponse = new CommandResponseBuilder();

    await interaction.deferReply();

    if (this.isInteractionUsingSubcommand(interaction, 'search')) {
      const serverName = this.doesInteractionHaveOption(interaction, 'name')
        ? this.getInteractionOption(interaction, 'name').value as string
        : null;
      const ipAddress = this.doesInteractionHaveOption(interaction, 'ip')
        ? this.getInteractionOption(interaction, 'ip').value as string
        : null;
      const pageIndex = this.doesInteractionHaveOption(interaction, 'page')
        ? this.getInteractionOption(interaction, 'page').value as number - 1
        : 0;
        commandResponse = await this.getPublicServerInfo(serverName, ipAddress, pageIndex);
    } else if (this.isInteractionUsingSubcommand(interaction, 'list')) {
      const pageIndex = this.doesInteractionHaveOption(interaction, 'page')
        ? this.getInteractionOption(interaction, 'page').value as number - 1
        : 0;
      commandResponse = await this.getPublicServerInfo(null, null, pageIndex);
    } else if (this.isInteractionUsingSubcommand(interaction, 'here')) {
      commandResponse = await this.getPublicServerInfo(null, this.hostingIPAddress, 0);
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    if (interaction.deferred) {
      await interaction.editReply(commandResponse.resolve());
    } else {
      await interaction.reply(commandResponse.resolve());
    };
  };

  private async getPublicServerInfo(serverName: string | null, ipAddress: string | null, resultIndex: number) {
    const commandResponse = new CommandResponseBuilder();

    if (
      serverName === null
      && ipAddress === null
    ) {
      const publicServers = await this.openRCT2MasterServer.requestPublicOpenRCT2ServerList();
      if (publicServers.length > 0) {
        const infoSet = getArraySectionWithDetails(publicServers, resultIndex);
        commandResponse.appendToMessage(this.formatSimpleInfoListMessage(infoSet));
      } else {
        commandResponse.appendToError('Could not find any public servers from the master server.');
      };
    } else {
      const publicServers = serverName !== null
        ? await this.openRCT2MasterServer.getPublicOpenRCT2ServersByFuzzySearch(serverName)
        : await this.openRCT2MasterServer.requestPublicOpenRCT2ServerList();

      const requestedServers = ipAddress !== null
        ? publicServers.filter(server => {
          return server.ip.v4[0] === ipAddress || server.ip.v6[0] === ipAddress;
        })
        : publicServers;

      if (0 === requestedServers.length) {
        commandResponse.appendToError(this.formatEmptyResultMessage(serverName, ipAddress));
      } else {
        if (ipAddress !== null) {
          commandResponse.appendToMessage(this.formatDetailedInfoListMessage(requestedServers))
        } else {
          const infoSet = getArraySectionWithDetails(requestedServers, resultIndex);
          commandResponse.appendToMessage(this.formatSimpleInfoListMessage(infoSet));
        };
      };
    };

    return commandResponse;
  };

  /**
   * Constructs a message of an empty search result with specified parameters.
   * @param serverName The name used to search if specified.
   * @param ipAddress The tags used to search if specified.
   * @returns A custom formatted message for a specific feature.
   */
  private formatEmptyResultMessage(serverName: string | null, ipAddress: string | null) {
    const queryParameterSegments = [];
    if (serverName !== null) {
      queryParameterSegments.push(`the name ${italic(serverName)}`);
    };
    if (ipAddress !== null) {
      queryParameterSegments.push(`the ip address ${italic(ipAddress)}`);
    };
    
    return `No servers match ${queryParameterSegments.join(' and ')}.`;
  };

  /**
   * Constructs a message of a simplified information listing of OpenRCT2 server statuses.
   * @param infoSet - The result set to format the message from.
   */
  private formatSimpleInfoListMessage(
    infoSet: {
      section: PublicOpenRCT2ServerInfo[],
      sectionIndex: number,
      totalSections: number
    }
  ) {
    const infoMsgSegments = [];

    for (const info of infoSet.section) {
      infoMsgSegments.push(`• [${info.players}P] [${bold(info.version)}] ${info.name}`);
    };
    infoMsgSegments.push(`${EOL}Page ${italic(`${infoSet.sectionIndex + 1}/${infoSet.totalSections}`)}`);

    return infoMsgSegments.join(EOL);
  };

  /**
   * Constructs a message of a detailed information listing of OpenRCT2 server statuses.
   * @param infoArray The result array to format the message from.
   */
  private formatDetailedInfoListMessage(infoArray: PublicOpenRCT2ServerInfo[]) {
    const infoMsgSegments = [];

    for (const info of infoArray.slice(0, MasterServerCommand.detailMax)) {
      let infoBlock = `__${info.name}__ is ${bold('UP')}!${info.requiresPassword ? ' \u{1F512}' : ''}`;
      infoBlock += `${EOL}Description: ${info.description}`;
      infoBlock += `${EOL}Server Version #: ${bold(info.version)}`;
      infoBlock += `${EOL}Players: ${info.players}/${info.maxPlayers}`;
      infoMsgSegments.push(infoBlock);
    };

    return infoMsgSegments.join(`${EOL}${EOL}`);
  };
};