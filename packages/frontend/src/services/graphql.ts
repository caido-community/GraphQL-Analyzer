import { type Result } from "backend";

import { type FrontendSDK } from "../types";

export class GraphQLService {
  private sdk: FrontendSDK;

  constructor(sdk: FrontendSDK) {
    this.sdk = sdk;
  }

  async testGraphQLEndpoint(url: string): Promise<Result<{ supportsIntrospection: boolean; schema?: any }>> {
    return await this.sdk.backend.testGraphQLEndpoint(url);
  }
}

export const useGraphQLService = (sdk: FrontendSDK) => {
  return new GraphQLService(sdk);
};
