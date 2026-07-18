import "server-only"

import fs from "node:fs"
import path from "node:path"

export const avatarDirectory = path.join(process.cwd(), ".data", "avatars")

export function clientAvatarPath(clientId: string) {
  return path.join(avatarDirectory, `${clientId}.jpg`)
}

export function ensureAvatarDirectory() {
  fs.mkdirSync(avatarDirectory, { recursive: true })
}

