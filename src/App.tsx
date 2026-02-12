import { Link, Navigate, Route, BrowserRouter, Routes, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BulkCreateSessionProvider, useBulkCreateSession } from "@/contexts/BulkCreateSessionContext";
import { BulkCreate } from "@/pages/BulkCreate";
import { ImportExport } from "@/pages/ImportExport";
import { CreateCards } from "@/pages/CreateCards";
import { EditCards } from "@/pages/EditCards";
import { Study } from "@/pages/Study";
import { OllamaTest } from "@/pages/OllamaTest";

function NavLink({
  to,
  value,
  children,
  disabled,
}: {
  to: string;
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <TabsTrigger value={value} disabled className="pointer-events-none cursor-not-allowed opacity-60">
        {children}
      </TabsTrigger>
    );
  }
  return (
    <TabsTrigger value={value} asChild>
      <Link to={to}>{children}</Link>
    </TabsTrigger>
  );
}

function AppLayout() {
  const location = useLocation();
  const pathname = location.pathname === "/" ? "/bulk-create" : location.pathname;
  const { sessionActive } = useBulkCreateSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4">
        <nav className="flex items-center gap-2">
          <Tabs value={pathname}>
            <TabsList>
              <TabsTrigger value="/bulk-create" asChild>
                <Link to="/bulk-create">Bulk Create</Link>
              </TabsTrigger>
              <NavLink to="/import-export" value="/import-export" disabled={sessionActive}>
                Import/Export
              </NavLink>
              <NavLink to="/create" value="/create" disabled={sessionActive}>
                Create Cards
              </NavLink>
              <NavLink to="/edit" value="/edit" disabled={sessionActive}>
                Edit Cards
              </NavLink>
              <NavLink to="/study" value="/study" disabled={sessionActive}>
                Study
              </NavLink>
              <NavLink to="/ollama-test" value="/ollama-test" disabled={sessionActive}>
                Ollama Test
              </NavLink>
            </TabsList>
          </Tabs>
        </nav>
        <ThemeToggle />
        </div>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/bulk-create" replace />} />
          <Route path="/bulk-create" element={<BulkCreate />} />
          <Route path="/import-export" element={<ImportExport />} />
          <Route path="/create" element={<CreateCards />} />
          <Route path="/edit" element={<EditCards />} />
          <Route path="/study" element={<Study />} />
          <Route path="/ollama-test" element={<OllamaTest />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <BulkCreateSessionProvider>
        <AppLayout />
      </BulkCreateSessionProvider>
    </BrowserRouter>
  );
}

export default App;
