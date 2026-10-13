export function FieldError({
  messages,
  id,
}: {
  messages?: string[];
  id?: string;
}) {
  if (!messages?.length) {
    return id ? <span aria-live="polite" id={id} /> : null;
  }

  return (
    <span aria-live="polite" className="form-error" id={id} role="alert">
      {messages[0]}
    </span>
  );
}
