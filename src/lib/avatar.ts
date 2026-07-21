import "server-only"

import fs from "node:fs"
import path from "node:path"
import { dataDirectory } from "@/lib/storage"

export const avatarDirectory = path.join(/* turbopackIgnore: true */ dataDirectory, "avatars")

export function clientAvatarPath(clientId: string) {
  return path.join(avatarDirectory, `${clientId}.jpg`)
}

export function ensureAvatarDirectory() {
  fs.mkdirSync(avatarDirectory, { recursive: true })
}
