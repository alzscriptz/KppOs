#!/usr/bin/env python3
"""Build kahOS as a Debian Live ISO with a lightweight XFCE host shell."""

from __future__ import annotations

import argparse
import gzip
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "build" / "live-build-work"
OUTPUT = ROOT / "dist" / "kahOS-amd64.iso"
BRAVE_KEY_URL = "https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg"
BRAVE_REPOSITORY = "deb [arch=amd64 signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg] https://brave-browser-apt-release.s3.brave.com/ stable main\n"
DEBIAN_SECURITY_REPOSITORY = "deb http://security.debian.org/debian-security trixie-security main contrib non-free non-free-firmware\n"


def run(command: list[str], *, cwd: Path | None = None) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def wsl_build() -> int:
    wsl = shutil.which("wsl.exe") or shutil.which("wsl")
    if not wsl:
        raise SystemExit("A Linux build host is required. Use the GitHub Actions build, or install WSL2 with a Linux distribution first.")
    result = subprocess.run([wsl, "--list", "--quiet"], capture_output=True, text=True)
    distros = [line.strip().replace("\x00", "") for line in result.stdout.splitlines() if line.strip().replace("\x00", "")]
    distro = os.environ.get("KPPOS_WSL_DISTRO") or (distros[0] if distros else None)
    if result.returncode or not distro:
        raise SystemExit("WSL is present but no Linux distribution is installed. Use the GitHub Actions build or install Ubuntu in WSL2.")
    linux_root = subprocess.run([wsl, "-d", distro, "--exec", "wslpath", "-a", str(ROOT)], capture_output=True, text=True, check=True).stdout.strip()
    command = [wsl, "-d", distro, "-u", "root", "--", "python3", f"{linux_root}/build/build.py", "--inside-linux"]
    return subprocess.run(command, check=False).returncode


def create_live_build_config() -> None:
    if not shutil.which("lb"):
        raise SystemExit("live-build is missing. Install Debian live-build, xorriso, debootstrap, and squashfs-tools.")
    if os.geteuid() != 0:
        raise SystemExit("live-build needs root privileges. Run with sudo on Linux; the GitHub workflow does this automatically.")

    package_lists = WORK / "config" / "package-lists"
    archives = WORK / "config" / "archives"
    local_packages = WORK / "config" / "packages.chroot"
    includes = WORK / "config" / "includes.chroot"
    package_lists.mkdir(parents=True, exist_ok=True)
    archives.mkdir(parents=True, exist_ok=True)
    local_packages.mkdir(parents=True, exist_ok=True)

    browser_key = urllib.request.urlopen(BRAVE_KEY_URL, timeout=60).read()
    # Resolve Brave from its signed repository metadata, then let live-build
    # install this local package while Debian apt resolves its dependencies.
    # This avoids relying on live-build to index a third-party apt source.
    packages_index = urllib.request.urlopen(
        "https://brave-browser-apt-release.s3.brave.com/dists/stable/main/binary-amd64/Packages.gz",
        timeout=120,
    ).read()
    brave_package = next(
        (
            block
            for block in gzip.decompress(packages_index).decode("utf-8").split("\n\n")
            if "Package: brave-browser\n" in block and "Architecture: amd64\n" in block
        ),
        None,
    )
    if brave_package is None:
        raise SystemExit("Brave repository metadata has no amd64 brave-browser package.")
    package_filename = next(
        (line.split(": ", 1)[1] for line in brave_package.splitlines() if line.startswith("Filename: ")),
        None,
    )
    if not package_filename:
        raise SystemExit("Brave package metadata has no download path.")
    brave_deb = local_packages / "brave-browser.deb"
    with urllib.request.urlopen(
        "https://brave-browser-apt-release.s3.brave.com/" + package_filename, timeout=180
    ) as response, brave_deb.open("wb") as package_file:
        shutil.copyfileobj(response, package_file)

    (archives / "brave.key.chroot").write_bytes(browser_key)
    (archives / "brave.key.binary").write_bytes(browser_key)
    (archives / "brave.list.chroot").write_text(BRAVE_REPOSITORY, encoding="utf-8")
    (archives / "brave.list.binary").write_text(BRAVE_REPOSITORY, encoding="utf-8")
    # Ubuntu's bundled live-build defaults to the obsolete Debian security
    # suite name `trixie/updates`; supply Debian 13's current suite directly.
    for suffix in ("chroot", "binary"):
        (archives / f"debian-security.list.{suffix}").write_text(DEBIAN_SECURITY_REPOSITORY, encoding="utf-8")

    # live-build runs apt in a minimal chroot before it installs ca-certificates.
    # Seed the runner's trusted roots so HTTPS package sources can validate.
    host_ca_bundle = Path("/etc/ssl/certs/ca-certificates.crt")
    if host_ca_bundle.is_file():
        ca_bundle = includes / "etc" / "ssl" / "certs" / "ca-certificates.crt"
        ca_bundle.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(host_ca_bundle, ca_bundle)

    # Block the sysvinit live-config flavour so apt cannot choose it over systemd.
    preferences = includes / "etc" / "apt" / "preferences.d" / "no-sysvinit.pref"
    preferences.parent.mkdir(parents=True, exist_ok=True)
    preferences.write_text(
        "Package: live-config-sysvinit sysvinit-core initscripts sysv-rc\n"
        "Pin: release *\n"
        "Pin-Priority: -1\n",
        encoding="utf-8",
    )

    # systemd init only — do not list the live-config meta package, which can
    # still resolve to the sysvinit flavour during lb_chroot_live-packages.
    packages = """\
linux-image-amd64
live-boot
live-config-systemd
systemd-sysv
xserver-xorg
xfce4-session
xfce4-panel
xfdesktop4
xfwm4
xfce4-settings
lightdm
lightdm-gtk-greeter
network-manager
network-manager-gnome
dbus-x11
thunar
thunar-volman
xfce4-terminal
xfce4-appfinder
polkitd
mousepad
debian-installer-launcher
sudo
fonts-dejavu-core
fonts-noto-color-emoji
firmware-linux-free
"""
    (package_lists / "kahos.list.chroot").write_text(packages, encoding="utf-8")

    shell_root = includes / "usr" / "share" / "kahos"
    shutil.copytree(ROOT / "kwww", shell_root / "kwww", dirs_exist_ok=True)
    shutil.copytree(ROOT / "assets", shell_root / "assets", dirs_exist_ok=True)
    keyring = includes / "usr" / "share" / "keyrings" / "brave-browser-archive-keyring.gpg"
    keyring.parent.mkdir(parents=True, exist_ok=True)
    keyring.write_bytes(browser_key)

    autostart = includes / "etc" / "skel" / ".config" / "autostart" / "kahos-desktop.desktop"
    autostart.parent.mkdir(parents=True, exist_ok=True)
    autostart.write_text(
        """[Desktop Entry]\nType=Application\nName=kahOS Desktop\nComment=Start the kahOS desktop preview\n"""
        "Exec=brave-browser --kiosk --no-first-run --disable-session-crashed-bubble "
        "--user-data-dir=/home/user/.config/kahos-browser file:///usr/share/kahos/kwww/index.html\n"
        "X-GNOME-Autostart-enabled=true\n",
        encoding="utf-8",
    )
    lightdm = includes / "etc" / "lightdm" / "lightdm.conf.d" / "50-kahos-autologin.conf"
    lightdm.parent.mkdir(parents=True, exist_ok=True)
    lightdm.write_text(
        "[Seat:*]\nautologin-user=user\nautologin-user-timeout=0\nautologin-session=xfce\n",
        encoding="utf-8",
    )


