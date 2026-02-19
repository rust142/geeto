/**
 * Platform detection utilities
 */

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
