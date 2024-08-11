import https from 'https';
import { Octokit } from '@octokit/rest';
import { FixedPathWriteStream } from '@modules/io';
import { OpenRCT2PlatformInfo } from '@modules/openrct2/data/models';
import { getDistroInfo } from '@modules/utils/runtime-utils';

interface PlatformTargetInfo {
  readonly name: string;
  readonly types: string[];
};

/** Represents a web request handler for downloading and querying OpenRCT2 builds. */
export class BuildDownloadService {
  private static readonly releaseRepoParams = { owner: 'OpenRCT2', repo: 'OpenRCT2', per_page: 50 };
  private static readonly developRepoParams = { owner: 'Limetric', repo: 'OpenRCT2-binaries', per_page: 50 };

  private octokit = new Octokit();

  /**
   * Downloads an OpenRCT2 build from the specified URL.
   * @param downloadUrl The URL of the OpenRCT2 build to download.
   * @param writeStream The write stream consuming the content and writing the data.
   * @param progressListener An optional event handler lambda expression to send a progress percentage value back.
   */
  async downloadBuild(
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
  async queryBuild(baseVersion: string, commitHeader?: string) {
    const repoParams = commitHeader
      ? { ...BuildDownloadService.developRepoParams, page: 1 }
      : { ...BuildDownloadService.releaseRepoParams, page: 1 };
    const targetVersion = commitHeader ? `${baseVersion}-${commitHeader}` : baseVersion;
    let baseVersionFound = false;

    while (true) {
      const gitReleases = await this.octokit.repos.listReleases(repoParams);

      if (!gitReleases.data.length) {
        break;
      };
      for (const gitRelease of gitReleases.data) {
        if (gitRelease.tag_name === targetVersion) {
          return { version: targetVersion, assetNames: gitRelease.assets.map(asset => asset.name) };
        } else if (gitRelease.tag_name.includes(`${baseVersion}-`)) {
          baseVersionFound = true;
        } else if (baseVersionFound && !gitRelease.tag_name.includes(`${baseVersion}-`)) {
          return undefined;
        };
      };
      ++repoParams.page;
    };
  };

  /**
   * 
   * @async
   * @param index 
   * @param pageIndex
   * @returns 
   */
  async queryDevelopBuildByIndex(index: number, pageIndex?: number) {
    const developRepoParams = { ...BuildDownloadService.developRepoParams, page: pageIndex ?? 1 }
    const gitReleases = await this.octokit.repos.listReleases(developRepoParams);

    if (gitReleases.data.length) {
      const targetIndex = index < 0
        ? 0
        : index > gitReleases.data.length
        ? gitReleases.data.length - 1
        : index;
      const targetRelease = gitReleases.data[targetIndex];
      return { version: targetRelease.tag_name, assetNames: targetRelease.assets.map(asset => asset.name) };
    };
  };

  /**
   * Retrieves the necessary details
   * @param platform 
   * @param baseVersion 
   * @param commitHeader 
   * @returns 
   */
  async getBuildInfo(
    platform: OpenRCT2PlatformInfo,
    baseVersion: string,
    commitHeader?: string
  ) {
    const repoParams = commitHeader
      ? { ...BuildDownloadService.developRepoParams, page: 1 }
      : { ...BuildDownloadService.releaseRepoParams, page: 1 };
    const targetVersion = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
    const linuxPlatform = platform.name === 'linux' && !platform.distro
      ? await getDistroInfo()
      : platform;
    let baseVersionFound = false;

    while (true) {
      const gitReleases = await this.octokit.repos.listReleases(repoParams);

      if (!gitReleases.data.length) {
        break;
      };
      for (const gitRelease of gitReleases.data) {
        if (gitRelease.tag_name === targetVersion) {
          const targetAsset = gitRelease.assets.find(asset => {
            const platformName = platform.name === 'linux' ? platform.name : platform.friendlyName;
            return asset.name.includes(platformName)
              && asset.name.includes(linuxPlatform.codeName ?? '')
              && asset.name.includes(platform.architecture);
          });
          if (targetAsset) {
            const validFileExtension = OpenRCT2Module.BuildFileExtensionArray.find(ext => {
              const fileName = targetAsset.name.toLocaleLowerCase();
              return fileName.endsWith(ext);
            });
            if (validFileExtension) {
              let fileName = `${targetVersion}_${platform.friendlyName}`;
              if (linuxPlatform.codeName) {
                fileName += `-${linuxPlatform.codeName}`;
              };
              fileName += platform.architecture === 'x86_64' ? '_x86-64' : `_${platform.architecture}`;
              return {
                downloadUrl: targetAsset.browser_download_url,
                fileName: `${fileName}${validFileExtension}`
              };
            };
            throw new Error(`Unsupported file was returned. ${targetAsset.name}`);
          };
          throw new Error(`Failed to find a build for OS: ${platform.name} ${platform.version} ${platform.architecture}`); 
        } else if (gitRelease.tag_name.includes(`${baseVersion}-`)) {
          baseVersionFound = true;
        } else if (baseVersionFound && !gitRelease.tag_name.includes(`${baseVersion}-`)) {
          return undefined;
        };
      };
      ++repoParams.page;
    };
  };
};
