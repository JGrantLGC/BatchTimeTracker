import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="text-6xl font-black tracking-tight text-muted-foreground">404</div>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-muted-foreground max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/">
        <Button>
          <Home className="h-4 w-4 mr-1" />
          Back to Operator screen
        </Button>
      </Link>
    </div>
  );
}
