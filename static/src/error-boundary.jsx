const ErrorBoundary = class extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        React.createElement("div", {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--ink-3)",
            fontSize: 13,
            gap: 12,
          }
        },
          React.createElement("div", { style: { fontSize: 24 } }, "⚠"),
          React.createElement("div", null, "Something went wrong loading this view."),
          React.createElement("button", {
            onClick: () => this.setState({ hasError: false, error: null }),
            style: {
              padding: "8px 16px",
              background: "var(--accent)",
              color: "var(--on-accent)",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "inherit",
            }
          }, "Retry"),
        )
      );
    }
    return this.props.children;
  }
};
window.ErrorBoundary = ErrorBoundary;
