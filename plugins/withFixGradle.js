const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withFixGradle(config) {
  return withAppBuildGradle(config, (config) => {
    // Remove any null NDK path references that cause getAbsolutePath() crash
    config.modResults.contents = config.modResults.contents.replace(
      /ndkPath\s*=\s*[^\n]*null[^\n]*/g,
      ''
    );
    return config;
  });
};