import { useEffect, useRef, useState } from "react";

/** Wait for microphone state to settle before sending; consume each dictation once. */
export function useDictationSubmit(busy: boolean, submit: (text: string) => void | Promise<void>) {
  const [pending, setPending] = useState<{ text: string } | null>(null);
  const consumed = useRef<typeof pending>(null);
  const callback = useRef(submit);
  callback.current = submit;
  useEffect(() => {
    if (busy || !pending || consumed.current === pending) return;
    consumed.current = pending;
    setPending(null);
    void callback.current(pending.text);
  }, [busy, pending]);
  return (text: string) => { if (text.trim()) setPending({ text: text.trim() }); };
}
