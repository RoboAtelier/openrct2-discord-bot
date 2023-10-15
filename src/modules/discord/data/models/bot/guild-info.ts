import { SerializableObject } from '@modules/io';

/** Represents supplemental metadata about a Discord guild for bot operations. */
export class GuildInfo extends SerializableObject<GuildInfo> {

  /** Gets or sets the id of the guild the bot is managing in. */
  guildId: string;

  /** Gets or sets the id of the guild channel for debug messages. */
  debugChannelId: string;

  /** Gets or sets the id of the guild channel for event listeners or notifiers. */
  eventChannelId: string;

  /** Gets or sets the id of the guild channel for posting OpenRCT2 game scenarios. */
  scenarioChannelId: string;

  /** Gets or sets the id of the guild channel for votes. */
  votingChannelId: string;

  /**
   * Gets or sets the array of ids of guild channels
   * that set specifically for executing bot commands.
   */
  botChannelIds: string[];

  /**
   * Gets or sets the array of ids of guild channels
   * set for relaying chat messages between Discord and the game servers.
   */
  gameServerChannels: { serverId: number, channelId: string, autoRelay: boolean }[];

  /** Gets or sets the array of ids of guild roles assigned for trusted users. */
  trustedRoleIds: string[];

  /** 
   * Gets or sets the array of guild user ids
   * that have restricted access to bot commands.
   */
  restrictedUserIds: string[];

  constructor(
    guildId = '',
    debugChannelId = '',
    eventChannelId = '',
    scenarioChannelId = '',
    votingChannelId = '',
    botChannelIds: string[] = [],
    gameServerChannels = [],
    trustedRoleIds: string[] = [],
    restrictedUserIds: string[] = []
  ) {
    super();
    this.guildId = guildId;
    this.debugChannelId = debugChannelId;
    this.eventChannelId = eventChannelId;
    this.scenarioChannelId = scenarioChannelId;
    this.votingChannelId = votingChannelId;
    this.botChannelIds = botChannelIds;
    this.gameServerChannels = gameServerChannels;
    this.trustedRoleIds = trustedRoleIds;
    this.restrictedUserIds = restrictedUserIds;
  };

  fromDataString(dataStr: string) {
    const json = JSON.parse(dataStr);
    if (this.isPartialType(json)) {
      const defaultObj = { ...new GuildInfo() } as any;
      const objProperties = Object.getOwnPropertyNames(defaultObj);
      for (const property of objProperties) {
        if (json[property] !== undefined) {
          defaultObj[property] = json[property];
        };
      };
      return new GuildInfo(...(Object.values(defaultObj) as any[]));
    };
    throw new Error(`The data could not be converted to '${GuildInfo.name}'.`);
  };

  toDataString() {
    return JSON.stringify(this, null, 2);
  };
};