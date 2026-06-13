// Expo entry point. The app lives in client/App.tsx; this registers it as the
// root component. package.json "main" points here, replacing Expo's default
// node_modules/expo/AppEntry.js (which expects an App module at the project
// root — this repo's app is under client/). CommonJS to match the repo's
// eslint rule for root *.js files (see eslint.config.js).
const { registerRootComponent } = require("expo");
const App = require("./client/App").default;

registerRootComponent(App);
