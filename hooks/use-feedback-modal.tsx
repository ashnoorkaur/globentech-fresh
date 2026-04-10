import { useMemo, useState } from "react";
import { FeedbackModal } from "../components/ui/feedback-modal";

type FeedbackVariant = "info" | "success" | "error";

type FeedbackState = {
  visible: boolean;
  title: string;
  message: string;
  variant: FeedbackVariant;
};

const initialState: FeedbackState = {
  visible: false,
  title: "",
  message: "",
  variant: "info",
};

export function useFeedbackModal() {
  const [state, setState] = useState<FeedbackState>(initialState);

  const close = () => setState((prev) => ({ ...prev, visible: false }));

  const show = (variant: FeedbackVariant, title: string, message: string) => {
    setState({ visible: true, variant, title, message });
  };

  const showInfo = (title: string, message: string) =>
    show("info", title, message);
  const showSuccess = (title: string, message: string) =>
    show("success", title, message);
  const showError = (title: string, message: string) =>
    show("error", title, message);

  const modal = useMemo(
    () => (
      <FeedbackModal
        visible={state.visible}
        title={state.title}
        message={state.message}
        variant={state.variant}
        onConfirm={close}
      />
    ),
    [state],
  );

  return { showInfo, showSuccess, showError, modal, close };
}
