export const parseBackendDate = (value?: string | null): Date | null => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const sqlMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (sqlMatch) {
    const [, year, month, day, hours = "0", minutes = "0", seconds = "0"] = sqlMatch;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    );

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const isoCandidate = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed;
  const parsed = new Date(isoCandidate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
};

export const formatBackendDateTime = (
  value?: string | null,
  fallback = "N/A",
) => {
  if (!value) return fallback;
  const parsed = parseBackendDate(value);
  if (!parsed) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(parsed)
    .replace(/,/g, "");
};

export const formatBackendDateOnly = (
  value?: string | null,
  fallback = "-",
) => {
  if (!value) return fallback;
  const parsed = parseBackendDate(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString();
};

export const formatBackendTimeOnly = (
  value?: string | null,
  fallback = "-",
) => {
  if (!value) return fallback;
  const parsed = parseBackendDate(value);
  if (!parsed) return value;
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const backendDateTimeValue = (value?: string | null) => {
  return parseBackendDate(value)?.getTime() ?? 0;
};

export const formatBackendTimestamp = (value?: string | number | Date | null) => {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value)
        : parseBackendDate(value);

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
};
