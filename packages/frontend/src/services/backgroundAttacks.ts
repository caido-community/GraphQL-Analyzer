import type { FrontendSDK } from "../types";

export class BackgroundAttackService {
  private sdk: FrontendSDK;
  private pollInterval: number | undefined = undefined;
  private static instance: BackgroundAttackService | undefined = undefined;

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  startBackgroundAttack(sessionId: string, attackTypes: string[]): void {
    this.stopBackgroundAttack();

    localStorage.setItem(
      "graphql-analyzer-background-attack",
      JSON.stringify({
        sessionId,
        attackTypes,
        startTime: Date.now(),
      }),
    );

    this.startPolling(sessionId);
  }

  stopBackgroundAttack(): void {
    if (this.pollInterval !== undefined) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    localStorage.removeItem("graphql-analyzer-background-attack");
  }

  hasBackgroundAttack(): boolean {
    const stored = localStorage.getItem("graphql-analyzer-background-attack");
    return stored !== null && stored !== "";
  }

  resumeBackgroundAttack(): void {
    const stored = localStorage.getItem("graphql-analyzer-background-attack");
    if (stored !== null && stored !== "") {
      try {
        const attackInfo = JSON.parse(stored) as {
          sessionId: string;
          attackTypes: string[];
          startTime: number;
        };
        this.startPolling(attackInfo.sessionId);
      } catch (error) {
        localStorage.removeItem("graphql-analyzer-background-attack");
      }
    }
  }

  getBackgroundAttackInfo():
    | { sessionId: string; attackTypes: string[]; startTime: number }
    | undefined {
    const stored = localStorage.getItem("graphql-analyzer-background-attack");
    if (stored !== null && stored !== "") {
      try {
        return JSON.parse(stored) as {
          sessionId: string;
          attackTypes: string[];
          startTime: number;
        };
      } catch (error) {
        return undefined;
      }
    }
    return undefined;
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
          this.stopBackgroundAttack();

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
          this.stopBackgroundAttack();
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
