import "server-only"

import path from "node:path"

/**
 * Root for state that must survive deploys/restarts.
 * Locally it stays inside the project; Railway can point it at a mounted volume.
 */
export const persistentRoot = path.resolve(
  process.env.LAZO_PERSISTENT_DIR || process.cwd(),
)

export const dataDirectory = path.join(/* turbopackIgnore: true */ persistentRoot, ".data")
export const baileysAuthDirectory = path.join(/* turbopackIgnore: true */ persistentRoot, ".baileys-auth")
