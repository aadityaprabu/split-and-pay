import { beforeEach, describe, expect, it, vi } from "vitest";

// backendApi wraps a single axios instance; replace it with one whose calls each test controls
const axiosClient = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock("axios", () => ({ default: { create: () => axiosClient } }));

const { default: api } = await import("../../utils/backendApi");

describe("backendApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the backend's envelope on success", async () => {
    const envelope = { status: "success", message: "pong", code: 200, data: null };
    axiosClient.get.mockResolvedValue({ data: envelope });

    expect(await api.get("/ping")).toEqual(envelope);
  });

  it("returns the backend's error envelope when the request fails with a response", async () => {
    const envelope = { status: "error", message: "admin only", code: 403 };
    axiosClient.delete.mockRejectedValue({ response: { data: envelope } });

    expect(await api.delete("/admin/allowed-emails/a%40b.com")).toEqual(envelope);
  });

  it("returns a network-error envelope instead of throwing when the server is unreachable", async () => {
    axiosClient.post.mockRejectedValue(new Error("Network Error"));

    expect(await api.post("/auth/logout")).toEqual({ status: "error", message: "network error", code: 0 });
  });
});
