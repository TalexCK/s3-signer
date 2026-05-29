import { describe, expect, it } from "vitest";
import { createLinkSchema, createProfileSchema } from "@/lib/validators";

describe("validators", () => {
  it("accepts S3-compatible OSS profile input", () => {
    const result = createProfileSchema.parse({
      name: "Aliyun Hangzhou",
      endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com",
      region: "oss-cn-hangzhou",
      bucket: "private-bucket",
      accessKeyId: "access-key",
      secretAccessKey: "secret",
      forcePathStyle: false,
      isDefault: true,
    });

    expect(result.forcePathStyle).toBe(false);
    expect(result.isDefault).toBe(true);
  });

  it("bounds link validity to the stored database window", () => {
    expect(() =>
      createLinkSchema.parse({
        profileId: "00000000-0000-4000-8000-000000000000",
        objectKey: "file.zip",
        validForSeconds: 59,
      })
    ).toThrow();
  });
});
