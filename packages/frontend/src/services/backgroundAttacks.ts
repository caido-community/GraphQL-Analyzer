import type { FrontendSDK } from "../types";
import { createStorageService } from "./storage";

export class BackgroundAttackService {
  private sdk: FrontendSDK;
  private storageService;
  private pollInterval: number | undefined = undefined;
  private static instance: BackgroundAttackService | undefined = undefined;

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
    this.storageService = createStorageService(sdk);
  }

  async startBackgroundAttack(sessionId: string, attackTypes: string[]): Promise<void> {
    await this.stopBackgroundAttack();

    await this.storageService.set("graphql-analyzer-background-attack", {
      sessionId,
      attackTypes,
      startTime: Date.now(),
    });

    this.startPolling(sessionId);
  }

  async stopBackgroundAttack(): Promise<void> {
    if (this.pollInterval !== undefined) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    await this.storageService.remove("graphql-analyzer-background-attack");
  }

  hasBackgroundAttack(): boolean {
    const stored = this.storageService.get<{
      sessionId: string;
      attackTypes: string[];
      startTime: number;
    }>("graphql-analyzer-background-attack");
    return stored !== undefined;
  }

  resumeBackgroundAttack(): void {
    const stored = this.storageService.get<{
      sessionId: string;
      attackTypes: string[];
      startTime: number;
    }>("graphql-analyzer-background-attack");
    if (stored !== undefined) {
      try {
        this.startPolling(stored.sessionId);
      } catch (error) {
        void this.storageService.remove("graphql-analyzer-background-attack");
      }
    }
  }

  getBackgroundAttackInfo():
    | { sessionId: string; attackTypes: string[]; startTime: number }
    | undefined {
    return this.storageService.get<{
      sessionId: string;
      attackTypes: string[];
      startTime: number;
    }>("graphql-analyzer-background-attack");
  }

  private startPolling(sessionId: string): void {
    let errorCount = 0;
    const maxErrors = 5;

    this.pollInterval = window.setInterval(async () => {
      try {
        const statusResult = await this.sdk.backend.getAttackStatus(sessionId);

        if (statusResult.kind === "Error") {
          errorCount++;

          if (errorCount >= maxErrors) {
            this.stopBackgroundAttack();
            this.sdk.window.showToast(
              `Attack monitoring stopped: ${statusResult.error}`,
              { variant: "error" },
            );
          }
          return;
        }

        errorCount = 0;

        const status = statusResult.value as {
          results?: Array<{ findings: Array<{ severity: string }> }>;
          progress?: number;
          isComplete?: boolean;
        };

        window.dispatchEvent(
          new CustomEvent("graphql-analyzer-attack-progress", {
            detail: {
              sessionId,
              status,
              progress: status.progress ?? 0,
              results: status.results ?? [],
            },
          }),
        );

        if (status.isComplete === true) {
          void this.stopBackgroundAttack();

          const results = status.results ?? [];
          const totalFindings = results.reduce(
            (sum: number, r: { findings: Array<{ severity: string }> }) =>
              sum + r.findings.length,
            0,
          );
          const criticalFindings = results.reduce(
            (sum: number, r: { findings: Array<{ severity: string }> }) =>
              sum +
              r.findings.filter(
                (f: { severity: string }) =>
                  f.severity === "critical" || f.severity === "high",
              ).length,
            0,
          );

          this.sdk.window.showToast(
            `GraphQL attacks completed! ${totalFindings} findings (${criticalFindings} critical/high)`,
            { variant: criticalFindings > 0 ? "warning" : "success" },
          );

          window.dispatchEvent(
            new CustomEvent("graphql-analyzer-attack-complete", {
              detail: {
                sessionId,
                status,
                totalFindings,
                criticalFindings,
              },
            }),
          );
        }
      } catch (error) {
        errorCount++;

        if (errorCount >= maxErrors) {
          void this.stopBackgroundAttack();
          this.sdk.window.showToast(
            `Attack monitoring stopped due to repeated errors`,
            { variant: "error" },
          );
        }
      }
    }, 2000);
  }

  static getInstance(sdk: FrontendSDK): BackgroundAttackService {
    if (BackgroundAttackService.instance === undefined) {
      BackgroundAttackService.instance = new BackgroundAttackService(sdk);
    }
    return BackgroundAttackService.instance;
  }
}

let backgroundAttackServiceInstance: BackgroundAttackService | undefined =
  undefined;

export function createBackgroundAttackService(
  sdk: FrontendSDK,
): BackgroundAttackService {
  if (backgroundAttackServiceInstance === undefined) {
    backgroundAttackServiceInstance = BackgroundAttackService.getInstance(sdk);
    backgroundAttackServiceInstance.resumeBackgroundAttack();
  }
  return backgroundAttackServiceInstance;
}
