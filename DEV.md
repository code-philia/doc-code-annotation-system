# For Developers

## How to package the Electron App

Run the command in `frontend/configs/electron` to package for different architectures:

Architecture: x64 (64-bit)   Platform: win32

```bash
npx cross-env ELECTRON_GET_USE_PROXY=true GLOBAL_AGENT_HTTPS_PROXY=your_proxy_address electron-forge package
```

Architecture: ia32 (32-bit)  Platform: win32

<https://github.com/electron/forge/issues/3342>

```bash
npx cross-env ELECTRON_GET_USE_PROXY=true GLOBAL_AGENT_HTTPS_PROXY=your_proxy_address electron-forge package --arch="ia32" --platform=win32
```
