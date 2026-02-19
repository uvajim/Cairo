// metro.config.js
// Required for @walletconnect/modal-react-native to resolve its package
// exports correctly. Without unstable_enablePackageExports the Metro bundler
// cannot find the WalletConnect internal modules.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['require', 'react-native'];

module.exports = config;
