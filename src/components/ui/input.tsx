import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, onWheel, ...props }: React.ComponentProps<"input">) {
  // Prevent wheel events on number inputs
  const handleWheel = React.useCallback((e: React.WheelEvent<HTMLInputElement>) => {
    if (type === "number") {
      e.currentTarget.blur();
    }
    onWheel?.(e);
  }, [type, onWheel]);

  return (
    <input
      type={type}
      data-slot="input"
      onWheel={handleWheel}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
