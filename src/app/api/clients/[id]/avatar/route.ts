import fs from "node:fs"
import { clientAvatarPath } from "@/lib/avatar"
import { whatsappManager } from "@/lib/whatsapp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function imageContentType(image: Uint8Array) {
  if (image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff)
    return "image/jpeg"

  if (image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47)
    return "image/png"

  if (String.fromCharCode(...image.slice(0, 4)) === "RIFF" && String.fromCharCode(...image.slice(8, 12)) === "WEBP")
    return "image/webp"

  return "application/octet-stream"
}

export async function GET( _request: Request, { params }: { params: Promise<{ id: string }> }, ) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 })

  const filePath = clientAvatarPath(id)
  if (!fs.existsSync(filePath)) {
    void whatsappManager.refreshProfilePicture(id).catch(() => undefined)
    return new Response(null, { status: new URL(_request.url).searchParams.get("sync") === "1" ? 204 : 404 })
  }
  const [image, stat] = await Promise.all([
    fs.promises.readFile(filePath),
    fs.promises.stat(filePath),
  ])

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": imageContentType(image),
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=86400, immutable",
      "Last-Modified": stat.mtime.toUTCString(),
    },
  })
}
