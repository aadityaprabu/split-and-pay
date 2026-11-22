import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/authContext";
import ExpenseDetail from "../pages/expenses/ExpenseDetail";
import api from "../utils/backendApi";

vi.mock("../utils/backendApi", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), upload: vi.fn() },
}));

const me = { id: "0199a0c0-0000-7000-8000-00000000000a", name: "Asha", picture_url: null };
const bala = { id: "0199a0c0-0000-7000-8000-00000000000b", name: "Bala", picture_url: null };

const baseExpense = {
  id: "0199a0c0-0000-7000-8000-0000000000e1",
  description: "Groceries",
  amount_minor: 3000,
  currency: "USD",
  split_type: "equal",
  spent_on: "2026-11-20",
  notes: "Includes the bags",
  updated_at: null,
  created_by: me.id,
  group: { id: "g1", name: "Flat" },
  paid_by: { id: me.id, name: me.name, picture_url: null },
  splits: [
    { user_id: me.id, name: me.name, amount_minor: 1500, basis_points: null, settled_at: "2026-11-20T10:00:00Z", settlement_id: null },
    { user_id: bala.id, name: bala.name, amount_minor: 1500, basis_points: null, settled_at: null, settlement_id: null },
  ],
  comments: [
    { id: "c1", body: "Paying Friday", created_at: "2026-11-20T11:00:00Z", user: { ...bala } },
  ],
  attachments: [
    { id: "a1", file_name: "bill.jpg", content_type: "image/jpeg", byte_size: 120000, uploaded_by: bala.id },
  ],
  comment_count: 1,
  attachment_count: 1,
};

function renderDetail(expense = baseExpense) {
  api.get.mockResolvedValue({ status: "success", data: expense });
  return render(
    <AuthContext.Provider value={{ user: { ...me, is_admin: false } }}>
      <MemoryRouter initialEntries={[`/expenses/${expense.id}`]}>
        <Routes>
          <Route path="/expenses/:id" element={<ExpenseDetail />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ExpenseDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the group, notes, receipts and comments", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Groceries" })).toBeInTheDocument();
    expect(screen.getByText("Flat")).toBeInTheDocument();
    expect(screen.getByText("Includes the bags")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "bill.jpg" })).toHaveAttribute(
      "src",
      expect.stringContaining(`/expenses/${baseExpense.id}/attachments/a1`),
    );
    expect(screen.getByText("Paying Friday")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit/ })).toHaveAttribute("href", `/expenses/${baseExpense.id}/edit`);
  });

  it("posts a comment", async () => {
    api.post.mockResolvedValue({ status: "success", data: { id: "c2" } });
    const user = userEvent.setup();
    renderDetail();

    await user.type(await screen.findByLabelText("Add a comment"), "Thanks!");
    await user.click(screen.getByRole("button", { name: "Post" }));
    expect(api.post).toHaveBeenCalledWith(`/expenses/${baseExpense.id}/comments`, { body: "Thanks!" });
  });

  it("hides edit once part of the expense is settled", async () => {
    const settled = {
      ...baseExpense,
      splits: baseExpense.splits.map((split) => ({ ...split, settled_at: "2026-11-21T00:00:00Z", settlement_id: "s1" })),
    };
    renderDetail(settled);
    expect(await screen.findByText(/can't be edited or deleted/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Edit/ })).not.toBeInTheDocument();
  });

  it("hides edit and delete while a part payment is open", async () => {
    renderDetail({ ...baseExpense, has_part_payment: true });
    expect(await screen.findByText(/part payment has been made/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });
});
