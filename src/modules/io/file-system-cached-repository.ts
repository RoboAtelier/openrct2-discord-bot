import { FileSystemRepository } from '.';

/**
 * Represents a data repository that provides
 * simplified access to file system objects and its data.
 * This repository includes a cache object for quicker retrieval
 * on subsequent requests.
 */
export abstract class FileSystemCachedRepository<K, V> extends FileSystemRepository {

  /** Gets the cache object for quick accessibility to data. */
  protected abstract readonly dataCache: Map<K, V>;

  /**
   * Retrieves the requested data from the cache storage
   * or loads data onto the cache and returns the result from the supplied getter.
   * @async
   * @param keyName The key name of the data value to return.
   * @param getter 
   * The async getter function to retrieve data
   * if the cache does not contain the requested data from the key name.
   * @returns The requested data.
   */
  protected async loadOrGetFromCache(
    keyName: K,
    getter: () => Promise<V>
  ) {
    const data = this.dataCache.get(keyName);
    if (data) {
      return data as V;
    };
    const currentData = await getter();
    this.dataCache.set(keyName, currentData);
    return currentData;
  };

  /**
   * Updates the data cache storage and source based on the updated data type.
   * @async
   * @param keyName The key name of the data value to update.
   * @param newData The updated data object.
   * @param updater The async updater function.
   */
  protected async updateCacheAndSource(
    keyName: K,
    newData: V,
    updater: (arg: V) => Promise<void>,
  ) {
    await updater(newData);
    this.dataCache.set(keyName, newData);
  };
};