import {
  bold,
  ChatInputCommandInteraction,
  inlineCode,
  italic
} from 'discord.js';
import {
  platform,
  EOL
} from 'os';
import {
  CommandPermissionLevel,
  CommandResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands';
import { Logger } from '@modules/logging';
import {
  OpenRCT2Build,
  OpenRCT2LinuxDistro,
  OpenRCT2Platform,
  OpenRCT2PlatformInfo
} from '@modules/openrct2/data/models';
import { OpenRCT2BuildDownloader } from '@modules/openrct2/web';
import { OpenRCT2BuildRepository } from '@modules/openrct2/data/repositories';
import { wait } from '@modules/utils/runtime-utils';

type GameBuildCommandOptions =
  | 'version' | 'commit'
  | 'os' | 'codename' | 'architecture'
  | 'index'
type GameBuildCommandSubcommands =
  | 'check'
  | 'download'
  | 'list'

const OperatingSystemChoices = [
  { name: 'Windows', value: 'win32' },
  { name: 'MacOS', value: 'darwin' },
  { name: 'Ubuntu/Debian', value: 'linux/ubuntu' }
];

const GameBuildSubcommands = <const>[
  {
    name: 'check',
    description: 'Checks for available downloads for an OpenRCT2 build.',
    options: [
      {
        name: 'version',
        type: 'string',
        description: 'The build version number. Format is v#.#.#',
        minLength: 5
      },
      {
        name: 'commit',
        type: 'string',
        description: 'The commit header for a develop build.',
        minLength: 7,
        maxLength: 7
      },
      {
        name: 'index',
        type: 'integer',
        description: 'The index ordinal of the latest develop builds.',
        minValue: 1,
        maxValue: 30
      }
    ]
  },
  {
    name: 'download',
    description: 'Downloads a game build.',
    options: [
      {
        name: 'version',
        type: 'string',
        description: 'The build version number. Format is v#.#.#',
        required: true,
        minLength: 5
      },
      {
        name: 'commit',
        type: 'string',
        description: 'The commit header for a develop build.',
        minLength: 7,
        maxLength: 7
      },
      {
        name: 'os',
        type: 'string',
        description: 'The target operating system to download for.',
        choices: OperatingSystemChoices
      },
      {
        name: 'codename',
        type: 'string',
        description: 'The version codename for a related Linux operating system.'
      },
      {
        name: 'architecture',
        type: 'string',
        description: 'The target operating system CPU architecture.'
      }
    ]
  },
  {
    name: 'list',
    description: 'Gets the current list of downloaded OpenRCT2 builds.',
    options: null
  },
];
  
/** Represents a command for downloading, installing, and managing OpenRCT2 builds. */
export class GameBuildCommand extends SubcommandsDiscordBotCommand<
  undefined,
  typeof GameBuildSubcommands[number]
> {
  private readonly logger;
  private readonly gameBuildRepo;
  private readonly openRCT2BuildDownloader;

  constructor(
    logger: Logger,
    gameBuildRepo: OpenRCT2BuildRepository,
    openRCT2BuildDownloader: OpenRCT2BuildDownloader
  ) {
    super(
      'game-build',
      'Manages OpenRCT2 builds.',
      undefined,
      GameBuildSubcommands,
      CommandPermissionLevel.Moderator
    );

    this.logger = logger;
    this.gameBuildRepo = gameBuildRepo;
    this.openRCT2BuildDownloader = openRCT2BuildDownloader;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandName = this.getInteractionSubcommandName(interaction);
    let commandResponse = new CommandResponseBuilder();

    await interaction.deferReply();

    if (subcommandName === 'check') {
      const options = this.getInteractionSubcommandOptions(interaction, 'check');
      let baseVersion = options.get('version')?.value as string;
      if (baseVersion && !baseVersion.startsWith('v')) {
        baseVersion = `v${baseVersion}`;
      };

      commandResponse = await this.requestOpenRCT2BuildInfo(
        options.get('index')?.value as number ?? 1,
        baseVersion,
        options.get('commit')?.value as string
      );
    } else if (subcommandName === 'download') {
      const options = this.getInteractionSubcommandOptions(interaction, 'download');
      let baseVersion = options.get('version')?.value as string;
      if (baseVersion && !baseVersion.startsWith('v')) {
        baseVersion = `v${baseVersion}`;
      };

      let distro;
      let operatingSystem = options.get('os')?.value as string ?? platform();
      if (operatingSystem && operatingSystem.startsWith('linux')) {
        distro = operatingSystem.substring(operatingSystem.indexOf('/') + 1) as OpenRCT2LinuxDistro;
        operatingSystem = 'linux';
      };

      const platformInfo = new OpenRCT2PlatformInfo(
        operatingSystem as OpenRCT2Platform,
        options.get('architecture')?.value as string,
        undefined,
        distro,
        options.get('codename')?.value as string
      );
      commandResponse = await this.downloadOpenRCT2Build(
        interaction,
        platformInfo,
        baseVersion,
        options.get('commit')?.value as string
      );
    } else if (subcommandName === 'list') {
      commandResponse = await this.getGameBuildVersionList();
    };

    if (0 === commandResponse.resolve().length) {
      commandResponse.appendToError('Unknown or unimplemented command specified.');
    };

    interaction.deferred 
      ? await interaction.editReply(commandResponse.resolve())
      : await interaction.reply(commandResponse.resolve());
  };

  private async requestOpenRCT2BuildInfo(
    buildIndex: number,
    baseVersion?: string,
    commitHeader?: string
  ) {
    const commandResponse = new CommandResponseBuilder();

    try {
      const gameBuild = baseVersion
        ? await this.openRCT2BuildDownloader.checkGameBuild(baseVersion, commitHeader)
        : await this.openRCT2BuildDownloader.checkDevelopGameBuildByIndex(buildIndex);

      commandResponse.appendToMessage(`${italic(gameBuild.version)}`, '');
      for (const platformTarget of gameBuild.platformTargets) {
        commandResponse.appendToMessage(bold(platformTarget.name));
        for (const type of platformTarget.types) {
          commandResponse.appendToMessage(type);
        };
      };
    } catch (err) {
      let errMsg = 'Failed to get development build information.';
      if (baseVersion) {
        const version = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
        errMsg = `Failed to get build information for version ${inlineCode(version)}.`;
      };
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      commandResponse.appendToError(errMsg);
    };

    return commandResponse;
  };

  private async downloadOpenRCT2Build(
    interaction: ChatInputCommandInteraction,
    platform: OpenRCT2PlatformInfo,
    baseVersion: string,
    commitHeader?: string
  ) {
    const commandResponse = new CommandResponseBuilder();

    try {
      const downloadInfo = await this.openRCT2BuildDownloader.getOpenRCT2BuildDownloadInfo(
        platform,
        baseVersion,
        commitHeader
      );
      const writeStream = this.gameBuildRepo.createOpenRCT2BuildWriteStream(downloadInfo.fileName);

      let ticked = false;
      await this.openRCT2BuildDownloader.downloadOpenRCT2Build(
        downloadInfo.downloadUrl,
        writeStream,
        async (percentage: string) => {
          if (!ticked) {
            ticked = true;
            await interaction.editReply(`Downloading ${inlineCode(downloadInfo.fileName)}: ${percentage} complete`);
            await wait(3, 's');
            ticked = false;
          };
        }
      );

      await interaction.editReply(`Unpacking ${inlineCode(downloadInfo.fileName)}...`);
      await this.gameBuildRepo.extracOpenRCT2Build(downloadInfo.fileName, downloadInfo.sha256Checksum);

      commandResponse.appendToMessage(`Successfully downloaded and unpacked ${inlineCode(downloadInfo.fileName)}.`);
    } catch (err) {
      const versionHeader = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
      const errMsg = `Failed to download and install build version ${inlineCode(versionHeader)}.`;
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      commandResponse.appendToError(errMsg);
    };

    return commandResponse;
  };

  private async getGameBuildVersionList() {
    const commandResponse = new CommandResponseBuilder();

    try {
      const gameBuilds = await this.gameBuildRepo.getAvailableOpenRCT2Builds();
      commandResponse.appendToMessage(this.formatGameBuildVersionListMessage(gameBuilds));
    } catch (err) {
      const errMsg = 'Failed to return current list of downloaded game builds.';
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      commandResponse.appendToError(errMsg);
    };

    return commandResponse;
  };

  private formatGameBuildVersionListMessage(gameBuilds: OpenRCT2Build[]) {
    const msgSegments = [];

    for (const gameBuild of gameBuilds) {
      let versionSegment = `▸ ${bold(gameBuild.name)}`;
      msgSegments.push(versionSegment);
    };

    return msgSegments.join(EOL);
  };
};