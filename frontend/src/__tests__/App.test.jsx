import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import AuthProvider from "../auth/AuthProvider";
import api from "../utils/backendApi";

vi.mock("../utils/backendApi", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const signedOut = { status: "error", message: "not signed in", code: 401 };
const signedIn = (user) => ({ status: "success", message: "current user", code: 200, data: user });
const roommate = { id: "0199a0c0-0000-7000-8000-000000000002", name: "Roomie", email: "roomie@gmail.com", picture_url: null, is_admin: false, is_participant: true };
const admin = {
  ...roommate,
  id: "0199a0c0-0000-7000-8000-000000000001",
  name: "Admin",
  email: "admin@gmail.com",
  is_admin: true,
  is_participant: false,
};

// Answers api.get by endpoint, like the backend would
function mockBackend({ me, googleClientId = null }) {
  api.get.mockImplementation(async (endpoint) => {
    if (endpoint === "/auth/me") return me;
    if (endpoint === "/auth/config") return { status: "success", data: { googleClientId } };
    if (endpoint === "/expenses") return { status: "success", data: [] };
    if (endpoint === "/admin/allowed-emails") {
      return { status: "success", data: { adminEmail: admin.email, allowedEmails: [] } };
    }
    throw new Error(`unexpected GET ${endpoint}`);
  });
}

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the login page when nobody is signed in", async () => {
    mockBackend({ me: signedOut });
    renderApp();

    expect(await screen.findByText("Shared expenses for the flat")).toBeInTheDocument();
  });

  it("explains that sign-in is off when the backend has no Google client id", async () => {
    mockBackend({ me: signedOut, googleClientId: null });
    renderApp();

    expect(await screen.findByText(/Google sign-in isn't configured/)).toBeInTheDocument();
  });

  it("shows the dashboard with the user's name in the top bar", async () => {
    mockBackend({ me: signedIn(roommate) });
    renderApp();

    expect(await screen.findByRole("button", { name: /Roomie/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add an expense/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settle up/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create an expense/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Manage access/ })).not.toBeInTheDocument();
  });

  it("logs out from the user menu", async () => {
    mockBackend({ me: signedIn(roommate) });
    api.post.mockResolvedValue({ status: "success", data: null });
    renderApp();

    await userEvent.click(await screen.findByRole("button", { name: /Roomie/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Log out/ }));

    expect(api.post).toHaveBeenCalledWith("/auth/logout");
    expect(await screen.findByText("Shared expenses for the flat")).toBeInTheDocument();
  });

  it("lands an admin who isn't splitting on Manage access, without the expense options", async () => {
    mockBackend({ me: signedIn(admin) });
    renderApp("/expenses");

    expect(await screen.findByRole("heading", { name: "Who can sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage access/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Add an expense/ })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Join splits" })).toBeInTheDocument();
  });

  it("gives an admin who joined splits both the expense options and Manage access", async () => {
    mockBackend({ me: signedIn({ ...admin, is_participant: true }) });
    renderApp();

    expect(await screen.findByRole("heading", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage access/ })).toBeInTheDocument();
  });

  it("sends a roommate who opens /admin to the expenses page", async () => {
    mockBackend({ me: signedIn(roommate) });
    renderApp("/admin");

    expect(await screen.findByRole("heading", { name: "Expenses" })).toBeInTheDocument();
    expect(screen.queryByText("Who can sign in")).not.toBeInTheDocument();
  });
});
