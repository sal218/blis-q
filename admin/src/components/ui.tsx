// Blis-Q admin design system — reusable UI primitives. All visual styling
// lives in styles/global.css (.bq-* classes); these components own structure,
// behaviour, and accessibility. Pages compose these — never raw styled markup.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Icon, type IconName } from "./Icon";

/* ---------------- Button ---------------- */

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "dangerOutline"
  | "link";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  icon?: IconName;
  loading?: boolean;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bq-btn-primary",
  secondary: "bq-btn-secondary",
  ghost: "bq-btn-ghost",
  danger: "bq-btn-danger",
  dangerOutline: "bq-btn-danger-outline",
  link: "bq-btn-link",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  disabled,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "bq-btn",
    VARIANT_CLASS[variant],
    size === "sm" ? "bq-btn-sm" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Icon
          name="spinner"
          size={size === "sm" ? 13 : 15}
          className="bq-spin"
        />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 13 : 15} />
      ) : null}
      {children}
    </button>
  );
}

/* ---------------- Form fields ---------------- */

type FieldProps = {
  label: string;
  help?: string;
  children: ReactNode;
};

export function Field({ label, help, children }: FieldProps) {
  return (
    <label className="bq-field">
      <span className="bq-label">{label}</span>
      {children}
      {help ? <span className="bq-help">{help}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={`bq-input ${className ?? ""}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={`bq-textarea ${className ?? ""}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return <select className={`bq-select ${className ?? ""}`} {...rest} />;
}

/** Text input with a leading magnifier icon. Wrap in a <form> for submit. */
export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="bq-search">
      <Icon name="magnifyingGlass" size={15} />
      <Input type="search" {...props} />
    </span>
  );
}

/* ---------------- Badge ---------------- */

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

export function Badge({
  tone,
  dot = false,
  children,
}: {
  tone: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`bq-badge bq-badge-${tone}`}>
      {dot ? <span className="bq-badge-dot" /> : null}
      {children}
    </span>
  );
}

/* ---------------- Segmented filter ---------------- */

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel: string;
}) {
  return (
    <div className="bq-segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`bq-segment${o.value === value ? " active" : ""}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Page scaffolding ---------------- */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="bq-page-header">
      <div>
        <h1 className="bq-page-title">{title}</h1>
        {description ? <p className="bq-page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="bq-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  subtitle,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bq-card bq-card-pad ${className ?? ""}`}>
      {title ? <h2 className="bq-card-title">{title}</h2> : null}
      {subtitle ? <p className="bq-card-sub">{subtitle}</p> : null}
      {children}
    </section>
  );
}

/* ---------------- Alerts ---------------- */

export function Alert({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const icon: IconName =
    tone === "error" ? "warning" : tone === "success" ? "check" : "info";
  return (
    <div className={`bq-alert bq-alert-${tone}`} role="alert">
      <Icon name={icon} size={15} />
      <span>{children}</span>
    </div>
  );
}

/* ---------------- Empty state ---------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="bq-empty">
      <span className="bq-empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="bq-empty-title">{title}</p>
      {description ? <p className="bq-empty-desc">{description}</p> : null}
      {action ? <div className="bq-empty-action">{action}</div> : null}
    </div>
  );
}

/* ---------------- Skeletons ---------------- */

export function Skeleton({
  width,
  height = 14,
  style,
}: {
  width: number | string;
  height?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="bq-skeleton"
      style={{ display: "inline-block", width, height, ...style }}
      aria-hidden
    />
  );
}

/* ---------------- Pagination ---------------- */

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  disabled = false,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="bq-pager" aria-label="Paginacja">
      <span className="bq-pager-info">
        Strona {page} z {totalPages}
        {typeof total === "number" ? ` · ${total} wyników` : ""}
      </span>
      <div className="bq-toolbar-group">
        <Button
          size="sm"
          icon="caretLeft"
          disabled={disabled || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Poprzednia
        </Button>
        <Button
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Następna
          <Icon name="caretRight" size={13} />
        </Button>
      </div>
    </nav>
  );
}

/* ---------------- Drawer ---------------- */

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="bq-drawer-overlay" onClick={onClose} aria-hidden />
      <aside
        className="bq-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="bq-drawer-header">
          <div>
            <h2 className="bq-drawer-title">{title}</h2>
            {subtitle ? <p className="bq-drawer-sub">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="bq-drawer-close"
            onClick={onClose}
            aria-label="Zamknij"
          >
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="bq-drawer-body">{children}</div>
        {footer ? <footer className="bq-drawer-footer">{footer}</footer> : null}
      </aside>
    </>
  );
}

/* ---------------- Confirm dialog (replaces window.confirm) ---------------- */

type ConfirmOptions = {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <div className="bq-overlay" onClick={() => settle(false)}>
          <div
            className="bq-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={options.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`bq-dialog-icon ${options.danger ? "danger" : "brand"}`}
            >
              <Icon name={options.danger ? "warning" : "info"} size={20} />
            </div>
            <h2 className="bq-dialog-title">{options.title}</h2>
            <p className="bq-dialog-body">{options.body}</p>
            <div className="bq-dialog-actions">
              <Button onClick={() => settle(false)} autoFocus>
                {options.cancelLabel ?? "Anuluj"}
              </Button>
              <Button
                variant={options.danger ? "danger" : "primary"}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? "Potwierdź"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
