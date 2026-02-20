/**
 * Platform detection utilities
 */

import fs from 'node:fs'
import os from 'node:os'

export type Platform = 'darwin' | 'win32' | 'linux' | 'other'

export function getPlatform(): Platform {
  const platform = os.platform()
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
    return platform
  }
  return 'other'
}

export function isWindows(): boolean {
  return os.platform() === 'win32'
}

export function isMac(): boolean {
  return os.platform() === 'darwin'
}

export function isLinux(): boolean {
  return os.platform() === 'linux'
}

/** Get default editor for platform */
export function getDefaultEditor(): string {
  return process.env.EDITOR ?? (isWindows() ? 'notepad' : 'vi')
}

/** Get shell config file for platform */
export function getShellConfigFile(): string {
  if (isMac() || isLinux()) {
    return process.env.SHELL?.includes('zsh') ? '~/.zshrc' : '~/.bashrc'
  }
  return ''
}

export type LinuxDistro = 'debian' | 'fedora' | 'arch' | 'alpine' | 'suse' | 'unknown'

/**
 * Detect Linux distribution family by reading /etc/os-release.
 * Returns 'unknown' on non-Linux or unrecognized distro.
 */
export function getLinuxDistro(): LinuxDistro {
  if (!isLinux()) return 'unknown'

  try {
    const content = fs.readFileSync('/etc/os-release', 'utf8')
    const id = content.match(/^ID=["']?([^"'\n]+)/m)?.[1]?.toLowerCase() ?? ''
    const idLike = content.match(/^ID_LIKE=["']?([^"'\n]+)/m)?.[1]?.toLowerCase() ?? ''

    // Debian family: Ubuntu, Mint, Pop!_OS, Elementary, Zorin, etc.
    const debianIds = ['debian', 'ubuntu', 'linuxmint', 'pop', 'elementary', 'zorin', 'kali']
    if (debianIds.includes(id) || idLike.includes('debian') || idLike.includes('ubuntu')) {
      return 'debian'
    }

    // Fedora family: RHEL, CentOS, Rocky, Alma, Nobara, etc.
    const fedoraIds = ['fedora', 'rhel', 'centos', 'rocky', 'almalinux', 'nobara']
    if (fedoraIds.includes(id) || idLike.includes('fedora') || idLike.includes('rhel')) {
      return 'fedora'
    }

    // Arch family: Manjaro, EndeavourOS, Garuda, etc.
    const archIds = ['arch', 'manjaro', 'endeavouros', 'garuda', 'artix']
    if (archIds.includes(id) || idLike.includes('arch')) {
      return 'arch'
    }

    // Alpine
    if (id === 'alpine') return 'alpine'

    // SUSE family: openSUSE Leap, Tumbleweed, etc.
    const suseIds = ['opensuse', 'suse', 'opensuse-leap', 'opensuse-tumbleweed']
    if (suseIds.includes(id) || idLike.includes('suse')) {
      return 'suse'
    }
  } catch {
    // /etc/os-release not available
  }

  return 'unknown'
}

/**
 * Get the correct GitHub CLI install command for the current OS/distro.
 * Returns null if no automatic install method is available.
 */
export function getGhCliInstallCommand(): string | null {
  const platform = getPlatform()

  if (platform === 'darwin') {
    return 'brew install gh'
  }

  if (platform === 'win32') {
    return 'winget install --id GitHub.cli'
  }

  if (platform === 'linux') {
    const distro = getLinuxDistro()

    switch (distro) {
      case 'debian': {
        return [
          'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg',
          'sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg',
          'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
          'sudo apt update',
          'sudo apt install gh -y',
        ].join(' && ')
      }

      case 'fedora': {
        return 'sudo dnf install -y gh'
      }

      case 'arch': {
        return 'sudo pacman -S --noconfirm github-cli'
      }

      case 'alpine': {
        return 'sudo apk add github-cli'
      }

      case 'suse': {
        return 'sudo zypper install -y gh'
      }

      default: {
        return null
      }
    }
  }

  return null
}
