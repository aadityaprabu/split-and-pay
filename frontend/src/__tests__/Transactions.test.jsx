import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/authContext";
import Transactions from "../pages/Transactions";
import api from "../utils/backendApi";

vi.mock("../utils/backendApi", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const me = { id: "0199a0c0-0000-7000-8000-00000000000a", name: "Asha", picture_url: null };
const bala = { id: "0199a0c0-0000-7000-8000-00000000000b", name: "Bala", picture_url: null };

// 25 expenses Asha and Bala split, newest ("Expense 25") first
const allTransactions = Array.from({ length: 25 }, (_, index) => {
  const number = 25 - index;
  return {
    id: `t${number}`,
    description: `Expense ${number}`,
    amount_minor: 10000,
    currency: "USD",
    spent_on: "2026-11-01",
    paid_by: number % 2 ? me : bala,
    my_share_minor: 5000,
    participants: [me, bala],
  };
});

const summaryRows = [
  { month: "2026-11", currency: "USD", transaction_count: 25, paid_minor: 130000, share_minor: 125000 },
  { month: "2026-11", currency: "INR", transaction_count: 1, paid_minor: 0, share_minor: 45000 },
];

function mockBackend() {
  api.get.mockImplementation(async (endpoint) => {
    const [path, queryString = ""] = endpoint.split("?");
    const query = new URLSearchParams(queryString);
    if (path === "/users") return { status: "success", data: [me, bala] };
    if (path === "/transactions/summary") return { status: "success", data: summaryRows };
    if (path === "/transactions") {
      const offset = Number(query.get("offset") ?? 0);
      const items = allTransactions.slice(offset, offset + 10);
      return { status: "success", data: { items, has_more: offset + 10 < allTransactions.length } };
    }
    throw new Error(`unexpected GET ${endpoint}`);
  });
}

function renderTransactions() {
  return render(
    <AuthContext.Provider value={{ user: { ...me, is_participant: true } }}>
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const listedTitles = () =>
  within(screen.getByRole("region", { name: "Transactions" }))
    .getAllByRole("listitem")
    .map((row) => row.querySelector("a").textContent);

describe("Transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBackend();
  });

  it("shows the 10 most recent, then 10 more on Show more, then the rest on Load more", async () => {
    const user = userEvent.setup();
    renderTransactions();

    await screen.findByText("Expense 25");
    expect(listedTitles()).toHaveLength(10);
    expect(listedTitles().at(-1)).toBe("Expense 16");
    expect(screen.getByRole("link", { name: "Expense 25" })).toHaveAttribute("href", "/expenses/t25");

    await user.click(screen.getByRole("button", { name: "Show more" }));
    await screen.findByText("Expense 6");
    expect(listedTitles()).toHaveLength(20);
    expect(api.get).toHaveBeenCalledWith("/transactions?offset=10");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Expense 1");
    expect(listedTitles()).toHaveLength(25);
    expect(screen.queryByRole("button", { name: /more/ })).not.toBeInTheDocument();
  });

  it("sums up each month, with every currency in it", async () => {
    renderTransactions();

    const summary = await screen.findByRole("table");
    const november = within(summary).getByRole("row", { name: /November 2026/ });
    expect(within(november).getByText("26")).toBeInTheDocument();
    expect(within(november).getByText("$1,300")).toBeInTheDocument();
    expect(within(november).getByText("$1,250")).toBeInTheDocument();
    expect(within(november).getByText("₹450")).toBeInTheDocument();
  });

  it("sends the date, title and person filters to both the list and the summary", async () => {
    const user = userEvent.setup();
    renderTransactions();
    await screen.findByText("Expense 25");

    await user.selectOptions(screen.getByLabelText("Person"), "Bala");
    await user.type(screen.getByLabelText("From"), "2026-11-01");
    await user.type(screen.getByLabelText("Title"), "rent");

    const expectedQuery = `from=2026-11-01&q=rent&person=${bala.id}`;
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/transactions?${expectedQuery}`));
    expect(api.get).toHaveBeenCalledWith(`/transactions/summary?${expectedQuery}`);
    // The title waits for a pause in typing instead of searching on every letter
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining("q=r&"));

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });

  it("only offers the other roommates as people to filter by", async () => {
    renderTransactions();
    const person = screen.getByLabelText("Person");
    await within(person).findByRole("option", { name: "Bala" });
    expect(within(person).queryByRole("option", { name: "Asha" })).not.toBeInTheDocument();
  });
});
