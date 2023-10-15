import https from 'https';
import path from 'path';
import { exec } from 'child_process';
import { 
  load,
  Cheerio,
  Element
} from 'cheerio';
import { FixedPathWriteStream } from '@modules/io';
import { OpenRCT2PlatformInfo } from '@modules/openrct2/data/models';
import { OpenRCT2BuildFileExtension } from '@modules/openrct2/data/types';
import { getLinuxDistroInfo } from '@modules/utils/runtime-utils';

interface PlatformTargetInfo {
  readonly name: string;
  readonly types: string[];
};

interface GameBuildInfo {
  readonly version: string;
  readonly platformTargets: PlatformTargetInfo[]
};

/** Represents a web request handler for downloading and querying OpenRCT2 builds. */
export class OpenRCT2BuildDownloader {

  /**
   * Downloads an OpenRCT2 build from the specified URL.
   * @param downloadUrl The URL of the OpenRCT2 build to download.
   * @param writeStream The write stream consuming the content and writing the data.
   * @param progressListener An optional event handler lambda expression to send a progress percentage value back.
   */
  async downloadOpenRCT2Build(
    downloadUrl: string,
    writeStream: FixedPathWriteStream,
    progressListener?: (percentage: string) => Promise<void>
  ) {
    let currentUrl = downloadUrl;

    let requesting = true;
    while (requesting) {
      await new Promise<void>((httpsResolve, httpsReject) => {
        https.get(currentUrl, response => {
          if (response.statusCode === 302) {
            if (response.headers.location) {
              currentUrl = response.headers.location;
              httpsResolve();
            } else {
              httpsReject('Redirect response returned an empty location header.');
            };
          } else if (response.statusCode === 200) {
            if (response.headers['content-type'] === 'application/octet-stream' && response.headers['content-length']) {
              const totalBytes = parseInt(response.headers['content-length'], 10);
              let currentBytes = 0;
  
              response.pipe(writeStream);
              response.on('data', chunk => {
                currentBytes += chunk.length;
                if (progressListener) {
                  const percentage = `${(currentBytes / totalBytes * 100).toFixed(2)}%`;
                  progressListener(percentage);
                };
              });
              response.on('error', async err => {
                writeStream.close();
                httpsReject(err.message);
              });
              response.on('end', () => {
                requesting = false;
                httpsResolve();
              });
              writeStream.on('finish', () => {
                writeStream.close();
              });
            } else {
              httpsReject(`Unexpected response headers found: content-type '${response.headers['content-type']}' | content-length ${response.headers['content-length']}`);
            };
          } else {
            httpsReject(`Download link returned a problem code: ${response.statusCode}`);
          };
        });
      });
    };
  };

  /**
   * 
   * @param baseVersion 
   * @param commitHeader 
   * @returns 
   */
  async checkGameBuild(baseVersion: string, commitHeader?: string) {
    const targetVersion = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
    const webPage = commitHeader
      ? await fetch(path.join('https://openrct2.org/downloads/develop', `${baseVersion}-${commitHeader}`))
      : await fetch(path.join('https://openrct2.org/downloads/releases', baseVersion));

    const platformTargets = this.parseGameDownloadPlatformTargets(await webPage.text());
    return {
      version: targetVersion,
      platformTargets: platformTargets
    } as GameBuildInfo;
  };

  /**
   * 
   * @param index 
   * @returns 
   */
  async checkDevelopGameBuildByIndex(index: number) {
    const developPage = await fetch('https://openrct2.org/downloads/develop');

    const $ = load(await developPage.text(), { baseURI: 'https://openrct2.org' });
    const $tableRows = $('table:first > tbody').children();
    const selectedRow = $tableRows[index - 1];
    if (selectedRow) {
      const $anchor = $(selectedRow).find('a');
      const targetVersion = $anchor.text();
      const buildPage = await fetch($anchor.prop('href')!);

      if (buildPage.status !== 200) {
        throw new Error(`Failed to find downloads for version ${targetVersion}.`);
      };
      const platformTargets = this.parseGameDownloadPlatformTargets(await buildPage.text());
      return {
        version: targetVersion,
        platformTargets: platformTargets
      } as GameBuildInfo;
    };
    throw new Error('Specified index did not return a valid develop build link.');
  };

