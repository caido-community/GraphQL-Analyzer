import type { FrontendSDK } from "../plugins/sdk";

/**
 * Activity Service for managing recent activities in the dashboard
 */
export class ActivityService {
  private sdk: FrontendSDK;

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  /**
   * Adds an attack activity to recent activities
   */
  async addAttackActivity(
    targetUrl: string,
    attackTypes: string[],
    attackSessionId: string,
  ): Promise<void> {
    try {
      const domain = this.getDomainName(targetUrl);
      const attackTypesList = attackTypes.join(", ");

      const activityData = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        title: `Attack run on ${domain}`,
        url: targetUrl,
        description: `GraphQL attacks: ${attackTypesList}`,
        createdAt: new Date(),
        status: "attack",
        type: "attack",
        attackSessionId: attackSessionId,
      };

      const currentStorage = (this.sdk.storage.get() as any) || {};

      // Initialize dashboard activities if not present
      if (
        !currentStorage.dashboardActivities ||
        !Array.isArray(currentStorage.dashboardActivities)
      ) {
        currentStorage.dashboardActivities = [];
      }

      // Add activity to the beginning of the list
      currentStorage.dashboardActivities.unshift(activityData);

      // Keep only the most recent 20 activities to prevent storage bloat
      if (currentStorage.dashboardActivities.length > 20) {
        currentStorage.dashboardActivities =
          currentStorage.dashboardActivities.slice(0, 20);
      }

      // @ts-expect-error - SDK storage.set accepts any object
      await this.sdk.storage.set(currentStorage);
    } catch (error) {
      // Silently handle storage errors
    }
  }

  /**
   * Gets domain name from URL
   */
  private getDomainName(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "Unknown";
    }
  }
}

/**
 * Create and export singleton instance
 */
let activityServiceInstance: ActivityService | null = null;

export function createActivityService(sdk: FrontendSDK): ActivityService {
  if (!activityServiceInstance) {
    activityServiceInstance = new ActivityService(sdk);
  }
  return activityServiceInstance;
}

export { activityServiceInstance as activityService };
