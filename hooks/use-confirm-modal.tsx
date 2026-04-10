import { useState } from "react";
import { FeedbackModal } from "../components/ui/feedback-modal";

type ConfirmState = {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: "info" | "error";
  onConfirm?: () => void | Promise<void>;
};

const initialState: ConfirmState = {
  visible: false,
  title: "",
  message: "",
  confirmText: "Confirm",
  cancelText: "Cancel",
  variant: "info",
};

export function useConfirmModal() {
  const [state, setState] = useState<ConfirmState>(initialState);
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setState(initialState);
  };

  const openConfirm = (params: {
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    confirmText?: string;
    cancelText?: string;
    variant?: "info" | "error";
  }) => {
    setState({
      visible: true,
      title: params.title,
      message: params.message,
      confirmText: params.confirmText || "Confirm",
      cancelText: params.cancelText || "Cancel",
      variant: params.variant || "info",
      onConfirm: params.onConfirm,
    });
  };

  const handleConfirm = async () => {
    if (!state.onConfirm || busy) {
      close();
      return;
    }

    setBusy(true);
    try {
      await state.onConfirm();
      setState(initialState);
    } finally {
      setBusy(false);
    }
  };

  const modal = (
    <FeedbackModal
      visible={state.visible}
      title={state.title}
      message={state.message}
      variant={state.variant}
      confirmText={busy ? "Working..." : state.confirmText}
      cancelText={state.cancelText}
      onCancel={close}
      onConfirm={handleConfirm}
    />
  );

  return { openConfirm, modal, close };
}
