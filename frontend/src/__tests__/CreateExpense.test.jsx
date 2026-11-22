import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/authContext";
import CreateExpense from "../pages/expenses/CreateExpense";
import api from "../utils/backendApi";

vi.mock("../utils/backendApi", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), upload: vi.fn() },
}));

const me = { id: "0199a0c0-0000-7000-8000-00000000000a", name: "Asha", email: "asha@gmail.com", picture_url: null };
const bala = { id: "0199a0c0-0000-7000-8000-00000000000b", name: "Bala", email: "bala@gmail.com", picture_url: null };
const chitra = { id: "0199a0c0-0000-7000-8000-00000000000c", name: "Chitra", email: "chitra@gmail.com", picture_url: null };

const trip = { id: "0199a0c0-0000-7000-8000-0000000000f1", name: "Goa trip", members: [me, bala] };

// Answers api.get by endpoint, like the backend would
function mockBackend({ groups = [], expense = null } = {}) {
  api.get.mockImplementation(async (endpoint) => {
    if (endpoint === "/users") return { status: "success", data: [me, bala, chitra] };
    if (endpoint === "/groups") return { status: "success", data: groups };
    if (expense && endpoint === `/expenses/${expense.id}`) return { status: "success", data: expense };
    throw new Error(`unexpected GET ${endpoint}`);
  });
}

function renderCreateExpense(path = "/expenses/new") {
  return render(
    <AuthContext.Provider value={{ user: { ...me, is_admin: false } }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/expenses/new" element={<CreateExpense />} />
          <Route path="/expenses/:id/edit" element={<CreateExpense />} />
          <Route path="/expenses/:id" element={<p>Expense page</p>} />
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
    mockBackend();
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

  it("saves notes, and uploads a picked receipt once the expense exists", async () => {
    api.upload.mockResolvedValue({ status: "success", data: { id: "file" } });
    const user = userEvent.setup();
    renderCreateExpense();

    await user.click(await screen.findByRole("checkbox", { name: /Bala/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Description"), "Groceries");
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.type(screen.getByLabelText(/Notes/), "Includes the bags");
    const bill = new File(["%PDF-1.7"], "bill.pdf", { type: "application/pdf" });
    await user.upload(screen.getByTestId("receipt-input"), bill);
    expect(screen.getByText("bill.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create expense" }));

    expect(api.post).toHaveBeenCalledWith("/expenses", expect.objectContaining({ notes: "Includes the bags" }));
    expect(api.upload).toHaveBeenCalledWith("/expenses/new/attachments", bill, "bill.pdf");
    expect(await screen.findByText("Expenses list")).toBeInTheDocument();
  });

  it("only lists a group's members once a group is picked", async () => {
    mockBackend({ groups: [trip] });
    const user = userEvent.setup();
    renderCreateExpense();

    await user.selectOptions(await screen.findByLabelText("Group"), "Goa trip");
    expect(screen.getByRole("checkbox", { name: /Bala/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Chitra/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Bala/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Description"), "Hotel");
    await user.type(screen.getByLabelText("Amount"), "300");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create expense" }));

    expect(api.post).toHaveBeenCalledWith("/expenses", expect.objectContaining({ group_id: trip.id }));
  });

  it("edits an expense: starts from what was saved and sends a PUT", async () => {
    const expense = {
      id: "0199a0c0-0000-7000-8000-0000000000e1",
      description: "Rent",
      amount_minor: 20000,
      currency: "USD",
      split_type: "percent",
      spent_on: "2026-11-01",
      notes: "November",
      group: null,
      paid_by: { id: me.id, name: me.name },
      splits: [
        { user_id: me.id, amount_minor: 12000, basis_points: 6000, settlement_id: null },
        { user_id: bala.id, amount_minor: 8000, basis_points: 4000, settlement_id: null },
      ],
    };
    mockBackend({ expense });
    api.put.mockResolvedValue({ status: "success", data: { id: expense.id } });
    const user = userEvent.setup();
    renderCreateExpense(`/expenses/${expense.id}/edit`);

    expect(await screen.findByRole("heading", { name: "Edit expense" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Bala/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Description")).toHaveValue("Rent");
    expect(screen.getByLabelText("Amount")).toHaveValue("200");
    const description = screen.getByLabelText("Description");
    await user.clear(description);
    await user.type(description, "Rent (November)");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Asha's percentage")).toHaveValue("60");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(api.put).toHaveBeenCalledWith(
      `/expenses/${expense.id}`,
      expect.objectContaining({
        description: "Rent (November)",
        notes: "November",
        participants: [
          { user_id: me.id, basis_points: 6000 },
          { user_id: bala.id, basis_points: 4000 },
        ],
      }),
    );
    expect(await screen.findByText("Expense page")).toBeInTheDocument();
  });
});
