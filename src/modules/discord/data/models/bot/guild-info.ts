import { SerializableObject } from '@modules/io/index.js';

/** Represents supplemental metadata about a Discord guild for bot operations. */
export class GuildInfo extends SerializableObject<GuildInfo> {
  constructor(
    /** Gets or sets the id of the guild the bot is managing in. */
    public guildId = '',

    /** Gets or sets the id of the guild channel for debug messages. */
    public debugChannelId = '',

    /** Gets or sets the id of the guild channel for event listeners or notifiers. */
    public eventChannelId = '',

    /** Gets or sets the id of the guild channel for posting OpenRCT2 game scenarios. */
    public scenarioChannelId = '',

    /** Gets or sets the id of the guild channel for votes. */
    public votingChannelId = '',

    /**
     * Gets or sets the array of ids of guild channels
     * that set specifically for executing bot commands.
     */
    public botChannelIds: string[] = [],

    /**
     * Gets or sets the array of ids of guild channels
     * set for relaying chat messages between Discord and the game servers.
     */
    public gameServerChannels: { serverId: number, channelId: string, autoRelay: boolean }[] = [],

    /** Gets or sets the array of ids of guild roles assigned for trusted users. */
    public trustedRoleIds: string[] = [],

    /** 
     * Gets or sets the array of guild user ids
     * that have restricted access to bot commands.
     */
    public restrictedUserIds: string[] = []
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