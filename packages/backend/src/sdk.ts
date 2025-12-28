import { type BackendSDK } from "./types";

// @ts-expect-error - Variable is intentionally unused but kept for future use
let _sdk: BackendSDK | undefined;

export function setSDK(sdk: BackendSDK): void {
  _sdk = sdk;
}
