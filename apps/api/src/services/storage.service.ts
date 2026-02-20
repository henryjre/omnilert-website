import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

/**
 * Storage service for DigitalOcean Spaces (S3-compatible object storage).
 * Provides methods to upload and delete files from the configured Spaces bucket.
 */

let s3Client: S3Client | null = null;

/**
 * Initialize the S3 client with DigitalOcean Spaces configuration.
 * Returns null if environment variables are not configured.
 */
function getS3Client(): S3Client | null {
  console.log("DO_SPACES_ENDPOINT:", env.DO_SPACES_ENDPOINT);
  console.log("DO_SPACES_KEY:", env.DO_SPACES_KEY ? "set" : "not set");
  console.log("DO_SPACES_SECRET_KEY:", env.DO_SPACES_SECRET_KEY ? "set" : "not set");
  console.log("DO_SPACES_BUCKET:", env.DO_SPACES_BUCKET);

  if (!env.DO_SPACES_ENDPOINT || !env.DO_SPACES_KEY || !env.DO_SPACES_SECRET_KEY || !env.DO_SPACES_BUCKET) {
    return null;
  }

  // Extract region from endpoint - DO_SPACES_ENDPOINT should be like "https://sgp1.digitaloceanspaces.com"
  // NOT "https://bucketname.sgp1.digitaloceanspaces.com"
  let endpoint = env.DO_SPACES_ENDPOINT;
  let bucketInEndpoint = false;
  
  // Check if endpoint already contains the bucket name (e.g., omnilert.sgp1.digitaloceanspaces.com)
  if (endpoint.includes(env.DO_SPACES_BUCKET)) {
    bucketInEndpoint = true;
    console.log("Endpoint contains bucket name - extracting region endpoint");
    // Extract just the region endpoint: sgp1.digitaloceanspaces.com
    const bucketAndRegion = endpoint.replace(/^https?:\/\//, '').split('.');
    if (bucketAndRegion.length >= 2) {
      endpoint = `https://${bucketAndRegion.slice(1).join('.')}`;
      console.log("New endpoint:", endpoint);
    }
  }

  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: endpoint,
      region: "auto",
      credentials: {
        accessKeyId: env.DO_SPACES_KEY,
        secretAccessKey: env.DO_SPACES_SECRET_KEY,
      },
      tls: true,
      forcePathStyle: false,
    });
  }

  return s3Client;
}

/**
 * Check if S3 storage is configured and available.
 */
export function isStorageConfigured(): boolean {
  return getS3Client() !== null;
}

/**
 * Generate a unique key for file storage.
 * @param filename - Original filename
 * @param folder - Optional folder path (e.g., "Cash Requests" or "POS Verifications")
 * @returns Unique key with timestamp prefix
 */
function generateKey(filename: string, folder?: string): string {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const ext = filename.split(".").pop() || "";
  const folderPath = folder ? `${folder}/` : "";
  return `${folderPath}${timestamp}-${random}.${ext}`;
}

/**
 * Upload a file buffer to DigitalOcean Spaces.
 * @param buffer - File buffer data
 * @param originalFilename - Original filename for extension
 * @param contentType - MIME type of the file
 * @param folder - Optional folder name for organization (e.g., "Cash Requests", "POS Verifications")
 * @returns Public CDN URL of the uploaded file, or null if upload fails
 */
export async function uploadFile(
  buffer: Buffer,
  originalFilename: string,
  contentType: string,
  folder?: string
): Promise<string | null> {
  const client = getS3Client();
  const bucket = env.DO_SPACES_BUCKET;
  const cdnEndpoint = env.DO_SPACES_CDN_ENDPOINT;

  if (!client || !bucket) {
    console.error("S3 storage not configured");
    return null;
  }

  const key = generateKey(originalFilename, folder);

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
    });

    await client.send(command);

    // Return the CDN URL if available, otherwise construct from endpoint
    if (cdnEndpoint) {
      return `${cdnEndpoint}/${key}`;
    }

    // Fallback to Spaces endpoint URL
    const endpoint = env.DO_SPACES_ENDPOINT?.replace("https://", "");
    return `https://${bucket}.${endpoint}/${key}`;
  } catch (error) {
    console.error("Failed to upload file to S3:", error);
    return null;
  }
}

/**
 * Delete a file from DigitalOcean Spaces.
 * @param url - Public URL of the file to delete
 * @returns True if deletion was successful
 */
export async function deleteFile(url: string): Promise<boolean> {
  const client = getS3Client();
  const bucket = env.DO_SPACES_BUCKET;

  if (!client || !bucket) {
    console.error("S3 storage not configured");
    return false;
  }

  // Extract key from URL
  let key: string;
  if (url.startsWith("http")) {
    // Extract key from URL path
    const urlObj = new URL(url);
    key = urlObj.pathname.replace(/^\//, "");
  } else {
    // URL is already the key
    key = url;
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error) {
    console.error("Failed to delete file from S3:", error);
    return false;
  }
}

/**
 * Delete all files in a specific folder (prefix).
 * @param folderPath - Folder path to delete (e.g., "Profile Pictures/user-uuid")
 * @returns True if deletion was successful
 */
export async function deleteFolder(folderPath: string): Promise<boolean> {
  const client = getS3Client();
  const bucket = env.DO_SPACES_BUCKET;

  if (!client || !bucket) {
    console.error("S3 storage not configured");
    return false;
  }

  try {
    // List all objects in the folder
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: folderPath,
    });

    const response = await client.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      return true; // No files to delete
    }

    // Delete each file
    for (const obj of response.Contents) {
      if (obj.Key) {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: obj.Key,
        });
        await client.send(deleteCommand);
      }
    }

    return true;
  } catch (error) {
    console.error("Failed to delete folder from S3:", error);
    return false;
  }
}
