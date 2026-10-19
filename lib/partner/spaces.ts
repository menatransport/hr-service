import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import crypto from "crypto"
import path from "path"

let client: S3Client | null = null

function s3(): S3Client {
  if (client) return client
  const endpoint = process.env.DO_SPACES_ENDPOINT
  const key      = process.env.DO_SPACES_KEY
  const secret   = process.env.DO_SPACES_SECRET
  if (!endpoint || !key || !secret)
    throw new Error("Missing DO_SPACES_ENDPOINT / DO_SPACES_KEY / DO_SPACES_SECRET")
  client = new S3Client({
    region:      process.env.DO_SPACES_REGION ?? "sgp1",
    endpoint,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  })
  return client
}

export async function uploadFile(
  buffer:      Buffer,
  originalName: string,
  contentType: string,
  subfolder?:  string,
): Promise<string> {
  const bucket = process.env.DO_SPACES_BUCKET
  const region = process.env.DO_SPACES_REGION ?? "sgp1"
  const folder = process.env.DO_SPACES_FOLDER ?? "mena-partner"
  if (!bucket) throw new Error("Missing DO_SPACES_BUCKET")

  const ext    = path.extname(originalName) || ""
  const uid    = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`
  const parts  = [folder, subfolder, uid].filter(Boolean)
  const objKey = parts.join("/")

  await s3().send(
    new PutObjectCommand({
      Bucket:      bucket,
      Key:         objKey,
      Body:        buffer,
      ContentType: contentType,
      ACL:         "public-read",
    })
  )

  return `https://${bucket}.${region}.digitaloceanspaces.com/${objKey}`
}