def validate() -> None:
    """Fast source/config checks used by Kclone's Build Center."""
    required = [
        ROOT / "KCLONE.json",
        ROOT / "system" / "os.json",
        ROOT / "boot" / "boot.json",
        ROOT / "kwww" / "index.html",
        ROOT / "assets",
        ROOT / "scripts" / "upload_iso_gofile.py",
        ROOT / ".github" / "workflows" / "build-iso.yml",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    if missing:
        raise SystemExit("Missing required project files: " + ", ".join(missing))
    try:
        import json
        json.loads((ROOT / "KCLONE.json").read_text(encoding="utf-8"))
        json.loads((ROOT / "system" / "os.json").read_text(encoding="utf-8"))
        json.loads((ROOT / "boot" / "boot.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SystemExit(f"Invalid project JSON: {exc}") from exc
    if OUTPUT.exists():
        print(f"Existing ISO: {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
    print("Validation passed. ISO builds on Debian/Ubuntu Linux or GitHub Actions; Windows requires WSL2.")


def build_linux() -> None:
    create_live_build_config()
    WORK.mkdir(parents=True, exist_ok=True)
    config = [
        "lb", "config", "--mode", "debian", "--distribution", "trixie", "--architectures", "amd64",
        "--security", "false",
        "--initsystem", "systemd",
        "--binary-images", "iso-hybrid", "--debian-installer", "live",
        "--archive-areas", "main contrib non-free non-free-firmware",
        "--iso-application", "kahOS Live Desktop", "--iso-volume", "KAHOS_LIVE",
        "--bootappend-live", "boot=live components quiet splash",
    ]
    run(config, cwd=WORK)
    run(["lb", "build"], cwd=WORK)

    iso = WORK / "live-image-amd64.hybrid.iso"
    if not iso.is_file() or iso.stat().st_size < 64 * 1024 * 1024:
        raise SystemExit("live-build returned without a plausible bootable ISO.")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(iso, OUTPUT)
    digest = subprocess.run(["sha256sum", str(OUTPUT)], capture_output=True, text=True, check=True).stdout.split()[0]
    OUTPUT.with_suffix(OUTPUT.suffix + ".sha256").write_text(f"{digest}  {OUTPUT.name}\n", encoding="ascii")
    print(f"ISO ready: {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
    print(f"SHA-256: {digest}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inside-linux", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--validate", action="store_true", help="validate project inputs without building")
    args = parser.parse_args()
    if args.validate:
        validate()
        return 0
    if os.name == "nt" and not args.inside_linux:
        return wsl_build()
    if sys.platform != "linux":
        raise SystemExit("The ISO recipe must run on Linux or in WSL2.")
    build_linux()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
