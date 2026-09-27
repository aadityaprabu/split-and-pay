import { Link } from "react-router-dom";
import UserMenu from "./UserMenu";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
      <Link to="/" className="text-lg font-bold text-primary">
        Split & Pay
      </Link>
      <UserMenu />
    </header>
  );
}
