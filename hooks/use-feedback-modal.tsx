import { useCallback, useState } from "react";
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

  const close = useCallback(
    () => setState((prev) => ({ ...prev, visible: false })),
    [],
  );

  const show = useCallback(
    (variant: FeedbackVariant, title: string, message: string) => {
      setState({ visible: true, variant, title, message });
    },
    [],
  );

  const showInfo = useCallback(
    (title: string, message: string) => show("info", title, message),
    [show],
  );
  const showSuccess = useCallback(
    (title: string, message: string) => show("success", title, message),
    [show],
  );
  const showError = useCallback(
    (title: string, message: string) => show("error", title, message),
    [show],
  );

  const modal = (
    <FeedbackModal
      visible={state.visible}
      title={state.title}
      message={state.message}
      variant={state.variant}
      onConfirm={close}
    />
  );

  return { showInfo, showSuccess, showError, modal, close };
}
