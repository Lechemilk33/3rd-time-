"use client";

import type { ComponentProps } from "react";

/** A submit button for server-action forms that asks first. */
export function ConfirmSubmit({ message, ...props }: Omit<ComponentProps<"button">, "type"> & { message: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
