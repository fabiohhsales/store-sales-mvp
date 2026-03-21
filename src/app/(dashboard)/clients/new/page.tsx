import { Suspense } from 'react'
import { WizardShell } from '@/components/onboarding/wizard-shell'
import { Skeleton } from '@/components/ui/skeleton'

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Novo Cliente</h1>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <WizardShell />
      </Suspense>
    </div>
  )
}
