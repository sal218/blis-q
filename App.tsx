// Expo entry point. The app lives in client/App.tsx; Expo's default entry
// (node_modules/expo/AppEntry.js) imports `App` from the project root and calls
// registerRootComponent, so this re-export wires the two together. Keeping the
// real app under client/ matches the repo's @/* path layout.
export { default } from "./client/App";
