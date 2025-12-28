import type { FrontendSDK } from "../types";

/**
 * Background Attack Service for managing attacks that run even when user navigates away
 */
export class BackgroundAttackService {
  private sdk: FrontendSDK;
  private pollInterval: number | null = null;
  private static instance: BackgroundAttackService | null = null;

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  /**
   * Start background polling for an attack session
   */
  startBackgroundAttack(sessionId: string, attackTypes: string[]): void {
    // Stop any existing polling
    this.stopBackgroundAttack();

    // Store attack info for persistence across page reloads
    localStorage.setItem(
      "graphql-analyzer-background-attack",
      JSON.stringify({
        sessionId,
        attackTypes,
        startTime: Date.now(),
      }),
    );

    // Start polling
    this.startPolling(sessionId);
  }

  /**
   * Stop background attack polling
   */
  stopBackgroundAttack(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    localStorage.removeItem("graphql-analyzer-background-attack");
  }

  /**
   * Check if there's a background attack running
   */
  hasBackgroundAttack(): boolean {
    return !!localStorage.getItem("graphql-analyzer-background-attack");
  }

  /**
   * Resume background attack if one exists (for page reloads)
   */
  resumeBackgroundAttack(): void {
    const stored = localStorage.getItem("graphql-analyzer-background-attack");
    if (stored) {
      try {
        const attackInfo = JSON.parse(stored);
        this.startPolling(attackInfo.sessionId);
      } catch (error) {
        // Invalid stored data, clean up
        localStorage.removeItem("graphql-analyzer-background-attack");
      }
    }
  }

  /**
   * Get background attack info
   */
  getBackgroundAttackInfo(): any | null {
    const stored = localStorage.getItem("graphql-analyzer-background-attack");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  /**
   * Private polling logic
   */
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
              progress: status.progress || 0,
              results: status.results || [],
            },
          }),
        );

        if (status.isComplete) {
          this.stopBackgroundAttack();

          const results = status.results || [];
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

  /**
   * Get singleton instance
   */
  static getInstance(sdk: FrontendSDK): BackgroundAttackService {
    if (!BackgroundAttackService.instance) {
      BackgroundAttackService.instance = new BackgroundAttackService(sdk);
    }
    return BackgroundAttackService.instance;
  }
}

/**
 * Create and export singleton instance
 */
let backgroundAttackServiceInstance: BackgroundAttackService | null = null;

export function createBackgroundAttackService(
  sdk: FrontendSDK,
): BackgroundAttackService {
  if (!backgroundAttackServiceInstance) {
    backgroundAttackServiceInstance = BackgroundAttackService.getInstance(sdk);
    // Auto-resume any background attacks on service creation
    backgroundAttackServiceInstance.resumeBackgroundAttack();
  }
  return backgroundAttackServiceInstance;
}

export { backgroundAttackServiceInstance as backgroundAttackService };
