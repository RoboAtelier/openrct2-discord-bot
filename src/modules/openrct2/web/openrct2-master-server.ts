import Fuse from 'fuse.js';
import { PublicOpenRCT2ServerInfo } from '.';

export class OpenRCT2MasterServer {
  private static readonly formatCodeRegex = /{[A-Z0-9_]+}/g;
  private static readonly fuseOptions = { keys: ['name'], threshold: 0.1 };

  /**
   * Gets public OpenRCT2 server information by an approximate search of its name.
   * @async
   * @param serverName The name of the server to query.
   * @returns An array of server info objects that closely match the specified name.
   */
  async getPublicOpenRCT2ServersByFuzzySearch(serverName: string) {
    const publicServers = await this.requestPublicOpenRCT2ServerList();
    const fuse = new Fuse(publicServers, OpenRCT2MasterServer.fuseOptions);
    const result = fuse.search(serverName);
    return result.map(resultElement => resultElement.item);
  };

  /**
   * Gets public OpenRCT2 server information by IP address.
   * @async
   * @param ipAddress The IP address of the server to query.
   * @returns An array of server info objects that match the IP address.
   */
  async getPublicOpenRCT2ServersByIP(ipAddress: string) {
    const publicServers = await this.requestPublicOpenRCT2ServerList();
    return publicServers.filter(server => {
      return server.ip.v4[0] === ipAddress || server.ip.v6[0] === ipAddress;
    });
  };

  /**
   * Queries the master server list of all public OpenRCT2 servers
   * broadcasting their status and details.
   * @async
   * @returns An array of all public server info objects.
   */
  async requestPublicOpenRCT2ServerList() {
    let attempts = 0;
    const jsonHeader = { Accept: 'application/json' };

    while (attempts < 3) {
      try {
        const response = await fetch('https://servers.openrct2.io', { headers: jsonHeader });
        const json: any = await response.json();
        for (const server of json.servers) { // trim excessive text
          server.name = server.name.replace(OpenRCT2MasterServer.formatCodeRegex, '');
          server.description = server.description.replace(OpenRCT2MasterServer.formatCodeRegex, '');
          server.provider.name = server.provider.name.replace(OpenRCT2MasterServer.formatCodeRegex, '');
          server.provider.email = server.provider.email.replace(OpenRCT2MasterServer.formatCodeRegex, '');
          server.provider.website = server.provider.website.replace(OpenRCT2MasterServer.formatCodeRegex, '');
        };
        return json.servers as PublicOpenRCT2ServerInfo[];
      } catch (err) {
        ++attempts;
        await new Promise(resolve => {
          setTimeout(resolve, 1000);
        });
        //logging
      };
    };
    throw new Error('Failed to get the OpenRCT2 server list from the master server.');
  };
};
