import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/authContext";
import CreateExpense from "../pages/expenses/CreateExpense";
import api from "../utils/backendApi";

vi.mock("../utils/backendApi", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const me = { id: "0199a0c0-0000-7000-8000-00000000000a", name: "Asha", email: "asha@gmail.com", picture_url: null };
const bala = { id: "0199a0c0-0000-7000-8000-00000000000b", name: "Bala", email: "bala@gmail.com", picture_url: null };
const chitra = { id: "0199a0c0-0000-7000-8000-00000000000c", name: "Chitra", email: "chitra@gmail.com", picture_url: null };

function renderCreateExpense() {
  return render(
    <AuthContext.Provider value={{ user: { ...me, is_admin: false } }}>
      <MemoryRouter initialEntries={["/expenses/new"]}>
        <Routes>
          <Route path="/expenses/new" element={<CreateExpense />} />
          <Route path="/expenses" element={<p>Expenses list</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function fillParticipantsAndAmount(user, { names, description, amount, currency }) {
  for (const name of names) {
    await user.click(await screen.findByRole("checkbox", { name: new RegExp(name) }));
  }
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(screen.getByLabelText("Description"), description);
  await user.type(screen.getByLabelText("Amount"), amount);
  if (currency) await user.selectOptions(screen.getByLabelText("Currency"), currency);
  await user.click(screen.getByRole("button", { name: "Next" }));
}

describe("CreateExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ status: "success", data: [me, bala, chitra] });
    api.post.mockResolvedValue({ status: "success", data: { id: "new" } });
  });

  it("creates an equal split between the chosen participants, in USD by default", async () => {
    const user = userEvent.setup();
    renderCreateExpense();

    await fillParticipantsAndAmount(user, { names: ["Bala", "Chitra"], description: "Groceries", amount: "100" });

    expect(screen.getByText("$33.34")).toBeInTheDocument();
    expect(screen.getAllByText("$33.33")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Create expense" }));

    expect(api.post).toHaveBeenCalledWith(
      "/expenses",
      expect.objectContaining({
        description: "Groceries",
        amount_minor: 10000,
        currency: "USD",
        paid_by: me.id,
        split_type: "equal",
        participants: [{ user_id: me.id }, { user_id: bala.id }, { user_id: chitra.id }],
      }),
    );
    expect(await screen.findByText("Expenses list")).toBeInTheDocument();
  });

  it("only allows submitting a percentage split once it adds up to 100%", async () => {
    const user = userEvent.setup();
    renderCreateExpense();

    await fillParticipantsAndAmount(user, { names: ["Bala"], description: "Rent", amount: "200" });
    await user.click(screen.getByRole("radio", { name: "By percentage" }));

    const myPercent = screen.getByLabelText("Asha's percentage");
    expect(myPercent).toHaveValue("50");
    await user.clear(myPercent);
    await user.type(myPercent, "70");
    expect(screen.getByText("Percentages add up to 120%, not 100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create expense" })).toBeDisabled();

    const balaPercent = screen.getByLabelText("Bala's percentage");
    await user.clear(balaPercent);
    await user.type(balaPercent, "30");
    await user.click(screen.getByRole("button", { name: "Create expense" }));

    expect(api.post).toHaveBeenCalledWith(
      "/expenses",
      expect.objectContaining({
        split_type: "percent",
        participants: [
          { user_id: me.id, basis_points: 7000 },
          { user_id: bala.id, basis_points: 3000 },
        ],
      }),
    );
  });

  it("shows the server's message when creating fails", async () => {
    api.post.mockResolvedValue({ status: "error", message: "Someone on this expense can no longer sign in" });
    const user = userEvent.setup();
    renderCreateExpense();

    await fillParticipantsAndAmount(user, { names: ["Bala"], description: "Pizza", amount: "450", currency: "INR" });
    expect(screen.getByText("How should ₹450 be split?")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "By exact amount" }));
    await user.type(screen.getByLabelText("Asha's amount"), "200");
    await user.type(screen.getByLabelText("Bala's amount"), "250");
    await user.click(screen.getByRole("button", { name: "Create expense" }));

    expect(api.post).toHaveBeenCalledWith("/expenses", expect.objectContaining({ currency: "INR" }));
    expect(await screen.findByText("Someone on this expense can no longer sign in")).toBeInTheDocument();
  });
});
