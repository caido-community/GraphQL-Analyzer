import { type DefineEvents, type SDK } from "caido:plugin";

import { type API } from ".";

export type BackendSDK = SDK<API, BackendEvents>;

export type BackendEvents = DefineEvents<{
  "attack:started": (sessionId: string) => void;
  "attack:progress": (sessionId: string, progress: number) => void;
  "attack:completed": (sessionId: string) => void;
  "attack:cancelled": (sessionId: string) => void;
}>;
