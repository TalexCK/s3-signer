import { z } from "zod";

const urlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "endpoint must be an HTTPS URL",
  });

export const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  endpoint: urlSchema,
  region: z.string().trim().min(1).max(80),
  bucket: z.string().trim().min(1).max(255),
  accessKeyId: z.string().trim().min(1).max(255),
  secretAccessKey: z.string().min(1).max(4096),
  sessionToken: z.string().max(8192).optional().nullable(),
  forcePathStyle: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});

export const updateProfileSchema = createProfileSchema
  .omit({ secretAccessKey: true, isDefault: true })
  .extend({
    secretAccessKey: z.string().max(4096).optional(),
    sessionToken: z.string().max(8192).optional().nullable(),
  })
  .partial();

export const createLinkSchema = z.object({
  profileId: z.string().uuid(),
  objectKey: z.string().trim().min(1).max(2048),
  validForSeconds: z
    .number()
    .int()
    .min(60)
    .max(60 * 60 * 24 * 365)
    .nullable(),
  maxDownloads: z.number().int().min(1).max(1_000_000).optional().nullable(),
  downloadFilename: z.string().trim().max(255).optional().nullable(),
});

export const listObjectsSchema = z.object({
  profileId: z.string().uuid(),
  query: z.string().trim().max(1024).optional().default(""),
  prefix: z.string().trim().max(2048).optional().default(""),
  continuationToken: z.string().max(4096).optional(),
});

export const uploadObjectsSchema = z.object({
  profileId: z.string().uuid(),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(2048),
        contentType: z.string().trim().max(255).optional().nullable(),
      })
    )
    .min(1)
    .max(100),
  prefix: z.string().trim().max(2048).optional().default(""),
});

export const createFolderSchema = z.object({
  profileId: z.string().uuid(),
  prefix: z.string().trim().max(2048).optional().default(""),
  name: z.string().trim().min(1).max(255),
});

export const deleteObjectSchema = z.object({
  profileId: z.string().uuid(),
  objectKey: z.string().trim().min(1).max(2048),
});

export const accessSettingsSchema = z.object({
  adminGroups: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
  userGroups: z.array(z.string().trim().min(1).max(255)).max(100),
});
