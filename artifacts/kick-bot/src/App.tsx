import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "@/pages/Dashboard";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchInterval: 3000, staleTime: 1000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Switch>
          <Route path="/" component={Dashboard} />
        </Switch>
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
