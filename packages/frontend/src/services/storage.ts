import type { FrontendSDK } from "@/types";

export class StorageService {
  private pendingWrites = Promise.resolve();

  constructor(private sdk: FrontendSDK) {}

  get<T = unknown>(key: string): T | undefined {
    const storage = this.sdk.storage.get() as
      | Record<string, unknown>
      | undefined;
    return storage?.[key] as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.pendingWrites = this.pendingWrites.then(async () => {
      const currentStorage =
        (this.sdk.storage.get() as Record<string, unknown>) ?? {};
      currentStorage[key] = value;
      await this.sdk.storage.set(
        currentStorage as unknown as Record<string, never>,
      );
    });
    await this.pendingWrites;
  }

  async remove(key: string): Promise<void> {
    this.pendingWrites = this.pendingWrites.then(async () => {
      const currentStorage =
        (this.sdk.storage.get() as Record<string, unknown>) ?? {};
      delete currentStorage[key];
      await this.sdk.storage.set(
        currentStorage as unknown as Record<string, never>,
      );
    });
    await this.pendingWrites;
  }

  async removeMultiple(keys: string[]): Promise<void> {
    this.pendingWrites = this.pendingWrites.then(async () => {
      const currentStorage =
        (this.sdk.storage.get() as Record<string, unknown>) ?? {};
      for (const key of keys) {
        delete currentStorage[key];
      }
      await this.sdk.storage.set(
        currentStorage as unknown as Record<string, never>,
      );
    });
    await this.pendingWrites;
  }

  getAll(): Record<string, unknown> {
    return (this.sdk.storage.get() as Record<string, unknown>) ?? {};
  }

  async setMultiple(data: Record<string, unknown>): Promise<void> {
    this.pendingWrites = this.pendingWrites.then(async () => {
      const currentStorage =
        (this.sdk.storage.get() as Record<string, unknown>) ?? {};
      Object.assign(currentStorage, data);
      await this.sdk.storage.set(
        currentStorage as unknown as Record<string, never>,
      );
    });
    await this.pendingWrites;
  }
}

let storageServiceInstance: StorageService | undefined;

export function createStorageService(sdk: FrontendSDK): StorageService {
  if (storageServiceInstance === undefined) {
    storageServiceInstance = new StorageService(sdk);
  }
  return storageServiceInstance;
}
