"use client";

import {
  AlertTriangle,
  Inbox,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { initials } from "@/lib/format";

export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

export type BadgeTone =
  | "emerald"
  | "amber"
  | "blue"
  | "rose"
  | "violet"
  | "slate"
  | "teal"
  | "indigo";

export type AccentTone = BadgeTone | "sky";

const badgeTones: Record<BadgeTone, string> = {
  emerald:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20",
  slate: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/15",
  teal: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20",
};

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "amber";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500",
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-slate-400",
  ghost:
    "text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400",
  danger:
    "bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:ring-rose-500",
  amber:
    "bg-amber-500 text-white shadow-sm hover:bg-amber-600 focus-visible:ring-amber-400",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-6 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : null}
      {children}
    </button>
  );
}

export function Card({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white shadow-sm",
        className,
      )}
      {...rest}
    />
  );
}

export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({
  className,
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("animate-spin", className)}
      size={size}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-xl bg-slate-200/70", className)}
    />
  );
}

const statTones: Record<AccentTone, { icon: string; dot: string }> = {
  emerald: { icon: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  amber: { icon: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  blue: { icon: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  rose: { icon: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  violet: { icon: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  slate: { icon: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  teal: { icon: "bg-teal-50 text-teal-700", dot: "bg-teal-500" },
  indigo: { icon: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  sky: { icon: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "emerald",
  footer,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: AccentTone;
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {label}
          </p>
          <div className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {value}
          </div>
        </div>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            statTones[tone].icon,
          )}
        >
          <Icon aria-hidden="true" size={22} />
        </span>
      </div>
      {hint ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">{hint}</p>
      ) : null}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

const alertTones = {
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  rose: "border-rose-200 bg-rose-50 text-rose-900",
  blue: "border-blue-200 bg-blue-50 text-blue-900",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

export type AlertTone = keyof typeof alertTones;

export function Alert({
  tone = "amber",
  title,
  icon: Icon,
  className,
  children,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn("rounded-2xl border p-4", alertTones[tone], className)}
    >
      <div className="flex gap-3">
        {Icon ? <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={20} /> : null}
        <div className="min-w-0 text-sm leading-6">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className={title ? "mt-0.5" : undefined}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBanner({
  title = "Terjadi kesalahan",
  message,
  onRetry,
  retryLabel = "Coba lagi",
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <AlertTriangle aria-hidden="true" className="shrink-0" size={20} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-sm leading-6">{message}</p>
        </div>
        {onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            className="bg-white sm:ml-auto"
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
        <Icon aria-hidden="true" size={26} />
      </span>
      <p className="mt-4 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const avatarSizes = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
} as const;

const avatarTones = {
  emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  white: "bg-white/15 text-white ring-white/25",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
} as const;

export function Avatar({
  name,
  size = "md",
  tone = "emerald",
  className,
}: {
  name: string;
  size?: keyof typeof avatarSizes;
  tone?: keyof typeof avatarTones;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl font-bold uppercase ring-1",
        avatarSizes[size],
        avatarTones[tone],
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  size?: "md" | "lg";
}) {
  const large = size === "lg";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        large ? "h-9 w-[68px] p-1" : "h-7 w-12 p-1",
        checked ? "bg-emerald-600" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "inline-block rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform",
          large ? "h-7 w-7" : "h-5 w-5",
          checked
            ? large
              ? "translate-x-[32px]"
              : "translate-x-5"
            : "translate-x-0",
        )}
      />
    </button>
  );
}

const modalSizes = {
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof modalSizes;
}) {
  const titleId = useId();
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRef.current();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "animate-modal-in relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl",
          modalSizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-semibold tracking-tight text-slate-900"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer ? (
          <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