  /**
   * Retrieves the necessary details
   * @param platform 
   * @param baseVersion 
   * @param commitHeader 
   * @returns 
   */
  async getOpenRCT2BuildDownloadInfo(
    platform: OpenRCT2PlatformInfo,
    baseVersion: string,
    commitHeader?: string
  ) {
    let platformTargets = [];
    let definedPlatformName: string | undefined;
    let fileExtension: OpenRCT2BuildFileExtension | undefined;

    if (platform.name === 'win32') {
      fileExtension = '.zip';
      if (platform.architecture === 'x64') {
        definedPlatformName = 'windows_x64';
        platformTargets.push(
          'windows-portable-x64',
          'windows-x64'
        );
      } else if (platform.architecture === 'arm64') {
        definedPlatformName = 'windows_arm64';
        platformTargets.push(
          'windows-portable-arm64',
          'windows-arm64'
        );
      } else {
        definedPlatformName = 'windows_win32';
        platformTargets.push(
          'windows-portable-win32',
          'windows-win32'
        );
      };
    } else if (platform.name === 'darwin') {
      fileExtension = '.zip';
      definedPlatformName = 'macos';
      platformTargets.push(
        'macos-universal',
        'macos'
      );
    } else if (platform.name === 'linux') {
      const linuxPlatform = platform.distro
        ? Object.assign({}, platform)
        : await getLinuxDistroInfo();
      
      if (linuxPlatform) {
        fileExtension = '.tar.gz';
        if (linuxPlatform.distro === 'ubuntu' || linuxPlatform.distro === 'debian') {
          if (platform.architecture === 'i686') {
            definedPlatformName = `${linuxPlatform.distro}-${linuxPlatform.codeName}_i686`;
            platformTargets.push(
              `linux-i686-${platform.codeName}`,
              `linux-${platform.codeName}-i686`,
              'linux-i686'
            );
          } else {
            definedPlatformName = `${linuxPlatform.distro}-${linuxPlatform.codeName}_x86-64`;
            platformTargets.push(
              `linux-x86_64-${platform.codeName}`,
              `linux-${platform.codeName}-x86_64`,
              'linux-x86_64'
            );
          };
        };
      };
    };

    if (!(platformTargets.length && definedPlatformName)) {
      throw new Error(`Unsupported OS: ${platform.name} ${platform.architecture}`);
    } else if (!fileExtension) {
      throw new Error('File extension was not defined while preparing to search for a game build package.');
    };
    platformTargets = platformTargets.map(target => target += fileExtension);
    const targetVersion = commitHeader ? `${baseVersion}-${commitHeader}` : baseVersion;

    const webPage = commitHeader
      ? await fetch(path.join('https://openrct2.org/downloads/develop', targetVersion))
      : await fetch(path.join('https://openrct2.org/downloads/releases', targetVersion));
    const $ = load(await webPage.text(), { baseURI: 'https://openrct2.org' });

    let $downloadAnchor: Cheerio<Element> | undefined;
    const validTarget = platformTargets.find(target => {
      $downloadAnchor = $(`a:contains("${target}")`);
      return $downloadAnchor.length;
    });

    if (validTarget && $downloadAnchor) {
      const $sha256TableCell = $downloadAnchor.last().parent().next();
      const downloadUrl = $downloadAnchor.last().attr('href');
      const sha256TitleAttr = $sha256TableCell.attr('title');
      if (downloadUrl && sha256TitleAttr) {
        const sha256Checksum = sha256TitleAttr.substring(sha256TitleAttr.lastIndexOf(' ') + 1);
        return {
          downloadUrl: downloadUrl,
          fileName: `${targetVersion}_${definedPlatformName}${fileExtension}`,
          sha256Checksum: sha256Checksum
        };
      };
      throw new Error('There was missing data in the requested page nodes.');
    };
    throw new Error(`Failed to find a download link for OS: ${platform.name} ${platform.version} ${platform.architecture}`); 
  };

  private parseGameDownloadPlatformTargets(pageHtml: string) {
    const platformTargets: PlatformTargetInfo[] = [];
    const $ = load(pageHtml);
    const $h2s = $('h2');
    for (const h2 of $h2s) {
      const h2Text = $(h2).text();
      if (!h2Text.includes('download') || h2Text.includes('Miscellaneous')) {
        continue;
      };

      const platformTarget: PlatformTargetInfo = {
        name: h2Text,
        types: []
      };
      for (const row of $(h2).next().find('tbody').children()) {
        const $variantCell = $(row).find('td:first');
        platformTarget.types.push($variantCell.text());
      };
      platformTargets.push(platformTarget);
    };
    return platformTargets;
  };
};
