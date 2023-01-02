/** Represents a bot command permission level. */
export enum CommandPermissionLevel {

  /** Specifies a level with restricted permissions to bot commands. */
  Restricted = 0,

  /** Specifies a level with basic permissions. */
  User = 1,

  /** Specifies a level with access to additional features. */
  Trusted = 2,

  /** Specifies a level with moderator access. */
  Moderator = 3,

  /** Specifies a level with manager access. */
  Manager = 4
};