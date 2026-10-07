# kahOS desktop prototype

kahOS now has a small, browser-rendered desktop shell in `kwww/`. It is a visual and interaction prototype, not a native operating system: the project does not yet include a kernel, device drivers, or a native bootloader. The ISO build script stages the desktop files, but a real bootable ISO still needs those native components and an ISO creation tool.

## Included

- A short startup sequence and macOS Tahoe-inspired glass desktop styling.
- A simplified desktop without the weekday/date tile; the menu-bar clock remains, and battery is shown beside Wi-Fi.
- The supplied kahOS logo and dark wallpaper.
- A top-center Dynamic Island-style live activity with previous/play/next track controls, progress, and a countdown timer.
- A virtual Finder with locations, app shortcuts, item selection, and search.
- Brave Search shortcut, Notes, Calendar, Photos, Wave, System Settings, and Terminal preview.
- Wave is an ad-free local audio player with multi-file import, library search, liked tracks, seek, volume, and Dynamic Island playback controls. It does not stream a hosted catalog; imported files currently last for the browser session.
- Photos includes a built-in wallpaper album plus a local image importer and full-size viewer. Imported photo previews stay in memory for that window session and their object URLs are released when it closes. Wallpaper choices, saved Notes text, menu-bar clock, Control Center, and dock.
- A broad System Settings sidebar for connectivity, alerts, devices, accounts, privacy, and personalization, with preview controls for local preferences.
- Appearance controls for Light, Dark, and Auto; accent colors; and a persistent Liquid Glass slider with a live desktop preview. The low end uses nearly opaque, unblurred surfaces; the high end stays tinted and readable.
- Three selectable Terminal preview profiles: macOS-style zsh, Windows PowerShell, and Linux bash. Commands are simulated and cannot execute programs.
- Static HTML, CSS, SVG icons, and vanilla JavaScript; no runtime framework or remote font dependency.

## Open the desktop

Open `kwww/index.html` in a modern browser. Brave Browser in this prototype opens Brave Search in a new tab using the system's current default browser; it does not install the native Brave application.

The supplied wallpaper is 588 × 392 pixels, so the default image is not 4K. Additional bundled wallpapers are lightweight CSS gradients. Apple’s official [WWDC26 wallpaper page](https://developer.apple.com/wwdc26/wallpaper/) provides its current Mac wallpaper download; the high-resolution files are not bundled in this project.

System Settings controls are a desktop prototype and do not change host-device settings. The user has approved moving to ISO work, but a bootable image cannot be produced yet: the project has no kernel, initrd, or GRUB configuration, and this machine has no ISO authoring utility. `build/build.py` now stops unless the required boot files are present. The browser preview is not a bootable OS.

## Native OS roadmap

- Actual Apple Account/iCloud sign-in and supported iCloud-backed apps.
- A native app framework and installed app catalog.
- An OS-level Live Activities service behind the Dynamic Island UI.
- Native terminal sessions for the three profiles; current profiles only simulate common commands.
- Evaluate Windows `.exe` support through a compatibility layer. Wine demonstrates that a compatibility layer can run some Windows programs on Unix-like systems, but support varies by application and it is not included in this preview ([WineHQ](https://www.winehq.org/about)).
