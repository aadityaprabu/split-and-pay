import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/authContext";
import { AppRoute } from "./constants/constants";
import Admin from "./pages/Admin";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import SettleUp from "./pages/SettleUp";
import CreateExpense from "./pages/expenses/CreateExpense";
import Expenses from "./pages/expenses/Expenses";

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <main className="min-h-dvh grid place-items-center text-gray-500">Loading...</main>;
  }

  if (!user) {
    return <Login />;
  }

  // Each sidebar option is a route, so the browser back button and refresh keep your place.
  // An admin who isn't splitting only has the access page, so that's their home.
  const homeRoute = user.is_participant ? AppRoute.EXPENSES : AppRoute.ADMIN;

  return (
    <Routes>
      <Route element={<Dashboard />}>
        {user.is_participant && (
          <>
            <Route path={AppRoute.EXPENSES} element={<Expenses />} />
            <Route path={AppRoute.NEW_EXPENSE} element={<CreateExpense />} />
            <Route path={AppRoute.SETTLE_UP} element={<SettleUp />} />
          </>
        )}
        {user.is_admin && <Route path={AppRoute.ADMIN} element={<Admin />} />}
      </Route>
      <Route path="*" element={<Navigate to={homeRoute} replace />} />
    </Routes>
  );
}
