import Constants, { ExecutionEnvironment } from "expo-constants";

// True when running inside Expo Go (the "store client"), where custom native
// modules — MapLibre, Google Sign-In, etc. — are NOT bundled and throw on
// evaluation. Features that depend on such a module must guard on this and
// degrade (show a message / no-op) instead of crashing. Mirrors the runtime
// check in lib/googleAuth.ts. In a dev-client / EAS / standalone build this is
// false and the native feature runs normally.
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}
