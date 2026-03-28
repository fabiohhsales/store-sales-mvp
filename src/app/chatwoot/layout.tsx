import '@/app/globals.css'

export default function ChatwootEmbedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      {children}
    </div>
  )
}
