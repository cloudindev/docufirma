"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { deleteContact, saveContact } from "@/app/[locale]/app/(shell)/contacts/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { type ContactInput, contactSchema } from "@/lib/contacts/schemas";
import { useTranslateError } from "@/lib/hooks/use-translate-error";
import { useRouter } from "@/lib/i18n/navigation";
import { initials } from "@/lib/utils";

export type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  last_used_at: string | null;
};

function ContactForm({ contact, onDone }: { contact?: ContactRow; onDone: () => void }) {
  const t = useTranslations("app.contacts");
  const tc = useTranslations("app.common");
  const te = useTranslateError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      firstName: contact?.first_name ?? "",
      lastName: contact?.last_name ?? "",
      email: contact?.email ?? "",
    },
  });
  const errors = form.formState.errors;
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          const res = await saveContact(values, contact?.id);
          if (!res.ok) {
            if (res.error === "duplicate") form.setError("email", { message: t("duplicate") });
            else toast.error(t("error"));
            return;
          }
          toast.success(t("saved"));
          router.refresh();
          onDone();
        }),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="c-first" label={t("firstName")} error={te(errors.firstName?.message)}>
          <Input id="c-first" aria-invalid={!!errors.firstName} {...form.register("firstName")} />
        </FormField>
        <FormField id="c-last" label={t("lastName")} error={te(errors.lastName?.message)}>
          <Input id="c-last" aria-invalid={!!errors.lastName} {...form.register("lastName")} />
        </FormField>
      </div>
      <FormField id="c-email" label={t("email")} error={te(errors.email?.message)}>
        <Input
          id="c-email"
          type="email"
          inputMode="email"
          aria-invalid={!!errors.email}
          {...form.register("email")}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {tc("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {tc("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ContactsManager({ contacts }: { contacts: ContactRow[] }) {
  const t = useTranslations("app.contacts");
  const tc = useTranslations("app.common");
  const format = useFormatter();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ContactRow | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q),
    );
  }, [contacts, query]);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-10 rounded-full pl-10"
          />
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus /> {t("add")}
        </Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> {t("add")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-bg shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("firstName")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("email")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("lastUsed")}</TableHead>
                <TableHead className="w-24 text-right">
                  <span className="sr-only">{tc("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar
                        initials={initials(c.first_name, c.last_name)}
                        className="size-8 text-xs"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {c.first_name} {c.last_name}
                        </p>
                        <p className="truncate text-xs text-ink-muted sm:hidden">{c.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-ink-muted sm:table-cell">{c.email}</TableCell>
                  <TableCell className="hidden text-ink-muted md:table-cell">
                    {c.last_used_at ? format.relativeTime(new Date(c.last_used_at)) : t("never")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${tc("edit")} ${c.first_name}`}
                        onClick={() => setEditing(c)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${tc("delete")} ${c.first_name}`}
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent closeLabel={tc("close")}>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("add") : t("edit")}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <ContactForm
              contact={editing === "new" ? undefined : editing}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle", {
          name: deleting ? `${deleting.first_name} ${deleting.last_name}` : "",
        })}
        description={t("deleteBody")}
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        pending={pending}
        destructive
        onConfirm={() =>
          start(async () => {
            if (!deleting) return;
            const res = await deleteContact(deleting.id);
            if (!res.ok) return void toast.error(t("error"));
            toast.success(t("deleted"));
            setDeleting(null);
            router.refresh();
          })
        }
      />
    </>
  );
}
