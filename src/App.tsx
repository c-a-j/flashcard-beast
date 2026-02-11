import { Link, Navigate, Route, BrowserRouter, Routes, useLocation } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkCreate } from "@/pages/BulkCreate";
import { ImportExport } from "@/pages/ImportExport";
import { CreateCards } from "@/pages/CreateCards";
import { EditCards } from "@/pages/EditCards";
import { Study } from "@/pages/Study";

function AppLayout() {
  const location = useLocation();
  const pathname = location.pathname === "/" ? "/bulk-create" : location.pathname;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card px-6 py-4">
        <nav className="flex items-center gap-2">
          <Tabs value={pathname}>
            <TabsList>
              <TabsTrigger value="/bulk-create" asChild>
                <Link to="/bulk-create">Bulk Create</Link>
              </TabsTrigger>
              <TabsTrigger value="/import-export" asChild>
                <Link to="/import-export">Import/Export</Link>
              </TabsTrigger>
              <TabsTrigger value="/create" asChild>
                <Link to="/create">Create Cards</Link>
              </TabsTrigger>
              <TabsTrigger value="/edit" asChild>
                <Link to="/edit">Edit Cards</Link>
              </TabsTrigger>
              <TabsTrigger value="/study" asChild>
                <Link to="/study">Study</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </nav>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/bulk-create" replace />} />
          <Route path="/bulk-create" element={<BulkCreate />} />
          <Route path="/import-export" element={<ImportExport />} />
          <Route path="/create" element={<CreateCards />} />
          <Route path="/edit" element={<EditCards />} />
          <Route path="/study" element={<Study />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
