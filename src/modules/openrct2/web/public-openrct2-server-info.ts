/** Represents information about a public OpenRCT2 server broadcasting on the master server list. */
export interface PublicOpenRCT2ServerInfo {
  readonly ip: {
    readonly v4: string[];
    readonly v6: string[];
  };
  readonly port: number;
  readonly version: string;
  readonly requiresPassword: boolean;
  readonly players: number;
  readonly maxPlayers: number;
  readonly name: string;
  readonly description: string;
  readonly provider: {
    readonly name: string;
    readonly email: string;
    readonly website: string;
  };
  readonly gameInfo: {
    readonly mapSize: {
      readonly x: number;
      readonly y: number;
    };
    readonly day: number;
    readonly month: number;
    readonly guests: number;
    readonly parkValue: number;
    readonly cash: number;
  };
};