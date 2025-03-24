const webpack = require('webpack');

module.exports = function override(config, env) {
  // 添加 Node polyfills
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "http": require.resolve("stream-http"),
    "https": require.resolve("https-browserify"),
    "stream": require.resolve("stream-browserify"),
    "url": require.resolve("url"),
    "assert": require.resolve("assert"),
    "buffer": require.resolve("buffer"),
    "process/browser": require.resolve("process/browser"),
    "process": require.resolve("process/browser"),
  };

  // 添加插件
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  config.devtool = 'eval-cheap-module-source-map';

  return config;
}; 