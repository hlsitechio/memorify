import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/dashboard/ProtectedRoute";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Unsubscribe from "./pages/Unsubscribe.tsx";
import WorkspaceHandle from "./pages/WorkspaceHandle.tsx";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import DashboardHome from "./pages/dashboard/Home";
import Memory from "./pages/dashboard/Memory";
import MemoryDetail from "./pages/dashboard/MemoryDetail";
import Connectors from "./pages/dashboard/Connectors";
import Events from "./pages/dashboard/Events";
import Logs from "./pages/dashboard/Logs";
import ApiKeys from "./pages/dashboard/ApiKeys";
import Settings from "./pages/dashboard/Settings";
import Skills from "./pages/dashboard/Skills";
import Plugins from "./pages/dashboard/Plugins";
import Documents from "./pages/dashboard/Documents";
import Images from "./pages/dashboard/Images";
import Voices from "./pages/dashboard/Voices";
import DatabasePage from "./pages/dashboard/Database";
import Vault from "./pages/dashboard/Vault";
import Mcp from "./pages/dashboard/Mcp";
import Docs from "./pages/dashboard/Docs";
import Agents from "./pages/dashboard/Agents";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/ws/:handle" element={<WorkspaceHandle />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardHome />} />
              <Route path="agents" element={<Agents />} />
              <Route path="memory" element={<Memory />} />
              <Route path="memory/:memId" element={<MemoryDetail />} />
              <Route path="skills" element={<Skills />} />
              <Route path="plugins" element={<Plugins />} />
              <Route path="documents" element={<Documents />} />
              <Route path="images" element={<Images />} />
              <Route path="voices" element={<Voices />} />
              <Route path="database" element={<DatabasePage />} />
              <Route path="vault" element={<Vault />} />
              <Route path="connectors" element={<Connectors />} />
              <Route path="mcp" element={<Mcp />} />
              <Route path="events" element={<Events />} />
              <Route path="logs" element={<Logs />} />
              <Route path="api-keys" element={<ApiKeys />} />
              <Route path="docs" element={<Docs />} />
              <Route path="docs/:sectionId" element={<Docs />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
