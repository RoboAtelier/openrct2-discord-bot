import {
  arch,
  platform,
  EOL
} from 'os';
import {
  bold,
  ChatInputCommandInteraction,
  inlineCode,
  italic
} from 'discord.js';
import {
  CommandPermissionLevel,
  ResponseBuilder,
  SubcommandsDiscordBotCommand
} from '@modules/discord/commands/index.js';
import { Logger } from '@modules/logging/index.js';
import {
  BuildDirectory,
  PlatformInfo,
  ArchitectureTypeArray,
} from '@modules/openrct2/data/models/index.js';
import { BuildDownloadService } from '@modules/openrct2/services/index.js';
import { BuildRepository } from '@modules/openrct2/data/repositories/index.js';
import { wait } from '@modules/utils/runtime-utils.js';


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
        choices: Array.of(
          { name: 'Windows', value: 'win32' },
          { name: 'MacOS', value: 'darwin' },
          { name: 'Linux', value: 'linux' },
          { name: 'Ubuntu', value: 'ubuntu' },
          { name: 'Debian', value: 'debian' }
        )
      },
      {
        name: 'codename',
        type: 'string',
        description: 'The version codename for a related Linux operating system.'
      },
      {
        name: 'architecture',
        type: 'string',
        description: 'The target operating system CPU architecture.',
        choices: ArchitectureTypeArray.map(arch => { return { name: arch, value: arch }})
      },
      {
        name: 'type',
        type: 'string',
        description: 'The build type to download.',
        choices: Array.of(
          { name: 'Windows Portable', value: 'portable' },
          { name: 'Linux AppImage', value: 'AppImage' }
        )
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
  private readonly logger: Logger;
  private readonly buildRepo: BuildRepository;
  private readonly buildDownloadService: BuildDownloadService;

  constructor(
    logger: Logger,
    buildRepo: BuildRepository,
    buildDownloadService: BuildDownloadService
  ) {
    super(
      'build',
      'Manages OpenRCT2 builds.',
      undefined,
      GameBuildSubcommands,
      CommandPermissionLevel.Moderator
    );

    this.logger = logger;
    this.buildRepo = buildRepo;
    this.buildDownloadService = buildDownloadService;
  };

  /** @override */
  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandName = this.getInteractionSubcommandName(interaction);
    const response = new ResponseBuilder();

    await interaction.deferReply();

    if (subcommandName === 'check') {
      const options = this.getInteractionSubcommandOptions(interaction, 'check');
      let baseVersion = options.get('version')?.value as string;
      if (baseVersion && !baseVersion.startsWith('v')) {
        baseVersion = `v${baseVersion}`;
      };

      await this.requestBuildInfo(
        response,
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
      if (['ubuntu', 'debian'].includes(operatingSystem)) {
        distro = operatingSystem.slice();
        operatingSystem = 'linux';
      };
      const platformInfo = new PlatformInfo(
        operatingSystem,
        options.get('architecture')?.value as string,
        undefined,
        distro,
        options.get('codename')?.value as string
      );
      await this.downloadOpenRCT2Build(
        response,
        interaction,
        platformInfo,
        baseVersion,
        options.get('commit')?.value as string,
        options.get('type')?.value as 'portable' | 'AppImage'
      );
    } else if (subcommandName === 'list') {
      await this.getBuildVersionList(response);
    }

    if (!response.hasContent) {
      interaction.deferred 
        ? await interaction.editReply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage)
        : await interaction.reply(SubcommandsDiscordBotCommand.unknownCommandErrorMessage);
      return;
    };

    const messagePayload = response.resolve(interaction);
    interaction.deferred 
      ? await interaction.editReply(messagePayload)
      : await interaction.reply(messagePayload);
  };

  private async requestBuildInfo(
    response: ResponseBuilder,
    buildIndex: number,
    baseVersion?: string,
    commitHeader?: string
  ) {
    try {
      const gameBuild = baseVersion
        ? await this.buildDownloadService.queryBuild(baseVersion, commitHeader)
        : await this.buildDownloadService.queryDevelopBuildByIndex(buildIndex);

      if (gameBuild) {
        response.addText(`${italic(gameBuild.version)}`, '', `${bold('Available Builds:')}`);
        for (const assetName of gameBuild.assetNames) {
          response.addText(`▸ ${inlineCode(assetName)}`);
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
      response.addErrorText(errMsg);
    };
  };

  private async downloadOpenRCT2Build(
    response: ResponseBuilder,
    interaction: ChatInputCommandInteraction,
    platform: PlatformInfo,
    baseVersion: string,
    commitHeader?: string,
    assetType?: 'portable' | 'AppImage'
  ) {
    try {
      const downloads = await this.buildDownloadService.queryDownloads(
        platform,
        baseVersion,
        commitHeader,
        assetType
      );
      if (downloads?.length === 1) {
        const download = downloads[0];

        let ticked = false;
        await this.buildDownloadService.downloadAndInstallBuild(
          download,
          async (percentage, extractComplete) => {
            if (percentage < 100 && !ticked) {
              ticked = true;
              await interaction.editReply(`Downloading ${inlineCode(download.fileName)}: ${percentage.toFixed(2)}% complete`);
              await wait(2, 's');
              ticked = false;
            } else if (percentage === 100) {
              if (!extractComplete) {
                await interaction.editReply(`Unpacking ${inlineCode(download.fileName)}...`);
              } else {
                response.addText(`Successfully downloaded and unpacked ${inlineCode(download.fileName)}.`);
              };
            };
          }
        );
      } else {
        response.addErrorText(this.formatNonsingleDownloadError(platform, downloads));
      };
    } catch (err) {
      const versionHeader = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
      const errMsg = `Failed to download and install build version ${inlineCode(versionHeader)}.`;
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      response.addErrorText(errMsg);
    };
  };

  private async getBuildVersionList(response: ResponseBuilder) {
    try {
      const gameBuilds = await this.buildRepo.getAvailableBuilds();
      response.addText(this.formatBuildVersionListMessage(gameBuilds));
    } catch (err) {
      const errMsg = 'Failed to return current list of downloaded game builds.';
      await this.logger.writeError(errMsg);
      await this.logger.writeError(err as Error);
      response.addErrorText(errMsg);
    };
  };

  private formatBuildVersionListMessage(buildDirs: BuildDirectory[]) {
    const msgSegments = [];

    for (const gameBuild of buildDirs) {
      let versionSegment = `▸ ${inlineCode(gameBuild.name)}`;
      msgSegments.push(versionSegment);
    };

    return msgSegments.join(EOL);
  };

  private formatNonsingleDownloadError(
    platform: PlatformInfo,
    downloads?: { originalFileName: string }[]
  ) {
    const errorMsgSegments = [];

    if (downloads && downloads.length > 1) {
      errorMsgSegments.push(`Multiple builds match ${
        inlineCode(`${platform.friendlyName}_${platform.version ?? '?'}_${platform.architecture}`)
      }:`, '');
      for (const download of downloads.slice(0, 10)) {
        errorMsgSegments.push(`▸ ${inlineCode(download.originalFileName)}`);
      };
    } else {
      errorMsgSegments.push(`Failed to find a build for ${
        inlineCode(`${platform.friendlyName}_${platform.version ?? '?'}_${platform.architecture}`)
      }`)
    };

    return errorMsgSegments.join(EOL);
  };
};