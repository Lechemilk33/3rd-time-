"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * useActionState for forms that should keep what people typed.
 *
 * Passing an action to `<form action>` makes React clear every field once it finishes — even when
 * the server sent back an error — so one rejected answer wiped a whole intake form. Submitting
 * through onSubmit skips that reset. Spread `onSubmit` onto the form and pass `pending` to
 * SubmitButton (useFormStatus only sees `action` submissions).
 */
export function useFormAction<S>(action: (prev: Awaited<S> | null, formData: FormData) => S | Promise<S>) {
  const [state, dispatch, pending] = useActionState<S | null, FormData>(action, null);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending] as const;
}
