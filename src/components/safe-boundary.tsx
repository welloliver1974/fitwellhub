import React, { Component, type ReactNode } from "react";

interface SafeBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface SafeBoundaryState {
  hasError: boolean;
}

export class SafeBoundary extends Component<SafeBoundaryProps, SafeBoundaryState> {
  state: SafeBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SafeBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.warn(`[SafeBoundary:${this.props.name || "Widget"}] Erro capturado com segurança:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
