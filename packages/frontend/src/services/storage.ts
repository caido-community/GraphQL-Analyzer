import type { FrontendSDK } from "@/types";

export class StorageService {
  constructor(private sdk: FrontendSDK) {}

  get<T = unknown>(key: string): T | undefined {
    const storage = this.sdk.storage.get() as Record<string, unknown> | undefined;
    return storage?.[key] as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    const currentStorage = (this.sdk.storage.get() as Record<string, unknown>) ?? {};
    currentStorage[key] = value;
    await this.sdk.storage.set(currentStorage as unknown as Record<string, never>);
  }

  async remove(key: string): Promise<void> {
    const currentStorage = (this.sdk.storage.get() as Record<string, unknown>) ?? {};
    delete currentStorage[key];
    await this.sdk.storage.set(currentStorage as unknown as Record<string, never>);
  }

  async removeMultiple(keys: string[]): Promise<void> {
    const currentStorage = (this.sdk.storage.get() as Record<string, unknown>) ?? {};
    for (const key of keys) {
      delete currentStorage[key];
    }
    await this.sdk.storage.set(currentStorage as unknown as Record<string, never>);
  }

  getAll(): Record<string, unknown> {
    return (this.sdk.storage.get() as Record<string, unknown>) ?? {};
  }

  async setMultiple(data: Record<string, unknown>): Promise<void> {
    const currentStorage = (this.sdk.storage.get() as Record<string, unknown>) ?? {};
    Object.assign(currentStorage, data);
    await this.sdk.storage.set(currentStorage as unknown as Record<string, never>);
  }
}

let storageServiceInstance: StorageService | undefined;

export function createStorageService(sdk: FrontendSDK): StorageService {
  if (storageServiceInstance === undefined) {
    storageServiceInstance = new StorageService(sdk);
  }
  return storageServiceInstance;
}

