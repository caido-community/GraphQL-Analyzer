import { type BackendSDK } from "./types";

// SDK is stored for potential future use, but currently all functions receive SDK as parameter
// @ts-expect-error - Variable is intentionally unused but kept for future use
let _sdk: BackendSDK | undefined;

export function setSDK(sdk: BackendSDK): void {
  _sdk = sdk;
}
