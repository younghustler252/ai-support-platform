import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export function Button({
	variant = "primary",
	loading = false,
	disabled,
	children,
	...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; loading?: boolean }) {
	return (
		<button className={`btn btn-${variant}`} disabled={disabled || loading} aria-busy={loading} {...rest}>
			{loading ? <span className="spinner" aria-hidden="true" /> : null}
			{children}
		</button>
	);
}

export function Field({ label, error, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
	const id = useId();
	return (
		<div className="field">
			<label htmlFor={id}>{label}</label>
			<input id={id} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-note` : undefined} {...input} />
			{error || hint ? (
				<p id={`${id}-note`} className={error ? "field-error" : "field-hint"}>
					{error ?? hint}
				</p>
			) : null}
		</div>
	);
}

export function TextArea({ label, error, hint, ...input }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
	const id = useId();
	return (
		<div className="field">
			<label htmlFor={id}>{label}</label>
			<textarea id={id} rows={4} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-note` : undefined} {...input} />
			{error || hint ? (
				<p id={`${id}-note`} className={error ? "field-error" : "field-hint"}>
					{error ?? hint}
				</p>
			) : null}
		</div>
	);
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
	return (
		<div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
			{children}
		</div>
	);
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
	return (
		<section className="card">
			<h1>{title}</h1>
			{subtitle ? <p className="muted">{subtitle}</p> : null}
			{children}
		</section>
	);
}

export function Spinner({ label = "Loading" }: { label?: string }) {
	return (
		<div className="center" role="status">
			<span className="spinner spinner-lg" aria-hidden="true" />
			<span className="sr-only">{label}</span>
		</div>
	);
}
