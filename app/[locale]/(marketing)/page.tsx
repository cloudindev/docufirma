import { ArrowRight, FileSignature, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { resolveLocale } from "@/lib/i18n/server";

/** Phase 0 placeholder: design-system smoke page. Replaced by the landing in Phase 2. */
export default async function Home({ params }: PageProps<"/[locale]">) {
  await resolveLocale(params);
  return (
    <main className="container-page section-y space-y-10">
      <Logo />
      <PageHeader
        title="DocuFirma"
        description="Design system preview"
        actions={
          <>
            <Button variant="secondary">Secondary</Button>
            <Button>
              Primary <ArrowRight />
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge>Default</Badge>
        <Badge variant="success" dot>
          Signed
        </Badge>
        <Badge variant="warning" dot>
          Pending
        </Badge>
        <Badge variant="danger" dot>
          Declined
        </Badge>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card interactive>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" strokeWidth={1.75} /> Card
            </CardTitle>
            <CardDescription>White, 1px border, soft shadow.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input placeholder="nombre@empresa.es" />
          </CardContent>
        </Card>
        <EmptyState icon={FileSignature} title="Empty state" description="Nothing here yet." />
      </div>
    </main>
  );
}
