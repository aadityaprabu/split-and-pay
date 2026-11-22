import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/authContext";
import SettleUp from "../pages/SettleUp";
import api from "../utils/backendApi";

vi.mock("../utils/backendApi", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const me = { id: "0199a0c0-0000-7000-8000-00000000000a", name: "Asha" };
const bala = { id: "0199a0c0-0000-7000-8000-00000000000b", name: "Bala" };

const balance = {
  user_id: bala.id,
  name: "Bala",
  picture_url: null,
  currency: "USD",
  net_minor: -1500,
  open_expense_count: 1,
  partial_paid_minor: 0,
};

function renderSettleUp() {
  api.get.mockImplementation(async (endpoint) => {
    if (endpoint === "/balances") return { status: "success", data: [balance] };
    if (endpoint === "/settlements") {
      return {
        status: "success",
        data: [
          {
            id: "s1",
            amount_minor: 500,
            currency: "USD",
            created_at: "2026-11-20T10:00:00Z",
            is_partial: true,
            expense_count: 0,
            from_user: me,
            to_user: bala,
          },
          {
            id: "s2",
            amount_minor: 2025,
            currency: "USD",
            created_at: "2026-11-22T07:09:00Z",
            is_partial: false,
            expense_count: 2,
            from_user: me,
            to_user: bala,
            expenses: [
              { id: "e1", description: "Dinner", spent_on: "2026-11-21", currency: "USD", amount_minor: 3000, settled_minor: 1500, paid_by: bala.id },
              { id: "e2", description: "Cab", spent_on: "2026-11-20", currency: "USD", amount_minor: 1050, settled_minor: 525, paid_by: bala.id },
            ],
          },
        ],
      };
    }
    throw new Error(`unexpected GET ${endpoint}`);
  });
  return render(
    <AuthContext.Provider value={{ user: { ...me, is_admin: false } }}>
      <MemoryRouter>
        <SettleUp />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("SettleUp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a past settle-up to list the expenses it settled, each linking to its page", async () => {
    const user = userEvent.setup();
    renderSettleUp();

    const row = await screen.findByRole("button", { name: /You paid Bala.*settled 2 expenses/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Dinner/ })).not.toBeInTheDocument();

    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Dinner/ })).toHaveAttribute("href", "/expenses/e1");
    expect(screen.getByRole("link", { name: /Cab/ })).toHaveAttribute("href", "/expenses/e2");
    expect(screen.getByRole("link", { name: /Dinner/ })).toHaveTextContent("Bala paid $30");

    await user.click(row);
    expect(screen.queryByRole("link", { name: /Dinner/ })).not.toBeInTheDocument();
  });

  it("doesn't offer to open a part payment, which settled no expenses", async () => {
    renderSettleUp();
    await screen.findByText(/part payment/);
    expect(screen.queryByRole("button", { name: /part payment/ })).not.toBeInTheDocument();
  });

  it("records a part payment and refuses more than what's owed", async () => {
    api.post.mockResolvedValue({ status: "success", data: { is_partial: true, amount_minor: 400 } });
    const user = userEvent.setup();
    renderSettleUp();

    expect(await screen.findByText(/part payment/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Settle up" }));
    await user.click(screen.getByRole("radio", { name: "Part of it" }));

    const amount = screen.getByLabelText("Amount paid");
    await user.type(amount, "20");
    expect(screen.getByText("That's more than the $15 owed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();

    await user.clear(amount);
    await user.type(amount, "4");
    expect(screen.getByText(/\$11 will still be owed/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(api.post).toHaveBeenCalledWith("/settlements", {
      user_id: bala.id,
      currency: "USD",
      net_minor: -1500,
      amount_minor: 400,
    });
    expect(await screen.findByText("Recorded a $4 payment with Bala")).toBeInTheDocument();
  });

  it("settles the full balance without an amount", async () => {
    api.post.mockResolvedValue({ status: "success", data: { is_partial: false, amount_minor: 1500 } });
    const user = userEvent.setup();
    renderSettleUp();

    await user.click(await screen.findByRole("button", { name: "Settle up" }));
    expect(screen.getByText("Record that you paid Bala $15?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(api.post).toHaveBeenCalledWith("/settlements", { user_id: bala.id, currency: "USD", net_minor: -1500 });
    expect(await screen.findByText("Settled up with Bala")).toBeInTheDocument();
  });
});
