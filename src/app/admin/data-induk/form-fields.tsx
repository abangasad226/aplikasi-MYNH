"use client";

import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/components/ui";

export const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-500";

const labelClass = "text-xs font-semibold text-slate-600";

export function Field({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p className="mt-1 text-[11px] leading-5 text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputClass, className)} {...rest} />;
});

export function SelectInput({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function TextAreaInput({
  className,
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100",
        className,
      )}
      {...rest}
    />
  );
}

export function FormSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            {Icon}
          </span>
        ) : null}
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function StepTabs<T extends string>({
  steps,
  active,
  onChange,
}: {
  steps: Array<{ key: T; label: string; icon?: ReactNode }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Langkah pengisian formulir"
      className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1"
    >
      {steps.map((step, index) => {
        const selected = step.key === active;

        return (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(step.key)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-semibold transition sm:text-xs",
              selected
                ? "bg-white text-emerald-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                selected
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-500",
              )}
            >
              {index + 1}
            </span>
            <span className="truncate">{step.label}</span>
          </button>
        );
      })}
    </div>
  );
}
