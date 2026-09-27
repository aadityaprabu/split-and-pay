import { Outlet } from "react-router-dom";
import Sidebar from "../components/layout/Sidebar";
import TopBar from "../components/layout/TopBar";

// Top bar across the page; below it the sidebar (30%) picks what the content area (70%) shows
export default function Dashboard() {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <TopBar />
      <div className="flex-1 md:grid md:grid-cols-[3fr_7fr]">
        <Sidebar />
        <main className="min-w-0 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
