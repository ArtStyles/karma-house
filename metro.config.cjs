const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const artifacts = path.join(__dirname, 'artifacts').replaceAll('\\', '/')
  .split('/').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]');
// Toolchains, APKs and exports are outputs, never app sources. Exclude them from
// both Expo's relative directory crawl and Metro's absolute file map. Windows
// watcher matching normalizes absolute paths to '/', unlike the initial crawl.
const previous = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
  /^artifacts(?:[\\/]|$)/,
  new RegExp(`^${artifacts}(?:[\\\\/]|$)`),
];

module.exports = config;
