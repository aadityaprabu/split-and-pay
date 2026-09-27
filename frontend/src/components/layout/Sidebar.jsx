import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import { AppRoute } from "../../constants/constants";
import { HandshakeIcon, ReceiptIcon, ShieldIcon } from "../Icons";

function SidebarLink({ to, icon: IconComponent, label, description }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
          isActive ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <IconComponent className="size-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{label}</span>
            <span className={`hidden truncate text-xs md:block ${isActive ? "text-white/80" : "text-gray-500"}`}>
              {description}
            </span>
          </span>
        </>
      )}
    </NavLink>
  );
}

// A column on the left at md and up; a scrollable row of tabs above the content on phones
export default function Sidebar() {
  const { user } = useAuth();

  return (
    <nav
      aria-label="Dashboard"
      className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-white p-3 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-4"
    >
      {user.is_participant && (
        <>
          <SidebarLink
            to={AppRoute.EXPENSES}
            icon={ReceiptIcon}
            label="Add an expense"
            description="Create and review shared expenses"
          />
          <SidebarLink
            to={AppRoute.SETTLE_UP}
            icon={HandshakeIcon}
            label="Settle up"
            description="See who owes whom and record payments"
          />
        </>
      )}
      {user.is_admin && (
        <>
          {user.is_participant && <hr className="hidden border-gray-200 md:my-2 md:block" />}
          <SidebarLink to={AppRoute.ADMIN} icon={ShieldIcon} label="Manage access" description="Who can sign in" />
        </>
      )}
    </nav>
  );
}
