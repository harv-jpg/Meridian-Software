import { FeedbackProvider } from "./feedback";

// Wraps every dashboard route so toasts and confirmations are available
// throughout, including inside the client drawer and the settings form.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
}
