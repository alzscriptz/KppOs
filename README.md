# kahOS

KppOs is the source repository for kahOS: a lightweight macOS Tahoe-inspired desktop shell, packaged as an installable Debian Live ISO.

## What the first ISO contains

- Debian 13 (trixie), an amd64 Linux kernel, GRUB live boot, and the Debian Live installer launcher.
- A small XFCE desktop, Thunar file manager, and Brave Browser.
- The existing kahOS HTML/CSS/JavaScript desktop launched full-screen from Brave.
- A default live session configured for 3 GB RAM and 2 CPU cores in Kclone.

The visual shell provides the menu bar, dock, Finder-style file browser, Settings, Wave player, Photos, and Dynamic Island-style media controls. Those shell apps remain browser-based prototypes. They do not implement Apple Account/iCloud services, native macOS applications, real Windows `.exe` compatibility, or native OS-level Live Activities. The ISO is a Debian-based Linux system with the kahOS desktop shell, not Apple's macOS.

## Build and upload

The supported ISO build uses Debian `live-build`. It runs on Linux or WSL2 with `live-build`, `debootstrap`, `xorriso`, `squashfs-tools`, and GRUB tools installed.

On Windows, the recommended route is the GitHub Actions workflow: open **Actions → Build kahOS ISO and upload to GoFile → Run workflow**. Before running it, add the GoFile API token as the repository Actions secret `GOFILE_API_TOKEN`. The workflow creates `dist/kahOS-amd64.iso`, streams it to GoFile, and prints the download page link in the run summary. ISO files and build output are excluded from Git; the workflow does not use GitHub Actions artifacts.

To build on Linux/WSL2:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates debootstrap live-build xorriso squashfs-tools grub-pc-bin grub-efi-amd64-bin mtools gpg curl
sudo python3 build/build.py --inside-linux
```

To upload an existing ISO manually, set `GOFILE_API_TOKEN` in the process environment and run:

```sh
python3 scripts/upload_iso_gofile.py --path dist/kahOS-amd64.iso
```

The API token is never stored in the repository. See the [GoFile API documentation](https://gofile.io/api) for current authentication, storage, and traffic terms.
