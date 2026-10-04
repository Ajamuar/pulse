import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton } from "@/components/ui/skeleton"

/** Admin: the three cards with their titles; the toggle, form and lists as boxes (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell
      loading
      title="Admin"
      primary={
        <div aria-hidden className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
          <SectionShell variant="card" level={2} title="Sign-up">
            <Skeleton className="h-11 w-full rounded-lg" />
          </SectionShell>
          <SectionShell variant="card" level={2} title="Invites">
            <Skeleton className="h-12 w-full rounded-xl" />
          </SectionShell>
          <SectionShell variant="card" level={2} title="Accounts">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="mt-2 h-14 w-full rounded-xl" />
          </SectionShell>
        </div>
      }
    />
  )
}
