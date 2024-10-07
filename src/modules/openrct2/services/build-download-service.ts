import https from 'https';
import { Octokit } from '@octokit/rest';
import { OpenRCT2 } from '@modules/openrct2/index.js';
import { PlatformInfo } from '@modules/openrct2/data/models/index.js';
import { getDistroInfo } from '@modules/utils/runtime-utils.js';
import { BuildRepository } from '@modules/openrct2/data/repositories/index.js';

export interface DownloadInfo {
  url: string,
  originalFileName: string,
  fileName: string
};

/** Represents a web request handler for downloading, installing, and querying OpenRCT2 builds. */
export class BuildDownloadService {
  private static readonly releaseRepoParams = { owner: 'OpenRCT2', repo: 'OpenRCT2', per_page: 50 };
  private static readonly developRepoParams = { owner: 'Limetric', repo: 'OpenRCT2-binaries', per_page: 50 };

  private readonly octokit = new Octokit();

  constructor(private readonly buildRepo: BuildRepository) { };

  /**
   * Downloads and installs an OpenRCT2 build from the specified download information.
   * @param downloadInfo The information about the OpenRCT2 build to download and install.
   * @param progressListener An optional event handler lambda expression to send progress values back.
   */
  async downloadAndInstallBuild(
    downloadInfo: DownloadInfo,
    progressListener = async (downloadPercentage: number, extractComplete = false) => {}
  ) {
    let currentUrl = downloadInfo.url;
    let requesting = true;
    const writeStream = this.buildRepo.createBuildWriteStream(downloadInfo.fileName);

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
                const percentage = currentBytes / totalBytes * 100;
                progressListener(percentage);
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

    await this.buildRepo.extractBuild(downloadInfo.fileName);
    progressListener(100, true);
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
   * @param assetType
   * @returns 
   */
  async queryDownloads(
    platform: PlatformInfo,
    baseVersion: string,
    commitHeader?: string,
    assetType?: 'portable' | 'AppImage' 
  ) {
    const repoParams = commitHeader
      ? { ...BuildDownloadService.developRepoParams, page: 1 }
      : { ...BuildDownloadService.releaseRepoParams, page: 1 };
    const targetVersion = `${baseVersion}${commitHeader ? `-${commitHeader}` : ''}`;
    const linuxPlatform = platform.name === 'linux' && !platform.distro && assetType !== 'AppImage'
      ? await getDistroInfo()
      : platform.name === 'linux' && platform.distro
      ? platform
      : undefined;
    const targetPlatform = linuxPlatform
      ? `${platform.name}${linuxPlatform.codeName ? `-${linuxPlatform.codeName}` : ''}`
      : platform.friendlyName;
    const targetAssetType = assetType
      ? assetType
      : platform.name === 'win32'
      ? 'portable'
      : undefined;

    let baseVersionFound = false;

    while (true) {
      const gitReleases = await this.octokit.repos.listReleases(repoParams);

      if (!gitReleases.data.length) {
        break;
      };
      for (const gitRelease of gitReleases.data) {
        if (gitRelease.tag_name === targetVersion) {
          const targetAssets = gitRelease.assets.filter(asset => {
            const assetNameLowercase = asset.name.toLocaleLowerCase();
            return assetNameLowercase.includes(targetPlatform)
              && assetNameLowercase.includes(platform.architecture ?? '')
              && assetNameLowercase.includes(targetAssetType ?? '');
          });

          const matchingBuilds: DownloadInfo[] = [];
          for (const targetAsset of targetAssets) {
            const validFileExtension = OpenRCT2.BuildFileExtensionArray.find(ext => {
              const fileName = targetAsset.name.toLocaleLowerCase();
              return fileName.endsWith(ext);
            });
            if (validFileExtension) {
              let fileName = `${targetVersion}_${platform.friendlyName}`;
              fileName += targetAsset.name.includes('x86_64') ? '_x86-64' : `_${platform.architecture}`;
              matchingBuilds.push({
                url: targetAsset.browser_download_url,
                originalFileName: targetAsset.name,
                fileName: `${fileName}${validFileExtension}`
              });
            };
          };
          return matchingBuilds;
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
