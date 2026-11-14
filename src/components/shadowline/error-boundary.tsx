/**
 * ModuleErrorBoundary — one error boundary per module view.
 * A render failure must never take down the whole single-page app.
 */
import { Component, type ReactNode } from "react";
import { CircleX, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  viewLabel: string;
}
interface State {
  error: Error | null;
}

export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    if (typeof console !== "undefined") console.error("[shadowline] view error:", error);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <section
          role="alert"
          className="rounded-lg border border-red-900 bg-red-950/30 p-4 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <CircleX
              className="mt-0.5 size-5 shrink-0 text-red-400"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold tracking-tight text-red-200">
                Module failed to render — {this.props.viewLabel}
              </h2>
              <p className="mt-1 font-mono text-xs break-words text-red-300/90">
                {error.message || "Unknown error"}
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                The rest of the platform is unaffected. Data honesty rules mean
                a module that cannot read its artifact stays broken rather than
                showing substitute values.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={this.reset}
                className="mt-3 h-9 border-red-900 bg-transparent text-red-200 hover:bg-red-950 hover:text-red-100"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reload module
              </Button>
            </div>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
