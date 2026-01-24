import { type DefineEvents } from "caido:plugin";

export type BackendEvents = DefineEvents<{
  "attack:started": (sessionId: string) => void;
  "attack:progress": (sessionId: string, progress: number) => void;
  "attack:completed": (sessionId: string) => void;
  "attack:cancelled": (sessionId: string) => void;
}>;
