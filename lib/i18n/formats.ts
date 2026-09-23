import type { Formats } from "next-intl";

export const formats = {
  dateTime: {
    short: { day: "2-digit", month: "short", year: "numeric" },
    long: { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" },
  },
  number: {
    eur: { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 },
  },
} satisfies Formats;
