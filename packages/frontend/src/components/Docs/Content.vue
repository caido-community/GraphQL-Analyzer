<script setup lang="ts">
import Button from "primevue/button";

import { useSDK } from "@/plugins/sdk";

const sdk = useSDK();

// Copy functions for footer
const copyToClipboard = async (text: string, successMessage: string) => {
  try {
    await navigator.clipboard.writeText(text);
    sdk.window.showToast(successMessage, { variant: "success" });
  } catch (error) {
    sdk.window.showToast("Failed to copy to clipboard", { variant: "error" });
  }
};

const copyGitHubUrl = () => {
  copyToClipboard(
    "https://github.com/amrelsagaei/GraphQL-Analyzer",
    "GitHub URL copied successfully!",
  );
};

const copyAuthorWebsite = () => {
  copyToClipboard(
    "https://amrelsagaei.com",
    "Website link copied successfully!",
  );
};

const copyAuthorEmail = () => {
  copyToClipboard("info@amrelsagaei.com", "Email copied successfully!");
};

const copyTwitter = () => {
  copyToClipboard(
    "https://x.com/amrelsagaei",
    "X profile copied successfully!",
  );
};
</script>

<template>
  <div class="max-w-3xl space-y-12 pb-[36rem]">
    <section id="getting-started">
      <h2 class="text-2xl font-semibold mb-4">Getting Started</h2>
      <p class="text-surface-300 leading-relaxed mb-4">
        To get started with GraphQL Analyzer, you have two main paths depending
        on your goal:
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-3">
            Option 1: Schema Discovery (Explorer)
          </h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            If you want to explore and understand a GraphQL schema:
          </p>
          <ol class="list-decimal list-inside space-y-2 text-surface-300 ml-4">
            <li>Right-click on any request in Caido's HTTP History</li>
            <li>Select "Scan GraphQL Endpoint" from the context menu</li>
            <li>
              Navigate to the Explorer tab to browse the discovered schema
            </li>
            <li>Use the Voyager tab to visualize schema relationships</li>
          </ol>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-3">
            Option 2: Security Testing (Attacks)
          </h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            If you want to test GraphQL endpoints for security vulnerabilities:
          </p>
          <ol class="list-decimal list-inside space-y-2 text-surface-300 ml-4">
            <li>Right-click on any request in Caido's HTTP History</li>
            <li>Select "Attack GraphQL Endpoint" from the context menu</li>
            <li>Configure your attack parameters in the Attacks tab</li>
            <li>Review findings and export results to Caido Replay</li>
          </ol>
          <p class="text-surface-300 text-sm mt-3">
            You can also manually scan URLs using the Dashboard's scan form, or
            work with previously discovered sessions across all tabs.
          </p>
        </div>
      </div>
    </section>

    <section id="schema-discovery">
      <h2 class="text-2xl font-semibold mb-4">Schema Discovery</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        The Explorer tab is your main workspace for GraphQL schema discovery and
        analysis. Here's how to make the most of it:
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Schema Introspection</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            GraphQL Analyzer automatically performs introspection queries to
            discover the complete schema structure. This reveals:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>All available queries, mutations, and subscriptions</li>
            <li>Field types, arguments, and documentation</li>
            <li>Custom scalar types and enums</li>
            <li>Input types and their relationships</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Session Management</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Each discovered endpoint creates a session tab that you can:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Rename by double-clicking the tab name</li>
            <li>Delete by right-clicking and selecting delete</li>
            <li>Switch between to compare different schemas</li>
          </ul>
          <p class="text-surface-300 text-sm mt-3">
            Sessions are automatically saved and restored when you restart
            Caido, so your work is never lost.
          </p>
        </div>
      </div>
    </section>

    <section id="schema-visualization">
      <h2 class="text-2xl font-semibold mb-4">Schema Visualization</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        The Voyager tab provides an interactive graph visualization of your
        GraphQL schema, making it easy to understand complex relationships.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Navigation and Interaction</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            The graph interface allows you to:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Zoom in and out to focus on specific areas</li>
            <li>Pan around to explore large schemas</li>
            <li>Click on type nodes to see detailed information</li>
            <li>Follow connections to understand data flow</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Understanding the Graph</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            The visualization shows:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>
              Types as nodes with different colors for queries, mutations,
              objects
            </li>
            <li>Relationships as connecting lines between types</li>
            <li>Field details when you hover over or click nodes</li>
          </ul>
          <p class="text-surface-300 text-sm mt-3">
            You must have at least one session in Explorer before using Voyager.
            Select a session to visualize its schema.
          </p>
        </div>
      </div>
    </section>

    <section id="security-testing">
      <h2 class="text-2xl font-semibold mb-4">Security Testing</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        The Attacks tab provides comprehensive security testing for GraphQL
        endpoints. Here's how to conduct effective security assessments:
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Available Attack Types</h3>
          <ul class="list-disc list-inside space-y-2 text-surface-300 ml-4">
            <li>
              <strong>Schema Introspection:</strong> Tests if introspection is
              enabled (security risk if exposed in production)
            </li>
            <li>
              <strong>Query Depth Limit:</strong> Attempts deeply nested queries
              to test depth restrictions
            </li>
            <li>
              <strong>Query Complexity:</strong> Tests for query complexity
              analysis and limits
            </li>
            <li>
              <strong>Batch Query Limit:</strong> Sends multiple queries in
              batches to test rate limiting
            </li>
            <li>
              <strong>Field Suggestion:</strong> Tests if error messages reveal
              schema information
            </li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Attack Configuration</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Before running attacks, configure:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Maximum query depth for testing (default: 10)</li>
            <li>Batch size for batch query tests (default: 10)</li>
            <li>Custom headers for authentication</li>
            <li>Target endpoint (from context menu, URL, or session)</li>
          </ul>
          <p class="text-surface-300 text-sm mt-3">
            Only test endpoints you own or have explicit permission to test.
            Attacks run in the background, allowing navigation to other tabs.
          </p>
        </div>
      </div>
    </section>

    <section id="attack-results">
      <h2 class="text-2xl font-semibold mb-4">Attack Results</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        After running security tests, the results table provides detailed
        information about findings and allows you to take action on discovered
        vulnerabilities.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Results Table</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            The findings table shows:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Attack type and target URL</li>
            <li>HTTP status codes and response timing</li>
            <li>Number of findings with severity indicators</li>
            <li>High-severity finding counts for quick prioritization</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Available Actions</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            For each result, you can:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>
              <strong>Replay Button (🔄):</strong> Send the request to Caido
              Replay for manual testing
            </li>
            <li>
              <strong>Create Finding (+):</strong> Add the finding to Caido's
              findings database
            </li>
            <li>
              <strong>View Details:</strong> Examine request/response data and
              payloads
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section id="advanced-features">
      <h2 class="text-2xl font-semibold mb-4">Advanced Features</h2>
      <p class="text-surface-300 leading-relaxed mb-6">
        GraphQL Analyzer includes several advanced features for power users and
        complex testing scenarios.
      </p>

      <div class="space-y-4">
        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Context Menu Integration</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Right-click any request in Caido to access:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Quick scan to Explorer for schema discovery</li>
            <li>Direct attack launch with pre-filled request data</li>
            <li>Automatic endpoint detection and URL construction</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Session Management</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Advanced session features include:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Multiple concurrent attack sessions</li>
            <li>Session history and result persistence</li>
            <li>Cross-tab data sharing between Explorer and Attacks</li>
            <li>Automatic session restoration on restart</li>
          </ul>
        </div>

        <div class="border border-surface-700 rounded p-4">
          <h3 class="text-lg font-semibold mb-2">Integration with Caido</h3>
          <p class="text-surface-300 leading-relaxed mb-3">
            Seamless integration includes:
          </p>
          <ul class="list-disc list-inside space-y-1 text-surface-300 ml-4">
            <li>Export findings to Caido's findings system</li>
            <li>Send requests to Replay for manual testing</li>
            <li>Custom header support for authentication</li>
            <li>Background processing without blocking the UI</li>
          </ul>
          <p class="text-surface-300 text-sm mt-3">
            GraphQL Analyzer is optimized for minimal impact on Caido's
            performance, even during intensive testing.
          </p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <section id="footer" class="pt-8 border-t border-surface-700">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="text-sm text-surface-400">GraphQL Analyzer</span>
          <Button
            icon="fab fa-github"
            label="Star on GitHub"
            severity="secondary"
            outlined
            size="small"
            @click="copyGitHubUrl"
          />
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-xs text-surface-500"
              >Made with <i class="fas fa-heart text-red-400"></i> by</span
            >
            <button
              class="text-xs text-primary-400 hover:text-primary-300 transition-colors cursor-pointer font-medium"
              @click="copyAuthorWebsite"
            >
              Amr Elsagaei
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="text-xs text-surface-400 hover:text-primary-400 transition-colors cursor-pointer flex items-center gap-1"
              @click="copyAuthorEmail"
            >
              <i class="fas fa-envelope"></i>
              <span>Email</span>
            </button>
            <button
              class="text-xs text-surface-400 hover:text-primary-400 transition-colors cursor-pointer flex items-center gap-1"
              @click="copyTwitter"
            >
              <i class="fab fa-x-twitter"></i>
              <span>Twitter</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
