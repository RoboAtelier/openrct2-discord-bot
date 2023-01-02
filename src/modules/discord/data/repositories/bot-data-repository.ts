import path from 'path';
import { 
  ConcurrentDirectory,
  ConcurrentObjectFile,
  FileSystemCachedRepository
} from '@modules/io';
import { Configuration } from '@modules/configuration';
import { 
  CommandSettings,
  GuildInfo
} from '@modules/discord/data/models/bot';

export class BotDataRepository extends FileSystemCachedRepository<string, any> {
  private static readonly dirKey = 'bot';
  private static readonly commandSettingsFileName = 'command-settings.json';
  private static readonly guildInfoFileName = 'guild-info.json';

  private readonly commandSettingsFile: ConcurrentObjectFile<CommandSettings>;
  private readonly guildInfoFile: ConcurrentObjectFile<GuildInfo>;

  protected readonly dataDir: ConcurrentDirectory;
  protected readonly dataCache = new Map<string, any>();

  constructor(config: Configuration) {
    super(config);
    this.dataDir = new ConcurrentDirectory(config.getDirectoryPath(BotDataRepository.dirKey));
    this.commandSettingsFile = new ConcurrentObjectFile(
      path.join(this.dataDir.path, BotDataRepository.commandSettingsFileName),
      new CommandSettings()
    );
    this.guildInfoFile = new ConcurrentObjectFile(
      path.join(this.dataDir.path, BotDataRepository.guildInfoFileName),
      new GuildInfo()
    );
  };
  
  dispose() {
    this.commandSettingsFile.dispose();
    this.guildInfoFile.dispose();
    this.dataDir.dispose();
  };

  async getCommandSettings(): Promise<CommandSettings> {
    return this.loadOrGetFromCache(
      CommandSettings.name,
      () => this.commandSettingsFile.readExclusive()
    );
  };

  async updateCommandSettings(botConfig: CommandSettings) {
    return this.updateCacheAndSource(
      CommandSettings.name,
      botConfig,
      newValue => this.commandSettingsFile.writeExclusive(newValue)
    );
  };

  async getGuildInfo(): Promise<GuildInfo> {
    return this.loadOrGetFromCache(
      GuildInfo.name,
      () => this.guildInfoFile.readExclusive()
    );
  };

  async updateGuildInfo(guildChannelInfo: GuildInfo) {
    return this.updateCacheAndSource(
      GuildInfo.name,
      guildChannelInfo,
      newValue => this.guildInfoFile.writeExclusive(newValue)
    );
  };
};