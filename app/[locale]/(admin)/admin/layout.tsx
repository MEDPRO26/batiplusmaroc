export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[#f4f6f8]">
      <main className="flex min-h-dvh flex-1 flex-col" id="contenu">
        {children}
      </main>
    </div>
  );
}
