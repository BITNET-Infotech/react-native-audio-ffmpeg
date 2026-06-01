const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '..');

/**
 * Metro config for the example app.
 *
 * Key settings:
 *  - watchFolders: also watch the library root so live edits to the lib
 *    are reflected immediately without re-installing.
 *  - resolver.extraNodeModules: when the lib does `require('react-native')`,
 *    resolve it from THIS app's node_modules, not the lib's (which has none).
 */
const config = {
  watchFolders: [root],

  resolver: {
    extraNodeModules: new Proxy(
      {},
      {
        get: (_, name) =>
          path.join(__dirname, 'node_modules', name),
      }
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
