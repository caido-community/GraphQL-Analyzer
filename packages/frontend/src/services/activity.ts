import type { FrontendSDK } from "../plugins/sdk";

export class ActivityService {
  private sdk: FrontendSDK;

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  async addAttackActivity(
    targetUrl: string,
    attackTypes: string[],
    attackSessionId: string,
    requestId?: string,
  ): Promise<void> {
    try {
      const domain = this.getDomainName(targetUrl);
      const attackTypesList = attackTypes.join(", ");
      const title =
        requestId !== undefined && requestId !== null && requestId !== ""
          ? `Attack run on ${domain} (${requestId.substring(0, 8)})`
          : `Attack run on ${domain}`;

      const activityData = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        title: title,
        url: targetUrl,
        description: `GraphQL attacks: ${attackTypesList}`,
        createdAt: new Date(),
        status: "attack",
        type: "attack",
        attackSessionId: attackSessionId,
      };

      type StorageData = {
        dashboardActivities?: Array<{
          id: string;
          title: string;
          url: string;
          description?: string;
          createdAt: Date;
          status: string;
          type: string;
          attackSessionId?: string;
        }>;
      };
      const currentStorage: StorageData =
        (this.sdk.storage.get() as StorageData | undefined) ?? {};

      if (
        currentStorage.dashboardActivities === undefined ||
        !Array.isArray(currentStorage.dashboardActivities)
      ) {
        currentStorage.dashboardActivities = [];
      }

      currentStorage.dashboardActivities.unshift(activityData);

      if (currentStorage.dashboardActivities.length > 20) {
        currentStorage.dashboardActivities =
          currentStorage.dashboardActivities.slice(0, 20);
      }

      await this.sdk.storage.set(
        currentStorage as unknown as Record<string, never>,
      );
    } catch {
      // Ignore storage errors
    }
  }

  private getDomainName(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "Unknown";
    }
  }
}

let activityServiceInstance: ActivityService | undefined = undefined;

export function createActivityService(sdk: FrontendSDK): ActivityService {
  if (activityServiceInstance === undefined) {
    activityServiceInstance = new ActivityService(sdk);
  }
  return activityServiceInstance;
}
