const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.maxWorkers = 2;
config.cacheStores = ({ FileStore }) => [
  new FileStore({ root: path.join(__dirname, '.metro-cache') }),
];

module.exports = config;
