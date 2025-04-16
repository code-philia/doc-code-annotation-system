const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    extraResource: '../../build',
    icon: './resources/folder-1485.ico',
    ignore: ['release']   // NOTE will first package then make with --prepackaged, only ignore here is effective
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@rabbitholesyndrome/electron-forge-maker-portable",
      config: {
        directories: {
          buildResources: "resources",
          output: "release"
        },
        win: {
          icon: './resources/folder-1485.ico'
        }
      }
    },
    // {
    //   name: '@electron-forge/maker-squirrel',
    //   config: {},
    // },
    // {
    //   name: '@electron-forge/maker-zip',
    //   platforms: ['darwin'],
    // },
    // {
    //   name: '@electron-forge/maker-deb',
    //   config: {},
    // },
    // {
    //   name: '@electron-forge/maker-rpm',
    //   config: {},
    // }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
