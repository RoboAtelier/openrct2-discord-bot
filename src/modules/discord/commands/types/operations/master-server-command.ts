import {
  bold,
  ChatInputCommandInteraction,
  italic
} from 'discord.js';
import { EOL } from 'os';
import { Configuration } from '@modules/configuration';
import {
  CommandPermissionLevel,
  CommandResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { 
  OpenRCT2MasterServer,
  PublicOpenRCT2ServerInfo
} from '@modules/openrct2/web';
import { getArraySectionWithDetails } from '@modules/utils/array-utils';

const MasterServerSubcommands = <const>[
  {
    name: 'here',
    description: 'Gets information about the OpenRCT2 game servers here.',
    options: null
  },
  {
    name: 'list',
    description: 'Gets the current list of all public OpenRCT2 game servers.',
    options: [{
      name: 'page',
      type: 'integer',
      description: 'The starting page of the server listing.',
      minValue: 1
    }]
  },
  {
    name: 'search',
    description: 'Searches for specific public OpenRCT2 game servers.',
    options: [
      {
        name: 'name',
        type: 'string',
        description: 'The name of the server to match.'
      },
      {
        name: 'ip',
        type: 'string',
        description: 'The IP address to match.'
      },
      {
        name: 'page',
        type: 'integer',
        description: 'The starting page of the search result listing.',
        minValue: 1
      }
    ]
  }
];

/** 
 * Represents a command for retrieving information about OpenRCT2 game servers
 * from the OpenRCT2 master server.
 */
export class MasterServerCommand extends SubcommandsDiscordBotCommand<undefined, typeof MasterServerSubcommands[number]> {
  private static readonly ipAddressKey = 'ipAddress';
  private static readonly detailMax = 7;

  private readonly hostingIPAddress: string;
  private readonly openRCT2MasterServer: OpenRCT2MasterServer;

  constructor(
    config: Configuration,
    openRCT2MasterServer: OpenRCT2MasterServer
  ) {
    super(
      'master-server',
      'Looks up OpenRCT2 game server information from the master server.',
      undefined,
      MasterServerSubcommands,
      CommandPermissionLevel.User
    );

    this.hostingIPAddress = config.getValue<string>(MasterServerCommand.ipAddressKey);
    this.openRCT2MasterServer = openRCT2MasterServer;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandName = this.getInteractionSubcommandName(interaction);
    let commandResponse = new CommandResponseBuilder();

    await interaction.deferReply();

    if (subcommandName === 'search') {
      const options = this.getInteractionSubcommandOptions(interaction, 'search');

      commandResponse = await this.getPublicServerInfo(
        (options.get('page')?.value as number ?? 1) - 1,
        options.get('ip')?.value as string,
        options.get('name')?.value as string
      );
    } else if (subcommandName === 'list') {
      const pageIndex = (this.getInteractionOption(interaction, 'page')?.value as number ?? 1) - 1;
      commandResponse = await this.getPublicServerInfo(pageIndex);
    } else if (subcommandName === 'here') {
      commandResponse = await this.getPublicServerInfo(0, this.hostingIPAddress);
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    interaction.deferred
      ? await interaction.editReply(commandResponse.resolve())
      : await interaction.reply(commandResponse.resolve());
  };

  private async getPublicServerInfo(resultIndex: number, ipAddress?: string, serverName?: string) {
    const commandResponse = new CommandResponseBuilder();

    if (!serverName && !ipAddress) {
      const publicServers = await this.openRCT2MasterServer.requestPublicOpenRCT2ServerList();
      if (publicServers.length > 0) {
        const serverListSection = getArraySectionWithDetails(publicServers, resultIndex);
        commandResponse.appendToMessage(this.formatBasicServerInfoListMessage(serverListSection));
      } else {
        commandResponse.appendToError('Could not find any public servers from the master server.');
      };
    } else {
      const publicServers = serverName
        ? await this.openRCT2MasterServer.getPublicOpenRCT2ServersByFuzzySearch(serverName)
        : await this.openRCT2MasterServer.requestPublicOpenRCT2ServerList();

      const requestedServers = ipAddress
        ? publicServers.filter(server => {
          return server.ip.v4[0] === ipAddress || server.ip.v6[0] === ipAddress;
        })
        : publicServers;

      if (0 === requestedServers.length) {
        commandResponse.appendToError(this.formatNoMatchesMessage(serverName, ipAddress));
      } else {
        if (ipAddress) {
          commandResponse.appendToMessage(this.formatDetailedServerInfoListMessage(requestedServers))
        } else {
          const serverListSection = getArraySectionWithDetails(requestedServers, resultIndex);
          commandResponse.appendToMessage(this.formatBasicServerInfoListMessage(serverListSection));
        };
      };
    };

    return commandResponse;
  };

  /**
   * Constructs a message of an empty search result with specified parameters.
   * @param ipAddress The ip address used to search if specified.
   * @param serverName The name used to search if specified.
   * @returns A custom formatted message for a specific feature.
   */
  private formatNoMatchesMessage(ipAddress?: string, serverName?: string) {
    const queryParameterSegments = [];

    if (ipAddress) {
      queryParameterSegments.push(`the ip address ${italic(ipAddress)}`);
    };
    if (serverName) {
      queryParameterSegments.push(`the name ${italic(serverName)}`);
    };
    
    return `No servers match ${queryParameterSegments.join(' and ')}.`;
  };

  /**
   * Constructs a message of a simplified information listing of OpenRCT2 server statuses.
   * @param serverListSection - The result set to format the message from.
   */
  private formatBasicServerInfoListMessage(
    serverListSection: {
      section: PublicOpenRCT2ServerInfo[],
      sectionIndex: number,
      totalSections: number
    }
  ) {
    const infoMsgSegments = [];

    for (const server of serverListSection.section) {
      infoMsgSegments.push(`• [${server.players}P] [${bold(server.version)}] ${server.name}`);
    };
    infoMsgSegments.push(`${EOL}Page ${italic(`${serverListSection.sectionIndex + 1}/${serverListSection.totalSections}`)}`);

    return infoMsgSegments.join(EOL);
  };

  /**
   * Constructs a message of a detailed information listing of OpenRCT2 server statuses.
   * @param serverList The result array to format the message from.
   */
  private formatDetailedServerInfoListMessage(serverList: PublicOpenRCT2ServerInfo[]) {
    const infoMsgSegments = [];

    for (const server of serverList.slice(0, MasterServerCommand.detailMax)) {
      let infoBlock = `__${server.name}__ is ${bold('UP')}!${server.requiresPassword ? ' \u{1F512}' : ''}`;
      infoBlock += `${EOL}Description: ${server.description}`;
      infoBlock += `${EOL}Server Version #: ${bold(server.version)}`;
      infoBlock += `${EOL}Players: ${server.players}/${server.maxPlayers}`;
      infoMsgSegments.push(infoBlock);
    };

    return infoMsgSegments.join(`${EOL}${EOL}`);
  };
};