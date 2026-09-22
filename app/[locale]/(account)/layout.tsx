export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#f7f9fb]">
      <main className="flex flex-1 flex-col" id="contenu">
        {children}
      </main>
    </div>
  );
}
