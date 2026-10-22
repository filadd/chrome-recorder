import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/auth-session", () => ({
  getAccessToken: vi.fn(async () => "Bearer t"),
}));

vi.mock("../shared/storage", () => ({
  getPendingUpload: vi.fn(),
  clearPendingUpload: vi.fn(async () => undefined),
}));

vi.mock("./auth-refresh", () => ({ refreshSession: vi.fn() }));

vi.mock("../upload/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../upload/api-client")>()),
  getUploadStatus: vi.fn(),
  recordPart: vi.fn(async () => undefined),
}));

import { clearPendingUpload, getPendingUpload } from "../shared/storage";
import { ApiError, getUploadStatus, recordPart, UPLOAD_STATUS } from "../upload/api-client";
import { retryPendingUpload } from "./recovery";

const mockedStatus = vi.mocked(getUploadStatus);

const pending = {
  session: { key: "k", filepath: "f", profileId: "project" as const },
  lastPart: { partNumber: 2, etag: "e2" },
  createdAt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPendingUpload).mockResolvedValue(pending);
});

describe("retryPendingUpload", () => {
  it("clears the pending upload when the session is gone (404)", async () => {
    mockedStatus.mockRejectedValue(new ApiError("not found", 404));

    expect(await retryPendingUpload()).toBe(false);
    expect(clearPendingUpload).toHaveBeenCalledOnce();
  });

  it("keeps the pending upload when the token could not be refreshed", async () => {
    mockedStatus.mockRejectedValue(new ApiError("expired", 401));

    expect(await retryPendingUpload()).toBe(false);
    expect(clearPendingUpload).not.toHaveBeenCalled();
  });

  it("keeps the pending upload when the API is unreachable", async () => {
    mockedStatus.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await retryPendingUpload()).toBe(false);
    expect(clearPendingUpload).not.toHaveBeenCalled();
  });

  it("finalizes a still-pending prefix", async () => {
    mockedStatus.mockResolvedValue({ status: UPLOAD_STATUS.pending, parts: [] });

    expect(await retryPendingUpload()).toBe(true);
    expect(recordPart).toHaveBeenCalledWith(
      { key: "k", partNumber: 2, etag: "e2", complete: true },
      "Bearer t",
      expect.any(Function),
    );
    expect(clearPendingUpload).toHaveBeenCalledOnce();
  });
});
